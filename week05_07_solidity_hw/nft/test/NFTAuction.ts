import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

/** ERC-1967 admin slot */
const ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";

async function getProxyAdmin(proxyAddress: string) {
  const raw = await ethers.provider.getStorage(proxyAddress, ADMIN_SLOT);
  return ethers.getAddress(`0x${raw.slice(-40)}`);
}

async function deployUUPSAuction(owner: { address: string }) {
  const impl = await ethers.deployContract("NFTAuctionUUPS");
  const initData = impl.interface.encodeFunctionData("initialize", [owner.address]);
  const proxy = await ethers.deployContract("ERC1967Proxy", [await impl.getAddress(), initData]);
  const auction = await ethers.getContractAt("NFTAuctionUUPS", await proxy.getAddress());
  return { impl, proxy, auction };
}

async function deployTransparentAuction(owner: { address: string }) {
  const impl = await ethers.deployContract("NFTAuctionBase");
  const initData = impl.interface.encodeFunctionData("initialize", [owner.address]);
  const proxy = await ethers.deployContract("TransparentUpgradeableProxy", [
    await impl.getAddress(),
    owner.address,
    initData,
  ]);
  const auction = await ethers.getContractAt("NFTAuctionBase", await proxy.getAddress());
  const proxyAdmin = await ethers.getContractAt("ProxyAdmin", await getProxyAdmin(await proxy.getAddress()));
  return { impl, proxy, auction, proxyAdmin };
}

async function deployShared(owner: Awaited<ReturnType<typeof ethers.getSigners>>[0]) {
  const nft = await ethers.deployContract("SimpleNFT");
  const token = await ethers.deployContract("MockERC20");
  const ethUsdFeed = await ethers.deployContract("MockChainlink", [8, 2000n * 10n ** 8n]);
  const tokenUsdFeed = await ethers.deployContract("MockChainlink", [8, 1n * 10n ** 8n]);
  return { nft, token, ethUsdFeed, tokenUsdFeed };
}

async function wireFeeds(
  auction: any,
  owner: { address: string },
  ethUsdFeed: { getAddress: () => Promise<string> },
  token: { getAddress: () => Promise<string> },
  tokenUsdFeed: { getAddress: () => Promise<string> },
) {
  await auction.connect(owner).setPriceFeed(ethers.ZeroAddress, await ethUsdFeed.getAddress());
  await auction.connect(owner).setPriceFeed(await token.getAddress(), await tokenUsdFeed.getAddress());
}

