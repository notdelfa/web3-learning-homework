// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title SimpleNFT
 * @dev 极简 ERC721：支持铸造与标准转移（transferFrom / safeTransferFrom）
 */
contract SimpleNFT is ERC721 {
    uint256 private _nextTokenId;

    constructor() ERC721("SimpleNFT", "SNFT") {}

    /// @notice 铸造一枚 NFT 给指定地址，返回 tokenId
    function mint(address to) external returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
    }
}
