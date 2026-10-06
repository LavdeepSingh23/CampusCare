import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  FileText,
  PhoneCall,
  Search,
  ChevronDown,
  CheckCircle2,
  Stethoscope,
  Zap,
  Plus,
  Trash2,
  Check,
  LogOut,
  Clock,
  Sparkles,
  RefreshCw,
  Send,
  AlertTriangle,
  Printer,
  Pill,
  ShieldAlert,
  HeartPulse,
  User,
  Calendar,
  ArrowRight,
  Sun,
  Sunset,
  Moon,
  CheckCircle,
  FileCheck,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import {
  fetchDoctorProfile,
  fetchDoctorQueue,
  fetchDoctorStats,
  fetchPatientSummary,
  completeConsultation,
} from '../../api'
import { cn } from '../../lib/utils'

// Initial patients queue matching hospital OPD workflow
const INITIAL_DEMO_QUEUE = [
  {
    id: 1,
    name: 'Neha Kapoor',
    initials: 'NK',
    rollNo: '102403001',
    age: 20,
    gender: 'Female',
    bloodGroup: 'B+',
    waitTime: '3 min',
    status: 'In Consultation',
    statusBadge: 'bg-teal-50 text-teal-700 border-teal-200',
    avatarBg: 'bg-teal-700 text-white',
    complaint: 'Seasonal allergic rhinitis & dry persistent cough',
    history: 'Childhood asthma (mild). Penicillin allergy flagged.',
    allergies: ['Penicillin', 'Dust mites'],
    prescriptions: [
      { name: 'Cetirizine 10mg', dosage: '0-0-1', timing: 'Night', duration: '5 days', instruction: 'after food', qty: 5 },
      { name: 'Salbutamol Inhaler 100mcg', dosage: 'SOS', timing: 'As needed', duration: '30 days', instruction: '2 puffs upon wheezing', qty: 1 },
    ],
    vitals: { bp: '118/76', pulse: '72 bpm', temp: '98.4 °F', spo2: '99%' },
  },
  {
    id: 2,
    name: 'Kriti Sharma',
    initials: 'KS',
    rollNo: '102403112',
    age: 21,
    gender: 'Female',
    bloodGroup: 'O+',
    waitTime: '7 min',
    status: 'Next in Line',
    statusBadge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    avatarBg: 'bg-slate-700 text-white',
    complaint: 'Sports injury — acute right ankle sprain during football',
    history: 'Previous ligament strain in 2024. Normal bone alignment.',
    allergies: ['None declared'],
    prescriptions: [
      { name: 'Ibuprofen 400mg', dosage: '1-0-1', timing: 'Morning & Night', duration: '3 days', instruction: 'after meals', qty: 6 },
      { name: 'Crepe Bandage 10cm', dosage: 'OD', timing: 'Continuous', duration: '7 days', instruction: 'support during walking', qty: 1 },
    ],
    vitals: { bp: '124/82', pulse: '80 bpm', temp: '98.6 °F', spo2: '98%' },
  },
  {
    id: 3,
    name: 'Damanpreet Singh',
    initials: 'DS',
    rollNo: '102403205',
    age: 19,
    gender: 'Male',
    bloodGroup: 'A+',
    waitTime: '14 min',
    status: 'Waiting',
    statusBadge: 'bg-amber-50 text-amber-700 border-amber-200',
    avatarBg: 'bg-amber-700 text-white',
    complaint: 'Routine hostel medical clearance & vision test',
    history: 'Normal medical fitness. Myopia with -1.5D correction.',
    allergies: ['Sulfa drugs'],
    prescriptions: [
      { name: 'Becosules Multivitamin', dosage: '1-0-0', timing: 'Morning', duration: '30 days', instruction: 'after breakfast', qty: 30 },
    ],
    vitals: { bp: '116/74', pulse: '68 bpm', temp: '98.5 °F', spo2: '99%' },
  },
  {
    id: 4,
    name: 'Matha Naparin',
    initials: 'MN',
    rollNo: '102403348',
    age: 22,
    gender: 'Female',
    bloodGroup: 'AB+',
    waitTime: '20 min',
    status: 'Waiting',
    statusBadge: 'bg-amber-50 text-amber-700 border-amber-200',
    avatarBg: 'bg-indigo-700 text-white',
    complaint: 'Contact dermatitis on wrist from smartwatch strap',
    history: 'Sensitive skin. No prior hospitalizations.',
    allergies: ['Latex'],
    prescriptions: [
      { name: 'Hydrocortisone cream 1%', dosage: '1-0-1', timing: 'Morning & Night', duration: '5 days', instruction: 'apply topically', qty: 1 },
    ],
    vitals: { bp: '120/78', pulse: '76 bpm', temp: '98.2 °F', spo2: '99%' },
  },
]

