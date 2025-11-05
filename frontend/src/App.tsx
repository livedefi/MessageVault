import logoUrl from './assets/messagevault-logo.svg'
import WalletButton from './components/WalletButton'
import NetworkGuard from './components/NetworkGuard'
import Toasts from './components/Toasts'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { sepolia } from 'wagmi/chains'
// import { useEffect } from 'react'
import { useNetworkGuard } from './hooks/useNetworkGuard'
import MessageComposer from './components/MessageComposer'
import MessageList from './components/MessageList'
import { useGraphMessages } from './hooks/useGraphMessages'

function App() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { isPending: isSwitching } = useSwitchChain()
  const isWrongNetwork = isConnected && chainId !== sepolia.id
  const { toasts, pushToast, showNetworkCard, switchOrAddSepolia } = useNetworkGuard(
    isConnected,
    isWrongNetwork,
    isSwitching,
  )
  const { messages, loading, error, refresh } = useGraphMessages()

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-10 bg-neutral-900/70 backdrop-blur border-b border-neutral-800">
        <div className="mx-auto max-w-7xl h-16 px-6 flex items-center">
          {/* Brand symbol and wordmark */}
          <div className="flex items-center gap-4">
            <img src={logoUrl} alt="MessageVault logo" className="h-11 md:h-12 w-auto shrink-0" />
            <span className="hidden sm:inline-flex items-center text-xl md:text-2xl font-semibold tracking-tight leading-tight select-none">
              <span className="text-indigo-400">Message</span>
              <span className="text-violet-400">Vault</span>
            </span>
          </div>
          {/* Connect wallet button in header only when connected and on Sepolia */}
          {isConnected && !isWrongNetwork && (
            <div className="ml-auto">
              <WalletButton variant="compact" />
            </div>
          )}
        </div>
        {/* Brand accent divider below header */}
        <div className="h-[1px] w-full bg-gradient-to-r from-indigo-500 via-cyan-400 to-violet-500/80" />
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 pt-24 min-h-[calc(100vh-5rem)] flex items-center justify-center">
        {!isConnected ? (
          // Welcome card centered when disconnected
          <div className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900/70 backdrop-blur p-6 shadow-lg">
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight bg-gradient-to-r from-indigo-400 via-sky-300 to-violet-400 bg-clip-text text-transparent mb-3">
              Welcome
            </h1>
            <p className="text-neutral-300 text-sm sm:text-base leading-relaxed mb-6">
              MessageVault is a dApp to securely store and retrieve messages on the blockchain. Connect your wallet to access features.
            </p>
            <div className="flex justify-end">
              <WalletButton />
              </div>
          </div>
        ) : isWrongNetwork && showNetworkCard ? (
          <NetworkGuard isSwitching={isSwitching} onSwitch={switchOrAddSepolia} pushToast={pushToast} />
        ) : (
          // Real dApp content when connected
          <div className="w-full">
            <section className="mx-auto max-w-3xl space-y-6">
              <h2 className="text-2xl font-semibold">MessageVault</h2>
              <MessageComposer pushToast={pushToast} onSentSuccess={refresh} />
              {error ? (
                <div className="rounded-md border border-rose-700 bg-rose-900/40 p-3 text-rose-100">
                  {error}
                </div>
              ) : loading ? (
                <div className="rounded-md border border-neutral-800 bg-neutral-900/60 p-3 text-neutral-300">
                  Loading messages…
                </div>
              ) : (
                <MessageList messages={messages} />
              )}
            </section>
          </div>
        )}
      </main>

      <Toasts toasts={toasts} />
    </div>
  )
}

export default App
