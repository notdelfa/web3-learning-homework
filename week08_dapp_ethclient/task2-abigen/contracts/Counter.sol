// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

// 简单计数器：供 abigen 生成 Go 绑定后调用
contract Counter {
    uint256 public number; // public 自动生成 number() getter

    // 直接设置计数
    function setNumber(uint256 newNumber) public {
        number = newNumber;
    }

    // 计数 +1（作业示例写调用）
    function increment() public {
        number++;
    }
}
