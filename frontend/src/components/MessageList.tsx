import { useEffect, useMemo, useState } from 'react'
import type { MessageItem } from '../hooks/useGraphMessages'

type Props = {
  messages: MessageItem[]
}

export default function MessageList({ messages }: Props) {
  const [order, setOrder] = useState<'asc' | 'desc'>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('mv_order') : null
    return saved === 'desc' ? 'desc' : 'asc'
  })
  useEffect(() => {
    try {
      window.localStorage.setItem('mv_order', order)
    } catch (_) {}
  }, [order])
  const display = useMemo(() => (order === 'asc' ? messages : [...messages].slice().reverse()), [messages, order])
  if (messages.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-6 text-neutral-300">
        No messages yet.
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60">
      <div className="p-3 flex items-center justify-end">
        <div className="text-xs text-neutral-400 mr-2">Order</div>
        <div className="inline-flex rounded-md border border-neutral-700 overflow-hidden">
          <button
            type="button"
            onClick={() => setOrder('asc')}
            aria-pressed={order === 'asc'}
            className={
              'px-3 py-1.5 text-xs ' +
              (order === 'asc'
                ? 'bg-neutral-700 text-white'
                : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700/60')
            }
            title="Oldest first"
          >
            Asc
          </button>
          <button
            type="button"
            onClick={() => setOrder('desc')}
            aria-pressed={order === 'desc'}
            className={
              'px-3 py-1.5 text-xs border-l border-neutral-700 ' +
              (order === 'desc'
                ? 'bg-neutral-700 text-white'
                : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700/60')
            }
            title="Newest first"
          >
            Desc
          </button>
        </div>
      </div>
      <div className="divide-y divide-neutral-800">
        {display.map((m) => (
          <div key={m.id.toString()} className="p-4 flex items-center gap-3">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-neutral-700 text-xs">#</span>
            <div className="flex-1">
              <div className="text-sm text-neutral-400">ID {m.id.toString()}</div>
              <div className="text-xs text-neutral-500">from {m.sender}</div>
              <div className="mt-1 text-neutral-100">{m.content}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}