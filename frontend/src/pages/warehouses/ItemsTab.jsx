import { useState } from 'react'
import { Alert, Button, Card, Field, Modal, Table, inputClass } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import api from '../../lib/api'
import { UNITS, errorMessage, formatMoney, formatQty } from '../../lib/format'
import { useApi, useDebounced } from '../../lib/hooks'
import { canManageWarehouse, isPrivileged } from '../../lib/roles'
import { toast } from '../../lib/toast'

const emptyForm = { name: '', category: 'bahan', unit: '', min_stock: '', max_stock: '', price: '', note: '', is_active: true }
const toForm = (r) => ({
  name: r.name, category: r.category, unit: r.unit, min_stock: r.min_stock ?? '', max_stock: r.max_stock ?? '',
  price: r.price ?? '', note: r.note || '', is_active: r.is_active,
})

/**
 * Barang & bahan milik gudang ini, dengan min/max dan harga acuan khusus gudang ini.
 * Kelola: Admin/Purchasing/Finance (dengan harga) dan Logistic gudang ini (tanpa harga).
 */
export default function ItemsTab({ warehouse, onChanged }) {
  const { user } = useAuth()
  const canManage = canManageWarehouse(user.role)
  const canPrice = isPrivileged(user.role)
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim())
  const [category, setCategory] = useState('')
  const { data, loading, error, reload } = useApi('/items', { location_id: warehouse.id, all: 1, search: q || undefined, category: category || undefined })
  const stock = useApi('/stock/balances', { location_id: warehouse.id }).data?.data || {}

  const [modal, setModal] = useState(null) // { id|null }
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [pageError, setPageError] = useState('')

  const open = (row) => {
    setForm(row ? toForm(row) : emptyForm)
    setErrors({})
    setModal({ id: row?.id || null })
  }

  const save = async () => {
    setBusy(true)
    setErrors({})
    try {
      const payload = { ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])), warehouse_id: warehouse.id }
      if (!canPrice) delete payload.price // harga diatur Purchasing/Finance
      if (modal.id) await api.put(`/items/${modal.id}`, payload)
      else await api.post('/items', payload)
      toast(modal.id ? 'Perubahan barang tersimpan.' : `"${form.name}" ditambahkan ke Gudang ${warehouse.name}.`)
      setModal(null)
      reload()
      onChanged?.()
    } catch (err) {
      if (err.response?.status === 422) setErrors(err.response.data.errors || {})
      else setErrors({ general: [errorMessage(err)] })
    } finally {
      setBusy(false)
    }
  }

  const remove = async (row) => {
    if (!window.confirm(`Hapus "${row.name}" dari Gudang ${warehouse.name}?`)) return
    setPageError('')
    try {
      await api.delete(`/items/${row.id}`)
      toast(`"${row.name}" dihapus.`)
      reload()
      onChanged?.()
    } catch (err) {
      setPageError(errorMessage(err))
    }
  }

  const rows = data?.data || []
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Cari barang..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm sm:max-w-xs"
        />
        <div className="flex rounded border border-slate-300 text-sm">
          {[['', 'Semua'], ['bahan', 'Bahan'], ['barang', 'Barang']].map(([v, l]) => (
            <button key={v} onClick={() => setCategory(v)} className={`px-3 py-1.5 ${category === v ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {l}
            </button>
          ))}
        </div>
        {canManage && (
          <Button size="sm" className="ml-auto" onClick={() => open(null)}>+ Barang / Bahan</Button>
        )}
      </div>

      <Alert>{error || pageError}</Alert>
      {canManage && !loading && rows.length === 0 && !q && !category ? (
        <div className="py-8 text-center text-slate-500">
          Gudang ini belum punya barang atau bahan.{' '}
          <button className="text-blue-600 hover:underline" onClick={() => open(null)}>Tambah yang pertama</button>.
          <p className="mt-1 text-xs text-slate-400">Setelah ditambahkan, isi stok awalnya lewat tab Stok → Ubah Stok → Tambah Stok (alasan: Saldo awal).</p>
        </div>
      ) : (
        <Table
          loading={loading}
          rows={rows}
          empty="Tidak ada barang yang cocok."
          columns={[
            { label: 'Nama', render: (r) => <span className={`font-medium ${r.is_active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{r.name}</span> },
            { label: 'Jenis', render: (r) => r.category_label },
            { label: 'Satuan', render: (r) => r.unit },
            { label: 'Stok gudang', className: 'text-right font-semibold', render: (r) => formatQty(stock[r.id] ?? 0) },
            { label: 'Min / Max', className: 'text-right whitespace-nowrap text-slate-500', render: (r) => `${formatQty(r.min_stock)} / ${formatQty(r.max_stock)}` },
            ...(canPrice
              ? [{ label: 'Harga satuan', className: 'text-right whitespace-nowrap', render: (r) => (r.price == null ? <span className="text-amber-600">Belum diisi</span> : formatMoney(r.price)) }]
              : []),
            { label: 'Status', render: (r) => (r.is_active ? 'Aktif' : 'Nonaktif') },
            ...(canManage
              ? [{
                  label: '',
                  className: 'text-right whitespace-nowrap',
                  render: (r) => (
                    <>
                      <button onClick={() => open(r)} className="mr-3 text-blue-600 hover:underline">Edit</button>
                      <button onClick={() => remove(r)} className="text-red-600 hover:underline">Hapus</button>
                    </>
                  ),
                }]
              : []),
          ]}
        />
      )}

      {modal && (
        <Modal title={`${modal.id ? 'Edit' : 'Tambah'} Barang / Bahan · Gudang ${warehouse.name}`} onClose={() => setModal(null)}>
          <Alert>{errors.general?.[0]}</Alert>
          <datalist id="units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <Field label="Nama" error={errors.name?.[0]}>
              <input autoFocus value={form.name} maxLength={150} onChange={set('name')} className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Jenis" error={errors.category?.[0]}>
                <select value={form.category} onChange={set('category')} className={inputClass}>
                  <option value="bahan">Bahan</option>
                  <option value="barang">Barang</option>
                </select>
              </Field>
              <Field label="Satuan" error={errors.unit?.[0]}>
                <input list="units" value={form.unit} maxLength={30} onChange={set('unit')} placeholder="kg, liter, pcs..." className={inputClass} />
              </Field>
              <Field label="Stok minimal" error={errors.min_stock?.[0]}>
                <input type="number" min="0" step="any" value={form.min_stock} onChange={set('min_stock')} className={inputClass} />
              </Field>
              <Field label="Stok maksimal" error={errors.max_stock?.[0]}>
                <input type="number" min="0" step="any" value={form.max_stock} onChange={set('max_stock')} className={inputClass} />
              </Field>
            </div>
            {canPrice && (
              <Field label="Harga satuan acuan (Rp)" error={errors.price?.[0]}>
                <input type="number" min="0" step="any" value={form.price} onChange={set('price')} className={inputClass} />
                <p className="mt-1 text-xs text-slate-400">Harga acuan untuk gudang ini. Harga final ditentukan di setiap PO.</p>
              </Field>
            )}
            <Field label="Catatan" error={errors.note?.[0]}>
              <input value={form.note} maxLength={255} onChange={set('note')} className={inputClass} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.is_active} onChange={set('is_active')} />
              Aktif (bisa dipilih di dokumen baru)
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setModal(null)}>Batal</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  )
}
