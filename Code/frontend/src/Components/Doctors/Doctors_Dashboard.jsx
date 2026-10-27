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
  RotateCcw,
  Copy,
  Info,
  Filter,
  AlertCircle,
  Download,
  SlidersHorizontal,
  ChevronRight,
  ShieldCheck,
  Layers,
  ClipboardList,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import {
  fetchDoctorProfile,
  fetchDoctorQueue,
  fetchDoctorStats,
  fetchActiveConsultation,
  fetchPatientSummary,
  fetchPatientHistory,
  callNextPatient,
  startConsultation,
  completeConsultation,
} from '../../api'
import { generatePrescriptionPdf } from '../../utils/prescriptionPdf'
import { cn } from '../../lib/utils'
import {
  MEDICINE_FORMULARY,
  FORMULARY_CATEGORIES,
  searchMedicineFormulary,
} from '../../data/medicineFormulary'
import {
  calculatePrescriptionQuantity,
  parseDosageSchedule,
  formatDosageCode,
  parseDurationInDays,
  checkDrugAllergyConflict,
  validatePrescriptionItem,
  validatePrescriptionDraft,
} from '../../utils/prescriptionCalculations'
import PrescriptionQuestionnaireModal from './PrescriptionQuestionnaireModal'

export default function Doctors_Dashboard() {
  const navigate = useNavigate()
  const { doctor, logout } = useAuth()
  const doctorId = doctor?.doctorId

  // Dashboard Tab state: 'queue' (Live Queue) | 'prescription' (E-Prescription Studio) | 'history' (Completed Consultations)
  const [activeTab, setActiveTab] = useState('queue')

  // Mobile / Tablet pane toggle when activeTab === 'queue': 'queue' | 'patient'
  const [mobileQueuePane, setMobileQueuePane] = useState('queue')

  // Immersive E-Prescription Questionnaire Modal state
  const [isPrescriptionModalOpen, setIsPrescriptionModalOpen] = useState(false)

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
  const [patients, setPatients] = useState([])
  const [selectedPatientId, setSelectedPatientId] = useState(null)
  const [queueLoading, setQueueLoading] = useState(true)
  const [queueError, setQueueError] = useState(null)
  const [isCallingNext, setIsCallingNext] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
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
    return patients.find((p) => p.id === selectedPatientId) || patients[0] || null
  }, [patients, selectedPatientId])

  // Automatically open questionnaire when prescription tab is focused with a selected student
  useEffect(() => {
    if (activeTab === 'prescription' && selectedPatient) {
      setIsPrescriptionModalOpen(true)
    }
  }, [activeTab, selectedPatient])

  // Real patient history state
  const [patientHistory, setPatientHistory] = useState([])
  useEffect(() => {
    if (selectedPatient?.rollNo) {
      fetchPatientHistory(selectedPatient.rollNo)
        .then((hist) => setPatientHistory(Array.isArray(hist) ? hist : []))
        .catch(() => setPatientHistory([]))
    } else {
      setPatientHistory([])
    }
  }, [selectedPatient?.rollNo])

  // Previous Prescriptions
  const previousPrescriptions = useMemo(() => {
    if (patientHistory && patientHistory.length > 0) {
      const past = []
      patientHistory.forEach((h) => {
        if (Array.isArray(h.medicines)) {
          h.medicines.forEach((m) => {
            past.push({
              name: m.name,
              dosage: m.timing || '1-0-1',
              timing: m.timing || 'As advised',
              duration: '3 days',
              instruction: m.note || 'after meals',
              date: h.date,
              diagnosis: h.diagnosis,
            })
          })
        }
      })
      return past
    }
    return []
  }, [patientHistory])

  // Distinct Draft Consultation State
  const [draftDiagnosis, setDraftDiagnosis] = useState('')
  const [draftClinicalNotes, setDraftClinicalNotes] = useState('')
  const [draftDietAdvice, setRxDietAdvice] = useState('Adequate hydration, warm saline gargles, avoid cold beverages.')
  const [draftFollowUp, setRxFollowUp] = useState('Review in 3 days if symptoms persist.')
  const [draftMedicines, setDraftMedicines] = useState([])

  // Finalization and submission state
  const [isFinalizing, setIsFinalizing] = useState(false)
  const [serverError, setServerError] = useState(null)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [finalizeSuccessData, setFinalizeSuccessData] = useState(null)

  // Formulary Catalog Browsing State
  const [formularySearch, setFormularySearch] = useState('')
  const [selectedFormularyCategory, setSelectedFormularyCategory] = useState('All')

  // Medication Adder Mode Tab: 'formulary' | 'custom'
  const [medAdderTab, setMedAdderTab] = useState('formulary')

  // Queue Filter Tab: 'all' | 'in_consultation' | 'waiting'
  const [queueFilter, setQueueFilter] = useState('all')

  // Completed History Search Filter
  const [historySearchQuery, setHistorySearchQuery] = useState('')

  // New Medicine Custom Form
  const [customMedName, setCustomMedName] = useState('')
  const [customMorning, setCustomMorning] = useState(true)
  const [customAfternoon, setCustomAfternoon] = useState(false)
  const [customNight, setCustomNight] = useState(true)
  const [customDuration, setCustomDuration] = useState('5 days')
  const [customInstruction, setCustomInstruction] = useState('after food')
  const [customManualQty, setCustomManualQty] = useState('')

  // Reset Draft function
  const resetPrescriptionDraft = () => {
    setDraftDiagnosis('')
    setDraftClinicalNotes('')
    setDraftMedicines([])
    setRxDietAdvice('Adequate hydration, warm saline gargles, avoid cold beverages.')
    setRxFollowUp('Review in 3 days if symptoms persist.')
    setCustomMedName('')
    setCustomMorning(true)
    setCustomAfternoon(false)
    setCustomNight(true)
    setCustomDuration('5 days')
    setCustomInstruction('after food')
    setCustomManualQty('')
    setServerError(null)
  }

  // Reset draft whenever selected patient changes
  useEffect(() => {
    resetPrescriptionDraft()
    setServerError(null)
    setFinalizeSuccessData(null)
  }, [selectedPatient?.visitId, selectedPatient?.rollNo, selectedPatient?.id])

  // Filtered formulary
  const filteredFormulary = useMemo(() => {
    return searchMedicineFormulary(formularySearch, selectedFormularyCategory)
  }, [formularySearch, selectedFormularyCategory])

  // Draft validation
  const draftValidation = useMemo(() => {
    return validatePrescriptionDraft({
      diagnosis: draftDiagnosis,
      complaint: selectedPatient?.complaint,
      clinicalNotes: draftClinicalNotes,
      medicines: draftMedicines,
      patientAllergies: selectedPatient?.allergies || [],
    })
  }, [draftDiagnosis, selectedPatient, draftClinicalNotes, draftMedicines])

  // Load backend data
  const loadBackendData = async (showLoading = true) => {
    if (!doctorId) {
      setQueueLoading(false)
      return
    }
    if (showLoading) {
      setIsRefreshing(true)
    }
    try {
      try {
        const prof = await fetchDoctorProfile(doctorId)
        if (prof) {
          setDoctorProfile((prev) => ({
            ...prev,
            name: prof.name || prev.name,
            specialization: prof.specialization || prev.specialization,
            shift: prof.shift && prof.shift !== 'Not set' ? prof.shift : prev.shift,
            email: prof.email || prev.email,
            room: prof.room || prev.room,
          }))
        }
      } catch {
        // quiet fallback
      }

      try {
        const stats = await fetchDoctorStats(doctorId)
        if (stats && typeof stats.seenToday === 'number') {
          setSeenCount(stats.seenToday)
        }
      } catch {
        // quiet fallback
      }

      const queueData = await fetchDoctorQueue(doctorId)

      let activeConsult = null
      try {
        activeConsult = await fetchActiveConsultation(doctorId)
      } catch {
        // quiet fallback
      }

      if (Array.isArray(queueData)) {
        if (queueData.length === 0) {
          setPatients([])
          setSelectedPatientId(null)
          setQueueError(null)
        } else {
          const mapped = await Promise.all(
            queueData.map(async (item, idx) => {
              let summary = { allergies: 'None recorded', conditions: 'None recorded' }
              const roll = item.rollNumber || item.roll_number
              if (roll) {
                try {
                  summary = await fetchPatientSummary(roll)
                } catch {
                  // fallback
                }
              }

              const initials = item.name
                ? item.name
                    .split(' ')
                    .map((w) => w[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()
                : 'ST'

              const rawStatus = (item.statusCode || item.status || '').toUpperCase()
              const isInConsultation =
                rawStatus === 'IN_CONSULTATION' ||
                (activeConsult?.active &&
                  (activeConsult.patient?.visitId === (item.visitId || item.visit_id) ||
                    activeConsult.patient?.rollNumber === roll))

              const status = isInConsultation
                ? 'In Consultation'
                : idx === 0 && !activeConsult?.active
                ? 'Next in Line'
                : 'Waiting'

              const statusBadge = isInConsultation
                ? 'bg-teal-50 text-teal-800 border-teal-200'
                : status === 'Next in Line'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'

              const allergiesList =
                summary.allergies && summary.allergies !== 'None recorded'
                  ? summary.allergies.split(',').map((s) => s.trim())
                  : ['None declared']

              return {
                id: item.queueEntryId || item.visitId || idx + 10,
                visitId: item.visitId || item.visit_id,
                queueEntryId: item.queueEntryId || item.queue_entry_id,
                queueNo: item.queueNo ?? item.queue_number ?? item.sequence ?? idx + 1,
                name: item.name || item.student_name,
                initials,
                rollNo: roll,
                age: item.age || 20,
                gender: 'Student',
                bloodGroup: item.bloodGroup || item.blood_group || 'B+',
                waitTime: item.waitingSince ? `${item.waitingSince}` : `${(idx + 1) * 6} min`,
                status,
                statusCode: isInConsultation ? 'IN_CONSULTATION' : 'WAITING',
                statusBadge,
                avatarBg: isInConsultation
                  ? 'bg-teal-700 text-white'
                  : idx === 1
                  ? 'bg-slate-700 text-white'
                  : idx === 2
                  ? 'bg-amber-700 text-white'
                  : 'bg-indigo-700 text-white',
                complaint:
                  item.complaint ||
                  (summary.conditions && summary.conditions !== 'None recorded'
                    ? summary.conditions
                    : 'OPD Health Evaluation'),
                history: `TIET Student. Roll: ${roll}. Blood Group: ${item.bloodGroup || 'B+'}, Age: ${item.age || 20}.`,
                allergies: allergiesList,
                prescriptions: [],
                vitals: { bp: '118/76', pulse: '72 bpm', temp: '98.4 °F', spo2: '99%' },
              }
            })
          )

          setPatients(mapped)
          setQueueError(null)

          setSelectedPatientId((currentId) => {
            if (currentId && mapped.some((p) => p.id === currentId)) return currentId
            const inConsult = mapped.find((p) => p.status === 'In Consultation')
            return inConsult ? inConsult.id : mapped[0]?.id || null
          })
        }
      }
    } catch (err) {
      console.warn('Backend sync failed:', err)
      setQueueError(err.detail || err.message || 'Failed to sync with doctor queue service')
    } finally {
      setIsRefreshing(false)
      setQueueLoading(false)
    }
  }

  // Live polling every 4 seconds
  useEffect(() => {
    loadBackendData(true)
    const timer = setInterval(() => {
      loadBackendData(false)
    }, 4000)
    return () => clearInterval(timer)
  }, [doctorId])

  // Filtered queue
  const filteredPatients = useMemo(() => {
    return patients.filter((p) => {
      const q = searchQuery.toLowerCase().trim()
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.rollNo && p.rollNo.toLowerCase().includes(q)) ||
        (p.complaint && p.complaint.toLowerCase().includes(q))
      if (!matchesSearch) return false

      if (queueFilter === 'in_consultation') {
        return p.status === 'In Consultation'
      }
      if (queueFilter === 'waiting') {
        return p.status === 'Waiting' || p.status === 'Next in Line'
      }
      return true
    })
  }, [patients, searchQuery, queueFilter])

  // Filtered completed history
  const filteredCompletedHistory = useMemo(() => {
    if (!historySearchQuery.trim()) return completedHistory
    const q = historySearchQuery.toLowerCase().trim()
    return completedHistory.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.rollNo && item.rollNo.toLowerCase().includes(q)) ||
        (item.diagnosis && item.diagnosis.toLowerCase().includes(q)) ||
        (item.prescriptions && item.prescriptions.toLowerCase().includes(q))
    )
  }, [completedHistory, historySearchQuery])

  // Navigation Items
  const navItems = useMemo(
    () => [
      {
        id: 0,
        key: 'queue',
        icon: <Activity className="w-4 h-4" />,
        label: 'Live OPD Queue',
        badge: filteredPatients.length,
        badgeClass: 'bg-teal-700 text-white',
        tooltip: 'Real-time Consultation Line & Clinical Chart',
      },
      {
        id: 1,
        key: 'prescription',
        icon: <Pill className="w-4 h-4" />,
        label: 'E-Prescription Studio',
        badge: draftMedicines.length > 0 ? draftMedicines.length : undefined,
        badgeClass: 'bg-emerald-600 text-white',
        tooltip: 'Hospital-Grade E-Prescription Desk',
      },
      {
        id: 2,
        key: 'history',
        icon: <FileCheck className="w-4 h-4" />,
        label: 'Completed Today',
        badge: seenCount,
        badgeClass: 'bg-slate-200 text-slate-700',
        tooltip: 'Attended Students Log',
      },
    ],
    [filteredPatients.length, draftMedicines.length, seenCount]
  )

  const triggerToast = (msg) => {
    setActionAlert(msg)
    setTimeout(() => setActionAlert(null), 3500)
  }

  // Call Next Student
  const handleCallNext = async () => {
    if (!doctorId) return
    setIsCallingNext(true)
    try {
      const res = await callNextPatient(doctorId)
      if (res && (res.name || res.rollNumber)) {
        triggerToast(`Called ${res.name || res.rollNumber} to Room ${doctorProfile.room} (Token #${res.queueNo ?? ''})`)
      } else {
        triggerToast(res?.message || 'Called next waiting student')
      }
      await loadBackendData(false)
      setActiveTab('queue')
    } catch (err) {
      const msg = err.detail || err.message || 'No waiting patients'
      if (err.status === 404 || msg.includes('404')) {
        triggerToast('No waiting students left in queue')
      } else if (err.status === 409 || msg.includes('already has an active consultation')) {
        triggerToast(' Consultation in progress. Complete before calling next.')
      } else {
        triggerToast(msg)
      }
    } finally {
      setIsCallingNext(false)
    }
  }

  // Start Consultation
  const handleStartConsultation = async (visitId) => {
    if (!doctorId || !visitId) return
    try {
      await startConsultation(doctorId, visitId)
      triggerToast('Consultation started')
      await loadBackendData(false)
    } catch (err) {
      triggerToast(err.detail || err.message || 'Could not start consultation')
    }
  }

  // Add Drug from Formulary
  const handleAddFormularyDrug = (drug) => {
    const allergyCheck = checkDrugAllergyConflict(drug, selectedPatient?.allergies || [])
    if (allergyCheck.hasConflict) {
      triggerToast(allergyCheck.warningMessage)
    }

    const calculatedQty = calculatePrescriptionQuantity(
      drug.defaultDosage,
      drug.defaultDuration,
      drug.category
    )

    const newEntry = {
      id: `${drug.id}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: drug.name,
      genericName: drug.genericName,
      category: drug.category,
      dosage: drug.defaultDosage,
      timing: drug.defaultTiming,
      duration: drug.defaultDuration,
      instruction: drug.defaultInstruction,
      qty: calculatedQty,
      unit: drug.unit || 'units',
      allergyClass: drug.allergyClass,
      hasAllergyWarning: allergyCheck.hasConflict,
      allergyWarningMessage: allergyCheck.warningMessage,
    }

    setDraftMedicines((prev) => [...prev, newEntry])
    if (!allergyCheck.hasConflict) {
      triggerToast(`Added ${drug.name} (${calculatedQty} ${drug.unit || 'units'})`)
    }
  }

  // Copy Previous Prescription into Current Draft
  const handleCopyPreviousPrescription = (prevMed) => {
    const allergyCheck = checkDrugAllergyConflict(prevMed, selectedPatient?.allergies || [])
    if (allergyCheck.hasConflict) {
      triggerToast(allergyCheck.warningMessage)
    }

    const calculatedQty =
      prevMed.qty ||
      calculatePrescriptionQuantity(prevMed.dosage, prevMed.duration || '5 days', 'Tablet')

    const copiedMed = {
      id: `copy-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: prevMed.name,
      genericName: prevMed.genericName || 'Past Prescription',
      category: prevMed.category || 'Tablet',
      dosage: prevMed.dosage,
      timing: prevMed.timing || 'As advised',
      duration: prevMed.duration || '5 days',
      instruction: prevMed.instruction || 'after meals',
      qty: calculatedQty,
      unit: prevMed.unit || 'units',
      allergyClass: prevMed.allergyClass || null,
      hasAllergyWarning: allergyCheck.hasConflict,
      allergyWarningMessage: allergyCheck.warningMessage,
    }

    setDraftMedicines((prev) => [...prev, copiedMed])
    triggerToast(`Copied ${prevMed.name} to prescription draft`)
  }

  // Add Custom Medication to Draft
  const handleAddCustomDrug = (e) => {
    e.preventDefault()
    if (!customMedName.trim()) {
      triggerToast(' Please enter a medicine name')
      return
    }

    const dosageCode = formatDosageCode(customMorning, customAfternoon, customNight)
    if (dosageCode === '0-0-0') {
      triggerToast(' Please select at least one dosage timing (Morning, Noon, or Night)')
      return
    }

    const timingDesc = [
      customMorning && 'Morning',
      customAfternoon && 'Afternoon',
      customNight && 'Night',
    ]
      .filter(Boolean)
      .join(' & ') || 'As advised'

    const autoQty = calculatePrescriptionQuantity(dosageCode, customDuration, 'Tablet')
    const finalQty =
      customManualQty && parseInt(customManualQty, 10) > 0
        ? parseInt(customManualQty, 10)
        : autoQty

    const allergyCheck = checkDrugAllergyConflict(customMedName.trim(), selectedPatient?.allergies || [])
    if (allergyCheck.hasConflict) {
      triggerToast(allergyCheck.warningMessage)
    }

    const newMed = {
      id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: customMedName.trim(),
      genericName: 'Custom OPD Rx',
      category: 'Tablet',
      dosage: dosageCode,
      timing: timingDesc,
      duration: customDuration,
      instruction: customInstruction.trim() || 'after food',
      qty: finalQty,
      unit: 'tablets',
      allergyClass: null,
      hasAllergyWarning: allergyCheck.hasConflict,
      allergyWarningMessage: allergyCheck.warningMessage,
    }

    setDraftMedicines((prev) => [...prev, newMed])
    setCustomMedName('')
    setCustomManualQty('')
    if (!allergyCheck.hasConflict) {
      triggerToast(`Added ${newMed.name} to prescription draft`)
    }
  }

  // Remove individual medicine from draft
  const handleRemoveDraftMedicine = (index) => {
    setDraftMedicines((prev) => {
      const removed = prev[index]
      const updated = prev.filter((_, i) => i !== index)
      if (removed) {
        triggerToast(`Removed ${removed.name} from draft`)
      }
      return updated
    })
  }

  // Change duration and recalculate quantity automatically
  const handleDurationChange = (index, newDuration) => {
    setDraftMedicines((prev) =>
      prev.map((med, i) => {
        if (i !== index) return med
        const newQty = calculatePrescriptionQuantity(med.dosage, newDuration, med.category)
        return {
          ...med,
          duration: newDuration,
          qty: newQty,
        }
      })
    )
  }

  // Edit quantity manually
  const handleManualQuantityChange = (index, newQtyStr) => {
    const parsed = parseInt(newQtyStr, 10)
    setDraftMedicines((prev) =>
      prev.map((med, i) => {
        if (i !== index) return med
        return {
          ...med,
          qty: isNaN(parsed) ? '' : Math.max(0, parsed),
        }
      })
    )
  }

  // Build payload strictly adhering to Phase 6 contract
  const buildFinalizePayload = (overrideData) => {
    const visitId = selectedPatient?.visitId
    const rollNumber = selectedPatient?.rollNo
    const diagnosis = (overrideData?.diagnosis || draftDiagnosis || '').trim()
    const reasonForVisit = selectedPatient?.complaint || 'General Consultation'
    const clinicalNotes = (overrideData?.clinicalNotes || draftClinicalNotes || '').trim() || `Chief Complaint: ${selectedPatient?.complaint || 'General evaluation'}`
    const dietAdvice = overrideData?.dietAdvice || draftDietAdvice
    const followUp = overrideData?.followUp || draftFollowUp
    const generalInstructions = [
      dietAdvice ? `Diet/Lifestyle: ${dietAdvice}` : '',
      followUp ? `Follow-up: ${followUp}` : '',
    ].filter(Boolean).join('\n') || 'Take medicines as prescribed.'

    const medsList = overrideData?.medicines || draftMedicines
    const medicines = medsList.map((m) => {
      const durParsed = parseDurationInDays(m.duration)
      const durationDays = durParsed && durParsed.days ? durParsed.days : 5

      const sched = parseDosageSchedule(m.dosage)
      const isMorning = sched.morning || Boolean(m.timing?.toLowerCase().includes('morning'))
      const isAfternoon = sched.afternoon || Boolean(m.timing?.toLowerCase().includes('afternoon') || m.timing?.toLowerCase().includes('noon'))
      const isNight = sched.night || Boolean(m.timing?.toLowerCase().includes('night'))
      const isEvening = Boolean(m.timing?.toLowerCase().includes('evening'))

      const lowerInst = (m.instruction || '').toLowerCase()
      let mealRelation = 'AFTER_MEAL'
      if (lowerInst.includes('before')) {
        mealRelation = 'BEFORE_MEAL'
      } else if (lowerInst.includes('with') || lowerInst.includes('during')) {
        mealRelation = 'WITH_MEAL'
      } else if (lowerInst.includes('empty')) {
        mealRelation = 'BEFORE_MEAL'
      } else if (lowerInst.includes('any')) {
        mealRelation = 'ANY_TIME'
      }

      const unit = m.unit || (m.category === 'Syrup' ? 'ml' : m.category === 'Capsule' ? 'capsule' : 'tablet')
      const doses = []
      if (isMorning) doses.push({ time_of_day: 'MORNING', dose_quantity: 1.0, dose_unit: unit })
      if (isAfternoon) doses.push({ time_of_day: 'AFTERNOON', dose_quantity: 1.0, dose_unit: unit })
      if (isEvening && !isNight) doses.push({ time_of_day: 'EVENING', dose_quantity: 1.0, dose_unit: unit })
      if (isNight) doses.push({ time_of_day: 'NIGHT', dose_quantity: 1.0, dose_unit: unit })
      if (doses.length === 0) doses.push({ time_of_day: 'MORNING', dose_quantity: 1.0, dose_unit: unit })

      return {
        name: m.name,
        medicine_name: m.name,
        strength: m.strength || null,
        dosage_form: m.category || 'Tablet',
        category: m.category || 'Tablet',
        route: m.category === 'Syrup' ? 'Oral' : m.category === 'Drops' ? 'Ophthalmic/Otic' : 'Oral',
        duration_value: durationDays,
        duration_unit: 'DAY',
        duration: m.duration || `${durationDays} days`,
        meal_relation: mealRelation,
        special_instructions: m.instruction ? `${m.instruction} for ${m.duration || `${durationDays} days`}` : 'As advised',
        morning: isMorning,
        afternoon: isAfternoon,
        evening: isEvening,
        night: isNight,
        dosage: m.dosage || '1-0-1',
        dose_quantity: m.qty ? parseFloat(m.qty) : 1.0,
        dose_unit: unit,
        doses,
      }
    })

    return {
      visit_id: visitId,
      roll_number: rollNumber,
      diagnosis,
      reason_for_visit: reasonForVisit,
      clinical_notes: clinicalNotes,
      general_instructions: generalInstructions,
      general: generalInstructions,
      medicines,
    }
  }

  // Open Prescription Review modal
  const handleOpenReview = () => {
    if (!selectedPatient) {
      triggerToast('Please select a patient first')
      return
    }
    if (!draftDiagnosis.trim()) {
      triggerToast('Please enter a clinical diagnosis before reviewing')
      setServerError('Clinical diagnosis is required before finalization.')
      return
    }
    if (draftMedicines.length === 0) {
      triggerToast('Please prescribe at least one medicine item')
      setServerError('At least one prescribed medicine item is required.')
      return
    }
    const hasInvalidQty = draftMedicines.some((m) => !m.qty || m.qty <= 0)
    if (hasInvalidQty) {
      triggerToast('Please ensure every prescribed medication has a positive quantity (> 0)')
      setServerError('Every prescribed medication must have a valid quantity (> 0).')
      return
    }
    setServerError(null)
    setShowReviewModal(true)
  }

  // Complete Consultation & Dispatch Rx
  const handleCompleteAndDispatch = async (questionnaireData) => {
    if (isFinalizing) return
    if (!selectedPatient) return

    const diagnosis = (questionnaireData?.diagnosis || draftDiagnosis || '').trim()
    const medicines = (questionnaireData?.medicines || draftMedicines || [])

    if (!diagnosis) {
      triggerToast('Please enter a clinical diagnosis before dispatching')
      setServerError('Clinical diagnosis is required.')
      return
    }

    if (medicines.length === 0) {
      triggerToast('Please prescribe at least one medicine item')
      setServerError('At least one prescribed medicine item is required.')
      return
    }

    const hasInvalidQty = medicines.some((m) => !m.qty || m.qty <= 0)
    if (hasInvalidQty) {
      triggerToast('Please ensure every prescribed medication has a positive quantity (> 0)')
      setServerError('Every prescribed medication must have a valid quantity (> 0).')
      return
    }

    if (draftValidation.hasAllergyConflicts && !questionnaireData) {
      const proceed = window.confirm(
        'CRITICAL WARNING: Known allergy conflicts were flagged for this student in the current draft. Do you wish to override and dispatch anyway?'
      )
      if (!proceed) return
    }

    setIsFinalizing(true)
    setServerError(null)

    try {
      const payload = buildFinalizePayload(questionnaireData)
      const res = await completeConsultation(doctorId, payload)

      let pdfDoc = null
      try {
        pdfDoc = generatePrescriptionPdf({
          prescription: res,
          doctor: doctorProfile,
          patient: selectedPatient,
          medicines: medicines,
          autoDownload: true,
        })
      } catch (pdfErr) {
        console.warn('PDF generation error:', pdfErr)
      }

      const savedRxId = res?.prescription_id || res?.prescriptionId || `RX-${Date.now().toString().slice(-4)}`
      const completedRecord = {
        prescriptionId: savedRxId,
        visitId: res?.visit_id || res?.visitId || selectedPatient.visitId,
        patientName: selectedPatient.name,
        rollNo: selectedPatient.rollNo,
        diagnosis: diagnosis,
        medicines: [...medicines],
        completedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        finalizedAt: res?.finalized_at || res?.finalizedAt || new Date().toISOString(),
        pdfDoc,
      }

      setFinalizeSuccessData(completedRecord)
      setIsPrescriptionModalOpen(false)
      setShowReviewModal(false)

      setSeenCount((prev) => prev + 1)
      setCompletedHistory((prev) => [
        {
          id: Date.now(),
          prescriptionId: savedRxId,
          name: selectedPatient.name,
          rollNo: selectedPatient.rollNo,
          completedAt: completedRecord.completedAt,
          diagnosis: diagnosis,
          prescriptions: medicines.map((m) => m.name).join(', ') || 'General Consultation',
          medicines: [...medicines],
          visitId: selectedPatient.visitId,
        },
        ...prev,
      ])

      triggerToast(`Prescription #${savedRxId} finalized and sent to Dispensary!`)
      resetPrescriptionDraft()
      await loadBackendData(false)
    } catch (err) {
      console.error('Finalization rejected by server:', err)
      const errorMsg =
        err.detail ||
        err.message ||
        'Server rejected prescription finalization. Check visit status and try again.'
      setServerError(errorMsg)
      triggerToast(errorMsg)
    } finally {
      setIsFinalizing(false)
    }
  }

  // Active student in consultation
  const activeStudentInConsultation = useMemo(() => {
    return patients.find((p) => p.status === 'In Consultation') || null
  }, [patients])

  return (
    <div className="min-h-screen bg-[#f1f5f5] text-slate-800 flex flex-col font-sans selection:bg-teal-600 selection:text-white">
      {/* ── TOP NAV BAR ── */}
      <header className="w-full bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-2xs sticky top-0 z-30">
        <div className="max-w-[1440px] xl:max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-3">
          {/* Left Branding */}
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-teal-700 to-teal-800 flex items-center justify-center text-white shadow-xs shrink-0">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900 tracking-tight">CampusCare</h1>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 font-semibold border border-teal-200/60 hidden sm:inline">
                  Doctor Workstation
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium hidden md:block">
                TIET Health Centre • Room {doctorProfile.room} • OPD Live
              </p>
            </div>
          </div>

          {/* Center Navigation Pill Bar */}
          <div className="relative">
            <div className="flex items-center gap-1.5 bg-slate-100/90 rounded-full p-1 border border-slate-200/60 shadow-inner">
              {navItems.map((item) => {
                const isActive = item.key === activeTab
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.key)}
                    className={cn(
                      'flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer select-none',
                      isActive
                        ? 'text-teal-950 font-bold bg-white shadow-2xs border border-teal-200/60'
                        : 'text-slate-600 hover:text-teal-800 hover:bg-white/40'
                    )}
                  >
                    <span className={cn('flex items-center', isActive ? 'text-teal-700' : 'text-slate-500')}>
                      {item.icon}
                    </span>
                    <span className="hidden sm:inline">{item.label}</span>
                    {item.badge !== undefined && (
                      <span
                        className={cn(
                          'text-[10px] px-2 py-0.2 rounded-full font-bold',
                          item.badgeClass
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Right Profile & Actions */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => loadBackendData(true)}
              title="Sync Queue"
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
            >
              <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin text-teal-600')} />
            </button>

            <div className="relative">
              <button
                onClick={() => setProfileDropdownOpen((prev) => !prev)}
                className="flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer select-none text-xs"
              >
                <div className="h-7 w-7 rounded-full bg-teal-700 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
                  NK
                </div>
                <div className="text-left hidden md:block leading-tight">
                  <p className="font-bold text-slate-900 text-xs">{doctorProfile.name}</p>
                  <p className="text-[10px] text-teal-700 font-medium">Room {doctorProfile.room}</p>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              <AnimatePresence>
                {profileDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.95 }}
                    className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl border border-slate-200 shadow-xl z-50 overflow-hidden text-xs"
                  >
                    <div className="p-3.5 bg-slate-50 border-b border-slate-100">
                      <p className="font-bold text-slate-900 text-sm">{doctorProfile.name}</p>
                      <p className="text-xs text-teal-800 font-semibold">{doctorProfile.specialization}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{doctorProfile.email}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-mono">Reg: {doctorProfile.regNo}</p>
                    </div>
                    <div className="p-2 space-y-1">
                      <div className="flex items-center justify-between px-2.5 py-1.5 text-slate-600">
                        <span>Room {doctorProfile.room}</span>
                        <span className="font-semibold text-slate-800">{doctorProfile.shift}</span>
                      </div>
                      <div className="flex items-center justify-between px-2.5 py-1.5 bg-teal-50/50 rounded-lg text-teal-900 font-medium">
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
        </div>
      </header>

      {/* Floating Action Toast Notification */}
      <AnimatePresence>
        {actionAlert && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full bg-slate-900/95 text-teal-200 border border-teal-500/40 text-xs font-semibold shadow-xl flex items-center gap-2 backdrop-blur-md max-w-md"
          >
            <Sparkles className="w-4 h-4 text-teal-400 shrink-0" />
            <span className="truncate">{actionAlert}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── COMFORTABLY ENLARGED MAIN WORKSPACE (MAX-WIDTH 1440PX) ── */}
      <main className="w-full max-w-[1440px] xl:max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex-1 flex flex-col space-y-4">
        
        {/* ═══════════════════════════════════════════════════════════
            VIEW 1: OPD CONSULTATION QUEUE & CLINICAL CHART
           ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'queue' && (
          <div className="space-y-4 flex-1 flex flex-col">
            
            {/* ── DOCTOR STATUS & SHIFT STRIP ── */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              {/* Doctor Info */}
              <div className="flex items-center gap-3.5">
                <div className="h-11 w-11 rounded-2xl bg-gradient-to-tr from-teal-700 to-emerald-600 text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-2xs">
                  NK
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-bold text-slate-900">
                      Welcome, {doctorProfile.name}
                    </h2>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 font-semibold border border-teal-200">
                      Room {doctorProfile.room}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
                      OPD Shift Active
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {doctorProfile.specialization} • Shift Hours: {doctorProfile.shift} • TIET Health Centre
                  </p>
                </div>
              </div>

              {/* Metrics & Call Next Action */}
              <div className="flex items-center gap-2.5 flex-wrap w-full lg:w-auto justify-between lg:justify-end">
                <div className="flex items-center gap-2">
                  <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-teal-500 animate-pulse" />
                    <span className="text-slate-500">In Line:</span>
                    <strong className="text-teal-900 font-bold">{patients.filter((p) => p.status !== 'In Consultation').length}</strong>
                  </div>

                  <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-teal-600" />
                    <span className="text-slate-500">Consulting:</span>
                    <strong className="text-slate-900 font-bold">
                      {activeStudentInConsultation ? activeStudentInConsultation.name.split(' ')[0] : 'None'}
                    </strong>
                  </div>

                  <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-slate-500">Seen Today:</span>
                    <strong className="text-emerald-700 font-bold">{seenCount}</strong>
                  </div>
                </div>

                <motion.button
                  whileHover={{ scale: isCallingNext ? 1 : 1.02 }}
                  whileTap={{ scale: isCallingNext ? 1 : 0.98 }}
                  onClick={handleCallNext}
                  disabled={isCallingNext}
                  className="px-4.5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer shadow-xs hover:shadow-md"
                >
                  <PhoneCall className={cn('w-4 h-4', isCallingNext && 'animate-spin')} />
                  <span>{isCallingNext ? 'Calling Student...' : 'Call Next Student'}</span>
                </motion.button>
              </div>
            </div>

            {/* Mobile / Tablet Segmented Tab Switcher (< lg screens) */}
            <div className="lg:hidden flex items-center bg-slate-200/70 p-1 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setMobileQueuePane('queue')}
                className={cn(
                  'flex-1 py-2 rounded-lg text-center transition-all cursor-pointer',
                  mobileQueuePane === 'queue'
                    ? 'bg-white text-teal-950 font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                Waiting Queue ({patients.length})
              </button>
              <button
                type="button"
                onClick={() => setMobileQueuePane('patient')}
                className={cn(
                  'flex-1 py-2 rounded-lg text-center transition-all cursor-pointer',
                  mobileQueuePane === 'patient'
                    ? 'bg-white text-teal-950 font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                Active Student {selectedPatient ? `(${selectedPatient.name.split(' ')[0]})` : ''}
              </button>
            </div>

            {/* ── 2-PANE WORKSPACE: QUEUE (SPAN 5) + PATIENT CLINICAL DESK (SPAN 7) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start flex-1">
              
              {/* ── PANE 1: TODAY'S CONSULTATION QUEUE (Span 5 on Desktop) ── */}
              <div
                className={cn(
                  'lg:col-span-5 bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col justify-between min-h-[580px]',
                  mobileQueuePane !== 'queue' && 'hidden lg:flex'
                )}
              >
                <div className="space-y-3.5">
                  {/* Queue Header & Search */}
                  <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm sm:text-base font-bold text-slate-900">
                        OPD Consultation Line
                      </h3>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span>Live</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs focus-within:border-teal-500 focus-within:bg-white transition-all w-40 sm:w-52">
                      <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search student / roll #..."
                        className="bg-transparent text-slate-800 text-xs outline-hidden placeholder:text-slate-400 w-full"
                      />
                    </div>
                  </div>

                  {/* Filter Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                    {[
                      { key: 'all', label: 'All Students', count: patients.length },
                      {
                        key: 'in_consultation',
                        label: 'In Consultation',
                        count: patients.filter((p) => p.status === 'In Consultation').length,
                      },
                      {
                        key: 'waiting',
                        label: 'Waiting Line',
                        count: patients.filter((p) => p.status === 'Waiting' || p.status === 'Next in Line').length,
                      },
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setQueueFilter(tab.key)}
                        className={cn(
                          'px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer border flex items-center gap-1.5',
                          queueFilter === tab.key
                            ? 'bg-teal-700 text-white border-teal-700 shadow-2xs'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        )}
                      >
                        <span>{tab.label}</span>
                        <span
                          className={cn(
                            'text-[10px] px-1.5 py-0.2 rounded-full font-bold',
                            queueFilter === tab.key ? 'bg-teal-800 text-teal-100' : 'bg-slate-200 text-slate-700'
                          )}
                        >
                          {tab.count}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Patient Rows */}
                  <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                    {queueLoading && patients.length === 0 ? (
                      <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
                        <RefreshCw className="w-6 h-6 text-teal-600 animate-spin" />
                        <p className="text-xs text-slate-500 font-medium">Syncing live queue from clinic server...</p>
                      </div>
                    ) : queueError && patients.length === 0 ? (
                      <div className="py-8 px-4 rounded-xl bg-rose-50 border border-rose-200 text-center space-y-2 text-xs">
                        <AlertCircle className="w-6 h-6 text-rose-600 mx-auto" />
                        <p className="font-semibold text-rose-900">Failed to load consultation queue</p>
                        <p className="text-[11px] text-rose-700">{queueError}</p>
                        <button
                          onClick={loadBackendData}
                          className="px-3 py-1.5 rounded-lg bg-rose-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Retry</span>
                        </button>
                      </div>
                    ) : filteredPatients.length === 0 ? (
                      <div className="text-center py-16 px-4 rounded-2xl bg-slate-50/70 border border-dashed border-slate-200 space-y-2">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        </div>
                        <p className="text-xs font-bold text-slate-700">No Students in Queue</p>
                        <p className="text-[11px] text-slate-400">
                          {patients.length === 0 ? 'Consultation line is clear. Call next when ready.' : 'No students matching filter.'}
                        </p>
                      </div>
                    ) : (
                      filteredPatients.map((patient, index) => {
                        const isSelected = patient.id === selectedPatientId
                        return (
                          <div
                            key={patient.id}
                            onClick={() => {
                              setSelectedPatientId(patient.id)
                              setMobileQueuePane('patient')
                            }}
                            className={cn(
                              'flex items-center justify-between p-3 rounded-xl text-xs sm:text-sm transition-all duration-150 cursor-pointer border',
                              isSelected
                                ? 'bg-teal-50/90 border-teal-500 shadow-2xs ring-1 ring-teal-500/20'
                                : 'bg-white hover:bg-slate-50/80 border-slate-200/80'
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-xs font-bold text-slate-400 w-4 text-center shrink-0">
                                #{index + 1}
                              </span>
                              <div
                                className={`h-8 w-8 rounded-full ${patient.avatarBg} font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs`}
                              >
                                {patient.initials}
                              </div>
                              <div className="min-w-0 truncate">
                                <div className="flex items-center gap-1.5">
                                  <p className="font-bold text-slate-900 text-xs sm:text-sm truncate leading-tight">
                                    {patient.name}
                                  </p>
                                  {isSelected && (
                                    <span className="text-[9px] px-1 py-0.2 rounded bg-teal-700 text-white font-semibold">
                                      Active
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                  {patient.rollNo} • {patient.complaint}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              <span className="text-[11px] text-slate-400 hidden sm:inline">
                                {patient.waitTime}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${patient.statusBadge}`}
                              >
                                {patient.status}
                              </span>
                              {(patient.status === 'Waiting' || patient.status === 'Next in Line') && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleStartConsultation(patient.visitId || patient.id)
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold text-[10px] cursor-pointer shadow-2xs"
                                >
                                  Attend
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

                {/* Queue Footer */}
                <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                  <span className="truncate">Active Student: <strong className="text-slate-800 font-semibold">{selectedPatient?.name || 'None'}</strong></span>
                  <button
                    onClick={handleCallNext}
                    disabled={isCallingNext}
                    className="text-teal-700 font-bold hover:underline cursor-pointer flex items-center gap-1 shrink-0"
                  >
                    <span>Call Next</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* ── PANE 2: ACTIVE PATIENT CLINICAL DESK (Span 7 on Desktop) ── */}
              <div
                className={cn(
                  'lg:col-span-7 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between min-h-[580px] space-y-4',
                  mobileQueuePane !== 'patient' && 'hidden lg:flex'
                )}
              >
                {!selectedPatient ? (
                  <div className="my-auto text-center py-20 px-4 space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center mx-auto text-teal-700">
                      <User className="w-6 h-6" />
                    </div>
                    <h3 className="text-base font-bold text-slate-800">No Student Selected</h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      Select a student from the consultation line on the left or click "Call Next Student" to open vitals, history, and write prescriptions.
                    </p>
                    <button
                      onClick={handleCallNext}
                      disabled={isCallingNext}
                      className="mt-2 px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
                    >
                      <PhoneCall className="w-3.5 h-3.5" />
                      <span>Call Next Student</span>
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      {/* Patient Banner */}
                      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`h-12 w-12 rounded-2xl ${selectedPatient.avatarBg} font-bold text-base flex items-center justify-center shrink-0 shadow-xs`}
                          >
                            {selectedPatient.initials}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-bold text-slate-900 text-base sm:text-lg truncate">
                                {selectedPatient.name}
                              </h3>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 font-semibold border border-teal-200">
                                {selectedPatient.status}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 truncate mt-0.5">
                              Roll No: <strong className="text-slate-800 font-semibold">{selectedPatient.rollNo}</strong> • Age: {selectedPatient.age} yrs • Blood Group: <strong className="text-teal-800">{selectedPatient.bloodGroup}</strong>
                            </p>
                          </div>
                        </div>

                        <span className="text-[11px] px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200 shrink-0 hidden sm:inline-flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>TIET Verified Student</span>
                        </span>
                      </div>

                      {/* 4 Vitals in a Spacious Confined Bar */}
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                          Baseline Clinical Vitals
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 text-center">
                          <div className="p-2 bg-white rounded-xl border border-slate-100 shadow-2xs">
                            <span className="text-slate-400 block text-[10px] font-medium">Blood Pressure</span>
                            <span className="font-bold text-slate-900 text-sm sm:text-base">{selectedPatient.vitals.bp}</span>
                          </div>
                          <div className="p-2 bg-white rounded-xl border border-slate-100 shadow-2xs">
                            <span className="text-slate-400 block text-[10px] font-medium">Pulse Rate</span>
                            <span className="font-bold text-slate-900 text-sm sm:text-base">{selectedPatient.vitals.pulse}</span>
                          </div>
                          <div className="p-2 bg-white rounded-xl border border-slate-100 shadow-2xs">
                            <span className="text-slate-400 block text-[10px] font-medium">SpO2 Oxygen</span>
                            <span className="font-bold text-slate-900 text-sm sm:text-base">{selectedPatient.vitals.spo2}</span>
                          </div>
                          <div className="p-2 bg-white rounded-xl border border-slate-100 shadow-2xs">
                            <span className="text-slate-400 block text-[10px] font-medium">Temperature</span>
                            <span className="font-bold text-slate-900 text-sm sm:text-base">{selectedPatient.vitals.temp}</span>
                          </div>
                        </div>
                      </div>

                      {/* Allergy Alert */}
                      {selectedPatient.allergies.some((a) => a !== 'None declared') ? (
                        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs sm:text-sm text-rose-900 flex items-start gap-2.5">
                          <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold block text-xs">ALLERGY WARNING:</span>
                            <span className="text-xs">Known allergic reaction to: <strong>{selectedPatient.allergies.join(', ')}</strong></span>
                          </div>
                        </div>
                      ) : (
                        <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/70 text-xs text-emerald-800 flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>No Known Drug Allergies (NKDA) reported on health file</span>
                        </div>
                      )}

                      {/* Triage Complaint */}
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                          Chief Complaint (Triage Intake)
                        </span>
                        <p className="text-xs sm:text-sm text-slate-900 bg-white p-2.5 rounded-lg border border-slate-200 font-medium leading-relaxed">
                          "{selectedPatient.complaint}"
                        </p>
                      </div>

                      {/* Past Prescriptions */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-600 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>Past Prescriptions on File ({previousPrescriptions.length})</span>
                          </span>
                          <span className="text-[10px] text-slate-400">Medical Record History</span>
                        </div>

                        {previousPrescriptions.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">No prior prescriptions recorded for this student.</p>
                        ) : (
                          <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                            {previousPrescriptions.map((rx, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                              >
                                <div className="truncate mr-2">
                                  <span className="font-bold text-slate-900 text-xs block truncate">{rx.name}</span>
                                  <span className="text-[11px] text-slate-500">{rx.dosage} • {rx.duration} ({rx.instruction})</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleCopyPreviousPrescription(rx)}
                                  className="px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 text-[10px] font-bold border border-teal-200 hover:bg-teal-100 cursor-pointer shrink-0"
                                >
                                  Copy to Rx
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Primary Prescription CTA */}
                    <div className="pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          setIsPrescriptionModalOpen(true)
                          setActiveTab('prescription')
                        }}
                        className="w-full py-3 px-4 rounded-xl bg-teal-800 hover:bg-teal-900 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-xs hover:shadow-md transition-all"
                      >
                        <Pill className="w-4 h-4 text-teal-200" />
                        <span>Write E-Prescription for {selectedPatient.name.split(' ')[0]}</span>
                        <ArrowRight className="w-4 h-4 text-teal-200" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            VIEW 2: IMMACULATELY ORGANIZED E-PRESCRIPTION STUDIO
           ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'prescription' && !selectedPatient && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-10 text-center space-y-3.5 max-w-md mx-auto my-10">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center mx-auto text-teal-700">
              <Pill className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-slate-800">No Student Selected</h2>
            <p className="text-xs text-slate-500">
              Select a student from the live consultation queue to open their prescription desk.
            </p>
            <button
              type="button"
              onClick={() => setActiveTab('queue')}
              className="px-4 py-2 rounded-xl bg-teal-700 text-white text-xs font-semibold cursor-pointer"
            >
              Return to Live Queue
            </button>
          </div>
        )}

        {activeTab === 'prescription' && selectedPatient && (
          <div className="space-y-4 flex-1 flex flex-col max-w-[1000px] mx-auto w-full py-8">
            <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm text-center space-y-5">
              <div className="w-16 h-16 rounded-3xl bg-teal-50 border border-teal-100 flex items-center justify-center mx-auto text-teal-800 shadow-xs">
                <Stethoscope className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-teal-800">
                  Active Consultation Session
                </span>
                <h2 className="text-xl font-bold text-slate-900">
                  E-Prescription Studio: {selectedPatient.name}
                </h2>
                <p className="text-xs text-slate-500">
                  Roll No: <strong className="text-slate-700 font-mono">{selectedPatient.rollNo}</strong> • Age: {selectedPatient.age} yrs • Blood Group: <strong className="text-teal-800">{selectedPatient.bloodGroup}</strong>
                </p>
              </div>

              {/* Vitals overview */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-w-lg mx-auto bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">Blood Pressure</span>
                  <span className="font-bold text-slate-800">{selectedPatient.vitals.bp}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Pulse Rate</span>
                  <span className="font-bold text-slate-800">{selectedPatient.vitals.pulse}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">SpO2</span>
                  <span className="font-bold text-slate-800">{selectedPatient.vitals.spo2}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Temperature</span>
                  <span className="font-bold text-slate-800">{selectedPatient.vitals.temp}</span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsPrescriptionModalOpen(true)}
                  className="px-6 py-3 rounded-xl bg-teal-800 hover:bg-teal-900 text-white text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer shadow-md"
                >
                  <Sparkles className="w-4 h-4 text-teal-200" />
                  <span>Launch Questionnaire Studio</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('queue')}
                  className="px-4 py-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Return to Live Queue
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            VIEW 3: COMPLETED CONSULTATIONS TODAY
           ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Completed Consultations — Today's Shift
                </h2>
                <p className="text-xs text-slate-400">
                  Attended students & dispensed prescriptions by {doctorProfile.name}
                </p>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={historySearchQuery}
                    onChange={(e) => setHistorySearchQuery(e.target.value)}
                    placeholder="Search records..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-hidden focus:border-teal-600"
                  />
                </div>
                <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-teal-50 text-teal-800 border border-teal-200 shrink-0">
                  Total Attended: {seenCount}
                </span>
              </div>
            </div>

            {filteredCompletedHistory.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No completed records matching query.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-xl text-xs sm:text-sm">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] font-bold">
                    <tr>
                      <th className="py-3 px-4">Time</th>
                      <th className="py-3 px-4">Student Name</th>
                      <th className="py-3 px-4">Roll No</th>
                      <th className="py-3 px-4">Diagnosis</th>
                      <th className="py-3 px-4">Prescription</th>
                      <th className="py-3 px-4 text-right">PDF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCompletedHistory.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 font-semibold text-slate-600">{item.completedAt}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{item.name}</td>
                        <td className="py-3 px-4 text-slate-600">{item.rollNo}</td>
                        <td className="py-3 px-4 text-slate-800">{item.diagnosis}</td>
                        <td className="py-3 px-4 text-slate-600 max-w-xs truncate">{item.prescriptions}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              generatePrescriptionPdf({
                                prescription: {
                                  prescription_id: item.prescriptionId || item.id,
                                  diagnosis: item.diagnosis,
                                },
                                doctor: doctorProfile,
                                patient: {
                                  name: item.name,
                                  rollNo: item.rollNo,
                                  visitId: item.visitId,
                                },
                                medicines: item.medicines || [],
                                autoDownload: true,
                              })
                            }
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-teal-50 text-slate-600 hover:text-teal-700 cursor-pointer"
                            title="Download PDF"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── IMMERSIVE E-PRESCRIPTION QUESTIONNAIRE MODAL ── */}
        <PrescriptionQuestionnaireModal
          isOpen={isPrescriptionModalOpen}
          onClose={() => {
            setIsPrescriptionModalOpen(false)
            if (activeTab === 'prescription') {
              setActiveTab('queue')
            }
          }}
          patient={selectedPatient}
          doctor={doctorProfile}
          onFinalizePrescription={handleCompleteAndDispatch}
          isFinalizing={isFinalizing}
        />

        {/* ── SUCCESS MODAL ── */}
        <AnimatePresence>
          {finalizeSuccessData && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 text-center space-y-3.5"
              >
                <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7" />
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Prescription Dispatched!
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Prescription #{finalizeSuccessData.prescriptionId} sent to Dispensary.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-left text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Student:</span>
                    <span className="font-bold text-slate-800">{finalizeSuccessData.patientName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Roll No:</span>
                    <span className="font-mono text-slate-800">{finalizeSuccessData.rollNo}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Diagnosis:</span>
                    <span className="font-semibold text-teal-800">{finalizeSuccessData.diagnosis}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      generatePrescriptionPdf({
                        prescription: {
                          prescription_id: finalizeSuccessData.prescriptionId,
                          diagnosis: finalizeSuccessData.diagnosis,
                        },
                        doctor: doctorProfile,
                        patient: {
                          name: finalizeSuccessData.patientName,
                          rollNo: finalizeSuccessData.rollNo,
                          visitId: finalizeSuccessData.visitId,
                        },
                        medicines: finalizeSuccessData.medicines,
                        autoDownload: true,
                      })
                    }
                    className="w-full py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Prescription PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFinalizeSuccessData(null)
                      setActiveTab('queue')
                    }}
                    className="w-full py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs cursor-pointer"
                  >
                    Back to Live Queue
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
