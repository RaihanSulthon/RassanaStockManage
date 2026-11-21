import { useEffect } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import LineItemsEditor, { newLine } from '../../components/LineItemsEditor'
import { Alert, Button, Card, ExportButtons, Field, Info, PageHeader, StatusBadge, Stepper, Timeline, inputClass } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { PERIODS, formatDateTime, formatQty, todayISO } from '../../lib/format'
import { useApi, useItems } from '../../lib/hooks'
import { useDocument } from '../../lib/useDocument'

const emptyForm = () => ({ warehouse_id: '', period: 'mingguan', needed_date: '', note: '', rows: [newLine()] })
const toForm = (d) => ({
  warehouse_id: d.warehouse?.id || '',
  period: d.period,
  needed_date: d.needed_date || '',
  note: d.note || '',
  rows: d.items.map((i) => newLine({ item_id: i.item_id, quantity: String(i.quantity), note: i.note || '', name: i.name, unit: i.unit })),
})
const toPayload = (f) => ({
  warehouse_id: f.warehouse_id || null,
  period: f.period,
  needed_date: f.needed_date || null,
  note: f.note || null,
  items: f.rows.filter((r) => r.item_id || r.quantity !== '').map((r) => ({ item_id: r.item_id, quantity: r.quantity, note: r.note || null })),
})

const STEPS = ['Logistic membuat PR', 'Purchasing memvalidasi', 'Dibuatkan PO']
const stepIndex = { draft: 0, submitted: 1, processed: 2 }

/** Status stok terhadap min/max setelah barang PR datang. */
function MinMaxHint({ stock, qty, min, max }) {
  const after = Number(stock || 0) + Number(qty || 0)
  if (min == null && max == null) return <span className="text-slate-400">-</span>
  if (max != null && after > max) return <span className="text-amber-600">Melebihi max ({formatQty(after)})</span>
  if (min != null && after < min) return <span className="text-red-600">Masih di bawah min ({formatQty(after)})</span>
  return <span className="text-green-600">Sesuai ({formatQty(after)})</span>
}

