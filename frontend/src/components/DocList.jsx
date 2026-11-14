import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApi, useDebounced } from '../lib/hooks'
import { Alert, Card, PageHeader, Pager, Table } from './ui'

/**
 * Halaman daftar dokumen dengan filter status (dari URL ?status=), tanggal, pencarian, dan halaman.
 * statuses: [[value, label]]
 */
export default function DocList({ title, subtitle, endpoint, statuses = [], columns, actions, searchPlaceholder = 'Cari nomor / barang...', extraParams = {} }) {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') || ''
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const q = useDebounced(search)

  const { data, loading, error } = useApi(endpoint, {
    page,
    status: status || undefined,
    search: q || undefined,
    date_from: from || undefined,
    date_to: to || undefined,
    ...extraParams,
  })

  const setStatus = (v) => {
    const next = new URLSearchParams(params)
    if (v) next.set('status', v)
    else next.delete('status')
    setParams(next, { replace: true })
    setPage(1)
  }

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle}>
        {actions}
      </PageHeader>
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
          <label className="text-xs text-slate-500">
            Dari
            <input type="date" value={from} onChange={(e) => (setFrom(e.target.value), setPage(1))} className="ml-1 rounded border border-slate-300 px-2 py-1 text-sm text-slate-700" />
          </label>
          <label className="text-xs text-slate-500">
            Sampai
            <input type="date" value={to} onChange={(e) => (setTo(e.target.value), setPage(1))} className="ml-1 rounded border border-slate-300 px-2 py-1 text-sm text-slate-700" />
          </label>
          <input
            type="search"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => (setSearch(e.target.value), setPage(1))}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm sm:ml-auto"
          />
        </div>
        <Alert>{error}</Alert>
        <Table columns={columns} rows={data?.data} loading={loading} />
        <Pager meta={data?.meta} page={page} setPage={setPage} />
      </Card>
    </div>
  )
}