describe("Integration: UUPS proxy", function () {
  async function fixture() {
    const [owner, seller, bidder1, bidder2] = await ethers.getSigners();
    const shared = await deployShared(owner);
    const { auction, proxy } = await deployUUPSAuction(owner);
    await wireFeeds(auction, owner, shared.ethUsdFeed, shared.token, shared.tokenUsdFeed);
    await shared.nft.connect(seller).mint(seller.address);
    return { owner, seller, bidder1, bidder2, auction, proxy, ...shared };
  }

  it("mints and transfers NFT", async function () {
    const { nft, seller, bidder1 } = await networkHelpers.loadFixture(fixture);
    expect(await nft.ownerOf(0n)).to.equal(seller.address);
    await nft.connect(seller).transferFrom(seller.address, bidder1.address, 0n);
    expect(await nft.ownerOf(0n)).to.equal(bidder1.address);
  });

  it("converts amounts to USD and reacts to feed updates", async function () {
    const { token, auction, ethUsdFeed } = await networkHelpers.loadFixture(fixture);

    expect(await auction.getAmountInUSD(ethers.ZeroAddress, ethers.parseEther("1"))).to.equal(
      2000n * 10n ** 8n,
    );
    expect(await auction.getAmountInUSD(await token.getAddress(), ethers.parseEther("100"))).to.equal(
      100n * 10n ** 8n,
    );

    await ethUsdFeed.updateAnswer(3000n * 10n ** 8n);
    expect(await auction.getAmountInUSD(ethers.ZeroAddress, ethers.parseEther("1"))).to.equal(
      3000n * 10n ** 8n,
    );
  });

  it("ETH auction: events, refund, settle to winner", async function () {
    const { nft, auction, seller, bidder1, bidder2 } = await networkHelpers.loadFixture(fixture);
    const auctionAddr = await auction.getAddress();
    const nftAddr = await nft.getAddress();

    await nft.connect(seller).approve(auctionAddr, 0n);

    const before = await networkHelpers.time.latest();
    await expect(
      auction
        .connect(seller)
        .createAuction(nftAddr, 0n, ethers.ZeroAddress, ethers.parseEther("1"), 3600n),
    ).to.emit(auction, "AuctionCreated");

    const [, , , , , , endTime] = await auction.auctions(0n);
    expect(endTime).to.be.gte(BigInt(before + 3600));

    await expect(auction.connect(bidder1).bid(0n, 0n, { value: ethers.parseEther("1") }))
      .to.emit(auction, "BidPlaced")
      .withArgs(0n, bidder1.address, ethers.parseEther("1"), 2000n * 10n ** 8n);

    await expect(auction.connect(bidder2).bid(0n, 0n, { value: ethers.parseEther("2") }))
      .to.emit(auction, "BidPlaced")
      .withArgs(0n, bidder2.address, ethers.parseEther("2"), 4000n * 10n ** 8n);

    expect(await auction.getHighestBidInUSD(0n)).to.equal(4000n * 10n ** 8n);

    await networkHelpers.time.increase(3600);

    const sellerBefore = await ethers.provider.getBalance(seller.address);
    await expect(auction.connect(bidder1).endAuction(0n))
      .to.emit(auction, "AuctionSettled")
      .withArgs(0n, bidder2.address, seller.address, ethers.parseEther("2"), 4000n * 10n ** 8n);

    expect(await nft.ownerOf(0n)).to.equal(bidder2.address);
    expect((await ethers.provider.getBalance(seller.address)) - sellerBefore).to.equal(
      ethers.parseEther("2"),
    );
  });

  it("ERC20 auction: outbid refund and settle", async function () {
    const { nft, token, auction, seller, bidder1, bidder2 } =
      await networkHelpers.loadFixture(fixture);

    await token.mint(bidder1.address, ethers.parseEther("1000"));
    await token.mint(bidder2.address, ethers.parseEther("1000"));

    await nft.connect(seller).approve(await auction.getAddress(), 0n);
    await auction
      .connect(seller)
      .createAuction(
        await nft.getAddress(),
        0n,
        await token.getAddress(),
        ethers.parseEther("100"),
        3600n,
      );

    await token.connect(bidder1).approve(await auction.getAddress(), ethers.parseEther("100"));
    await auction.connect(bidder1).bid(0n, ethers.parseEther("100"));

    await token.connect(bidder2).approve(await auction.getAddress(), ethers.parseEther("200"));
    await auction.connect(bidder2).bid(0n, ethers.parseEther("200"));

    expect(await token.balanceOf(bidder1.address)).to.equal(ethers.parseEther("1000"));

    await networkHelpers.time.increase(3600);
    await auction.endAuction(0n);

    expect(await nft.ownerOf(0n)).to.equal(bidder2.address);
    expect(await token.balanceOf(seller.address)).to.equal(ethers.parseEther("200"));
  });

  it("returns NFT when no bids", async function () {
    const { nft, auction, seller } = await networkHelpers.loadFixture(fixture);

    await nft.connect(seller).approve(await auction.getAddress(), 0n);
    await auction
      .connect(seller)
      .createAuction(await nft.getAddress(), 0n, ethers.ZeroAddress, 0n, 60n);

    await networkHelpers.time.increase(60);
    await auction.endAuction(0n);
    expect(await nft.ownerOf(0n)).to.equal(seller.address);
  });

  it("supports multiple sequential auctions", async function () {
    const { nft, auction, seller, bidder1 } = await networkHelpers.loadFixture(fixture);

    await nft.connect(seller).mint(seller.address); // tokenId 1
    await nft.connect(seller).approve(await auction.getAddress(), 0n);
    await nft.connect(seller).approve(await auction.getAddress(), 1n);

    await auction
      .connect(seller)
      .createAuction(await nft.getAddress(), 0n, ethers.ZeroAddress, 0n, 60n);
    await auction
      .connect(seller)
      .createAuction(await nft.getAddress(), 1n, ethers.ZeroAddress, 0n, 120n);

    expect(await auction.nextAuctionId()).to.equal(2n);

    await auction.connect(bidder1).bid(0n, 0n, { value: ethers.parseEther("1") });
    await auction.connect(bidder1).bid(1n, 0n, { value: ethers.parseEther("3") });

    await networkHelpers.time.increase(120);
    await auction.endAuction(0n);
    await auction.endAuction(1n);

    expect(await nft.ownerOf(0n)).to.equal(bidder1.address);
    expect(await nft.ownerOf(1n)).to.equal(bidder1.address);
  });

  it("rejects non-owner setPriceFeed", async function () {
    const { auction, seller, ethUsdFeed } = await networkHelpers.loadFixture(fixture);
    await expect(
      auction.connect(seller).setPriceFeed(ethers.ZeroAddress, await ethUsdFeed.getAddress()),
    ).to.revert(ethers);
  });
});

