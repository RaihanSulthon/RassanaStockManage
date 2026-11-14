import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { ROLES } from '../lib/roles'
import {
  ACTION_STATUS,
  STATUS_LABELS,
  STATUS_STYLES,
  STOCK_TYPES,
  formatDate,
} from '../lib/stock'

export function StatusBadge({ status, label }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}>
      {label || STATUS_LABELS[status]}
    </span>
  )
}

export default function Stock() {
  const { user } = useAuth()
  const canCreate = [ROLES.USER, ROLES.ADMIN].includes(user.role)
  const myActionStatus = ACTION_STATUS[user.role]

  const [params, setParams] = useSearchParams()
  const type = params.get('type') || ''
  const status = params.get('status') || ''
  const dateFrom = params.get('from') || ''
  const dateTo = params.get('to') || ''

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [reports, setReports] = useState([])
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1 })
  const [summary, setSummary] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
    setPage(1)
  }

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchReports = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [list, sum] = await Promise.all([
        api.get('/stock-reports', {
          params: {
            page,
            type: type || undefined,
            status: status || undefined,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
            search: debouncedSearch || undefined,
          },
        }),
        api.get('/stock-reports/summary'),
      ])
      setReports(list.data.data)
      setMeta(list.data.meta)
      setSummary(sum.data.data)
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat laporan stok.')
    } finally {
      setLoading(false)
    }
  }, [page, type, status, dateFrom, dateTo, debouncedSearch])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  const visibleStatuses = Object.keys(STATUS_LABELS).filter(
    (s) => user.role === ROLES.ADMIN || summary[s] > 0 || s === myActionStatus || status === s,
  )

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Stock Management</h1>
            <p className="text-sm text-slate-500">
              {user.role === ROLES.USER && 'Catat sisa stok harian, lalu kirim ke Operation.'}
              {user.role === ROLES.OPERATION1 && 'Periksa dan edit laporan dari user, lalu kirim ke Co-Admin.'}
              {user.role === ROLES.CO_ADMIN && 'Finalisasi laporan dari Operation, lalu generate PDF / Excel.'}
              {user.role === ROLES.ADMIN && 'Pantau seluruh laporan stok di semua tahap.'}
            </p>
          </div>
          {canCreate && (
            <div className="flex gap-2">
              <Link
                to="/stock/new?type=bahan"
                className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
              >
                + Stok Bahan
              </Link>
              <Link
                to="/stock/new?type=barang"
                className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
              >
                + Stok Barang
              </Link>
            </div>
          )}
        </div>

        {/* Ringkasan per status (klik untuk memfilter) */}
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setFilter('status', '')}
            className={`rounded-lg border px-3 py-2 text-left text-sm ${!status ? 'border-slate-900 bg-slate-50' : 'hover:bg-slate-50'}`}
          >
            <div className="text-xs text-slate-500">Semua</div>
            <div className="text-lg font-bold text-slate-800">
              {Object.values(summary).reduce((a, b) => a + b, 0)}
            </div>
          </button>
          {visibleStatuses.map((s) => (
            <button
              key={s}
              onClick={() => setFilter('status', status === s ? '' : s)}
              className={`relative rounded-lg border px-3 py-2 text-left text-sm ${status === s ? 'border-slate-900 bg-slate-50' : 'hover:bg-slate-50'}`}
            >
              <div className="text-xs text-slate-500">{STATUS_LABELS[s]}</div>
              <div className="text-lg font-bold text-slate-800">{summary[s] ?? 0}</div>
              {s === myActionStatus && summary[s] > 0 && (
                <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                  Perlu tindakan
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mb-3 flex flex-wrap items-end gap-2">
          <div className="flex rounded border border-slate-300 text-sm">
            {[['', 'Semua'], ['bahan', 'Bahan'], ['barang', 'Barang']].map(([v, l]) => (
              <button
                key={v}
                onClick={() => setFilter('type', v)}
                className={`px-3 py-1.5 ${type === v ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {l}
              </button>
            ))}
          </div>
          <label className="text-xs text-slate-500">
            Dari
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setFilter('from', e.target.value)}
              className="ml-1 rounded border border-slate-300 px-2 py-1 text-sm text-slate-700"
            />
          </label>
          <label className="text-xs text-slate-500">
            Sampai
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setFilter('to', e.target.value)}
              className="ml-1 rounded border border-slate-300 px-2 py-1 text-sm text-slate-700"
            />
          </label>
          <input
            type="search"
            placeholder="Cari pembuat / nama item..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ml-auto rounded border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>

        {error && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-slate-500">
              <tr>
                <th className="py-2 pr-4">Tanggal</th>
                <th className="py-2 pr-4">Jenis</th>
                <th className="py-2 pr-4">Dicatat oleh</th>
                <th className="py-2 pr-4">Item</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">Memuat...</td>
                </tr>
              ) : reports.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
                    Belum ada laporan{canCreate ? '. Klik tombol di kanan atas untuk membuat.' : '.'}
                  </td>
                </tr>
              ) : (
                reports.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium text-slate-800">{formatDate(r.report_date)}</td>
                    <td className="py-2 pr-4 text-slate-600">{STOCK_TYPES[r.type]}</td>
                    <td className="py-2 pr-4 text-slate-600">{r.creator?.name}</td>
                    <td className="py-2 pr-4 text-slate-600">{r.items_count}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={r.status} label={r.status_label} />
                    </td>
                    <td className="py-2 text-right">
                      <Link to={`/stock/${r.id}`} className="text-blue-600 hover:underline">
                        {r.can?.update ? 'Buka / Edit' : 'Lihat'}
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>
            Halaman {meta.current_page} dari {meta.last_page}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded border px-3 py-1 disabled:opacity-40"
            >
              Sebelumnya
            </button>
            <button
              disabled={page >= meta.last_page}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border px-3 py-1 disabled:opacity-40"
            >
              Berikutnya
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
