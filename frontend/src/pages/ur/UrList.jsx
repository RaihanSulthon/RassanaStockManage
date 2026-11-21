import { Link } from 'react-router-dom'
import DocList from '../../components/DocList'
import { LinkButton, StatusBadge } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { formatDate, formatDateTime } from '../../lib/format'

export default function UrList() {
  const { user } = useAuth()
  const isOp = user.role === 'operation1' // pembuat UR

  return (
    <DocList
      title={isOp ? 'User Request (UR)' : 'UR Masuk'}
      subtitle={isOp ? 'Permintaan barang dari lapangan ke Logistic gudang.' : 'Permintaan barang dari lapangan. Evaluasi lalu kirim dari stok gudang atau buatkan PR.'}
      endpoint="/user-requests"
      statuses={[
        ...(isOp ? [['draft', 'Draft']] : []),
        ['submitted', 'Menunggu Logistic'],
        ['processed', 'Sudah dibuat PR'],
      ]}
      actions={isOp && <LinkButton to="/ur/new">+ Buat UR</LinkButton>}
      columns={[
        { label: 'Nomor', render: (r) => <Link to={`/ur/${r.id}`} className="font-medium text-blue-600 hover:underline">{r.number}</Link> },
        { label: 'Lapangan', render: (r) => r.field?.name },
        { label: 'Gudang', render: (r) => r.warehouse?.name },
        { label: 'Dibuat oleh', render: (r) => r.creator?.name },
        { label: 'Dikirim', render: (r) => formatDateTime(r.submitted_at) },
        { label: 'Dibutuhkan', render: (r) => formatDate(r.needed_date) },
        { label: 'Item', render: (r) => r.items_count },
        { label: 'Status', render: (r) => <StatusBadge status={r.status} label={r.status_label} /> },
        { label: 'PR', render: (r) => (r.purchase_requisition ? <Link to={`/pr/${r.purchase_requisition.id}`} className="text-blue-600 hover:underline">{r.purchase_requisition.number}</Link> : '-') },
        { label: '', className: 'text-right', render: (r) => <Link to={`/ur/${r.id}`} className="text-blue-600 hover:underline">Buka</Link> },
      ]}
    />
  )
}
