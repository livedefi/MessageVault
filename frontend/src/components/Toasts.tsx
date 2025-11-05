import type { ToastItem } from '../hooks/useNetworkGuard'

type Props = {
  toasts: ToastItem[]
}

export default function Toasts({ toasts }: Props) {
  return (
    <div className="fixed top-20 right-4 z-50 space-y-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={
            'rounded-md shadow px-4 py-2 text-sm ' +
            (t.type === 'success'
              ? 'bg-emerald-900/60 border border-emerald-700 text-emerald-100'
              : t.type === 'error'
              ? 'bg-rose-900/60 border border-rose-700 text-rose-100'
              : 'bg-neutral-800/80 border border-neutral-700 text-neutral-100')
          }
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}