import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { alchemy, sepolia } from '@account-kit/infra'

// WalletConnect projectId should be provided via env variable
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined
if (!walletConnectProjectId) {
  // Fail fast in development to ensure WalletConnect works properly
  if (import.meta.env.DEV) {
    throw new Error('VITE_WALLETCONNECT_PROJECT_ID is missing. Set it in frontend/.env')
  }
}

// Alchemy transport based on API key (no explicit URL)
const transports: Record<number, any> = {}
const alchemyApiKey = import.meta.env.VITE_ALCHEMY_API_KEY as string | undefined
if (!alchemyApiKey && import.meta.env.DEV) {
  throw new Error('VITE_ALCHEMY_API_KEY is missing. Set it in frontend/.env')
}
// Use Alchemy's chain helper so the transport validates rpcUrls.alchemy
transports[sepolia.id] = alchemy({ apiKey: alchemyApiKey! })

export const config = getDefaultConfig({
  appName: 'MessageVault',
  projectId: walletConnectProjectId!,
  chains: [sepolia],
  transports,
})