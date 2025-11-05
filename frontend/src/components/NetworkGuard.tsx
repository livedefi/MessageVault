type Props = {
  isSwitching: boolean
  onSwitch: () => Promise<boolean>
  pushToast: (type: 'info' | 'success' | 'error', message: string) => void
}

export default function NetworkGuard({ isSwitching, onSwitch, pushToast }: Props) {
  return (
    <div className="w-full max-w-md rounded-xl border border-yellow-700/60 bg-yellow-900/30 backdrop-blur p-6 shadow-lg">
      <h2 className="text-2xl font-semibold mb-2 text-yellow-200">Wrong network</h2>
      <p className="text-yellow-100/90 mb-4">
        You are connected, but not to <span className="font-semibold">Sepolia</span>. Switch to Sepolia to unlock content.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={async () => {
            pushToast('info', 'Attempting to switch to Sepolia…')
            const ok = await onSwitch()
            if (!ok) {
              pushToast('error', 'Could not switch automatically. Change network from your wallet.')
            }
          }}
          disabled={isSwitching}
          className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSwitching ? 'Requesting switch…' : 'Switch to Sepolia'}
        </button>
        <span className="text-xs text-yellow-100/70">If your wallet does not allow auto-switching, change it from the extension.</span>
      </div>
    </div>
  )
}