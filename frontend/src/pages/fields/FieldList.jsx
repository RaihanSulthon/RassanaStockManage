import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Alert, Card, PageHeader } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useApi, useDebounced } from '../../lib/hooks'
import FieldCards from './FieldCards'

/**
 * Menu "Stok Lapangan" untuk User & Operation1: langsung daftar lapangan yang ditugaskan
 * (Operation1 bisa memegang beberapa lapangan). Satu lapangan → langsung ke detailnya.
 */
export default function FieldList() {
  const { user } = useAuth()
  const { data, loading, error } = useApi('/locations', { all: 1 })
  const fields = useMemo(() => (data?.data || []).filter((l) => l.type === 'field'), [data])
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim().toLowerCase(), 200)
  const [status, setStatus] = useState('active')

  if (data && fields.length === 1) return <Navigate to={`/fields/${fields[0].id}`} replace />

  const shown = fields.filter(
    (f) =>
      (status === 'all' || (status === 'active' ? f.is_active : !f.is_active)) &&
      (!q || [f.name, f.address, f.parent?.name].some((v) => (v || '').toLowerCase().includes(q))),
  )

  return (
    <div>
      <PageHeader title="Stok Lapangan" subtitle="Pilih lapangan untuk melihat dan mengelola stok barang & bahannya." />
      <Card>
        {fields.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input
              type="search"
              placeholder={user.role === 'operation1' ? 'Cari lapangan / gudang / alamat...' : 'Cari lapangan / alamat...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm sm:max-w-xs"
            />
            <div className="flex rounded border border-slate-300 text-sm">
              {[['active', 'Aktif'], ['inactive', 'Nonaktif'], ['all', 'Semua']].map(([v, l]) => (
                <button key={v} onClick={() => setStatus(v)} className={`px-3 py-1.5 ${status === v ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                  {l}
                </button>
              ))}
            </div>
            <span className="text-sm text-slate-500 sm:ml-auto">{fields.length} lapangan</span>
          </div>
        )}

        <Alert>{error}</Alert>

        {loading && !data ? (
          <p className="py-6 text-center text-slate-500">Memuat...</p>
        ) : fields.length === 0 ? (
          <p className="py-8 text-center text-slate-500">Akun Anda belum ditugaskan ke lapangan mana pun. Hubungi Admin.</p>
        ) : shown.length === 0 ? (
          <p className="py-6 text-center text-slate-500">Tidak ada lapangan yang cocok.</p>
        ) : (
          <FieldCards fields={shown} linkTo={(f) => `/fields/${f.id}`} showWarehouse={user.role === 'operation1'} />
        )}
      </Card>
    </div>
  )
}
