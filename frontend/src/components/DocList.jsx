import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { todayISO } from '../lib/format'
import { useApi, useDebounced } from '../lib/hooks'
import { Alert, Card, ExportButtons, PageHeader, Pager, Table } from './ui'

const PERIODS = [
  ['all', 'Semua'],
  ['harian', 'Harian'],
  ['mingguan', 'Mingguan'],
  ['bulanan', 'Bulanan'],
  ['custom', 'Rentang'],
]

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Rentang tanggal sebuah periode (minggu: Senin–Minggu, sama seperti laporan stok). */
function periodRange(period, ref, custom) {
  const d = new Date(`${ref}T00:00:00`)
  if (period === 'harian') return [ref, ref]
  if (period === 'mingguan') {
    const start = new Date(d)
    start.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return [iso(start), iso(end)]
  }
  if (period === 'bulanan') return [iso(new Date(d.getFullYear(), d.getMonth(), 1)), iso(new Date(d.getFullYear(), d.getMonth() + 1, 0))]
  if (period === 'custom') return [custom.from, custom.to]
  return ['', '']
}

/**
 * Halaman daftar dokumen dengan filter status (dari URL ?status=), tanggal, pencarian, dan halaman.
 * statuses: [[value, label]]
 * periodFilter: tampilkan pilihan Harian / Mingguan / Bulanan / Rentang (untuk rekap).
 * recap: { url, filename } → tombol Generate PDF/Excel rekap sesuai filter yang sedang aktif.
 */
export default function DocList({ title, subtitle, endpoint, statuses = [], columns, actions, searchPlaceholder = 'Cari nomor / barang...', extraParams = {}, periodFilter = false, recap, intro }) {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') || ''
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState('all')
  const [ref, setRef] = useState(todayISO())
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [exportError, setExportError] = useState('')
  const q = useDebounced(search)

  const [from, to] = periodRange(period, ref, custom)
  const filters = {
    status: status || undefined,
    search: q || undefined,
    date_from: from || undefined,
    date_to: to || undefined,
    ...extraParams,
  }
  const { data, loading, error } = useApi(endpoint, { page, ...filters })

  const setStatus = (v) => {
    const next = new URLSearchParams(params)
    if (v) next.set('status', v)
    else next.delete('status')
    setParams(next, { replace: true })
    setPage(1)
  }
  const reset = (fn) => (...args) => (fn(...args), setPage(1))
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString()

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle}>
        {actions}
      </PageHeader>
      {intro}
      <Card>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          {statuses.length > 0 && (
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm">
              <option value="">Semua status</option>
              {statuses.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          )}
          {periodFilter ? (
            <>
              <div className="flex rounded border border-slate-300 text-sm">
                {PERIODS.map(([v, l]) => (
                  <button key={v} onClick={reset(() => setPeriod(v))} className={`px-2.5 py-1.5 ${period === v ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                    {l}
                  </button>
                ))}
              </div>
              {['harian', 'mingguan', 'bulanan'].includes(period) && (
                <label className="text-xs text-slate-500">
                  Tanggal acuan
                  <input type="date" value={ref} max={todayISO()} onChange={reset((e) => setRef(e.target.value || todayISO()))} className="ml-1 rounded border border-slate-300 px-2 py-1 text-sm text-slate-700" />
                </label>
              )}
            </>
          ) : null}
          {(!periodFilter || period === 'custom') && (
            <>
              <label className="text-xs text-slate-500">
                Dari
                <input type="date" value={custom.from} onChange={reset((e) => setCustom({ ...custom, from: e.target.value }))} className="ml-1 rounded border border-slate-300 px-2 py-1 text-sm text-slate-700" />
              </label>
              <label className="text-xs text-slate-500">
                Sampai
                <input type="date" value={custom.to} onChange={reset((e) => setCustom({ ...custom, to: e.target.value }))} className="ml-1 rounded border border-slate-300 px-2 py-1 text-sm text-slate-700" />
              </label>
            </>
          )}
          <input
            type="search"
            placeholder={searchPlaceholder}
            value={search}
            onChange={reset((e) => setSearch(e.target.value))}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm sm:ml-auto"
          />
        </div>
        {recap && (
          <div className="mb-3 flex flex-wrap items-center justify-end gap-2 border-t pt-3">
            <span className="mr-auto text-xs text-slate-500">Rekap mengikuti filter di atas (satu baris per dokumen + rincian barangnya).</span>
            <ExportButtons url={`${recap.url}${qs ? `?${qs}` : ''}`} filename={`${recap.filename}-${from || 'semua'}-${to || 'semua'}`} onError={setExportError} label=" Rekap" />
          </div>
        )}
        <Alert>{exportError}</Alert>
        <Alert>{error}</Alert>
        <Table columns={columns} rows={data?.data} loading={loading} />
        <Pager meta={data?.meta} page={page} setPage={setPage} />
      </Card>
    </div>
  )
}
