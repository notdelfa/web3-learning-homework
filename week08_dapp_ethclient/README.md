# Week08 · go-ethereum ethclient

查区块 / 转账 / abigen 调合约（Sepolia）。

```bash
cd week08_dapp_ethclient && go mod tidy
export ETH_RPC_URL="https://ethereum-sepolia.gateway.tatum.io"  # Sepolia RPC
export PRIVATE_KEY="<hex>"   # 发交易 / 写合约需要
```

## 任务一 · 查区块 / 转账

**终端**

```bash
cd task1-query
go run . -block 0
go run . -send -to 0x收款地址 -amount 0.001
go run . -tx 0x交易哈希
```

**Web** → http://localhost:8080

```bash
cd task1-query && go run . -web
```

## 任务二 · abigen Counter

**终端**

```bash
cd task2-abigen
go run . -deploy
export CONTRACT_ADDR=0x...
go run .                 # 读 number
go run . -inc
go run . -set 42
```

**Web** → http://localhost:8081

```bash
cd task2-abigen && go run . -web
```
