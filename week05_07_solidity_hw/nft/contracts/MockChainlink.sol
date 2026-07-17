// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IMockChainlink
 * @dev 本地价格源接口（仅用于 MockChainlink）
 */
interface IMockChainlink {
    function decimals() external view returns (uint8);

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

/**
 * @title MockChainlink
 * @dev 本地模拟 Chainlink 价格预言机，可手动设定 USD 价格
 */
contract MockChainlink is IMockChainlink {
    uint8 public immutable override decimals;
    int256 private _answer;
    uint256 private _updatedAt;

    constructor(uint8 decimals_, int256 initialAnswer) {
        decimals = decimals_;
        _answer = initialAnswer;
        _updatedAt = block.timestamp;
    }

    function updateAnswer(int256 newAnswer) external {
        _answer = newAnswer;
        _updatedAt = block.timestamp;
    }

    function latestRoundData()
        external
        view
        override
        returns (uint80, int256 answer, uint256, uint256 updatedAt, uint80)
    {
        return (1, _answer, _updatedAt, _updatedAt, 1);
    }
}
