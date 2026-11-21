import { useMemo, useState } from 'react'
import { Alert, Button, Field, Modal, inputClass } from './ui'
import api from '../lib/api'
import { errorMessage, formatDate, formatQty, todayISO } from '../lib/format'
import { useApi, useItems } from '../lib/hooks'

const LAINNYA = 'Lainnya'

const MODES = {
  add: {
    title: 'Tambah Stok',
    icon: '+',
    tone: 'border-green-300 bg-green-50 text-green-700',
    desc: 'Ada barang masuk di luar PO / pengiriman. Contoh: saldo awal saat mulai memakai sistem, barang ditemukan.',
    input: 'Jumlah ditambah',
    reasons: ['Saldo awal', 'Barang ditemukan', 'Koreksi pencatatan', LAINNYA],
  },
  subtract: {
    title: 'Kurangi Stok',
    icon: '−',
    tone: 'border-red-300 bg-red-50 text-red-600',
    desc: 'Ada barang berkurang di luar pemakaian / pengiriman. Contoh: rusak, hilang, kedaluwarsa.',
    input: 'Jumlah dikurangi',
    reasons: ['Barang rusak', 'Barang hilang', 'Kedaluwarsa', 'Koreksi pencatatan', LAINNYA],
  },
  set: {
    title: 'Hitung Fisik (Stock Opname)',
    icon: '=',
    tone: 'border-blue-300 bg-blue-50 text-blue-700',
    desc: 'Sudah menghitung barang langsung di rak? Isi jumlah sebenarnya, sistem menghitung selisihnya otomatis.',
    input: 'Jumlah fisik',
    reasons: ['Stock opname', 'Saldo awal', LAINNYA],
  },
}

const signed = (n) => (n > 0 ? `+${formatQty(n)}` : formatQty(n))
const deltaClass = (n) => (n > 0 ? 'text-green-700' : n < 0 ? 'text-red-600' : 'text-slate-400')

/**
 * Ubah stok manual satu lokasi, 3 langkah:
 *  1. pilih jenis perubahan (tambah / kurangi / hitung fisik),
 *  2. isi jumlah langsung di daftar semua barang lokasi itu,
 *  3. periksa ringkasan lalu simpan.
 * Tercatat sebagai mutasi "Penyesuaian" di riwayat.
 */
