import { Link, useNavigate, useParams } from 'react-router-dom'
import LineItemsEditor, { newLine } from '../../components/LineItemsEditor'
import { Alert, Button, Card, ExportButtons, Field, Info, PageHeader, StatusBadge, Stepper, Timeline, inputClass } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { formatDate, formatDateTime, formatQty, todayISO } from '../../lib/format'
import { useApi, useItems } from '../../lib/hooks'
import { useDocument } from '../../lib/useDocument'

const emptyForm = () => ({ field_id: '', needed_date: '', note: '', rows: [newLine()] })
const toForm = (d) => ({
  field_id: d.field?.id || '',
  needed_date: d.needed_date || '',
  note: d.note || '',
  rows: d.items.map((i) => newLine({ item_id: i.item_id, quantity: String(i.quantity), note: i.note || '', name: i.name, unit: i.unit })),
})
const toPayload = (f) => ({
  field_id: f.field_id || null,
  needed_date: f.needed_date || null,
  note: f.note || null,
  items: f.rows.filter((r) => r.item_id || r.quantity !== '').map((r) => ({ item_id: r.item_id, quantity: r.quantity, note: r.note || null })),
})

const STEPS = ['Operation membuat UR', 'Logistic mengevaluasi', 'Dibuatkan PR']
const stepIndex = { draft: 0, submitted: 1, processed: 2 }

export default function UrDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const d = useDocument({ id, endpoint: '/user-requests', route: '/ur', emptyForm, toForm, toPayload })
  const { doc, form, setForm, editing, isNew } = d
  const fields = (user.locations || []).filter((l) => l.type === 'field')

  // Saldo lapangan & gudang untuk bahan pertimbangan
  const locId = doc?.field?.id || form.field_id || (fields.length === 1 ? fields[0].id : null)
  const items = useItems(locId) // barang milik gudang induk lapangan
  const fieldStock = useApi(locId ? '/stock/balances' : null, { location_id: locId }).data?.data || {}
  const whId = user.role === 'logistic' ? doc?.warehouse?.id : null // stok gudang hanya untuk Logistic
  const whStock = useApi(whId ? '/stock/balances' : null, { location_id: whId }).data?.data || {}

  if (d.loading) return <Card>Memuat...</Card>
  if (!isNew && !doc) return <Card><Alert>{d.message?.text}</Alert><Link to="/ur" className="text-blue-600">← Kembali</Link></Card>

  const can = doc?.can || {}
  const editable = isNew || (can.update && editing)
  const busy = d.busy !== ''

  return (
    <div className="space-y-4">
      <PageHeader
        back="/ur"
        title={isNew ? 'UR Baru' : `User Request ${doc.number}`}
        subtitle={!isNew && (
          <span className="flex items-center gap-2">
            <StatusBadge status={doc.status} label={doc.status_label} /> {doc.field?.name} → Gudang {doc.warehouse?.name}
          </span>
        )}
      >
        {!isNew && can.update && !editing && <Button size="sm" onClick={d.startEdit} disabled={busy}>Edit</Button>}
        {!isNew && can.export && !editing && <ExportButtons url={`/user-requests/${id}/export`} filename={doc.number} onError={(t) => d.setMessage({ kind: 'error', text: t })} />}
        {!isNew && can.delete && !editing && <Button size="sm" variant="danger" onClick={() => d.remove()} disabled={busy}>Hapus</Button>}
      </PageHeader>

      {!isNew && (
        <Card>
          <Stepper steps={STEPS} current={stepIndex[doc.status]} done={doc.status === 'processed'} />
          <dl className="mt-3 grid gap-3 sm:grid-cols-4">
            <Info label="Dibuat oleh">{doc.creator?.name}</Info>
            <Info label="Dikirim">{formatDateTime(doc.submitted_at)}</Info>
            <Info label="Dibutuhkan tanggal">{formatDate(doc.needed_date)}</Info>
            <Info label="PR">{doc.purchase_requisition ? <Link className="text-blue-600 hover:underline" to={`/pr/${doc.purchase_requisition.id}`}>{doc.purchase_requisition.number}</Link> : '-'}</Info>
          </dl>
          {doc.transfers?.length > 0 && (
            <div className="mt-3 text-sm text-slate-600">
              Pengiriman barang:{' '}
              {doc.transfers.map((t) => (
                <Link key={t.id} to={`/transfers/${t.id}`} className="mr-2 text-blue-600 hover:underline">{t.number} ({t.status_label})</Link>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card>
        <Alert kind={d.message?.kind}>{d.message?.text}</Alert>
        {!isNew && !can.update && !can.create_pr && <Alert kind="info">UR ini hanya bisa dilihat pada tahap sekarang.</Alert>}

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {isNew && fields.length > 1 && (
            <Field label="Lapangan" error={d.errors.field_id?.[0]}>
              <select value={form.field_id} onChange={(e) => setForm({ ...form, field_id: e.target.value })} className={inputClass}>
                <option value="">— Pilih —</option>
                {fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Dibutuhkan tanggal (opsional)" error={d.errors.needed_date?.[0]}>
            <input type="date" min={todayISO()} value={form.needed_date} disabled={!editable} onChange={(e) => setForm({ ...form, needed_date: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Catatan (opsional)" className="sm:col-span-2">
            <input value={form.note} disabled={!editable} maxLength={1000} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputClass} />
          </Field>
        </div>
        {d.errors.field_id && !(isNew && fields.length > 1) && <Alert>{d.errors.field_id[0]}</Alert>}

        <LineItemsEditor
          items={items}
          rows={form.rows}
          setRows={(fn) => setForm((f) => ({ ...f, rows: typeof fn === 'function' ? fn(f.rows) : fn }))}
          editable={editable}
          errors={d.errors}
          qtyLabel="Jumlah diminta"
          extraColumns={[
            { label: 'Saldo lapangan', className: 'text-right', render: (r) => <span className="text-slate-500">{r.item_id ? formatQty(fieldStock[r.item_id] ?? 0) : '-'}</span> },
            ...(whId ? [{ label: 'Stok gudang', className: 'text-right', render: (r) => <span className="text-slate-500">{formatQty(whStock[r.item_id] ?? 0)}</span> }] : []),
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

        {!editable && !isNew && (can.submit || can.create_pr || can.transfer) && (
          <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t pt-4">
            {can.submit && (
              <>
                <span className="mr-auto text-sm text-slate-500">Pastikan data sudah benar. Klik Edit di atas jika masih perlu diubah.</span>
                <Button disabled={busy} onClick={() => d.action('submit', 'submit', { confirm: 'Kirim UR ke Logistic gudang? Setelah dikirim, UR tidak bisa diubah lagi.', ok: 'UR terkirim ke Logistic.' })}>
                  {d.busy === 'submit' ? 'Mengirim...' : 'Kirim ke Logistic'}
                </Button>
              </>
            )}
            {can.transfer && <Button variant="secondary" onClick={() => navigate(`/transfers/new?ur=${doc.id}`)}>Kirim Barang ke Lapangan</Button>}
            {can.create_pr && <Button onClick={() => navigate(`/pr/new?ur=${doc.id}`)}>Buat PR dari UR ini</Button>}
          </div>
        )}
      </Card>

      {!isNew && <Timeline logs={doc.logs} />}
    </div>
  )
}
