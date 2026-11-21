import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import NotificationBell from './NotificationBell'
import Toaster from './Toaster'

// Menu per role, mengikuti tugas di activity diagram
const MENU = {
  user: [
    ['/', 'Dashboard'],
    ['/fields', 'Stok Lapangan'],
    ['/usage', 'Pemakaian Harian'],
    ['/ur', 'User Request (UR)'],
    ['/transfers', 'Penerimaan dari Gudang'],
  ],
  operation1: [
    ['/', 'Dashboard'],
    ['/fields', 'Stok Lapangan'],
    ['/warehouses', 'Gudang'],
    ['/ur', 'UR Masuk'],
    ['/pr', 'Purchasing Requisition (PR)'],
    ['/po', 'PO & Penerimaan Vendor'],
    ['/transfers', 'Kirim ke Lapangan'],
  ],
  purchasing: [
    ['/', 'Dashboard'],
    ['/warehouses', 'Gudang'],
    ['/pr', 'PR Masuk'],
    ['/po', 'Purchase Order (PO)'],
    ['/payments', 'Pembayaran'],
  ],
  finance: [
    ['/', 'Dashboard'],
    ['/warehouses', 'Gudang'],
    ['/po', 'Approval PO'],
    ['/payments', 'Pembayaran'],
  ],
  admin: [
    ['/', 'Dashboard'],
    ['/warehouses', 'Gudang'],
    ['/usage', 'Pemakaian Harian'],
    ['/ur', 'UR'],
    ['/pr', 'PR'],
    ['/po', 'PO'],
    ['/transfers', 'Pengiriman Lapangan'],
    ['/payments', 'Pembayaran'],
    ['-', 'Pengaturan'],
    ['/users', 'Kelola User'],
  ],
}

const linkClass = ({ isActive }) =>
  `block whitespace-nowrap rounded px-3 py-1.5 text-sm font-medium ${
    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
  }`

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const menu = MENU[user.role] || MENU.user

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-20 border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="text-lg font-bold text-slate-800">
            Stock Management
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <NotificationBell />
            <span className="hidden text-slate-700 sm:inline">
              {user.name}{' '}
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">{user.role_label}</span>
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

      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:flex-row md:gap-6 md:py-6">
        <nav className="flex gap-1 overflow-x-auto md:w-56 md:shrink-0 md:flex-col md:overflow-visible">
          {menu.map(([to, label]) =>
            to === '-' ? (
              <div key={label} className="hidden px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 md:block">
                {label}
              </div>
            ) : (
              <NavLink key={to} to={to} end={to === '/'} className={linkClass}>
                {label}
              </NavLink>
            ),
          )}
          {user.locations?.length > 0 && (
            <div className="hidden px-3 pt-4 text-xs text-slate-500 md:block">
              <div className="font-semibold uppercase tracking-wide text-slate-400">Lokasi Anda</div>
              {user.locations.map((l) => (
                <div key={l.id} className="mt-1">
                  {l.type === 'warehouse' ? 'Gudang' : 'Lapangan'} {l.name}
                </div>
              ))}
            </div>
          )}
        </nav>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  )
}
