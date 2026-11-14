import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import api from '../lib/api'
import {
  STAGES,
  STOCK_TYPES,
  UNITS,
  downloadExport,
  formatDate,
  formatDateTime,
  todayISO,
} from '../lib/stock'
import { StatusBadge } from './Stock'

let rowSeq = 0
const newRow = (data = {}) => ({
  key: ++rowSeq,
  name: '',
  unit: '',
  quantity: '',
  note: '',
  ...data,
})

const LOG_TEXT = {
  created: () => 'membuat laporan',
  edited: () => 'mengubah isi laporan',
  submitted: (d) =>
    d?.to === 'pending_operation' ? 'mengirim ke Operation' : d?.to === 'pending_coadmin' ? 'mengirim ke Co-Admin' : 'mengirim laporan',
  completed: () => 'menandai laporan selesai',
  exported: (d) => `mengekspor ${d?.format === 'pdf' ? 'PDF' : 'Excel'}`,
}

function Stepper({ status }) {
  const current = STAGES.findIndex((s) => s.key === status)
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {STAGES.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full font-bold ${
              i < current || status === 'completed'
                ? 'bg-green-500 text-white'
                : i === current
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-200 text-slate-500'
            }`}
          >
            {i < current || status === 'completed' ? '✓' : i + 1}
          </span>
          <span className={i === current ? 'font-semibold text-slate-800' : 'text-slate-500'}>{s.label}</span>
          {i < STAGES.length - 1 && <span className="text-slate-300">—</span>}
        </li>
      ))}
    </ol>
  )
}

export default function StockEditor() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [report, setReport] = useState(null)
  const [type, setType] = useState(params.get('type') === 'barang' ? 'barang' : 'bahan')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [rows, setRows] = useState(() => (isNew ? [newRow()] : []))
  const [snapshot, setSnapshot] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(!isNew)
  const [busy, setBusy] = useState('')
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState(null) // { kind: 'ok' | 'error', text }
  const [focusKey, setFocusKey] = useState(null) // baris yang baru ditambah -> fokus otomatis

  const serialize = useCallback(
    (d, n, r) => JSON.stringify({ d, n, r: r.map(({ name, unit, quantity, note: rn }) => ({ name, unit, quantity, rn })) }),
    [],
  )

  const applyReport = useCallback(
    (data) => {
      const r = data.items.map((i) => newRow({ name: i.name, unit: i.unit, quantity: String(i.quantity), note: i.note || '' }))
      setReport(data)
      setType(data.type)
      setDate(data.report_date)
      setNote(data.note || '')
      setRows(r.length ? r : [newRow()])
      setSnapshot(serialize(data.report_date, data.note || '', r.length ? r : [newRow()]))
    },
    [serialize],
  )

  // Muat laporan yang ada
  useEffect(() => {
    if (isNew) return
    let cancelled = false
    api
      .get(`/stock-reports/${id}`)
      .then((res) => !cancelled && applyReport(res.data.data))
      .catch((err) => {
        if (cancelled) return
        setMessage({ kind: 'error', text: err.response?.status === 403 ? 'Anda tidak punya akses ke laporan ini.' : err.response?.data?.message || 'Gagal memuat laporan.' })
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [id, isNew, applyReport])

  // Saran nama + satuan dari laporan sebelumnya
  useEffect(() => {
    api
      .get('/stock-reports/suggestions', { params: { type } })
      .then((res) => setSuggestions(res.data.data))
      .catch(() => setSuggestions([]))
  }, [type])

  const can = report?.can || {}
  const editable = isNew || can.update
  const dirty = useMemo(() => (isNew ? true : serialize(date, note, rows) !== snapshot), [isNew, serialize, date, note, rows, snapshot])

  const updateRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const onNameChange = (key, value) => {
    const match = suggestions.find((s) => s.name.toLowerCase() === value.trim().toLowerCase())
    setRows((rs) =>
      rs.map((r) => (r.key === key ? { ...r, name: value, unit: match && !r.unit ? match.unit : r.unit } : r)),
    )
  }

  const addRow = () => {
    const r = newRow()
    setFocusKey(r.key)
    setRows((rs) => [...rs, r])
  }

  const removeRow = (key) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : [newRow()]))

  const payload = (extra = {}) => ({
    report_date: date,
    note: note || null,
    items: rows
      .filter((r) => r.name.trim() || r.unit.trim() || r.quantity !== '')
      .map((r) => ({ name: r.name, unit: r.unit, quantity: r.quantity, note: r.note })),
    ...extra,
  })

  const handleError = (err) => {
    if (err.response?.status === 422) {
      setErrors(err.response.data.errors || {})
      setMessage({ kind: 'error', text: err.response.data.message || 'Periksa kembali isian Anda.' })
    } else {
      setMessage({ kind: 'error', text: err.response?.data?.message || 'Terjadi kesalahan.' })
    }
  }

  const run = async (label, fn) => {
    setBusy(label)
    setErrors({})
    setMessage(null)
    try {
      await fn()
    } catch (err) {
      handleError(err)
    } finally {
      setBusy('')
    }
  }

  const save = () =>
    run('save', async () => {
      if (isNew) {
        const res = await api.post('/stock-reports', payload({ type }))
        navigate(`/stock/${res.data.data.id}`, { replace: true })
      } else {
        const res = await api.put(`/stock-reports/${id}`, payload())
        applyReport(res.data.data)
        setMessage({ kind: 'ok', text: 'Perubahan tersimpan.' })
      }
    })

  const submit = () => {
    const label = isNew ? 'Kirim ke Operation' : can.submit_label
    if (!window.confirm(`${label}? Setelah dikirim, laporan tidak bisa diubah lagi oleh Anda.`)) return
    run('submit', async () => {
      if (isNew) {
        const res = await api.post('/stock-reports', payload({ type, submit: true }))
        navigate(`/stock/${res.data.data.id}`, { replace: true })
        return
      }
      if (dirty && can.update) await api.put(`/stock-reports/${id}`, payload())
      const res = await api.post(`/stock-reports/${id}/submit`)
      applyReport(res.data.data)
      setMessage({ kind: 'ok', text: `Berhasil: ${res.data.data.status_label}.` })
    })
  }

  const complete = () => {
    if (!window.confirm('Tandai laporan ini selesai? Laporan akan terkunci dari perubahan.')) return
    run('complete', async () => {
      if (dirty && can.update) await api.put(`/stock-reports/${id}`, payload())
      const res = await api.post(`/stock-reports/${id}/complete`)
      applyReport(res.data.data)
      setMessage({ kind: 'ok', text: 'Laporan ditandai selesai.' })
    })
  }

  const exportAs = (format) =>
    run(format, async () => {
      await downloadExport(report, format)
      const res = await api.get(`/stock-reports/${id}`)
      applyReport(res.data.data)
    })

  const remove = () => {
    if (!window.confirm('Hapus laporan ini? Tindakan ini tidak bisa dibatalkan.')) return
    run('delete', async () => {
      await api.delete(`/stock-reports/${id}`)
      navigate('/stock', { replace: true })
    })
  }

  const rowError = (index, field) => errors[`items.${index}.${field}`]?.[0]

  if (loading) return <div className="rounded-lg bg-white p-6 text-slate-500 shadow">Memuat...</div>

  if (!isNew && !report) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{message?.text}</div>
        <Link to="/stock" className="text-blue-600 hover:underline">← Kembali ke daftar</Link>
      </div>
    )
  }

  const busyAny = busy !== ''

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-6 shadow">
        <Link to="/stock" className="text-sm text-blue-600 hover:underline">← Kembali ke daftar</Link>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">
              {isNew ? 'Laporan Baru' : STOCK_TYPES[report.type]}
              {!isNew && <span className="ml-2 text-base font-normal text-slate-500">{formatDate(report.report_date)}</span>}
            </h1>
            {!isNew && (
              <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                <StatusBadge status={report.status} label={report.status_label} />
                <span>oleh {report.creator?.name}</span>
              </div>
            )}
          </div>
          {!isNew && (
            <div className="flex flex-wrap gap-2">
              {can.export && (
                <>
                  <button
                    disabled={busyAny || dirty}
                    onClick={() => exportAs('pdf')}
                    title={dirty ? 'Simpan perubahan dulu' : ''}
                    className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                  >
                    {busy === 'pdf' ? 'Membuat PDF...' : 'Generate PDF'}
                  </button>
                  <button
                    disabled={busyAny || dirty}
                    onClick={() => exportAs('excel')}
                    title={dirty ? 'Simpan perubahan dulu' : ''}
                    className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                  >
                    {busy === 'excel' ? 'Membuat Excel...' : 'Generate Excel'}
                  </button>
                </>
              )}
              {can.delete && (
                <button
                  disabled={busyAny}
                  onClick={remove}
                  className="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  Hapus
                </button>
              )}
            </div>
          )}
        </div>

        {!isNew && (
          <div className="mt-4 border-t pt-4">
            <Stepper status={report.status} />
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm text-slate-600 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-slate-400">Dikirim user</dt>
                <dd>{formatDateTime(report.submitted_at)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Diperiksa Operation</dt>
                <dd>{report.operator ? `${report.operator.name} · ${formatDateTime(report.operation_submitted_at)}` : '-'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Diselesaikan</dt>
                <dd>{report.completer ? `${report.completer.name} · ${formatDateTime(report.completed_at)}` : '-'}</dd>
              </div>
            </dl>
          </div>
        )}
      </div>

      <div className="rounded-lg bg-white p-6 shadow">
        {message && (
          <div
            className={`mb-4 rounded px-3 py-2 text-sm ${message.kind === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}
          >
            {message.text}
          </div>
        )}

        {!isNew && !editable && (
          <div className="mb-4 rounded bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Laporan ini hanya bisa dilihat pada tahap sekarang.
          </div>
        )}

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {isNew && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Jenis stok</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2"
              >
                {Object.entries(STOCK_TYPES).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Tanggal</label>
            <input
              type="date"
              value={date}
              max={todayISO()}
              disabled={!editable || (!isNew && report.status !== 'draft')}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 disabled:bg-slate-50"
            />
            {errors.report_date && <p className="mt-1 text-xs text-red-600">{errors.report_date[0]}</p>}
          </div>
          <div className={isNew ? '' : 'sm:col-span-2'}>
            <label className="mb-1 block text-sm font-medium text-slate-700">Catatan (opsional)</label>
            <input
              value={note}
              disabled={!editable}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 disabled:bg-slate-50"
            />
          </div>
        </div>

        <datalist id="stock-names">
          {suggestions.map((s) => (
            <option key={s.name} value={s.name} />
          ))}
        </datalist>
        <datalist id="stock-units">
          {UNITS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-slate-500">
              <tr>
                <th className="w-8 py-2 pr-2">#</th>
                <th className="py-2 pr-2">Nama {type === 'bahan' ? 'bahan' : 'barang'}</th>
                <th className="w-32 py-2 pr-2">Satuan</th>
                <th className="w-32 py-2 pr-2">Jumlah</th>
                <th className="py-2 pr-2">Catatan</th>
                {editable && <th className="w-10" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.key} className="border-b align-top last:border-0">
                  <td className="py-2 pr-2 text-slate-400">{i + 1}</td>
                  <td className="py-2 pr-2">
                    <input
                      list="stock-names"
                      value={r.name}
                      disabled={!editable}
                      maxLength={150}
                      autoFocus={focusKey === r.key}
                      onChange={(e) => onNameChange(r.key, e.target.value)}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 disabled:border-transparent disabled:bg-transparent"
                    />
                    {rowError(i, 'name') && <p className="mt-1 text-xs text-red-600">{rowError(i, 'name')}</p>}
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      list="stock-units"
                      value={r.unit}
                      disabled={!editable}
                      maxLength={30}
                      onChange={(e) => updateRow(r.key, { unit: e.target.value })}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 disabled:border-transparent disabled:bg-transparent"
                    />
                    {rowError(i, 'unit') && <p className="mt-1 text-xs text-red-600">{rowError(i, 'unit')}</p>}
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={r.quantity}
                      disabled={!editable}
                      onChange={(e) => updateRow(r.key, { quantity: e.target.value })}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 disabled:border-transparent disabled:bg-transparent"
                    />
                    {rowError(i, 'quantity') && <p className="mt-1 text-xs text-red-600">{rowError(i, 'quantity')}</p>}
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      value={r.note}
                      disabled={!editable}
                      maxLength={255}
                      onChange={(e) => updateRow(r.key, { note: e.target.value })}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 disabled:border-transparent disabled:bg-transparent"
                    />
                  </td>
                  {editable && (
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeRow(r.key)}
                        title="Hapus baris"
                        className="px-1 text-lg leading-none text-red-500 hover:text-red-700"
                      >
                        ×
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {errors.items && typeof errors.items[0] === 'string' && (
          <p className="mt-2 text-sm text-red-600">{errors.items[0]}</p>
        )}

        {editable && (
          <button type="button" onClick={addRow} className="mt-3 text-sm font-medium text-blue-600 hover:underline">
            + Tambah baris
          </button>
        )}

        {editable && (
          <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t pt-4">
            {!isNew && dirty && <span className="mr-auto text-sm text-amber-600">Ada perubahan yang belum disimpan</span>}
            <button
              disabled={busyAny}
              onClick={save}
              className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
            >
              {busy === 'save' ? 'Menyimpan...' : isNew ? 'Simpan sebagai Draft' : 'Simpan Perubahan'}
            </button>
            {(isNew || can.submit) && (
              <button
                disabled={busyAny}
                onClick={submit}
                className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
              >
                {busy === 'submit' ? 'Mengirim...' : isNew ? 'Simpan & Kirim ke Operation' : can.submit_label}
              </button>
            )}
            {can.complete && (
              <button
                disabled={busyAny}
                onClick={complete}
                className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40"
              >
                {busy === 'complete' ? 'Memproses...' : 'Tandai Selesai'}
              </button>
            )}
          </div>
        )}

        {/* Tombol aksi saat laporan tidak bisa diedit (mis. Co-Admin sudah tahap selesai) */}
        {!editable && !isNew && (can.submit || can.complete) && (
          <div className="mt-5 flex justify-end gap-2 border-t pt-4">
            {can.submit && (
              <button
                disabled={busyAny}
                onClick={submit}
                className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
              >
                {can.submit_label}
              </button>
            )}
            {can.complete && (
              <button
                disabled={busyAny}
                onClick={complete}
                className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40"
              >
                Tandai Selesai
              </button>
            )}
          </div>
        )}
      </div>

      {!isNew && report.logs?.length > 0 && (
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-3 font-semibold text-slate-800">Riwayat</h2>
          <ul className="space-y-3 text-sm">
            {[...report.logs].reverse().map((l) => (
              <li key={l.id} className="border-l-2 border-slate-200 pl-3">
                <div className="text-slate-700">
                  <span className="font-semibold">{l.user?.name || 'Pengguna dihapus'}</span>
                  {l.user_role && <span className="text-slate-400"> ({l.user_role})</span>}{' '}
                  {(LOG_TEXT[l.action] || (() => l.action))(l.detail)}
                </div>
                {l.action === 'edited' && l.detail?.changes?.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-slate-500">
                    {l.detail.changes.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                )}
                <div className="text-xs text-slate-400">{formatDateTime(l.created_at)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
