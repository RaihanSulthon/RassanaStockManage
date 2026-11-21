import { Link } from 'react-router-dom'
import DocList from '../../components/DocList'
import { formatDate } from '../../lib/format'

/** Rekap penerimaan barang dari vendor di gudang (satu dokumen per surat jalan). Dicatat Logistic lewat menu PO. */
export default function ReceiptList() {
  return (
    <DocList
      title="Penerimaan Barang dari Vendor"
      subtitle="Setiap kali barang vendor datang ke gudang, Logistic mencatatnya dari halaman PO. Di sini rekapnya per penerimaan."
      endpoint="/goods-receipts"
      searchPlaceholder="Cari nomor / surat jalan / PO / barang..."
      periodFilter
      recap={{ url: '/goods-receipts/export', filename: 'rekap-penerimaan-vendor' }}
      columns={[
        { label: 'Nomor', render: (r) => <Link to={`/receipts/${r.id}`} className="font-medium text-blue-600 hover:underline">{r.number}</Link> },
        { label: 'Tgl terima', render: (r) => formatDate(r.received_date) },
        { label: 'Gudang', render: (r) => r.warehouse?.name },
        { label: 'Surat jalan', render: (r) => r.delivery_note_number },
        { label: 'PO', render: (r) => (r.purchase_order ? <Link to={`/po/${r.purchase_order.id}`} className="text-blue-600 hover:underline">{r.purchase_order.number}</Link> : '-') },
        { label: 'Vendor', render: (r) => r.vendor?.name || '-' },
        { label: 'Item', render: (r) => r.items_count },
        { label: 'Diterima oleh', render: (r) => r.receiver?.name },
        { label: '', className: 'text-right', render: (r) => <Link to={`/receipts/${r.id}`} className="text-blue-600 hover:underline">Buka</Link> },
      ]}
    />
  )
}
