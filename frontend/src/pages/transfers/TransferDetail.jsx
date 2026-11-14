import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import LineItemsEditor, { newLine } from '../../components/LineItemsEditor'
import { Alert, Button, Card, Field, Info, PageHeader, StatusBadge, Table, Timeline, inputClass } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import api from '../../lib/api'
import { errorMessage, formatDate, formatDateTime, formatQty, todayISO } from '../../lib/format'
import { useApi, useItems, useLocations } from '../../lib/hooks'

export default function TransferDetail() {
  const { id } = useParams()
  return id ? <TransferView id={id} /> : <TransferCreate />
}

/** Pak Nurdin: kirim barang dari gudang ke lapangan (opsional berdasarkan UR). */
function TransferCreate() {
  const [params] = useSearchParams()
  const urId = params.get('ur')
  const navigate = useNavigate()
  const { user } = useAuth()
  const items = useItems()
  const locations = useLocations()
  const warehouses = locations.filter((l) => l.type === 'warehouse' && l.assigned)
  const [form, setForm] = useState({ from: '', to: '', date: todayISO(), note: '' })
  const [rows, setRows] = useState([newLine()])
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const ur = useApi(urId ? `/user-requests/${urId}` : null).data?.data
  useEffect(() => {
    if (!ur) return
    setForm((f) => ({ ...f, from: ur.warehouse.id, to: ur.field.id, note: `Berdasarkan ${ur.number}` }))
    setRows(ur.items.map((i) => newLine({ item_id: i.item_id, quantity: String(i.quantity) })))
  }, [ur])

  const from = form.from || warehouses[0]?.id || ''
  const fields = locations.filter((l) => l.type === 'field' && l.parent_id === Number(from))
  const stock = useApi(from ? '/stock/balances' : null, { location_id: from }).data?.data || {}

  if (user.role !== 'operation1') return <Card><Alert>Hanya Operation yang bisa mengirim barang ke lapangan.</Alert></Card>

  const submit = async () => {
    if (!window.confirm('Kirim barang ke lapangan? Stok gudang akan berkurang.')) return
    setBusy(true)
    setErrors({})
    setError('')
    try {
      const res = await api.post('/transfers', {
        from_location_id: Number(from),
        to_location_id: Number(form.to) || null,
        user_request_id: urId ? Number(urId) : null,
        transfer_date: form.date,
        note: form.note || null,
        items: rows.filter((r) => r.item_id || r.quantity !== '').map((r) => ({ item_id: r.item_id, quantity_sent: r.quantity, note: r.note || null })),
      })
      navigate(`/transfers/${res.data.data.id}`, { replace: true })
    } catch (err) {
      if (err.response?.status === 422) setErrors(Object.fromEntries(Object.entries(err.response.data.errors || {}).map(([k, v]) => [k.replace('quantity_sent', 'quantity'), v])))
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader back="/transfers" title="Kirim Barang ke Lapangan" subtitle={ur ? `Berdasarkan ${ur.number} dari ${ur.field?.name}` : 'Kirim barang dari gudang sesuai kebutuhan lapangan.'} />
      <Card>
        <Alert>{error}</Alert>
        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          <Field label="Dari gudang" error={errors.from_location_id?.[0]}>
            <select value={from} disabled={!!ur} onChange={(e) => setForm({ ...form, from: e.target.value, to: '' })} className={inputClass}>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
          <Field label="Ke lapangan" error={errors.to_location_id?.[0]}>
            <select value={form.to} disabled={!!ur} onChange={(e) => setForm({ ...form, to: e.target.value })} className={inputClass}>
              <option value="">— Pilih —</option>
              {fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
          <Field label="Tanggal kirim" error={errors.transfer_date?.[0]}>
            <input type="date" max={todayISO()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Catatan (opsional)">
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputClass} maxLength={1000} />
          </Field>
        </div>
        <LineItemsEditor
          items={items}
          rows={rows}
          setRows={setRows}
          editable
          errors={errors}
          qtyLabel="Jumlah dikirim"
          extraColumns={[
            ...(ur ? [{ label: 'Diminta UR', className: 'text-right', render: (r) => formatQty(ur.items.find((i) => i.item_id === Number(r.item_id))?.quantity) }] : []),
            { label: 'Stok gudang', className: 'text-right', render: (r) => (r.item_id ? formatQty(stock[r.item_id] ?? 0) : '-') },
          ]}
        />
        <div className="mt-5 flex justify-end border-t pt-4">
          <Button onClick={submit} disabled={busy}>{busy ? 'Mengirim...' : 'Kirim ke Lapangan'}</Button>
        </div>
      </Card>
    </div>
  )
}

/** Detail pengiriman; Pak Haryono mencatat jumlah aktual yang diterima. */
function TransferView({ id }) {
  const { data, loading, error, reload } = useApi(`/transfers/${id}`)
  const t = data?.data
  const [qty, setQty] = useState({})
  const [note, setNote] = useState('')
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  if (loading) return <Card>Memuat...</Card>
  if (!t) return <Card><Alert>{error}</Alert><Link to="/transfers" className="text-blue-600">← Kembali</Link></Card>

  const val = (l) => qty[l.id] ?? String(l.quantity_sent)

  const receive = async () => {
    const diffs = t.items.filter((l) => Number(val(l) || 0) !== l.quantity_sent)
    if (!window.confirm(diffs.length ? `${diffs.length} barang jumlahnya berbeda dari kiriman. Selisih akan dilaporkan ke gudang. Lanjutkan?` : 'Catat semua barang diterima sesuai kiriman?')) return
    setBusy(true)
    setMessage(null)
    try {
      await api.post(`/transfers/${t.id}/receive`, { note: note || null, items: t.items.map((l) => ({ id: l.id, quantity_received: val(l) === '' ? 0 : val(l) })) })
      setMessage({ kind: 'ok', text: 'Penerimaan tercatat. Saldo lapangan sudah bertambah.' })
      reload()
    } catch (err) {
      setMessage({ kind: 'error', text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader back="/transfers" title={`Pengiriman ${t.number}`} subtitle={<span className="flex items-center gap-2"><StatusBadge status={t.status === 'sent' ? 'sent' : 'received'} label={t.status_label} /> {t.from?.name} → {t.to?.name}</span>} />
      <Card>
        <dl className="grid gap-3 sm:grid-cols-4">
          <Info label="Tanggal kirim">{formatDate(t.transfer_date)}</Info>
          <Info label="Dikirim oleh">{t.sender?.name}</Info>
          <Info label="UR">{t.user_request ? <Link className="text-blue-600 hover:underline" to={`/ur/${t.user_request.id}`}>{t.user_request.number}</Link> : '-'}</Info>
          <Info label="Diterima">{t.received_at ? `${t.receiver?.name} · ${formatDateTime(t.received_at)}` : '-'}</Info>
          {t.note && <Info label="Catatan kirim">{t.note}</Info>}
          {t.received_note && <Info label="Catatan terima">{t.received_note}</Info>}
        </dl>
      </Card>
      <Card>
        <Alert kind={message?.kind}>{message?.text}</Alert>
        {t.can.receive && <Alert kind="info">Cek barang yang sampai, lalu isi jumlah aktual yang diterima.</Alert>}
        <Table
          rows={t.items}
          columns={[
            { label: 'Barang', render: (l) => <span className="font-medium">{l.name}</span> },
            { label: 'Satuan', render: (l) => l.unit },
            { label: 'Dikirim', className: 'text-right', render: (l) => formatQty(l.quantity_sent) },
            {
              label: 'Diterima',
              className: 'w-36 text-right',
              render: (l) =>
                t.can.receive ? (
                  <input type="number" min="0" step="any" value={val(l)} onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-right" />
                ) : (
                  formatQty(l.quantity_received)
                ),
            },
            {
              label: 'Selisih',
              className: 'text-right',
              render: (l) => {
                const rec = t.can.receive ? Number(val(l) || 0) : l.quantity_received
                if (rec === null || rec === undefined) return '-'
                const d = rec - l.quantity_sent
                return d === 0 ? <span className="text-green-600">sesuai</span> : <span className={d < 0 ? 'text-red-600' : 'text-blue-600'}>{d > 0 ? '+' : ''}{formatQty(d)}</span>
              },
            },
            { label: 'Catatan', render: (l) => l.note || '-' },
          ]}
        />
        {t.can.receive && (
          <div className="mt-5 flex flex-wrap items-end justify-end gap-2 border-t pt-4">
            <Field label="Catatan penerimaan (opsional)" className="mr-auto w-full sm:w-96">
              <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} maxLength={1000} />
            </Field>
            <Button variant="success" onClick={receive} disabled={busy}>{busy ? 'Menyimpan...' : 'Catat Penerimaan Barang'}</Button>
          </div>
        )}
      </Card>
      <Timeline logs={t.logs} />
    </div>
  )
}
