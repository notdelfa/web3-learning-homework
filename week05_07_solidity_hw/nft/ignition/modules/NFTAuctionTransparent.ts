import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ETH = "0x0000000000000000000000000000000000000000";

/**
 * Transparent：TransparentUpgradeableProxy + NFTAuctionBase
 * 用户交互地址 = proxy；ProxyAdmin.owner 通过 upgradeAndCall 升级
 */
export default buildModule("NFTAuctionTransparentModule", (m) => {
  const owner = m.getAccount(0);

  const nft = m.contract("SimpleNFT");
  const mockToken = m.contract("MockERC20");
  const ethUsdFeed = m.contract("MockChainlink", [8, 2000n * 10n ** 8n], { id: "EthUsdFeed" });
  const tokenUsdFeed = m.contract("MockChainlink", [8, 1n * 10n ** 8n], { id: "TokenUsdFeed" });

  const impl = m.contract("NFTAuctionBase");
  const initData = m.encodeFunctionCall(impl, "initialize", [owner]);
  const proxy = m.contract("TransparentUpgradeableProxy", [impl, owner, initData]);
  const auction = m.contractAt("NFTAuctionBase", proxy, { id: "AuctionTransparentProxy" });

  m.call(auction, "setPriceFeed", [ETH, ethUsdFeed], { id: "TP_SetEthUsdFeed" });
  m.call(auction, "setPriceFeed", [mockToken, tokenUsdFeed], { id: "TP_SetTokenUsdFeed" });

  return { nft, mockToken, ethUsdFeed, tokenUsdFeed, impl, proxy, auction };
});
