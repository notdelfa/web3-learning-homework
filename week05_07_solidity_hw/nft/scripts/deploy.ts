/**
 * 部署 NFT 拍卖到当前网络（默认 UUPS；可用 DEPLOY_MODE 切换）
 *
 * 用法：
 *   npx hardhat run scripts/deploy.ts --network sepolia --build-profile production
 *
 * 若中途 RPC 失败，可复用已部署地址续跑（避免重复花 gas）：
 *   export EXISTING_NFT=0x...
 *   export EXISTING_MOCK_TOKEN=0x...
 *   export EXISTING_TOKEN_USD_FEED=0x...
 *   npx hardhat run scripts/deploy.ts --network sepolia --build-profile production
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { network } from "hardhat";

/** Sepolia 官方 Chainlink ETH/USD Data Feed */
const SEPOLIA_ETH_USD_FEED = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
const ETH = "0x0000000000000000000000000000000000000000";
const STEP_DELAY_MS = 4000;
const MAX_RETRIES = 6;

const mode = (process.env.DEPLOY_MODE ?? "uups").toLowerCase();

const { ethers } = await network.getOrCreate();
const [deployer] = await ethers.getSigners();
const net = await ethers.provider.getNetwork();
const chainId = net.chainId;
const isSepolia = chainId === 11155111n;

