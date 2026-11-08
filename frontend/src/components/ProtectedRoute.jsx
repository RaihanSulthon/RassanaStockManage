import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * <ProtectedRoute />                       -> wajib login
 * <ProtectedRoute roles={['admin']} />     -> wajib login + role tertentu
 *
 * Ini hanya UX. Keamanan sebenarnya tetap ditegakkan di BE.
 */
export default function ProtectedRoute({ roles }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Memuat...</div>
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (roles && !roles.includes(user.role)) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-lg bg-white p-8 text-center shadow">
        <h1 className="text-2xl font-bold text-red-600">403</h1>
        <p className="mt-2 text-slate-600">Anda tidak memiliki akses ke halaman ini.</p>
      </div>
    )
  }

  return <Outlet />
}
