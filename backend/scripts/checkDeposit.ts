import { network } from "hardhat";

async function main() {
  const vaultAddr = process.env.VITE_MESSAGE_VAULT_ADDRESS || "0xCe9b638A4A3f5901D17Aa1b92b0A62CAb2E774B0";
  const entryPointAddrDefault = "0x0000000071727De22E5E9d8BAf0edAc6f37da032"; // v0.7

  const { ethers } = await network.connect();
  const vault = await ethers.getContractAt("MessageVault", vaultAddr);

  // Minimal ABI for EntryPoint.balanceOf(address)
  const epAbi = [
    {
      type: "function",
      name: "balanceOf",
      stateMutability: "view",
      inputs: [{ name: "account", type: "address" }],
      outputs: [{ name: "", type: "uint256" }],
    },
  ];

  const epFromVault = await vault.entryPoint();
  const entryPointAddr = epFromVault && epFromVault !== "0x0000000000000000000000000000000000000000"
    ? epFromVault
    : entryPointAddrDefault;
  const ep = new ethers.Contract(entryPointAddr, epAbi, ethers.provider);

  const epBalViaVault = await vault.entryPointBalance();
  const epBalDirect = await ep.balanceOf(vaultAddr);

  console.log("EntryPoint set on vault:", epFromVault);
  console.log("EntryPoint (used):", entryPointAddr);
  console.log("EntryPoint balance via vault:", epBalViaVault.toString());
  console.log("EntryPoint balance direct:", epBalDirect.toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});