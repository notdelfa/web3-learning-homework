# NFT 拍卖 — 测试报告

## 测试结果

```bash
cd week05_07_solidity_hw/nft
npx hardhat test
```

| 类型 | 数量 | 结果 |
| --- | --- | --- |
| Solidity 单元测试 | 30 | passing |
| Mocha 集成测试 | 11 | passing |
| **合计** | **41** | **全部通过** |

覆盖：拍卖创建/出价/结算（ETH + ERC20）、价格源、权限与 revert、UUPS / Transparent 升级。

## 覆盖率

```bash
npx hardhat test --coverage
```

| 文件 | Line % | Statement % |
| --- | --- | --- |
| `SimpleNFT.sol` | 100 | 100 |
| `MockERC20.sol` | 100 | 100 |
| `MockChainlink.sol` | 100 | 100 |
| `NFTAuctionBase.sol` | 98.82 | 98.70 |
| `NFTAuctionBaseV2.sol` | 100 | 100 |
| **Total** | **98.95** | **98.85** |

HTML 报告目录：`coverage/html/`（本地打开 `index.html` 查看明细）。

> 未覆盖行：`NFTAuctionBase.sol` L210（ETH 退款失败分支，正常路径难触发）。

## 链上验证（可选截图）

- 部署网络：Sepolia  
- Auction proxy：https://sepolia.etherscan.io/address/0x36254D13134B8Cf5E38CB31f8b2794AF3c79F9a7  
- 演示脚本：`npx hardhat run scripts/demo-auction.ts --network sepolia`  
- 或 Etherscan Write Contract / 交易记录截图放入本目录后在此引用
