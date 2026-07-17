/**
 * 在已部署的 Sepolia 合约上演示 ETH 拍卖全流程
 *
 * 用法（需已 export SEPOLIA_RPC_URL / SEPOLIA_PRIVATE_KEY）：
 *   npx hardhat run scripts/demo-auction.ts --network sepolia
 *
 * 可选环境变量：
 *   AUCTION_DURATION=120          # 拍卖持续秒数，默认 120
 *   BID1=0.001                    # 第一次出价（ETH）
 *   BID2=0.002                    # 第二次出价（ETH），需更高
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { network } from "hardhat";

const STEP_DELAY_MS = 3000;
const MAX_RETRIES = 5;

const { ethers } = await network.getOrCreate();
const [signer] = await ethers.getSigners();
const net = await ethers.provider.getNetwork();

const deploymentPath = path.join(process.cwd(), "deployments", "sepolia.json");
const deployment = JSON.parse(await readFile(deploymentPath, "utf8"));

const nftAddr = deployment.contracts.SimpleNFT as string;
const auctionAddr = deployment.auctions[0].proxy as string;
const duration = BigInt(process.env.AUCTION_DURATION ?? "120");
const bid1 = ethers.parseEther(process.env.BID1 ?? "0.001");
const bid2 = ethers.parseEther(process.env.BID2 ?? "0.002");

console.log("=== Sepolia ETH Auction Demo ===");
console.log("chainId :", net.chainId.toString());
console.log("signer  :", signer.address);
console.log("nft     :", nftAddr);
console.log("auction :", auctionAddr);

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= MAX_RETRIES; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const wait = STEP_DELAY_MS * i;
      console.warn(`  ! ${label} failed (try ${i}/${MAX_RETRIES}), wait ${wait}ms`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

async function send(label: string, fn: () => Promise<{ wait: () => Promise<unknown> }>) {
  console.log(`\n→ ${label}`);
  await sleep(STEP_DELAY_MS);
  const tx = await withRetry(label, fn);
  const receipt = await withRetry(`${label} wait`, () => tx.wait());
  console.log("  tx:", (receipt as { hash?: string })?.hash ?? "ok");
}

const nft = await ethers.getContractAt("SimpleNFT", nftAddr);
const auction = await ethers.getContractAt("NFTAuctionUUPS", auctionAddr);

// 1) mint
let tokenId: bigint;
{
  console.log("\n→ mint NFT");
  await sleep(STEP_DELAY_MS);
  const tx = await withRetry("mint", () => nft.mint(signer.address));
  const receipt = await withRetry("mint wait", () => tx.wait()) as unknown as {
    hash: string;
    logs: Array<{ topics: string[]; address: string }>;
  };
  // Transfer(address,address,uint256) topic0
  const transferTopic = ethers.id("Transfer(address,address,uint256)");
  const log = receipt.logs.find((l) => l.topics[0] === transferTopic);
  tokenId = log ? BigInt(log.topics[3]) : 0n;
  console.log("  tokenId:", tokenId.toString(), "tx:", receipt.hash);
}

// 2) approve auction
await send("approve auction", () => nft.approve(auctionAddr, tokenId));

// 3) create auction (ETH)
await send("createAuction", () =>
  auction.createAuction(nftAddr, tokenId, ethers.ZeroAddress, bid1, duration),
);
const auctionId = (await auction.nextAuctionId()) - 1n;
console.log("  auctionId:", auctionId.toString());

const usd1 = await auction.getAmountInUSD(ethers.ZeroAddress, bid1);
console.log("  bid1 USD (8 decimals):", usd1.toString());

// 4) first bid
await send(`bid ${ethers.formatEther(bid1)} ETH`, () =>
  auction.bid(auctionId, 0n, { value: bid1 }),
);

// 5) higher bid (same account outbids itself for demo)
await send(`bid ${ethers.formatEther(bid2)} ETH`, () =>
  auction.bid(auctionId, 0n, { value: bid2 }),
);
console.log("  highestBid USD:", (await auction.getHighestBidInUSD(auctionId)).toString());

// 6) wait until ended
console.log(`\n→ wait ${duration.toString()}s for auction to end...`);
await sleep(Number(duration) * 1000 + 5000);

// 7) settle
await send("endAuction", () => auction.endAuction(auctionId));

const owner = await nft.ownerOf(tokenId);
const [, , , , highestBid, highestBidder, , settled] = await auction.auctions(auctionId);
console.log("\n=== Result ===");
console.log("NFT owner     :", owner);
console.log("highestBidder :", highestBidder);
console.log("highestBid    :", ethers.formatEther(highestBid), "ETH");
console.log("settled       :", settled);
console.log("Etherscan auction:", `https://sepolia.etherscan.io/address/${auctionAddr}`);
console.log("Done.");
