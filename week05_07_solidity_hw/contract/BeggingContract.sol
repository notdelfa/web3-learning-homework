// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title BeggingContract
 * @dev 讨饭合约：记录捐赠、允许所有者提取全部资金
 */
contract BeggingContract {
    address public owner;
    mapping(address => uint256) public donations;

    event Donated(address indexed donor, uint256 amount);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    /// @notice 向合约捐赠以太币
    function donate() public payable {
        require(msg.value > 0, "Must send ETH");
        donations[msg.sender] += msg.value;
        emit Donated(msg.sender, msg.value);
    }

    /// @notice 合约所有者提取全部捐赠资金
    function withdraw() public onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");
        (bool success, ) = payable(owner).call{value: balance}("");
        require(success, "Transfer failed");
    }

    /// @notice 查询某地址的累计捐赠金额
    function getDonation(address donor) public view returns (uint256) {
        return donations[donor];
    }
}
