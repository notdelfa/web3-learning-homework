# 常用 ERC / EIP 标准整理

熟悉以太坊生态里常见的 ERC（EIP）标准，按应用场景归类说明含义与用途。

## 官方查询

- 全部提案索引：https://eips.ethereum.org/all
- ERC 仓库：https://github.com/ethereum/ERCs
- EIP 仓库：https://github.com/ethereum/EIPs

> **EIP vs ERC**：EIP（Ethereum Improvement Proposal）是以太坊改进提案总称；其中面向应用层接口/合约规范的一类常称为 **ERC**（Ethereum Request for Comments），编号仍用 EIP 页面（如 ERC-20 对应 `eip-20`）。

---

## 一、DEX（Uniswap）

相关标准：**ERC-20、ERC-2612、ERC-721、EIP-712**

| 标准 | 一句话 | Uniswap 中的典型用途 |
|------|--------|----------------------|
| ERC-20 | 同质化代币接口 | 交易对里的 token0 / token1、手续费代币 |
| ERC-2612 | 带 `permit` 的 ERC-20 扩展 | 签名授权后直接 swap，少一次 `approve` 链上交易 |
| ERC-721 | 非同质化代币 | V3 LP Position 用 NFT 表示流动性头寸 |
| EIP-712 | 结构化数据签名标准 | `permit`、离线报价/授权等 typed data 签名的基础 |

### ERC-20 — Fungible Token Standard

- **含义**：定义同质化代币的统一接口（`transfer` / `approve` / `transferFrom` / `balanceOf` 等）。
- **要点**：任意钱包、DEX、借贷协议都能按同一套 ABI 交互；授权（allowance）是 DeFi 组合的基础。
- **链接**：https://eips.ethereum.org/EIPS/eip-20

### ERC-2612 — Permit Extension for ERC-20

- **含义**：在 ERC-20 上增加 `permit(owner, spender, value, deadline, v, r, s)`，用**链下签名**完成授权。
- **要点**：依赖 EIP-712；用户签一次名，合约代为设 allowance，可省 gas、改善 UX（Uniswap 等常用）。
- **链接**：https://eips.ethereum.org/EIPS/eip-2612

### ERC-721 — Non-Fungible Token Standard

- **含义**：每个 tokenId 唯一、不可互换的 NFT 标准（`ownerOf` / `safeTransferFrom` / `tokenURI` 等）。
- **要点**：Uniswap V3 把「某个价格区间的 LP 头寸」铸成 ERC-721，便于转让、抵押或在市场上交易流动性仓位。
- **链接**：https://eips.ethereum.org/EIPS/eip-721

### EIP-712 — Typed structured data hashing and signing

- **含义**：规定如何对**结构化 typed data**做哈希与签名，钱包可展示人类可读字段，避免盲目签原始 hash。
- **要点**：ERC-2612、许多订单簿/Permit2、以及大量「签名即授权」协议都以它为底座。
- **链接**：https://eips.ethereum.org/EIPS/eip-712

---

## 二、借贷（Aave）

相关标准：**ERC-20、ERC-2612、ERC-4626、EIP-712**

| 标准 | 一句话 | Aave 中的典型用途 |
|------|--------|-------------------|
| ERC-20 | 同质化代币 | 抵押资产、借款资产、aToken / 债务代币等 |
| ERC-2612 | permit 免 approve | 一键存入/授权，减少两笔交易 |
| ERC-4626 | Tokenized Vault | 统一「存资产 → 拿份额代币」的金库接口（生态集成、策略金库） |
| EIP-712 | 结构化签名 | permit、信用委托等签名流程 |

### ERC-4626 — Tokenized Vault Standard

- **含义**：把「Vault（金库）」标准化：存入底层资产，获得代表份额的 ERC-20；约定 `deposit` / `mint` / `withdraw` / `redeem`、`convertToShares` 等。
- **要点**：聚合器、策略库、借贷收益仓可用同一接口对接；降低集成成本。Aave 生态及周边金库产品常对齐或兼容该模型。
- **链接**：https://eips.ethereum.org/EIPS/eip-4626

（ERC-20 / ERC-2612 / EIP-712 含义见上一节，借贷场景侧重「抵押与借款资产互操作 + 签名授权」。）

---

## 三、NFT 市场（OpenSea）

相关标准：**ERC-721、ERC-1155、ERC-165、ERC-2981、ERC-1271、EIP-712**

| 标准 | 一句话 | OpenSea 中的典型用途 |
|------|--------|----------------------|
| ERC-721 | 单件 NFT | 主流头像/艺术品收藏品 |
| ERC-1155 | 多代币标准 | 游戏道具、可批量转移的半同质化资产 |
| ERC-165 | 接口探测 | 判断合约支持 721 / 1155 / 版税等接口 |
| ERC-2981 | NFT 版税 | 二级市场成交时查询创作者版税信息 |
| ERC-1271 | 合约钱包验签 | Safe 等智能合约钱包挂单/出价的签名校验 |
| EIP-712 | 结构化签名 | Seaport 等订单协议的离线订单签名 |

### ERC-1155 — Multi Token Standard

- **含义**：同一合约可同时管理多种 id 的代币，每个 id 可同质或非同质；支持批量 `safeBatchTransferFrom`。
- **要点**：游戏、Pass、多 edition 发行更省 gas、接口更统一。
- **链接**：https://eips.ethereum.org/EIPS/eip-1155

### ERC-165 — Standard Interface Detection

- **含义**：通过 `supportsInterface(bytes4)` 声明/查询合约实现了哪些接口 ID。
- **要点**：市场在上架前探测「是 721 还是 1155、是否支持版税」等，避免瞎调方法失败。
- **链接**：https://eips.ethereum.org/EIPS/eip-165

### ERC-2981 — NFT Royalty Standard

