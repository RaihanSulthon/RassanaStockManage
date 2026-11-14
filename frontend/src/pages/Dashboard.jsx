import { Link } from 'react-router-dom'
import { Alert, Card } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useApi } from '../lib/hooks'

// Ringkasan tugas tiap role sesuai activity diagram
const GUIDE = {
  user: [
    'Catat pemakaian barang setiap hari di menu Pemakaian Harian.',
    'Lihat saldo stok lapangan harian di menu Saldo Stok.',
    'Buat permintaan barang (UR) ke gudang, lalu kirim ke Operation.',
    'Saat barang dari gudang sampai, catat penerimaannya.',
  ],
  operation1: [
    'Terima UR dari lapangan dan evaluasi.',
    'Hitung stok gudang (harian, mingguan, bulanan) di menu Stok.',
    'Buat PR berdasarkan UR atau estimasi, mengacu stok minimal & maksimal, lalu kirim ke Purchasing.',
    'Saat barang vendor datang: cek dengan surat jalan & PO, lalu catat penerimaan (bisa bertahap).',
    'Kirim barang ke lapangan sesuai kebutuhan.',
  ],
  purchasing: [
    'Terima PR dan validasi dengan data stok gudang & lapangan.',
    'Buat PO ke vendor beserta harga, lalu kirim ke Finance untuk approval.',
    'Revisi PO jika diminta Finance. Setelah disetujui, kirim PO ke vendor.',
    'Kelola master barang (min/max stok, harga) dan vendor.',
  ],
  finance: [
    'Validasi & verifikasi PO dari Purchasing: setujui atau minta revisi.',
    'Setelah barang diterima gudang, cek PO + surat jalan + data penerimaan.',
    'Siapkan pembayaran (catat tagihan vendor), lalu lakukan pembayaran.',
  ],
  admin: ['Buat gudang & lapangan di menu Lokasi.', 'Kelola akun dan penugasan lokasi di Kelola User.', 'Pantau seluruh dokumen dan stok.', 'Isi saldo awal / penyesuaian stok dari menu Stok.'],
}

export default function Dashboard() {
  const { user } = useAuth()
  const { data, error } = useApi('/dashboard')
  const noLocation = ['operation1', 'user'].includes(user.role) && !user.locations?.length

  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-2xl font-bold text-slate-800">Halo, {user.name}</h1>
        <p className="text-slate-600">
          Login sebagai <span className="font-semibold">{user.role_label}</span> ({user.email})
          {user.locations?.length > 0 && <> · {user.locations.map((l) => `${l.type === 'warehouse' ? 'Gudang' : 'Lapangan'} ${l.name}`).join(', ')}</>}
        </p>
      </Card>

      {noLocation && <Alert kind="warn">Akun Anda belum ditugaskan ke {user.role === 'user' ? 'lapangan' : 'gudang'}. Minta Admin mengatur lokasi di Kelola User.</Alert>}
      <Alert>{error}</Alert>

      <Card>
        <h2 className="mb-3 font-semibold text-slate-800">Perlu tindakan</h2>
        {!data ? (
          <p className="text-sm text-slate-500">Memuat...</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.tasks.map((t) => (
              <Link
                key={t.label}
                to={t.url}
                className={`rounded-lg border px-4 py-3 hover:bg-slate-50 ${!t.info && t.count > 0 ? 'border-red-300 bg-red-50' : ''}`}
              >
                <div className="text-2xl font-bold text-slate-800">{t.count}</div>
                <div className="text-sm text-slate-600">{t.label}</div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold text-slate-800">Tugas Anda</h2>
        <ol className="list-decimal space-y-1 pl-5 text-slate-600">
          {(GUIDE[user.role] || []).map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ol>
      </Card>
    </div>
  )
}
