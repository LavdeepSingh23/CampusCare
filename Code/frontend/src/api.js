const DEMO_MODE = false
const STUDENT_DOMAIN = '@thapar.edu'

const BASE = import.meta.env.VITE_API_URL ?? ''
const TOKEN_KEY = 'campuscare_token'
const DOCTOR_KEY = 'campuscare_doctor'
const STUDENT_KEY = 'campuscare_student'
const RECEPTIONIST_KEY = 'campuscare_receptionist'
const ROLE_KEY = 'campuscare_role'

export function saveSession({ token, doctorId, name, specialization }) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(ROLE_KEY, 'DOCTOR')
  localStorage.setItem(DOCTOR_KEY, JSON.stringify({ doctorId, name, specialization }))
  localStorage.removeItem(STUDENT_KEY)
  localStorage.removeItem(RECEPTIONIST_KEY)
}

export function saveStudentSession({ token, rollNumber, name, email, userId }) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(ROLE_KEY, 'STUDENT')
  localStorage.setItem(STUDENT_KEY, JSON.stringify({ rollNumber, name, email, userId }))
  localStorage.removeItem(DOCTOR_KEY)
  localStorage.removeItem(RECEPTIONIST_KEY)
}

export function saveReceptionistSession({ token, name, email, staffId }) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(ROLE_KEY, 'RECEPTIONIST')
  localStorage.setItem(RECEPTIONIST_KEY, JSON.stringify({ name, email, staffId }))
  localStorage.removeItem(DOCTOR_KEY)
  localStorage.removeItem(STUDENT_KEY)
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(ROLE_KEY)
  localStorage.removeItem(DOCTOR_KEY)
  localStorage.removeItem(STUDENT_KEY)
  localStorage.removeItem(RECEPTIONIST_KEY)
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function getUserRole() {
  return localStorage.getItem(ROLE_KEY)
}

export function getStoredDoctor() {
  const raw = localStorage.getItem(DOCTOR_KEY)
  return raw ? JSON.parse(raw) : null
}

export function getStoredStudent() {
  const raw = localStorage.getItem(STUDENT_KEY)
  return raw ? JSON.parse(raw) : null
}

export function getStoredReceptionist() {
  const raw = localStorage.getItem(RECEPTIONIST_KEY)
  return raw ? JSON.parse(raw) : null
}

let onUnauthorized = () => clearSession()
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn
}

async function request(path, options = {}) {
  const token = getToken()
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (res.status === 401) {
    onUnauthorized()
    throw new Error('Session expired. Please log in again.')
  }

  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail ?? JSON.stringify(body)
    } catch {
  
    }
    throw new Error(`API ${res.status}: ${detail}`)
  }

  if (res.status === 204) return null
  return res.json()
}


function mockDelay(value, ms = 350) {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

const MOCK_DOCTOR = {
  doctor_id: 1,
  name: 'Dr. Neha Kapoor',
  specialization: 'General Physician',
}

const MOCK_QUEUE = [
  { rollNumber: 'CS21B045', name: 'Aarav Mehta', waitingSince: '10:15 AM', age: 20, bloodGroup: 'O+' },
  { rollNumber: 'EC20B012', name: 'Priya Singh', waitingSince: '10:32 AM', age: 21, bloodGroup: 'B+', priority: true },
  { rollNumber: 'ME22B078', name: 'Rohan Das', waitingSince: '10:40 AM', age: 19, bloodGroup: 'A+' },
]

const MOCK_SUMMARIES = {
  CS21B045: { conditions: 'Asthma', allergies: 'None recorded', medication: 'Salbutamol inhaler - as needed' },
  EC20B012: { conditions: 'None recorded', allergies: 'Penicillin', medication: 'None recorded' },
  ME22B078: { conditions: 'None recorded', allergies: 'None recorded', medication: 'None recorded' },
}

const MOCK_HISTORY = {
  CS21B045: [
    {
      date: '12 Aug 2026',
      diagnosis: 'Seasonal flu',
      notes: 'Prescribed rest and fluids, follow-up if fever persists.',
      medicines: [{ name: 'Paracetamol 500mg', timing: 'morning, night', note: 'after food' }],
    },
  ],
  EC20B012: [],
  ME22B078: [
    {
      date: '02 Jul 2026',
      diagnosis: 'Sprained ankle',
      notes: 'Advised rest, ice, and a compression bandage for a week.',
      medicines: [{ name: 'Ibuprofen 400mg', timing: 'morning, evening', note: 'with food' }],
    },
  ],
}

const MOCK_PATIENT_PROFILES = {
  CS21B045: {
    name: 'Aarav Mehta',
    rollNumber: 'CS21B045',
    course: 'B.E. Computer Science',
    branch: 'Computer Science & Engineering',
    bloodGroup: 'O+',
    email: 'aarav.mehta@thapar.edu',
    contact: '+91 98765 43210',
  },
  EC20B012: {
    name: 'Priya Singh',
    rollNumber: 'EC20B012',
    course: 'B.E. Electronics & Communication',
    branch: 'Electronics & Communication Engineering',
    bloodGroup: 'B+',
    email: 'priya.singh@thapar.edu',
    contact: '+91 98765 43211',
  },
  ME22B078: {
    name: 'Rohan Das',
    rollNumber: 'ME22B078',
    course: 'B.E. Mechanical Engineering',
    branch: 'Mechanical Engineering',
    bloodGroup: 'A+',
    email: 'rohan.das@thapar.edu',
    contact: '+91 98765 43212',
  },
}


export async function login(email, password) {
  try {
    return await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  } catch (err) {
    if (DEMO_MODE) {
      return mockDelay({ access_token: 'demo-token', ...MOCK_DOCTOR })
    }
    throw err
  }
}

export async function loginStudentGoogle(credential, simulatedUser = null) {
  // If simulated student was passed (e.g. sandbox or demo)
  if (simulatedUser) {
    const email = (simulatedUser.email || '').toLowerCase().trim()
    if (!email.endsWith(STUDENT_DOMAIN)) {
      throw new Error(`Access restricted to ${STUDENT_DOMAIN} Google Workspace accounts only. Please use your official Thapar University email.`)
    }
    const derivedRoll = simulatedUser.rollNumber || (email.match(/\d{6,10}/) || [])[0] || '102403499'
    const studentData = {
      access_token: 'demo-student-token-' + Date.now(),
      roll_number: derivedRoll,
      name: simulatedUser.name || 'Thapar Student',
      email: email,
      user_id: 1000,
    }
    return mockDelay(studentData, 400)
  }

  // Real backend verification
  try {
    return await request('/api/auth/google/student', {
      method: 'POST',
      body: JSON.stringify({ credential }),
    })
  } catch (err) {
    // If backend is offline or in fallback mode, decode JWT payload
    try {
      const parts = credential.split('.')
      if (parts.length >= 2) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
        const email = (payload.email || '').toLowerCase().trim()
        if (!email.endsWith(STUDENT_DOMAIN)) {
          throw new Error(`Access restricted to ${STUDENT_DOMAIN} Google Workspace accounts only. Please use your official Thapar University email.`)
        }
        const derivedRoll = (email.match(/\d{6,10}/) || [])[0] || '102403499'
        return {
          access_token: 'demo-google-token',
          roll_number: derivedRoll,
          name: payload.name || 'Thapar Student',
          email: email,
          user_id: 1000,
        }
      }
    } catch (decodeErr) {
      if (decodeErr.message?.includes(STUDENT_DOMAIN)) throw decodeErr
    }
    throw err
  }
}


