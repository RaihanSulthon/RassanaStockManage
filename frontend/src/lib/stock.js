import api from './api'

export const STOCK_TYPES = {
  bahan: 'Stok Bahan',
  barang: 'Stok Barang',
}

export const STATUS_LABELS = {
  draft: 'Draft',
  pending_operation: 'Menunggu Operation',
  pending_coadmin: 'Menunggu Co-Admin',
  completed: 'Selesai',
}

export const STATUS_STYLES = {
  draft: 'bg-slate-200 text-slate-700',
  pending_operation: 'bg-amber-100 text-amber-800',
  pending_coadmin: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
}

// Urutan tahap pada alur laporan
export const STAGES = [
  { key: 'draft', label: 'User mencatat' },
  { key: 'pending_operation', label: 'Operation memeriksa' },
  { key: 'pending_coadmin', label: 'Co-Admin finalisasi' },
  { key: 'completed', label: 'Selesai' },
]

// Status laporan yang menunggu tindakan tiap role (untuk penanda "perlu tindakan")
export const ACTION_STATUS = {
  user: 'draft',
  operation1: 'pending_operation',
  co_admin: 'pending_coadmin',
}

export const UNITS = [
  'kg', 'gram', 'liter', 'ml', 'pcs', 'buah', 'butir', 'pack', 'bungkus', 'sachet',
  'ikat', 'lembar', 'karung', 'dus', 'box', 'botol', 'kaleng', 'jerigen', 'tray', 'rak', 'porsi', 'set',
]

export const formatQty = (n) =>
  new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(Number(n))

export const formatDate = (d) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'

export const formatDateTime = (d) =>
  d
    ? new Date(d).toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-'

// Tanggal lokal hari ini (YYYY-MM-DD), bukan UTC
export const todayISO = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Unduh PDF/Excel dengan token Bearer lalu simpan sebagai file
export async function downloadExport(report, format) {
  const ext = format === 'pdf' ? 'pdf' : 'xlsx'
  const res = await api.get(`/stock-reports/${report.id}/export/${format}`, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `stok-${report.type}-${report.report_date}-${report.id}.${ext}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