describe("Integration: Transparent proxy", function () {
  async function fixture() {
    const [owner, seller, bidder1, bidder2] = await ethers.getSigners();
    const shared = await deployShared(owner);
    const { auction, proxy, proxyAdmin } = await deployTransparentAuction(owner);
    await wireFeeds(auction, owner, shared.ethUsdFeed, shared.token, shared.tokenUsdFeed);
    await shared.nft.connect(seller).mint(seller.address);
    return { owner, seller, bidder1, bidder2, auction, proxy, proxyAdmin, ...shared };
  }

  it("ETH auction full flow through Transparent proxy", async function () {
    const { nft, auction, seller, bidder1, bidder2 } = await networkHelpers.loadFixture(fixture);

    await nft.connect(seller).approve(await auction.getAddress(), 0n);
    await auction
      .connect(seller)
      .createAuction(await nft.getAddress(), 0n, ethers.ZeroAddress, ethers.parseEther("1"), 3600n);

    await auction.connect(bidder1).bid(0n, 0n, { value: ethers.parseEther("1") });
    await auction.connect(bidder2).bid(0n, 0n, { value: ethers.parseEther("2") });

    await networkHelpers.time.increase(3600);
    const sellerBefore = await ethers.provider.getBalance(seller.address);
    await auction.connect(bidder1).endAuction(0n);

    expect(await nft.ownerOf(0n)).to.equal(bidder2.address);
    expect((await ethers.provider.getBalance(seller.address)) - sellerBefore).to.equal(
      ethers.parseEther("2"),
    );
  });

  it("ERC20 auction full flow through Transparent proxy", async function () {
    const { nft, token, auction, seller, bidder1, bidder2 } =
      await networkHelpers.loadFixture(fixture);

    await token.mint(bidder1.address, ethers.parseEther("500"));
    await token.mint(bidder2.address, ethers.parseEther("500"));

    await nft.connect(seller).approve(await auction.getAddress(), 0n);
    await auction
      .connect(seller)
      .createAuction(
        await nft.getAddress(),
        0n,
        await token.getAddress(),
        ethers.parseEther("50"),
        600n,
      );

    await token.connect(bidder1).approve(await auction.getAddress(), ethers.parseEther("50"));
    await auction.connect(bidder1).bid(0n, ethers.parseEther("50"));

    await token.connect(bidder2).approve(await auction.getAddress(), ethers.parseEther("80"));
    await auction.connect(bidder2).bid(0n, ethers.parseEther("80"));

    await networkHelpers.time.increase(600);
    await auction.endAuction(0n);

    expect(await nft.ownerOf(0n)).to.equal(bidder2.address);
    expect(await token.balanceOf(seller.address)).to.equal(ethers.parseEther("80"));
    expect(await token.balanceOf(bidder1.address)).to.equal(ethers.parseEther("500"));
  });
});

