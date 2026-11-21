import { Link } from 'react-router-dom'
import DocList from '../../components/DocList'
import { StatusBadge } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { formatDate, formatMoney } from '../../lib/format'

const ALL = [
  ['draft', 'Draft'],
  ['pending_approval', 'Menunggu Approval'],
  ['revision', 'Perlu Revisi'],
  ['approved', 'Disetujui'],
  ['sent', 'Dikirim ke Vendor'],
  ['partially_received', 'Diterima Sebagian'],
  ['received', 'Diterima Lengkap'],
  ['closed', 'Ditutup'],
]

export default function PoList() {
  const { user } = useAuth()
  const prices = ['admin', 'purchasing', 'finance'].includes(user.role)
  const statuses = user.role === 'logistic' ? ALL.slice(3) : user.role === 'purchasing' ? ALL : ALL.slice(1)

  const subtitle = {
    purchasing: 'Buat PO dari PR, tentukan vendor & harga, kirim ke Finance untuk approval, lalu kirim ke vendor.',
    finance: 'Validasi & verifikasi PO dari Purchasing, lalu proses pembayaran setelah barang diterima gudang.',
    logistic: 'PO yang sudah disetujui. Cek barang datang sesuai surat jalan & PO, lalu catat penerimaannya.',
  }[user.role]

  return (
    <DocList
      title="Purchase Order (PO)"
      subtitle={subtitle}
      endpoint="/purchase-orders"
      statuses={statuses}
      searchPlaceholder="Cari nomor PO / vendor..."
      columns={[
        { label: 'Nomor', render: (r) => <Link to={`/po/${r.id}`} className="font-medium text-blue-600 hover:underline">{r.number}</Link> },
        { label: 'Vendor', render: (r) => r.vendor?.name },
        { label: 'Gudang', render: (r) => r.warehouse?.name },
        { label: 'Dari PR', render: (r) => r.purchase_requisition?.number },
        { label: 'Tanggal PO', render: (r) => formatDate(r.order_date) },
        { label: 'Item', render: (r) => r.items_count },
        ...(prices ? [{ label: 'Total', className: 'text-right', render: (r) => formatMoney(r.total) }] : []),
        { label: 'Status', render: (r) => <StatusBadge status={r.status} label={r.status_label} /> },
        { label: '', className: 'text-right', render: (r) => <Link to={`/po/${r.id}`} className="text-blue-600 hover:underline">Buka</Link> },
      ]}
    />
  )
}
