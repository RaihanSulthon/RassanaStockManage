import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import LineItemsEditor, { newLine } from '../../components/LineItemsEditor'
import { Alert, Button, Card, ExportButtons, Field, Info, PageHeader, StatusBadge, Stepper, Table, Timeline, inputClass } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import api from '../../lib/api'
import { formatDate, formatDateTime, formatMoney, formatQty, todayISO } from '../../lib/format'
import { useApi, useItems } from '../../lib/hooks'
import { useDocument } from '../../lib/useDocument'
import PaymentSection from './PaymentSection'
import ReceiveModal from './ReceiveModal'
import { toast } from '../../lib/toast'

const emptyForm = () => ({ vendor_id: '', order_date: todayISO(), expected_date: '', note: '', rows: [newLine()] })
const toForm = (d) => ({
  vendor_id: d.vendor?.id || '',
  order_date: d.order_date,
  expected_date: d.expected_date || '',
  note: d.note || '',
  rows: d.items.map((i) => newLine({ item_id: i.item_id, quantity: String(i.quantity), unit_price: String(i.unit_price ?? ''), note: i.note || '', name: i.name, unit: i.unit })),
})
const toPayload = (f) => ({
  vendor_id: f.vendor_id || null,
  order_date: f.order_date,
  expected_date: f.expected_date || null,
  note: f.note || null,
  items: f.rows
    .filter((r) => r.item_id || r.quantity !== '')
    .map((r) => ({ item_id: r.item_id, quantity: r.quantity, unit_price: r.unit_price, note: r.note || null })),
})

const STEPS = ['Andi membuat PO', 'Approval Fauzan', 'Kirim ke vendor', 'Barang diterima gudang']
const stepIndex = { draft: 0, revision: 0, pending_approval: 1, approved: 2, sent: 3, partially_received: 3, received: 4, closed: 4 }

