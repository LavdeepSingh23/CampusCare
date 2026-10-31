import React, { createContext, useContext, useEffect, useState } from 'react'
import {
  clearSession,
  getStoredDoctor,
  getStoredStudent,
  getStoredReceptionist,
  getStoredFaculty,
  getStoredAdmin,
  getToken,
  getUserRole,
  loginDoctor as apiLoginDoctor,
  loginReceptionist as apiLoginReceptionist,
  loginAdmin as apiLoginAdmin,
  loginFacultyInstitutional as apiLoginFacultyInstitutional,
  loginFacultyDirect,
  loginStudent as apiLoginStudent,
  loginStudentGoogle as apiLoginStudentGoogle,
  saveSession,
  saveStudentSession,
  saveReceptionistSession,
  saveFacultySession,
  saveAdminSession,
  fetchCurrentUser,
  setUnauthorizedHandler,
} from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [doctor, setDoctor] = useState(() => (getToken() && getUserRole() === 'DOCTOR' ? getStoredDoctor() : null))
  const [student, setStudent] = useState(() => (getToken() && getUserRole() === 'STUDENT' ? getStoredStudent() : null))
  const [receptionist, setReceptionist] = useState(() => (getToken() && getUserRole() === 'RECEPTIONIST' ? getStoredReceptionist() : null))
  const [faculty, setFaculty] = useState(() => (getToken() && getUserRole() === 'FACULTY' ? getStoredFaculty() : null))
  const [admin, setAdmin] = useState(() => (getToken() && getUserRole() === 'ADMIN' ? getStoredAdmin() : null))
  const [userRole, setUserRole] = useState(() => (getToken() ? getUserRole() : null))
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)

  // Session expiry listener & boot-time identity revalidation
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession()
      setDoctor(null)
      setStudent(null)
      setReceptionist(null)
      setFaculty(null)
      setAdmin(null)
      setUserRole(null)
      setSessionExpired(true)
    })

    // If token exists, verify active account status on backend
    if (getToken()) {
      fetchCurrentUser()
        .then((user) => {
          const statusVal = user?.status || user?.account_status
          if (statusVal && statusVal !== 'ACTIVE') {
            clearSession()
            setDoctor(null)
            setStudent(null)
            setReceptionist(null)
            setFaculty(null)
            setAdmin(null)
            setUserRole(null)
            setSessionExpired(true)
          }
        })
        .catch(() => {
          // Token is invalid or expired
          clearSession()
          setDoctor(null)
          setStudent(null)
          setReceptionist(null)
          setFaculty(null)
          setAdmin(null)
          setUserRole(null)
        })
    }
  }, [])

  // 1. DOCTOR LOGIN (/signin/doctor -> POST /api/auth/doctor/login)
  async function login(email, password) {
    setLoading(true)
    setError('')
    try {
      const res = await apiLoginDoctor(email, password)
      const nextDoctor = { doctorId: res.doctor_id, name: res.name, specialization: res.specialization }
      saveSession({ token: res.access_token, ...nextDoctor })
      setDoctor(nextDoctor)
      setStudent(null)
      setReceptionist(null)
      setFaculty(null)
      setAdmin(null)
      setUserRole('DOCTOR')
      return true
    } catch (err) {
      setError(err.message || 'Doctor login failed. Verify your clinical credentials.')
      return false
    } finally {
      setLoading(false)
    }
  }

  // 2. RECEPTIONIST LOGIN (/signin/receptionist -> POST /api/auth/receptionist/login)
  async function loginReceptionist(email, password) {
    setLoading(true)
    setError('')
    try {
      const cleanEmail = (email || '').trim().toLowerCase()
      const cleanPass = (password || '').trim()
      const res = await apiLoginReceptionist(cleanEmail, cleanPass)
      const nextReceptionist = {
        staffId: res.staff_id || 3,
        name: res.name || 'Reception Desk',
        email: cleanEmail,
      }
      saveReceptionistSession({ token: res.access_token, ...nextReceptionist })
      setReceptionist(nextReceptionist)
      setDoctor(null)
      setStudent(null)
      setFaculty(null)
      setAdmin(null)
      setUserRole('RECEPTIONIST')
      return true
    } catch (err) {
      setError(err.message || 'Receptionist login failed. Access restricted to authorized front desk staff.')
      return false
    } finally {
      setLoading(false)
    }
  }

  // 3. STUDENT GOOGLE AUTH (/signin/student -> POST /api/auth/student/google)
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
      setFaculty(null)
      setAdmin(null)
      setUserRole('STUDENT')
      return nextStudent
    } catch (err) {
      const msg = err.message || 'Google Workspace sign-in failed. Please use your @thapar.edu account.'
      setError(msg)
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Student manual login fallback
  async function loginStudent(email, password) {
    setLoading(true)
    setError('')
    try {
      const res = await apiLoginStudent(email, password)
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
      setFaculty(null)
      setAdmin(null)
      setUserRole('STUDENT')
      return true
    } catch (err) {
      setError(err.message || 'Student login failed. Please check your credentials.')
      return false
    } finally {
      setLoading(false)
    }
  }

  // 4. FACULTY INSTITUTIONAL / DIRECT LOGIN (/signin/faculty)
  async function loginFaculty(credentialOrEmail, passwordOrSimulated = null) {
    setLoading(true)
    setError('')
    try {
      let res
      if (typeof credentialOrEmail === 'string' && credentialOrEmail.includes('@')) {
        // Direct institutional email login against /api/auth/faculty/login
        res = await loginFacultyDirect(credentialOrEmail, typeof passwordOrSimulated === 'string' ? passwordOrSimulated : '')
      } else {
        // Google Workspace OAuth Token verification
        res = await apiLoginFacultyInstitutional(credentialOrEmail, passwordOrSimulated)
      }
      const nextFaculty = {
        facultyId: res.faculty_id,
        name: res.name,
        email: res.email,
        department: res.department,
        designation: res.designation,
        employeeCode: res.employee_code,
        patientId: res.patient_id,
        accountType: res.account_type || 'FACULTY',
      }
      saveFacultySession({ token: res.access_token, ...nextFaculty })
      setFaculty(nextFaculty)
      setDoctor(null)
      setStudent(null)
      setReceptionist(null)
      setAdmin(null)
      setUserRole('FACULTY')
      return nextFaculty
    } catch (err) {
      const msg = err.message || 'Faculty login failed. Access restricted to approved institutional directory accounts.'
      setError(msg)
      throw err
    } finally {
      setLoading(false)
    }
  }

  // 5. HIDDEN ADMIN LOGIN (/admin/login -> POST /api/auth/admin/login)
  async function loginAdmin(email, password) {
    setLoading(true)
    setError('')
    try {
      const cleanEmail = (email || '').trim().toLowerCase()
      const cleanPass = (password || '').trim()
      const res = await apiLoginAdmin(cleanEmail, cleanPass)
      const nextAdmin = {
        userId: res.user_id,
        name: res.name || 'CampusCare Admin',
        email: res.email,
        role: res.role,
      }
      saveAdminSession({ token: res.access_token, ...nextAdmin })
      setAdmin(nextAdmin)
      setDoctor(null)
      setStudent(null)
      setReceptionist(null)
      setFaculty(null)
      setUserRole('ADMIN')
      return true
    } catch (err) {
      setError(err.message || 'Admin authentication failed.')
      return false
    } finally {
      setLoading(false)
    }
  }

  function logout() {
    clearSession()
    setDoctor(null)
    setStudent(null)
    setReceptionist(null)
    setFaculty(null)
    setAdmin(null)
    setUserRole(null)
    setError('')
    setSessionExpired(false)
  }

  return (
    <AuthContext.Provider
      value={{
        doctor,
        student,
        receptionist,
        faculty,
        admin,
        userRole,
        login,
        loginReceptionist,
        loginStudent,
        loginStudentGoogle,
        loginFaculty,
        loginAdmin,
        logout,
        error,
        setError,
        loading,
        sessionExpired,
        setSessionExpired,
        isAuthenticated: !!doctor || !!student || !!receptionist || !!faculty || !!admin,
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
