import { useState } from 'react'
import { Link } from 'react-router-dom'
import LineItemsEditor, { newLine } from '../components/LineItemsEditor'
import { Alert, Button, Card, ExportButtons, Field, Modal, PageHeader, Pager, Table, inputClass } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import api from '../lib/api'
import { errorMessage, formatDate, formatDateTime, formatQty, todayISO } from '../lib/format'
import { useApi, useItems, useLocations } from '../lib/hooks'

const STATUS = {
  below_min: <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Di bawah min</span>,
  above_max: <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Di atas max</span>,
  ok: <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">Aman</span>,
}

const REF_ROUTE = { usage: '/usage', transfer: '/transfers', goods_receipt: null, user_request: '/ur' }

/** Saldo stok harian / mingguan / bulanan per lokasi, mutasi, dan penyesuaian (Admin). */
export default function Stock() {
  const { user } = useAuth()
  const locations = useLocations()
  const [locationId, setLocationId] = useState('')
  const [period, setPeriod] = useState('harian')
  const [date, setDate] = useState(todayISO())
  const [range, setRange] = useState({ from: todayISO(), to: todayISO() })
  const [category, setCategory] = useState('')
  const [tab, setTab] = useState('saldo')
  const [page, setPage] = useState(1)
  const [adjusting, setAdjusting] = useState(false)
  const [message, setMessage] = useState(null)

  const loc = locationId || locations[0]?.id || ''
  const location = locations.find((l) => l.id === Number(loc))
  const params = { location_id: loc, period, date, ...(period === 'custom' ? range : {}) }
  const report = useApi(loc ? '/stock/report' : null, params)
  const movements = useApi(loc && tab === 'mutasi' ? '/stock/movements' : null, { ...params, page })
  const rows = (report.data?.data || []).filter((r) => !category || r.category === category)
  const isWarehouse = location?.type === 'warehouse'
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString()

  return (
    <div className="space-y-4">
      <PageHeader title="Saldo Stok" subtitle="Saldo awal, masuk, keluar, dan saldo akhir per barang. Gudang juga dibandingkan dengan batas minimal & maksimal.">
        {loc && <ExportButtons url={`/stock/report/export?${qs}`} filename={`saldo-stok-${location?.name || loc}-${report.data?.from || date}`} onError={(t) => setMessage({ kind: 'error', text: t })} />}
        {user.role === 'admin' && loc && <Button size="sm" variant="warning" onClick={() => setAdjusting(true)}>Penyesuaian / Saldo Awal</Button>}
      </PageHeader>

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Lokasi">
            <select value={loc} onChange={(e) => (setLocationId(e.target.value), setPage(1))} className={inputClass}>
              {locations.length === 0 && <option value="">Belum ada lokasi</option>}
              {['warehouse', 'field'].map((t) => (
                <optgroup key={t} label={t === 'warehouse' ? 'Gudang' : 'Lapangan'}>
                  {locations.filter((l) => l.type === t).map((l) => (
                    <option key={l.id} value={l.id}>{l.name}{l.parent ? ` (${l.parent.name})` : ''}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
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
            {location?.type === 'warehouse' ? 'Gudang' : 'Lapangan'} <b>{report.data.location.name}</b>
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
            empty="Belum ada stok di lokasi ini."
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
        <AdjustModal
          location={location}
          balances={Object.fromEntries((report.data?.data || []).map((r) => [r.item_id, r.closing]))}
          onClose={() => setAdjusting(false)}
          onDone={(text) => {
            setAdjusting(false)
            setMessage({ kind: 'ok', text })
            report.reload()
          }}
        />
      )}
    </div>
  )
}

/** Admin: isi saldo aktual (hasil hitung fisik / saldo awal). Sistem mencatat selisihnya sebagai mutasi penyesuaian. */
function AdjustModal({ location, onClose, onDone }) {
  const items = useItems()
  const current = useApi('/stock/balances', { location_id: location.id }).data?.data || {}
  const [rows, setRows] = useState([newLine()])
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('Saldo awal')
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setErrors({})
    setError('')
    try {
      const res = await api.post('/stock/adjustments', {
        location_id: location.id,
        date,
        note,
        items: rows.filter((r) => r.item_id).map((r) => ({ item_id: r.item_id, actual: r.quantity })),
      })
      onDone(res.data.message)
    } catch (err) {
      if (err.response?.status === 422) setErrors(err.response.data.errors || {})
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  // Error "items.N.actual" ditampilkan di kolom jumlah
  const mapped = Object.fromEntries(Object.entries(errors).map(([k, v]) => [k.replace('.actual', '.quantity'), v]))

  return (
    <Modal title={`Penyesuaian Stok · ${location.name}`} onClose={onClose} wide>
      <Alert>{error}</Alert>
      <Alert kind="info">Isi saldo <b>aktual</b> hasil hitung fisik. Sistem mencatat selisih terhadap saldo sistem sebagai mutasi penyesuaian.</Alert>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Field label="Tanggal" error={errors.date?.[0]}>
          <input type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Alasan" error={errors.note?.[0]} className="sm:col-span-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} maxLength={255} />
        </Field>
      </div>
      <LineItemsEditor
        items={items}
        rows={rows}
        setRows={setRows}
        editable
        errors={mapped}
        qtyLabel="Saldo aktual"
        showNote={false}
        extraColumns={[
          { label: 'Saldo sistem', className: 'text-right', render: (r) => (r.item_id ? formatQty(current[r.item_id] ?? 0) : '-') },
          {
            label: 'Selisih',
            className: 'text-right',
            render: (r) => {
              if (!r.item_id || r.quantity === '') return '-'
              const diff = Number(r.quantity) - (current[r.item_id] ?? 0)
              return <span className={diff > 0 ? 'text-green-700' : diff < 0 ? 'text-red-600' : ''}>{diff > 0 ? '+' : ''}{formatQty(diff)}</span>
            },
          },
        ]}
      />
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Batal</Button>
        <Button variant="warning" onClick={submit} disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan Penyesuaian'}</Button>
      </div>
    </Modal>
  )
}
