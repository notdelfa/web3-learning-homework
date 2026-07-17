// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {NFTAuctionBase} from "./NFTAuctionBase.sol";

/**
 * @title NFTAuctionBaseV2
 * @dev Transparent 代理升级目标：仅新增 version() 演示逻辑升级
 */
contract NFTAuctionBaseV2 is NFTAuctionBase {
    function version() external pure virtual returns (string memory) {
        return "2.0.0";
    }
}
