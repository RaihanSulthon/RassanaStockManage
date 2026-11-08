import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const PERMISSIONS = {
  admin: [
    'Melihat dan mengelola semua user (Admin, Co-Admin, User)',
    'Memberikan dan mengubah role',
    'Mengakses seluruh fitur aplikasi',
  ],
  co_admin: [
    'Melihat daftar semua user',
    'Menambah, mengubah, dan menghapus user biasa',
    'Tidak bisa mengelola Admin dan Co-Admin',
  ],
  user: ['Melihat dashboard dan profil sendiri', 'Tidak punya akses ke manajemen user'],
}

export default function Dashboard() {
  const { user } = useAuth()
  const canManageUsers = user.role === 'admin' || user.role === 'co_admin'

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-6 shadow">
        <h1 className="text-2xl font-bold text-slate-800">Halo, {user.name}</h1>
        <p className="text-slate-600">
          Login sebagai <span className="font-semibold">{user.role_label}</span> ({user.email})
        </p>
      </div>

      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-2 font-semibold text-slate-800">Hak akses Anda</h2>
        <ul className="list-disc space-y-1 pl-5 text-slate-600">
          {PERMISSIONS[user.role].map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        {canManageUsers && (
          <Link
            to="/users"
            className="mt-4 inline-block rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Kelola User
          </Link>
        )}
      </div>
    </div>
  )
}
