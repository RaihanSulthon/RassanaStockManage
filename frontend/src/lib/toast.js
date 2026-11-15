/**
 * Notifikasi singkat (toast) untuk pesan sukses. Hilang sendiri setelah beberapa detik.
 * Pesan error tetap ditampilkan inline di halaman, karena perlu dibaca sampai diperbaiki.
 *
 *   import { toast } from '../lib/toast'
 *   toast('Data tersimpan.')
 */
let listeners = []
let seq = 0

export function toast(text, kind = 'ok', duration = 3500) {
  const item = { id: ++seq, text, kind, duration }
  listeners.forEach((fn) => fn(item))
}

export function subscribeToast(fn) {
  listeners.push(fn)
  return () => {
    listeners = listeners.filter((l) => l !== fn)
  }
}
