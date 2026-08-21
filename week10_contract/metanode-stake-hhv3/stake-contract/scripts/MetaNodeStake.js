import hre from "hardhat";
import { upgrades } from "@openzeppelin/hardhat-upgrades";

const MetaNodeToken = "0xD118F2e69CA8FD9A63F6875a155b24C90532F7A9";
const startBlock = 11506199;
const endBlock = 11722199;
const MetaNodePerBlock = "20000000000000000";

const connection = await hre.network.create();
const { ethers } = connection;
const upgradesApi = await upgrades(hre, connection);

const Stake = await ethers.getContractFactory("MetaNodeStake");
console.log("Deploying MetaNodeStake...");
const s = await upgradesApi.deployProxy(
  Stake,
  [MetaNodeToken, startBlock, endBlock, MetaNodePerBlock],
  { initializer: "initialize" }
);
console.log("Box deployed to:", await s.getAddress());
