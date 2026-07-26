// 任务二：abigen 绑定 Counter（部署 / 读 number / increment / setNumber）
// 环境变量：ETH_RPC_URL、PRIVATE_KEY；已有合约可设 CONTRACT_ADDR
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"

	counter "homework05/task2-abigen/bindings"
)

func main() {
	deploy := flag.Bool("deploy", false, "部署 Counter")
	inc := flag.Bool("inc", false, "increment()")
	set := flag.Int64("set", -1, "setNumber(n)")
	web := flag.Bool("web", false, "HTML Demo :8081")
	flag.Parse()

	client, err := ethclient.Dial(mustEnv("ETH_RPC_URL"))
	must(err)
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	if *deploy {
		addr, txHash, err := deployCounter(ctx, client)
		must(err)
		fmt.Println("Contract:", addr.Hex())
		fmt.Println("Tx Hash :", txHash)
		fmt.Printf("export CONTRACT_ADDR=%s\n", addr.Hex())
		return
	}

	app := &appState{client: client}
	if v := os.Getenv("CONTRACT_ADDR"); v != "" {
		must(app.bind(common.HexToAddress(v)))
	}
	if *web {
		runWeb(app)
		return
	}

	c, _, err := app.get()
	must(err)
	n, err := c.Number(&bind.CallOpts{Context: ctx})
	must(err)
	fmt.Println("number =", n)

	if *set >= 0 {
		hash, err := callSet(ctx, client, c, big.NewInt(*set))
		must(err)
		fmt.Println("setNumber tx:", hash)
	}
	if *inc {
		hash, err := callInc(ctx, client, c)
		must(err)
		fmt.Println("increment tx:", hash)
	}
}

type appState struct {
	client *ethclient.Client
	mu     sync.Mutex
	addr   common.Address
	c      *counter.Counter
}

func (a *appState) bind(addr common.Address) error {
	c, err := counter.NewCounter(addr, a.client)
	if err != nil {
		return err
	}
	a.mu.Lock()
	a.addr, a.c = addr, c
	a.mu.Unlock()
	return nil
}

func (a *appState) get() (*counter.Counter, common.Address, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.c == nil {
		return nil, common.Address{}, fmt.Errorf("no contract, deploy first")
	}
	return a.c, a.addr, nil
}

func deployCounter(ctx context.Context, client *ethclient.Client) (common.Address, string, error) {
	auth, err := newAuth(ctx, client)
	if err != nil {
		return common.Address{}, "", err
	}
	addr, tx, _, err := counter.DeployCounter(auth, client)
	if err != nil {
		return common.Address{}, "", err
	}
	// 等上链，否则立刻读 number 会 no contract code
	if _, err := bind.WaitMined(ctx, client, tx); err != nil {
		return common.Address{}, "", err
	}
	return addr, tx.Hash().Hex(), nil
}

func callInc(ctx context.Context, client *ethclient.Client, c *counter.Counter) (string, error) {
	auth, err := newAuth(ctx, client)
	if err != nil {
		return "", err
	}
	tx, err := c.Increment(auth)
	if err != nil {
		return "", err
	}
	return tx.Hash().Hex(), nil
}

func callSet(ctx context.Context, client *ethclient.Client, c *counter.Counter, n *big.Int) (string, error) {
	auth, err := newAuth(ctx, client)
	if err != nil {
		return "", err
	}
	tx, err := c.SetNumber(auth, n)
	if err != nil {
		return "", err
	}
	return tx.Hash().Hex(), nil
}

func newAuth(ctx context.Context, client *ethclient.Client) (*bind.TransactOpts, error) {
	key, err := crypto.HexToECDSA(strings.TrimPrefix(mustEnv("PRIVATE_KEY"), "0x"))
	if err != nil {
		return nil, err
	}
	chainID, err := client.ChainID(ctx)
	if err != nil {
		return nil, err
	}
	auth, err := bind.NewKeyedTransactorWithChainID(key, chainID)
	if err != nil {
		return nil, err
	}
	auth.Context = ctx
	return auth, nil
}

func runWeb(app *appState) {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "static/index.html")
	})
	http.HandleFunc("/api/deploy", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
		defer cancel()
		addr, txHash, err := deployCounter(ctx, app.client)
		if err == nil {
			err = app.bind(addr)
		}
		writeJSON(w, map[string]string{"contract": addr.Hex(), "txHash": txHash}, err)
	})
	http.HandleFunc("/api/number", func(w http.ResponseWriter, r *http.Request) {
		c, addr, err := app.get()
		if err != nil {
			writeJSON(w, nil, err)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
		defer cancel()
		n, err := c.Number(&bind.CallOpts{Context: ctx})
		writeJSON(w, map[string]any{"contract": addr.Hex(), "number": n.String()}, err)
	})
	http.HandleFunc("/api/increment", func(w http.ResponseWriter, r *http.Request) {
		c, _, err := app.get()
		if err != nil {
			writeJSON(w, nil, err)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
		defer cancel()
		hash, err := callInc(ctx, app.client, c)
		writeJSON(w, map[string]string{"txHash": hash}, err)
	})
	http.HandleFunc("/api/set", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Number int64 `json:"number"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		c, _, err := app.get()
		if err != nil {
			writeJSON(w, nil, err)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
		defer cancel()
		hash, err := callSet(ctx, app.client, c, big.NewInt(req.Number))
		writeJSON(w, map[string]string{"txHash": hash}, err)
	})
	log.Println("demo: http://localhost:8081")
	log.Fatal(http.ListenAndServe(":8081", nil))
}

func writeJSON(w http.ResponseWriter, data any, err error) {
	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	_ = json.NewEncoder(w).Encode(data)
}

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