export default function StockChangeModal({ location, onClose, onDone }) {
  const items = useItems(location.id)
  const balances = useApi('/stock/balances', { location_id: location.id })
  const current = balances.data?.data || {}

  const [step, setStep] = useState('choose') // choose | fill | confirm
  const [mode, setMode] = useState(null)
  const [qty, setQty] = useState({}) // item_id -> string
  const [date, setDate] = useState(todayISO())
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [onlyFilled, setOnlyFilled] = useState(false)
  const [errors, setErrors] = useState({}) // item_id -> pesan, juga date/note
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const cfg = mode && MODES[mode]
  // Stok lapangan hanya bertambah lewat kiriman gudang: tidak ada "Tambah", hitung fisik tidak boleh naik.
  const isField = location.type === 'field'
  const modes = Object.entries(MODES).filter(([m]) => !isField || m !== 'add')

  // Hitung perubahan per barang dari isian.
  const lines = useMemo(
    () =>
      items.map((it) => {
        const raw = qty[it.id] ?? ''
        const filled = raw !== ''
        const n = Number(raw)
        const before = Number(current[it.id] ?? 0)
        let delta = 0
        let problem = ''
        if (filled) {
          if (!Number.isFinite(n) || n < 0) problem = 'Jumlah tidak valid.'
          else if (mode !== 'set' && n === 0) problem = 'Jumlah harus lebih dari 0.'
          else delta = mode === 'add' ? n : mode === 'subtract' ? -n : n - before
          if (!problem && before + delta < 0) problem = `Melebihi stok sekarang (${formatQty(before)}).`
          if (!problem && isField && delta > 0) problem = `Tidak boleh melebihi stok sistem (${formatQty(before)}). Kelebihan barang harus lewat kiriman gudang.`
        }
        return { item: it, raw, filled, before, delta, after: before + delta, problem }
      }),
    [items, qty, current, mode, isField],
  )
  const changed = lines.filter((l) => l.filled && !l.problem && l.delta !== 0)
  const problems = lines.filter((l) => l.problem)
  const filledCount = lines.filter((l) => l.filled).length

  const q = search.trim().toLowerCase()
  const shown = lines.filter(
    (l) => (!q || l.item.name.toLowerCase().includes(q)) && (!category || l.item.category === category) && (!onlyFilled || l.filled),
  )

  const finalNote = [reason === LAINNYA ? '' : reason, note.trim()].filter(Boolean).join(' — ')
  const noteMissing = !reason || (reason === LAINNYA && !note.trim())

  const pickMode = (m) => {
    if (m !== mode) {
      setQty({})
      setReason(MODES[m].reasons[0])
      setNote('')
    }
    setMode(m)
    setErrors({})
    setError('')
    setStep('fill')
  }

  const toConfirm = () => {
    setError('')
    if (noteMissing) return setErrors({ note: reason === LAINNYA ? 'Tulis alasan di kolom catatan.' : 'Pilih alasan.' })
    if (problems.length) return setError('Masih ada jumlah yang belum benar (lihat baris bertanda merah).')
    if (!changed.length) return setError('Belum ada jumlah yang diisi, atau jumlah fisik sama dengan stok sekarang.')
    setErrors({})
    setStep('confirm')
  }

  const submit = async () => {
    setBusy(true)
    setError('')
    const payload = changed.map((l) => ({ item_id: l.item.id, quantity: Number(l.raw) }))
    try {
      const res = await api.post('/stock/adjustments', { location_id: location.id, mode, date, note: finalNote, items: payload })
      onDone(res.data.message)
    } catch (err) {
      if (err.response?.status === 422) {
        const errs = err.response.data.errors || {}
        const mapped = {}
        Object.entries(errs).forEach(([k, v]) => {
          const m = k.match(/^items\.(\d+)\./)
          if (m && payload[m[1]]) mapped[payload[m[1]].item_id] = v[0]
          else mapped[k] = v[0]
        })
        setErrors(mapped)
        setStep('fill')
      }
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const kind = location.type === 'warehouse' ? 'Gudang' : 'Lapangan'

  return (
    <Modal title={`Ubah Stok · ${kind} ${location.name}`} onClose={onClose} wide>
      <Steps step={step} />

      {step === 'choose' && (
        <>
          <p className="mb-3 text-sm text-slate-600">Apa yang ingin Anda lakukan dengan stok di {kind.toLowerCase()} ini?</p>
          <div className={`grid gap-3 ${modes.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            {modes.map(([m, c]) => (
              <button
                key={m}
                onClick={() => pickMode(m)}
                className={`flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition hover:shadow ${mode === m ? 'border-slate-900' : 'border-slate-200 hover:border-slate-400'}`}
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-full border text-xl font-bold ${c.tone}`}>{c.icon}</span>
                <span className="font-semibold text-slate-800">{c.title}</span>
                <span className="text-xs leading-relaxed text-slate-500">{c.desc}</span>
              </button>
            ))}
          </div>
          <div className="mt-4" />
          <Alert kind="info">
            <span className="text-xs">
              {isField ? (
                <>
                  Stok lapangan <b>hanya bertambah lewat kiriman dari gudang</b> (catat di menu Penerimaan Barang). Pemakaian harian dicatat di menu Pemakaian Harian.
                  Di sini hanya untuk barang yang berkurang di luar pemakaian (rusak, hilang) atau koreksi hasil hitung fisik.
                </>
              ) : (
                <>
                  Barang masuk dari PO dan pengiriman ke lapangan <b>tidak perlu</b> dicatat di sini, karena sudah tercatat otomatis lewat menunya masing-masing.
                  Gunakan Ubah Stok hanya untuk kejadian di luar itu.
                </>
              )}
            </span>
          </Alert>
          <div className="mt-4 flex justify-end">
            <Button variant="secondary" onClick={onClose}>Batal</Button>
          </div>
        </>
      )}

      {step === 'fill' && cfg && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded border bg-slate-50 px-3 py-2 text-sm">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full border font-bold ${cfg.tone}`}>{cfg.icon}</span>
            <b className="text-slate-800">{cfg.title}</b>
            <button className="ml-auto text-blue-600 hover:underline" onClick={() => setStep('choose')}>Ganti jenis</button>
          </div>

          <Alert>{error}</Alert>

          <div className="mb-3 grid gap-3 sm:grid-cols-3">
            <Field label="Tanggal kejadian" error={errors.date}>
              <input type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Alasan" error={errors.note}>
              <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass}>
                {cfg.reasons.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label={reason === LAINNYA ? 'Catatan (wajib)' : 'Catatan (opsional)'}>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="mis. 2 pcs pecah saat bongkar" className={inputClass} />
            </Field>
          </div>

          <p className="mb-2 text-sm text-slate-600">
            {mode === 'set'
              ? `Isi kolom "Jumlah fisik" hanya untuk barang yang sudah dihitung. Barang yang dikosongkan tidak berubah.${isField ? ' Jumlah fisik di lapangan tidak boleh melebihi stok sistem.' : ''}`
              : `Isi kolom "${cfg.input}" hanya untuk barang yang berubah. Barang yang dikosongkan tidak berubah.`}
          </p>

          <div className="mb-2 flex flex-wrap items-center gap-2">
            <input type="search" placeholder="Cari barang..." value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm" />
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm">
              <option value="">Semua jenis</option>
              <option value="barang">Barang</option>
              <option value="bahan">Bahan</option>
            </select>
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input type="checkbox" checked={onlyFilled} onChange={(e) => setOnlyFilled(e.target.checked)} /> Hanya yang diisi
            </label>
          </div>

          <div className="max-h-[45vh] overflow-y-auto rounded border">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Barang</th>
                  <th className="px-3 py-2 text-right font-medium">Stok sekarang</th>
                  <th className="w-36 px-3 py-2 font-medium">{cfg.input}</th>
                  <th className="px-3 py-2 text-right font-medium">Stok baru</th>
                </tr>
              </thead>
              <tbody>
                {balances.loading && !balances.data ? (
                  <tr><td colSpan={4} className="py-6 text-center text-slate-500">Memuat...</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={4} className="py-6 text-center text-slate-500">Belum ada barang / bahan terdaftar di gudang ini.</td></tr>
                ) : shown.length === 0 ? (
                  <tr><td colSpan={4} className="py-6 text-center text-slate-500">Tidak ada barang yang cocok.</td></tr>
                ) : (
                  shown.map((l) => {
                    const msg = l.problem || errors[l.item.id]
                    return (
                      <tr key={l.item.id} className={`border-t ${l.filled ? 'bg-amber-50/60' : ''}`}>
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-800">{l.item.name}</div>
                          <div className="text-xs text-slate-400">{l.item.category === 'bahan' ? 'Bahan' : 'Barang'} · {l.item.unit}</div>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-600">{formatQty(l.before)}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            inputMode="decimal"
                            value={l.raw}
                            placeholder={mode === 'set' ? formatQty(l.before) : '0'}
                            onChange={(e) => setQty({ ...qty, [l.item.id]: e.target.value })}
                            className={`w-full rounded border px-2 py-1 text-right text-sm ${msg ? 'border-red-400' : 'border-slate-300'}`}
                          />
                          {msg && <div className="mt-0.5 text-xs text-red-600">{msg}</div>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          {l.filled && !l.problem ? (
                            <>
                              <b className="text-slate-800">{formatQty(l.after)}</b>{' '}
                              <span className={`text-xs ${deltaClass(l.delta)}`}>({l.delta === 0 ? 'tetap' : signed(l.delta)})</span>
                            </>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto text-sm text-slate-500">
              {filledCount ? <><b className="text-slate-800">{changed.length}</b> barang akan berubah</> : 'Belum ada yang diisi'}
            </span>
            <Button variant="secondary" onClick={onClose}>Batal</Button>
            <Button onClick={toConfirm} disabled={!filledCount}>Lanjut: Periksa →</Button>
          </div>
        </>
      )}

      {step === 'confirm' && cfg && (
        <>
          <Alert>{error}</Alert>
          <p className="mb-3 text-sm text-slate-600">Periksa kembali sebelum disimpan. Perubahan ini akan tercatat di riwayat <b>Mutasi</b> sebagai "Penyesuaian".</p>
          <dl className="mb-3 grid grid-cols-2 gap-2 rounded border bg-slate-50 p-3 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-slate-400">Jenis</dt><dd className="font-medium text-slate-800">{cfg.title}</dd></div>
            <div><dt className="text-xs text-slate-400">{kind}</dt><dd className="text-slate-800">{location.name}</dd></div>
            <div><dt className="text-xs text-slate-400">Tanggal</dt><dd className="text-slate-800">{formatDate(date)}</dd></div>
            <div><dt className="text-xs text-slate-400">Alasan</dt><dd className="text-slate-800">{finalNote}</dd></div>
          </dl>
          <div className="max-h-[45vh] overflow-y-auto rounded border">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Barang</th>
                  <th className="px-3 py-2 text-right font-medium">Sebelum</th>
                  <th className="px-3 py-2 text-right font-medium">Perubahan</th>
                  <th className="px-3 py-2 text-right font-medium">Sesudah</th>
                </tr>
              </thead>
              <tbody>
                {changed.map((l) => (
                  <tr key={l.item.id} className="border-t">
                    <td className="px-3 py-2 font-medium text-slate-800">{l.item.name} <span className="text-xs font-normal text-slate-400">({l.item.unit})</span></td>
                    <td className="px-3 py-2 text-right text-slate-600">{formatQty(l.before)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${deltaClass(l.delta)}`}>{signed(l.delta)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-800">{formatQty(l.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStep('fill')} disabled={busy}>← Kembali ubah</Button>
            <Button variant="warning" onClick={submit} disabled={busy}>{busy ? 'Menyimpan...' : `Simpan (${changed.length} barang)`}</Button>
          </div>
        </>
      )}
    </Modal>
  )
}

function Steps({ step }) {
  const order = ['choose', 'fill', 'confirm']
  const labels = ['Pilih jenis', 'Isi jumlah', 'Periksa & simpan']
  const at = order.indexOf(step)
  return (
    <ol className="mb-4 flex items-center gap-2 text-xs">
      {labels.map((l, i) => (
        <li key={l} className="flex items-center gap-2">
          <span className={`flex h-5 w-5 items-center justify-center rounded-full font-semibold ${i <= at ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'}`}>{i + 1}</span>
          <span className={i === at ? 'font-semibold text-slate-800' : 'text-slate-500'}>{l}</span>
          {i < labels.length - 1 && <span className="text-slate-300">—</span>}
        </li>
      ))}
    </ol>
  )
}
