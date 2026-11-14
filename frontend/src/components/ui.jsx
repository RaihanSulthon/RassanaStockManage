/* Komponen UI kecil yang dipakai bersama di semua halaman. */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { STATUS_STYLES, downloadFile, errorMessage, formatDateTime } from '../lib/format'

export function Card({ children, className = '' }) {
  return <div className={`rounded-lg bg-white p-5 shadow ${className}`}>{children}</div>
}

export function PageHeader({ title, subtitle, back, children }) {
  return (
    <div className="mb-4">
      {back && (
        <Link to={back} className="text-sm text-blue-600 hover:underline">
          ← Kembali
        </Link>
      )}
      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{title}</h1>
          {subtitle && <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div>}
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </div>
  )
}

const BTN = {
  primary: 'bg-slate-900 text-white hover:bg-slate-700',
  secondary: 'border border-slate-300 text-slate-700 hover:bg-slate-100',
  danger: 'border border-red-300 text-red-600 hover:bg-red-50',
  success: 'bg-green-600 text-white hover:bg-green-700',
  warning: 'bg-amber-500 text-white hover:bg-amber-600',
}

export function Button({ variant = 'primary', className = '', size = 'md', ...props }) {
  const pad = size === 'sm' ? 'px-3 py-1.5' : 'px-4 py-2'
  return (
    <button
      type="button"
      className={`rounded text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${pad} ${BTN[variant]} ${className}`}
      {...props}
    />
  )
}

export function LinkButton({ variant = 'primary', className = '', ...props }) {
  return <Link className={`inline-block rounded px-4 py-2 text-sm font-medium ${BTN[variant]} ${className}`} {...props} />
}

