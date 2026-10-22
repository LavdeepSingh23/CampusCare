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
    const err = new Error(detail ? (detail.startsWith('API ') ? detail : `API ${res.status}: ${detail}`) : `API ${res.status}: ${res.statusText}`)
    err.status = res.status
    err.detail = detail
    throw err
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
  const url = payload.visit_id
    ? `/api/doctor/${doctorId}/complete/${payload.visit_id}`
    : `/api/doctor/${doctorId}/complete`
  return request(url, {
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

export function receptionCheckIn({ rollNumber, roll_number, doctorId, doctor_id, complaint = '', via = 'MANUAL' }) {
  return request('/api/reception/check-ins', {
    method: 'POST',
    body: JSON.stringify({
      roll_number: roll_number || rollNumber,
      doctor_id: doctor_id || doctorId,
      complaint: complaint || 'General Consultation',
      via
    })
  })
}

export function fetchReceptionQueue(doctorId = null) {
  const query = doctorId ? `?doctor_id=${encodeURIComponent(doctorId)}` : ''
  return request(`/api/reception/queue${query}`)
}

export function fetchActiveConsultation(doctorId) {
  return request(`/api/doctor/${doctorId}/active-consultation`)
}

export function callNextPatient(doctorId) {
  return request(`/api/doctor/${doctorId}/call-next`, {
    method: 'POST',
  })
}

export function startConsultation(doctorId, visitId = null) {
  if (visitId) {
    return request(`/api/doctor/${doctorId}/start-consultation/${visitId}`, {
      method: 'POST',
    })
  }
  return request(`/api/doctor/${doctorId}/call-next`, {
    method: 'POST',
  })
}

export function markNoShow(doctorId, visitId, reason = null) {
  return request(`/api/doctor/${doctorId}/no-show/${visitId}`, {
    method: 'POST',
    body: JSON.stringify(reason ? { reason } : {}),
  })
}

export function requeuePatient(visitId, targetDoctorId, reason = 'Patient arrived after no-show') {
  return request(`/api/queue/${visitId}/requeue`, {
    method: 'POST',
    body: JSON.stringify({
      target_doctor_id: targetDoctorId,
      reason,
    }),
  })
}

export function redirectPatient(visitId, targetDoctorId, reason = 'Clinical referral') {
  return request(`/api/queue/${visitId}/redirect`, {
    method: 'POST',
    body: JSON.stringify({
      target_doctor_id: targetDoctorId,
      reason,
    }),
  })
}

export function fetchAwaitingDispense(doctorId = null) {
  const query = doctorId && doctorId !== 'ALL' ? `?doctor_id=${encodeURIComponent(doctorId)}` : ''
  return request(`/api/reception/prescriptions/awaiting-dispense${query}`)
}

export function fetchDispensingPrescription(visitId) {
  return request(`/api/reception/prescriptions/${visitId}`)
}

export function dispensePrescription(visitId, payload = {}) {
  return request(`/api/reception/dispense/${visitId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}


// ── Emergency & Ambulance Dispatch ──────────────────────────────────────
export function createEmergencyLog(payload) {
  return request('/api/emergency/logs', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function fetchEmergencyLogs(severity = null, limit = 50) {
  const params = new URLSearchParams()
  if (severity) params.append('severity', severity)
  if (limit) params.append('limit', limit)
  const qs = params.toString() ? `?${params.toString()}` : ''
  return request(`/api/emergency/logs${qs}`)
}

export function fetchEmergencyDetail(emergencyId) {
  return request(`/api/emergency/logs/${emergencyId}`)
}

export function updateAmbulanceDispatch(emergencyId, payload) {
  return request(`/api/emergency/ambulance/${emergencyId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function fetchStudentEmergencyContact(rollNumber) {
  return request(`/api/emergency/contacts/${encodeURIComponent(rollNumber)}`)
}

export function updateStudentEmergencyContact(rollNumber, payload) {
  return request(`/api/emergency/contacts/${encodeURIComponent(rollNumber)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}


export function updateEmergencyLog(emergencyId, payload) {
  return request(`/api/emergency/logs/${emergencyId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

// ── Student Directory & Profiles ────────────────────────────────────────
export function fetchStudentsDirectory({ q, dept, limit = 50, offset = 0 } = {}) {
  const params = new URLSearchParams()
  if (q) params.append('q', q)
  if (dept) params.append('dept', dept)
  if (limit) params.append('limit', limit)
  if (offset) params.append('offset', offset)
  const qs = params.toString() ? `?${params.toString()}` : ''
  return request(`/api/reception/students${qs}`)
}

export function fetchStudentHistory(rollNumber) {
  return request(`/api/reception/students/${encodeURIComponent(rollNumber)}/history`)
}

// ── Completed OPD Visits ────────────────────────────────────────────────
export function fetchCompletedVisits({ doctorId, date, q, limit = 50, offset = 0 } = {}) {
  const params = new URLSearchParams()
  if (doctorId && doctorId !== 'ALL') params.append('doctor_id', doctorId)
  if (date) params.append('date', date)
  if (q) params.append('q', q)
  if (limit) params.append('limit', limit)
  if (offset) params.append('offset', offset)
  const qs = params.toString() ? `?${params.toString()}` : ''
  return request(`/api/reception/visits/completed${qs}`)
}

// ── Activity & Audit History ────────────────────────────────────────────
export function fetchActivityLog({ eventType, date, limit = 50, offset = 0 } = {}) {
  const params = new URLSearchParams()
  if (eventType) params.append('event_type', eventType)
  if (date) params.append('date', date)
  if (limit) params.append('limit', limit)
  if (offset) params.append('offset', offset)
  const qs = params.toString() ? `?${params.toString()}` : ''
  return request(`/api/reception/activity${qs}`)
}

// ── Terminal Settings & Administration ──────────────────────────────────
export function fetchTerminalSettings() {
  return request('/api/reception/settings')
}

export function updateDoctorAvailability(doctorId, status, date = null) {
  return request(`/api/reception/doctors/${doctorId}/availability`, {
    method: 'POST',
    body: JSON.stringify({ status, date }),
  })
}

export function lookupRfidCard(cardUid) {
  return request(`/api/reception/rfid/lookup/${encodeURIComponent(cardUid)}`)
}

export function enrollRfidCard(rollNumber, cardUid) {
  return request('/api/reception/rfid/enroll', {
    method: 'POST',
    body: JSON.stringify({ roll_number: rollNumber, card_uid: cardUid }),
  })
}

export function checkSystemHealth() {
  return request('/api/health')
}

export function checkDatabaseReadiness() {
  return request('/api/ready')
}



// ── Student Portal & Telemetry (SD-1) ──────────────────────────────────
export async function fetchStudentMe() {
  try {
    return await request('/api/student/me')
  } catch (err) {
    if (DEMO_MODE || getToken()?.startsWith('demo-') || err.message?.includes('Failed to fetch') || err.status === 404 || err.status === 500) {
      const stored = getStoredStudent()
      const roll = stored?.rollNumber || '102403499'
      const mockProfile = MOCK_PATIENT_PROFILES[roll] || {
        name: stored?.name || 'Simar Singh',
        rollNumber: roll,
        course: 'B.E. Computer Science',
        branch: 'Computer Science & Engineering',
        bloodGroup: 'B+',
        email: stored?.email || 'simar.singh102403499@thapar.edu',
        contact: '+91 98765 43210',
      }
      return mockDelay({
        student: {
          userId: stored?.userId || 1000,
          rollNumber: mockProfile.rollNumber,
          fullName: mockProfile.name,
          email: mockProfile.email,
          phoneNumber: mockProfile.contact,
          bloodGroup: mockProfile.bloodGroup,
          status: 'ACTIVE',
          program: mockProfile.course,
          branch: mockProfile.branch,
          department: mockProfile.branch,
          semester: 6,
        },
        allergies: [
          {
            allergyId: 1,
            allergen: 'Penicillin',
            reaction: 'Mild skin rash',
            severity: 'MILD',
          },
        ],
        chronicConditions: ['None recorded'],
        currentMedications: ['None recorded'],
        emergencyContacts: [
          {
            contactId: 1,
            name: 'Campus Health Office',
            relationship: 'Campus Authority',
            phoneNumber: '+91-000-000-0000',
          },
        ],
        activeVisit: null,
      })
    }
    throw err
  }
}

export async function fetchStudentProfile() {
  try {
    return await request('/api/student/profile')
  } catch (err) {
    return fetchStudentMe()
  }
}

export async function fetchStudentVisits() {
  try {
    return await request('/api/student/visits')
  } catch (err) {
    return fetchStudentMyHistory()
  }
}

export async function fetchStudentPrescriptions() {
  try {
    return await request('/api/student/prescriptions')
  } catch (err) {
    if (DEMO_MODE || getToken()?.startsWith('demo-') || err.message?.includes('Failed to fetch') || err.status === 404) {
      return []
    }
    throw err
  }
}

export async function fetchStudentSummary() {
  try {
    return await request('/api/student/summary')
  } catch (err) {
    if (DEMO_MODE || getToken()?.startsWith('demo-') || err.message?.includes('Failed to fetch') || err.status === 404) {
      return null
    }
    throw err
  }
}

export async function fetchStudentProfileByRoll(rollNumber) {
  try {
    return await request(`/api/student/${encodeURIComponent(rollNumber)}`)
  } catch (err) {
    if (DEMO_MODE || getToken()?.startsWith('demo-') || err.message?.includes('Failed to fetch') || err.status === 404) {
      return fetchPatientProfile(rollNumber)
    }
    throw err
  }
}

export async function fetchStudentVisitHistoryByRoll(rollNumber) {
  try {
    return await request(`/api/student/${encodeURIComponent(rollNumber)}/history`)
  } catch (err) {
    if (DEMO_MODE || getToken()?.startsWith('demo-') || err.message?.includes('Failed to fetch') || err.status === 404) {
      return fetchPatientHistory(rollNumber)
    }
    throw err
  }
}
export async function fetchStudentMyHistory() {
  try {
    return await request('/api/student/me/history')
  } catch (err) {
    if (DEMO_MODE || getToken()?.startsWith('demo-') || err.message?.includes('Failed to fetch') || err.status === 404) {
      const stored = getStoredStudent()
      const roll = stored?.rollNumber || 'CS21B045'
      return fetchPatientHistory(roll)
    }
    throw err
  }
}

export async function fetchStudentEmergencyDirectory() {
  try {
    return await request('/api/student/emergency-contacts')
  } catch (err) {
    if (DEMO_MODE || getToken()?.startsWith('demo-') || err.message?.includes('Failed to fetch') || err.status === 404) {
      return mockDelay({
        personalContacts: [
          {
            contactId: 1,
            name: 'Rajesh Mehta',
            relationship: 'Father',
            phoneNumber: '+91 98765 01234',
          },
        ],
        campusServices: [
          {
            label: 'Campus Health Centre (Dispensary)',
            sub: '24×7 Campus Emergency Medical Desk & Ambulance',
            number: '+91-175-2393108',
            priority: true,
          },
          {
            label: 'Campus Security Control Room',
            sub: 'Main Gate 24×7 Security Desk & Campus Patrol',
            number: '+91-175-2393110',
            priority: false,
          },
          {
            label: 'Hostel Warden / Student Affairs',
            sub: 'Hostel Emergency & Resident Scholar Assistance',
            number: '+91-175-2393112',
            priority: false,
          },
          {
            label: 'Campus Ambulance Driver on Duty',
            sub: 'Emergency Patient Transfer to Rajindra Hospital',
            number: '+91-987-654-3108',
            priority: true,
          },
        ],
        nationalHelplines: [
          {
            label: 'Ambulance',
            sub: 'Medical emergencies (National)',
            number: '108',
            priority: true,
          },
          {
            label: 'Tele-MANAS',
            sub: 'Mental health support, 24×7 toll-free',
            number: '14416',
            priority: true,
          },
          {
            label: 'National Emergency Helpline',
            sub: 'Police, Fire, Disaster Services',
            number: '112',
            priority: false,
          },
        ],
      })
    }
    throw err
  }
}


// ── Student Profile Registration & Onboarding (SD-2) ───────────────────
export async function updateStudentProfile(payload) {
  try {
    return await request('/api/student/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  } catch (err) {
    if (DEMO_MODE || getToken()?.startsWith('demo-') || err.message?.includes('Failed to fetch') || err.status === 404 || err.status === 500) {
      const stored = getStoredStudent()
      const roll = stored?.rollNumber || '102403499'
      const updatedProfile = {
        name: stored?.name || 'Simar Singh',
        rollNumber: roll,
        course: 'B.E. Computer Science',
        branch: 'Computer Science & Engineering',
        bloodGroup: payload.bloodGroup || 'B+',
        email: stored?.email || 'simar.singh102403499@thapar.edu',
        contact: payload.phoneNumber || '+91 98765 43210',
      }
      MOCK_PATIENT_PROFILES[roll] = updatedProfile

      return mockDelay({
        success: true,
        message: 'Student profile updated successfully.',
        profileCompletion: {
          isComplete: true,
          percentage: 100,
          status: 'COMPLETED',
          missingFields: [],
          completedFields: [
            'Phone Number',
            'Date of Birth',
            'Gender Identity',
            'Blood Group',
            'Emergency Contact',
            'Allergy Declaration',
            'Chronic Condition Declaration',
            'Medication Declaration',
          ],
        },
        data: {
          student: {
            userId: stored?.userId || 1000,
            rollNumber: roll,
            fullName: updatedProfile.name,
            email: updatedProfile.email,
            phoneNumber: payload.phoneNumber || updatedProfile.contact,
            dateOfBirth: payload.dateOfBirth || '2004-05-15',
            sex: payload.sex || 'OTHER',
            bloodGroup: payload.bloodGroup || 'B+',
            status: 'ACTIVE',
            program: 'B.E.',
            branch: 'Computer Science & Engineering',
            department: 'Computer Science & Engineering',
            semester: 6,
          },
          allergies: payload.allergies || [],
          chronicConditions: payload.chronicConditions || [],
          currentMedications: payload.currentMedications || [],
          emergencyContacts: payload.emergencyContact ? [payload.emergencyContact] : [],
          activeVisit: null,
          profileCompletion: {
            isComplete: true,
            percentage: 100,
            status: 'COMPLETED',
            missingFields: [],
            completedFields: [
              'Phone Number',
              'Date of Birth',
              'Gender Identity',
              'Blood Group',
              'Emergency Contact',
              'Allergy Declaration',
              'Chronic Condition Declaration',
              'Medication Declaration',
            ],
          },
        },
      })
    }
    throw err
  }
}

// ── Student Medical Details & Declarations (SD-3) ──────────────────────
export async function fetchStudentMedicalProfile() {
  try {
    return await request('/api/student/medical-profile')
  } catch (err) {
    if (DEMO_MODE || getToken()?.startsWith('demo-') || err.message?.includes('Failed to fetch') || err.status === 404) {
      const stored = getStoredStudent()
      const roll = stored?.rollNumber || '102403499'
      const mockProfile = MOCK_PATIENT_PROFILES[roll] || { bloodGroup: 'B+' }
      return mockDelay({
        rollNumber: roll,
        bloodGroup: mockProfile.bloodGroup || 'B+',
        medicalStatus: {
          allergyStatus: 'HAS_RECORDS',
          conditionStatus: 'NONE_REPORTED',
          medicationStatus: 'NONE_REPORTED',
          updatedAt: new Date().toISOString(),
        },
        summary: {
          totalAllergies: 1,
          totalConditions: 0,
          totalMedications: 0,
          hasSevereAllergyAlert: false,
          editableCount: 1,
          clinicalVerifiedCount: 0,
        },
        allergies: [
          {
            allergyId: 1,
            allergen: 'Penicillin',
            reaction: 'Mild skin rash',
            severity: 'MILD',
            source: 'SELF_REPORTED',
            canEdit: true,
            recordedAt: new Date().toISOString(),
          },
        ],
        conditions: [],
        medications: [],
        recentConsultations: [
          {
            visitId: 101,
            doctorName: 'Dr. Anil Sharma',
            specialty: 'General Medicine',
            diagnosis: 'Viral Pharyngitis',
            prescriptions: ['Paracetamol 500mg', 'Cetirizine 10mg'],
            completedAt: new Date(Date.now() - 86400000 * 7).toISOString(),
          },
        ],
      })
    }
    throw err
  }
}

export async function updateStudentMedicalProfile(payload) {
  try {
    return await request('/api/student/medical-profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  } catch (err) {
    if (DEMO_MODE || getToken()?.startsWith('demo-') || err.message?.includes('Failed to fetch') || err.status === 404) {
      return fetchStudentMedicalProfile()
    }
    throw err
  }
}

export async function addStudentAllergy(item) {
  try {
    return await request('/api/student/medical/allergies', {
      method: 'POST',
      body: JSON.stringify(item),
    })
  } catch (err) {
    if (DEMO_MODE || getToken()?.startsWith('demo-') || err.message?.includes('Failed to fetch')) {
      return mockDelay({
        success: true,
        message: `Allergy '${item.allergen}' recorded successfully.`,
        itemId: Date.now(),
      })
    }
    throw err
  }
}

export async function deleteStudentAllergy(allergyId) {
  try {
    return await request(`/api/student/medical/allergies/${allergyId}`, {
      method: 'DELETE',
    })
  } catch (err) {
    if (DEMO_MODE || getToken()?.startsWith('demo-') || err.message?.includes('Failed to fetch')) {
      return mockDelay({
        success: true,
        message: 'Allergy alert removed successfully.',
        itemId: allergyId,
      })
    }
    throw err
  }
}

export async function addStudentCondition(item) {
  try {
    return await request('/api/student/medical/conditions', {
      method: 'POST',
      body: JSON.stringify(item),
    })
  } catch (err) {
    if (DEMO_MODE || getToken()?.startsWith('demo-') || err.message?.includes('Failed to fetch')) {
      return mockDelay({
        success: true,
        message: `Chronic condition '${item.name}' recorded successfully.`,
        itemId: Date.now(),
      })
    }
    throw err
  }
}

export async function deleteStudentCondition(conditionId) {
  try {
    return await request(`/api/student/medical/conditions/${conditionId}`, {
      method: 'DELETE',
    })
  } catch (err) {
    if (DEMO_MODE || getToken()?.startsWith('demo-') || err.message?.includes('Failed to fetch')) {
      return mockDelay({
        success: true,
        message: 'Chronic condition record removed successfully.',
        itemId: conditionId,
      })
    }
    throw err
  }
}

export async function addStudentMedication(item) {
  try {
    return await request('/api/student/medical/medications', {
      method: 'POST',
      body: JSON.stringify(item),
    })
  } catch (err) {
    if (DEMO_MODE || getToken()?.startsWith('demo-') || err.message?.includes('Failed to fetch')) {
      return mockDelay({
        success: true,
        message: `Medication '${item.medicineName}' recorded successfully.`,
        itemId: Date.now(),
      })
    }
    throw err
  }
}

export async function deleteStudentMedication(medicationId) {
  try {
    return await request(`/api/student/medical/medications/${medicationId}`, {
      method: 'DELETE',
    })
  } catch (err) {
    if (DEMO_MODE || getToken()?.startsWith('demo-') || err.message?.includes('Failed to fetch')) {
      return mockDelay({
        success: true,
        message: 'Ongoing medication record removed successfully.',
        itemId: medicationId,
      })
    }
    throw err
  }
}

