import { useState } from 'react'
import { Alert, Button, Card, ExportButtons, Field, Modal, StatusBadge, Table, inputClass } from '../../components/ui'
import api from '../../lib/api'
import { errorMessage, formatDate, formatMoney, todayISO } from '../../lib/format'

const METHODS = { transfer: 'Transfer Bank', tunai: 'Tunai', lainnya: 'Lainnya' }

/**
 * Pak Fauzan: cek data PO + surat jalan + penerimaan gudang, siapkan pembayaran (catat tagihan),
 * lalu lakukan pembayaran.
 */
export default function PaymentSection({ po, onChanged }) {
  const [modal, setModal] = useState(null) // { mode: 'prepare' | 'edit' | 'pay', payment? }
  const [message, setMessage] = useState(null)
  const s = po.summary || {}
  const diff = Math.round(((s.invoice_total || 0) - (s.received_value || 0)) * 100) / 100

  const remove = async (p) => {
    if (!window.confirm(`Hapus data pembayaran ${p.number}?`)) return
    try {
      await api.delete(`/payments/${p.id}`)
      onChanged()
    } catch (err) {
      setMessage({ kind: 'error', text: errorMessage(err) })
    }
  }

  if (!po.can.pay && !po.payments?.length) return null

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-800">Pembayaran ke Vendor</h2>
        {po.can.pay && <Button size="sm" onClick={() => setModal({ mode: 'prepare' })}>+ Siapkan Pembayaran</Button>}
      </div>
      <Alert kind={message?.kind}>{message?.text}</Alert>

      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        {[
          ['Total PO', s.total],
          ['Nilai barang diterima', s.received_value],
          ['Total tagihan', s.invoice_total],
          ['Sudah dibayar', s.paid_total],
        ].map(([l, v]) => (
          <div key={l} className="rounded border px-3 py-2">
            <div className="text-xs text-slate-500">{l}</div>
            <div className="font-bold text-slate-800">{formatMoney(v || 0)}</div>
          </div>
        ))}
      </div>
      {po.payments?.length > 0 && Math.abs(diff) > 0.005 && (
        <Alert kind="warn">Total tagihan {diff > 0 ? 'lebih besar' : 'lebih kecil'} {formatMoney(Math.abs(diff))} dibanding nilai barang yang diterima gudang. Cek kembali surat jalan & penerimaan.</Alert>
      )}

      <Table
        empty="Belum ada tagihan yang dicatat."
        rows={po.payments}
        columns={[
          { label: 'Nomor', render: (p) => <span className="font-medium">{p.number}</span> },
          { label: 'No. tagihan', render: (p) => p.invoice_number },
          { label: 'Tgl tagihan', render: (p) => formatDate(p.invoice_date) },
          { label: 'Nominal', className: 'text-right', render: (p) => formatMoney(p.invoice_amount) },
          { label: 'Status', render: (p) => <StatusBadge status={p.status} label={p.status_label} /> },
          { label: 'Dibayar', render: (p) => (p.paid_date ? `${formatDate(p.paid_date)} · ${p.method_label}${p.reference_number ? ` · ${p.reference_number}` : ''}` : '-') },
          {
            label: '',
            className: 'text-right whitespace-nowrap',
            render: (p) => (
              <div className="flex flex-wrap justify-end gap-2">
                {p.can.pay && <Button size="sm" variant="success" onClick={() => setModal({ mode: 'pay', payment: p })}>Lakukan Pembayaran</Button>}
                {p.can.update && <Button size="sm" variant="secondary" onClick={() => setModal({ mode: 'edit', payment: p })}>Edit</Button>}
                {p.can.delete && <Button size="sm" variant="danger" onClick={() => remove(p)}>Hapus</Button>}
                {p.can.export && <ExportButtons url={`/payments/${p.id}/export`} filename={p.number} onError={(t) => setMessage({ kind: 'error', text: t })} />}
              </div>
            ),
          },
        ]}
      />

      {modal && (
        <PaymentModal
          po={po}
          modal={modal}
          onClose={() => setModal(null)}
          onDone={(text) => {
            setModal(null)
            setMessage({ kind: 'ok', text })
            onChanged()
          }}
        />
      )}
    </Card>
  )
}

