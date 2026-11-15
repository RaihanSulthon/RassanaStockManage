import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from './api'
import { errorMessage } from './format'
import { toast } from './toast'

/**
 * Pola bersama halaman dokumen (UR, PR, PO):
 * - dokumen yang sudah ada dibuka dalam mode lihat; tombol Edit membuka mode edit
 * - Simpan tanpa perubahan memunculkan peringatan
 * - aksi alur (kirim, approve, dll.) hanya dari mode lihat (data sudah tersimpan)
 *
 * opts: { id, endpoint, route, emptyForm(), toForm(doc), toPayload(form), createExtra }
 * emptyForm/toForm/toPayload harus fungsi stabil (didefinisikan di level modul).
 * createExtra: objek tambahan saat membuat dokumen baru (mis. { user_request_id }).
 */
export function useDocument({ id, endpoint, route, emptyForm, toForm, toPayload, createExtra }) {
  const isNew = !id
  const navigate = useNavigate()

  const [doc, setDoc] = useState(null)
  const [form, setForm] = useState(() => emptyForm())
  const [snapshot, setSnapshot] = useState('')
  const [editing, setEditing] = useState(isNew)
  const [loading, setLoading] = useState(!isNew)
  const [busy, setBusy] = useState('')
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState(null) // { kind, text }

  const apply = useCallback(
    (data) => {
      const f = toForm(data)
      setDoc(data)
      setForm(f)
      setSnapshot(JSON.stringify(toPayload(f)))
    },
    [toForm, toPayload],
  )

  useEffect(() => {
    if (isNew) return
    let cancelled = false
    setLoading(true)
    api
      .get(`${endpoint}/${id}`)
      .then((res) => !cancelled && apply(res.data.data))
      .catch((err) => {
        if (cancelled) return
        setMessage({ kind: 'error', text: err.response?.status === 403 ? 'Anda tidak punya akses ke dokumen ini.' : errorMessage(err, 'Gagal memuat dokumen.') })
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [id, isNew, endpoint, apply])

  const dirty = useMemo(() => (isNew ? true : JSON.stringify(toPayload(form)) !== snapshot), [isNew, form, snapshot, toPayload])

  const run = async (label, fn) => {
    setBusy(label)
    setErrors({})
    setMessage(null)
    try {
      await fn()
    } catch (err) {
      if (err.response?.status === 422) setErrors(err.response.data.errors || {})
      setMessage({ kind: 'error', text: errorMessage(err) })
    } finally {
      setBusy('')
    }
  }

  const save = () => {
    if (!isNew && !dirty) {
      setErrors({})
      setMessage({ kind: 'warn', text: 'Tidak ada perubahan data yang disimpan. Ubah data terlebih dahulu atau klik Batal.' })
      return
    }
    run('save', async () => {
      const payload = toPayload(form)
      if (isNew) {
        const res = await api.post(endpoint, { ...payload, ...(createExtra || {}) })
        navigate(`${route}/${res.data.data.id}`, { replace: true })
      } else {
        const res = await api.put(`${endpoint}/${id}`, payload)
        apply(res.data.data)
        setEditing(false)
        toast('Perubahan tersimpan.')
      }
    })
  }

  /** Aksi alur: POST {endpoint}/{id}/{path} */
  const action = (label, path, { body, confirm, ok } = {}) => {
    if (confirm && !window.confirm(confirm)) return
    run(label, async () => {
      const res = await api.post(`${endpoint}/${id}/${path}`, body || {})
      apply(res.data.data)
      if (ok) toast(ok)
    })
  }

  const remove = (confirmText = 'Hapus dokumen ini? Tindakan ini tidak bisa dibatalkan.') => {
    if (!window.confirm(confirmText)) return
    run('delete', async () => {
      await api.delete(`${endpoint}/${id}`)
      navigate(route, { replace: true })
    })
  }

  const startEdit = () => {
    setMessage(null)
    setErrors({})
    setEditing(true)
  }

  const cancelEdit = () => {
    if (dirty && !window.confirm('Batalkan perubahan yang belum disimpan?')) return
    apply(doc)
    setErrors({})
    setMessage(null)
    setEditing(false)
  }

  return {
    isNew, doc, form, setForm, editing, loading, busy, errors, message, setMessage, dirty,
    apply, run, save, action, remove, startEdit, cancelEdit,
  }
}
