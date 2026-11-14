import { Link } from 'react-router-dom'
import DocList from '../../components/DocList'
import { LinkButton, StatusBadge } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { formatDate, formatDateTime } from '../../lib/format'

export default function UrList() {
  const { user } = useAuth()
  const isUser = user.role === 'user'

  return (
    <DocList
      title={isUser ? 'User Request (UR)' : 'UR Masuk'}
      subtitle={isUser ? 'Permintaan barang dari lapangan ke gudang.' : 'Permintaan barang dari lapangan. Evaluasi lalu buatkan PR atau kirim barang.'}
      endpoint="/user-requests"
      statuses={[
        ...(isUser ? [['draft', 'Draft']] : []),
        ['submitted', 'Menunggu Operation'],
        ['processed', 'Sudah dibuat PR'],
      ]}
      actions={isUser && <LinkButton to="/ur/new">+ Buat UR</LinkButton>}
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
