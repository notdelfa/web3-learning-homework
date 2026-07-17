// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {SimpleNFT} from "./SimpleNFT.sol";
import {MockERC20} from "./MockERC20.sol";
import {MockChainlink} from "./MockChainlink.sol";
import {NFTAuctionBase} from "./NFTAuctionBase.sol";
import {NFTAuctionUUPS} from "./NFTAuctionUUPS.sol";
import {NFTAuctionUUPSV2} from "./NFTAuctionUUPSV2.sol";

/// @dev Solidity 单元测试：合约逻辑、边界与 revert
contract NFTAuctionUnitTest is Test {
    SimpleNFT nft;
    MockERC20 token;
    MockChainlink ethUsdFeed;
    MockChainlink tokenUsdFeed;
    NFTAuctionUUPS auction;

    address owner = address(this);
    address seller = address(0xA11CE);
    address bidder1 = address(0xB0B);
    address bidder2 = address(0xCAFE);
    address stranger = address(0xBAD);

    int256 constant ETH_USD = 2000e8;
    int256 constant TOKEN_USD = 1e8;

    function setUp() public {
        nft = new SimpleNFT();
        token = new MockERC20();
        ethUsdFeed = new MockChainlink(8, ETH_USD);
        tokenUsdFeed = new MockChainlink(8, TOKEN_USD);

        NFTAuctionUUPS impl = new NFTAuctionUUPS();
        bytes memory initData = abi.encodeCall(NFTAuctionBase.initialize, (owner));
        auction = NFTAuctionUUPS(payable(address(new ERC1967Proxy(address(impl), initData))));

        auction.setPriceFeed(address(0), address(ethUsdFeed));
        auction.setPriceFeed(address(token), address(tokenUsdFeed));

        vm.deal(bidder1, 100 ether);
        vm.deal(bidder2, 100 ether);

        vm.prank(seller);
        nft.mint(seller);
    }

    // ─── SimpleNFT / Mock ───────────────────────────────────────────

    function test_SimpleNFT_MintIncrementsId() public {
        vm.prank(seller);
        uint256 id1 = nft.mint(seller);
        vm.prank(seller);
        uint256 id2 = nft.mint(bidder1);
        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(nft.ownerOf(1), seller);
        assertEq(nft.ownerOf(2), bidder1);
    }

    function test_MockChainlink_UpdateAnswer() public {
        ethUsdFeed.updateAnswer(2500e8);
        (uint256 price, uint8 dec) = auction.getTokenPrice(address(0));
        assertEq(price, 2500e8);
        assertEq(dec, 8);
        assertEq(auction.getAmountInUSD(address(0), 1 ether), 2500e8);
    }

    // ─── initialize / ownership ─────────────────────────────────────

    function test_CannotReinitialize() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        auction.initialize(stranger);
    }

    function test_SetPriceFeed_OnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, stranger)
        );
        auction.setPriceFeed(address(0), address(ethUsdFeed));
    }

    function test_SetPriceFeed_RejectZeroFeed() public {
        vm.expectRevert(bytes("feed = 0"));
        auction.setPriceFeed(address(0), address(0));
    }

    // ─── price feeds ────────────────────────────────────────────────

    function test_GetTokenPrice_NoFeed() public {
        vm.expectRevert(bytes("no price feed"));
        auction.getTokenPrice(address(0xDEAD));
    }

    function test_GetTokenPrice_InvalidPrice() public {
        ethUsdFeed.updateAnswer(0);
        vm.expectRevert(bytes("invalid price"));
        auction.getTokenPrice(address(0));
    }

    function test_GetHighestBidInUSD_NoAuction() public {
        vm.expectRevert(bytes("no auction"));
        auction.getHighestBidInUSD(99);
    }

    function test_GetHighestBidInUSD_ZeroWhenNoBidYet() public {
        vm.startPrank(seller);
        nft.approve(address(auction), 0);
        // startingBid = 0 → highestBid=0, highestBidder=0 → USD = 0
        uint256 id = auction.createAuction(address(nft), 0, address(0), 0, 1 hours);
        vm.stopPrank();
        assertEq(auction.getHighestBidInUSD(id), 0);
    }

    // ─── createAuction ──────────────────────────────────────────────

    function test_CreateAuction_DurationZero() public {
        vm.startPrank(seller);
        nft.approve(address(auction), 0);
        vm.expectRevert(bytes("duration = 0"));
        auction.createAuction(address(nft), 0, address(0), 1 ether, 0);
        vm.stopPrank();
    }

    function test_CreateAuction_NoPriceFeed() public {
        address unknownToken = address(0x1111);
        vm.startPrank(seller);
        nft.approve(address(auction), 0);
        vm.expectRevert(bytes("no price feed"));
        auction.createAuction(address(nft), 0, unknownToken, 1, 1 hours);
        vm.stopPrank();
    }

    function test_CreateAuction_NotOwner() public {
        vm.prank(stranger);
        vm.expectRevert(bytes("not owner"));
        auction.createAuction(address(nft), 0, address(0), 1 ether, 1 hours);
    }

    // ─── bid ────────────────────────────────────────────────────────

    function test_Bid_NoAuction() public {
        vm.prank(bidder1);
        vm.expectRevert(bytes("no auction"));
        auction.bid{value: 1 ether}(99, 0);
    }

    function test_Bid_Ended() public {
        vm.startPrank(seller);
        nft.approve(address(auction), 0);
        uint256 id = auction.createAuction(address(nft), 0, address(0), 1 ether, 1 hours);
        vm.stopPrank();

        vm.warp(block.timestamp + 1 hours);
        vm.prank(bidder1);
        vm.expectRevert(bytes("ended"));
        auction.bid{value: 1 ether}(id, 0);
    }

    function test_Bid_EthRequiresValue() public {
        vm.startPrank(seller);
        nft.approve(address(auction), 0);
        uint256 id = auction.createAuction(address(nft), 0, address(0), 0, 1 hours);
        vm.stopPrank();

        vm.prank(bidder1);
        vm.expectRevert(bytes("no ETH"));
        auction.bid(id, 0);
    }

    function test_Bid_EthRejectsAmountArg() public {
        vm.startPrank(seller);
        nft.approve(address(auction), 0);
        uint256 id = auction.createAuction(address(nft), 0, address(0), 0, 1 hours);
        vm.stopPrank();

        vm.prank(bidder1);
        vm.expectRevert(bytes("use msg.value"));
        auction.bid{value: 1 ether}(id, 1);
    }

    function test_Bid_Erc20RejectsEth() public {
        token.mint(bidder1, 1000e18);
        vm.startPrank(seller);
        nft.approve(address(auction), 0);
        uint256 id = auction.createAuction(address(nft), 0, address(token), 0, 1 hours);
        vm.stopPrank();

        vm.prank(bidder1);
        vm.expectRevert(bytes("no ETH for ERC20"));
        auction.bid{value: 1 ether}(id, 100e18);
    }

    function test_Bid_Erc20AmountZero() public {
        vm.startPrank(seller);
        nft.approve(address(auction), 0);
        uint256 id = auction.createAuction(address(nft), 0, address(token), 0, 1 hours);
        vm.stopPrank();

        vm.prank(bidder1);
        vm.expectRevert(bytes("amount = 0"));
        auction.bid(id, 0);
    }

    function test_Bid_BelowStart() public {
        vm.startPrank(seller);
        nft.approve(address(auction), 0);
        uint256 id = auction.createAuction(address(nft), 0, address(0), 2 ether, 1 hours);
        vm.stopPrank();

        vm.prank(bidder1);
        vm.expectRevert(bytes("below start"));
        auction.bid{value: 1 ether}(id, 0);
    }

    function test_Bid_TooLow() public {
        vm.startPrank(seller);
        nft.approve(address(auction), 0);
        uint256 id = auction.createAuction(address(nft), 0, address(0), 1 ether, 1 hours);
        vm.stopPrank();

        vm.prank(bidder1);
        auction.bid{value: 1 ether}(id, 0);

        vm.prank(bidder2);
        vm.expectRevert(bytes("bid too low"));
        auction.bid{value: 1 ether}(id, 0);
    }

    function test_Bid_AfterSettled() public {
        vm.startPrank(seller);
        nft.approve(address(auction), 0);
        uint256 id = auction.createAuction(address(nft), 0, address(0), 0, 1 hours);
        vm.stopPrank();

        vm.prank(bidder1);
        auction.bid{value: 1 ether}(id, 0);

        vm.warp(block.timestamp + 1 hours);
        auction.endAuction(id);

        vm.deal(bidder2, 10 ether);
        vm.prank(bidder2);
        vm.expectRevert(bytes("settled"));
        auction.bid{value: 2 ether}(id, 0);
    }

    // ─── endAuction ─────────────────────────────────────────────────

    function test_EndAuction_NoAuction() public {
        vm.expectRevert(bytes("no auction"));
        auction.endAuction(99);
    }

    function test_EndAuction_NotEnded() public {
        vm.startPrank(seller);
        nft.approve(address(auction), 0);
        uint256 id = auction.createAuction(address(nft), 0, address(0), 0, 1 days);
        vm.stopPrank();

        vm.expectRevert(bytes("not ended"));
        auction.endAuction(id);
    }

    function test_EndAuction_AlreadySettled() public {
        vm.startPrank(seller);
        nft.approve(address(auction), 0);
        uint256 id = auction.createAuction(address(nft), 0, address(0), 0, 1 hours);
        vm.stopPrank();

        vm.warp(block.timestamp + 1 hours);
        auction.endAuction(id);

        vm.expectRevert(bytes("settled"));
        auction.endAuction(id);
    }

    // ─── happy paths (unit-level) ───────────────────────────────────

    function test_EthAuction_RefundAndSettle() public {
        vm.startPrank(seller);
        nft.approve(address(auction), 0);
        uint256 id = auction.createAuction(address(nft), 0, address(0), 1 ether, 1 days);
        vm.stopPrank();

        vm.prank(bidder1);
        auction.bid{value: 1 ether}(id, 0);
        assertEq(auction.getHighestBidInUSD(id), 2000e8);

        vm.prank(bidder2);
        auction.bid{value: 2 ether}(id, 0);
        assertEq(bidder1.balance, 100 ether);
        assertEq(auction.getHighestBidInUSD(id), 4000e8);

        vm.warp(block.timestamp + 1 days);
        auction.endAuction(id);

        assertEq(nft.ownerOf(0), bidder2);
        assertEq(seller.balance, 2 ether);
        (,,,,, address highestBidder,, bool settled) = auction.auctions(id);
        assertTrue(settled);
        assertEq(highestBidder, bidder2);
    }

    function test_Erc20Auction_RefundAndSettle() public {
        token.mint(bidder1, 1000e18);
        token.mint(bidder2, 1000e18);

        vm.startPrank(seller);
        nft.approve(address(auction), 0);
        uint256 id = auction.createAuction(address(nft), 0, address(token), 100e18, 1 days);
        vm.stopPrank();

        vm.startPrank(bidder1);
        token.approve(address(auction), 100e18);
        auction.bid(id, 100e18);
        vm.stopPrank();

        vm.startPrank(bidder2);
        token.approve(address(auction), 200e18);
        auction.bid(id, 200e18);
        vm.stopPrank();

        assertEq(token.balanceOf(bidder1), 1000e18);

        vm.warp(block.timestamp + 1 days);
        auction.endAuction(id);

        assertEq(nft.ownerOf(0), bidder2);
        assertEq(token.balanceOf(seller), 200e18);
    }

    function test_NoBidReturnsNft() public {
        vm.startPrank(seller);
        nft.approve(address(auction), 0);
        uint256 id = auction.createAuction(address(nft), 0, address(0), 1 ether, 1 hours);
        vm.stopPrank();

        vm.warp(block.timestamp + 1 hours);
        auction.endAuction(id);
        assertEq(nft.ownerOf(0), seller);
    }

    // ─── UUPS upgrade ───────────────────────────────────────────────

    function test_UUPS_UpgradePreservesState() public {
        vm.startPrank(seller);
        nft.approve(address(auction), 0);
        auction.createAuction(address(nft), 0, address(0), 1 ether, 1 days);
        vm.stopPrank();

        vm.prank(bidder1);
        auction.bid{value: 1 ether}(0, 0);

        NFTAuctionUUPSV2 implV2 = new NFTAuctionUUPSV2();
        auction.upgradeToAndCall(address(implV2), "");

        NFTAuctionUUPSV2 auctionV2 = NFTAuctionUUPSV2(payable(address(auction)));
        assertEq(auctionV2.version(), "2.0.0");
        assertEq(auctionV2.nextAuctionId(), 1);
        assertEq(auctionV2.getHighestBidInUSD(0), 2000e8);
    }

    function test_UUPS_UpgradeOnlyOwner() public {
        NFTAuctionUUPSV2 implV2 = new NFTAuctionUUPSV2();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, stranger)
        );
        auction.upgradeToAndCall(address(implV2), "");
    }

    function test_UUPS_CanSettleAfterUpgrade() public {
        vm.startPrank(seller);
        nft.approve(address(auction), 0);
        uint256 id = auction.createAuction(address(nft), 0, address(0), 0, 1 hours);
        vm.stopPrank();

        vm.prank(bidder1);
        auction.bid{value: 1 ether}(id, 0);

        auction.upgradeToAndCall(address(new NFTAuctionUUPSV2()), "");

        vm.warp(block.timestamp + 1 hours);
        NFTAuctionUUPSV2(payable(address(auction))).endAuction(id);
        assertEq(nft.ownerOf(0), bidder1);
        assertEq(seller.balance, 1 ether);
    }
}
