import CrudPage from '../../components/CrudPage'
import { useLocations } from '../../lib/hooks'

const emptyForm = { type: 'warehouse', name: '', parent_id: '', address: '', is_active: true }
const toForm = (r) => ({ type: r.type, name: r.name, parent_id: r.parent_id || '', address: r.address || '', is_active: r.is_active })

export default function Locations() {
  const warehouses = useLocations().filter((l) => l.type === 'warehouse')

  return (
    <CrudPage
      title="Lokasi"
      subtitle="Gudang dan lapangan. Satu gudang bisa melayani beberapa lapangan (atau satu lapangan untuk lokasi terpencil). Penugasan akun ke lokasi diatur di Kelola User."
      endpoint="/locations"
      emptyForm={emptyForm}
      toForm={toForm}
      columns={[
        { label: 'Nama', render: (r) => <span className={`font-medium ${r.is_active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{r.name}</span> },
        { label: 'Jenis', render: (r) => r.type_label },
        { label: 'Gudang induk', render: (r) => r.parent?.name || '-' },
        { label: 'Alamat', render: (r) => r.address || '-' },
        { label: 'Akun ditugaskan', render: (r) => r.users_count ?? 0 },
        { label: 'Aktif', render: (r) => (r.is_active ? 'Ya' : 'Tidak') },
      ]}
      fields={[
        { name: 'type', label: 'Jenis', type: 'select', required: true, options: [['warehouse', 'Gudang'], ['field', 'Lapangan']] },
        { name: 'name', label: 'Nama lokasi' },
        { name: 'parent_id', label: 'Gudang induk', type: 'select', options: warehouses.map((w) => [w.id, w.name]), show: (f) => f.type === 'field' },
        { name: 'address', label: 'Alamat' },
        { name: 'is_active', label: 'Aktif', type: 'checkbox' },
      ]}
    />
  )
}
