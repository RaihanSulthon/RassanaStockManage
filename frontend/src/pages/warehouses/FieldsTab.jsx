import { useState } from 'react'
import { Alert, Button, Card } from '../../components/ui'
import api from '../../lib/api'
import { errorMessage } from '../../lib/format'
import { useDebounced } from '../../lib/hooks'
import { toast } from '../../lib/toast'
import LocationFormModal from './LocationFormModal'

const inactiveBadge = (row) =>
  !row.is_active ? <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">Nonaktif</span> : null

/** Lapangan di bawah satu gudang. Tambah/ubah/hapus hanya Admin. */
export default function FieldsTab({ warehouse, fields, warehouses, canManage, reload }) {
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim().toLowerCase(), 200)
  const [status, setStatus] = useState('all')
  const [modal, setModal] = useState(null) // { row? }
  const [error, setError] = useState('')

  const shown = fields.filter(
    (f) =>
      (status === 'all' || (status === 'active' ? f.is_active : !f.is_active)) &&
      (!q || f.name.toLowerCase().includes(q) || (f.address || '').toLowerCase().includes(q)),
  )

  const remove = async (row) => {
    if (!window.confirm(`Hapus lapangan "${row.name}"?`)) return
    setError('')
    try {
      await api.delete(`/locations/${row.id}`)
      toast(`Lapangan "${row.name}" dihapus.`)
      reload()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {fields.length > 0 && (
          <>
            <input
              type="search"
              placeholder="Cari lapangan / alamat..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm sm:max-w-xs"
            />
            <div className="flex rounded border border-slate-300 text-sm">
              {[['all', 'Semua'], ['active', 'Aktif'], ['inactive', 'Nonaktif']].map(([v, l]) => (
                <button key={v} onClick={() => setStatus(v)} className={`px-3 py-1.5 ${status === v ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                  {l}
                </button>
              ))}
            </div>
          </>
        )}
        {canManage && (
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => setModal({})}
            disabled={!warehouse.is_active}
            title={!warehouse.is_active ? 'Aktifkan gudang terlebih dahulu' : undefined}
          >
            + Lapangan
          </Button>
        )}
      </div>

      <Alert>{error}</Alert>

      {fields.length === 0 ? (
        <div className="py-8 text-center text-slate-500">
          Belum ada lapangan di gudang ini.
          {canManage && warehouse.is_active && (
            <>
              {' '}
              <button className="text-blue-600 hover:underline" onClick={() => setModal({})}>Tambah lapangan pertama</button>.
            </>
          )}
        </div>
      ) : shown.length === 0 ? (
        <p className="py-6 text-center text-slate-500">Tidak ada lapangan yang cocok.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-slate-500">
              <tr>
                <th className="py-2 pr-3 font-medium">Lapangan</th>
                <th className="py-2 pr-3 font-medium">Alamat</th>
                <th className="py-2 pr-3 font-medium">Akun</th>
                {canManage && <th />}
              </tr>
            </thead>
            <tbody>
              {shown.map((f) => (
                <tr key={f.id} className="border-b last:border-0">
                  <td className="py-2 pr-3">
                    <span className={f.is_active ? 'text-slate-800' : 'text-slate-400'}>{f.name}</span>
                    {inactiveBadge(f)}
                  </td>
                  <td className="py-2 pr-3 text-slate-600">{f.address || '-'}</td>
                  <td className="py-2 pr-3 text-slate-600">{f.users_count ?? 0}</td>
                  {canManage && (
                    <td className="whitespace-nowrap py-2 text-right">
                      <button onClick={() => setModal({ row: f })} className="mr-3 text-blue-600 hover:underline">Edit</button>
                      <button onClick={() => remove(f)} className="text-red-600 hover:underline">Hapus</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <LocationFormModal
          type="field"
          row={modal.row}
          parentId={warehouse.id}
          warehouses={warehouses}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            reload()
          }}
        />
      )}
    </Card>
  )
}
