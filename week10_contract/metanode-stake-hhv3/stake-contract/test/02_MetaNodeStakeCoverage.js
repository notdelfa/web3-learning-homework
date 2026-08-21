import hre from "hardhat";
import { upgrades } from "@openzeppelin/hardhat-upgrades";
import { expect } from "chai";

describe("stake coverage", function () {
  let ethers;
  let networkHelpers;
  let upgradesApi;
  let admin, user1;
  let token, stake;
  const lockBlocks = 10;
  const zeroAddress = "0x0000000000000000000000000000000000000000";

  before(async function () {
    const connection = await hre.network.create();
    ethers = connection.ethers;
    networkHelpers = connection.networkHelpers;
    upgradesApi = await upgrades(hre, connection);
    [admin, user1] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MetaNodeToken");
    token = await Token.connect(admin).deploy();
    await token.waitForDeployment();

    const blockNumber = await ethers.provider.getBlockNumber();
    const Stake = await ethers.getContractFactory("MetaNodeStake");
    stake = await upgradesApi.deployProxy(
      Stake.connect(admin),
      [await token.getAddress(), blockNumber, blockNumber + 10000, 100n],
      { kind: "uups" }
    );
    await stake.waitForDeployment();

    await stake.connect(admin).addPool(zeroAddress, 5, 0, lockBlocks, false);
    await token
      .connect(admin)
      .transfer(await stake.getAddress(), ethers.parseEther("100000"));
  });

  it("setMetaNodePerBlock", async function () {
    await stake.connect(admin).setMetaNodePerBlock(200n);
    expect(await stake.MetaNodePerBlock()).to.eq(200n);
    await stake.connect(admin).setMetaNodePerBlock(100n);
  });

  it("addPool withUpdate", async function () {
    await stake
      .connect(admin)
      .addPool(await token.getAddress(), 5, 0, lockBlocks, true);
    expect(await stake.poolLength()).to.eq(2n);
  });

  it("getMultiplier clamps to endBlock", async function () {
    const start = await stake.startBlock();
    const end = await stake.endBlock();
    const mul = await stake.getMultiplier(start, end + 1000n);
    expect(mul).to.eq(100n * (end - start));
  });

  it("second deposit accrues pendingMetaNode", async function () {
    await stake.connect(user1).depositETH({ value: ethers.parseEther("1") });
    await networkHelpers.mine(5);
    await stake.connect(user1).depositETH({ value: ethers.parseEther("1") });

    const pending = await stake.pendingMetaNode(0, user1.address);
    expect(pending).to.gt(0n);

    const future = await stake.pendingMetaNodeByBlockNumber(
      0,
      user1.address,
      (await ethers.provider.getBlockNumber()) + 3
    );
    expect(future).to.gte(pending);
  });

  it("withdrawAmount and withdraw with a still-locked request", async function () {
    await stake.connect(user1).unstake(0, ethers.parseEther("0.5"));
    const [requested, unlocked] = await stake.withdrawAmount(0, user1.address);
    expect(requested).to.eq(ethers.parseEther("0.5"));
    expect(unlocked).to.eq(0n);

    await networkHelpers.mine(lockBlocks);
    const [, unlockedNow] = await stake.withdrawAmount(0, user1.address);
    expect(unlockedNow).to.eq(ethers.parseEther("0.5"));

    await stake.connect(user1).unstake(0, ethers.parseEther("0.5"));
    await stake.connect(user1).withdraw(0);

    const [requestedAfter, unlockedAfter] = await stake.withdrawAmount(
      0,
      user1.address
    );
    expect(requestedAfter).to.eq(ethers.parseEther("0.5"));
    expect(unlockedAfter).to.eq(0n);
  });

  it("updatePool is no-op on same block", async function () {
    await ethers.provider.send("evm_setAutomine", [false]);
    const tx1 = await stake.updatePool(0);
    const tx2 = await stake.updatePool(0);
    await ethers.provider.send("evm_mine", []);
    await ethers.provider.send("evm_setAutomine", [true]);
    await tx1.wait();
    await tx2.wait();
  });

  it("claim transfers MetaNode", async function () {
    await networkHelpers.mine(3);
    const before = await token.balanceOf(user1.address);
    await stake.connect(user1).claim(0);
    expect(await token.balanceOf(user1.address)).to.gt(before);
  });

  it("claim when reward exceeds contract token balance", async function () {
    const Token = await ethers.getContractFactory("MetaNodeToken");
    const poorToken = await Token.connect(admin).deploy();
    await poorToken.waitForDeployment();

    const blockNumber = await ethers.provider.getBlockNumber();
    const Stake = await ethers.getContractFactory("MetaNodeStake");
    const poorStake = await upgradesApi.deployProxy(
      Stake.connect(admin),
      [await poorToken.getAddress(), blockNumber, blockNumber + 10000, 1000n],
      { kind: "uups" }
    );
    await poorStake.waitForDeployment();
    await poorStake.connect(admin).addPool(zeroAddress, 1, 0, lockBlocks, false);
    await poorToken.connect(admin).transfer(await poorStake.getAddress(), 10n);

    await poorStake.connect(user1).depositETH({ value: ethers.parseEther("1") });
    await networkHelpers.mine(50);
    const before = await poorToken.balanceOf(user1.address);
    await poorStake.connect(user1).claim(0);
    expect(await poorToken.balanceOf(user1.address)).to.eq(before + 10n);
    expect(await poorToken.balanceOf(await poorStake.getAddress())).to.eq(0n);
  });

  it("reverts on paused claim, invalid pid and over-unstake", async function () {
    await stake.connect(admin).pauseClaim();
    await expect(stake.connect(user1).claim(0)).to.be.revertedWith(
      "claim is paused"
    );
    await stake.connect(admin).unpauseClaim();

    await expect(stake.connect(user1).claim(99)).to.be.revertedWith(
      "invalid pid"
    );
    await expect(
      stake.connect(user1).deposit(0, ethers.parseEther("1"))
    ).to.be.revertedWith("deposit not support ETH staking");
    await expect(
      stake.connect(user1).unstake(0, ethers.parseEther("100"))
    ).to.be.revertedWith("Not enough staking token balance");
  });
});
