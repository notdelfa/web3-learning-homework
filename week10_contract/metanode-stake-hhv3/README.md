# MetaNode Stake (Hardhat 3)

Hardhat 2 原项目在 `metanode-stake/stake-contract`。本仓库是对照用的 Hardhat 3 精简副本，目录对齐为 `stake-contract/`。Solidity 业务逻辑未改。

```text
metanode-stake/stake-contract/      Hardhat 2
metanode-stake-hhv3/stake-contract/ Hardhat 3
```

## 从 HH2 迁到 HH3 的核心要点

**1. ESM + 声明式配置**

- `package.json` 必须 `"type": "module"`
- `hardhat.config.js`（CJS `require`）改为 `hardhat.config.ts` 的 `defineConfig`
- 插件不能再靠 `require("@nomicfoundation/hardhat-toolbox")` 副作用注册，必须写进 `plugins: [...]`
- 远程网络必须声明 `type: "http"`；私钥用 `configVariable("PRIVATE_KEY")`，不再用 dotenv 塞进 config

**2. 没有全局立刻可用的 `hre.ethers` / `hre.upgrades`**

先建连接，再拿 ethers 和 OZ upgrades（v4，要求 `hardhat@^3.6.0`）：

```js
const connection = await hre.network.create();
const { ethers } = connection;
const upgradesApi = await upgrades(hre, connection);
await upgradesApi.deployProxy(Stake, args, { initializer: "initialize" });
```

同一脚本/测试套件共用一个 `connection`。

**3. 测试仍用 Mocha + ethers**

- `before` 里 `network.create()`
- `upgrades.deployProxy` → `upgradesApi.deployProxy`
- `provider.send("evm_mine")` → `networkHelpers.mine(n)`
- Ignition 模块改为 `export default buildModule(...)`

## 命令

```zsh
cd stake-contract
npm install
npx hardhat compile
npx hardhat test
npx hardhat test --coverage
npx hardhat ignition deploy ignition/modules/MetaNode.js
npx hardhat run scripts/MetaNodeStake.js
```

上 Sepolia 时加 `--network sepolia`，并设置环境变量 `PRIVATE_KEY`。

未复制 `stake-fe`、`addPool.js` 等交互脚本；前端与已部署的 Sepolia 合约无关，不随 Hardhat 版本迁移。

## 已部署合约（Sepolia）

由 Hardhat 2 原项目部署，Solidity 与本副本相同。前端 `stake-fe` 当前指向这份 Stake。

| 合约 | 地址 |
|---|---|
| MetaNodeToken | [`0xD118F2e69CA8FD9A63F6875a155b24C90532F7A9`](https://sepolia.etherscan.io/address/0xD118F2e69CA8FD9A63F6875a155b24C90532F7A9) |
| MetaNodeStake（UUPS 代理） | [`0xeA0e90AeBaf5ceE1DFc92B8Cf772AD3c86AEA172`](https://sepolia.etherscan.io/address/0xeA0e90AeBaf5ceE1DFc92B8Cf772AD3c86AEA172) |

初始化参数：`startBlock = 11506199`，`endBlock = 11722199`，`MetaNodePerBlock = 0.02`。ETH 池（pid 0）已添加。

本地 `hardhat run` / Ignition 打出的地址只存在于当次内存链，不要和上面的 Sepolia 地址混用。

## 测试报告

命令：`npx hardhat test`、`npx hardhat test --coverage`（Hardhat 3 内置覆盖率）。

- Mocha：**23 passing**（`01_MetaNodeStakeTest.js` 原流程 + `02_MetaNodeStakeCoverage.js` 补覆盖）
- 覆盖率（目标 ≥ 80%）：

| 文件 | Line | Statement |
|---|---|---|
| `contracts/MetaNode.sol` | 100% | 100% |
| `contracts/MetaNodeStake.sol` | 98.63% | 99.09% |
| **合计** | **98.63%** | **99.10%** |

未覆盖：`MetaNodeStake.sol` 832–835（给带返回值的合约转 ETH 的防御分支，普通钱包 `withdraw` 走不到）。HTML 报告：`stake-contract/coverage/html/index.html`。
