import { useEffect, useRef, useState } from 'react'

export type ToastItem = { id: number; type: 'info' | 'success' | 'error'; message: string }

export function useNetworkGuard(
  isConnected: boolean,
  isWrongNetwork: boolean,
  isSwitching: boolean,
) {
  // Avoid multiple prompts: request auto-switch only once
  const askedSwitchRef = useRef(false)
  // Avoid duplicate toast for "Correct network" (StrictMode mounts effects twice)
  const showedCorrectToastRef = useRef(false)
  // Toast deduplication
  const lastToastRef = useRef<{ type: 'info' | 'success' | 'error'; message: string; ts: number } | null>(null)

  const [showNetworkCard, setShowNetworkCard] = useState(false)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timerRef = useRef<number | null>(null)
  const sepoliaHex = '0xaa36a7'
  const alchemyApiKey = import.meta.env.VITE_ALCHEMY_API_KEY as string | undefined
  if (!alchemyApiKey && import.meta.env.DEV) {
    throw new Error('VITE_ALCHEMY_API_KEY is missing. Set it in frontend/.env')
  }
  const rpcSepoliaUrl = alchemyApiKey ? `https://eth-sepolia.g.alchemy.com/v2/${alchemyApiKey}` : undefined

  const pushToast = (type: 'info' | 'success' | 'error', message: string) => {
    const now = Date.now()
    const last = lastToastRef.current
    // Ignore identical toasts emitted within a 3s window
    if (last && last.type === type && last.message === message && now - last.ts < 3000) {
      return
    }
    lastToastRef.current = { type, message, ts: now }
    const id = now + Math.floor(Math.random() * 1000)
    setToasts((prev) => [...prev, { id, type, message }])
    // Auto-close in ~4.5s
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4500)
  }

  // Robust fallback: try wallet_switchEthereumChain and if the network is missing (4902), add Sepolia
  const switchOrAddSepolia = async () => {
    const eth = (window as any)?.ethereum
    if (!eth) return false
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: sepoliaHex }] })
      return true
    } catch (error: any) {
      const code = error?.code ?? error?.data?.originalError?.code
      if (code === 4001) {
        pushToast('error', 'Network switch cancelled by user')
        return false
      }
      if (code === 4902 || String(error?.message || '').toLowerCase().includes('unrecognized')) {
        pushToast('info', 'Your wallet does not recognize Sepolia, adding it…')
        try {
          await eth.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: sepoliaHex,
                chainName: 'Sepolia',
                nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
                rpcUrls: [rpcSepoliaUrl!],
                blockExplorerUrls: ['https://sepolia.etherscan.io'],
              },
            ],
          })
          pushToast('success', 'Sepolia added. Requesting switch…')
          try {
            await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: sepoliaHex }] })
            return true
          } catch (switchAfterAddErr: any) {
            const code2 = switchAfterAddErr?.code ?? switchAfterAddErr?.data?.originalError?.code
            if (code2 === 4001) {
              pushToast('error', 'Network switch cancelled by user')
            } else {
              pushToast('error', 'Could not switch to Sepolia after adding it')
            }
            return false
          }
        } catch (addErr) {
          pushToast('error', 'Could not add Sepolia to the wallet')
          return false
        }
      }
      pushToast('error', 'Could not request automatic network switch')
      return false
    }
  }

  useEffect(() => {
    const run = async () => {
      // Reset when not connected or already on the correct network
      if (!isConnected || !isWrongNetwork) {
        askedSwitchRef.current = false
        setShowNetworkCard(false)
        if (!isConnected) {
          showedCorrectToastRef.current = false
        }
        if (isConnected && !isWrongNetwork && !showedCorrectToastRef.current) {
          pushToast('success', 'Correct network: Sepolia')
          showedCorrectToastRef.current = true
        }
        if (timerRef.current) {
          clearTimeout(timerRef.current)
          timerRef.current = null
        }
        return
      }

      // On wrong network: attempt auto-switch once (direct request and add-network fallback)
      if (!isSwitching && !askedSwitchRef.current) {
        showedCorrectToastRef.current = false
        askedSwitchRef.current = true
        pushToast('info', 'Requesting network switch to Sepolia…')
        let switched = false
        try {
          switched = await switchOrAddSepolia()
        } catch (_) {
          switched = false
        }
        if (!switched) {
          setShowNetworkCard(true)
          pushToast('error', 'Automatic switch failed. Manual attempt required.')
        }
        // If after 8s still on wrong network, show fallback and error
        timerRef.current = window.setTimeout(() => {
          if (isConnected && isWrongNetwork) {
            setShowNetworkCard(true)
            pushToast('error', 'Your wallet did not switch networks. Do it manually to Sepolia.')
          }
        }, 8000)
      }
    }
    void run()
  }, [isConnected, isWrongNetwork, isSwitching])

  return { toasts, pushToast, showNetworkCard, switchOrAddSepolia }
}