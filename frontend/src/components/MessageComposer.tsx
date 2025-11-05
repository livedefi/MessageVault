import { useEffect, useState } from 'react'
import { useAAClient } from '../hooks/useAAClient'
import { usePublicClient, useWalletClient } from 'wagmi'
import { MESSAGE_VAULT_ADDRESS, messageVaultAbi } from '../config/contracts'
import { useAccount } from 'wagmi'
import { isAddressEqual, type Address } from 'viem'

type Props = {
  pushToast: (type: 'info' | 'success' | 'error', msg: string) => void
  onSentSuccess?: () => void
}

export default function MessageComposer({ pushToast, onSentSuccess }: Props) {
  const [content, setContent] = useState('')
  const [pendingAA, setPendingAA] = useState(false)
  const [pendingEOA, setPendingEOA] = useState(false)
  const { sendMessageToWalletAA } = useAAClient(pushToast)
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { address } = useAccount()
  const [isOwner, setIsOwner] = useState(false)
  const [ownerAddress, setOwnerAddress] = useState<Address | null>(null)

  useEffect(() => {
    let mounted = true
    const run = async () => {
      try {
        if (!publicClient || !address) {
          if (mounted) setIsOwner(false)
          return
        }
        const owner = (await publicClient.readContract({
          address: MESSAGE_VAULT_ADDRESS,
          abi: messageVaultAbi,
          functionName: 'owner',
        })) as Address
        if (mounted) {
          setOwnerAddress(owner)
          setIsOwner(isAddressEqual(owner, address as Address))
        }
      } catch (_) {
        if (mounted) {
          setIsOwner(false)
          setOwnerAddress(null)
        }
      }
    }
    void run()
    return () => {
      mounted = false
    }
  }, [publicClient, address])

  const onSendAA = async () => {
    try {
      setPendingAA(true)
      await sendMessageToWalletAA(content.trim())
      setContent('')
      onSentSuccess?.()
    } catch (e: any) {
      const code = e?.code ?? e?.data?.originalError?.code
      const msg = e?.message ?? 'Failed to send'
      if (code === 4001 || /User rejected/i.test(msg) || /denied/i.test(msg)) {
        pushToast('info', 'Request cancelled by user')
      } else {
        pushToast('error', 'Failed to send')
      }
    } finally {
      setPendingAA(false)
    }
  }

  const onSendEOA = async () => {
    try {
      const text = content.trim()
      if (!text) throw new Error('Content must not be empty')
      if (!isOwner) throw new Error('Only the owner can send as EOA')
      if (!walletClient || !publicClient) throw new Error('Wallet/public client unavailable')
      setPendingEOA(true)
      const txHash = await walletClient.writeContract({
        address: MESSAGE_VAULT_ADDRESS,
        abi: messageVaultAbi as any,
        functionName: 'sendMessageToWallet',
        args: [text],
      })
      pushToast('info', 'Transaction sent. Waiting for confirmation…')
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      if (receipt.status === 'success') {
        pushToast('success', 'Message sent (EOA)')
        setContent('')
        onSentSuccess?.()
      } else {
        pushToast('error', 'Transaction did not confirm')
      }
    } catch (e: any) {
      const code = e?.code ?? e?.data?.originalError?.code
      const msg = e?.message ?? 'Failed to send as EOA'
      if (code === 4001 || /User rejected/i.test(msg) || /denied/i.test(msg)) {
        pushToast('info', 'Request cancelled by user')
      } else {
        pushToast('error', 'Failed to send as EOA')
      }
    } finally {
      setPendingEOA(false)
    }
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
      <label className="block text-sm text-neutral-300 mb-2">Message</label>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        className="w-full rounded-md bg-neutral-800 border border-neutral-700 text-neutral-100 p-3 outline-none focus:ring-2 focus:ring-indigo-500"
        placeholder="Write your message…"
      />
      <div className="mt-2 text-xs text-neutral-400">
        <span className="mr-2">Contract owner:</span>
        <span className={isOwner ? 'text-emerald-400' : 'text-neutral-300'}>{ownerAddress ?? '…'}</span>
        <span className="mx-2">•</span>
        <span className="mr-2">Your wallet:</span>
      <span className={isOwner ? 'text-emerald-400' : 'text-neutral-300'}>{(address as Address) ?? 'disconnected'}</span>
      </div>
      <div className="mt-3 flex flex-col sm:flex-row gap-3 justify-end">
        <button
          type="button"
          onClick={onSendAA}
          disabled={pendingAA || content.trim().length === 0}
          className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm ring-1 ring-indigo-400/20 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {pendingAA ? 'Sending (AA)…' : 'Send as AA'}
        </button>
        <button
          type="button"
          onClick={onSendEOA}
          disabled={pendingEOA || content.trim().length === 0 || !isOwner}
          className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium bg-sky-600 hover:bg-sky-500 text-white shadow-sm ring-1 ring-sky-400/20 disabled:opacity-60 disabled:cursor-not-allowed"
          aria-disabled={!isOwner}
          title={!isOwner ? 'Only owner' : undefined}
        >
          {pendingEOA ? 'Sending (EOA)…' : !isOwner ? 'Only owner' : 'Sign as EOA (owner only)'}
        </button>
      </div>
    </div>
  )
}