export default function PoDetail() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const prId = params.get('pr')
  const { user } = useAuth()
  const [receiving, setReceiving] = useState(false)

  const d = useDocument({
    id, endpoint: '/purchase-orders', route: '/po', emptyForm, toForm, toPayload,
    createExtra: prId ? { purchase_requisition_id: Number(prId) } : undefined,
  })
  const { doc, form, setForm, editing, isNew } = d

  // PO baru dari PR: barang & jumlah dari PR, harga dari master barang
  const pr = useApi(isNew && prId ? `/purchase-requisitions/${prId}` : null).data?.data

  // Barang & vendor mengikuti gudang tujuan PO
  const whId = doc?.warehouse?.id || pr?.warehouse?.id || null
  const items = useItems(whId)
  const byId = Object.fromEntries(items.map((i) => [i.id, i]))
  const vendors = useApi(user.role === 'operation1' || !whId ? null : '/vendors', { warehouse_id: whId }).data?.data || []
  useEffect(() => {
    if (!pr || !items.length) return
    const price = Object.fromEntries(items.map((i) => [i.id, i.price]))
    setForm((f) => ({
      ...f,
      note: f.note || `Berdasarkan ${pr.number}`,
      rows: pr.items.map((i) => newLine({ item_id: i.item_id, quantity: String(i.quantity), unit_price: price[i.item_id] != null ? String(price[i.item_id]) : '', note: i.note || '' })),
    }))
  }, [pr, items, setForm])

  if (isNew && !prId) {
    return <Card><Alert kind="info">PO dibuat dari PR. Buka PR yang menunggu, lalu klik “Buat PO dari PR ini”.</Alert><Link to="/pr?status=submitted" className="text-blue-600 hover:underline">Lihat PR yang menunggu</Link></Card>
  }
  if (d.loading) return <Card>Memuat...</Card>
  if (!isNew && !doc) return <Card><Alert>{d.message?.text}</Alert><Link to="/po" className="text-blue-600">← Kembali</Link></Card>

  const can = doc?.can || {}
  const prices = isNew || can.view_prices
  const editable = isNew || (can.update && editing)
  const busy = d.busy !== ''
  const total = form.rows.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.unit_price) || 0), 0)
  const docLine = (itemId) => doc?.items?.find((i) => i.item_id === Number(itemId))
  const onError = (t) => d.setMessage({ kind: 'error', text: t })

  const reject = () => {
    const note = window.prompt('Tuliskan hal yang perlu direvisi oleh Purchasing:')
    if (note === null) return
    d.action('reject', 'reject', { body: { note }, ok: 'PO dikembalikan ke Purchasing untuk revisi.' })
  }
  const close = () => {
    const note = window.prompt('Alasan PO ditutup (mis. vendor tidak bisa mengirim sisa barang):')
    if (note === null) return
    d.action('close', 'close', { body: { note }, ok: 'PO ditutup.' })
  }

  const columns = [
    ...(prices
      ? [
          {
            label: 'Harga satuan',
            className: 'w-40',
            render: (r, i) =>
              editable ? (
                <>
                  <input type="number" min="0" step="any" value={r.unit_price ?? ''} onChange={(e) => setForm((f) => ({ ...f, rows: f.rows.map((x) => (x.key === r.key ? { ...x, unit_price: e.target.value } : x)) }))} className="w-full rounded border border-slate-300 px-2 py-1.5" />
                  {d.errors[`items.${i}.unit_price`] && <p className="mt-1 text-xs text-red-600">{d.errors[`items.${i}.unit_price`][0]}</p>}
                  {byId[r.item_id]?.price != null && Number(r.unit_price) !== byId[r.item_id].price && (
                    <p className="mt-1 text-xs text-slate-400">Master: {formatMoney(byId[r.item_id].price)}</p>
                  )}
                </>
              ) : (
                formatMoney(r.unit_price)
              ),
          },
          { label: 'Subtotal', className: 'text-right whitespace-nowrap', render: (r) => formatMoney((Number(r.quantity) || 0) * (Number(r.unit_price) || 0)) },
        ]
      : []),
    ...(!isNew && !editing && doc.receipts?.length
      ? [
          { label: 'Diterima', className: 'text-right', render: (r) => formatQty(docLine(r.item_id)?.quantity_received) },
          {
            label: 'Sisa / selisih',
            className: 'text-right whitespace-nowrap',
            render: (r) => {
              const rem = docLine(r.item_id)?.remaining ?? 0
              return rem > 0 ? <span className="text-amber-600">kurang {formatQty(rem)}</span> : rem < 0 ? <span className="text-blue-600">lebih {formatQty(-rem)}</span> : <span className="text-green-600">sesuai</span>
            },
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        back="/po"
        title={isNew ? 'PO Baru' : `Purchase Order ${doc.number}`}
        subtitle={!isNew ? (
          <span className="flex flex-wrap items-center gap-2"><StatusBadge status={doc.status} label={doc.status_label} /> {doc.vendor?.name} → Gudang {doc.warehouse?.name}</span>
        ) : pr && `Berdasarkan ${pr.number} · Gudang ${pr.warehouse?.name}`}
      >
        {!isNew && can.update && !editing && <Button size="sm" onClick={d.startEdit} disabled={busy}>Edit</Button>}
        {!isNew && can.export && !editing && <ExportButtons url={`/purchase-orders/${id}/export`} filename={doc.number} onError={onError} />}
        {!isNew && can.delete && !editing && <Button size="sm" variant="danger" onClick={() => d.remove()} disabled={busy}>Hapus</Button>}
      </PageHeader>

      {!isNew && (
        <Card>
          <Stepper steps={STEPS} current={stepIndex[doc.status]} done={['received', 'closed'].includes(doc.status)} />
          <dl className="mt-3 grid gap-3 sm:grid-cols-4">
            <Info label="Dari PR">{doc.purchase_requisition && <Link className="text-blue-600 hover:underline" to={`/pr/${doc.purchase_requisition.id}`}>{doc.purchase_requisition.number}</Link>}</Info>
            <Info label="UR asal">{doc.user_request ? <Link className="text-blue-600 hover:underline" to={`/ur/${doc.user_request.id}`}>{doc.user_request.number}</Link> : 'Estimasi'}</Info>
            <Info label="Dibuat oleh">{doc.creator?.name}</Info>
            <Info label="Disetujui">{doc.approver ? `${doc.approver.name} · ${formatDateTime(doc.approved_at)}` : '-'}</Info>
            <Info label="Dikirim ke vendor">{formatDateTime(doc.sent_at)}</Info>
            <Info label="Estimasi tiba">{formatDate(doc.expected_date)}</Info>
            <Info label="Kontak vendor">{[doc.vendor?.contact_person, doc.vendor?.phone].filter(Boolean).join(' · ')}</Info>
            {prices && <Info label="Total PO"><span className="font-semibold">{formatMoney(doc.total)}</span></Info>}
          </dl>
          {doc.status === 'revision' && doc.revision_note && <div className="mt-3"><Alert kind="warn">Catatan revisi dari Finance: {doc.revision_note}</Alert></div>}
          {doc.status === 'closed' && doc.closed_note && <div className="mt-3"><Alert kind="info">Ditutup: {doc.closed_note}</Alert></div>}
        </Card>
      )}

      <Card>
        <Alert kind={d.message?.kind}>{d.message?.text}</Alert>
        {(isNew || editing || prices) && (
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <Field label="Vendor" error={d.errors.vendor_id?.[0]}>
              <select value={form.vendor_id} disabled={!editable} onChange={(e) => setForm({ ...form, vendor_id: e.target.value })} className={inputClass}>
                <option value="">— Pilih vendor —</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                {doc?.vendor && !vendors.some((v) => v.id === doc.vendor.id) && <option value={doc.vendor.id}>{doc.vendor.name}</option>}
              </select>
              {editable && whId && vendors.length === 0 && (
                <p className="mt-1 text-xs text-amber-700">
                  Belum ada vendor untuk gudang ini. Tambahkan di <Link to={`/warehouses/${whId}?tab=vendor`} className="underline">menu Gudang → Vendor</Link>.
                </p>
              )}
            </Field>
            <Field label="Tanggal PO" error={d.errors.order_date?.[0]}>
              <input type="date" value={form.order_date} disabled={!editable} onChange={(e) => setForm({ ...form, order_date: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Estimasi tiba (opsional)" error={d.errors.expected_date?.[0]}>
              <input type="date" min={form.order_date} value={form.expected_date} disabled={!editable} onChange={(e) => setForm({ ...form, expected_date: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Catatan (opsional)">
              <input value={form.note} disabled={!editable} maxLength={1000} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputClass} />
            </Field>
          </div>
        )}
        {d.errors.purchase_requisition_id && <Alert>{d.errors.purchase_requisition_id[0]}</Alert>}

        <LineItemsEditor
          items={items}
          rows={form.rows}
          setRows={(fn) => setForm((f) => ({ ...f, rows: typeof fn === 'function' ? fn(f.rows) : fn }))}
          editable={editable}
          errors={d.errors}
          qtyLabel="Jumlah"
          extraColumns={columns}
        />
        {prices && (
          <div className="mt-3 text-right text-sm">
            Total: <span className="text-base font-bold text-slate-800">{formatMoney(editable ? total : doc.total)}</span>
          </div>
        )}

        {editable && (
          <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t pt-4">
            {isNew ? <span className="mr-auto text-sm text-slate-500">Simpan sebagai draft dulu. Tombol kirim ke Finance muncul setelah data tersimpan.</span>
              : d.dirty && <span className="mr-auto text-sm text-amber-600">Ada perubahan yang belum disimpan</span>}
            {!isNew && <Button variant="secondary" onClick={d.cancelEdit} disabled={busy}>Batal</Button>}
            <Button onClick={d.save} disabled={busy}>{d.busy === 'save' ? 'Menyimpan...' : isNew ? 'Simpan sebagai Draft' : 'Simpan Perubahan'}</Button>
          </div>
        )}

        {!editable && !isNew && (can.submit || can.approve || can.send || can.receive || can.close) && (
          <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t pt-4">
            {can.submit && (
              <Button disabled={busy} onClick={() => d.action('submit', 'submit', { confirm: 'Kirim Surat PO ke Finance untuk validasi & verifikasi?', ok: 'PO terkirim ke Finance.' })}>
                {doc.status === 'revision' ? 'Kirim Ulang ke Finance' : 'Kirim ke Finance untuk Approval'}
              </Button>
            )}
            {can.approve && (
              <>
                <Button variant="danger" disabled={busy} onClick={reject}>Minta Revisi</Button>
                <Button variant="success" disabled={busy} onClick={() => d.action('approve', 'approve', { confirm: 'Setujui PO ini? Purchasing & gudang akan diberi notifikasi.', ok: 'PO disetujui.' })}>Setujui PO</Button>
              </>
            )}
            {can.send && <Button disabled={busy} onClick={() => d.action('send', 'send', { confirm: 'Tandai PO sudah dikirim ke vendor?', ok: 'PO ditandai sudah dikirim ke vendor.' })}>Tandai Sudah Dikirim ke Vendor</Button>}
            {can.close && <Button variant="secondary" disabled={busy} onClick={close}>Tutup PO</Button>}
            {can.receive && <Button variant="success" disabled={busy} onClick={() => setReceiving(true)}>Catat Penerimaan Barang</Button>}
          </div>
        )}
      </Card>

      {!isNew && doc.receipts?.length > 0 && (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-800">Riwayat Penerimaan ({doc.receipts.length}x)</h2>
            <div className="flex gap-2">{can.export_receipts && <ExportButtons url={`/purchase-orders/${id}/receipts/export`} filename={`penerimaan-${doc.number}`} onError={onError} />}</div>
          </div>
          <div className="space-y-4">
            {doc.receipts.map((r) => (
              <div key={r.id} className="rounded border p-3">
                <div className="mb-2 flex flex-wrap gap-x-4 text-sm text-slate-600">
                  <span className="font-semibold text-slate-800">{r.number}</span>
                  <span>Surat jalan: <b>{r.delivery_note_number}</b></span>
                  <span>Tanggal: {formatDate(r.received_date)}</span>
                  <span>Diterima: {r.receiver?.name}</span>
                  {r.note && <span>Catatan: {r.note}</span>}
                </div>
                <Table
                  columns={[
                    { label: 'Barang', render: (l) => l.name },
                    { label: 'Satuan', render: (l) => l.unit },
                    { label: 'Jumlah diterima', className: 'text-right', render: (l) => formatQty(l.quantity_received) },
                    { label: 'Catatan', render: (l) => l.note || '-' },
                  ]}
                  rows={r.items}
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      {!isNew && prices && <PaymentSection po={doc} onChanged={() => d.run('reload', async () => d.apply((await api.get(`/purchase-orders/${id}`)).data.data))} />}

      {!isNew && <Timeline logs={doc.logs} />}

      {receiving && (
        <ReceiveModal
          po={doc}
          onClose={() => setReceiving(false)}
          onDone={(data) => {
            setReceiving(false)
            d.apply(data)
            d.setMessage(null)
            toast('Penerimaan barang tercatat. Stok gudang sudah bertambah.')
          }}
        />
      )}
    </div>
  )
}
