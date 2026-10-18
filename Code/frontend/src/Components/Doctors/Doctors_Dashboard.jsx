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
  CheckCircle2 as CheckSuccess,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import {
  fetchDoctorProfile,
  fetchDoctorQueue,
  fetchDoctorStats,
  fetchActiveConsultation,
  fetchPatientSummary,
  callNextPatient,
  startConsultation,
  completeConsultation,
} from '../../api'
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

  // Patient Queue (Strictly Authenticated Doctor Live OPD Queue)
  const [patients, setPatients] = useState([])
  const [selectedPatientId, setSelectedPatientId] = useState(null)
  const [queueLoading, setQueueLoading] = useState(true)
  const [queueError, setQueueError] = useState(null)
  const [isCallingNext, setIsCallingNext] = useState(false)
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
    return patients.find((p) => p.id === selectedPatientId) || patients[0] || null
  }, [patients, selectedPatientId])

  // Previous Prescriptions (strictly read-only past history from patient file)
  const previousPrescriptions = useMemo(() => {
    return selectedPatient?.prescriptions || []
  }, [selectedPatient])

  // Distinct Draft Consultation State (Cleanly separated from past records & chief complaint)
  const [draftDiagnosis, setDraftDiagnosis] = useState('')
  const [draftClinicalNotes, setDraftClinicalNotes] = useState('')
  const [draftDietAdvice, setRxDietAdvice] = useState('Adequate hydration, warm saline gargles, avoid cold beverages.')
  const [draftFollowUp, setRxFollowUp] = useState('Review in 3 days if symptoms persist.')
  const [draftMedicines, setDraftMedicines] = useState([])

  // Formulary Catalog Browsing State
  const [formularySearch, setFormularySearch] = useState('')
  const [selectedFormularyCategory, setSelectedFormularyCategory] = useState('All')

  // Medication Adder Mode Tab in Studio: 'formulary' | 'custom'
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

  // Reset Draft function (resets draft to fresh/empty state)
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
  }

  // Reset draft whenever selected patient changes
  useEffect(() => {
    resetPrescriptionDraft()
  }, [selectedPatient?.id])

  // Real-time formulary search filtering
  const filteredFormulary = useMemo(() => {
    return searchMedicineFormulary(formularySearch, selectedFormularyCategory)
  }, [formularySearch, selectedFormularyCategory])

  // Real-time draft validation check
  const draftValidation = useMemo(() => {
    return validatePrescriptionDraft({
      diagnosis: draftDiagnosis,
      complaint: selectedPatient?.complaint,
      clinicalNotes: draftClinicalNotes,
      medicines: draftMedicines,
      patientAllergies: selectedPatient?.allergies || [],
    })
  }, [draftDiagnosis, selectedPatient, draftClinicalNotes, draftMedicines])

  // Load real backend queue & stats strictly for authenticated doctor
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

      // 1. Fetch strictly authenticated doctor queue
      const queueData = await fetchDoctorQueue(doctorId)

      // 2. Fetch active consultation state
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
                ? 'bg-teal-50 text-teal-700 border-teal-200'
                : status === 'Next in Line'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'

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
                prescriptions: [
                  { name: 'Paracetamol 500mg', dosage: '1-0-1', timing: 'Morning & Night', duration: '3 days', instruction: 'after meals', qty: 6 },
                ],
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

  // Filtered queue with status tab support
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

  // LumaBar Navigation Items (Futuristic Top Bar with Healthcare Teal/Emerald Theme)
  const navItems = useMemo(
    () => [
      {
        id: 0,
        key: 'queue',
        icon: <Activity className="w-4 h-4" />,
        label: 'Live OPD Queue',
        badge: filteredPatients.length,
        badgeClass: 'bg-teal-700 text-white',
        tooltip: 'Real-time Consultation Line & Vitals',
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
        tooltip: 'Attended Students & Dispensed Medicines Log',
      },
    ],
    [filteredPatients.length, draftMedicines.length, seenCount]
  )

  const activeNavIndex = useMemo(() => {
    const idx = navItems.findIndex((item) => item.key === activeTab)
    return idx >= 0 ? idx : 0
  }, [navItems, activeTab])

  const triggerToast = (msg) => {
    setActionAlert(msg)
    setTimeout(() => setActionAlert(null), 3500)
  }

  // Call Next Student (calls POST /api/doctor/{doctor_id}/call-next)
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
        triggerToast('⚠️ Current consultation in progress. Complete before calling next.')
      } else {
        triggerToast(msg)
      }
    } finally {
      setIsCallingNext(false)
    }
  }

  // Start Consultation for a specific visit (POST /api/doctor/{doctor_id}/start-consultation/{visit_id})
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

  // Add Drug from University Formulary Catalog
  const handleAddFormularyDrug = (drug) => {
    const allergyCheck = checkDrugAllergyConflict(drug, selectedPatient.allergies)
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
      triggerToast(`Added ${drug.name} (${calculatedQty} ${drug.unit || 'units'}) to draft`)
    }
  }

  // Copy Previous Prescription into Current Draft
  const handleCopyPreviousPrescription = (prevMed) => {
    const allergyCheck = checkDrugAllergyConflict(prevMed, selectedPatient.allergies)
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
    triggerToast(`Copied ${prevMed.name} to new draft prescription`)
  }

  // Add Custom Medication to Draft
  const handleAddCustomDrug = (e) => {
    e.preventDefault()
    if (!customMedName.trim()) {
      triggerToast('⚠️ Please enter a medicine name')
      return
    }

    const dosageCode = formatDosageCode(customMorning, customAfternoon, customNight)
    if (dosageCode === '0-0-0') {
      triggerToast('⚠️ Please select at least one dosage timing (Morning, Noon, or Night)')
      return
    }

    const timingDesc = [
      customMorning && 'Morning',
      customAfternoon && 'Afternoon',
      customNight && 'Night',
    ]
      .filter(Boolean)
      .join(' & ') || 'As advised'

    // Automatically calculate suggested quantity based on dose schedule & duration
    const autoQty = calculatePrescriptionQuantity(dosageCode, customDuration, 'Tablet')
    const finalQty =
      customManualQty && parseInt(customManualQty, 10) > 0
        ? parseInt(customManualQty, 10)
        : autoQty

    const allergyCheck = checkDrugAllergyConflict(customMedName.trim(), selectedPatient.allergies)
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

  // Complete Consultation & Dispatch Rx
  const handleCompleteAndDispatch = async () => {
    if (!selectedPatient) return

    if (!draftDiagnosis.trim()) {
      triggerToast('⚠️ Please enter a clinical diagnosis before dispatching')
      return
    }

    if (draftMedicines.length === 0) {
      triggerToast('⚠️ Please prescribe at least one medicine or record prescription items')
      return
    }

    const hasInvalidQty = draftMedicines.some((m) => !m.qty || m.qty <= 0)
    if (hasInvalidQty) {
      triggerToast('⚠️ Please ensure every prescribed medication has a positive quantity (> 0)')
      return
    }

    if (draftValidation.hasAllergyConflicts) {
      const proceed = window.confirm(
        '⚠️ CRITICAL WARNING: Known allergy conflicts were flagged for this student in the current draft. Do you wish to override and dispatch anyway?'
      )
      if (!proceed) return
    }

    if (doctorId && selectedPatient) {
      try {
        await completeConsultation(doctorId, {
          roll_number: selectedPatient.rollNo,
          diagnosis: draftDiagnosis,
          general: draftClinicalNotes || draftDietAdvice || 'General advice',
          clinical_notes: draftClinicalNotes || `Chief Complaint: ${selectedPatient.complaint}`,
          medicines: draftMedicines.map((m) => ({
            name: m.name,
            dosage: m.dosage,
            instructions: `${m.instruction} for ${m.duration} (Qty: ${m.qty})`,
            note: m.instruction,
            morning: m.timing?.toLowerCase().includes('morning') || false,
            afternoon: m.timing?.toLowerCase().includes('afternoon') || false,
            evening: m.timing?.toLowerCase().includes('evening') || false,
            night: m.timing?.toLowerCase().includes('night') || false,
          })),
        })
      } catch (err) {
        console.warn('Backend complete consultation status:', err)
      }
    }

    // Update local completed metrics & history
    setSeenCount((prev) => prev + 1)
    setCompletedHistory((prev) => [
      {
        id: Date.now(),
        name: selectedPatient.name,
        rollNo: selectedPatient.rollNo,
        completedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        diagnosis: draftDiagnosis,
        prescriptions: draftMedicines.map((m) => m.name).join(', ') || 'General Consultation',
      },
      ...prev,
    ])

    triggerToast(`Prescription dispatched to Campus Dispensary!`)
    resetPrescriptionDraft()
    await loadBackendData(false)
    setActiveTab('queue')
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

        {/* Center: Futuristic LumaBar Navigation (Top-Docked, Healthcare Teal/Emerald Glow - Zero Purple) */}
        <div className="relative">
          <div className="relative flex items-center justify-center gap-1 sm:gap-2.5 bg-white/75 backdrop-blur-2xl rounded-full px-2.5 sm:px-4 py-1.5 shadow-lg shadow-teal-950/5 border border-teal-100/80 overflow-hidden">
            {/* Active Indicator Glow - Teal/Emerald Healthcare Palette */}
            <motion.div
              layoutId="luma-active-glow"
              className="absolute w-24 h-24 bg-gradient-to-r from-teal-400 via-emerald-400 to-teal-500 rounded-full blur-2xl -z-10 opacity-75 pointer-events-none"
              animate={{
                left: `calc(${activeNavIndex * (100 / navItems.length)}% + ${100 / navItems.length / 2}%)`,
                translateX: '-50%',
              }}
              transition={{ type: 'spring', stiffness: 450, damping: 28 }}
            />

            {navItems.map((item, index) => {
              const isActive = index === activeNavIndex
              return (
                <motion.div key={item.id} className="relative flex flex-col items-center group">
                  {/* Button */}
                  <motion.button
                    onClick={() => setActiveTab(item.key)}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.95 }}
                    className={cn(
                      'relative z-10 flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-xs font-semibold transition-colors duration-200 cursor-pointer select-none',
                      isActive
                        ? 'text-teal-950 font-bold'
                        : 'text-slate-600 hover:text-teal-700'
                    )}
                  >
                    {/* Active Pill backdrop */}
                    {isActive && (
                      <motion.div
                        layoutId="luma-pill-active"
                        className="absolute inset-0 bg-white/95 rounded-full shadow-xs -z-10 border border-teal-200/60"
                        transition={{ type: 'spring', stiffness: 450, damping: 30 }}
                      />
                    )}

                    <motion.span
                      animate={{ scale: isActive ? 1.2 : 1 }}
                      transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                      className={cn(
                        'flex items-center',
                        isActive ? 'text-teal-700' : 'text-slate-500 group-hover:text-teal-600'
                      )}
                    >
                      {item.icon}
                    </motion.span>
                    <span className="hidden md:inline">{item.label}</span>
                    {item.badge !== undefined && (
                      <span
                        className={cn(
                          'text-[10px] px-1.5 py-0.2 rounded-full font-bold',
                          item.badgeClass
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                  </motion.button>

                  {/* Tooltip (Positioned below the top navbar) */}
                  <span className="absolute top-full mt-2.5 px-2.5 py-1 text-xs rounded-md bg-slate-900 text-teal-200 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl border border-teal-500/25 pointer-events-none z-50">
                    {item.tooltip}
                  </span>
                </motion.div>
              )
            })}
          </div>
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
                  whileHover={{ scale: isCallingNext ? 1 : 1.02 }}
                  whileTap={{ scale: isCallingNext ? 1 : 0.98 }}
                  onClick={handleCallNext}
                  disabled={isCallingNext}
                  className="w-full py-3 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm hover:shadow-md"
                >
                  <PhoneCall className={cn('w-4 h-4', isCallingNext && 'animate-spin')} />
                  <span>{isCallingNext ? 'Calling Student...' : 'Call Next Student'}</span>
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

                {/* Queue Filter Tabs */}
                <div className="flex items-center gap-1.5 mb-3.5 overflow-x-auto pb-0.5">
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
                        'px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer border flex items-center gap-1.5',
                        queueFilter === tab.key
                          ? 'bg-teal-700 text-white border-teal-700 shadow-2xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      )}
                    >
                      <span>{tab.label}</span>
                      <span
                        className={cn(
                          'text-[9px] px-1.5 py-0.2 rounded-full font-bold',
                          queueFilter === tab.key
                            ? 'bg-teal-800 text-teal-100'
                            : 'bg-slate-200 text-slate-700'
                        )}
                      >
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Patient Rows */}
                <div className="space-y-2.5">
                  {queueLoading && patients.length === 0 ? (
                    <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                      <RefreshCw className="w-6 h-6 text-teal-600 animate-spin" />
                      <p className="text-xs text-slate-500 font-medium">Syncing live queue from clinic server...</p>
                    </div>
                  ) : queueError && patients.length === 0 ? (
                    <div className="py-8 px-4 rounded-xl bg-rose-50 border border-rose-200 text-center space-y-2">
                      <AlertCircle className="w-6 h-6 text-rose-600 mx-auto" />
                      <p className="text-xs font-semibold text-rose-900">Failed to load consultation queue</p>
                      <p className="text-[11px] text-rose-700">{queueError}</p>
                      <button
                        onClick={loadBackendData}
                        className="mt-2 px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Retry Connection</span>
                      </button>
                    </div>
                  ) : filteredPatients.length === 0 ? (
                    <div className="text-center py-12 px-4 rounded-xl bg-slate-50/60 border border-dashed border-slate-200 space-y-2">
                      <Stethoscope className="w-7 h-7 text-slate-300 mx-auto" />
                      <p className="text-xs font-semibold text-slate-700">OPD Consultation Line Clear</p>
                      <p className="text-[11px] text-slate-400">
                        {patients.length === 0
                          ? 'No students currently waiting for consultation.'
                          : 'No students matching the current category filter.'}
                      </p>
                      <button
                        onClick={loadBackendData}
                        className="mt-2 px-3 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                      >
                        <RefreshCw className="w-3 h-3 text-slate-400" />
                        <span>Refresh Queue</span>
                      </button>
                    </div>
                  ) : (
                    filteredPatients.map((patient, index) => {
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
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-bold text-slate-400 w-4 text-center">
                              #{index + 1}
                            </span>
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

                          <div className="flex items-center gap-2.5">
                            <span className="text-xs text-slate-500 font-medium">
                              {patient.waitTime}
                            </span>
                            <span
                              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${patient.statusBadge}`}
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
                                className="px-2.5 py-1 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold text-[11px] transition-colors cursor-pointer shadow-2xs"
                                title="Start consultation with this student"
                              >
                                Attend
                              </button>
                            )}
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
                  {selectedPatient ? (
                    <>
                      Active student:{' '}
                      <strong className="text-slate-800 font-semibold">{selectedPatient.name}</strong> (Roll: {selectedPatient.rollNo})
                    </>
                  ) : (
                    <span>No student actively selected</span>
                  )}
                </span>
                <button
                  onClick={handleCallNext}
                  disabled={isCallingNext}
                  className="text-teal-700 font-bold hover:underline cursor-pointer flex items-center gap-1 disabled:opacity-50"
                >
                  <span>Call Next</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* ── COL 3: PATIENT CLINICAL CHART & QUICK RX (Span 4) ── */}
            <div className="lg:col-span-4 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between min-h-[580px]">
              {!selectedPatient ? (
                <div className="my-auto text-center py-12 px-4 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center mx-auto text-teal-700">
                    <User className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">No Student Selected</h3>
                    <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1">
                      Select a student from the consultation line or call the next student to view vitals, allergies, and issue digital prescriptions.
                    </p>
                  </div>
                  <button
                    onClick={handleCallNext}
                    disabled={isCallingNext}
                    className="mt-2 px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                    <span>Call Next Student</span>
                  </button>
                </div>
              ) : (
                <>
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
                          <span>Previous Prescriptions ({selectedPatient.prescriptions?.length || 0})</span>
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
                </>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            VIEW 2: E-PRESCRIPTION STUDIO (CLEAN 2-PANE CLINICAL WORKSTATION)
           ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'prescription' && !selectedPatient && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-12 text-center space-y-4 max-w-md mx-auto my-12">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center mx-auto text-teal-700">
              <Pill className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-slate-800">No Student Selected for Prescription</h2>
            <p className="text-xs text-slate-500">
              Please select a student from the live consultation queue or call the next student to open their clinical workstation and draft prescriptions.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setActiveTab('queue')}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                Return to Live Queue
              </button>
              <button
                type="button"
                onClick={handleCallNext}
                disabled={isCallingNext}
                className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>Call Next</span>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'prescription' && selectedPatient && (
          <div className="space-y-5">
              {/* ── TOP ACTION & PATIENT CONTEXT STRIP ── */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="h-11 w-11 rounded-xl bg-teal-700 text-white flex items-center justify-center text-xl font-bold shadow-xs shrink-0">
                    ℞
                  </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-bold text-slate-900 tracking-tight">
                      CampusCare E-Prescription Desk
                    </h2>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 font-semibold border border-teal-200">
                      Draft Editor
                    </span>
                    <span className="text-xs px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-medium">
                      Student: <strong className="text-slate-900 font-bold">{selectedPatient.name}</strong> ({selectedPatient.rollNo})
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    TIET Health Centre • Room {doctorProfile.room} • {doctorProfile.name} ({doctorProfile.regNo})
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setActiveTab('queue')}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                >
                  ← Back to OPD Queue
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (draftMedicines.length > 0 || draftDiagnosis.trim() || draftClinicalNotes.trim()) {
                      if (window.confirm('Reset this consultation draft back to blank? All unsaved draft medicines will be cleared.')) {
                        resetPrescriptionDraft()
                        triggerToast('Prescription draft has been reset')
                      }
                    } else {
                      resetPrescriptionDraft()
                      triggerToast('Draft is already clear')
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl border border-amber-200 hover:bg-amber-50 text-amber-800 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Clear all draft medicines and diagnostic notes"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                  <span>Reset Draft</span>
                </button>
                <button
                  type="button"
                  onClick={handleCompleteAndDispatch}
                  className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Complete & Dispatch Rx</span>
                </button>
              </div>
            </div>

            {/* ── 2-COLUMN WORKSTATION GRID ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* ── LEFT PANEL: PATIENT CLINICAL CONTEXT & ASSESSMENT (Span 5) ── */}
              <div className="lg:col-span-5 space-y-4">
                {/* 1. Demographics & Vitals Card */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Patient Details & Vitals
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                      {selectedPatient.gender} • {selectedPatient.age} yrs • Blood: {selectedPatient.bloodGroup}
                    </span>
                  </div>

                  {/* 4 Vitals Badges */}
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-medium">BP</span>
                      <span className="font-bold text-slate-900">{selectedPatient.vitals.bp}</span>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-medium">Pulse</span>
                      <span className="font-bold text-slate-900">{selectedPatient.vitals.pulse}</span>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-medium">SpO2</span>
                      <span className="font-bold text-slate-900">{selectedPatient.vitals.spo2}</span>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-medium">Temp</span>
                      <span className="font-bold text-slate-900">{selectedPatient.vitals.temp}</span>
                    </div>
                  </div>

                  {/* Allergy Alert Pill if present */}
                  {selectedPatient.allergies.some((a) => a !== 'None declared') && (
                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200/80 flex items-start gap-2 text-xs text-rose-800">
                      <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block text-rose-900 text-[11px]">ALLERGY WARNING:</span>
                        <span className="text-[11px]">Known sensitivity to: {selectedPatient.allergies.join(', ')}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Chief Complaint & Clinical Assessment Card */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-3.5">
                  {/* Intake Complaint (Read-only) */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-teal-800 flex items-center gap-1">
                        <FileText className="w-3 h-3 text-teal-600" />
                        <span>Chief Complaint (Triage Intake):</span>
                      </label>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-teal-50 text-teal-700 font-semibold">
                        Read-Only
                      </span>
                    </div>
                    <p className="text-xs text-slate-800 bg-teal-50/40 p-2.5 rounded-xl border border-teal-100 leading-relaxed font-medium">
                      "{selectedPatient.complaint}"
                    </p>
                  </div>

                  {/* Doctor's Final Diagnosis (Required) */}
                  <div>
                    <label className="text-xs font-bold text-slate-900 block mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <span>Doctor's Clinical Diagnosis:</span>
                        <span className="text-rose-500 font-bold">*</span>
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        Doctor Assessment
                      </span>
                    </label>
                    <input
                      type="text"
                      value={draftDiagnosis}
                      onChange={(e) => setDraftDiagnosis(e.target.value)}
                      placeholder="e.g. Acute Allergic Bronchitis, Sprain Grade 1..."
                      className="w-full text-xs text-slate-800 bg-white border border-slate-300 rounded-xl p-2.5 outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600 transition-all font-medium"
                    />

                    {/* Quick Diagnostic Suggestions */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="text-[10px] text-slate-400 font-semibold">Suggestions:</span>
                      {[
                        'Viral URI & Cough',
                        'Allergic Rhinitis',
                        'Acute Gastritis',
                        'Tension Headache',
                        'Ligament Sprain',
                        'Pharyngitis',
                      ].map((sug, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setDraftDiagnosis(sug)}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 hover:bg-teal-50 hover:text-teal-800 text-slate-600 border border-slate-200 transition-colors cursor-pointer"
                        >
                          + {sug}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Examination Notes */}
                  <div>
                    <label className="text-xs font-bold text-slate-900 block mb-1">
                      Objective Examination / Clinical Notes:
                    </label>
                    <textarea
                      rows={2}
                      value={draftClinicalNotes}
                      onChange={(e) => setDraftClinicalNotes(e.target.value)}
                      placeholder="e.g. Chest clear b/l, throat erythema, vitals stable, afebrile..."
                      className="w-full text-xs text-slate-800 bg-white border border-slate-300 rounded-xl p-2 outline-hidden focus:border-teal-600 focus:ring-1 focus:ring-teal-600 transition-all"
                    />
                  </div>
                </div>

                {/* 3. Previous Prescriptions Reference Card */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-2.5">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>Previous Prescriptions ({previousPrescriptions.length})</span>
                      </span>
                      <p className="text-[10px] text-slate-400">Past medication history on file</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                      Medical File
                    </span>
                  </div>

                  {previousPrescriptions.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-2">
                      No prior prescriptions recorded.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {previousPrescriptions.map((rx, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 rounded-xl bg-slate-50/70 border border-slate-200 text-xs hover:border-teal-200 transition-colors"
                        >
                          <div>
                            <span className="font-bold text-slate-900 block">{rx.name}</span>
                            <span className="text-[10px] text-slate-500">
                              {rx.dosage} • {rx.duration} • {rx.instruction}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopyPreviousPrescription(rx)}
                            className="px-2 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 text-[10px] font-bold flex items-center gap-1 border border-teal-200 transition-colors cursor-pointer"
                            title="Re-prescribe into draft"
                          >
                            <Copy className="w-3 h-3 text-teal-600" />
                            <span>Copy</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 4. Lifestyle & Follow-Up Advice */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block pb-1 border-b border-slate-100">
                    Patient Instructions & Follow-Up
                  </span>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Dietary & Lifestyle Advice:
                    </label>
                    <input
                      type="text"
                      value={draftDietAdvice}
                      onChange={(e) => setRxDietAdvice(e.target.value)}
                      placeholder="e.g. Warm fluids, saline gargles..."
                      className="w-full text-xs text-slate-800 bg-white border border-slate-300 rounded-lg p-2 outline-hidden focus:border-teal-600"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Next Review / Follow-Up Schedule:
                    </label>
                    <input
                      type="text"
                      value={draftFollowUp}
                      onChange={(e) => setRxFollowUp(e.target.value)}
                      placeholder="e.g. Review in 3 days if symptoms persist..."
                      className="w-full text-xs text-slate-800 bg-white border border-slate-300 rounded-lg p-2 outline-hidden focus:border-teal-600"
                    />
                  </div>
                </div>
              </div>

              {/* ── RIGHT PANEL: PRESCRIPTION DRAFTING DESK (Span 7) ── */}
              <div className="lg:col-span-7 space-y-4">
                {/* 1. Medication Adder Card (Segmented Tab: Formulary vs Custom) */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-3">
                  {/* Mode Switcher Tabs */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setMedAdderTab('formulary')}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5',
                          medAdderTab === 'formulary'
                            ? 'bg-white text-teal-900 shadow-2xs'
                            : 'text-slate-500 hover:text-slate-900'
                        )}
                      >
                        <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                        <span>Formulary Catalog ({filteredFormulary.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMedAdderTab('custom')}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5',
                          medAdderTab === 'custom'
                            ? 'bg-white text-teal-900 shadow-2xs'
                            : 'text-slate-500 hover:text-slate-900'
                        )}
                      >
                        <Plus className="w-3.5 h-3.5 text-teal-600" />
                        <span>Custom Medication</span>
                      </button>
                    </div>

                    <span className="text-[10px] text-slate-400 hidden sm:inline">
                      Auto-quantity calculation active
                    </span>
                  </div>

                  {/* TAB 1: FORMULARY CATALOG */}
                  {medAdderTab === 'formulary' && (
                    <div className="space-y-3">
                      {/* Search Bar + Category Chips */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                        <div className="relative flex-1">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={formularySearch}
                            onChange={(e) => setFormularySearch(e.target.value)}
                            placeholder="Search medicine, salt, or indication..."
                            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-hidden focus:border-teal-600 focus:bg-white transition-all"
                          />
                        </div>

                        {/* Category Filter Pills */}
                        <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs">
                          {FORMULARY_CATEGORIES.map((cat) => (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setSelectedFormularyCategory(cat)}
                              className={cn(
                                'px-2 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition-colors cursor-pointer border',
                                selectedFormularyCategory === cat
                                  ? 'bg-teal-700 text-white border-teal-700'
                                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                              )}
                            >
                              {cat}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Compact Formulary List */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                        {filteredFormulary.map((drug) => {
                          const conflict = checkDrugAllergyConflict(drug, selectedPatient.allergies)
                          return (
                            <div
                              key={drug.id}
                              className={cn(
                                'p-2.5 rounded-xl border bg-white flex items-center justify-between gap-2 text-xs transition-all shadow-2xs hover:shadow-xs',
                                conflict.hasConflict
                                  ? 'border-rose-300 bg-rose-50/40 ring-1 ring-rose-200'
                                  : 'border-slate-200/90 hover:border-teal-300'
                              )}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-slate-900 truncate">
                                    {drug.name}
                                  </span>
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-semibold shrink-0">
                                    {drug.category}
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                                  {drug.defaultDosage} • {drug.defaultDuration} • {drug.defaultInstruction}
                                </p>
                                {conflict.hasConflict && (
                                  <span className="text-[9px] text-rose-700 font-bold block mt-0.5">
                                    ⚠️ Allergy Flag: {conflict.allergen}
                                  </span>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => handleAddFormularyDrug(drug)}
                                className={cn(
                                  'px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 shrink-0 transition-colors cursor-pointer',
                                  conflict.hasConflict
                                    ? 'bg-rose-100 hover:bg-rose-200 text-rose-900'
                                    : 'bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200'
                                )}
                              >
                                <Plus className="w-3 h-3" />
                                <span>Add</span>
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* TAB 2: CUSTOM MEDICATION ADDER */}
                  {medAdderTab === 'custom' && (
                    <form onSubmit={handleAddCustomDrug} className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                        {/* Drug Name */}
                        <div className="sm:col-span-5">
                          <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                            Medicine Name & Strength:
                          </label>
                          <input
                            type="text"
                            value={customMedName}
                            onChange={(e) => setCustomMedName(e.target.value)}
                            placeholder="e.g. Montelukast 10mg..."
                            className="w-full text-xs text-slate-800 bg-white border border-slate-300 rounded-lg px-2.5 py-2 outline-hidden focus:border-teal-600"
                          />
                        </div>

                        {/* Frequency Schedule Checkboxes */}
                        <div className="sm:col-span-4">
                          <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                            Frequency Schedule:
                          </label>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setCustomMorning((p) => !p)}
                              className={cn(
                                'flex-1 py-1 px-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer border',
                                customMorning
                                  ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold'
                                  : 'bg-white text-slate-400 border-slate-200'
                              )}
                            >
                              <Sun className="w-3 h-3 text-amber-500" />
                              <span>M</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setCustomAfternoon((p) => !p)}
                              className={cn(
                                'flex-1 py-1 px-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer border',
                                customAfternoon
                                  ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold'
                                  : 'bg-white text-slate-400 border-slate-200'
                              )}
                            >
                              <Sunset className="w-3 h-3 text-orange-500" />
                              <span>N</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setCustomNight((p) => !p)}
                              className={cn(
                                'flex-1 py-1 px-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer border',
                                customNight
                                  ? 'bg-indigo-100 text-indigo-900 border-indigo-300 font-bold'
                                  : 'bg-white text-slate-400 border-slate-200'
                              )}
                            >
                              <Moon className="w-3 h-3 text-indigo-500" />
                              <span>N</span>
                            </button>
                          </div>
                        </div>

                        {/* Duration */}
                        <div className="sm:col-span-3">
                          <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                            Duration:
                          </label>
                          <select
                            value={customDuration}
                            onChange={(e) => setCustomDuration(e.target.value)}
                            className="w-full text-xs text-slate-800 bg-white border border-slate-300 rounded-lg px-2 py-2 outline-hidden focus:border-teal-600 font-medium"
                          >
                            <option value="3 days">3 days</option>
                            <option value="5 days">5 days</option>
                            <option value="7 days">7 days</option>
                            <option value="10 days">10 days</option>
                            <option value="15 days">15 days</option>
                            <option value="30 days">30 days</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end pt-1">
                        {/* Food Note */}
                        <div className="sm:col-span-6">
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

                        {/* Manual Quantity Override */}
                        <div className="sm:col-span-3">
                          <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                            Quantity (Override):
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={customManualQty}
                            onChange={(e) => setCustomManualQty(e.target.value)}
                            placeholder="Auto-calculated"
                            className="w-full text-xs text-slate-800 bg-white border border-slate-300 rounded-lg px-2 py-2 outline-hidden focus:border-teal-600 text-center font-bold"
                          />
                        </div>

                        {/* Add button */}
                        <div className="sm:col-span-3">
                          <button
                            type="submit"
                            className="w-full py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer shadow-xs"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Add Drug</span>
                          </button>
                        </div>
                      </div>
                    </form>
                  )}
                </div>

                {/* 2. Hero Section: Prescribed Medicines Review Table */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900">
                        Prescription Draft Review ({draftMedicines.length})
                      </h3>
                      {draftMedicines.length > 0 && (
                        <span
                          className={cn(
                            'text-[10px] px-2 py-0.5 rounded-full font-bold border',
                            draftValidation.hasAllergyConflicts
                              ? 'bg-rose-50 text-rose-800 border-rose-200'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          )}
                        >
                          {draftValidation.hasAllergyConflicts
                            ? '⚠️ Allergy Warning Flagged'
                            : '✓ Safety Verified'}
                        </span>
                      )}
                    </div>

                    {draftMedicines.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm('Clear all draft medicines?')) {
                            setDraftMedicines([])
                          }
                        }}
                        className="text-[11px] text-slate-400 hover:text-rose-600 font-semibold transition-colors cursor-pointer"
                      >
                        Clear All
                      </button>
                    )}
                  </div>

                  {draftMedicines.length === 0 ? (
                    <div className="py-10 text-center border-2 border-dashed border-slate-200/90 rounded-2xl text-slate-400 text-xs space-y-2">
                      <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                        <Pill className="w-5 h-5" />
                      </div>
                      <p className="font-bold text-slate-700 text-sm">Draft is Currently Empty</p>
                      <p className="text-[11px] max-w-sm mx-auto text-slate-500">
                        Click items in the University Formulary catalog above or add a custom medication to prescribe.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider text-[10px]">
                          <tr>
                            <th className="py-2.5 px-3 font-bold">#</th>
                            <th className="py-2.5 px-3 font-bold">Medicine / Strength</th>
                            <th className="py-2.5 px-3 font-bold">Frequency</th>
                            <th className="py-2.5 px-3 font-bold">Timing / Instructions</th>
                            <th className="py-2.5 px-3 font-bold">Duration</th>
                            <th className="py-2.5 px-3 font-bold">Qty</th>
                            <th className="py-2.5 px-3 font-bold">Status</th>
                            <th className="py-2.5 px-3 font-bold text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {draftMedicines.map((med, idx) => {
                            const allergyCheck = checkDrugAllergyConflict(med, selectedPatient.allergies)
                            const hasConflict = allergyCheck.hasConflict
                            const isQtyInvalid = !med.qty || parseInt(med.qty, 10) <= 0

                            return (
                              <tr
                                key={med.id || idx}
                                className={cn(
                                  'hover:bg-slate-50/70 transition-colors',
                                  hasConflict ? 'bg-rose-50/40' : ''
                                )}
                              >
                                <td className="py-3 px-3 font-semibold text-slate-400">{idx + 1}</td>
                                <td className="py-3 px-3">
                                  <span className="font-bold text-slate-900 block leading-tight">
                                    {med.name}
                                  </span>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    {med.category && (
                                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium">
                                        {med.category}
                                      </span>
                                    )}
                                    {hasConflict && (
                                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 font-bold">
                                        Allergy: {allergyCheck.allergen}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 px-3">
                                  <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 font-bold border border-teal-100">
                                    {med.dosage}
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-slate-700">
                                  <span className="block font-medium">{med.timing}</span>
                                  <span className="text-[11px] text-slate-500">{med.instruction}</span>
                                </td>

                                {/* Duration Selector with Instant Quantity Recalculation */}
                                <td className="py-3 px-3">
                                  <select
                                    value={med.duration}
                                    onChange={(e) => handleDurationChange(idx, e.target.value)}
                                    className="text-xs bg-white border border-slate-300 rounded-lg px-2 py-1 outline-hidden focus:border-teal-600 font-medium cursor-pointer"
                                  >
                                    <option value="3 days">3 days</option>
                                    <option value="5 days">5 days</option>
                                    <option value="7 days">7 days</option>
                                    <option value="10 days">10 days</option>
                                    <option value="15 days">15 days</option>
                                    <option value="30 days">30 days</option>
                                  </select>
                                </td>

                                {/* Quantity Input with Manual Override */}
                                <td className="py-3 px-3">
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      min="1"
                                      value={med.qty}
                                      onChange={(e) => handleManualQuantityChange(idx, e.target.value)}
                                      className={cn(
                                        'w-14 px-1.5 py-1 text-xs text-center font-bold rounded-lg border outline-hidden transition-all',
                                        isQtyInvalid
                                          ? 'border-rose-400 bg-rose-50 text-rose-700 ring-1 ring-rose-300'
                                          : 'border-slate-300 bg-white text-slate-900 focus:border-teal-600'
                                      )}
                                      title="Type to manually change quantity"
                                    />
                                    <span className="text-[10px] text-slate-400">
                                      {med.unit || 'u'}
                                    </span>
                                  </div>
                                </td>

                                {/* Validation State Badge */}
                                <td className="py-3 px-3">
                                  {hasConflict ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full border border-rose-200">
                                      <AlertTriangle className="w-3 h-3 text-rose-600" />
                                      <span>Allergy Flag</span>
                                    </span>
                                  ) : isQtyInvalid ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">
                                      <AlertCircle className="w-3 h-3 text-amber-600" />
                                      <span>Qty Invalid</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                      <Check className="w-3 h-3 text-emerald-600" />
                                      <span>Ready</span>
                                    </span>
                                  )}
                                </td>

                                {/* Delete Action */}
                                <td className="py-3 px-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveDraftMedicine(idx)}
                                    className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                                    title="Remove medicine"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Bottom Action Footer */}
                  <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 text-slate-500">
                      <CheckCircle className="w-4 h-4 text-teal-600" />
                      <span>
                        Digital Dispatch Ready • Signed by <strong>{doctorProfile.name}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => triggerToast('Prescription sent to local printer!')}
                        className="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5 text-slate-500" />
                        <span>Print Rx</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleCompleteAndDispatch}
                        className="px-5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-sm hover:shadow-md"
                      >
                        <Send className="w-4 h-4" />
                        <span>Complete & Send to Dispensary</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            VIEW 3: COMPLETED CONSULTATIONS TODAY (SORTED & SEARCHABLE)
           ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 flex flex-col space-y-5">
            {/* Header & Metrics Strip */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Completed Consultations — Today's Shift
                </h2>
                <p className="text-xs text-slate-500">
                  Log of attended students & dispensed prescriptions by {doctorProfile.name}
                </p>
              </div>

              {/* Search in completed history */}
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={historySearchQuery}
                    onChange={(e) => setHistorySearchQuery(e.target.value)}
                    placeholder="Search name, roll, diagnosis..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-hidden focus:border-teal-600 focus:bg-white transition-all"
                  />
                </div>
                <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-teal-50 text-teal-800 border border-teal-200 shrink-0">
                  Total Attended: {seenCount}
                </span>
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-500 block">Total Seen Today</span>
                  <span className="text-lg font-bold text-slate-900">{seenCount} Students</span>
                </div>
                <div className="h-9 w-9 rounded-xl bg-teal-100/70 text-teal-800 flex items-center justify-center font-bold">
                  <User className="w-4 h-4" />
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-500 block">Dispensary Delivery</span>
                  <span className="text-lg font-bold text-emerald-700">100% Real-Time</span>
                </div>
                <div className="h-9 w-9 rounded-xl bg-emerald-100/70 text-emerald-800 flex items-center justify-center font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-500 block">Average Consult Duration</span>
                  <span className="text-lg font-bold text-slate-800">4.2 min / patient</span>
                </div>
                <div className="h-9 w-9 rounded-xl bg-amber-100/70 text-amber-800 flex items-center justify-center font-bold">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Table */}
            {filteredCompletedHistory.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 border border-slate-200 rounded-xl">
                No completed records matching your search query.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3 px-4 font-bold">Time</th>
                      <th className="py-3 px-4 font-bold">Student Name</th>
                      <th className="py-3 px-4 font-bold">Roll Number</th>
                      <th className="py-3 px-4 font-bold">Clinical Diagnosis</th>
                      <th className="py-3 px-4 font-bold">Prescription Sent</th>
                      <th className="py-3 px-4 font-bold text-right">Dispensary Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCompletedHistory.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-600">{item.completedAt}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{item.name}</td>
                        <td className="py-3 px-4 text-slate-600">{item.rollNo}</td>
                        <td className="py-3 px-4 text-slate-800 font-medium">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-medium border border-slate-200/80">
                            {item.diagnosis}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 max-w-xs truncate">{item.prescriptions}</td>
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
            )}
          </div>
        )}
      </main>
    </div>
  )
}
