import React, { createContext, useContext, useEffect, useState } from 'react'
import {
  clearSession,
  getStoredDoctor,
  getStoredStudent,
  getStoredReceptionist,
  getToken,
  getUserRole,
  login as apiLogin,
  loginStudentGoogle as apiLoginStudentGoogle,
  saveSession,
  saveStudentSession,
  saveReceptionistSession,
  setUnauthorizedHandler,
} from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [doctor, setDoctor] = useState(() => (getToken() && getUserRole() === 'DOCTOR' ? getStoredDoctor() : null))
  const [student, setStudent] = useState(() => (getToken() && getUserRole() === 'STUDENT' ? getStoredStudent() : null))
  const [receptionist, setReceptionist] = useState(() => (getToken() && getUserRole() === 'RECEPTIONIST' ? getStoredReceptionist() : null))
  const [userRole, setUserRole] = useState(() => (getToken() ? getUserRole() : null))
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // If any API call gets a 401 (expired/invalid token), drop back to the login screen.
    setUnauthorizedHandler(() => {
      clearSession()
      setDoctor(null)
      setStudent(null)
      setReceptionist(null)
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
      setReceptionist(null)
      setUserRole('DOCTOR')
      return true
    } catch (err) {
      setError(err.message || 'Login failed')
      return false
    } finally {
      setLoading(false)
    }
  }

  async function loginReceptionist(email, password) {
    setLoading(true)
    setError('')
    try {
      const cleanEmail = (email || '').trim().toLowerCase()
      const cleanPass = (password || '').trim()

      // First try real backend API
      try {
        const res = await apiLogin(cleanEmail, cleanPass)
        if (res) {
          const nextReceptionist = {
            staffId: res.staff_id || 3,
            name: res.name || 'Reception Desk',
            email: cleanEmail,
          }
          saveReceptionistSession({ token: res.access_token, ...nextReceptionist })
          setReceptionist(nextReceptionist)
          setDoctor(null)
          setStudent(null)
          setUserRole('RECEPTIONIST')
          return true
        }
      } catch (backendErr) {
        // Fallback for dummy ID: reception@thapar.edu / reception123
        if (cleanEmail === 'reception@thapar.edu' && cleanPass === 'reception123') {
          const dummyReceptionist = {
            staffId: 3,
            name: 'Reception Desk',
            email: 'reception@thapar.edu',
          }
          saveReceptionistSession({
            token: 'dummy-reception-token-' + Date.now(),
            ...dummyReceptionist,
          })
          setReceptionist(dummyReceptionist)
          setDoctor(null)
          setStudent(null)
          setUserRole('RECEPTIONIST')
          return true
        }
        throw backendErr
      }
    } catch (err) {
      setError(err.message || 'Receptionist login failed. Please check your credentials.')
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
      setReceptionist(null)
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
    setReceptionist(null)
    setUserRole(null)
    setError('')
  }

  return (
    <AuthContext.Provider
      value={{
        doctor,
        student,
        receptionist,
        userRole,
        login,
        loginReceptionist,
        loginStudentGoogle,
        logout,
        error,
        setError,
        loading,
        isAuthenticated: !!doctor || !!student || !!receptionist,
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
