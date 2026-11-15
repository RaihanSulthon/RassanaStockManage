import { useCallback, useEffect, useState } from 'react'
import api from './api'
import { errorMessage } from './format'

/** GET sederhana dengan status loading/error dan reload(). params di-serialize agar stabil. */
export function useApi(url, params) {
  const key = JSON.stringify(params || {})
  const [state, setState] = useState({ data: null, loading: !!url, error: '' })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!url) return
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: '' }))
    api
      .get(url, { params: JSON.parse(key) })
      .then((res) => !cancelled && setState({ data: res.data, loading: false, error: '' }))
      .catch((err) => !cancelled && setState({ data: null, loading: false, error: errorMessage(err, 'Gagal memuat data.') }))
    return () => {
      cancelled = true
    }
  }, [url, key, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])

  return { ...state, reload }
}

/**
 * Barang & bahan aktif milik gudang (dipakai semua form baris barang).
 * locationId boleh gudang atau lapangan (lapangan memakai barang milik gudang induknya).
 */
const NO_ITEMS = []
export function useItems(locationId) {
  const { data } = useApi(locationId ? '/items' : null, { location_id: locationId })
  return (locationId && data?.data) || NO_ITEMS
}

/** Lokasi yang terlihat oleh akun ini. */
export function useLocations() {
  const { data } = useApi('/locations')
  return data?.data || []
}

/** Debounce nilai (untuk kolom pencarian). */
export function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}
