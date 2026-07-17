import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ETH = "0x0000000000000000000000000000000000000000";

/**
 * UUPS：ERC1967Proxy + NFTAuctionUUPS
 * 用户交互地址 = proxy；owner 通过 upgradeToAndCall 升级
 */
export default buildModule("NFTAuctionUUPSModule", (m) => {
  const owner = m.getAccount(0);

  const nft = m.contract("SimpleNFT");
  const mockToken = m.contract("MockERC20");
  const ethUsdFeed = m.contract("MockChainlink", [8, 2000n * 10n ** 8n], { id: "EthUsdFeed" });
  const tokenUsdFeed = m.contract("MockChainlink", [8, 1n * 10n ** 8n], { id: "TokenUsdFeed" });

  const impl = m.contract("NFTAuctionUUPS");
  const initData = m.encodeFunctionCall(impl, "initialize", [owner]);
  const proxy = m.contract("ERC1967Proxy", [impl, initData]);
  const auction = m.contractAt("NFTAuctionUUPS", proxy, { id: "AuctionUUPSProxy" });

  m.call(auction, "setPriceFeed", [ETH, ethUsdFeed], { id: "UUPS_SetEthUsdFeed" });
  m.call(auction, "setPriceFeed", [mockToken, tokenUsdFeed], { id: "UUPS_SetTokenUsdFeed" });

  return { nft, mockToken, ethUsdFeed, tokenUsdFeed, impl, proxy, auction };
});
