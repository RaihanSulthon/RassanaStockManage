import { useCallback, useEffect, useState } from 'react'
import api from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { MANAGEABLE_ROLES, ROLE_LABELS } from '../lib/roles'

const emptyForm = { name: '', email: '', password: '', role: 'user' }

export default function Users() {
  const { user: me } = useAuth()
  const roleOptions = MANAGEABLE_ROLES[me.role]

  const [users, setUsers] = useState([])
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1 })
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')

  const [modal, setModal] = useState(null) // { mode: 'create' | 'edit', id? }
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  // Debounce pencarian
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setPageError('')
    try {
      const res = await api.get('/users', { params: { page, search: debouncedSearch } })
      setUsers(res.data.data)
      setMeta(res.data.meta)
    } catch (err) {
      setPageError(err.response?.data?.message || 'Gagal memuat data user.')
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const openCreate = () => {
    setForm({ ...emptyForm, role: 'user' })
    setErrors({})
    setModal({ mode: 'create' })
  }

  const openEdit = (u) => {
    setForm({ name: u.name, email: u.email, password: '', role: u.role })
    setErrors({})
    setModal({ mode: 'edit', id: u.id })
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    try {
      if (modal.mode === 'create') {
        await api.post('/users', form)
      } else {
        const payload = { ...form }
        if (!payload.password) delete payload.password
        await api.put(`/users/${modal.id}`, payload)
      }
      setModal(null)
      fetchUsers()
    } catch (err) {
      if (err.response?.status === 422) setErrors(err.response.data.errors || {})
      else setErrors({ general: [err.response?.data?.message || 'Terjadi kesalahan.'] })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (u) => {
    if (!window.confirm(`Hapus user "${u.name}"?`)) return
    try {
      await api.delete(`/users/${u.id}`)
      fetchUsers()
    } catch (err) {
      alert(err.response?.data?.errors?.role?.[0] || err.response?.data?.errors?.user?.[0] || err.response?.data?.message || 'Gagal menghapus user.')
    }
  }

  const fieldError = (name) =>
    errors[name] && <p className="mt-1 text-xs text-red-600">{errors[name][0]}</p>

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-800">Kelola User</h1>
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Cari nama / email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            onClick={openCreate}
            className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            + Tambah User
          </button>
        </div>
      </div>

      {pageError && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{pageError}</div>}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-slate-500">
            <tr>
              <th className="py-2 pr-4">Nama</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Role</th>
              <th className="py-2 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-slate-500">
                  Memuat...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-slate-500">
                  Tidak ada data.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-medium text-slate-800">
                    {u.name} {u.id === me.id && <span className="text-xs text-slate-400">(Anda)</span>}
                  </td>
                  <td className="py-2 pr-4 text-slate-600">{u.email}</td>
                  <td className="py-2 pr-4">
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      {u.role_label}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    {u.can?.update && (
                      <button onClick={() => openEdit(u)} className="mr-3 text-blue-600 hover:underline">
                        Edit
                      </button>
                    )}
                    {u.can?.delete && (
                      <button onClick={() => handleDelete(u)} className="text-red-600 hover:underline">
                        Hapus
                      </button>
                    )}
                    {!u.can?.update && !u.can?.delete && <span className="text-slate-400">-</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
        <span>
          Halaman {meta.current_page} dari {meta.last_page}
        </span>
        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded border px-3 py-1 disabled:opacity-40"
          >
            Sebelumnya
          </button>
          <button
            disabled={page >= meta.last_page}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border px-3 py-1 disabled:opacity-40"
          >
            Berikutnya
          </button>
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 px-4">
          <form onSubmit={handleSave} className="w-full max-w-md space-y-3 rounded-lg bg-white p-6 shadow-lg">
            <h2 className="text-lg font-bold text-slate-800">
              {modal.mode === 'create' ? 'Tambah User' : 'Edit User'}
            </h2>

            {errors.general && (
              <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{errors.general[0]}</div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Nama</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded border border-slate-300 px-3 py-2"
              />
              {fieldError('name')}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded border border-slate-300 px-3 py-2"
              />
              {fieldError('email')}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Password {modal.mode === 'edit' && <span className="text-slate-400">(kosongkan jika tidak diubah)</span>}
              </label>
              <input
                type="password"
                required={modal.mode === 'create'}
                minLength={8}
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full rounded border border-slate-300 px-3 py-2"
              />
              {fieldError('password')}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full rounded border border-slate-300 px-3 py-2"
              >
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              {fieldError('role')}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded border border-slate-300 px-4 py-2 text-sm"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
              >
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
