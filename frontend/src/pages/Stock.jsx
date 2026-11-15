import StockPanel from '../components/StockPanel'
import { PageHeader } from '../components/ui'
import { useLocations } from '../lib/hooks'

/** Saldo stok untuk akun User: hanya lapangan yang ditugaskan. (Role lain melihat stok dari menu Gudang.) */
export default function Stock() {
  const locations = useLocations()
  return (
    <div className="space-y-4">
      <PageHeader title="Saldo Stok Lapangan" subtitle="Saldo awal, masuk, keluar, dan saldo akhir per barang di lapangan Anda." />
      <StockPanel locations={locations} />
    </div>
  )
}
