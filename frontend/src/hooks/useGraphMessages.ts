import { useEffect, useRef, useState } from 'react'

export type MessageItem = {
  id: bigint
  sender: `0x${string}`
  content: string
}

type GqlMessage = { id: string; internal_id: string; sender: `0x${string}`; content: string }

const QUERY = `
  query Messages($first: Int = 50, $skip: Int = 0) {
    messageStoreds(first: $first, skip: $skip, orderBy: internal_id, orderDirection: asc) {
      id
      internal_id
      sender
      content
    }
  }
`

export function useGraphMessages() {
  const [messages, setMessages] = useState<MessageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)
  const lastIdsRef = useRef<Set<string>>(new Set())
  const initializedRef = useRef<boolean>(false)
  const attemptRef = useRef<number>(0)
  const refreshRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const url = import.meta.env.VITE_SUBGRAPH_URL as string | undefined
    const pollMsEnv = import.meta.env.VITE_SUBGRAPH_POLL_MS as string | undefined
    const maxPollMsEnv = import.meta.env.VITE_SUBGRAPH_MAX_POLL_MS as string | undefined
    const jitterPctEnv = import.meta.env.VITE_SUBGRAPH_JITTER_PCT as string | undefined
    const defaultPollMs = 3000
    const defaultMaxPollMs = 60000
    const defaultJitterPct = 0.3
    const parsed = Number(pollMsEnv)
    const pollMs = Number.isFinite(parsed) && parsed > 0 ? parsed : defaultPollMs
    const parsedMax = Number(maxPollMsEnv)
    const maxPollMs = Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : defaultMaxPollMs
    const parsedJitter = Number(jitterPctEnv)
    const jitterPct = Number.isFinite(parsedJitter) && parsedJitter >= 0 ? Math.min(parsedJitter, 1) : defaultJitterPct
    if (!url) {
      setLoading(false)
      setError('VITE_SUBGRAPH_URL not set in frontend/.env')
      return
    }

    let mounted = true

    const fetchOnce = async (): Promise<boolean> => {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query: QUERY, variables: { first: 50, skip: 0 } }),
        })
        const json = await res.json()
        if (json.errors) throw new Error(json.errors?.[0]?.message ?? 'GraphQL error')
        const rows: GqlMessage[] = json.data?.messageStoreds ?? []
        // Transform rows to items using the on-chain counter (internal_id)
        const items = rows.map((r) => ({ id: BigInt(r.internal_id), sender: r.sender, content: r.content }))

        if (mounted) {
          setMessages((prev) => {
            // Initial population: keep server order, track ids
            if (!initializedRef.current || prev.length === 0) {
              for (const r of rows) lastIdsRef.current.add(r.internal_id)
              initializedRef.current = true
              const initial = items.slice(0, 200)
              return initial
            }
            // Subsequent polls: append only new items (oldest-first view)
            const additions: MessageItem[] = []
            for (const r of rows) {
              if (!lastIdsRef.current.has(r.internal_id)) {
                lastIdsRef.current.add(r.internal_id)
                additions.push({ id: BigInt(r.internal_id), sender: r.sender, content: r.content })
              }
            }
            if (additions.length === 0) return prev
            const merged = [...prev, ...additions]
            if (merged.length > 200) merged.splice(200)
            return merged
          })
          setError(null)
        }
        return true
      } catch (e: any) {
        if (mounted) setError(e?.message ?? 'Error querying subgraph')
        return false
      } finally {
        if (mounted) setLoading(false)
      }
    }

    const scheduleNext = (succeeded: boolean) => {
      if (!mounted) return
      attemptRef.current = succeeded ? 0 : attemptRef.current + 1
      const base = pollMs
      const expDelay = Math.min(maxPollMs, base * Math.pow(2, attemptRef.current))
      const jitter = expDelay * (Math.random() * jitterPct)
      const nextDelay = Math.max(0, expDelay - jitter) // full jitter (subtract)
      timerRef.current = window.setTimeout(runOnce, nextDelay)
    }

    const runOnce = async () => {
      const ok = await fetchOnce()
      scheduleNext(ok)
    }

    // First execution and schedule next
    void runOnce()

    // Expose immediate refresh method
    refreshRef.current = () => {
      if (!mounted) return
      attemptRef.current = 0
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      void runOnce()
    }

    return () => {
      mounted = false
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  const refresh = () => refreshRef.current?.()
  return { messages, loading, error, refresh }
}