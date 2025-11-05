import { ConnectButton } from '@rainbow-me/rainbowkit'
import type { ReactNode } from 'react'

type WalletButtonProps = {
  variant?: 'default' | 'compact'
}

export default function WalletButton({ variant = 'default' }: WalletButtonProps) {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        authenticationStatus,
        mounted,
      }) => {
        const ready = mounted && authenticationStatus !== 'loading'
        const connected = ready && account && chain

        const basePrimary =
          'inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium ' +
          'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm ring-1 ring-indigo-400/20 ' +
          'focus:outline-none focus:ring-2 focus:ring-indigo-400/40 transition select-none'

        const baseSecondary =
          'inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs ' +
          'bg-neutral-800 hover:bg-neutral-700 text-neutral-100 border border-neutral-700 ' +
          'focus:outline-none focus:ring-2 focus:ring-neutral-600/40 transition select-none'

        const accountChip = (
          <button onClick={openAccountModal} type="button" className={baseSecondary}>
            {account?.ensAvatar ? (
              <img src={account.ensAvatar} alt="avatar" className="h-4 w-4 rounded-full" />
            ) : (
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-neutral-600 text-[10px]">@</span>
            )}
            <span className="max-w-[120px] truncate">{account?.displayName}</span>
            {account?.displayBalance && (variant === 'default' || variant === 'compact') ? (
              <span className="hidden md:inline text-neutral-300">{account.displayBalance}</span>
            ) : null}
          </button>
        )

        const chainBadge = chain?.unsupported ? (
          <button onClick={openChainModal} type="button" className={baseSecondary}>
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[10px]">!</span>
            <span>Wrong network</span>
          </button>
        ) : (
          <button onClick={openChainModal} type="button" className={baseSecondary}>
            {chain?.hasIcon && chain?.iconUrl ? (
              <img alt={chain.name ?? 'chain'} src={chain.iconUrl} className="h-4 w-4 rounded" />
            ) : (
              <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-neutral-600 text-[10px]">⛓</span>
            )}
            {variant === 'default' && chain?.name ? <span className="hidden sm:inline">{chain.name}</span> : null}
            {variant === 'compact' && chain?.name ? <span className="hidden lg:inline">{chain.name}</span> : null}
          </button>
        )

        let content: ReactNode
        if (!ready) {
          content = <div aria-hidden className="opacity-0 pointer-events-none" />
        } else if (!connected) {
          content = (
            <button onClick={openConnectModal} type="button" className={basePrimary}>
              <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-indigo-500/70">🔑</span>
              <span>Connect wallet</span>
            </button>
          )
        } else {
          content = (
            <div className="inline-flex items-center gap-2">
              {chainBadge}
              {accountChip}
            </div>
          )
        }

        return <div className="inline-flex items-center">{content}</div>
      }}
    </ConnectButton.Custom>
  )
}