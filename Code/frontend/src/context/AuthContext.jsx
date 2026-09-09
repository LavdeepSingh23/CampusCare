import React, { createContext, useContext, useEffect, useState } from 'react'
import {
  clearSession,
  getStoredDoctor,
  getStoredStudent,
  getToken,
  getUserRole,
  login as apiLogin,
  loginStudentGoogle as apiLoginStudentGoogle,
  saveSession,
  saveStudentSession,
  setUnauthorizedHandler,
} from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [doctor, setDoctor] = useState(() => (getToken() && getUserRole() === 'DOCTOR' ? getStoredDoctor() : null))
  const [student, setStudent] = useState(() => (getToken() && getUserRole() === 'STUDENT' ? getStoredStudent() : null))
  const [userRole, setUserRole] = useState(() => (getToken() ? getUserRole() : null))
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // If any API call gets a 401 (expired/invalid token), drop back to the login screen.
    setUnauthorizedHandler(() => {
      clearSession()
      setDoctor(null)
      setStudent(null)
      setUserRole(null)
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
      setStudent(null)
      setUserRole('DOCTOR')
      return true
    } catch (err) {
      setError(err.message || 'Login failed')
      return false
    } finally {
      setLoading(false)
    }
  }

  async function loginStudentGoogle(credential, simulatedUser = null) {
    setLoading(true)
    setError('')
    try {
      const res = await apiLoginStudentGoogle(credential, simulatedUser)
      const nextStudent = {
        rollNumber: res.roll_number,
        name: res.name,
        email: res.email,
        userId: res.user_id,
      }
      saveStudentSession({ token: res.access_token, ...nextStudent })
      setStudent(nextStudent)
      setDoctor(null)
      setUserRole('STUDENT')
      return nextStudent
    } catch (err) {
      const msg = err.message || 'Google Workspace sign in failed'
      setError(msg)
      throw err
    } finally {
      setLoading(false)
    }
  }

  function logout() {
    clearSession()
    setDoctor(null)
    setStudent(null)
    setUserRole(null)
    setError('')
  }

  return (
    <AuthContext.Provider
      value={{
        doctor,
        student,
        userRole,
        login,
        loginStudentGoogle,
        logout,
        error,
        setError,
        loading,
        isAuthenticated: !!doctor || !!student,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
