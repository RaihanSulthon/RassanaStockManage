import CrudPage from '../../components/CrudPage'

const emptyForm = { name: '', contact_person: '', phone: '', email: '', address: '', note: '', is_active: true }
const toForm = (r) => ({ name: r.name, contact_person: r.contact_person || '', phone: r.phone || '', email: r.email || '', address: r.address || '', note: r.note || '', is_active: r.is_active })

export default function Vendors() {
  return (
    <CrudPage
      title="Vendor"
      subtitle="Daftar vendor/supplier untuk PO."
      endpoint="/vendors"
      emptyForm={emptyForm}
      toForm={toForm}
      columns={[
        { label: 'Nama', render: (r) => <span className={`font-medium ${r.is_active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{r.name}</span> },
        { label: 'Kontak', render: (r) => r.contact_person || '-' },
        { label: 'Telepon', render: (r) => r.phone || '-' },
        { label: 'Email', render: (r) => r.email || '-' },
        { label: 'Alamat', render: (r) => r.address || '-' },
        { label: 'Aktif', render: (r) => (r.is_active ? 'Ya' : 'Tidak') },
      ]}
      fields={[
        { name: 'name', label: 'Nama vendor' },
        { name: 'contact_person', label: 'Nama kontak' },
        { name: 'phone', label: 'Telepon' },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'address', label: 'Alamat' },
        { name: 'note', label: 'Catatan' },
        { name: 'is_active', label: 'Aktif', type: 'checkbox' },
      ]}
    />
  )
}
