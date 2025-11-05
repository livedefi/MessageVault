import { network } from 'hardhat'

async function main() {
  const vaultAddr = process.env.VITE_MESSAGE_VAULT_ADDRESS || '0xa00D6b3429fa17b2FA15D1b3A1be9355Db5160f8'
  const entryPointAddr = '0x0000000071727De22E5E9d8BAf0edAc6f37da032'

  const { ethers } = await network.connect()

  // Minimal EntryPoint ABI
  const entryPointABI = [
    'function balanceOf(address account) view returns (uint256)',
    'function getNonce(address sender, uint192 key) view returns (uint256)'
  ]

  const entryPointContract = new ethers.Contract(entryPointAddr, entryPointABI, ethers.provider)

  console.log('🔍 Checking Account Abstraction requirements...\n')

  try {
    // 1️⃣ Check MessageVault deployment
    console.log('1️⃣ Checking MessageVault deployment...')
    const code = await ethers.provider.getCode(vaultAddr)
    if (!code || code === '0x') {
      console.log('❌ MessageVault is NOT deployed at:', vaultAddr)
      return
    }
    console.log('✅ MessageVault is deployed')

    // 2️⃣ Check EntryPoint deposit
    console.log('\n2️⃣ Checking EntryPoint deposit...')
    const balance = await entryPointContract.balanceOf(vaultAddr)
    const balanceEth = ethers.formatEther(balance)
    console.log(`💰 Current deposit: ${balanceEth} ETH`)

    const minRequired = 0.1
    if (parseFloat(balanceEth) < minRequired) {
      console.log(`❌ Insufficient deposit. Minimum required: ${minRequired} ETH`)
      console.log('💡 To deposit, call entryPoint.depositTo(vaultAddr) with value')
    } else {
      console.log('✅ Sufficient deposit')
    }

    // 3️⃣ Check nonce
    console.log('\n3️⃣ Checking nonce...')
    const nonce = await entryPointContract.getNonce(vaultAddr, 0)
    console.log(`🔢 Current nonce: ${nonce.toString()}`)

    // 4️⃣ Check MessageVault ETH balance
    console.log('\n4️⃣ Checking MessageVault ETH balance...')
    const ethBalance = await ethers.provider.getBalance(vaultAddr)
    const ethBalanceFormatted = ethers.formatEther(ethBalance)
    console.log(`💎 ETH balance: ${ethBalanceFormatted} ETH`)

    // 5️⃣ Check network configuration
    console.log('\n5️⃣ Checking network configuration...')
    const networkInfo = await ethers.provider.getNetwork()
    const chainId = Number(networkInfo.chainId)
    console.log(`🌐 Chain ID: ${chainId} (Sepolia: 11155111)`)

    if (chainId !== 11155111) {
      console.log('❌ Incorrect Chain ID. Must be Sepolia (11155111)')
    } else {
      console.log('✅ Correct Chain ID')
    }

    // 📋 Summary
    console.log('\n📋 SUMMARY:')
    console.log(`- MessageVault: ${vaultAddr}`)
    console.log(`- EntryPoint: ${entryPointAddr}`)
    console.log(`- Deposit: ${balanceEth} ETH ${parseFloat(balanceEth) >= minRequired ? '✅' : '❌'}`)
    console.log(`- Nonce: ${nonce.toString()}`)
    console.log(`- ETH balance: ${ethBalanceFormatted} ETH`)
  } catch (error: any) {
    console.error('❌ Error checking requirements:', error?.message || error)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})