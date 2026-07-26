// 任务一：Sepolia 查区块 / 发转账 / 按 tx 查确认区块
// 环境变量：ETH_RPC_URL；发交易还需 PRIVATE_KEY
package main

import (
	"context"
	"crypto/ecdsa"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

func main() {
	blockNum := flag.Int64("block", 0, "区块号，0=最新")
	send := flag.Bool("send", false, "发 ETH 转账")
	to := flag.String("to", "", "收款地址")
	amount := flag.Float64("amount", 0.001, "ETH 金额")
	txHash := flag.String("tx", "", "交易哈希→查确认区块")
	web := flag.Bool("web", false, "HTML Demo :8080")
	flag.Parse()

	client, err := ethclient.Dial(mustEnv("ETH_RPC_URL"))
	must(err)
	defer client.Close()

	if *web {
		runWeb(client)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	switch {
	case *send:
		hash, err := sendTx(ctx, client, *to, *amount)
		must(err)
		fmt.Println("Tx Hash:", hash)
	case *txHash != "":
		info, err := queryTxBlock(ctx, client, *txHash)
		must(err)
		printJSON(info)
	default:
		info, err := queryBlock(ctx, client, *blockNum)
		must(err)
		printJSON(info)
	}
}

type blockInfo struct {
	Number uint64 `json:"number"`
	Hash   string `json:"hash"`
	Time   uint64 `json:"time"`
	Txs    int    `json:"txs"`
}

type txBlockInfo struct {
	TxHash      string     `json:"txHash"`
	Status      uint64     `json:"status"`
	BlockNumber uint64     `json:"blockNumber"`
	Block       *blockInfo `json:"block,omitempty"`
	Pending     bool       `json:"pending,omitempty"`
}

// 不拉全量交易：Header 取哈希/时间；交易数用 eth_getBlockByNumber(false)（仅哈希列表）
func queryBlock(ctx context.Context, c *ethclient.Client, n int64) (*blockInfo, error) {
	arg := "latest"
	if n > 0 {
		arg = hexutil.EncodeUint64(uint64(n))
	}
	var b struct {
		Number       hexutil.Uint64 `json:"number"`
		Hash         common.Hash    `json:"hash"`
		Timestamp    hexutil.Uint64 `json:"timestamp"`
		Transactions []common.Hash  `json:"transactions"`
	}
	if err := c.Client().CallContext(ctx, &b, "eth_getBlockByNumber", arg, false); err != nil {
		return nil, err
	}
	return &blockInfo{uint64(b.Number), b.Hash.Hex(), uint64(b.Timestamp), len(b.Transactions)}, nil
}

// tx hash → Receipt → 所在区块（不解码交易本身）
func queryTxBlock(ctx context.Context, c *ethclient.Client, hashHex string) (*txBlockInfo, error) {
	hash := common.HexToHash(hashHex)
	receipt, err := c.TransactionReceipt(ctx, hash)
	if err != nil {
		if errors.Is(err, ethereum.NotFound) {
			return &txBlockInfo{TxHash: hash.Hex(), Pending: true}, nil
		}
		return nil, err
	}
	block, err := queryBlock(ctx, c, int64(receipt.BlockNumber.Uint64()))
	if err != nil {
		return nil, err
	}
	return &txBlockInfo{
		TxHash: hash.Hex(), Status: receipt.Status,
		BlockNumber: receipt.BlockNumber.Uint64(), Block: block,
	}, nil
}

func sendTx(ctx context.Context, c *ethclient.Client, toHex string, eth float64) (string, error) {
	key, err := crypto.HexToECDSA(strings.TrimPrefix(mustEnv("PRIVATE_KEY"), "0x"))
	if err != nil {
		return "", err
	}
	from := crypto.PubkeyToAddress(*key.Public().(*ecdsa.PublicKey))
	to := common.HexToAddress(toHex)

	chainID, err := c.ChainID(ctx)
	if err != nil {
		return "", err
	}
	nonce, err := c.PendingNonceAt(ctx, from)
	if err != nil {
		return "", err
	}
	gasPrice, err := c.SuggestGasPrice(ctx)
	if err != nil {
		return "", err
	}
	wei, _ := new(big.Float).Mul(big.NewFloat(eth), big.NewFloat(1e18)).Int(nil)
	tx := types.NewTransaction(nonce, to, wei, 21000, gasPrice, nil)
	signed, err := types.SignTx(tx, types.NewEIP155Signer(chainID), key)
	if err != nil {
		return "", err
	}
	if err := c.SendTransaction(ctx, signed); err != nil {
		return "", err
	}
	return signed.Hash().Hex(), nil
}

func runWeb(client *ethclient.Client) {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "static/index.html")
	})
	http.HandleFunc("/api/block", func(w http.ResponseWriter, r *http.Request) {
		n, _ := strconv.ParseInt(r.URL.Query().Get("number"), 10, 64)
		ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
		defer cancel()
		info, err := queryBlock(ctx, client, n)
		writeJSON(w, info, err)
	})
	http.HandleFunc("/api/send", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			To     string  `json:"to"`
			Amount float64 `json:"amount"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()
		hash, err := sendTx(ctx, client, req.To, req.Amount)
		writeJSON(w, map[string]string{"txHash": hash}, err)
	})
	http.HandleFunc("/api/tx", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()
		info, err := queryTxBlock(ctx, client, r.URL.Query().Get("hash"))
		writeJSON(w, info, err)
	})
	log.Println("demo: http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

func writeJSON(w http.ResponseWriter, data any, err error) {
	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		log.Printf("[api error] %v", err) // 终端可见；之前只回 JSON 所以看不到 log
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	_ = json.NewEncoder(w).Encode(data)
}

func printJSON(v any) { b, _ := json.MarshalIndent(v, "", "  "); fmt.Println(string(b)) }
func must(err error) {
	if err != nil {
		log.Fatal(err)
	}
}
func mustEnv(k string) string {
	v := os.Getenv(k)
	if v == "" {
		log.Fatalf("%s not set", k)
	}
	return v
}
