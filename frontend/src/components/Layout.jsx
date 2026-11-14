import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ROLES } from '../lib/roles'

const linkClass = ({ isActive }) =>
  `rounded px-3 py-1.5 text-sm font-medium ${
    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
  }`

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const canManageUsers = [ROLES.ADMIN, ROLES.CO_ADMIN].includes(user.role)

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-lg font-bold text-slate-800">
              Stock Management
            </Link>
            <nav className="flex gap-1">
              <NavLink to="/" end className={linkClass}>
                Dashboard
              </NavLink>
              <NavLink to="/stock" className={linkClass}>
                Stock
              </NavLink>
              {canManageUsers && (
                <NavLink to="/users" className={linkClass}>
                  Kelola User
                </NavLink>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-700">
              {user.name}{' '}
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                {user.role_label}
              </span>
            </span>
            <button
              onClick={handleLogout}
              className="rounded border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
            >
              Logout
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
