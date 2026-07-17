// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IMockChainlink} from "./MockChainlink.sol";

/**
 * @title NFTAuctionBase
 * @dev 可升级拍卖逻辑（Transparent 代理直接使用本合约；UUPS 再包一层）
 */
contract NFTAuctionBase is Initializable, OwnableUpgradeable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev USD 统一用 8 位小数，例如 2000e8 = $2000
    uint8 public constant USD_DECIMALS = 8;

    struct Auction {
        address seller;
        address nft;
        uint256 tokenId;
        /// @dev address(0) 表示用 ETH 出价，否则为 ERC20 地址
        address paymentToken;
        uint256 highestBid;
        address highestBidder;
        uint256 endTime;
        bool settled;
    }

    uint256 public nextAuctionId;
    mapping(uint256 => Auction) public auctions;

    /// @dev paymentToken => 本地价格源；key 为 address(0) 表示 ETH/USD
    mapping(address => IMockChainlink) public priceFeeds;

    event PriceFeedUpdated(address indexed token, address indexed feed);
    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        address indexed nft,
        uint256 tokenId,
        address paymentToken,
        uint256 startingBid,
        uint256 startingBidUSD,
        uint256 endTime
    );
    event BidPlaced(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 amount,
        uint256 amountUSD
    );
    event AuctionSettled(
        uint256 indexed auctionId,
        address indexed winner,
        address indexed seller,
        uint256 amount,
        uint256 amountUSD
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address owner_) public initializer {
        __Ownable_init(owner_);
    }

    /// @notice 配置代币的本地 USD 价格源（token = address(0) 表示 ETH）
    function setPriceFeed(address token, address feed) external onlyOwner {
        require(feed != address(0), "feed = 0");
        priceFeeds[token] = IMockChainlink(feed);
        emit PriceFeedUpdated(token, feed);
    }

    /// @notice 读取代币相对 USD 的最新价格（保留 feed 原始小数位）
    function getTokenPrice(address token) public view returns (uint256 price, uint8 feedDecimals) {
        IMockChainlink feed = priceFeeds[token];
        require(address(feed) != address(0), "no price feed");

        (, int256 answer, , uint256 updatedAt, ) = feed.latestRoundData();
        require(answer > 0, "invalid price");
        require(updatedAt > 0, "stale price");

        price = uint256(answer);
        feedDecimals = feed.decimals();
    }

    /// @notice 将代币数量换算为 USD（固定 8 位小数，便于跨 ETH / ERC20 比较）
    function getAmountInUSD(address token, uint256 amount) public view returns (uint256) {
        (uint256 price, uint8 feedDecimals) = getTokenPrice(token);
        uint8 tokenDecimals = _tokenDecimals(token);
        return (amount * price * (10 ** USD_DECIMALS)) / (10 ** tokenDecimals) / (10 ** feedDecimals);
    }

    /// @notice 查询某场拍卖当前最高出价的 USD 价值
    function getHighestBidInUSD(uint256 auctionId) external view returns (uint256) {
        Auction storage a = auctions[auctionId];
        require(a.seller != address(0), "no auction");
        if (a.highestBid == 0) return 0;
        return getAmountInUSD(a.paymentToken, a.highestBid);
    }

    /// @notice 将 NFT 上架拍卖（需先 approve 本合约；该支付代币须已配置 price feed）
    function createAuction(
        address nft,
        uint256 tokenId,
        address paymentToken,
        uint256 startingBid,
        uint256 durationSeconds
    ) external returns (uint256 auctionId) {
        require(durationSeconds > 0, "duration = 0");
        require(address(priceFeeds[paymentToken]) != address(0), "no price feed");
        require(IERC721(nft).ownerOf(tokenId) == msg.sender, "not owner");

        IERC721(nft).transferFrom(msg.sender, address(this), tokenId);

        auctionId = nextAuctionId++;
        auctions[auctionId] = Auction({
            seller: msg.sender,
            nft: nft,
            tokenId: tokenId,
            paymentToken: paymentToken,
            highestBid: startingBid,
            highestBidder: address(0),
            endTime: block.timestamp + durationSeconds,
            settled: false
        });

        uint256 startingBidUSD = startingBid == 0 ? 0 : getAmountInUSD(paymentToken, startingBid);

        emit AuctionCreated(
            auctionId,
            msg.sender,
            nft,
            tokenId,
            paymentToken,
            startingBid,
            startingBidUSD,
            block.timestamp + durationSeconds
        );
    }

    /// @notice 出价：ETH 拍卖时附带 msg.value；ERC20 拍卖时传入 amount 并先 approve
    function bid(uint256 auctionId, uint256 amount) external payable nonReentrant {
        Auction storage a = auctions[auctionId];
        require(a.seller != address(0), "no auction");
        require(!a.settled, "settled");
        require(block.timestamp < a.endTime, "ended");

        uint256 bidAmount;
        if (a.paymentToken == address(0)) {
            require(msg.value > 0, "no ETH");
            require(amount == 0, "use msg.value");
            bidAmount = msg.value;
        } else {
            require(msg.value == 0, "no ETH for ERC20");
            require(amount > 0, "amount = 0");
            bidAmount = amount;
            IERC20(a.paymentToken).safeTransferFrom(msg.sender, address(this), bidAmount);
        }

        if (a.highestBidder == address(0)) {
            require(bidAmount >= a.highestBid, "below start");
        } else {
            require(bidAmount > a.highestBid, "bid too low");
            _refund(a.paymentToken, a.highestBidder, a.highestBid);
        }

        a.highestBid = bidAmount;
        a.highestBidder = msg.sender;

        emit BidPlaced(auctionId, msg.sender, bidAmount, getAmountInUSD(a.paymentToken, bidAmount));
    }

    /// @notice 拍卖结束后结算：最高价得 NFT，资金给卖家；无人出价则 NFT 退回卖家
    function endAuction(uint256 auctionId) external nonReentrant {
        Auction storage a = auctions[auctionId];
        require(a.seller != address(0), "no auction");
        require(!a.settled, "settled");
        require(block.timestamp >= a.endTime, "not ended");

        a.settled = true;

        if (a.highestBidder == address(0)) {
            IERC721(a.nft).transferFrom(address(this), a.seller, a.tokenId);
            emit AuctionSettled(auctionId, address(0), a.seller, 0, 0);
            return;
        }

        uint256 amountUSD = getAmountInUSD(a.paymentToken, a.highestBid);
        IERC721(a.nft).transferFrom(address(this), a.highestBidder, a.tokenId);
        _refund(a.paymentToken, a.seller, a.highestBid);

        emit AuctionSettled(auctionId, a.highestBidder, a.seller, a.highestBid, amountUSD);
    }

    function _tokenDecimals(address token) private view returns (uint8) {
        if (token == address(0)) return 18;
        return IERC20Metadata(token).decimals();
    }

    function _refund(address token, address to, uint256 amount) private {
        if (amount == 0) return;
        if (token == address(0)) {
            (bool ok, ) = payable(to).call{value: amount}("");
            require(ok, "ETH transfer failed");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