export function StatusBadge({ status, label }) {
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[status] || 'bg-slate-200 text-slate-700'}`}>
      {label || status}
    </span>
  )
}

export function Alert({ kind = 'error', children }) {
  if (!children) return null
  const style = {
    error: 'bg-red-50 text-red-700',
    ok: 'bg-green-50 text-green-700',
    warn: 'bg-amber-50 text-amber-800',
    info: 'bg-slate-50 text-slate-600',
  }[kind]
  return <div className={`mb-4 rounded px-3 py-2 text-sm ${style}`}>{children}</div>
}

export function Field({ label, error, children, className = '' }) {
  return (
    <div className={className}>
      {label && <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>}
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

export const inputClass =
  'w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:border-transparent disabled:bg-slate-50 disabled:text-slate-700'

export function Info({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="text-sm text-slate-700">{children || '-'}</dd>
    </div>
  )
}

export function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-10">
      <div className={`w-full ${wide ? 'max-w-3xl' : 'max-w-md'} rounded-lg bg-white p-6 shadow-lg`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-xl leading-none text-slate-400 hover:text-slate-700" aria-label="Tutup">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Pager({ meta, page, setPage }) {
  if (!meta) return null
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
      <span>
        Halaman {meta.current_page} dari {meta.last_page} · {meta.total ?? 0} data
      </span>
      <div className="flex gap-2">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1 disabled:opacity-40">
          Sebelumnya
        </button>
        <button disabled={page >= meta.last_page} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1 disabled:opacity-40">
          Berikutnya
        </button>
      </div>
    </div>
  )
}

/** Tabel sederhana: columns = [{ label, render(row), className }] */
export function Table({ columns, rows, loading, empty = 'Tidak ada data.', rowKey = (r) => r.id }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b text-slate-500">
          <tr>
            {columns.map((c, i) => (
              <th key={i} className={`py-2 pr-3 font-medium ${c.className || ''}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="py-6 text-center text-slate-500">
                Memuat...
              </td>
            </tr>
          ) : !rows?.length ? (
            <tr>
              <td colSpan={columns.length} className="py-6 text-center text-slate-500">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={rowKey(r)} className="border-b align-top last:border-0">
                {columns.map((c, i) => (
                  <td key={i} className={`py-2 pr-3 ${c.className || ''}`}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

/** Tombol Generate PDF & Excel. url tanpa format, mis. "/purchase-orders/1/export" */
export function ExportButtons({ url, filename, disabled, onError, label = '' }) {
  const [busy, setBusy] = useState('')
  const run = async (format) => {
    setBusy(format)
    try {
      const sep = url.includes('?') ? url.indexOf('?') : -1
      const full = sep === -1 ? `${url}/${format}` : `${url.slice(0, sep)}/${format}${url.slice(sep)}`
      await downloadFile(full, `${filename}.${format === 'pdf' ? 'pdf' : 'xlsx'}`)
    } catch (err) {
      onError?.(errorMessage(err, 'Gagal membuat file.'))
    } finally {
      setBusy('')
    }
  }
  return (
    <>
      <Button variant="secondary" size="sm" disabled={disabled || !!busy} onClick={() => run('pdf')}>
        {busy === 'pdf' ? 'Membuat PDF...' : `Generate PDF${label}`}
      </Button>
      <Button variant="secondary" size="sm" disabled={disabled || !!busy} onClick={() => run('excel')}>
        {busy === 'excel' ? 'Membuat Excel...' : `Generate Excel${label}`}
      </Button>
    </>
  )
}

const LOG_TEXT = {
  created: 'membuat dokumen',
  edited: 'mengubah isi',
  submitted: 'mengirim dokumen',
  resubmitted: 'mengirim ulang setelah revisi',
  processed: 'memproses ke dokumen berikutnya',
  approved: 'menyetujui PO',
  rejected: 'meminta revisi PO',
  sent_to_vendor: 'mengirim PO ke vendor',
  received: 'mencatat penerimaan barang',
  closed: 'menutup PO',
  sent: 'mengirim barang',
  transfer_sent: 'mengirim barang ke lapangan',
  cancelled: 'membatalkan',
  prepared: 'menyiapkan pembayaran',
  payment_prepared: 'menyiapkan pembayaran',
  paid: 'melakukan pembayaran',
  payment_deleted: 'menghapus data pembayaran',
  po_deleted: 'menghapus PO',
}

function logDetail(l) {
  const d = l.detail || {}
  const lines = []
  if (d.changes) lines.push(...d.changes)
  if (d.diffs?.length) lines.push(...d.diffs.map((x) => `Selisih: ${x}`))
  if (d.note) lines.push(`Catatan: ${d.note}`)
  if (d.receipt) lines.push(`${d.receipt} · Surat jalan ${d.delivery_note}`)
  if (d.invoice) lines.push(`Tagihan ${d.invoice}${d.method ? ` · ${d.method}` : ''}`)
  if (d.pr) lines.push(`→ ${d.pr}`)
  if (d.po) lines.push(`→ ${d.po}`)
  if (d.transfer) lines.push(`→ ${d.transfer}`)
  if (d.from) lines.push(`dari ${d.from}`)
  return lines
}

export function Timeline({ logs }) {
  if (!logs?.length) return null
  return (
    <Card>
      <h2 className="mb-3 font-semibold text-slate-800">Riwayat</h2>
      <ul className="space-y-3 text-sm">
        {[...logs].reverse().map((l) => (
          <li key={l.id} className="border-l-2 border-slate-200 pl-3">
            <div className="text-slate-700">
              <span className="font-semibold">{l.user?.name || 'Pengguna dihapus'}</span>
              {l.user_role && <span className="text-slate-400"> ({l.user_role})</span>} {LOG_TEXT[l.action] || l.action}
            </div>
            {logDetail(l).length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-slate-500">
                {logDetail(l).map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            )}
            <div className="text-xs text-slate-400">{formatDateTime(l.created_at)}</div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** Langkah alur dokumen. steps = [{ key, label }], current = index */
export function Stepper({ steps, current, done = false }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {steps.map((s, i) => {
        const complete = done || i < current
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full font-bold ${
                complete ? 'bg-green-500 text-white' : i === current ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'
              }`}
            >
              {complete ? '✓' : i + 1}
            </span>
            <span className={i === current && !done ? 'font-semibold text-slate-800' : 'text-slate-500'}>{s}</span>
            {i < steps.length - 1 && <span className="text-slate-300">—</span>}
          </li>
        )
      })}
    </ol>
  )
}