export default function PrDetail() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const urId = params.get('ur')
  const { user } = useAuth()
  const navigate = useNavigate()
  const warehouses = (user.locations || []).filter((l) => l.type === 'warehouse')

  const d = useDocument({
    id, endpoint: '/purchase-requisitions', route: '/pr', emptyForm, toForm, toPayload,
    createExtra: urId ? { user_request_id: Number(urId) } : undefined,
  })
  const { doc, form, setForm, editing, isNew } = d

  // PR dari UR: isi otomatis barang & jumlah dari UR
  const ur = useApi(isNew && urId ? `/user-requests/${urId}` : null).data?.data
  useEffect(() => {
    if (!ur) return
    setForm((f) => ({
      ...f,
      warehouse_id: ur.warehouse?.id || '',
      note: f.note || `Berdasarkan ${ur.number}`,
      rows: ur.items.map((i) => newLine({ item_id: i.item_id, quantity: String(i.quantity), note: i.note || '' })),
    }))
  }, [ur, setForm])

  const whId = doc?.warehouse?.id || form.warehouse_id || (warehouses.length === 1 ? warehouses[0].id : null)
  const whStock = useApi(whId ? '/stock/balances' : null, { location_id: whId }).data?.data || {}
  const items = useItems(whId)
  const byId = Object.fromEntries(items.map((i) => [i.id, i]))

  if (d.loading) return <Card>Memuat...</Card>
  if (!isNew && !doc) return <Card><Alert>{d.message?.text}</Alert><Link to="/pr" className="text-blue-600">← Kembali</Link></Card>

  const can = doc?.can || {}
  const editable = isNew || (can.update && editing)
  const busy = d.busy !== ''
  const docLine = (itemId) => doc?.items?.find((i) => i.item_id === Number(itemId))
  const stockOf = (r) => (editable ? whStock[r.item_id] ?? 0 : docLine(r.item_id)?.warehouse_stock ?? whStock[r.item_id] ?? 0)

  return (
    <div className="space-y-4">
      <PageHeader
        back="/pr"
        title={isNew ? 'PR Baru' : `Purchasing Requisition ${doc.number}`}
        subtitle={!isNew ? (
          <span className="flex items-center gap-2"><StatusBadge status={doc.status} label={doc.status_label} /> Gudang {doc.warehouse?.name} · {doc.period_label}</span>
        ) : ur ? `Berdasarkan ${ur.number} dari ${ur.field?.name}` : 'Estimasi kebutuhan gudang (tanpa UR)'}
      >
        {!isNew && can.update && !editing && <Button size="sm" onClick={d.startEdit} disabled={busy}>Edit</Button>}
        {!isNew && can.export && !editing && <ExportButtons url={`/purchase-requisitions/${id}/export`} filename={doc.number} onError={(t) => d.setMessage({ kind: 'error', text: t })} />}
        {!isNew && can.delete && !editing && <Button size="sm" variant="danger" onClick={() => d.remove()} disabled={busy}>Hapus</Button>}
      </PageHeader>

      {!isNew && (
        <Card>
          <Stepper steps={STEPS} current={stepIndex[doc.status]} done={doc.status === 'processed'} />
          <dl className="mt-3 grid gap-3 sm:grid-cols-4">
            <Info label="Dibuat oleh">{doc.creator?.name}</Info>
            <Info label="Dikirim">{formatDateTime(doc.submitted_at)}</Info>
            <Info label="Dari UR">{doc.user_request ? <Link className="text-blue-600 hover:underline" to={`/ur/${doc.user_request.id}`}>{doc.user_request.number}</Link> : 'Estimasi'}</Info>
            <Info label="PO">{doc.purchase_order ? <Link className="text-blue-600 hover:underline" to={`/po/${doc.purchase_order.id}`}>{doc.purchase_order.number}</Link> : '-'}</Info>
          </dl>
        </Card>
      )}

      <Card>
        <Alert kind={d.message?.kind}>{d.message?.text}</Alert>
        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          {isNew && !urId && warehouses.length > 1 && (
            <Field label="Gudang" error={d.errors.warehouse_id?.[0]}>
              <select value={form.warehouse_id} onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })} className={inputClass}>
                <option value="">— Pilih —</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Periode kebutuhan" error={d.errors.period?.[0]}>
            <select value={form.period} disabled={!editable} onChange={(e) => setForm({ ...form, period: e.target.value })} className={inputClass}>
              {Object.entries(PERIODS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Dibutuhkan tanggal (opsional)" error={d.errors.needed_date?.[0]}>
            <input type="date" min={todayISO()} value={form.needed_date} disabled={!editable} onChange={(e) => setForm({ ...form, needed_date: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Catatan (opsional)" className="sm:col-span-2">
            <input value={form.note} disabled={!editable} maxLength={1000} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputClass} />
          </Field>
        </div>
        {(d.errors.warehouse_id || d.errors.user_request_id) && <Alert>{(d.errors.warehouse_id || d.errors.user_request_id)[0]}</Alert>}

        {editable && <Alert kind="info">Acuan: stok gudang setelah barang datang sebaiknya di antara batas minimal dan maksimal (ditentukan Purchasing).</Alert>}

        <LineItemsEditor
          items={items}
          rows={form.rows}
          setRows={(fn) => setForm((f) => ({ ...f, rows: typeof fn === 'function' ? fn(f.rows) : fn }))}
          editable={editable}
          errors={d.errors}
          qtyLabel="Jumlah diminta"
          extraColumns={[
            { label: 'Stok gudang', className: 'text-right', render: (r) => (r.item_id ? formatQty(stockOf(r)) : '-') },
            ...(!isNew && doc.fields?.length
              ? doc.fields.map((f) => ({ label: `Saldo ${f.name}`, className: 'text-right text-slate-500', render: (r) => formatQty(docLine(r.item_id)?.field_stock?.[f.id] ?? 0) }))
              : []),
            { label: 'Min / Max', className: 'whitespace-nowrap text-slate-500', render: (r) => (r.item_id ? `${formatQty(byId[r.item_id]?.min_stock)} / ${formatQty(byId[r.item_id]?.max_stock)}` : '-') },
            {
              label: 'Saran',
              className: 'text-right',
              render: (r) => {
                const it = byId[r.item_id]
                if (!it || it.max_stock == null) return '-'
                const s = Math.max(0, it.max_stock - stockOf(r))
                return editable && s > 0 ? (
                  <button type="button" className="text-blue-600 hover:underline" title="Isi jumlah = max - stok" onClick={() => setForm((f) => ({ ...f, rows: f.rows.map((x) => (x.key === r.key ? { ...x, quantity: String(s) } : x)) }))}>
                    {formatQty(s)}
                  </button>
                ) : formatQty(s)
              },
            },
            { label: 'Setelah datang', render: (r) => (r.item_id ? <MinMaxHint stock={stockOf(r)} qty={r.quantity} min={byId[r.item_id]?.min_stock} max={byId[r.item_id]?.max_stock} /> : '-') },
          ]}
        />

        {editable && (
          <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t pt-4">
            {isNew ? <span className="mr-auto text-sm text-slate-500">Simpan sebagai draft dulu. Tombol kirim muncul setelah data tersimpan.</span>
              : d.dirty && <span className="mr-auto text-sm text-amber-600">Ada perubahan yang belum disimpan</span>}
            {!isNew && <Button variant="secondary" onClick={d.cancelEdit} disabled={busy}>Batal</Button>}
            <Button onClick={d.save} disabled={busy}>{d.busy === 'save' ? 'Menyimpan...' : isNew ? 'Simpan sebagai Draft' : 'Simpan Perubahan'}</Button>
          </div>
        )}

        {!editable && !isNew && (can.submit || can.create_po) && (
          <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t pt-4">
            {can.submit && (
              <>
                <span className="mr-auto text-sm text-slate-500">Pastikan data sudah benar. Klik Edit di atas jika masih perlu diubah.</span>
                <Button disabled={busy} onClick={() => d.action('submit', 'submit', { confirm: 'Kirim PR ke Purchasing? Setelah dikirim, PR tidak bisa diubah lagi.', ok: 'PR terkirim ke Purchasing.' })}>
                  {d.busy === 'submit' ? 'Mengirim...' : 'Kirim ke Purchasing'}
                </Button>
              </>
            )}
            {can.create_po && <Button onClick={() => navigate(`/po/new?pr=${doc.id}`)}>Buat PO dari PR ini</Button>}
          </div>
        )}
      </Card>

      {!isNew && <Timeline logs={doc.logs} />}
    </div>
  )
}
