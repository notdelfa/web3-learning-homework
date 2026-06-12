package main

import (
	"fmt"
	"sort"
)

func main() {
	fmt.Println("=== 控制流程 ===")
	fmt.Println("只出现一次的数字:", singleNumber([]int{4, 1, 2, 1, 2}))
	fmt.Println("回文数 121:", isPalindrome(121))

	fmt.Println("\n=== 字符串 ===")
	fmt.Println("有效括号 ()[]{}:", isValid("()[]{}"))
	fmt.Println("最长公共前缀:", longestCommonPrefix([]string{"flower", "flow", "flight"}))

	fmt.Println("\n=== 基础 ===")
	fmt.Println("加一:", plusOne([]int{9, 9}))
	fmt.Println("两数之和:", twoSum([]int{2, 7, 11, 15}, 9))

	fmt.Println("\n=== 切片 ===")
	nums := []int{0, 0, 1, 1, 1, 2, 2, 3}
	n := removeDuplicates(nums)
	fmt.Println("去重后长度:", n, "数组:", nums[:n])
	fmt.Println("合并区间:", mergeIntervals([][]int{{1, 3}, {2, 6}, {8, 10}, {15, 18}}))
}

// --- 控制流程 ---

// singleNumber 找出只出现一次的数字
func singleNumber(nums []int) int {
	count := make(map[int]int)
	for _, n := range nums {
		count[n]++
	}
	for n, c := range count {
		if c == 1 {
			return n
		}
	}
	return 0
}

// isPalindrome 判断整数是否为回文数
func isPalindrome(x int) bool {
	if x < 0 {
		return false
	}
	orig, rev := x, 0
	for x > 0 {
		rev = rev*10 + x%10
		x /= 10
	}
	return orig == rev
}

// --- 字符串 ---

// isValid 判断括号字符串是否有效
func isValid(s string) bool {
	stack := []byte{}
	pair := map[byte]byte{')': '(', '}': '{', ']': '['}
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c == '(' || c == '{' || c == '[' {
			stack = append(stack, c)
			continue
		}
		if len(stack) == 0 || stack[len(stack)-1] != pair[c] {
			return false
		}
		stack = stack[:len(stack)-1]
	}
	return len(stack) == 0
}

// longestCommonPrefix 找最长公共前缀
func longestCommonPrefix(strs []string) string {
	if len(strs) == 0 {
		return ""
	}
	prefix := strs[0]
	for _, s := range strs[1:] {
		for len(prefix) > 0 && !hasPrefix(s, prefix) {
			prefix = prefix[:len(prefix)-1]
		}
	}
	return prefix
}

func hasPrefix(s, prefix string) bool {
	return len(s) >= len(prefix) && s[:len(prefix)] == prefix
}

// --- 基础 ---

// plusOne 数组表示的非负整数加一
func plusOne(digits []int) []int {
	for i := len(digits) - 1; i >= 0; i-- {
		if digits[i] < 9 {
			digits[i]++
			return digits
		}
		digits[i] = 0
	}
	return append([]int{1}, digits...)
}

// twoSum 找两数之和等于 target 的下标
func twoSum(nums []int, target int) []int {
	seen := make(map[int]int)
	for i, n := range nums {
		if j, ok := seen[target-n]; ok {
			return []int{j, i}
		}
		seen[n] = i
	}
	return nil
}

// --- 切片 ---

// removeDuplicates 原地删除有序数组重复项
func removeDuplicates(nums []int) int {
	if len(nums) == 0 {
		return 0
	}
	i := 0
	for j := 1; j < len(nums); j++ {
		if nums[j] != nums[i] {
			i++
			nums[i] = nums[j]
		}
	}
	return i + 1
}

// mergeIntervals 合并重叠区间
func mergeIntervals(intervals [][]int) [][]int {
	if len(intervals) == 0 {
		return nil
	}
	sort.Slice(intervals, func(i, j int) bool {
		return intervals[i][0] < intervals[j][0]
	})
	result := [][]int{intervals[0]}
	for _, cur := range intervals[1:] {
		last := result[len(result)-1]
		if cur[0] <= last[1] {
			if cur[1] > last[1] {
				last[1] = cur[1]
			}
			continue
		}
		result = append(result, cur)
	}
	return result
}
