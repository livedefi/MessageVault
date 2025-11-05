import type { MessageItem } from '../hooks/useGraphMessages'

type Props = {
  messages: MessageItem[]
}

export default function MessageList({ messages }: Props) {
  if (messages.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-6 text-neutral-300">
        No messages yet.
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60">
      <div className="divide-y divide-neutral-800">
        {messages.map((m) => (
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