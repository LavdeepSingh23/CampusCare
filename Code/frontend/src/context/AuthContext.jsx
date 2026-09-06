import React, { createContext, useContext, useEffect, useState } from 'react'
import {
  clearSession,
  getStoredDoctor,
  getToken,
  login as apiLogin,
  saveSession,
  setUnauthorizedHandler,
} from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [doctor, setDoctor] = useState(() => (getToken() ? getStoredDoctor() : null))
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // If any API call gets a 401 (expired/invalid token), drop back to the login screen.
    setUnauthorizedHandler(() => {
      clearSession()
      setDoctor(null)
    })
  }, [])

  async function login(email, password) {
    setLoading(true)
    setError('')
    try {
      const res = await apiLogin(email, password)
      const nextDoctor = { doctorId: res.doctor_id, name: res.name, specialization: res.specialization }
      saveSession({ token: res.access_token, ...nextDoctor })
      setDoctor(nextDoctor)
      return true
    } catch (err) {
      setError(err.message || 'Login failed')
      return false
    } finally {
      setLoading(false)
    }
  }

  function logout() {
    clearSession()
    setDoctor(null)
  }

  return (
    <AuthContext.Provider value={{ doctor, login, logout, error, loading, isAuthenticated: !!doctor }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