function PaymentModal({ po, modal, onClose, onDone }) {
  const p = modal.payment
  const paying = modal.mode === 'pay'
  const [form, setForm] = useState(
    paying
      ? { method: 'transfer', paid_date: todayISO(), reference_number: '', note: p.note || '' }
      : {
          invoice_number: p?.invoice_number || '',
          invoice_date: p?.invoice_date || todayISO(),
          invoice_amount: p?.invoice_amount ?? Math.max(0, (po.summary?.received_value || 0) - (po.summary?.invoice_total || 0)),
          note: p?.note || '',
        },
  )
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (paying && !window.confirm(`Lakukan pembayaran ${formatMoney(p.invoice_amount)} untuk tagihan ${p.invoice_number}?`)) return
    setBusy(true)
    setErrors({})
    setError('')
    try {
      if (paying) await api.post(`/payments/${p.id}/pay`, form)
      else if (p) await api.put(`/payments/${p.id}`, form)
      else await api.post(`/purchase-orders/${po.id}/payments`, form)
      onDone(paying ? 'Pembayaran tercatat.' : 'Pembayaran disiapkan.')
    } catch (err) {
      if (err.response?.status === 422) setErrors(err.response.data.errors || {})
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const e = (k) => errors[k]?.[0]

  return (
    <Modal title={paying ? `Lakukan Pembayaran · ${p.invoice_number}` : p ? 'Edit Tagihan' : 'Siapkan Pembayaran'} onClose={onClose}>
      <Alert>{error}</Alert>
      <div className="space-y-3">
        {paying ? (
          <>
            <div className="rounded bg-slate-50 px-3 py-2 text-sm">Nominal: <b>{formatMoney(p.invoice_amount)}</b></div>
            <Field label="Metode" error={e('method')}>
              <select value={form.method} onChange={(ev) => setForm({ ...form, method: ev.target.value })} className={inputClass}>
                {Object.entries(METHODS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Tanggal bayar" error={e('paid_date')}>
              <input type="date" max={todayISO()} value={form.paid_date} onChange={(ev) => setForm({ ...form, paid_date: ev.target.value })} className={inputClass} />
            </Field>
            <Field label="No. referensi (opsional)" error={e('reference_number')}>
              <input value={form.reference_number} onChange={(ev) => setForm({ ...form, reference_number: ev.target.value })} className={inputClass} maxLength={100} />
            </Field>
          </>
        ) : (
          <>
            <Field label="No. tagihan vendor" error={e('invoice_number')}>
              <input value={form.invoice_number} onChange={(ev) => setForm({ ...form, invoice_number: ev.target.value })} className={inputClass} maxLength={100} />
            </Field>
            <Field label="Tanggal tagihan" error={e('invoice_date')}>
              <input type="date" max={todayISO()} value={form.invoice_date} onChange={(ev) => setForm({ ...form, invoice_date: ev.target.value })} className={inputClass} />
            </Field>
            <Field label="Nominal tagihan (Rp)" error={e('invoice_amount')}>
              <input type="number" min="0" step="any" value={form.invoice_amount} onChange={(ev) => setForm({ ...form, invoice_amount: ev.target.value })} className={inputClass} />
            </Field>
          </>
        )}
        <Field label="Catatan (opsional)">
          <textarea rows={2} value={form.note} onChange={(ev) => setForm({ ...form, note: ev.target.value })} className={inputClass} maxLength={1000} />
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Batal</Button>
        <Button variant={paying ? 'success' : 'primary'} onClick={submit} disabled={busy}>{busy ? 'Menyimpan...' : paying ? 'Bayar' : 'Simpan'}</Button>
      </div>
    </Modal>
  )
}