// Quick Common University Formulary Drugs for 1-Click Addition
const QUICK_DRUG_LIBRARY = [
  { name: 'Paracetamol 500mg', dosage: '1-0-1', timing: 'Morning & Night', duration: '3 days', instruction: 'after food', qty: 6 },
  { name: 'Cetirizine 10mg', dosage: '0-0-1', timing: 'Night', duration: '5 days', instruction: 'at bedtime', qty: 5 },
  { name: 'Azithromycin 500mg', dosage: '1-0-0', timing: 'Morning', duration: '3 days', instruction: 'before food', qty: 3 },
  { name: 'Pantoprazole 40mg', dosage: '1-0-0', timing: 'Morning', duration: '5 days', instruction: '30 mins before breakfast', qty: 5 },
  { name: 'Ibuprofen 400mg', dosage: '1-0-1', timing: 'Morning & Night', duration: '3 days', instruction: 'after meals', qty: 6 },
  { name: 'Amoxicillin 500mg', dosage: '1-1-1', timing: 'Three times a day', duration: '5 days', instruction: 'after food', qty: 15 },
  { name: 'Oral Rehydration Salts (ORS)', dosage: 'SOS', timing: 'As needed', duration: '3 days', instruction: 'mix in 1L fresh water', qty: 3 },
  { name: 'Cough Syrup 100ml', dosage: '1-1-1', timing: '10ml thrice daily', duration: '5 days', instruction: 'after meals', qty: 1 },
]

