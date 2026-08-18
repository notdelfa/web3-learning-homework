import { configVariable, defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import hardhatUpgrades from "@openzeppelin/hardhat-upgrades";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers, hardhatUpgrades],
  solidity: {
    version: "0.8.22",
    settings: {
      optimizer: {
        enabled: false,
        runs: 200,
      },
    },
  },
  networks: {
    sepolia: {
      type: "http",
      chainType: "l1",
      url: "https://sepolia.infura.io/v3/d8ed0bd1de8242d998a1405b6932ab33",
      accounts: [configVariable("PRIVATE_KEY")],
    },
  },
});
