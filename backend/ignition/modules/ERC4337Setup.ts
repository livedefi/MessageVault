import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("ERC4337Setup", (m) => {
  // Parameters (full setup)
  const ENTRYPOINT_ADDRESS = m.getParameter("ENTRYPOINT_ADDRESS");
  const owner = m.getAccount(0);
  const MV_DEPOSIT_ETH = m.getParameter("MV_DEPOSIT_ETH", 0n);

  // Paymaster removed: module now only configures the wallet account

  // Wallet setup submodule to enforce order: setEntryPoint before addDeposit
  const walletSetup = m.useModule(
    buildModule("WalletSetup", (s) => {
      const wallet = s.contract("MessageVault", [owner]);
      s.call(wallet, "setEntryPoint", [ENTRYPOINT_ADDRESS], { from: owner });
      return { wallet };
    })
  );

  // With submodule dependency, addDeposit runs after WalletSetup completes
  m.call(walletSetup.wallet, "addDeposit", [], { value: MV_DEPOSIT_ETH, from: owner });

  return { wallet: walletSetup.wallet };
});