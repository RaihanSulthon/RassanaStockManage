import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import LineItemsEditor, { newLine } from '../../components/LineItemsEditor'
import { Alert, Button, Card, ExportButtons, Field, Info, PageHeader, StatusBadge, Table, Timeline, inputClass } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import api from '../../lib/api'
import { errorMessage, formatDate, formatDateTime, formatQty, todayISO } from '../../lib/format'
import { useApi, useItems, useLocations } from '../../lib/hooks'
import { toast } from '../../lib/toast'

export default function TransferDetail() {
  const { id } = useParams()
  return id ? <TransferView id={id} /> : <TransferCreate />
}

/** Logistic: kirim barang dari gudang ke lapangan (opsional berdasarkan UR). Stok gudang berkurang sebanyak yang dikirim. */
function TransferCreate() {
  const [params] = useSearchParams()
  const urId = params.get('ur')
  const navigate = useNavigate()
  const { user } = useAuth()
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
  const fields = locations.filter((l) => l.type === 'field' && l.parent_id === Number(from) && l.is_active)
  const stock = useApi(from ? '/stock/balances' : null, { location_id: from }).data?.data || {}
  const items = useItems(from) // barang milik gudang asal

  if (user.role !== 'logistic') return <Card><Alert>Hanya Logistic yang bisa mengirim barang ke lapangan.</Alert></Card>

  const filled = rows.filter((r) => r.item_id && r.quantity !== '')
  const over = filled.filter((r) => Number(r.quantity) > Number(stock[r.item_id] ?? 0))

  const submit = async () => {
    if (over.length) return setError(`${over.length} barang melebihi stok gudang. Kurangi jumlahnya terlebih dahulu.`)
    const to = fields.find((f) => f.id === Number(form.to))
    if (!window.confirm(`Kirim ${filled.length} barang ke ${to?.name || 'lapangan'}? Stok gudang langsung berkurang sebanyak yang dikirim.`)) return
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
      toast('Barang dikirim. Lapangan akan diminta mencatat penerimaannya.')
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
      <PageHeader back="/transfers" title="Kirim Barang ke Lapangan" subtitle={ur ? `Berdasarkan ${ur.number} dari ${ur.field?.name}` : 'Pilih lapangan tujuan, lalu pilih barang satu per satu beserta jumlahnya.'} />
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
            { label: 'Stok gudang sebelum', className: 'text-right', render: (r) => (r.item_id ? formatQty(stock[r.item_id] ?? 0) : '-') },
            {
              label: 'Stok gudang sesudah',
              className: 'text-right',
              render: (r) => {
                if (!r.item_id || r.quantity === '') return '-'
                const after = Number(stock[r.item_id] ?? 0) - Number(r.quantity)
                return after < 0 ? <span className="font-semibold text-red-600">Stok kurang {formatQty(-after)}</span> : <b>{formatQty(after)}</b>
              },
            },
          ]}
        />
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t pt-4">
          <span className="mr-auto text-sm text-slate-500">{filled.length} barang akan dikirim</span>
          <Button onClick={submit} disabled={busy || !filled.length || !form.to}>{busy ? 'Mengirim...' : 'Kirim ke Lapangan'}</Button>
        </div>
      </Card>
    </div>
  )
}

const RESOLUTIONS = [
  ['lost', 'Hilang', 'Barang tidak ditemukan. Dicatat sebagai hilang; stok gudang tidak kembali.'],
  ['returned', 'Belum terkirim', 'Barang ternyata masih di gudang. Jumlah selisih dikembalikan ke stok gudang.'],
  ['in_transit', 'Tertinggal di perjalanan', 'Barang akan menyusul. Lapangan mencatat terima susulan saat barang sampai.'],
]

const SHORTAGE_STYLE = {
  open: 'bg-red-100 text-red-700',
  in_transit: 'bg-amber-100 text-amber-800',
  lost: 'bg-slate-200 text-slate-700',
  returned: 'bg-blue-100 text-blue-800',
  arrived: 'bg-green-100 text-green-800',
}

