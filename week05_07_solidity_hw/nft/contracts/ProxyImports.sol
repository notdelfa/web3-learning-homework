// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC1967Proxy as OZERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {TransparentUpgradeableProxy as OZTransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {ProxyAdmin as OZProxyAdmin} from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";

/// @dev 薄包装，便于 Hardhat 产出 artifact
contract ERC1967Proxy is OZERC1967Proxy {
    constructor(address implementation, bytes memory data) payable OZERC1967Proxy(implementation, data) {}
}

/// @dev 薄包装，便于 Hardhat 产出 artifact
contract TransparentUpgradeableProxy is OZTransparentUpgradeableProxy {
    constructor(
        address logic,
        address initialOwner,
        bytes memory data
    ) payable OZTransparentUpgradeableProxy(logic, initialOwner, data) {}
}

/// @dev 薄包装，便于 Hardhat 产出 artifact（Transparent 升级时使用）
contract ProxyAdmin is OZProxyAdmin {
    constructor(address initialOwner) OZProxyAdmin(initialOwner) {}
}
