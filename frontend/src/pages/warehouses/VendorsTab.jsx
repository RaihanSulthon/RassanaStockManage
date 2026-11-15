import { useState } from 'react'
import { Alert, Button, Card, Field, Modal, Table, inputClass } from '../../components/ui'
import api from '../../lib/api'
import { errorMessage } from '../../lib/format'
import { useApi, useDebounced } from '../../lib/hooks'
import { toast } from '../../lib/toast'

const emptyForm = { name: '', contact_person: '', phone: '', email: '', address: '', note: '', is_active: true }
const toForm = (r) => ({
  name: r.name, contact_person: r.contact_person || '', phone: r.phone || '', email: r.email || '',
  address: r.address || '', note: r.note || '', is_active: r.is_active,
})

/**
 * Vendor yang mengirim ke gudang ini. Satu vendor bisa melayani beberapa gudang;
 * PO untuk gudang ini hanya bisa memilih vendor dari daftar ini.
 */
export default function VendorsTab({ warehouse, onChanged }) {
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim())
  const { data, loading, error, reload } = useApi('/vendors', { warehouse_id: warehouse.id, all: 1, search: q || undefined })
  const [modal, setModal] = useState(null) // { id|null, mode: 'new'|'existing' }
  const [pageError, setPageError] = useState('')

  const rows = data?.data || []
  const done = () => {
    setModal(null)
    reload()
    onChanged?.()
  }

  const detach = async (row) => {
    const others = row.warehouses.filter((w) => w.id !== warehouse.id)
    const msg = others.length
      ? `Lepas vendor "${row.name}" dari Gudang ${warehouse.name}? Vendor tetap melayani ${others.map((w) => w.name).join(', ')}.`
      : `Hapus vendor "${row.name}" dari Gudang ${warehouse.name}?`
    if (!window.confirm(msg)) return
    setPageError('')
    try {
      const res = await api.delete(`/locations/${warehouse.id}/vendors/${row.id}`)
      toast(res.data.message)
      reload()
      onChanged?.()
    } catch (err) {
      setPageError(errorMessage(err))
    }
  }

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Cari vendor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm sm:max-w-xs"
        />
        <Button size="sm" className="ml-auto" onClick={() => setModal({ id: null, mode: 'existing' })}>+ Vendor</Button>
      </div>

      <Alert>{error || pageError}</Alert>
      {!loading && rows.length === 0 && !q ? (
        <div className="py-8 text-center text-slate-500">
          Belum ada vendor yang mengirim ke gudang ini.{' '}
          <button className="text-blue-600 hover:underline" onClick={() => setModal({ id: null, mode: 'existing' })}>Tambah vendor</button>.
          <p className="mt-1 text-xs text-slate-400">PO untuk gudang ini hanya bisa memilih vendor yang terdaftar di sini.</p>
        </div>
      ) : (
        <Table
          loading={loading}
          rows={rows}
          empty="Tidak ada vendor yang cocok."
          columns={[
            { label: 'Nama', render: (r) => <span className={`font-medium ${r.is_active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{r.name}</span> },
            { label: 'Kontak', render: (r) => r.contact_person || '-' },
            { label: 'Telepon', render: (r) => r.phone || '-' },
            { label: 'Email', render: (r) => r.email || '-' },
            {
              label: 'Juga melayani',
              render: (r) => {
                const others = r.warehouses.filter((w) => w.id !== warehouse.id)
                return others.length ? <span className="text-xs text-slate-500">{others.map((w) => w.name).join(', ')}</span> : '-'
              },
            },
            { label: 'Status', render: (r) => (r.is_active ? 'Aktif' : 'Nonaktif') },
            {
              label: '',
              className: 'text-right whitespace-nowrap',
              render: (r) => (
                <>
                  <button onClick={() => setModal({ id: r.id, row: r })} className="mr-3 text-blue-600 hover:underline">Edit</button>
                  <button onClick={() => detach(r)} className="text-red-600 hover:underline">{r.warehouses.length > 1 ? 'Lepas' : 'Hapus'}</button>
                </>
              ),
            },
          ]}
        />
      )}

      {modal && (
        <VendorModal
          warehouse={warehouse}
          modal={modal}
          linkedIds={rows.map((r) => r.id)}
          onMode={(mode) => setModal({ ...modal, mode })}
          onClose={() => setModal(null)}
          onDone={done}
        />
      )}
    </Card>
  )
}

function VendorModal({ warehouse, modal, linkedIds, onMode, onClose, onDone }) {
  const isEdit = !!modal.id
  const mode = isEdit ? 'new' : modal.mode
  const [form, setForm] = useState(isEdit ? toForm(modal.row) : emptyForm)
  const [vendorId, setVendorId] = useState('')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  // Vendor lain yang belum melayani gudang ini (untuk dipilih ulang tanpa ketik data lagi).
  const allVendors = useApi(!isEdit ? '/vendors' : null, { all: 1 }).data?.data || []
  const available = allVendors.filter((v) => !linkedIds.includes(v.id))

  const save = async () => {
    setBusy(true)
    setErrors({})
    try {
      if (isEdit) {
        const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v]))
        await api.put(`/vendors/${modal.id}`, payload)
        toast('Perubahan vendor tersimpan.')
      } else if (mode === 'existing') {
        await api.post(`/locations/${warehouse.id}/vendors`, { vendor_id: vendorId || null })
        toast(`Vendor ditambahkan ke Gudang ${warehouse.name}.`)
      } else {
        const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v]))
        await api.post('/vendors', { ...payload, warehouse_id: warehouse.id })
        toast(`Vendor "${form.name}" ditambahkan ke Gudang ${warehouse.name}.`)
      }
      onDone()
    } catch (err) {
      if (err.response?.status === 422) setErrors(err.response.data.errors || {})
      else setErrors({ general: [errorMessage(err)] })
    } finally {
      setBusy(false)
    }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  return (
    <Modal title={isEdit ? 'Edit Vendor' : `Tambah Vendor · Gudang ${warehouse.name}`} onClose={onClose}>
      <Alert>{errors.general?.[0] || errors.warehouse_id?.[0]}</Alert>
      {!isEdit && (
        <div className="mb-4 flex rounded border border-slate-300 text-sm">
          {[['existing', 'Vendor yang sudah ada'], ['new', 'Vendor baru']].map(([v, l]) => (
            <button key={v} type="button" onClick={() => onMode(v)} className={`flex-1 px-3 py-1.5 ${mode === v ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {l}
            </button>
          ))}
        </div>
      )}
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        {mode === 'existing' ? (
          <Field label="Pilih vendor" error={errors.vendor_id?.[0]}>
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={inputClass}>
              <option value="">— Pilih vendor —</option>
              {available.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}{v.warehouses.length ? ` · melayani ${v.warehouses.map((w) => w.name).join(', ')}` : ''}
                </option>
              ))}
            </select>
            {available.length === 0 && (
              <p className="mt-1 text-xs text-slate-500">
                Semua vendor sudah terdaftar di gudang ini.{' '}
                <button type="button" className="text-blue-600 hover:underline" onClick={() => onMode('new')}>Buat vendor baru</button>.
              </p>
            )}
          </Field>
        ) : (
          <>
            {isEdit && modal.row.warehouses.length > 1 && (
              <Alert kind="info">Vendor ini juga melayani gudang lain. Perubahan data berlaku di semua gudang tersebut.</Alert>
            )}
            <Field label="Nama vendor" error={errors.name?.[0]}>
              <input autoFocus value={form.name} maxLength={150} onChange={set('name')} className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nama kontak" error={errors.contact_person?.[0]}>
                <input value={form.contact_person} maxLength={100} onChange={set('contact_person')} className={inputClass} />
              </Field>
              <Field label="Telepon" error={errors.phone?.[0]}>
                <input value={form.phone} maxLength={50} onChange={set('phone')} className={inputClass} />
              </Field>
            </div>
            <Field label="Email" error={errors.email?.[0]}>
              <input type="email" value={form.email} maxLength={150} onChange={set('email')} className={inputClass} />
            </Field>
            <Field label="Alamat" error={errors.address?.[0]}>
              <input value={form.address} maxLength={255} onChange={set('address')} className={inputClass} />
            </Field>
            <Field label="Catatan" error={errors.note?.[0]}>
              <input value={form.note} maxLength={255} onChange={set('note')} className={inputClass} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.is_active} onChange={set('is_active')} />
              Aktif
            </label>
          </>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  )
}
