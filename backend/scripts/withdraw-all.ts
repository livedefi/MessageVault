import { network } from 'hardhat'

async function main() {
  const vaultAddr = process.env.VITE_MESSAGE_VAULT_ADDRESS || process.env.MESSAGE_VAULT_ADDRESS
  const ENTRYPOINT_V07 = '0x0000000071727De22E5E9d8BAf0edAc6f37da032'

  if (!vaultAddr) {
    throw new Error('MESSAGE_VAULT_ADDRESS is not set in .env')
  }

  const { ethers } = await network.connect()
  const [signer] = await ethers.getSigners()

  const vaultABI = [
    'function owner() view returns (address)',
    'function entryPoint() view returns (address)',
    'function withdrawDepositTo(address payable to, uint256 amount) external'
  ]
  const entryPointABI = [
    'function balanceOf(address account) view returns (uint256)'
  ]

  const vault = new ethers.Contract(vaultAddr, vaultABI, signer)
  const entryPoint = new ethers.Contract(ENTRYPOINT_V07, entryPointABI, ethers.provider)

  console.log('💸 Draining EntryPoint v0.7 deposit…')
  console.log(`- Vault: ${vaultAddr}`)
  console.log(`- EntryPoint v0.7: ${ENTRYPOINT_V07}`)
  console.log(`- Withdraw to: ${signer.address}`)

  // Owner check
  const owner = await vault.owner()
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    console.log(`❌ You are not the owner. Current owner: ${owner}`)
    return
  }
  console.log('✅ You are the MessageVault owner')

  // EntryPoint configured check
  const ep = await vault.entryPoint()
  if (ep.toLowerCase() !== ENTRYPOINT_V07.toLowerCase()) {
    console.log(`⚠️ Vault uses a different EntryPoint (${ep}). Withdrawal operates against the EntryPoint configured on the vault.`)
  }

  // Balance in EntryPoint
  const balance = await entryPoint.balanceOf(vaultAddr)
  const balanceEth = ethers.formatEther(balance)
  console.log(`💰 Available balance in EntryPoint: ${balanceEth} ETH`)
  if (balance === 0n) {
    console.log('ℹ️ No ETH to withdraw')
    return
  }

  // Withdraw all
  console.log('⏳ Sending withdrawDepositTo…')
  const tx = await vault.withdrawDepositTo(signer.address, balance)
  console.log(`📝 Tx: ${tx.hash}`)
  const rcpt = await tx.wait()
  if (rcpt.status !== 1) {
    console.log('❌ Transaction failed')
    return
  }

  console.log(`✅ Withdrawal complete: ${balanceEth} ETH`) 
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})