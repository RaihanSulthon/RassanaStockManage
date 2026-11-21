import { useState } from 'react'
import { Alert, Button, Field, Modal, inputClass } from '../../components/ui'
import api from '../../lib/api'
import { errorMessage, formatQty, todayISO } from '../../lib/format'
import { useApi } from '../../lib/hooks'

/** Logistic: terima barang & surat jalan dari vendor (bisa bertahap). Jumlah diisi sesuai barang aktual; stok gudang sebelum/sesudah ikut ditampilkan. */
export default function ReceiveModal({ po, onClose, onDone }) {
  const [form, setForm] = useState({
    delivery_note_number: '',
    received_date: todayISO(),
    note: '',
    // Default: sisa yang belum diterima
    lines: Object.fromEntries(po.items.map((i) => [i.id, { qty: String(Math.max(0, i.remaining)), note: '' }])),
  })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const stock = useApi(po.warehouse?.id ? '/stock/balances' : null, { location_id: po.warehouse?.id }).data?.data || {}

  const setLine = (id, patch) => setForm((f) => ({ ...f, lines: { ...f.lines, [id]: { ...f.lines[id], ...patch } } }))

  const submit = async () => {
    const lines = po.items.map((i) => ({ purchase_order_item_id: i.id, quantity_received: form.lines[i.id].qty === '' ? 0 : form.lines[i.id].qty, note: form.lines[i.id].note || null }))
    const diffs = po.items.filter((i) => Number(form.lines[i.id].qty || 0) !== Math.max(0, i.remaining))
    if (!window.confirm(diffs.length ? `Ada ${diffs.length} barang yang jumlahnya berbeda dari sisa PO. Selisih akan tercatat di riwayat. Lanjutkan?` : 'Simpan penerimaan barang? Stok gudang akan bertambah.')) return
    setBusy(true)
    setErrors({})
    setError('')
    try {
      const res = await api.post(`/purchase-orders/${po.id}/receipts`, { ...form, items: lines })
      onDone(res.data.data)
    } catch (err) {
      if (err.response?.status === 422) setErrors(err.response.data.errors || {})
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Terima Barang · ${po.number}`} onClose={onClose} wide>
      <Alert>{error}</Alert>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Field label="No. surat jalan" error={errors.delivery_note_number?.[0]}>
          <input value={form.delivery_note_number} onChange={(e) => setForm({ ...form, delivery_note_number: e.target.value })} className={inputClass} maxLength={100} />
        </Field>
        <Field label="Tanggal terima" error={errors.received_date?.[0]}>
          <input type="date" max={todayISO()} value={form.received_date} onChange={(e) => setForm({ ...form, received_date: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Catatan (opsional)">
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputClass} maxLength={1000} />
        </Field>
      </div>

      <p className="mb-2 text-sm text-slate-500">Cek barang sesuai surat jalan & PO. Isi jumlah aktual yang diterima (0 jika belum datang).</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-slate-500">
            <tr>
              <th className="py-2 pr-2">Barang</th>
              <th className="py-2 pr-2 text-right">Dipesan</th>
              <th className="py-2 pr-2 text-right">Sudah diterima</th>
              <th className="py-2 pr-2 text-right">Sisa</th>
              <th className="py-2 pr-2 text-right">Stok gudang sekarang</th>
              <th className="w-32 py-2 pr-2">Diterima sekarang</th>
              <th className="py-2 pr-2 text-right">Stok sesudah</th>
              <th className="py-2 pr-2">Catatan</th>
            </tr>
          </thead>
          <tbody>
            {po.items.map((i, idx) => {
              const after = Number(i.remaining) - Number(form.lines[i.id].qty || 0)
              const before = Number(stock[i.item_id] ?? 0)
              return (
                <tr key={i.id} className="border-b align-top last:border-0">
                  <td className="py-2 pr-2 font-medium">{i.name} <span className="text-slate-400">({i.unit})</span></td>
                  <td className="py-2 pr-2 text-right">{formatQty(i.quantity)}</td>
                  <td className="py-2 pr-2 text-right">{formatQty(i.quantity_received)}</td>
                  <td className="py-2 pr-2 text-right">{formatQty(Math.max(0, i.remaining))}</td>
                  <td className="py-2 pr-2 text-right text-slate-500">{formatQty(before)}</td>
                  <td className="py-2 pr-2">
                    <input type="number" min="0" step="any" value={form.lines[i.id].qty} onChange={(e) => setLine(i.id, { qty: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5" />
                    {after > 0.0005 && <p className="mt-1 text-xs text-amber-600">Masih kurang {formatQty(after)}</p>}
                    {after < -0.0005 && <p className="mt-1 text-xs text-blue-600">Lebih {formatQty(-after)}</p>}
                    {errors[`items.${idx}.quantity_received`] && <p className="mt-1 text-xs text-red-600">{errors[`items.${idx}.quantity_received`][0]}</p>}
                  </td>
                  <td className="py-2 pr-2 text-right font-semibold">{formatQty(before + Number(form.lines[i.id].qty || 0))}</td>
                  <td className="py-2 pr-2">
                    <input value={form.lines[i.id].note} onChange={(e) => setLine(i.id, { note: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5" maxLength={255} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {errors.items && <p className="mt-2 text-sm text-red-600">{errors.items[0]}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Batal</Button>
        <Button variant="success" onClick={submit} disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan Penerimaan'}</Button>
      </div>
    </Modal>
  )
}