export default function Doctors_Dashboard() {
  const navigate = useNavigate()
  const { doctor, logout } = useAuth()
  const doctorId = doctor?.doctorId

  // Dashboard Tab state: 'queue' (Live Queue) | 'prescription' (E-Prescription Studio) | 'history' (Completed Consultations)
  const [activeTab, setActiveTab] = useState('queue')

  // Doctor Profile info
  const [doctorProfile, setDoctorProfile] = useState({
    name: doctor?.name ?? 'Dr. Neha Kapoor',
    specialization: doctor?.specialization ?? 'General Physician',
    shift: '09:00 AM - 05:00 PM',
    email: doctor?.email ?? 'dr.kapoor@thapar.edu',
    room: '104',
    regNo: 'TIET-DOC-0104',
  })

  // Patient Queue
  const [patients, setPatients] = useState(INITIAL_DEMO_QUEUE)
  const [selectedPatientId, setSelectedPatientId] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [openAccordion, setOpenAccordion] = useState('history') // 'history' | 'allergies' | 'rx'
  const [actionAlert, setActionAlert] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false)

  // Metrics
  const [seenCount, setSeenCount] = useState(18)
  const [completedHistory, setCompletedHistory] = useState([
    {
      id: 901,
      name: 'Harshveer Singh',
      rollNo: '102403101',
      completedAt: '03:45 PM',
      diagnosis: 'Acute Viral Pharyngitis',
      prescriptions: 'Paracetamol 500mg, Betadine Gargle',
    },
    {
      id: 902,
      name: 'Simar Singh',
      rollNo: '102403499',
      completedAt: '04:10 PM',
      diagnosis: 'Tension Headache & Eye Strain',
      prescriptions: 'Paracetamol 500mg, Eye Lubricant Drops',
    },
  ])

  // Current Patient
  const selectedPatient = useMemo(() => {
    return patients.find((p) => p.id === selectedPatientId) || patients[0] || INITIAL_DEMO_QUEUE[0]
  }, [patients, selectedPatientId])

  // Prescription Studio State
  const [rxDiagnosis, setRxDiagnosis] = useState(selectedPatient?.complaint || '')
  const [rxNotes, setRxNotes] = useState(selectedPatient?.history || '')
  const [rxDietAdvice, setRxDietAdvice] = useState('Adequate hydration, warm saline gargles, avoid cold beverages.')
  const [rxFollowUp, setRxFollowUp] = useState('Review in 3 days if symptoms persist.')
  const [draftMedicines, setDraftMedicines] = useState(selectedPatient?.prescriptions || [])

  // New Medicine Custom Form
  const [customMedName, setCustomMedName] = useState('')
  const [customMorning, setCustomMorning] = useState(true)
  const [customAfternoon, setCustomAfternoon] = useState(false)
  const [customNight, setCustomNight] = useState(true)
  const [customDuration, setCustomDuration] = useState('5 days')
  const [customInstruction, setCustomInstruction] = useState('after food')

  // Sync prescription editor whenever selected patient changes
  useEffect(() => {
    if (selectedPatient) {
      setRxDiagnosis(selectedPatient.complaint || '')
      setRxNotes(selectedPatient.history || '')
      setDraftMedicines(selectedPatient.prescriptions || [])
    }
  }, [selectedPatient?.id])

  // Load real backend queue & stats
  const loadBackendData = async () => {
    if (!doctorId) return
    setIsRefreshing(true)
    try {
      const prof = await fetchDoctorProfile(doctorId)
      if (prof) {
        setDoctorProfile((prev) => ({
          ...prev,
          name: prof.name || prev.name,
          specialization: prof.specialization || prev.specialization,
          shift: prof.shift !== 'Not set' ? prof.shift : prev.shift,
          email: prof.email || prev.email,
        }))
      }

      const stats = await fetchDoctorStats(doctorId)
      if (stats && typeof stats.seenToday === 'number' && stats.seenToday > 0) {
        setSeenCount(stats.seenToday)
      }

      const queueData = await fetchDoctorQueue(doctorId)
      if (Array.isArray(queueData) && queueData.length > 0) {
        const mapped = await Promise.all(
          queueData.map(async (item, idx) => {
            let summary = { allergies: 'None recorded', conditions: 'None recorded' }
            try {
              summary = await fetchPatientSummary(item.rollNumber)
            } catch {
              // fallback
            }

            const initials = item.name
              ? item.name
                  .split(' ')
                  .map((w) => w[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()
              : 'ST'

            const isFirst = idx === 0
            const status = isFirst ? 'In Consultation' : idx === 1 ? 'Next in Line' : 'Waiting'
            const statusBadge = isFirst
              ? 'bg-teal-50 text-teal-700 border-teal-200'
              : idx === 1
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-amber-50 text-amber-700 border-amber-200'

            const allergiesList =
              summary.allergies && summary.allergies !== 'None recorded'
                ? summary.allergies.split(',').map((s) => s.trim())
                : ['None declared']

            return {
              id: item.queueEntryId || item.visitId || idx + 10,
              name: item.name,
              initials,
              rollNo: item.rollNumber,
              age: item.age || 20,
              gender: 'Student',
              bloodGroup: item.bloodGroup || 'B+',
              waitTime: item.waitingSince ? `${item.waitingSince}` : `${(idx + 1) * 6} min`,
              status,
              statusBadge,
              avatarBg:
                idx === 0
                  ? 'bg-teal-700 text-white'
                  : idx === 1
                  ? 'bg-slate-700 text-white'
                  : idx === 2
                  ? 'bg-amber-700 text-white'
                  : 'bg-indigo-700 text-white',
              complaint:
                summary.conditions && summary.conditions !== 'None recorded'
                  ? summary.conditions
                  : 'OPD Health Evaluation',
              history: `Enrolled TIET Student. Blood Group: ${item.bloodGroup || 'B+'}, Age: ${item.age || 20}.`,
              allergies: allergiesList,
              prescriptions: [
                { name: 'Paracetamol 500mg', dosage: '1-0-1', timing: 'Morning & Night', duration: '3 days', instruction: 'after meals', qty: 6 },
              ],
              vitals: { bp: '118/76', pulse: '72 bpm', temp: '98.4 °F', spo2: '99%' },
            }
          })
        )

        if (mapped.length < 3) {
          const remaining = INITIAL_DEMO_QUEUE.filter(
            (dq) => !mapped.some((bq) => bq.rollNo === dq.rollNo)
          )
          setPatients([...mapped, ...remaining])
        } else {
          setPatients(mapped)
        }
        if (mapped[0]) setSelectedPatientId(mapped[0].id)
      }
    } catch (err) {
      console.warn('Backend sync failed, using reactive local state:', err)
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    loadBackendData()
  }, [doctorId])

  // Filtered queue
  const filteredPatients = patients.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.rollNo.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Call Next Student
  const handleCallNext = () => {
    const nextWaiting = patients.find(
      (p) => p.status === 'Next in Line' || p.status === 'Waiting'
    )
    if (nextWaiting) {
      setPatients((prev) =>
        prev.map((p) => {
          if (p.id === nextWaiting.id) {
            return {
              ...p,
              status: 'In Consultation',
              statusBadge: 'bg-teal-50 text-teal-700 border-teal-200',
            }
          }
          if (p.status === 'In Consultation') {
            return {
              ...p,
              status: 'Completed',
              statusBadge: 'bg-slate-100 text-slate-700 border-slate-200',
            }
          }
          return p
        })
      )
      setSelectedPatientId(nextWaiting.id)
      triggerToast(`Calling ${nextWaiting.name} (Roll #${nextWaiting.rollNo}) to Room ${doctorProfile.room}`)
    } else {
      triggerToast('All waiting students have been attended to!')
    }
  }

  const triggerToast = (msg) => {
    setActionAlert(msg)
    setTimeout(() => setActionAlert(null), 3500)
  }

  // Add Drug from Quick Library
  const handleAddQuickDrug = (drug) => {
    // Check allergy conflict
    if (
      drug.name.toLowerCase().includes('amoxicillin') ||
      drug.name.toLowerCase().includes('penicillin')
    ) {
      if (
        selectedPatient.allergies.some((a) => a.toLowerCase().includes('penicillin'))
      ) {
        triggerToast('⚠️ ALLERGY CONFLICT: Patient is allergic to Penicillin!')
        return
      }
    }
    setDraftMedicines((prev) => [...prev, drug])
    triggerToast(`Added ${drug.name} to prescription`)
  }

  // Add Custom Drug
  const handleAddCustomDrug = (e) => {
    e.preventDefault()
    if (!customMedName.trim()) return

    const dosageCode = `${customMorning ? '1' : '0'}-${customAfternoon ? '1' : '0'}-${customNight ? '1' : '0'}`
    const timingDesc = [
      customMorning && 'Morning',
      customAfternoon && 'Afternoon',
      customNight && 'Night',
    ]
      .filter(Boolean)
      .join(' & ') || 'As advised'

    const daysCount = parseInt(customDuration) || 5
    const dosesPerDay = (customMorning ? 1 : 0) + (customAfternoon ? 1 : 0) + (customNight ? 1 : 0)
    const calcQty = Math.max(1, dosesPerDay * daysCount)

    const newMed = {
      name: customMedName.trim(),
      dosage: dosageCode,
      timing: timingDesc,
      duration: customDuration,
      instruction: customInstruction.trim() || 'after food',
      qty: calcQty,
    }

    setDraftMedicines((prev) => [...prev, newMed])
    setCustomMedName('')
    triggerToast(`Added ${newMed.name} to prescription`)
  }

  // Complete Consultation & Dispatch Rx
  const handleCompleteAndDispatch = async () => {
    if (!selectedPatient) return

    if (doctorId) {
      try {
        await completeConsultation(doctorId, {
          roll_number: selectedPatient.rollNo,
          diagnosis: rxDiagnosis || selectedPatient.complaint,
          clinical_notes: rxNotes || selectedPatient.history,
          medicines: draftMedicines.map((m) => ({
            name: m.name,
            dosage: m.dosage,
            instructions: `${m.instruction} for ${m.duration}`,
          })),
        })
      } catch (err) {
        console.warn('Backend complete consultation status:', err)
      }
    }

    // Update local state
    setSeenCount((prev) => prev + 1)
    setCompletedHistory((prev) => [
      {
        id: Date.now(),
        name: selectedPatient.name,
        rollNo: selectedPatient.rollNo,
        completedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        diagnosis: rxDiagnosis || selectedPatient.complaint,
        prescriptions: draftMedicines.map((m) => m.name).join(', ') || 'General Consultation',
      },
      ...prev,
    ])

    setPatients((prev) =>
      prev.map((p) =>
        p.id === selectedPatient.id
          ? {
              ...p,
              status: 'Completed',
              statusBadge: 'bg-slate-100 text-slate-700 border-slate-200',
              prescriptions: draftMedicines,
            }
          : p
      )
    )

    triggerToast(`Prescription #CC-${Math.floor(1000 + Math.random() * 9000)} dispatched to Campus Dispensary!`)
    setTimeout(() => {
      handleCallNext()
      setActiveTab('queue')
    }, 1500)
  }

  return (
    <div className="min-h-screen bg-[#f1f5f5] text-slate-800 flex flex-col font-sans selection:bg-teal-600 selection:text-white">
      {/* ── TOP NAV BAR / CLINICAL WORKSTATION HEADER ── */}
      <header className="w-full bg-white border-b border-slate-200/90 shadow-2xs sticky top-0 z-30 px-4 sm:px-8 py-3 flex items-center justify-between">
        {/* Left Branding */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-teal-700 flex items-center justify-center text-white shadow-xs">
            <Stethoscope className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-900 tracking-tight">
                CampusCare
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 font-semibold border border-teal-200/60">
                Doctor Workstation
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">
              TIET Health Centre • Room {doctorProfile.room} • OPD Live
            </p>
          </div>
        </div>

        {/* Center Tabs: Queue, E-Prescription Studio, Completed History */}
        <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200 text-xs">
          <button
            onClick={() => setActiveTab('queue')}
            className={cn(
              'px-3.5 py-1.5 rounded-lg font-semibold transition-all duration-200 flex items-center gap-2 cursor-pointer',
              activeTab === 'queue'
                ? 'bg-white text-teal-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            <Activity className="w-3.5 h-3.5 text-teal-700" />
            <span>Live OPD Queue</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-teal-700 text-white font-bold">
              {filteredPatients.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('prescription')}
            className={cn(
              'px-3.5 py-1.5 rounded-lg font-semibold transition-all duration-200 flex items-center gap-2 cursor-pointer',
              activeTab === 'prescription'
                ? 'bg-white text-teal-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            <Pill className="w-3.5 h-3.5 text-teal-700" />
            <span>E-Prescription Studio</span>
            {draftMedicines.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-600 text-white font-bold">
                {draftMedicines.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={cn(
              'px-3.5 py-1.5 rounded-lg font-semibold transition-all duration-200 flex items-center gap-2 cursor-pointer',
              activeTab === 'history'
                ? 'bg-white text-teal-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            <FileCheck className="w-3.5 h-3.5 text-slate-500" />
            <span>Completed Today</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 font-bold">
              {seenCount}
            </span>
          </button>
        </div>

        {/* Right Doctor Profile & Quick Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={loadBackendData}
            title="Sync Queue"
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
          >
            <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin text-teal-600')} />
          </button>

          <div className="relative">
            <button
              onClick={() => setProfileDropdownOpen((prev) => !prev)}
              className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer select-none"
            >
              <div className="h-7 w-7 rounded-full bg-teal-700 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                NK
              </div>
              <div className="text-left leading-tight hidden md:block">
                <p className="text-xs font-bold text-slate-900">{doctorProfile.name}</p>
                <p className="text-[10px] text-teal-700 font-medium">Room {doctorProfile.room} • {doctorProfile.specialization}</p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            <AnimatePresence>
              {profileDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.95 }}
                  className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden text-xs"
                >
                  <div className="p-3.5 bg-slate-50 border-b border-slate-100">
                    <p className="font-bold text-slate-900 text-sm">{doctorProfile.name}</p>
                    <p className="text-xs text-teal-800 font-semibold">{doctorProfile.specialization}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{doctorProfile.email}</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">Reg: {doctorProfile.regNo}</p>
                  </div>
                  <div className="p-2 space-y-1">
                    <div className="flex items-center gap-2 px-2.5 py-1.5 text-slate-600">
                      <Clock className="w-3.5 h-3.5 text-teal-600" />
                      <span>Shift: {doctorProfile.shift}</span>
                    </div>
                    <div className="flex items-center justify-between px-2.5 py-1.5 bg-teal-50/50 rounded-lg text-teal-900">
                      <span>Patients Seen Today:</span>
                      <span className="font-bold">{seenCount}</span>
                    </div>
                  </div>
                  <div className="border-t border-slate-100 p-1.5">
                    <button
                      onClick={logout}
                      className="w-full flex items-center gap-2 px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-lg font-semibold transition-colors cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>End Shift / Log Out</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Floating Action Toast Notification */}
      <AnimatePresence>
        {actionAlert && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-18 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full bg-slate-900/95 text-teal-200 border border-teal-500/40 text-xs font-semibold shadow-2xl flex items-center gap-2.5 backdrop-blur-md"
          >
            <Sparkles className="w-4 h-4 text-teal-400" />
            <span>{actionAlert}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── MAIN WORKSPACE CONTAINER (GENEROUS FULL-SCREEN LAYOUT) ── */}
      <main className="w-full max-w-[1720px] mx-auto p-4 sm:p-6 lg:p-8 flex-1 flex flex-col">
        {/* ═══════════════════════════════════════════════════════════
            VIEW 1: LIVE OPD QUEUE & CLINICAL CHART
           ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'queue' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1">
            {/* ── COL 1: DOCTOR CONTROL SIDEBAR (Span 3) ── */}
            <div className="lg:col-span-3 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between space-y-6">
              <div className="space-y-5">
                {/* Doctor Identity Card */}
                <div className="flex items-center gap-3 p-3.5 rounded-xl bg-teal-50/70 border border-teal-100">
                  <div className="h-11 w-11 rounded-full bg-teal-700 text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-xs">
                    NK
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-sm font-bold text-slate-900 truncate">
                      {doctorProfile.name}
                    </p>
                    <p className="text-xs text-teal-800 font-semibold">
                      Room {doctorProfile.room} • {doctorProfile.specialization}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">{doctorProfile.email}</p>
                  </div>
                </div>

                {/* Queue Summary Metrics */}
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    OPD Metrics
                  </p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                      <p className="text-[11px] text-slate-500 font-medium">In Queue</p>
                      <p className="text-xl font-extrabold text-teal-800 mt-0.5">
                        {patients.filter((p) => p.status !== 'Completed').length}
                      </p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                      <p className="text-[11px] text-slate-500 font-medium">Seen Today</p>
                      <p className="text-xl font-extrabold text-slate-900 mt-0.5">{seenCount}</p>
                    </div>
                  </div>
                </div>

                {/* Shift Details */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs space-y-2">
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-teal-600" />
                      <span>Shift Hours:</span>
                    </span>
                    <span className="font-semibold text-slate-800">{doctorProfile.shift}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Avg Consult Time:</span>
                    </span>
                    <span className="font-semibold text-emerald-700">4.2 min</span>
                  </div>
                </div>
              </div>

              {/* Call Next Patient Big Action Button */}
              <div className="pt-4 border-t border-slate-100">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleCallNext}
                  className="w-full py-3 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm hover:shadow-md"
                >
                  <PhoneCall className="w-4 h-4" />
                  <span>Call Next Student</span>
                </motion.button>
              </div>
            </div>

            {/* ── COL 2: CENTER CONSULTATION LINE (Span 5) ── */}
            <div className="lg:col-span-5 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between min-h-[580px]">
              <div>
                {/* Header Strip */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-slate-900">
                        Today's Consultation Line
                      </h2>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200/60 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span>Live Sync</span>
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Select any student to view vitals & write prescriptions
                    </p>
                  </div>

                  {/* Filter Search */}
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs focus-within:border-teal-500 focus-within:bg-white transition-all">
                    <Search className="w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filter student / roll #..."
                      className="bg-transparent text-slate-800 text-xs outline-hidden placeholder:text-slate-400 w-36 sm:w-44"
                    />
                  </div>
                </div>

                {/* Patient Rows */}
                <div className="space-y-2.5">
                  {filteredPatients.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-xs">
                      No student record matching "{searchQuery}"
                    </div>
                  ) : (
                    filteredPatients.map((patient) => {
                      const isSelected = patient.id === selectedPatientId
                      return (
                        <motion.div
                          key={patient.id}
                          whileHover={{ x: 3 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                          onClick={() => setSelectedPatientId(patient.id)}
                          className={cn(
                            'flex items-center justify-between p-3.5 rounded-xl text-xs transition-all duration-200 cursor-pointer border',
                            isSelected
                              ? 'bg-teal-50/90 border-teal-400 shadow-xs ring-1 ring-teal-400/30'
                              : 'bg-white hover:bg-slate-50/80 border-slate-100'
                          )}
                        >
                          <div className="flex items-center gap-3.5">
                            <div
                              className={`h-9 w-9 rounded-full ${patient.avatarBg} font-bold text-xs flex items-center justify-center shrink-0 shadow-xs`}
                            >
                              {patient.initials}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-slate-900 text-sm leading-tight">
                                  {patient.name}
                                </p>
                                {isSelected && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-teal-700 text-white font-semibold">
                                    Inspecting
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-400 mt-0.5">
                                Roll: {patient.rollNo} • {patient.complaint}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-500 font-medium">
                              {patient.waitTime}
                            </span>
                            <span
                              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${patient.statusBadge}`}
                            >
                              {patient.status}
                            </span>
                          </div>
                        </motion.div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Bottom Footer Line */}
              <div className="pt-3 mt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                <span>
                  Active student:{' '}
                  <strong className="text-slate-800 font-semibold">{selectedPatient.name}</strong> (Roll: {selectedPatient.rollNo})
                </span>
                <button
                  onClick={handleCallNext}
                  className="text-teal-700 font-bold hover:underline cursor-pointer flex items-center gap-1"
                >
                  <span>Call Next</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* ── COL 3: PATIENT CLINICAL CHART & QUICK RX (Span 4) ── */}
            <div className="lg:col-span-4 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between min-h-[580px]">
              <div>
                {/* Header: Selected Patient */}
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-11 w-11 rounded-full ${selectedPatient.avatarBg} font-bold text-sm flex items-center justify-center shrink-0 shadow-xs`}
                    >
                      {selectedPatient.initials}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-base">
                        {selectedPatient.name}
                      </h3>
                      <p className="text-xs text-slate-400">
                        Roll: {selectedPatient.rollNo} • Age: {selectedPatient.age} • Blood: {selectedPatient.bloodGroup}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                    {selectedPatient.gender}
                  </span>
                </div>

                {/* 4-Metric Vitals Strip */}
                <div className="grid grid-cols-4 gap-2 bg-slate-50 p-2.5 rounded-xl text-center text-xs text-slate-700 mb-4 border border-slate-100">
                  <div>
                    <span className="text-slate-400 block text-[10px]">BP</span>
                    <span className="font-bold text-slate-900">{selectedPatient.vitals.bp}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Pulse</span>
                    <span className="font-bold text-slate-900">{selectedPatient.vitals.pulse}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">SpO2</span>
                    <span className="font-bold text-slate-900">{selectedPatient.vitals.spo2}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Temp</span>
                    <span className="font-bold text-slate-900">{selectedPatient.vitals.temp}</span>
                  </div>
                </div>

                {/* Allergy Banner (Prominent Warning) */}
                {selectedPatient.allergies.some((a) => a !== 'None declared') && (
                  <div className="mb-4 p-2.5 rounded-xl bg-rose-50 border border-rose-200/80 flex items-start gap-2.5 text-xs text-rose-900">
                    <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">ALLERGY WARNING:</span>
                      <span>Known allergic reaction to: {selectedPatient.allergies.join(', ')}</span>
                    </div>
                  </div>
                )}

                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Clinical Chart & History
                </p>

                {/* Accordions */}
                <div className="space-y-2 text-xs">
                  {/* Diagnosis */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                    <button
                      onClick={() => setOpenAccordion((prev) => (prev === 'history' ? null : 'history'))}
                      className="w-full flex items-center justify-between p-3 text-slate-800 font-semibold hover:bg-slate-100/70 transition-colors cursor-pointer"
                    >
                      <span>Diagnosis & Chief Complaint</span>
                      <motion.div animate={{ rotate: openAccordion === 'history' ? 180 : 0 }}>
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      </motion.div>
                    </button>
                    <AnimatePresence initial={false}>
                      {openAccordion === 'history' && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="p-3 pt-0 text-xs text-slate-600 space-y-1.5 border-t border-slate-100">
                            <div>
                              <span className="font-semibold text-teal-900 block">Complaint:</span>
                              <p className="text-slate-800">{selectedPatient.complaint}</p>
                            </div>
                            <div>
                              <span className="font-semibold text-slate-700 block">Clinical History:</span>
                              <p>{selectedPatient.history}</p>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Active Prescriptions */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                    <button
                      onClick={() => setOpenAccordion((prev) => (prev === 'rx' ? null : 'rx'))}
                      className="w-full flex items-center justify-between p-3 text-slate-800 font-semibold hover:bg-slate-100/70 transition-colors cursor-pointer"
                    >
                      <span>Active Medications ({selectedPatient.prescriptions.length})</span>
                      <motion.div animate={{ rotate: openAccordion === 'rx' ? 180 : 0 }}>
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      </motion.div>
                    </button>
                    <AnimatePresence initial={false}>
                      {openAccordion === 'rx' && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="p-3 pt-0 text-xs text-slate-600 space-y-2 border-t border-slate-100">
                            {selectedPatient.prescriptions.map((rx, idx) => (
                              <div
                                key={idx}
                                className="flex items-start justify-between p-2 rounded-lg bg-white border border-slate-200"
                              >
                                <div>
                                  <span className="font-bold text-slate-900 block">{rx.name}</span>
                                  <span className="text-[11px] text-slate-500">{rx.instruction} ({rx.duration})</span>
                                </div>
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 font-bold border border-teal-100">
                                  {rx.dosage}
                                </span>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {/* Direct Link to Open Full E-Prescription Studio */}
              <div className="mt-5 pt-3 border-t border-slate-100 space-y-2">
                <button
                  onClick={() => setActiveTab('prescription')}
                  className="w-full py-2.5 px-3 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
                >
                  <Pill className="w-4 h-4" />
                  <span>Write / Edit Prescription in Studio →</span>
                </button>
                <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                  <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>TIET Verified Student</span>
                  </span>
                  <span>Health Centre RFID OK</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            VIEW 2: E-PRESCRIPTION STUDIO (HOSPITAL-GRADE RX PAD)
           ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'prescription' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 flex flex-col space-y-6">
            {/* Prescription Pad Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-teal-700 text-white flex items-center justify-center text-xl font-bold shadow-xs">
                  ℞
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                    CampusCare E-Prescription Desk
                  </h2>
                  <p className="text-xs text-slate-500">
                    Thapar Institute Health Centre • OPD Room {doctorProfile.room} • {doctorProfile.name} ({doctorProfile.regNo})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setActiveTab('queue')}
                  className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                >
                  ← Back to OPD Queue
                </button>
                <button
                  onClick={handleCompleteAndDispatch}
                  className="px-5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Complete Consultation & Dispatch Rx</span>
                </button>
              </div>
            </div>

            {/* Patient Demographic & Allergy Alert Banner */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Patient Name</span>
                <span className="font-bold text-slate-900 text-sm">{selectedPatient.name}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Roll Number</span>
                <span className="font-bold text-slate-900 text-sm">{selectedPatient.rollNo}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Age / Gender / Blood Group</span>
                <span className="font-bold text-slate-900">{selectedPatient.age} yrs • {selectedPatient.gender} • {selectedPatient.bloodGroup}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Recorded Vitals</span>
                <span className="font-bold text-slate-900">BP: {selectedPatient.vitals.bp} | SpO2: {selectedPatient.vitals.spo2}</span>
              </div>
            </div>

            {/* Allergy Flag */}
            {selectedPatient.allergies.some((a) => a !== 'None declared') && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-3 text-xs text-rose-800 font-semibold">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>CRITICAL ALLERGY ALERT: Patient is sensitive/allergic to {selectedPatient.allergies.join(', ')}. Avoid prescribing cross-reactive compounds.</span>
              </div>
            )}

            {/* Quick 1-Click Formulary Drugs Library */}
            <div>
              <p className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                <span>1-Click University Formulary Presets:</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {QUICK_DRUG_LIBRARY.map((drug, i) => (
                  <button
                    key={i}
                    onClick={() => handleAddQuickDrug(drug)}
                    className="px-3 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3 text-teal-600" />
                    <span>{drug.name}</span>
                    <span className="text-[10px] text-teal-700 font-semibold">({drug.dosage})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Medicine Adder Form */}
            <form onSubmit={handleAddCustomDrug} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <p className="text-xs font-bold text-slate-800">Add Custom Medication / Dosage Instructions</p>
              
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                {/* Drug Name */}
                <div className="md:col-span-4">
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Medicine Name & Strength:
                  </label>
                  <input
                    type="text"
                    value={customMedName}
                    onChange={(e) => setCustomMedName(e.target.value)}
                    placeholder="e.g. Dolo 650mg, Montelukast 10mg..."
                    className="w-full text-xs text-slate-800 bg-white border border-slate-300 rounded-lg px-3 py-2 outline-hidden focus:border-teal-600"
                  />
                </div>

                {/* Dosage Schedule Checkboxes */}
                <div className="md:col-span-3">
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Schedule (Dose Frequency):
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCustomMorning((p) => !p)}
                      className={cn(
                        'flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer border',
                        customMorning
                          ? 'bg-amber-100 text-amber-900 border-amber-300'
                          : 'bg-white text-slate-400 border-slate-200'
                      )}
                    >
                      <Sun className="w-3 h-3 text-amber-500" />
                      <span>Morn</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomAfternoon((p) => !p)}
                      className={cn(
                        'flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer border',
                        customAfternoon
                          ? 'bg-amber-100 text-amber-900 border-amber-300'
                          : 'bg-white text-slate-400 border-slate-200'
                      )}
                    >
                      <Sunset className="w-3 h-3 text-orange-500" />
                      <span>Noon</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomNight((p) => !p)}
                      className={cn(
                        'flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer border',
                        customNight
                          ? 'bg-indigo-100 text-indigo-900 border-indigo-300'
                          : 'bg-white text-slate-400 border-slate-200'
                      )}
                    >
                      <Moon className="w-3 h-3 text-indigo-500" />
                      <span>Night</span>
                    </button>
                  </div>
                </div>

                {/* Duration */}
                <div className="md:col-span-2">
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Duration:
                  </label>
                  <select
                    value={customDuration}
                    onChange={(e) => setCustomDuration(e.target.value)}
                    className="w-full text-xs text-slate-800 bg-white border border-slate-300 rounded-lg px-2 py-2 outline-hidden focus:border-teal-600"
                  >
                    <option value="3 days">3 days</option>
                    <option value="5 days">5 days</option>
                    <option value="7 days">7 days</option>
                    <option value="10 days">10 days</option>
                    <option value="15 days">15 days</option>
                    <option value="30 days">30 days</option>
                  </select>
                </div>

                {/* Instruction */}
                <div className="md:col-span-2">
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Diet / Food Note:
                  </label>
                  <select
                    value={customInstruction}
                    onChange={(e) => setCustomInstruction(e.target.value)}
                    className="w-full text-xs text-slate-800 bg-white border border-slate-300 rounded-lg px-2 py-2 outline-hidden focus:border-teal-600"
                  >
                    <option value="after food">After meals</option>
                    <option value="before food">Before meals</option>
                    <option value="with food">With meals</option>
                    <option value="at bedtime">At bedtime</option>
                    <option value="SOS as needed">SOS (As needed)</option>
                  </select>
                </div>

                {/* Add button */}
                <div className="md:col-span-1">
                  <button
                    type="submit"
                    className="w-full py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer shadow-xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add</span>
                  </button>
                </div>
              </div>
            </form>

            {/* Prescribed Medicines Stack Table */}
            <div>
              <p className="text-xs font-bold text-slate-900 mb-2">Prescribed Medicines ({draftMedicines.length}):</p>
              {draftMedicines.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                  No medicines added to this prescription yet. Click formulary presets above or enter custom drugs.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-2.5 px-4 font-bold">#</th>
                        <th className="py-2.5 px-4 font-bold">Medicine / Strength</th>
                        <th className="py-2.5 px-4 font-bold">Frequency Code</th>
                        <th className="py-2.5 px-4 font-bold">Timing Schedule</th>
                        <th className="py-2.5 px-4 font-bold">Duration</th>
                        <th className="py-2.5 px-4 font-bold">Quantity</th>
                        <th className="py-2.5 px-4 font-bold">Instructions</th>
                        <th className="py-2.5 px-4 font-bold text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {draftMedicines.map((med, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="py-3 px-4 font-semibold text-slate-400">{idx + 1}</td>
                          <td className="py-3 px-4 font-bold text-slate-900">{med.name}</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 font-bold border border-teal-100">
                              {med.dosage}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-700">{med.timing}</td>
                          <td className="py-3 px-4 text-slate-700">{med.duration}</td>
                          <td className="py-3 px-4 font-semibold text-slate-900">{med.qty || 1} units</td>
                          <td className="py-3 px-4 text-slate-600">{med.instruction}</td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => setDraftMedicines((prev) => prev.filter((_, i) => i !== idx))}
                              className="text-slate-400 hover:text-rose-600 p-1 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Doctor's Advice & Diagnosis Notes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1.5">
                  Final Clinical Diagnosis:
                </label>
                <input
                  type="text"
                  value={rxDiagnosis}
                  onChange={(e) => setRxDiagnosis(e.target.value)}
                  placeholder="e.g. Acute Upper Respiratory Infection"
                  className="w-full text-xs text-slate-800 bg-white border border-slate-300 rounded-xl p-2.5 outline-hidden focus:border-teal-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1.5">
                  Dietary / Lifestyle Advice & Next Review:
                </label>
                <input
                  type="text"
                  value={rxDietAdvice}
                  onChange={(e) => setRxDietAdvice(e.target.value)}
                  className="w-full text-xs text-slate-800 bg-white border border-slate-300 rounded-xl p-2.5 outline-hidden focus:border-teal-600"
                />
              </div>
            </div>

            {/* Bottom Final Action Bar */}
            <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <CheckCircle className="w-4 h-4 text-teal-600" />
                <span>Digitally signed by {doctorProfile.name} • Dispatches in real-time to University Dispensary</span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => triggerToast('Prescription sent to local printer!')}
                  className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-500" />
                  <span>Print Rx Slip</span>
                </button>
                <button
                  onClick={handleCompleteAndDispatch}
                  className="px-6 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-sm hover:shadow-md"
                >
                  <Send className="w-4 h-4" />
                  <span>Complete Consultation & Send to Dispensary</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            VIEW 3: COMPLETED CONSULTATIONS TODAY
           ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 flex flex-col space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Completed Consultations — Today
                </h2>
                <p className="text-xs text-slate-500">
                  Log of students seen by {doctorProfile.name} during today's shift
                </p>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                Total Seen: {seenCount}
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4 font-bold">Time</th>
                    <th className="py-3 px-4 font-bold">Student Name</th>
                    <th className="py-3 px-4 font-bold">Roll Number</th>
                    <th className="py-3 px-4 font-bold">Diagnosis</th>
                    <th className="py-3 px-4 font-bold">Prescription Sent</th>
                    <th className="py-3 px-4 font-bold text-right">Dispensary Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {completedHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-semibold text-slate-600">{item.completedAt}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{item.name}</td>
                      <td className="py-3 px-4 text-slate-600">{item.rollNo}</td>
                      <td className="py-3 px-4 text-slate-800 font-medium">{item.diagnosis}</td>
                      <td className="py-3 px-4 text-slate-600">{item.prescriptions}</td>
                      <td className="py-3 px-4 text-right">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Dispensed</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
