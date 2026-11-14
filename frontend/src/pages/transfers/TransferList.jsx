import { Link } from 'react-router-dom'
import DocList from '../../components/DocList'
import { LinkButton, StatusBadge } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { formatDate, formatDateTime } from '../../lib/format'

export default function TransferList() {
  const { user } = useAuth()
  const isOp = user.role === 'operation1'

  return (
    <DocList
      title={isOp ? 'Kirim Barang ke Lapangan' : user.role === 'user' ? 'Penerimaan Barang dari Gudang' : 'Pengiriman Gudang → Lapangan'}
      subtitle={isOp ? 'Kirim barang dari gudang sesuai kebutuhan lapangan.' : user.role === 'user' ? 'Catat jumlah aktual barang yang sampai di lapangan.' : undefined}
      endpoint="/transfers"
      searchPlaceholder="Cari nomor..."
      statuses={[['sent', 'Dalam Pengiriman'], ['received', 'Diterima Lapangan']]}
      actions={isOp && <LinkButton to="/transfers/new">+ Kirim Barang</LinkButton>}
      columns={[
        { label: 'Nomor', render: (r) => <Link to={`/transfers/${r.id}`} className="font-medium text-blue-600 hover:underline">{r.number}</Link> },
        { label: 'Tanggal', render: (r) => formatDate(r.transfer_date) },
        { label: 'Dari', render: (r) => r.from?.name },
        { label: 'Ke', render: (r) => r.to?.name },
        { label: 'UR', render: (r) => r.user_request?.number || '-' },
        { label: 'Item', render: (r) => r.items_count },
        { label: 'Status', render: (r) => <StatusBadge status={r.status === 'sent' ? 'sent' : 'received'} label={r.status_label} /> },
        { label: 'Diterima', render: (r) => (r.received_at ? `${r.receiver?.name} · ${formatDateTime(r.received_at)}` : '-') },
        { label: '', className: 'text-right', render: (r) => <Link to={`/transfers/${r.id}`} className="text-blue-600 hover:underline">{r.can?.receive ? 'Catat Penerimaan' : 'Buka'}</Link> },
      ]}
    />
  )
}
