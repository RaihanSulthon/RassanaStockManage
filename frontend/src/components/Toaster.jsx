import { useEffect, useState } from 'react'
import { subscribeToast } from '../lib/toast'

const STYLE = {
  ok: 'border-green-200 bg-green-50 text-green-800',
  warn: 'border-amber-200 bg-amber-50 text-amber-900',
  error: 'border-red-200 bg-red-50 text-red-800',
}

/** Tempat munculnya toast (pojok kanan bawah). Dipasang sekali di Layout. */
export default function Toaster() {
  const [items, setItems] = useState([])

  useEffect(
    () =>
      subscribeToast((item) => {
        setItems((list) => [...list.slice(-2), item]) // maksimal 3 sekaligus
        setTimeout(() => setItems((list) => list.filter((i) => i.id !== item.id)), item.duration)
      }),
    [],
  )

  const close = (id) => setItems((list) => list.filter((i) => i.id !== id))

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${STYLE[t.kind] || STYLE.ok}`}
        >
          <span className="flex-1">{t.text}</span>
          <button onClick={() => close(t.id)} className="text-lg leading-none opacity-60 hover:opacity-100" aria-label="Tutup">
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
