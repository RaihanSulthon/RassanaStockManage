import { useState } from 'react'
import LineItemsEditor, { newLine } from '../components/LineItemsEditor'
import { Alert, Button, Card, Field, PageHeader, Pager, StatusBadge, Table, inputClass } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import api from '../lib/api'
import { errorMessage, formatDate, formatDateTime, formatQty, todayISO } from '../lib/format'
import { useApi, useItems } from '../lib/hooks'

/** Catat Pemakaian Harian (Pak Haryono) + riwayat pemakaian. */
export default function Usage() {
  const { user } = useAuth()
  const canCreate = user.role === 'user'
  const fields = (user.locations || []).filter((l) => l.type === 'field')
  const items = useItems()

  const [fieldId, setFieldId] = useState(fields[0]?.id || '')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [rows, setRows] = useState([newLine()])
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState(1)

  const balances = useApi(canCreate && fieldId ? '/stock/balances' : null, { location_id: fieldId })
  const stock = balances.data?.data || {}
  const list = useApi('/usages', { page })

  const save = async () => {
    const lines = rows.filter((r) => r.item_id || r.quantity !== '')
    if (!window.confirm(`Simpan pemakaian ${lines.length} barang tanggal ${formatDate(date)}? Saldo lapangan akan berkurang.`)) return
    setBusy(true)
    setErrors({})
    setMessage(null)
    try {
      await api.post('/usages', { location_id: fieldId || null, usage_date: date, note: note || null, items: lines.map((r) => ({ item_id: r.item_id, quantity: r.quantity, note: r.note || null })) })
      setRows([newLine()])
      setNote('')
      setMessage({ kind: 'ok', text: 'Pemakaian tersimpan. Saldo lapangan sudah diperbarui.' })
      balances.reload()
      list.reload()
    } catch (err) {
      if (err.response?.status === 422) setErrors(err.response.data.errors || {})
      setMessage({ kind: 'error', text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const cancel = async (u) => {
    if (!window.confirm(`Batalkan pemakaian ${u.number}? Saldo akan dikembalikan.`)) return
    try {
      await api.post(`/usages/${u.id}/cancel`)
      setMessage({ kind: 'ok', text: `${u.number} dibatalkan.` })
      balances.reload()
      list.reload()
    } catch (err) {
      setMessage({ kind: 'error', text: errorMessage(err) })
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Pemakaian Harian" subtitle={canCreate ? 'Catat barang yang terpakai di lapangan hari ini. Saldo lapangan berkurang otomatis.' : 'Riwayat pemakaian di lapangan.'} />

      {canCreate && (
        <Card>
          <Alert kind={message?.kind}>{message?.text}</Alert>
          {fields.length === 0 ? (
            <Alert kind="warn">Akun Anda belum ditugaskan ke lapangan. Hubungi Admin.</Alert>
          ) : (
            <>
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                {fields.length > 1 && (
                  <Field label="Lapangan" error={errors.location_id?.[0]}>
                    <select value={fieldId} onChange={(e) => setFieldId(e.target.value)} className={inputClass}>
                      {fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </Field>
                )}
                <Field label="Tanggal pemakaian" error={errors.usage_date?.[0]}>
                  <input type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
                </Field>
                <Field label="Catatan (opsional)" className="sm:col-span-2">
                  <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} maxLength={1000} placeholder="mis. menu makan siang 300 porsi" />
                </Field>
              </div>
              <LineItemsEditor
                items={items}
                rows={rows}
                setRows={setRows}
                editable
                errors={errors}
                qtyLabel="Jumlah dipakai"
                extraColumns={[
                  { label: 'Saldo saat ini', className: 'text-right', render: (r) => (r.item_id ? formatQty(stock[r.item_id] ?? 0) : '-') },
                  {
                    label: 'Sisa setelah',
                    className: 'text-right',
                    render: (r) => {
                      if (!r.item_id) return '-'
                      const after = (stock[r.item_id] ?? 0) - Number(r.quantity || 0)
                      return <span className={after < 0 ? 'font-semibold text-red-600' : ''}>{formatQty(after)}</span>
                    },
                  },
                ]}
              />
              <div className="mt-5 flex justify-end border-t pt-4">
                <Button onClick={save} disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan Pemakaian'}</Button>
              </div>
            </>
          )}
        </Card>
      )}

      <Card>
        {!canCreate && <Alert kind={message?.kind}>{message?.text}</Alert>}
        <h2 className="mb-3 font-semibold text-slate-800">Riwayat pemakaian</h2>
        <Table
          loading={list.loading}
          rows={list.data?.data}
          empty="Belum ada pemakaian."
          columns={[
            { label: 'Nomor', render: (u) => <span className="font-medium">{u.number}</span> },
            { label: 'Tanggal', render: (u) => formatDate(u.usage_date) },
            { label: 'Lapangan', render: (u) => u.location?.name },
            { label: 'Barang', render: (u) => <ul className="text-slate-600">{u.items.map((i) => <li key={i.id}>{i.name}: {formatQty(i.quantity)} {i.unit}</li>)}</ul> },
            { label: 'Catatan', render: (u) => <span className="text-slate-500">{u.note || '-'}</span> },
            { label: 'Dicatat', render: (u) => <span className="text-xs text-slate-500">{u.creator?.name}<br />{formatDateTime(u.created_at)}</span> },
            {
              label: '',
              className: 'text-right',
              render: (u) => (u.cancelled_at ? <StatusBadge status="cancelled" label="Dibatalkan" /> : u.can.cancel ? <Button size="sm" variant="danger" onClick={() => cancel(u)}>Batalkan</Button> : null),
            },
          ]}
        />
        <Pager meta={list.data?.meta} page={page} setPage={setPage} />
      </Card>
    </div>
  )
}
