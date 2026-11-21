import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Alert, Card, ExportButtons, Info, PageHeader, Table, Timeline } from '../../components/ui'
import { formatDate, formatQty } from '../../lib/format'
import { useApi } from '../../lib/hooks'

/** Satu penerimaan barang vendor: jumlah diterima + stok gudang sebelum & sesudah. */
export default function ReceiptDetail() {
  const { id } = useParams()
  const { data, loading, error } = useApi(`/goods-receipts/${id}`)
  const r = data?.data
  const [exportError, setExportError] = useState('')

  if (loading && !r) return <Card>Memuat...</Card>
  if (!r) return <Card><Alert>{error}</Alert><Link to="/receipts" className="text-blue-600">← Kembali</Link></Card>

  return (
    <div className="space-y-4">
      <PageHeader back="/receipts" title={`Penerimaan ${r.number}`} subtitle={`Gudang ${r.warehouse?.name} · dari ${r.vendor?.name || 'vendor'}`}>
        <ExportButtons url={`/goods-receipts/${r.id}/export`} filename={`penerimaan-${r.number}`} onError={setExportError} />
      </PageHeader>
      <Alert>{exportError}</Alert>
      <Card>
        <dl className="grid gap-3 sm:grid-cols-4">
          <Info label="Tanggal terima">{formatDate(r.received_date)}</Info>
          <Info label="Surat jalan">{r.delivery_note_number}</Info>
          <Info label="PO">{r.purchase_order ? <Link className="text-blue-600 hover:underline" to={`/po/${r.purchase_order.id}`}>{r.purchase_order.number}</Link> : '-'}</Info>
          <Info label="Diterima oleh">{r.receiver?.name}</Info>
          {r.note && <Info label="Catatan">{r.note}</Info>}
        </dl>
      </Card>
      <Card>
        <Table
          rows={r.items}
          columns={[
            { label: 'Barang', render: (l) => <span className="font-medium">{l.name}</span> },
            { label: 'Satuan', render: (l) => l.unit },
            { label: 'Stok gudang sebelum', className: 'text-right text-slate-500', render: (l) => formatQty(l.stock_before) },
            { label: 'Diterima', className: 'text-right text-green-700', render: (l) => `+${formatQty(l.quantity_received)}` },
            { label: 'Stok gudang sesudah', className: 'text-right font-semibold', render: (l) => formatQty(l.stock_after) },
            { label: 'Catatan', render: (l) => l.note || '-' },
          ]}
        />
      </Card>
      <Timeline logs={r.logs} />
    </div>
  )
}
