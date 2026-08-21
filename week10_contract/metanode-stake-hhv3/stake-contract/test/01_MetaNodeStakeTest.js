import hre from "hardhat";
import { upgrades } from "@openzeppelin/hardhat-upgrades";
import { expect } from "chai";

describe("stake test", function () {
  let ethers;
  let networkHelpers;
  let upgradesApi;
  let admin, user1, user2, user3;
  let erc20Contract, stakeProxyContract;

  const metaNodePerBlock = 100n;
  const blockHight = 10000;
  const unstakeLockedBlocks = 10;
  const zeroAddress = "0x0000000000000000000000000000000000000000";

  before(async function () {
    const connection = await hre.network.create();
    ethers = connection.ethers;
    networkHelpers = connection.networkHelpers;
    upgradesApi = await upgrades(hre, connection);
  });

  it("deploy", async function () {
    [, admin, user1, user2, user3] = await ethers.getSigners();
    const erc20 = await ethers.getContractFactory("MetaNodeToken");
    erc20Contract = await erc20.connect(admin).deploy();
    await erc20Contract.waitForDeployment();
    const erc20ddress = await erc20Contract.getAddress();
    expect(erc20ddress).to.length.gt(0);

    const blockNumber = await ethers.provider.getBlockNumber();
    const metaNodeStake = await ethers.getContractFactory("MetaNodeStake");
    stakeProxyContract = await upgradesApi.deployProxy(
      metaNodeStake.connect(admin),
      [erc20ddress, blockNumber, blockNumber + blockHight, metaNodePerBlock],
      { kind: "uups" }
    );
    await stakeProxyContract.waitForDeployment();
    const metaNodeStakeAddress = await stakeProxyContract.getAddress();
    expect(metaNodeStakeAddress).to.length.gt(0);

    await stakeProxyContract
      .connect(admin)
      .addPool(zeroAddress, 5, 1e15, unstakeLockedBlocks, false);
    const poolLength = await stakeProxyContract.poolLength();
    expect(poolLength).to.length.gt(0);
  });

  it("setMetaNode", async () => {
    const erc20 = await ethers.getContractFactory("MetaNodeToken");
    erc20Contract = await erc20.connect(admin).deploy();
    await erc20Contract.waitForDeployment();
    const erc20ddress = await erc20Contract.getAddress();

    await stakeProxyContract.connect(admin).setMetaNode(erc20ddress);
    const newERC20 = await stakeProxyContract.MetaNode();
    expect(newERC20).to.eq(erc20ddress);
  });

  it("pauseWithdraw", async () => {
    await stakeProxyContract.connect(admin).pauseWithdraw();
    const res = await stakeProxyContract.withdrawPaused();
    expect(res).to.true;
  });

  it("unpauseWithdraw", async () => {
    await stakeProxyContract.connect(admin).unpauseWithdraw();
    const res = await stakeProxyContract.withdrawPaused();
    expect(res).to.false;
  });

  it("pauseClaim", async () => {
    await stakeProxyContract.connect(admin).pauseClaim();
    const res = await stakeProxyContract.claimPaused();
    expect(res).to.true;
  });

  it("unpauseClaim", async () => {
    await stakeProxyContract.connect(admin).unpauseClaim();
    const res = await stakeProxyContract.claimPaused();
    expect(res).to.false;
  });

  it("setStartBlock", async () => {
    const blockNumber = await ethers.provider.getBlockNumber();
    const startBlock = blockNumber;
    await stakeProxyContract.connect(admin).setStartBlock(startBlock);
    const res = await stakeProxyContract.startBlock();
    expect(res).to.eq(startBlock);
  });

  it("setEndBlock", async () => {
    const startBlock = await stakeProxyContract.startBlock();
    const endBlock = startBlock + 100n;
    await stakeProxyContract.connect(admin).setEndBlock(endBlock);
    const res = await stakeProxyContract.endBlock();
    expect(res).to.eq(endBlock);
  });

  it("addPool", async () => {
    const tokenAddress = await erc20Contract.getAddress();
    const poolWeight = 10;
    const minDepositAmount = BigInt(1e18);
    const withUpdate = false;
    await stakeProxyContract
      .connect(admin)
      .addPool(
        tokenAddress,
        poolWeight,
        minDepositAmount,
        unstakeLockedBlocks,
        withUpdate
      );
    const poolLength = await stakeProxyContract.poolLength();
    expect(poolLength).to.length.gt(1);
  });

  it("updatePool", async () => {
    await stakeProxyContract.connect(admin).updatePool(0, 1e15, 10);
    await stakeProxyContract.connect(admin).setPoolWeight(0, 20, true);
  });

  it("getMultiplier", async () => {
    const fromBlock = await stakeProxyContract.startBlock();
    const toBlock = fromBlock + 10n;
    const mul = await stakeProxyContract.getMultiplier(fromBlock, toBlock);
    expect(mul).to.eq(metaNodePerBlock * (toBlock - fromBlock));
  });

  it("deposit", async () => {
    await stakeProxyContract
      .connect(user1)
      .depositETH({ value: ethers.parseEther("10") });
    await stakeProxyContract
      .connect(user2)
      .depositETH({ value: ethers.parseEther("20") });

    await erc20Contract
      .connect(admin)
      .transfer(user3.address, ethers.parseEther("1000"));
    const proxyAddress = await stakeProxyContract.getAddress();
    await erc20Contract
      .connect(user3)
      .approve(proxyAddress, ethers.parseEther("200"));
    await stakeProxyContract
      .connect(user3)
      .deposit(1, ethers.parseEther("200"));

    const user1Stake = await stakeProxyContract.stakingBalance(0, user1.address);
    const user2Stake = await stakeProxyContract.stakingBalance(0, user2.address);
    const user3Stake = await stakeProxyContract.stakingBalance(1, user3.address);
    expect(user1Stake).to.eq(BigInt(10e18));
    expect(user2Stake).to.eq(BigInt(20e18));
    expect(user3Stake).to.eq(BigInt(200e18));
  });

  it("unstake", async () => {
    await stakeProxyContract.connect(user1).unstake(0, ethers.parseEther("2"));
    await stakeProxyContract.connect(user2).unstake(0, ethers.parseEther("2"));
    await stakeProxyContract.connect(user3).unstake(1, ethers.parseEther("10"));

    const user1Stake = await stakeProxyContract.stakingBalance(0, user1.address);
    const user2Stake = await stakeProxyContract.stakingBalance(0, user2.address);
    const user3Stake = await stakeProxyContract.stakingBalance(1, user3.address);
    expect(user1Stake).to.eq(BigInt(8e18));
    expect(user2Stake).to.eq(BigInt(18e18));
    expect(user3Stake).to.eq(BigInt(190e18));

    await stakeProxyContract.massUpdatePools();
  });

  it("withdraw", async () => {
    const user1BalanceBefore = await ethers.provider.getBalance(user1.address);
    const user2BalanceBefore = await ethers.provider.getBalance(user2.address);
    const user3BalanceBefore = await erc20Contract.balanceOf(user3.address);

    await networkHelpers.mine(unstakeLockedBlocks);

    await stakeProxyContract.connect(user1).withdraw(0);
    await stakeProxyContract.connect(user2).withdraw(0);
    await stakeProxyContract.connect(user3).withdraw(1);

    const user1BalanceAfter = await ethers.provider.getBalance(user1.address);
    const user2BalanceAfter = await ethers.provider.getBalance(user2.address);
    const user3BalanceAfter = await erc20Contract.balanceOf(user3.address);

    expect(user1BalanceAfter - user1BalanceBefore)
      .to.lt(BigInt(2e18))
      .gt(BigInt(1.9e18));
    expect(user2BalanceAfter - user2BalanceBefore)
      .to.lt(BigInt(2e18))
      .gt(BigInt(1.9e18));
    expect(user3BalanceAfter - user3BalanceBefore).to.eq(BigInt(10e18));
  });
});
