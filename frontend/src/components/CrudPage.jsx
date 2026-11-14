import { useState } from 'react'
import api from '../lib/api'
import { errorMessage } from '../lib/format'
import { useApi, useDebounced } from '../lib/hooks'
import { Alert, Button, Card, Field, Modal, PageHeader, Table, inputClass } from './ui'

/**
 * Halaman master data sederhana (daftar + tambah/edit di modal + hapus/nonaktifkan).
 * fields: [{ name, label, type: 'text'|'number'|'select'|'checkbox', options: [[v,l]], required, hint, show(form) }]
 */
export default function CrudPage({ title, subtitle, endpoint, columns, fields, emptyForm, toForm, filters, extraParams = {} }) {
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  const { data, loading, error, reload } = useApi(endpoint, { all: 1, search: q || undefined, ...extraParams })
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  const open = (row) => {
    setForm(row ? toForm(row) : emptyForm)
    setErrors({})
    setModal(row ? { id: row.id } : { id: null })
  }

  const save = async () => {
    setBusy(true)
    setErrors({})
    try {
      const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v]))
      if (modal.id) await api.put(`${endpoint}/${modal.id}`, payload)
      else await api.post(endpoint, payload)
      setModal(null)
      setMessage({ kind: 'ok', text: 'Data tersimpan.' })
      reload()
    } catch (err) {
      if (err.response?.status === 422) setErrors(err.response.data.errors || {})
      else setErrors({ general: [errorMessage(err)] })
    } finally {
      setBusy(false)
    }
  }

  const remove = async (row) => {
    if (!window.confirm(`Hapus "${row.name}"?`)) return
    try {
      await api.delete(`${endpoint}/${row.id}`)
      setMessage({ kind: 'ok', text: 'Data dihapus.' })
      reload()
    } catch (err) {
      setMessage({ kind: 'error', text: errorMessage(err) })
    }
  }

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle}>
        <input type="search" placeholder="Cari nama..." value={search} onChange={(e) => setSearch(e.target.value)} className="rounded border border-slate-300 px-3 py-1.5 text-sm" />
        <Button size="sm" onClick={() => open(null)}>+ Tambah</Button>
      </PageHeader>
      <Card>
        {filters}
        <Alert kind={message?.kind}>{message?.text}</Alert>
        <Alert>{error}</Alert>
        <Table
          loading={loading}
          rows={data?.data}
          columns={[
            ...columns,
            {
              label: '',
              className: 'text-right whitespace-nowrap',
              render: (r) => (
                <>
                  <button onClick={() => open(r)} className="mr-3 text-blue-600 hover:underline">Edit</button>
                  <button onClick={() => remove(r)} className="text-red-600 hover:underline">Hapus</button>
                </>
              ),
            },
          ]}
        />
      </Card>

      {modal && (
        <Modal title={modal.id ? `Edit ${title}` : `Tambah ${title}`} onClose={() => setModal(null)}>
          <Alert>{errors.general?.[0]}</Alert>
          <div className="space-y-3">
            {fields
              .filter((f) => !f.show || f.show(form))
              .map((f) => (
                <Field key={f.name} label={f.type === 'checkbox' ? null : f.label} error={errors[f.name]?.[0]}>
                  {f.type === 'select' ? (
                    <select value={form[f.name] ?? ''} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} className={inputClass}>
                      {!f.required && <option value="">—</option>}
                      {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  ) : f.type === 'checkbox' ? (
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={!!form[f.name]} onChange={(e) => setForm({ ...form, [f.name]: e.target.checked })} />
                      {f.label}
                    </label>
                  ) : (
                    <input
                      type={f.type || 'text'}
                      step={f.type === 'number' ? 'any' : undefined}
                      min={f.type === 'number' ? 0 : undefined}
                      list={f.list}
                      value={form[f.name] ?? ''}
                      onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                      className={inputClass}
                    />
                  )}
                  {f.hint && <p className="mt-1 text-xs text-slate-400">{f.hint}</p>}
                </Field>
              ))}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Batal</Button>
            <Button onClick={save} disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan'}</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
