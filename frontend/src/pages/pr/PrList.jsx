import { Link } from 'react-router-dom'
import DocList from '../../components/DocList'
import { LinkButton, StatusBadge } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { formatDate, formatDateTime } from '../../lib/format'

export default function PrList() {
  const { user } = useAuth()
  const isOp = user.role === 'logistic' // pembuat PR

  return (
    <DocList
      title={isOp ? 'Purchasing Requisition (PR)' : 'PR Masuk'}
      subtitle={isOp ? 'Permintaan pembelian dari gudang ke Purchasing, mengacu pada stok minimal & maksimal.' : 'PR dari gudang. Validasi dengan data stok lalu buatkan PO.'}
      endpoint="/purchase-requisitions"
      statuses={[...(isOp ? [['draft', 'Draft']] : []), ['submitted', 'Menunggu Purchasing'], ['processed', 'Sudah dibuat PO']]}
      actions={isOp && <LinkButton to="/pr/new">+ Buat PR (estimasi)</LinkButton>}
      columns={[
        { label: 'Nomor', render: (r) => <Link to={`/pr/${r.id}`} className="font-medium text-blue-600 hover:underline">{r.number}</Link> },
        { label: 'Gudang', render: (r) => r.warehouse?.name },
        { label: 'Dari UR', render: (r) => r.user_request?.number || <span className="text-slate-400">Estimasi</span> },
        { label: 'Periode', render: (r) => r.period_label },
        { label: 'Dibuat oleh', render: (r) => r.creator?.name },
        { label: 'Dikirim', render: (r) => formatDateTime(r.submitted_at) },
        { label: 'Dibutuhkan', render: (r) => formatDate(r.needed_date) },
        { label: 'Item', render: (r) => r.items_count },
        { label: 'Status', render: (r) => <StatusBadge status={r.status} label={r.status_label} /> },
        { label: 'PO', render: (r) => (r.purchase_order ? <Link to={`/po/${r.purchase_order.id}`} className="text-blue-600 hover:underline">{r.purchase_order.number}</Link> : '-') },
        { label: '', className: 'text-right', render: (r) => <Link to={`/pr/${r.id}`} className="text-blue-600 hover:underline">Buka</Link> },
      ]}
    />
  )
}