console.log("=== NFT Auction Deploy ===");
console.log("chainId :", chainId.toString());
console.log("deployer:", deployer.address);
console.log("balance :", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
console.log("mode    :", mode);

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= MAX_RETRIES; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const wait = STEP_DELAY_MS * i;
      console.warn(`  ! ${label} failed (try ${i}/${MAX_RETRIES}), wait ${wait}ms...`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

async function pause(label: string) {
  console.log(`  ... pause ${STEP_DELAY_MS}ms before ${label}`);
  await sleep(STEP_DELAY_MS);
}

async function deployOrAttach(name: string, existingEnv: string, args: unknown[] = []) {
  const existing = process.env[existingEnv];
  if (existing) {
    console.log(`${name.padEnd(18)}: ${existing} (reuse)`);
    return ethers.getContractAt(name, existing);
  }
  await pause(`deploy ${name}`);
  const c = await withRetry(`deploy ${name}`, async () => {
    const deployed = await ethers.deployContract(name, args);
    await deployed.waitForDeployment();
    return deployed;
  });
  console.log(`${name.padEnd(18)}: ${await c.getAddress()}`);
  return c;
}

const nft = await deployOrAttach("SimpleNFT", "EXISTING_NFT");
const mockToken = await deployOrAttach("MockERC20", "EXISTING_MOCK_TOKEN");

let ethUsdFeedAddress: string;
if (isSepolia) {
  ethUsdFeedAddress = SEPOLIA_ETH_USD_FEED;
  console.log("ETH/USD feed       :", ethUsdFeedAddress, "(Chainlink Sepolia)");
} else {
  const ethUsdFeed = await deployOrAttach("MockChainlink", "EXISTING_ETH_USD_FEED", [
    8,
    2000n * 10n ** 8n,
  ]);
  ethUsdFeedAddress = await ethUsdFeed.getAddress();
}

const tokenUsdFeed = await deployOrAttach("MockChainlink", "EXISTING_TOKEN_USD_FEED", [
  8,
  1n * 10n ** 8n,
]);
console.log("MOCK/USD feed      :", await tokenUsdFeed.getAddress(), "(MockChainlink)");

type DeployedAuction = {
  kind: "uups" | "transparent";
  impl: string;
  proxy: string;
  auction: string;
};

async function deployUUPS(): Promise<DeployedAuction> {
  await pause("deploy NFTAuctionUUPS");
  const impl = await withRetry("deploy NFTAuctionUUPS", async () => {
    const c = await ethers.deployContract("NFTAuctionUUPS");
    await c.waitForDeployment();
    return c;
  });

  const initData = impl.interface.encodeFunctionData("initialize", [deployer.address]);
  await pause("deploy ERC1967Proxy");
  const proxy = await withRetry("deploy ERC1967Proxy", async () => {
    const c = await ethers.deployContract("ERC1967Proxy", [await impl.getAddress(), initData]);
    await c.waitForDeployment();
    return c;
  });

  const auction = await ethers.getContractAt("NFTAuctionUUPS", await proxy.getAddress());
  await pause("setPriceFeed ETH");
  await withRetry("setPriceFeed ETH", async () => {
    const tx = await auction.setPriceFeed(ETH, ethUsdFeedAddress);
    await tx.wait();
  });
  await pause("setPriceFeed MOCK");
  await withRetry("setPriceFeed MOCK", async () => {
    const tx = await auction.setPriceFeed(await mockToken.getAddress(), await tokenUsdFeed.getAddress());
    await tx.wait();
  });

  console.log("\n[UUPS]");
  console.log("  impl   :", await impl.getAddress());
  console.log("  proxy  :", await proxy.getAddress(), "← 用户交互地址");
  return {
    kind: "uups",
    impl: await impl.getAddress(),
    proxy: await proxy.getAddress(),
    auction: await auction.getAddress(),
  };
}

async function deployTransparent(): Promise<DeployedAuction> {
  await pause("deploy NFTAuctionBase");
  const impl = await withRetry("deploy NFTAuctionBase", async () => {
    const c = await ethers.deployContract("NFTAuctionBase");
    await c.waitForDeployment();
    return c;
  });

  const initData = impl.interface.encodeFunctionData("initialize", [deployer.address]);
  await pause("deploy TransparentUpgradeableProxy");
  const proxy = await withRetry("deploy TransparentUpgradeableProxy", async () => {
    const c = await ethers.deployContract("TransparentUpgradeableProxy", [
      await impl.getAddress(),
      deployer.address,
      initData,
    ]);
    await c.waitForDeployment();
    return c;
  });

  const auction = await ethers.getContractAt("NFTAuctionBase", await proxy.getAddress());
  await pause("setPriceFeed ETH");
  await withRetry("setPriceFeed ETH", async () => {
    const tx = await auction.setPriceFeed(ETH, ethUsdFeedAddress);
    await tx.wait();
  });
  await pause("setPriceFeed MOCK");
  await withRetry("setPriceFeed MOCK", async () => {
    const tx = await auction.setPriceFeed(await mockToken.getAddress(), await tokenUsdFeed.getAddress());
    await tx.wait();
  });

  console.log("\n[Transparent]");
  console.log("  impl   :", await impl.getAddress());
  console.log("  proxy  :", await proxy.getAddress(), "← 用户交互地址");
  return {
    kind: "transparent",
    impl: await impl.getAddress(),
    proxy: await proxy.getAddress(),
    auction: await auction.getAddress(),
  };
}

const auctions: DeployedAuction[] = [];
if (mode === "transparent") {
  auctions.push(await deployTransparent());
} else if (mode === "both") {
  auctions.push(await deployUUPS());
  auctions.push(await deployTransparent());
} else {
  auctions.push(await deployUUPS());
}

const out = {
  network: {
    chainId: chainId.toString(),
    name: isSepolia ? "sepolia" : net.name,
  },
  deployer: deployer.address,
  contracts: {
    SimpleNFT: await nft.getAddress(),
    MockERC20: await mockToken.getAddress(),
    ethUsdFeed: ethUsdFeedAddress,
    tokenUsdFeed: await tokenUsdFeed.getAddress(),
  },
  auctions,
  deployedAt: new Date().toISOString(),
};

const dir = path.join(process.cwd(), "deployments");
await mkdir(dir, { recursive: true });
const file = path.join(dir, `${isSepolia ? "sepolia" : chainId.toString()}.json`);
await writeFile(file, JSON.stringify(out, null, 2) + "\n");
console.log("\nSaved:", file);
console.log("Done.");
