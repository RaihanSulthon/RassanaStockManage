import { useState } from 'react'
import CrudPage from '../../components/CrudPage'
import { UNITS, formatMoney, formatQty } from '../../lib/format'

const emptyForm = { name: '', category: 'bahan', unit: '', min_stock: '', max_stock: '', price: '', note: '', is_active: true }
const toForm = (r) => ({ name: r.name, category: r.category, unit: r.unit, min_stock: r.min_stock ?? '', max_stock: r.max_stock ?? '', price: r.price ?? '', note: r.note || '', is_active: r.is_active })

export default function Items() {
  const [category, setCategory] = useState('')

  return (
    <>
      <datalist id="units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
      <CrudPage
        title="Barang & Harga"
        subtitle="Master barang: jenis, satuan, batas stok minimal & maksimal (acuan PR), dan harga satuan (hanya terlihat Purchasing, Finance, Admin)."
        endpoint="/items"
        extraParams={{ category: category || undefined }}
        filters={
          <div className="mb-3 flex rounded border border-slate-300 text-sm sm:w-fit">
            {[['', 'Semua'], ['bahan', 'Bahan'], ['barang', 'Barang']].map(([v, l]) => (
              <button key={v} onClick={() => setCategory(v)} className={`px-3 py-1.5 ${category === v ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{l}</button>
            ))}
          </div>
        }
        emptyForm={emptyForm}
        toForm={toForm}
        columns={[
          { label: 'Nama', render: (r) => <span className={`font-medium ${r.is_active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{r.name}</span> },
          { label: 'Jenis', render: (r) => r.category_label },
          { label: 'Satuan', render: (r) => r.unit },
          { label: 'Min', className: 'text-right', render: (r) => formatQty(r.min_stock) },
          { label: 'Max', className: 'text-right', render: (r) => formatQty(r.max_stock) },
          { label: 'Harga satuan', className: 'text-right', render: (r) => (r.price == null ? <span className="text-amber-600">Belum diisi</span> : formatMoney(r.price)) },
          { label: 'Aktif', render: (r) => (r.is_active ? 'Ya' : 'Tidak') },
        ]}
        fields={[
          { name: 'name', label: 'Nama barang' },
          { name: 'category', label: 'Jenis', type: 'select', required: true, options: [['bahan', 'Bahan'], ['barang', 'Barang']] },
          { name: 'unit', label: 'Satuan', list: 'units', hint: 'Pilih atau ketik satuan (kg, liter, butir, pcs, ...)' },
          { name: 'min_stock', label: 'Stok minimal (gudang)', type: 'number' },
          { name: 'max_stock', label: 'Stok maksimal (gudang)', type: 'number' },
          { name: 'price', label: 'Harga satuan (Rp)', type: 'number', hint: 'Harga acuan. Harga final ditentukan di setiap PO.' },
          { name: 'note', label: 'Catatan' },
          { name: 'is_active', label: 'Aktif (bisa dipilih di dokumen baru)', type: 'checkbox' },
        ]}
      />
    </>
  )
}
