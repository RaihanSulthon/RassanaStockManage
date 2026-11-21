import { Link } from 'react-router-dom'
import DocList from '../../components/DocList'
import { LinkButton, StatusBadge } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { formatDate, formatDateTime } from '../../lib/format'
import { isFieldRole } from '../../lib/roles'

/**
 * Pengiriman gudang -> lapangan.
 *  - Logistic: kirim barang & tindak lanjut selisih.
 *  - Operation1/User: catat penerimaan barang (dan barang susulan).
 *  - Admin/Purchasing/Finance: pantau & rekap.
 */
export default function TransferList() {
  const { user } = useAuth()
  const isLogistic = user.role === 'logistic'
  const isField = isFieldRole(user.role)

  return (
    <DocList
      title={isLogistic ? 'Pengiriman ke Lapangan' : isField ? 'Penerimaan Barang dari Gudang' : 'Pengiriman Gudang → Lapangan'}
      subtitle={
        isLogistic
          ? 'Kirim barang dari gudang ke lapangan. Stok gudang langsung berkurang sebanyak yang dikirim.'
          : isField
            ? 'Hitung barang yang datang dari gudang, lalu catat jumlah yang benar-benar diterima.'
            : 'Rekap semua pengiriman dari gudang ke lapangan.'
      }
      endpoint="/transfers"
      searchPlaceholder="Cari nomor / barang..."
      statuses={[['sent', 'Dalam Pengiriman'], ['discrepancy', 'Ada Selisih'], ['received', 'Selesai']]}
      actions={isLogistic && <LinkButton to="/transfers/new">+ Kirim Barang</LinkButton>}
      periodFilter
      recap={{ url: '/transfers/export', filename: 'rekap-pengiriman' }}
      columns={[
        { label: 'Nomor', render: (r) => <Link to={`/transfers/${r.id}`} className="font-medium text-blue-600 hover:underline">{r.number}</Link> },
        { label: 'Tgl kirim', render: (r) => formatDate(r.transfer_date) },
        { label: 'Dari', render: (r) => r.from?.name },
        { label: 'Ke', render: (r) => r.to?.name },
        { label: 'UR', render: (r) => r.user_request?.number || '-' },
        { label: 'Item', render: (r) => r.items_count },
        { label: 'Status', render: (r) => <StatusBadge status={r.status} label={r.status_label} /> },
        { label: 'Diterima', render: (r) => (r.received_at ? `${r.receiver?.name} · ${formatDateTime(r.received_at)}` : '-') },
        {
          label: '',
          className: 'text-right',
          render: (r) => (
            <Link to={`/transfers/${r.id}`} className="whitespace-nowrap text-blue-600 hover:underline">
              {r.can?.receive ? 'Catat Penerimaan' : 'Buka'}
            </Link>
          ),
        },
      ]}
    />
  )
}