/** Detail pengiriman: lapangan mencatat penerimaan; Logistic menindaklanjuti selisih; lapangan mencatat susulan. */
function TransferView({ id }) {
  const { data, loading, error, reload } = useApi(`/transfers/${id}`)
  const t = data?.data
  const [qty, setQty] = useState({})
  const [note, setNote] = useState('')
  const [resolve, setResolve] = useState({}) // line id -> { resolution, note }
  const [late, setLate] = useState({}) // line id -> qty
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState('')

  if (loading && !t) return <Card>Memuat...</Card>
  if (!t) return <Card><Alert>{error}</Alert><Link to="/transfers" className="text-blue-600">← Kembali</Link></Card>

  const showStock = t.items.some((l) => 'stock_before' in l)
  const val = (l) => qty[l.id] ?? String(l.quantity_sent)
  const overLines = t.can.receive ? t.items.filter((l) => Number(val(l) || 0) > l.quantity_sent) : []

  const run = async (key, fn, ok) => {
    setBusy(key)
    setMessage(null)
    try {
      await fn()
      toast(ok)
      setResolve({})
      setLate({})
      reload()
    } catch (err) {
      setMessage({ kind: 'error', text: errorMessage(err) })
    } finally {
      setBusy('')
    }
  }

  const receive = () => {
    if (overLines.length) return setMessage({ kind: 'error', text: 'Jumlah diterima tidak boleh melebihi jumlah yang dikirim.' })
    const short = t.items.filter((l) => Number(val(l) || 0) < l.quantity_sent)
    if (!window.confirm(short.length ? `${short.length} barang diterima kurang dari yang dikirim. Selisihnya akan dilaporkan ke Logistic untuk ditindaklanjuti. Lanjutkan?` : 'Catat semua barang diterima sesuai kiriman?')) return
    run('receive', () => api.post(`/transfers/${t.id}/receive`, { note: note || null, items: t.items.map((l) => ({ id: l.id, quantity_received: val(l) === '' ? 0 : val(l) })) }), 'Penerimaan tercatat. Stok lapangan sudah bertambah.')
  }

  const openLines = t.items.filter((l) => l.shortage_status === 'open')
  const submitResolve = () => {
    const rows = openLines.filter((l) => resolve[l.id]?.resolution).map((l) => ({ id: l.id, resolution: resolve[l.id].resolution, note: resolve[l.id].note || null }))
    if (!rows.length) return setMessage({ kind: 'error', text: 'Pilih tindak lanjut minimal untuk satu barang.' })
    if (!window.confirm(`Simpan tindak lanjut untuk ${rows.length} barang?`)) return
    run('resolve', () => api.post(`/transfers/${t.id}/resolve`, { items: rows }), 'Tindak lanjut selisih tersimpan.')
  }

  const lateLines = t.items.filter((l) => l.shortage_status === 'in_transit')
  const submitLate = () => {
    const rows = lateLines.filter((l) => late[l.id] && Number(late[l.id]) > 0).map((l) => ({ id: l.id, quantity: late[l.id] }))
    if (!rows.length) return setMessage({ kind: 'error', text: 'Isi jumlah barang susulan yang sudah sampai.' })
    if (!window.confirm(`Catat penerimaan susulan untuk ${rows.length} barang? Stok lapangan akan bertambah.`)) return
    run('late', () => api.post(`/transfers/${t.id}/receive-late`, { items: rows }), 'Barang susulan tercatat. Stok lapangan sudah bertambah.')
  }

  return (
    <div className="space-y-4">
      <PageHeader back="/transfers" title={`Pengiriman ${t.number}`} subtitle={<span className="flex items-center gap-2"><StatusBadge status={t.status} label={t.status_label} /> {t.from?.name} → {t.to?.name}</span>}>
        {t.can.export && <ExportButtons url={`/transfers/${t.id}/export`} filename={`pengiriman-${t.number}`} onError={(text) => setMessage({ kind: 'error', text })} />}
      </PageHeader>
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
        {t.can.receive && <Alert kind="info">Hitung barang yang sampai, lalu isi jumlah yang <b>benar-benar diterima</b>. Jumlah tidak boleh melebihi yang dikirim; jika kurang, selisihnya otomatis dilaporkan ke Logistic.</Alert>}
        <Table
          rows={t.items}
          columns={[
            { label: 'Barang', render: (l) => <span className="font-medium">{l.name}</span> },
            { label: 'Satuan', render: (l) => l.unit },
            ...(showStock ? [{ label: 'Stok gudang sebelum', className: 'text-right text-slate-500', render: (l) => formatQty(l.stock_before) }] : []),
            { label: 'Dikirim', className: 'text-right', render: (l) => formatQty(l.quantity_sent) },
            ...(showStock ? [{ label: 'Stok gudang sesudah', className: 'text-right text-slate-500', render: (l) => formatQty(l.stock_after) }] : []),
            {
              label: 'Diterima',
              className: 'w-36 text-right',
              render: (l) =>
                t.can.receive ? (
                  <>
                    <input type="number" min="0" max={l.quantity_sent} step="any" value={val(l)} onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })} className={`w-full rounded border px-2 py-1.5 text-right ${Number(val(l) || 0) > l.quantity_sent ? 'border-red-400' : 'border-slate-300'}`} />
                    {Number(val(l) || 0) > l.quantity_sent && <div className="mt-0.5 text-xs text-red-600">Maks. {formatQty(l.quantity_sent)}</div>}
                  </>
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
            {
              label: 'Tindak lanjut selisih',
              render: (l) =>
                l.shortage_status ? (
                  <div className="space-y-0.5">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${SHORTAGE_STYLE[l.shortage_status]}`}>{l.shortage_label}</span>
                    {l.shortage_note && <div className="text-xs text-slate-500">{l.shortage_note}</div>}
                    {l.shortage_resolver && <div className="text-xs text-slate-400">{l.shortage_resolver.name} · {formatDateTime(l.shortage_resolved_at)}</div>}
                  </div>
                ) : (
                  <span className="text-slate-300">-</span>
                ),
            },
            { label: 'Catatan', render: (l) => l.note || '-' },
          ]}
        />
        {t.can.receive && (
          <div className="mt-5 flex flex-wrap items-end justify-end gap-2 border-t pt-4">
            <Field label="Catatan penerimaan (opsional)" className="mr-auto w-full sm:w-96">
              <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} maxLength={1000} />
            </Field>
            <Button variant="success" onClick={receive} disabled={!!busy || overLines.length > 0}>{busy === 'receive' ? 'Menyimpan...' : 'Catat Penerimaan Barang'}</Button>
          </div>
        )}
      </Card>

      {t.can.resolve && (
        <Card>
          <h2 className="mb-1 font-semibold text-slate-800">Tindak Lanjut Selisih</h2>
          <p className="mb-3 text-sm text-slate-500">Lapangan menerima lebih sedikit dari yang dikirim. Cek kembali, lalu tentukan apa yang terjadi pada setiap selisih.</p>
          <div className="space-y-3">
            {openLines.map((l) => (
              <div key={l.id} className="rounded border p-3">
                <div className="mb-2 text-sm">
                  <b className="text-slate-800">{l.name}</b>: dikirim {formatQty(l.quantity_sent)}, diterima {formatQty(l.quantity_received)},{' '}
                  <span className="font-semibold text-red-600">selisih {formatQty(l.outstanding)} {l.unit}</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {RESOLUTIONS.map(([v, label, desc]) => (
                    <label key={v} className={`cursor-pointer rounded border p-2 text-sm ${resolve[l.id]?.resolution === v ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-400'}`}>
                      <span className="flex items-center gap-2 font-medium text-slate-800">
                        <input type="radio" name={`res-${l.id}`} checked={resolve[l.id]?.resolution === v} onChange={() => setResolve({ ...resolve, [l.id]: { ...resolve[l.id], resolution: v } })} />
                        {label}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">{desc}</span>
                    </label>
                  ))}
                </div>
                <input
                  placeholder="Keterangan (opsional), mis. hasil pengecekan"
                  value={resolve[l.id]?.note || ''}
                  onChange={(e) => setResolve({ ...resolve, [l.id]: { ...resolve[l.id], note: e.target.value } })}
                  maxLength={255}
                  className="mt-2 w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={submitResolve} disabled={!!busy}>{busy === 'resolve' ? 'Menyimpan...' : 'Simpan Tindak Lanjut'}</Button>
          </div>
        </Card>
      )}

      {t.can.receive_late && (
        <Card>
          <h2 className="mb-1 font-semibold text-slate-800">Terima Barang Susulan</h2>
          <p className="mb-3 text-sm text-slate-500">Logistic menandai barang berikut tertinggal di perjalanan. Saat barangnya sampai, hitung lalu catat di sini.</p>
          <Table
            rows={lateLines}
            columns={[
              { label: 'Barang', render: (l) => <span className="font-medium">{l.name}</span> },
              { label: 'Belum sampai', className: 'text-right', render: (l) => `${formatQty(l.outstanding)} ${l.unit}` },
              {
                label: 'Diterima sekarang',
                className: 'w-40',
                render: (l) => (
                  <input type="number" min="0" max={l.outstanding} step="any" value={late[l.id] ?? ''} placeholder="0" onChange={(e) => setLate({ ...late, [l.id]: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-right" />
                ),
              },
            ]}
          />
          <div className="mt-4 flex justify-end">
            <Button variant="success" onClick={submitLate} disabled={!!busy}>{busy === 'late' ? 'Menyimpan...' : 'Catat Barang Susulan'}</Button>
          </div>
        </Card>
      )}

      <Timeline logs={t.logs} />
    </div>
  )
}
