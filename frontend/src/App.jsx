import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Dashboard from './pages/Dashboard'
import FieldDetail from './pages/fields/FieldDetail'
import FieldList from './pages/fields/FieldList'
import Login from './pages/Login'
import Payments from './pages/Payments'
import Usage from './pages/Usage'
import Users from './pages/Users'
import PoDetail from './pages/po/PoDetail'
import PoList from './pages/po/PoList'
import PrDetail from './pages/pr/PrDetail'
import PrList from './pages/pr/PrList'
import ReceiptDetail from './pages/receipts/ReceiptDetail'
import ReceiptList from './pages/receipts/ReceiptList'
import TransferDetail from './pages/transfers/TransferDetail'
import TransferList from './pages/transfers/TransferList'
import UrDetail from './pages/ur/UrDetail'
import UrList from './pages/ur/UrList'
import WarehouseDetail from './pages/warehouses/WarehouseDetail'
import WarehouseList from './pages/warehouses/WarehouseList'
import { ROLES } from './lib/roles'

const { ADMIN, PURCHASING, FINANCE, LOGISTIC, OPERATION1, USER } = ROLES

// Pembatasan route hanya untuk UX; hak akses sebenarnya ditegakkan di BE.
function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />

          {/* Stok lapangan langsung (tanpa lewat gudang): User & Operation1. Mereka tidak bisa melihat gudang. */}
          <Route element={<ProtectedRoute roles={[USER, OPERATION1]} redirectTo="/warehouses" />}>
            <Route path="/fields" element={<FieldList />} />
            <Route path="/fields/:fieldId" element={<FieldDetail />} />
          </Route>
          <Route path="/stock" element={<Navigate to="/fields" replace />} />

          {/* Gudang: stok, barang & harga, vendor, dan lapangan per gudang. */}
          <Route element={<ProtectedRoute roles={[ADMIN, PURCHASING, FINANCE, LOGISTIC]} redirectTo="/fields" />}>
            <Route path="/warehouses" element={<WarehouseList />} />
            <Route path="/warehouses/:id" element={<WarehouseDetail />} />
            <Route path="/warehouses/:warehouseId/fields/:fieldId" element={<FieldDetail />} />
          </Route>
          {/* Alamat lama sebelum menu digabung ke Gudang */}
          <Route path="/master/*" element={<Navigate to="/warehouses" replace />} />

          <Route element={<ProtectedRoute roles={[USER, OPERATION1, ADMIN]} />}>
            <Route path="/usage" element={<Usage />} />
          </Route>

          {/* Pengiriman gudang -> lapangan: dikirim Logistic, diterima Operation1/User, dipantau role lain. */}
          <Route element={<ProtectedRoute roles={[USER, OPERATION1, LOGISTIC, ADMIN, PURCHASING, FINANCE]} />}>
            <Route path="/transfers" element={<TransferList />} />
            <Route path="/transfers/new" element={<TransferDetail />} />
            <Route path="/transfers/:id" element={<TransferDetail />} />
          </Route>

          {/* Penerimaan barang vendor di gudang (rekap) */}
          <Route element={<ProtectedRoute roles={[LOGISTIC, ADMIN, PURCHASING, FINANCE]} />}>
            <Route path="/receipts" element={<ReceiptList />} />
            <Route path="/receipts/:id" element={<ReceiptDetail />} />
          </Route>

          <Route element={<ProtectedRoute roles={[OPERATION1, LOGISTIC, ADMIN, PURCHASING, FINANCE]} />}>
            <Route path="/ur" element={<UrList />} />
            <Route path="/ur/new" element={<UrDetail />} />
            <Route path="/ur/:id" element={<UrDetail />} />
          </Route>

          <Route element={<ProtectedRoute roles={[LOGISTIC, ADMIN, PURCHASING, FINANCE]} />}>
            <Route path="/pr" element={<PrList />} />
            <Route path="/pr/new" element={<PrDetail />} />
            <Route path="/pr/:id" element={<PrDetail />} />
            <Route path="/po" element={<PoList />} />
            <Route path="/po/new" element={<PoDetail />} />
            <Route path="/po/:id" element={<PoDetail />} />
          </Route>

          <Route element={<ProtectedRoute roles={[ADMIN, PURCHASING, FINANCE]} />}>
            <Route path="/payments" element={<Payments />} />
          </Route>

          <Route element={<ProtectedRoute roles={[ADMIN]} />}>
            <Route path="/users" element={<Users />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
