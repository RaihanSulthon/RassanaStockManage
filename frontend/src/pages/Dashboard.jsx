import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import { ACTION_STATUS, STATUS_LABELS } from '../lib/stock'
import { useAuth } from '../context/AuthContext'

const PERMISSIONS = {
  admin: [
    'Melihat dan mengelola semua user (Admin, Co-Admin, User, Operation1)',
    'Memberikan dan mengubah role',
    'Memantau dan mengedit laporan stok di semua tahap',
    'Mengakses seluruh fitur aplikasi',
  ],
  co_admin: [
    'Melihat daftar semua user',
    'Menambah, mengubah, dan menghapus user biasa dan Operation1',
    'Tidak bisa mengelola Admin dan Co-Admin',
    'Mengedit laporan stok dari Operation, lalu generate PDF / Excel',
  ],
  user: [
    'Mencatat sisa stok bahan dan barang setiap hari, lalu mengirim ke Operation',
    'Tidak punya akses ke manajemen user',
  ],
  operation1: [
    'Melihat dan mengedit laporan stok dari user, lalu mengirim ke Co-Admin',
    'Tidak punya akses ke manajemen user',
  ],
}

export default function Dashboard() {
  const { user } = useAuth()
  const canManageUsers = user.role === 'admin' || user.role === 'co_admin'
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    api
      .get('/stock-reports/summary')
      .then((res) => setSummary(res.data.data))
      .catch(() => setSummary(null))
  }, [])

  const actionStatus = ACTION_STATUS[user.role]

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-6 shadow">
        <h1 className="text-2xl font-bold text-slate-800">Halo, {user.name}</h1>
        <p className="text-slate-600">
          Login sebagai <span className="font-semibold">{user.role_label}</span> ({user.email})
        </p>
      </div>

      <div className="rounded-lg bg-white p-6 shadow">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Laporan stok</h2>
          <Link to="/stock" className="text-sm text-blue-600 hover:underline">
            Buka Stock Management
          </Link>
        </div>
        {summary ? (
          <div className="flex flex-wrap gap-2">
            {Object.entries(STATUS_LABELS).map(([s, label]) => (
              <Link
                key={s}
                to={`/stock?status=${s}`}
                className={`rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 ${s === actionStatus && summary[s] > 0 ? 'border-red-300 bg-red-50' : ''}`}
              >
                <div className="text-xs text-slate-500">{label}</div>
                <div className="text-lg font-bold text-slate-800">{summary[s]}</div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Memuat...</p>
        )}
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
