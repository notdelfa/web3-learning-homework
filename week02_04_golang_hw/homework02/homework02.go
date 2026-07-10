package main

import (
	"fmt"
	"math"
	"sync"
	"sync/atomic"
	"time"
)

func main() {
	// demoPointer() // 指针
	// demoGoroutine() // 协程
	// demoOOP() // 面向对象
	// demoChannel() // 通道
	demoLock() // 锁
}

// ========== 指针 ==========

// addTen 通过指针将值加 10
func addTen(n *int) {
	*n += 10
}

// doubleSlice 通过指针将切片每个元素乘 2
func doubleSlice(nums *[]int) {
	for i := range *nums {
		(*nums)[i] *= 2
	}
}

func demoPointer() {
	fmt.Println("=== 指针 ===")

	x := 5
	addTen(&x)
	fmt.Println("加10后:", x)

	nums := []int{1, 2, 3}
	doubleSlice(&nums)
	fmt.Println("元素乘2:", nums)
}

// ========== Goroutine ==========

func demoGoroutine() {
	fmt.Println("\n=== Goroutine ===")

	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		for i := 1; i <= 10; i += 2 {
			fmt.Println("奇数:", i)
		}
	}()

	go func() {
		defer wg.Done()
		for i := 2; i <= 10; i += 2 {
			fmt.Println("偶数:", i)
		}
	}()
	wg.Wait()

	tasks := []func(){
		func() { time.Sleep(50 * time.Millisecond) },
		func() { time.Sleep(30 * time.Millisecond) },
		func() { time.Sleep(20 * time.Millisecond) },
	}
	runTasks(tasks)
}

// runTasks 并发执行任务并统计耗时
func runTasks(tasks []func()) {
	var wg sync.WaitGroup
	for i, task := range tasks {
		wg.Add(1)
		go func(id int, fn func()) {
			defer wg.Done()
			start := time.Now()
			fn()
			fmt.Printf("任务 %d 耗时: %v\n", id, time.Since(start))
		}(i+1, task)
	}
	wg.Wait()
}

// ========== 面向对象 ==========

// Shape 图形接口
type Shape interface {
	Area() float64
	Perimeter() float64
}

type Rectangle struct {
	Width, Height float64
}

func (r Rectangle) Area() float64      { return r.Width * r.Height }
func (r Rectangle) Perimeter() float64 { return 2 * (r.Width + r.Height) }

type Circle struct {
	Radius float64
}

func (c Circle) Area() float64      { return math.Pi * c.Radius * c.Radius }
func (c Circle) Perimeter() float64 { return 2 * math.Pi * c.Radius }

type Person struct {
	Name string
	Age  int
}

type Employee struct {
	Person
	EmployeeID string
}

func (e Employee) PrintInfo() {
	fmt.Printf("员工: %s, 年龄: %d, 工号: %s\n", e.Name, e.Age, e.EmployeeID)
}

func printShape(s Shape) {
	fmt.Printf("面积: %.2f, 周长: %.2f\n", s.Area(), s.Perimeter())
}

func demoOOP() {
	fmt.Println("\n=== 面向对象 ===")

	printShape(Rectangle{Width: 3, Height: 4})
	printShape(Circle{Radius: 5})

	Employee{Person: Person{Name: "Alice", Age: 28}, EmployeeID: "E001"}.PrintInfo()
}

// ========== Channel ==========

func demoChannel() {
	fmt.Println("\n=== Channel ===")

	ch := make(chan int)
	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		for i := 1; i <= 10; i++ {
			ch <- i
		}
		close(ch)
	}()

	go func() {
		defer wg.Done()
		for n := range ch {
			fmt.Println("收到:", n)
		}
	}()
	wg.Wait()

	bufCh := make(chan int, 10)
	wg.Add(2)

	go func() {
		defer wg.Done()
		for i := 1; i <= 100; i++ {
			bufCh <- i
		}
		close(bufCh)
	}()

	go func() {
		defer wg.Done()
		count := 0
		for n := range bufCh {
			count++
			if count <= 3 || count > 97 {
				fmt.Println("缓冲通道收到:", n)
			}
		}
		fmt.Println("缓冲通道共收到 100 个整数")
	}()
	wg.Wait()
}

// ========== 锁机制 ==========

func demoLock() {
	fmt.Println("\n=== 锁机制 ===")

	var mu sync.Mutex
	counter := 0
	var wg sync.WaitGroup

	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				mu.Lock()
				counter++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	fmt.Println("Mutex 计数器:", counter)

	var atomicCounter int64
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				atomic.AddInt64(&atomicCounter, 1)
			}
		}()
	}
	wg.Wait()
	fmt.Println("Atomic 计数器:", atomicCounter)
}
