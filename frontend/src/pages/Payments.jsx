import { Link } from 'react-router-dom'
import DocList from '../components/DocList'
import { StatusBadge } from '../components/ui'
import { formatDate, formatMoney } from '../lib/format'

export default function Payments() {
  return (
    <DocList
      title="Pembayaran ke Vendor"
      subtitle="Tagihan vendor per PO. Siapkan dan lakukan pembayaran dari halaman PO."
      endpoint="/payments"
      searchPlaceholder="Cari no. tagihan / PO / vendor..."
      statuses={[['prepared', 'Disiapkan'], ['paid', 'Dibayar']]}
      columns={[
        { label: 'Nomor', render: (p) => <span className="font-medium">{p.number}</span> },
        { label: 'PO', render: (p) => <Link to={`/po/${p.purchase_order?.id}`} className="text-blue-600 hover:underline">{p.purchase_order?.number}</Link> },
        { label: 'Vendor', render: (p) => p.vendor?.name },
        { label: 'No. tagihan', render: (p) => p.invoice_number },
        { label: 'Tgl tagihan', render: (p) => formatDate(p.invoice_date) },
        { label: 'Nominal', className: 'text-right', render: (p) => formatMoney(p.invoice_amount) },
        { label: 'Status', render: (p) => <StatusBadge status={p.status} label={p.status_label} /> },
        { label: 'Dibayar', render: (p) => (p.paid_date ? `${formatDate(p.paid_date)} · ${p.method_label}` : '-') },
        { label: '', className: 'text-right', render: (p) => <Link to={`/po/${p.purchase_order?.id}`} className="text-blue-600 hover:underline">Buka PO</Link> },
      ]}
    />
  )
}
