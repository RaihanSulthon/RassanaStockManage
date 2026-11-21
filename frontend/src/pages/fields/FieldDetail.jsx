import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import StockPanel from '../../components/StockPanel'
import { Alert, Button, PageHeader } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import api from '../../lib/api'
import { errorMessage } from '../../lib/format'
import { useApi } from '../../lib/hooks'
import { isPrivileged } from '../../lib/roles'
import { toast } from '../../lib/toast'
import LocationFormModal from '../warehouses/LocationFormModal'

/**
 * Detail stok satu lapangan. Dua jalur masuk:
 *  - /warehouses/:warehouseId/fields/:fieldId  → dari tab Lapangan di detail gudang (Admin/Purchasing/Finance/Operation1).
 *  - /fields/:fieldId                          → dari menu "Stok Lapangan" (User/Operation1).
 * Ubah stok lapangan: Admin/Purchasing/Finance, dan User/Operation1 yang punya akses ke lapangan ini.
 */
export default function FieldDetail() {
  const { warehouseId, fieldId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const isAdmin = user.role === 'admin'
  const canAdjust = isPrivileged(user.role) || ['user', 'operation1'].includes(user.role)

  const { data, loading, error, reload } = useApi('/locations', { all: 1 })
  const all = useMemo(() => data?.data || [], [data])
  const [editing, setEditing] = useState(false)
  const [pageError, setPageError] = useState('')

  const field = all.find((l) => l.id === Number(fieldId) && l.type === 'field' && (!warehouseId || l.parent_id === Number(warehouseId)))
  const warehouses = all.filter((l) => l.type === 'warehouse')
  const fieldCount = all.filter((l) => l.type === 'field').length
  const back = warehouseId ? `/warehouses/${warehouseId}?tab=lapangan` : fieldCount > 1 ? '/fields' : undefined

  const remove = async () => {
    if (!window.confirm(`Hapus lapangan "${field.name}"?`)) return
    setPageError('')
    try {
      await api.delete(`/locations/${field.id}`)
      toast(`Lapangan "${field.name}" dihapus.`)
      navigate(`/warehouses/${field.parent_id}?tab=lapangan`)
    } catch (err) {
      setPageError(errorMessage(err))
    }
  }

  if (loading && !data) return <p className="py-6 text-center text-slate-500">Memuat...</p>
  if (!field) {
    return (
      <div>
        <PageHeader title="Lapangan" back={warehouseId ? `/warehouses/${warehouseId}?tab=lapangan` : '/fields'} />
        <Alert>{error || 'Lapangan tidak ditemukan atau Anda tidak punya akses.'}</Alert>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        back={back}
        title={
          <>
            Lapangan {field.name}
            {!field.is_active && <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 align-middle text-xs font-semibold text-slate-600">Nonaktif</span>}
          </>
        }
        subtitle={
          <>
            {field.parent && <>di bawah <b className="text-slate-600">Gudang {field.parent.name}</b> · </>}
            {field.address || 'Alamat belum diisi'}
          </>
        }
      >
        {isAdmin && (
          <>
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit Lapangan</Button>
            <Button size="sm" variant="danger" onClick={remove}>Hapus Lapangan</Button>
          </>
        )}
      </PageHeader>

      <Alert>{pageError}</Alert>

      <StockPanel key={field.id} location={field} canAdjust={canAdjust} />

      {editing && (
        <LocationFormModal
          type="field"
          row={field}
          warehouses={warehouses}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false)
            reload()
            // Jika dipindah ke gudang lain, ikuti URL gudang barunya.
            if (warehouseId && saved?.parent_id && saved.parent_id !== Number(warehouseId)) {
              navigate(`/warehouses/${saved.parent_id}/fields/${saved.id}`, { replace: true })
            }
          }}
        />
      )}
    </div>
  )
}
