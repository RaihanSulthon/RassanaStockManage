import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import api, { TOKEN_KEY } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(() => !!localStorage.getItem(TOKEN_KEY))
  // Akun terakhir yang login di tab ini. Dipakai Login agar tidak membawa akun lain
  // ke halaman terakhir akun sebelumnya (bisa jadi halaman yang tidak boleh dibuka).
  const lastUserId = useRef(null)
  useEffect(() => {
    if (user) lastUserId.current = user.id
  }, [user])
  const getLastUserId = useCallback(() => lastUserId.current, [])

  // Pulihkan sesi saat halaman di-refresh
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return
    api
      .get('/me')
      .then((res) => setUser(res.data.data))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false))
  }, [])

  // Dipicu interceptor Axios saat menerima 401
  useEffect(() => {
    const onUnauthorized = () => setUser(null)
    window.addEventListener('auth:unauthorized', onUnauthorized)
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized)
  }, [])

  const login = useCallback(async (email, password) => {
    const res = await api.post('/login', { email, password })
    localStorage.setItem(TOKEN_KEY, res.data.token)
    setUser(res.data.user)
    return res.data.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/logout')
    } catch {
      // token mungkin sudah tidak valid; tetap bersihkan sisi FE
    }
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, loading, login, logout, getLastUserId }), [user, loading, login, logout, getLastUserId])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth harus dipakai di dalam AuthProvider')
  return ctx
}
