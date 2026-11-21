import { useState } from 'react'
import { Link } from 'react-router-dom'
import StockChangeModal from './StockChangeModal'
import { Alert, Button, Card, ExportButtons, Field, Pager, Table, inputClass } from './ui'
import { formatDate, formatDateTime, formatQty, todayISO } from '../lib/format'
import { useApi } from '../lib/hooks'
import { toast } from '../lib/toast'

const STATUS = {
  below_min: <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Di bawah min</span>,
  above_max: <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Di atas max</span>,
  ok: <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">Aman</span>,
}

const REF_ROUTE = { usage: '/usage', transfer: '/transfers', goods_receipt: null, user_request: '/ur' }

/**
 * Saldo stok harian / mingguan / bulanan untuk SATU lokasi (gudang atau lapangan), mutasi, dan ubah stok manual.
 * canAdjust: tampilkan tombol "Ubah Stok" (aturan role ditentukan halaman pemanggil, dicek ulang di BE).
 */
export default function StockPanel({ location, canAdjust = false }) {
  const [period, setPeriod] = useState('harian')
  const [date, setDate] = useState(todayISO())
  const [range, setRange] = useState({ from: todayISO(), to: todayISO() })
  const [category, setCategory] = useState('')
  const [tab, setTab] = useState('saldo')
  const [page, setPage] = useState(1)
  const [adjusting, setAdjusting] = useState(false)
  const [message, setMessage] = useState(null)

  const loc = location?.id || ''
  const params = { location_id: loc, period, date, ...(period === 'custom' ? range : {}) }
  const report = useApi(loc ? '/stock/report' : null, params)
  const movements = useApi(loc && tab === 'mutasi' ? '/stock/movements' : null, { ...params, page })
  const rows = (report.data?.data || []).filter((r) => !category || r.category === category)
  const isWarehouse = location?.type === 'warehouse'
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString()

  return (
    <div className="space-y-4">
      <Card>
        {loc && (
          <div className="mb-4 flex flex-wrap justify-end gap-2">
            <ExportButtons url={`/stock/report/export?${qs}`} filename={`saldo-stok-${location?.name || loc}-${report.data?.from || date}`} onError={(t) => setMessage({ kind: 'error', text: t })} />
            {canAdjust && location?.is_active !== false && <Button size="sm" variant="warning" onClick={() => setAdjusting(true)}>Ubah Stok</Button>}
          </div>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Periode">
            <div className="flex rounded border border-slate-300 text-sm">
              {[['harian', 'Harian'], ['mingguan', 'Mingguan'], ['bulanan', 'Bulanan'], ['custom', 'Rentang']].map(([v, l]) => (
                <button key={v} onClick={() => (setPeriod(v), setPage(1))} className={`px-3 py-2 ${period === v ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{l}</button>
              ))}
            </div>
          </Field>
          {period === 'custom' ? (
            <>
              <Field label="Dari"><input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className={inputClass} /></Field>
              <Field label="Sampai"><input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className={inputClass} /></Field>
            </>
          ) : (
            <Field label="Tanggal acuan"><input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputClass} /></Field>
          )}
          <Field label="Jenis">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
              <option value="">Semua</option>
              <option value="bahan">Bahan</option>
              <option value="barang">Barang</option>
            </select>
          </Field>
        </div>
        {report.data && (
          <p className="mt-3 text-sm text-slate-500">
            {isWarehouse ? 'Gudang' : 'Lapangan'} <b>{report.data.location.name}</b>
            {report.data.location.parent && ` · di bawah Gudang ${report.data.location.parent.name}`} · {formatDate(report.data.from)}
            {report.data.from !== report.data.to && ` s/d ${formatDate(report.data.to)}`}
          </p>
        )}
      </Card>

      <Card>
        <Alert kind={message?.kind}>{message?.text}</Alert>
        <Alert>{report.error}</Alert>
        <div className="mb-3 flex gap-1 border-b">
          {[['saldo', 'Saldo per barang'], ['mutasi', 'Mutasi (riwayat keluar-masuk)']].map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === v ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500'}`}>{l}</button>
          ))}
        </div>

        {tab === 'saldo' ? (
          <Table
            loading={report.loading}
            rowKey={(r) => r.item_id}
            rows={rows}
            empty="Belum ada barang atau stok di lokasi ini pada periode tersebut."
            columns={[
              { label: 'Barang', render: (r) => <span className="font-medium text-slate-800">{r.name}</span> },
              { label: 'Jenis', render: (r) => (r.category === 'bahan' ? 'Bahan' : 'Barang') },
              { label: 'Satuan', render: (r) => r.unit },
              { label: 'Saldo awal', className: 'text-right', render: (r) => formatQty(r.opening) },
              { label: 'Masuk', className: 'text-right text-green-700', render: (r) => (r.in ? `+${formatQty(r.in)}` : '-') },
              { label: 'Keluar', className: 'text-right text-red-600', render: (r) => (r.out ? `-${formatQty(r.out)}` : '-') },
              { label: 'Saldo akhir', className: 'text-right font-semibold', render: (r) => formatQty(r.closing) },
              ...(isWarehouse
                ? [
                    { label: 'Min / Max', className: 'text-right text-slate-500 whitespace-nowrap', render: (r) => `${formatQty(r.min_stock)} / ${formatQty(r.max_stock)}` },
                    { label: 'Status', render: (r) => STATUS[r.status] },
                  ]
                : []),
            ]}
          />
        ) : (
          <>
            <Table
              loading={movements.loading}
              rows={movements.data?.data}
              empty="Tidak ada mutasi pada periode ini."
              columns={[
                { label: 'Tanggal', render: (m) => formatDate(m.date) },
                { label: 'Barang', render: (m) => m.item?.name },
                { label: 'Jenis mutasi', render: (m) => m.type_label },
                { label: 'Jumlah', className: 'text-right', render: (m) => <span className={m.quantity > 0 ? 'text-green-700' : 'text-red-600'}>{m.quantity > 0 ? '+' : ''}{formatQty(m.quantity)} {m.item?.unit}</span> },
                { label: 'Saldo setelah', className: 'text-right', render: (m) => formatQty(m.balance_after) },
                {
                  label: 'Referensi',
                  render: (m) =>
                    m.reference_number ? (REF_ROUTE[m.reference_type] ? <Link className="text-blue-600 hover:underline" to={`${REF_ROUTE[m.reference_type]}/${m.reference_id}`}>{m.reference_number}</Link> : m.reference_number) : '-',
                },
                { label: 'Oleh', render: (m) => m.user?.name || '-' },
                { label: 'Catatan', render: (m) => <span className="text-slate-500">{m.note || '-'}</span> },
                { label: 'Dicatat', render: (m) => <span className="text-xs text-slate-400">{formatDateTime(m.created_at)}</span> },
              ]}
            />
            <Pager meta={movements.data?.meta} page={page} setPage={setPage} />
          </>
        )}
      </Card>

      {adjusting && (
        <StockChangeModal
          location={location}
          onClose={() => setAdjusting(false)}
          onDone={(text) => {
            setAdjusting(false)
            setMessage(null)
            toast(text)
            report.reload()
            movements.reload()
          }}
        />
      )}
    </div>
  )
}
