import { useState } from 'react'
import { Alert, Button, Field, Modal, inputClass } from '../../components/ui'
import api from '../../lib/api'
import { errorMessage } from '../../lib/format'
import { toast } from '../../lib/toast'

/**
 * Form tambah/ubah lokasi.
 * - Gudang: dibuat dari halaman daftar Lokasi.
 * - Lapangan: dibuat dari halaman detail gudang (gudang induk sudah ditentukan).
 *   Saat mengedit lapangan, gudang induk bisa dipindah lewat `warehouses`.
 */
export default function LocationFormModal({ type, row, parentId, warehouses = [], onClose, onSaved }) {
  const isWarehouse = type === 'warehouse'
  const label = isWarehouse ? 'Gudang' : 'Lapangan'
  const [form, setForm] = useState({
    name: row?.name || '',
    address: row?.address || '',
    is_active: row?.is_active ?? true,
    parent_id: row?.parent_id || parentId || '',
  })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    setErrors({})
    try {
      const payload = { ...form, type, parent_id: isWarehouse ? null : form.parent_id || null, address: form.address || null }
      const res = row ? await api.put(`/locations/${row.id}`, payload) : await api.post('/locations', payload)
      toast(row ? `Perubahan ${label.toLowerCase()} tersimpan.` : `${label} "${form.name}" ditambahkan.`)
      onSaved?.(res.data.data)
    } catch (err) {
      if (err.response?.status === 422) setErrors(err.response.data.errors || {})
      else setErrors({ general: [errorMessage(err)] })
    } finally {
      setBusy(false)
    }
  }

  // Pindah gudang hanya ditawarkan saat mengedit lapangan; pilihan = gudang aktif (+ induk saat ini).
  const parentOptions = warehouses.filter((w) => w.is_active || w.id === row?.parent_id)

  return (
    <Modal title={`${row ? 'Edit' : 'Tambah'} ${label}`} onClose={onClose}>
      <Alert>{errors.general?.[0] || errors.type?.[0]}</Alert>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        {!isWarehouse && row && parentOptions.length > 1 && (
          <Field label="Gudang induk" error={errors.parent_id?.[0]}>
            <select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: Number(e.target.value) })} className={inputClass}>
              {parentOptions.map((w) => (
                <option key={w.id} value={w.id}>{w.name}{w.is_active ? '' : ' (nonaktif)'}</option>
              ))}
            </select>
          </Field>
        )}
        {!isWarehouse && !(row && parentOptions.length > 1) && errors.parent_id?.[0] && <Alert>{errors.parent_id[0]}</Alert>}
        <Field label={`Nama ${label.toLowerCase()}`} error={errors.name?.[0]}>
          <input autoFocus value={form.name} maxLength={100} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Alamat" error={errors.address?.[0]}>
          <input value={form.address} maxLength={255} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputClass} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
          Aktif
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  )
}
