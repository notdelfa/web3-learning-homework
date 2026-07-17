// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {NFTAuctionBase} from "./NFTAuctionBase.sol";

/**
 * @title NFTAuctionUUPS
 * @dev UUPS 可升级拍卖：由 owner 调用 upgradeToAndCall
 */
contract NFTAuctionUUPS is NFTAuctionBase, UUPSUpgradeable {
    function _authorizeUpgrade(address) internal override onlyOwner {}
}
