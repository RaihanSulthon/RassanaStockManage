import api from './api'

export const formatQty = (n) =>
  n === null || n === undefined || n === '' ? '-' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(Number(n))

export const formatMoney = (n) =>
  n === null || n === undefined || n === ''
    ? '-'
    : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(Number(n))

export const formatDate = (d) =>
  d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'

export const formatDateTime = (d) =>
  d
    ? new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '-'

// Tanggal lokal hari ini (YYYY-MM-DD), bukan UTC
export const todayISO = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const errorMessage = (err, fallback = 'Terjadi kesalahan.') => {
  const errors = err?.response?.data?.errors
  if (errors) return Object.values(errors)[0]?.[0] || fallback
  return err?.response?.data?.message || fallback
}

// Unduh PDF/Excel dengan token Bearer lalu simpan sebagai file
export async function downloadFile(url, filename) {
  let res
  try {
    res = await api.get(url, { responseType: 'blob' })
  } catch (err) {
    // Error dari server datang sebagai blob JSON
    if (err.response?.data instanceof Blob) {
      try {
        const json = JSON.parse(await err.response.data.text())
        err.response.data = json
      } catch {
        // abaikan
      }
    }
    throw err
  }
  const href = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(href)
}

export const STATUS_STYLES = {
  draft: 'bg-slate-200 text-slate-700',
  submitted: 'bg-amber-100 text-amber-800',
  processed: 'bg-green-100 text-green-800',
  pending_approval: 'bg-amber-100 text-amber-800',
  revision: 'bg-red-100 text-red-700',
  approved: 'bg-blue-100 text-blue-800',
  sent: 'bg-indigo-100 text-indigo-800',
  partially_received: 'bg-orange-100 text-orange-800',
  received: 'bg-green-100 text-green-800',
  discrepancy: 'bg-red-100 text-red-700',
  closed: 'bg-slate-300 text-slate-700',
  prepared: 'bg-amber-100 text-amber-800',
  paid: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-700',
}

export const UNITS = [
  'kg', 'gram', 'liter', 'ml', 'pcs', 'buah', 'butir', 'pack', 'bungkus', 'sachet', 'ikat', 'lembar',
  'karung', 'dus', 'box', 'botol', 'kaleng', 'jerigen', 'tabung', 'tray', 'rak', 'porsi', 'set',
]

export const PERIODS = { harian: 'Harian', mingguan: 'Mingguan', bulanan: 'Bulanan' }
