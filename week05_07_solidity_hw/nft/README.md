# NFT 拍卖

Hardhat 3 + OpenZeppelin：ERC721 拍卖，支持 ETH / ERC20 出价、USD 换算、UUPS / Transparent 升级。

## 项目结构

```text
nft/
├── contracts/
│   ├── SimpleNFT.sol              # ERC721
│   ├── NFTAuctionBase.sol         # 拍卖逻辑（Transparent 实现）
│   ├── NFTAuctionUUPS.sol         # Base + UUPS
│   ├── NFTAuctionBaseV2.sol       # 升级演示（version）
│   ├── NFTAuctionUUPSV2.sol
│   ├── MockChainlink.sol          # 本地价格源
│   ├── MockERC20.sol
│   ├── ProxyImports.sol           # 代理薄包装
│   └── NFTAuction.t.sol           # Solidity 单元测试
├── test/NFTAuction.ts             # Mocha 集成测试
├── scripts/
│   ├── deploy.ts                  # 部署（本地 / Sepolia）
│   └── demo-auction.ts            # Sepolia ETH 拍卖演示
├── ignition/modules/              # 本地 Ignition 模块
└── deployments/sepolia.json       # Sepolia 部署地址
```

## 测试报告

详见 [`TEST_REPORT.md`](TEST_REPORT.md)。生成方式：

```bash
npx hardhat test                 # 测试结果
npx hardhat test --coverage      # 覆盖率（控制台 + coverage/html）
```
### 已部署地址（Sepolia）

查看地址（Auction proxy）：https://sepolia.etherscan.io/address/0x36254D13134B8Cf5E38CB31f8b2794AF3c79F9a7

| 合约 | 地址 |
| --- | --- |
| SimpleNFT | [`0x505a8e2A3420c979AD043a4d83398b10fc74E739`](https://sepolia.etherscan.io/address/0x505a8e2A3420c979AD043a4d83398b10fc74E739) |
| MockERC20 | [`0xFc782Bd81e0De3B171EDE8c31BA9F13e3b87709C`](https://sepolia.etherscan.io/address/0xFc782Bd81e0De3B171EDE8c31BA9F13e3b87709C) |
| Auction **proxy** | [`0x36254D13134B8Cf5E38CB31f8b2794AF3c79F9a7`](https://sepolia.etherscan.io/address/0x36254D13134B8Cf5E38CB31f8b2794AF3c79F9a7) |
| Auction impl | [`0xeE3F22f8E5320663c318879BDf94D07f4A292325`](https://sepolia.etherscan.io/address/0xeE3F22f8E5320663c318879BDf94D07f4A292325) |
| ETH/USD | Chainlink [`0x694AA1769357215DE4FAC081bf1f309aDC325306`](https://sepolia.etherscan.io/address/0x694AA1769357215DE4FAC081bf1f309aDC325306) |

## 功能说明

| 功能 | 说明 |
| --- | --- |
| 铸造 / 转移 | `SimpleNFT.mint` + ERC721 `transferFrom` |
| 上架 | `createAuction(nft, tokenId, paymentToken, startingBid, duration)` |
| 出价 | ETH：`bid{value}`；ERC20：先 `approve` 再 `bid(amount)` |
| 结算 | `endAuction`：最高价得 NFT，资金给卖家；无人出价退回 NFT |
| USD 换算 | `getAmountInUSD` / `getHighestBidInUSD`（8 位小数） |
| 升级 | UUPS：`owner.upgradeToAndCall`；Transparent：`ProxyAdmin.upgradeAndCall` |

流程：`setPriceFeed` → `mint` → `approve(proxy)` → `createAuction` → `bid` → `endAuction`  
交互地址始终是 **proxy**（不是 impl）。

| | UUPS | Transparent |
| --- | --- | --- |
| Proxy | `ERC1967Proxy` | `TransparentUpgradeableProxy` |
| 实现 | `NFTAuctionUUPS` | `NFTAuctionBase` |
| 谁升级 | 合约 `owner` | `ProxyAdmin.owner` |

## 本地测试

```bash
cd week05_07_solidity_hw/nft
npm install
npx hardhat test
```

## 部署测试（Sepolia）

1. 账户需有 Sepolia ETH；准备 RPC（建议 Alchemy，公共节点易限流）。
2. 配置环境变量（勿提交私钥）：

```bash
export SEPOLIA_RPC_URL="https://gateway.tenderly.co/public/sepolia"
export SEPOLIA_PRIVATE_KEY="你的私钥"
```

3. 部署（默认 UUPS）：

```bash
npx hardhat run scripts/deploy.ts --network sepolia --build-profile production
```

可选：`DEPLOY_MODE=transparent` 或 `both`。  
中断后续跑可复用地址：`EXISTING_NFT` / `EXISTING_MOCK_TOKEN` / `EXISTING_TOKEN_USD_FEED`。  
结果写入 `deployments/sepolia.json`。

## 链上验证

### 脚本（一键）

```bash
npx hardhat run scripts/demo-auction.ts --network sepolia
```

### 图形化（Etherscan + MetaMask）

MetaMask 切 **Sepolia** → 打开合约页 **Write Contract** → **Connect to Web3**。金额：`0.001 ETH = 1000000000000000` wei。

| 步骤 | 页面 | 操作 |
| --- | --- | --- |
| ① mint | [SimpleNFT Write](https://sepolia.etherscan.io/address/0x505a8e2A3420c979AD043a4d83398b10fc74E739#writeContract) | `mint(你的地址)`；[Read](https://sepolia.etherscan.io/address/0x505a8e2A3420c979AD043a4d83398b10fc74E739#readContract) 用 `ownerOf` 确认 `tokenId`（多为 `0`） |
| ② approve | 同上 | `approve(0x36254D13134B8Cf5E38CB31f8b2794AF3c79F9a7, tokenId)` |
| ③ 上架 | [Auction Write](https://sepolia.etherscan.io/address/0x36254D13134B8Cf5E38CB31f8b2794AF3c79F9a7#writeContract) | `createAuction(nft地址, tokenId, 0x000…000, 1000000000000000, 300)`；`auctionId = nextAuctionId - 1` |
| ④ 出价 | 同上 | `bid(auctionId, 0)`，**payable** 填 `0.001` ETH；再出更高价改 `0.002` |
| ⑤ 结算 | 同上 | 到期后 `endAuction(auctionId)`；用 `ownerOf` / `auctions` 核对 |

ERC20：`paymentToken` 用 MockERC20；先 `mint`+`approve(proxy)`，再 `bid(id, amount)`，payable=`0`。
