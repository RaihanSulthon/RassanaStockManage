import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { formatDateTime } from '../lib/format'

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState({ unread_count: 0, data: [] })
  const navigate = useNavigate()
  const ref = useRef(null)

  const load = useCallback(() => {
    api
      .get('/notifications')
      .then((res) => setData(res.data))
      .catch(() => {})
  }, [])

  // Muat saat dibuka halaman, lalu cek berkala tiap 60 detik
  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const openItem = async (n) => {
    setOpen(false)
    if (!n.read_at) await api.post(`/notifications/${n.id}/read`).catch(() => {})
    load()
    if (n.url) navigate(n.url)
  }

  const readAll = async () => {
    await api.post('/notifications/read-all').catch(() => {})
    load()
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          setOpen((o) => !o)
          if (!open) load()
        }}
        className="relative rounded border border-slate-300 px-2.5 py-1.5 text-slate-700 hover:bg-slate-100"
        aria-label="Notifikasi"
        title="Notifikasi"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {data.unread_count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-5 text-white">
            {data.unread_count > 99 ? '99+' : data.unread_count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-white shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold text-slate-800">Notifikasi</span>
            {data.unread_count > 0 && (
              <button onClick={readAll} className="text-xs text-blue-600 hover:underline">
                Tandai semua dibaca
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {data.data.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-slate-500">Belum ada notifikasi.</li>
            ) : (
              data.data.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => openItem(n)}
                    className={`block w-full border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50 ${n.read_at ? '' : 'bg-blue-50'}`}
                  >
                    <div className="font-medium text-slate-800">{n.title}</div>
                    <div className="text-slate-600">{n.message}</div>
                    <div className="mt-0.5 text-xs text-slate-400">{formatDateTime(n.created_at)}</div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