describe("Integration: upgrades", function () {
  async function upgradeFixture() {
    const [owner, seller, bidder1, stranger] = await ethers.getSigners();
    const nft = await ethers.deployContract("SimpleNFT");
    const ethUsdFeed = await ethers.deployContract("MockChainlink", [8, 2000n * 10n ** 8n]);
    await nft.connect(seller).mint(seller.address);
    return { owner, seller, bidder1, stranger, nft, ethUsdFeed };
  }

  it("UUPS: only owner upgrades; state preserved; can settle after upgrade", async function () {
    const { owner, seller, bidder1, stranger, nft, ethUsdFeed } =
      await networkHelpers.loadFixture(upgradeFixture);

    const { auction } = await deployUUPSAuction(owner);
    await auction.connect(owner).setPriceFeed(ethers.ZeroAddress, await ethUsdFeed.getAddress());

    await nft.connect(seller).approve(await auction.getAddress(), 0n);
    await auction
      .connect(seller)
      .createAuction(await nft.getAddress(), 0n, ethers.ZeroAddress, ethers.parseEther("1"), 3600n);
    await auction.connect(bidder1).bid(0n, 0n, { value: ethers.parseEther("1.5") });

    const implV2 = await ethers.deployContract("NFTAuctionUUPSV2");
    await expect(
      auction.connect(stranger).upgradeToAndCall(await implV2.getAddress(), "0x"),
    ).to.revert(ethers);
    await auction.connect(owner).upgradeToAndCall(await implV2.getAddress(), "0x");

    const auctionV2 = await ethers.getContractAt("NFTAuctionUUPSV2", await auction.getAddress());
    expect(await auctionV2.version()).to.equal("2.0.0");
    expect(await auctionV2.nextAuctionId()).to.equal(1n);
    expect(await auctionV2.getHighestBidInUSD(0n)).to.equal(3000n * 10n ** 8n);

    await networkHelpers.time.increase(3600);
    await auctionV2.endAuction(0n);
    expect(await nft.ownerOf(0n)).to.equal(bidder1.address);
  });

  it("Transparent: only ProxyAdmin owner upgrades; state preserved; can settle after upgrade", async function () {
    const { owner, seller, bidder1, stranger, nft, ethUsdFeed } =
      await networkHelpers.loadFixture(upgradeFixture);

    const { auction, proxy, proxyAdmin } = await deployTransparentAuction(owner);
    await auction.connect(owner).setPriceFeed(ethers.ZeroAddress, await ethUsdFeed.getAddress());

    await nft.connect(seller).approve(await auction.getAddress(), 0n);
    await auction
      .connect(seller)
      .createAuction(await nft.getAddress(), 0n, ethers.ZeroAddress, ethers.parseEther("1"), 3600n);
    await auction.connect(bidder1).bid(0n, 0n, { value: ethers.parseEther("1.5") });

    const implV2 = await ethers.deployContract("NFTAuctionBaseV2");
    await expect(
      proxyAdmin.connect(stranger).upgradeAndCall(await proxy.getAddress(), await implV2.getAddress(), "0x"),
    ).to.revert(ethers);

    await proxyAdmin
      .connect(owner)
      .upgradeAndCall(await proxy.getAddress(), await implV2.getAddress(), "0x");

    const auctionV2 = await ethers.getContractAt("NFTAuctionBaseV2", await auction.getAddress());
    expect(await auctionV2.version()).to.equal("2.0.0");
    expect(await auctionV2.nextAuctionId()).to.equal(1n);
    expect(await auctionV2.getHighestBidInUSD(0n)).to.equal(3000n * 10n ** 8n);

    await networkHelpers.time.increase(3600);
    await auctionV2.endAuction(0n);
    expect(await nft.ownerOf(0n)).to.equal(bidder1.address);
  });
});
