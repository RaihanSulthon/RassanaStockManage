import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import StockPanel from '../../components/StockPanel'
import { Alert, Button, PageHeader } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import api from '../../lib/api'
import { errorMessage } from '../../lib/format'
import { useApi } from '../../lib/hooks'
import { canManageWarehouse, isPrivileged } from '../../lib/roles'
import { toast } from '../../lib/toast'
import FieldsTab from './FieldsTab'
import ItemsTab from './ItemsTab'
import LocationFormModal from './LocationFormModal'
import VendorsTab from './VendorsTab'

/**
 * Satu gudang: stok gudang ini saja, barang & harga, vendor, dan daftar lapangan.
 * Stok lapangan dibuka lewat tab Lapangan → halaman detail lapangan.
 * Ubah stok gudang: Admin/Purchasing/Finance (semua gudang) dan Logistic (gudang yang ditugaskan).
 * Operation1/User tidak bisa membuka halaman ini.
 */
export default function WarehouseDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const isAdmin = user.role === 'admin'
  const privileged = isPrivileged(user.role)

  const { data, loading, error, reload } = useApi('/locations', { all: 1 })
  const all = useMemo(() => data?.data || [], [data])
  const [editing, setEditing] = useState(false)
  const [pageError, setPageError] = useState('')

  const warehouse = all.find((l) => l.id === Number(id) && l.type === 'warehouse')
  const warehouses = all.filter((l) => l.type === 'warehouse')
  const fields = all.filter((l) => l.type === 'field' && l.parent_id === Number(id))

  const tabs = [
    ['stok', 'Stok'],
    ['barang', `Barang & Bahan${warehouse ? ` (${warehouse.items_count ?? 0})` : ''}`],
    ...(privileged ? [['vendor', `Vendor${warehouse ? ` (${warehouse.vendors_count ?? 0})` : ''}`]] : []),
    ['lapangan', `Lapangan (${fields.length})`],
  ]
  const tab = tabs.some(([v]) => v === params.get('tab')) ? params.get('tab') : 'stok'
  const setTab = (v) => setParams(v === 'stok' ? {} : { tab: v }, { replace: true })

  const removeWarehouse = async () => {
    if (!window.confirm(`Hapus gudang "${warehouse.name}"?`)) return
    setPageError('')
    try {
      await api.delete(`/locations/${warehouse.id}`)
      toast(`Gudang "${warehouse.name}" dihapus.`)
      navigate('/warehouses')
    } catch (err) {
      setPageError(errorMessage(err))
    }
  }

  if (loading && !data) return <p className="py-6 text-center text-slate-500">Memuat...</p>
  if (!warehouse) {
    return (
      <div>
        <PageHeader title="Gudang" back="/warehouses" />
        <Alert>{error || 'Gudang tidak ditemukan atau Anda tidak punya akses.'}</Alert>
      </div>
    )
  }

  const deletable = fields.length === 0 && !warehouse.items_count

  return (
    <div className="space-y-4">
      <PageHeader
        back={privileged || warehouses.length > 1 ? '/warehouses' : undefined}
        title={
          <>
            Gudang {warehouse.name}
            {!warehouse.is_active && <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 align-middle text-xs font-semibold text-slate-600">Nonaktif</span>}
          </>
        }
        subtitle={warehouse.address || 'Alamat belum diisi'}
      >
        {isAdmin && (
          <>
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit Gudang</Button>
            <Button
              size="sm"
              variant="danger"
              onClick={removeWarehouse}
              disabled={!deletable}
              title={deletable ? undefined : 'Gudang yang sudah punya barang atau lapangan tidak bisa dihapus. Nonaktifkan saja.'}
            >
              Hapus Gudang
            </Button>
          </>
        )}
      </PageHeader>

      <Alert>{pageError}</Alert>

      <div className="flex gap-1 overflow-x-auto border-b">
        {tabs.map(([v, l]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${tab === v ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'stok' && <StockPanel key={warehouse.id} location={warehouse} canAdjust={canManageWarehouse(user.role)} />}
      {tab === 'barang' && <ItemsTab warehouse={warehouse} onChanged={reload} />}
      {tab === 'vendor' && privileged && <VendorsTab warehouse={warehouse} onChanged={reload} />}
      {tab === 'lapangan' && <FieldsTab warehouse={warehouse} fields={fields} canManage={isAdmin} reload={reload} />}

      {editing && (
        <LocationFormModal
          type="warehouse"
          row={warehouse}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            reload()
          }}
        />
      )}
    </div>
  )
}
