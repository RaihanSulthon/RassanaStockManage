import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Stock from './pages/Stock'
import StockEditor from './pages/StockEditor'
import Users from './pages/Users'
import { ROLES } from './lib/roles'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Wajib login */}
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />

          {/* Stock management: satu halaman untuk semua role, isinya menyesuaikan role */}
          <Route path="/stock" element={<Stock />} />
          <Route element={<ProtectedRoute roles={[ROLES.USER, ROLES.ADMIN]} />}>
            <Route path="/stock/new" element={<StockEditor />} />
          </Route>
          <Route path="/stock/:id" element={<StockEditor />} />

          {/* Hanya Admin & Co-Admin */}
          <Route element={<ProtectedRoute roles={[ROLES.ADMIN, ROLES.CO_ADMIN]} />}>
            <Route path="/users" element={<Users />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
