import { useState } from 'react'
import { Button, Card } from '../../components/ui'
import { useDebounced } from '../../lib/hooks'
import FieldCards from '../fields/FieldCards'
import LocationFormModal from './LocationFormModal'

/**
 * Lapangan di bawah satu gudang, berupa daftar kartu. Klik lapangan = buka detail stok lapangan itu.
 * Tambah lapangan hanya Admin; edit/hapus ada di halaman detail lapangan.
 */
export default function FieldsTab({ warehouse, fields, canManage, reload }) {
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim().toLowerCase(), 200)
  const [status, setStatus] = useState('active')
  const [creating, setCreating] = useState(false)

  const shown = fields.filter(
    (f) =>
      (status === 'all' || (status === 'active' ? f.is_active : !f.is_active)) &&
      (!q || f.name.toLowerCase().includes(q) || (f.address || '').toLowerCase().includes(q)),
  )

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
              {[['active', 'Aktif'], ['inactive', 'Nonaktif'], ['all', 'Semua']].map(([v, l]) => (
                <button key={v} onClick={() => setStatus(v)} className={`px-3 py-1.5 ${status === v ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                  {l}
                </button>
              ))}
            </div>
            <span className="text-sm text-slate-500">{fields.length} lapangan</span>
          </>
        )}
        {canManage && (
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => setCreating(true)}
            disabled={!warehouse.is_active}
            title={!warehouse.is_active ? 'Aktifkan gudang terlebih dahulu' : undefined}
          >
            + Lapangan
          </Button>
        )}
      </div>

      <p className="mb-3 text-sm text-slate-500">Pilih lapangan untuk melihat stok barang &amp; bahan di lapangan tersebut.</p>

      {fields.length === 0 ? (
        <div className="py-8 text-center text-slate-500">
          Belum ada lapangan di gudang ini.
          {canManage && warehouse.is_active && (
            <>
              {' '}
              <button className="text-blue-600 hover:underline" onClick={() => setCreating(true)}>Tambah lapangan pertama</button>.
            </>
          )}
        </div>
      ) : shown.length === 0 ? (
        <p className="py-6 text-center text-slate-500">Tidak ada lapangan yang cocok.</p>
      ) : (
        <FieldCards fields={shown} linkTo={(f) => `/warehouses/${warehouse.id}/fields/${f.id}`} />
      )}

      {creating && (
        <LocationFormModal
          type="field"
          parentId={warehouse.id}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false)
            setStatus('active')
            reload()
          }}
        />
      )}
    </Card>
  )
}