- **含义**：统一的版税查询接口 `royaltyInfo(tokenId, salePrice)`，返回收款地址与金额。
- **要点**：市场可按标准读出版税；**是否强制执行**取决于市场与链上强制版税方案，标准本身主要是信息层。
- **链接**：https://eips.ethereum.org/EIPS/eip-2981

### ERC-1271 — Standard Signature Validation Method for Contracts

- **含义**：合约实现 `isValidSignature(hash, signature)`，让「签名者」可以是**智能合约钱包**而不只是 EOA。
- **要点**：OpenSea / Seaport 等要支持 Gnosis Safe、各类 Account Abstraction 钱包挂单，必须验 ERC-1271。
- **链接**：https://eips.ethereum.org/EIPS/eip-1271

---

## 四、钱包（MetaMask）

相关标准：**ERC-4337、EIP-7702**

| 标准 | 一句话 | MetaMask 中的典型用途 |
|------|--------|----------------------|
| ERC-4337 | 账户抽象（UserOperation） | Smart Account、代付 gas、批量调用、社交恢复等 |
| EIP-7702 | EOA 临时委托合约代码 | Pectra 后 EOA 可临时获得智能账户能力，无需换地址 |

### ERC-4337 — Account Abstraction Using Alt Mempool

- **含义**：不改共识层交易类型，通过 `UserOperation`、EntryPoint、Paymaster、Bundler 实现智能账户：代付手续费、批量操作、自定义验证逻辑等。
- **要点**：用户可用合约账户；MetaMask Smart Accounts 等产品基于此扩展体验。
- **链接**：https://eips.ethereum.org/EIPS/eip-4337

### EIP-7702 — Set EOA account code

- **含义**：新交易类型，让 **EOA 临时设置/委托一段合约代码**执行，地址与 nonce 仍是该 EOA。
- **要点**：相对「必须部署新智能钱包」更轻；可配合 session key、限额等。与 4337 可互补，不是简单替代关系。
- **链接**：https://eips.ethereum.org/EIPS/eip-7702

---

## 五、AI + Web3

相关标准：**ERC-8004（Agent）、x402（支付）、ERC-8183（结算）**

| 标准 / 协议 | 一句话 | 在 Agent 栈中的角色 |
|-------------|--------|---------------------|
| ERC-8004 | 无信任 Agent 身份与信誉 | 发现 Agent、身份注册、声誉与验证 |
| x402 | HTTP 402 原生支付 | Agent 调 API / 买服务时的机器支付轨 |
| ERC-8183 | Agent 商务 / Job 结算原语 | 约定工作、托管预算、按结果结算 |

### ERC-8004 — Trustless Agents

- **含义**：为自主 Agent 提供链上**身份 / 声誉 / 验证**相关注册与元数据约定，便于互不认识的 Agent 发现与评估对方。
- **要点**：偏「信任与发现」层；支付本身正交，可与 x402 等配合。依赖 EIP-712、ERC-1271 等验签能力。
- **链接**：https://eips.ethereum.org/EIPS/eip-8004

### x402 — HTTP-native Payment Protocol

- **含义**：复兴 HTTP **402 Payment Required**：服务端返回 402 与付款条款，客户端（人或 AI Agent）带签名支付载荷重试；常由 Facilitator 完成链上结算（如稳定币）。
- **要点**：不是传统 EIP 编号提案，而是面向 Web/API 的开放支付协议（Coinbase 等推动，现有独立 Foundation）；EVM 侧常结合 EIP-3009 / Permit2 等完成转账授权。
- **参考**：https://www.coinbase.com/developer-platform/discover/launches/x402 、https://github.com/coinbase/x402

### ERC-8183 — Agentic Commerce / Job Settlement

- **含义**：面向 Agent 间商务的 **Job（任务）原语**：约定工作内容与条款、预算托管（escrow）、可验证结果后再结算。
- **要点**：补齐「谈妥活 → 做完 → 按结果付钱」的结算层；常与 ERC-8004（身份信誉）+ x402（支付轨）组成完整 Agent 商务栈。
- **链接**：https://eips.ethereum.org/EIPS/eip-8183（以 EIPs 站点最新状态为准）

---

## 六、速查总表

| 编号 | 名称 | 场景关键词 |
|------|------|------------|
| ERC-20 | Fungible Token | DEX / 借贷资产 |
| ERC-2612 | Permit | 免 approve 授权 |
| ERC-721 | NFT | Uniswap LP、OpenSea 单件 |
| ERC-1155 | Multi Token | 游戏 / 批量 NFT |
| ERC-165 | Interface Detection | 探测合约能力 |
| ERC-2981 | Royalty | NFT 版税信息 |
| ERC-1271 | Contract Signature | 合约钱包验签 |
| ERC-4626 | Tokenized Vault | 金库份额标准化 |
| EIP-712 | Typed Data Sign | 几乎所有链下授权 |
| ERC-4337 | Account Abstraction | 智能账户 |
| EIP-7702 | EOA Code Delegation | EOA 临时智能能力 |
| ERC-8004 | Trustless Agents | Agent 身份与信誉 |
| x402 | HTTP 402 Payments | Agent/API 微支付 |
| ERC-8183 | Agentic Job Settlement | Agent 任务托管结算 |

---

## 七、学习建议（可选）

1. 先吃透 **ERC-20 + EIP-712 + ERC-2612**，再看 DEX / 借贷如何省掉 approve。
2. NFT 线：**721 / 1155 + 165 + 2981 + 1271**，对照 OpenSea/Seaport 订单验签。
3. 钱包线：对比 **4337（另路 UserOp）** 与 **7702（EOA 委托代码）**。
4. AI 线：按「身份(8004) → 成交条款(8183) → 支付(x402)」记三层即可。
