// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {NFTAuctionBaseV2} from "./NFTAuctionBaseV2.sol";

/**
 * @title NFTAuctionUUPSV2
 * @dev UUPS 升级目标：V2 业务 + UUPS 升级权限
 */
contract NFTAuctionUUPSV2 is NFTAuctionBaseV2, UUPSUpgradeable {
    function _authorizeUpgrade(address) internal override onlyOwner {}
}