export function fetchDoctorProfile(doctorId) {
  if (DEMO_MODE) {
    return mockDelay({
      name: MOCK_DOCTOR.name,
      specialization: MOCK_DOCTOR.specialization,
      shift: '9:00 AM – 5:00 PM',
      email: 'neha.kapoor@campuscare.edu',
    })
  }
  return request(`/api/doctor/${doctorId}/profile`)
}

export function fetchDoctorQueue(doctorId) {
  if (DEMO_MODE) return mockDelay(MOCK_QUEUE)
  return request(`/api/doctor/${doctorId}/queue`)
}

export function fetchDoctorStats(doctorId) {
  if (DEMO_MODE) return mockDelay({ waiting: MOCK_QUEUE.length, seenToday: 7 })
  return request(`/api/doctor/${doctorId}/stats`)
}



export function fetchPatientSummary(rollNumber) {
  if (DEMO_MODE) {
    return mockDelay(
      MOCK_SUMMARIES[rollNumber] ?? { conditions: 'None recorded', allergies: 'None recorded', medication: 'None recorded' }
    )
  }
  return request(`/api/patient/${rollNumber}/summary`)
}

export function fetchPatientHistory(rollNumber) {
  if (DEMO_MODE) return mockDelay(MOCK_HISTORY[rollNumber] ?? [])
  return request(`/api/patient/${rollNumber}/history`)
}

export function fetchPatientProfile(rollNumber) {
  if (DEMO_MODE) {
    return mockDelay(
      MOCK_PATIENT_PROFILES[rollNumber] ?? {
        name: 'Unknown Student',
        rollNumber,
        course: '',
        branch: '',
        bloodGroup: '',
        email: '',
        contact: '',
      }
    )
  }
  return request(`/api/patient/${rollNumber}/profile`)
}


export function completeConsultation(doctorId, payload) {
  if (DEMO_MODE) {
    const idx = MOCK_QUEUE.findIndex((p) => p.rollNumber === payload.roll_number)
    if (idx !== -1) MOCK_QUEUE.splice(idx, 1)
    return mockDelay({ status: 'ok' })
  }
  return request(`/api/doctor/${doctorId}/complete`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateAllergy(rollNumber, value) {
  if (DEMO_MODE) {
    MOCK_SUMMARIES[rollNumber] = { ...(MOCK_SUMMARIES[rollNumber] ?? {}), allergies: value }
    return mockDelay(MOCK_SUMMARIES[rollNumber])
  }
  return request(`/api/patient/${rollNumber}/allergy`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  })
}

export function updateCondition(rollNumber, value) {
  if (DEMO_MODE) {
    MOCK_SUMMARIES[rollNumber] = { ...(MOCK_SUMMARIES[rollNumber] ?? {}), conditions: value }
    return mockDelay(MOCK_SUMMARIES[rollNumber])
  }
  return request(`/api/patient/${rollNumber}/condition`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  })
}

export function updateMedication(rollNumber, value) {
  if (DEMO_MODE) {
    MOCK_SUMMARIES[rollNumber] = { ...(MOCK_SUMMARIES[rollNumber] ?? {}), medication: value }
    return mockDelay(MOCK_SUMMARIES[rollNumber])
  }
  return request(`/api/patient/${rollNumber}/medication`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  })
}
export function lookupStudent(rollNumber) {
  return request(`/api/reception/students/${encodeURIComponent(rollNumber.trim())}`)
}

export function fetchReceptionDoctors() {
  return request('/api/reception/doctors')
}

export function receptionCheckIn({ rollNumber, doctorId, complaint = '', via = 'MANUAL' }) {
  return request('/api/reception/checkin', {
    method: 'POST',
    body: JSON.stringify({
      roll_number: rollNumber,
      doctor_id: doctorId,
      complaint,
      via
    })
  })
}

export function fetchReceptionQueue() {
  return request('/api/reception/queue')
}