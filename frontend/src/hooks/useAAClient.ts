import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import type { Address } from 'viem'
import { MESSAGE_VAULT_ADDRESS } from '../config/contracts'
import { createClient, buildCallDataSendMessageToWallet, waitForUserOperationReceipt } from '../lib/alchemyClient'

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }
function isRateLimitError(err: any) {
  const code = (err as any)?.code
  const msg = (err as any)?.message || (err as Error)?.message || String(err)
  return code === 429 || /Too Many Requests/i.test(msg) || /compute units per second/i.test(msg)
}
function withJitter(ms: number) {
  const jitter = Math.floor(Math.random() * 800) // 0-800ms
  return ms + jitter
}

export function useAAClient(pushToast: (type: 'info' | 'success' | 'error', msg: string) => void) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  // Narrow types at function scope for try/catch usage
  const pc = publicClient
  const wc = walletClient


  // Send message to the wallet (sendMessageToWallet) via AA using the SDK
  const sendMessageToWalletAA = async (content: string) => {
    try {
      if (!address || !wc || !pc) throw new Error('Wallet client unavailable')
      if (!content || content.trim().length === 0) throw new Error('Content must not be empty')
      const mvBytecode = await pc.getCode({ address: MESSAGE_VAULT_ADDRESS })
      if (!mvBytecode) throw new Error('MessageVault not deployed on this network')

      let client = await createClient(wc)
      const callData = await buildCallDataSendMessageToWallet(content)

      pushToast('info', 'Sending operation (AA) to wallet…')
      let userOpHash: string | undefined
      const maxAttempts = 5
      let simulationDisabled = false
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const res = await client.sendUserOperation({
            uo: { target: MESSAGE_VAULT_ADDRESS as Address, data: callData, value: 0n },
            overrides: {
              verificationGasLimit: 120000n,
              paymasterVerificationGasLimit: 60000n,
              paymasterPostOpGasLimit: 80000n,
            },
          })
          userOpHash = res.hash
          break
        } catch (e: any) {
          if (isRateLimitError(e) && attempt < maxAttempts) {
            // First time we hit 429, rebuild client without simulation to reduce compute-heavy calls
            if (!simulationDisabled) {
              pushToast('info', 'Rate limit (429). Disabling simulation and retrying…')
              simulationDisabled = true
              client = await createClient(wc, { disableSimulation: true })
              // Small pause to avoid immediate burst after rebuild
              await sleep(withJitter(1200))
              continue
            }
            const base = Math.min(3000 * Math.pow(2, attempt - 1), 30000)
            const delay = withJitter(base)
            pushToast('info', `Rate limit (429). Pausing ${Math.round(delay/1000)}s before retry…`)
            await sleep(delay)
            continue
          }
          throw e
        }
      }
      if (!userOpHash) throw new Error('Could not send UserOperation after several attempts')
      pushToast('info', 'UserOperation sent. Waiting for inclusion…')
      const receipt = await waitForUserOperationReceipt(client, { hash: userOpHash as any })
      pushToast('success', 'Message to wallet sent (AA) and operation included')
      return { userOpHash, receipt }
    } catch (err: any) {
      const code = err?.code ?? err?.data?.originalError?.code
      const msg = (err instanceof Error) ? err.message : String(err)
      const name = err?.name
      console.error('[AA][hook] error', err)
      // Treat user cancellation as an info toast, consistent with EOA flow
      if (code === 4001 || /User rejected/i.test(msg) || /denied/i.test(msg) || name === 'UserRejectedRequestError') {
        // Let the caller also handle UI state; avoiding duplicate error toasts
        pushToast('info', 'Request cancelled by user')
      } else {
        pushToast('error', msg)
      }
      throw err
    }
  }

  return { sendMessageToWalletAA }
}
