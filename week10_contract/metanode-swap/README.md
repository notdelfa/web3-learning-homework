# MetaNodeSwap

简化版 Uniswap V3：每个池子绑定一个固定价格区间，区间内所有 LP 共用同一段流动性。swap 不跨 tick 循环，一次 `computeSwapStep` 完成成交。

```shell
npx hardhat test
```

核心测试在 `test/MetaNodeSwap/`，对应五份合约：`Factory`、`PoolManager`、`Pool`、`PositionManager`、`SwapRouter`。

---

## 1. 测试用例在验证什么

| 测试 | 覆盖点 |
|------|--------|
| `Factory.ts` | CREATE2 建池、token 按地址排序（`token0 < token1`）、相同 token 拒绝 |
| `PoolManager.ts` | 同参数幂等创建、`getPairs` / `getAllPools`、未排序 token 拒绝 |
| `Pool.ts` | 初始化价格、mint/burn/collect 分步、swap 滑点与手续费回流 |
| `PositionManager.ts` | NFT 头寸、approve 后 mint、burn+collect、带手续费提取 |
| `SwapRouter.ts` | exactInput / exactOutput、quote（revert 解析报价）、`indexPath` 拆单到多池 |

`Pool` fixture 贯穿后续数字：

- 价格区间 `[1, 40000]`，初始价 `10000`（1 token0 = 10000 token1）
- 费率 `3000` = 0.3%（百万分之一，与 V3 相同）

关键断言：

- **mint 传入的是流动性 L，不是代币数量**；Pool 按当前价和区间反推 `amount0` / `amount1`，再 callback 打款。
- **burn 只减 L、把代币记到 `tokensOwed`，collect 才转出**；整数除法可能少几个 wei。
- swap 卖 100 token0，输出约 `100 * 10000 * 0.997`；价格下跌，池子总 L 不变。
- LP collect 后 token0 多于本金：本金 + 换入的 token0 + 手续费。
- `indexPath: [0, 1]` 不是 A→B→C 多跳，而是同一交易对先走 index=0，不够再走 index=1。
- quote 把 `recipient` 设为 `address(0)`，callback 把数量塞进 revert data，外层解析（抄 V3 Quoter）。

Pool 侧 Position 按**地址**记账，真正 owner 是 PositionManager；NFT 只是外围账本。直接调 `Pool.mint` 的流动性，PositionManager 看不见。

---

## 2. 核心业务逻辑

分层对应三个前端页面：

```
Pool 页       → PoolManager（继承 Factory）
Position 页   → PositionManager（ERC721）
Swap 页       → SwapRouter

Factory → CREATE2 部署 Pool
Pool    → 价格、流动性、手续费、mint / burn / swap
```

### 建池

任何人调用 `createAndInitializePoolIfNecessary`：要求 `token0 < token1`，CREATE2 部署（`salt = keccak256(token0, token1, tickLower, tickUpper, fee)`），再 `initialize` 当前价。同参数返回已有池。池创建后不能改区间、不能改费率、不能删除。相同交易对可以有多个池（不同 fee 或不同区间），用 `index` 区分。当前 tick 必须落在 `[tickLower, tickUpper)`。

初始化参数不走构造函数，而是写入 Factory 临时 `parameters`，Pool 构造时再读——构造参数会改变 CREATE2 的 `initcode`，地址就不稳定。

### 加流动性（mint）

- 底层：直接传入 L（测试里的 `TestLP`）。
- 产品路径：PositionManager 收 `amount0Desired` / `amount1Desired`，用 `LiquidityAmounts.getLiquidityForAmounts` 换成 L，再调 Pool。

`_modifyPosition`：

```
amount0 = Δtoken0(当前价 → tickUpper, ΔL)
amount1 = Δtoken1(tickLower → 当前价, ΔL)
```

先改账，再 `mintCallback` 打款，最后校验余额增加。

### 减流动性（burn → collect）

1. burn：减 L，本金和已结算手续费记入 `tokensOwed`。
2. collect：转到 `recipient`；PositionManager 在 L=0 时烧掉 NFT。

### Swap

```
swap(recipient, zeroForOne, amountSpecified, sqrtPriceLimitX96, data)
```

- `zeroForOne = true`：卖 token0 买 token1，价格下跌，限价必须低于当前价。
- `amountSpecified > 0`：exact input；`< 0`：exact output。
- 成交边界 = 用户限价与池子 `tickLower` / `tickUpper` 的更紧一侧。流动性不足或碰到区间边界 → 部分成交。
- 一次 `SwapMath.computeSwapStep`，没有 V3 的 while 跨 tick（全池共用一个区间，L 在区间内是常数）。

成交后更新 `sqrtPriceX96` / `tick`，累加全局手续费，callback 收输入币，再转出输出币。

### 手续费

```
feeGrowthGlobal += feeAmount * Q128 / liquidity
应得 = (feeGrowthGlobal - last) * position.liquidity / Q128
```

swap 只更新一个累加器（O(1)）；LP 在 mint/burn 时才结算到自己的 `tokensOwed`。

---

## 3. 作为简化版 V3 的设计思路

Uniswap V2 是全区间恒定乘积 `x * y = k`，LP 资金铺满 `(0, ∞)`。V3 把流动性集中到每个头寸自选的 `[tickLower, tickUpper]`，swap 沿 tick 走、每跨一个 tick 就加减 ΔL。

MetaNodeSwap 保留 V3 的数学（`sqrtPriceX96`、虚拟储备 `L`、同一套 TickMath / SqrtPriceMath / SwapMath），把「区间」从 Position 收到 Pool 上：

| 维度 | V2 | V3 | MetaNodeSwap |
|------|----|----|----------------|
| 做市 | `x*y=k` 全区间 | 虚拟 L，区间内等价 `x*y=k` | 同 V3 数学库 |
| 流动性位置 | 整个池 | 每个 Position 自选区间 | **整个池一个区间** |
| 同交易对多池 | 按 fee | fee tier | fee + 价格区间，用 `index` |
| swap | 一次公式 | while 跨 tick | **一次 computeSwapStep** |
| LP 凭证 | ERC20 | ERC721 | ERC721（也可直调 Pool） |
| 路由 | 跨交易对多跳 | 跨交易对多跳 | **同交易对、跨不同 index 的池** |

一句话：想表达不同价格观点，就再创建一个不同 `[tickLower, tickUpper]` 的池，而不是在同一个池里挂多个区间。`indexPath` 用「多池拼接」代替 V3 的 tick crossing。

因此会出现 V3 同款现象：初始价靠近区间上沿时，仓位几乎全是 token0。swap 未碰到 `tickLower` 时 L 不变；撞上边界则部分成交，剩余量交给 Router 的下一个 index 池。
