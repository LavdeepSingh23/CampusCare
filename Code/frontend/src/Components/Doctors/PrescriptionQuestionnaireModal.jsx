import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Check,
  Search,
  Plus,
  Trash2,
  Printer,
  Send,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  FileText,
  Pill,
  Calendar,
  Stethoscope,
  Bed,
} from 'lucide-react'
import {
  Questionnaire,
  QuestionnaireProgress,
  QuestionnaireItem,
  QuestionnaireTitle,
  QuestionnaireChoices,
  QuestionnaireChoice,
  QuestionnaireActions,
  QuestionnairePrevious,
  QuestionnaireNext,
  QuestionnaireSubmit,
} from '../ui/questionnaire'
import { cn } from '../../lib/utils'
import {
  MEDICINE_FORMULARY,
  FORMULARY_CATEGORIES,
} from '../../data/medicineFormulary'
import {
  calculatePrescriptionQuantity,
  checkDrugAllergyConflict,
} from '../../utils/prescriptionCalculations'
import { generatePrescriptionPdf } from '../../utils/prescriptionPdf'
import { formatDosageMAN } from '../../utils/dosageFormatter'

/* ── PRE-CONFIGURED CLINICAL EVIDENCE PROTOCOLS ── */
const CLINICAL_PROTOCOLS = {
  'Viral Upper Respiratory Infection': {
    code: 'URI',
    label: 'Viral Upper Respiratory Infection',
    shortcut: '1',
    medications: [
      {
        name: 'Paracetamol 650mg',
        dosage: '1-0-1',
        frequency: 'Morning & Night',
        duration: '3 days',
        instruction: 'After food',
        qty: 6,
        unit: 'tabs',
      },
      {
        name: 'Cetirizine 10mg',
        dosage: '0-0-1',
        frequency: 'Night only',
        duration: '3 days',
        instruction: 'After food',
        qty: 3,
        unit: 'tabs',
      },
      {
        name: 'Vitamin C 500mg (Chewable)',
        dosage: '1-0-0',
        frequency: 'Morning',
        duration: '5 days',
        instruction: 'After food',
        qty: 5,
        unit: 'tabs',
      },
    ],
    followUp: 'No schedule needed',
    bedRest: '2 Days Bed Rest',
  },
  'Acute Pharyngitis / Tonsillitis': {
    code: 'PHARYNG',
    label: 'Acute Pharyngitis / Tonsillitis',
    shortcut: '2',
    medications: [
      {
        name: 'Azithromycin 500mg',
        dosage: '1-0-0',
        frequency: 'Morning',
        duration: '3 days',
        instruction: 'Before food',
        qty: 3,
        unit: 'tabs',
      },
      {
        name: 'Paracetamol 650mg',
        dosage: '1-0-1',
        frequency: 'Morning & Night',
        duration: '3 days',
        instruction: 'After food',
        qty: 6,
        unit: 'tabs',
      },
      {
        name: 'Pantoprazole 40mg',
        dosage: '1-0-0',
        frequency: 'Morning',
        duration: '3 days',
        instruction: 'Before food',
        qty: 3,
        unit: 'tabs',
      },
    ],
    followUp: 'In 3 Days',
    bedRest: '2 Days Bed Rest',
  },
  'Allergic Rhinitis / Sinusitis': {
    code: 'RHINITIS',
    label: 'Allergic Rhinitis / Sinusitis',
    shortcut: '3',
    medications: [
      {
        name: 'Levocetirizine 5mg + Montelukast 10mg',
        dosage: '0-0-1',
        frequency: 'Night only',
        duration: '5 days',
        instruction: 'After food',
        qty: 5,
        unit: 'tabs',
      },
      {
        name: 'Paracetamol 650mg',
        dosage: '1-0-1',
        frequency: 'Morning & Night (SOS)',
        duration: '3 days',
        instruction: 'After food',
        qty: 6,
        unit: 'tabs',
      },
    ],
    followUp: 'No schedule needed',
    bedRest: 'No Bed Rest Advised',
  },
  'Acute Gastritis / Dyspepsia': {
    code: 'GASTRITIS',
    label: 'Acute Gastritis / Dyspepsia',
    shortcut: '4',
    medications: [
      {
        name: 'Pantoprazole 40mg',
        dosage: '1-0-0',
        frequency: 'Morning',
        duration: '5 days',
        instruction: 'Before food',
        qty: 5,
        unit: 'tabs',
      },
      {
        name: 'Domperidone 10mg',
        dosage: '1-0-1',
        frequency: 'Morning & Night',
        duration: '3 days',
        instruction: 'Before food',
        qty: 6,
        unit: 'tabs',
      },
      {
        name: 'Antacid Gel 200ml',
        dosage: '0-1-1',
        frequency: 'Afternoon & Night',
        duration: '3 days',
        instruction: 'After food',
        qty: 1,
        unit: 'bottle',
      },
    ],
    followUp: 'In 3 Days',
    bedRest: 'No Bed Rest Advised',
  },
  'Tension Headache / Migraine': {
    code: 'HEADACHE',
    label: 'Tension Headache / Migraine',
    shortcut: '5',
    medications: [
      {
        name: 'Paracetamol 650mg',
        dosage: '1-0-1',
        frequency: 'Morning & Night',
        duration: '2 days',
        instruction: 'After food',
        qty: 4,
        unit: 'tabs',
      },
      {
        name: 'Naproxen 250mg',
        dosage: '0-0-1',
        frequency: 'Night only (SOS)',
        duration: '2 days',
        instruction: 'After food',
        qty: 2,
        unit: 'tabs',
      },
    ],
    followUp: 'No schedule needed',
    bedRest: '1 Day Bed Rest',
  },
  'Acute Muscular Strain': {
    code: 'STRAIN',
    label: 'Acute Muscular Strain',
    shortcut: '6',
    medications: [
      {
        name: 'Aceclofenac 100mg + Paracetamol 325mg',
        dosage: '1-0-1',
        frequency: 'Morning & Night',
        duration: '3 days',
        instruction: 'After food',
        qty: 6,
        unit: 'tabs',
      },
      {
        name: 'Thiocolchicoside 4mg',
        dosage: '1-0-1',
        frequency: 'Morning & Night',
        duration: '3 days',
        instruction: 'After food',
        qty: 6,
        unit: 'tabs',
      },
    ],
    followUp: 'No schedule needed',
    bedRest: '2 Days Bed Rest',
  },
  'Acute Gastroenteritis': {
    code: 'AGE',
    label: 'Acute Gastroenteritis',
    shortcut: '7',
    medications: [
      {
        name: 'ORS Sachet (Oral Rehydration Salts)',
        dosage: '1-1-1',
        frequency: 'Thrice daily in water',
        duration: '3 days',
        instruction: 'With food',
        qty: 6,
        unit: 'sachets',
      },
      {
        name: 'Ofloxacin 200mg + Ornidazole 500mg',
        dosage: '1-0-1',
        frequency: 'Morning & Night',
        duration: '3 days',
        instruction: 'After food',
        qty: 6,
        unit: 'tabs',
      },
      {
        name: 'Zinc Gluconate 20mg',
        dosage: '1-0-0',
        frequency: 'Morning',
        duration: '7 days',
        instruction: 'After food',
        qty: 7,
        unit: 'tabs',
      },
    ],
    followUp: 'In 2 Days',
    bedRest: '3 Days Bed Rest',
  },
}

/* ── MASTER DIAGNOSES LIST FOR SEARCH & GHOST AUTOCOMPLETE ── */
const MASTER_DIAGNOSES = [
  'Viral Upper Respiratory Infection',
  'Acute Pharyngitis / Tonsillitis',
  'Allergic Rhinitis / Sinusitis',
  'Acute Gastritis / Dyspepsia',
  'Tension Headache / Migraine',
  'Acute Muscular Strain',
  'Acute Gastroenteritis',
  'Acute Bronchitis',
  'Conjunctivitis (Pink Eye)',
  'Contact Dermatitis',
  'Urinary Tract Infection (UTI)',
  'Acid Peptic Disease (GERD)',
  'Otitis Media (Ear Infection)',
  'Oral Aphthous Ulcers',
  'Typhoid Fever (Suspected)',
  'Viral Fever / Pyrexia of Unknown Origin',
  'Sprained Ankle / Ligament Strain',
  'Lumbago / Acute Lower Back Pain',
]

/* ── FOLLOW UP OPTIONS (NO SUBTEXT) ── */
const FOLLOW_UP_OPTIONS = [
  'No schedule needed',
  'In 2 Days',
  'In 3 Days',
  'In 5 Days',
  'In 1 Week',
  'SOS as needed',
]

/* ── BED REST DIRECTIVE OPTIONS (NO SUBTEXT) ── */
const BED_REST_OPTIONS = [
  'No Bed Rest Advised',
  '1 Day Bed Rest',
  '2 Days Bed Rest',
  '3 Days Bed Rest',
  '5 Days Bed Rest',
  'Custom Days',
]

export default function PrescriptionQuestionnaireModal({
  isOpen,
  onClose,
  patient,
  doctor,
  onFinalizePrescription,
  isFinalizing,
  presetPrescription = null,
}) {
  // Stepper state: 1: Diagnosis | 2: Medications | 3: Follow-up & Bed Rest | 4: Formal Rx Review
  const [currentStep, setCurrentStep] = useState(1)

  // Clinical Draft State
  const [selectedDiagnosis, setSelectedDiagnosis] = useState('')
  const [diagnosisSearchInput, setDiagnosisSearchInput] = useState('')
  const [customDiagnosis, setCustomDiagnosis] = useState('')
  const [prescribedMedicines, setPrescribedMedicines] = useState([])
  const [selectedFollowUp, setSelectedFollowUp] = useState('No schedule needed')
  
  // Bed Rest State
  const [selectedBedRest, setSelectedBedRest] = useState('No Bed Rest Advised')
  const [customBedRestDays, setCustomBedRestDays] = useState('3')
  const [customBedRestReason, setCustomBedRestReason] = useState('')

  // Step 2 Medication Search & Custom Adder
  const [drugSearchQuery, setDrugSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [customDrugName, setCustomDrugName] = useState('')
  const [customMorning, setCustomMorning] = useState(true)
  const [customAfternoon, setCustomAfternoon] = useState(false)
  const [customNight, setCustomNight] = useState(true)
  const [customDuration, setCustomDuration] = useState('3 days')
  const [customInstruction, setCustomInstruction] = useState('After food')

  // Validation / Error Notification
  const [stepError, setStepError] = useState(null)

  // Effective Clinical Diagnosis string
  const effectiveDiagnosis = customDiagnosis.trim() || selectedDiagnosis || ''

  // Effective Bed Rest Certificate string
  const effectiveBedRestString = useMemo(() => {
    if (selectedBedRest === 'No Bed Rest Advised') return 'No Bed Rest Advised'
    if (selectedBedRest === 'Custom Days') {
      const days = parseInt(customBedRestDays, 10) || 1
      const reasonPart = customBedRestReason.trim() ? ` (${customBedRestReason.trim()})` : ''
      return `${days} Day${days > 1 ? 's' : ''} Bed Rest${reasonPart}`
    }
    return selectedBedRest
  }, [selectedBedRest, customBedRestDays, customBedRestReason])

  // Initialize or reset draft when patient opens or repeat prescription is loaded
  useEffect(() => {
    if (presetPrescription && isOpen) {
      const diag = presetPrescription.diagnosis || patient?.complaint || 'General Consultation'
      setSelectedDiagnosis(diag)
      setDiagnosisSearchInput(diag)
      setCustomDiagnosis(diag)
      setPrescribedMedicines(Array.isArray(presetPrescription.medicines) ? presetPrescription.medicines : [])
      setSelectedFollowUp(presetPrescription.followUp || 'No schedule needed')
      setSelectedBedRest(presetPrescription.bedRest || 'No Bed Rest Advised')
      setCustomBedRestDays('3')
      setCustomBedRestReason('')
      setStepError(null)
      setCurrentStep(4) // Directly redirect to formal prescription review step
      return
    }

    if (patient && isOpen) {
      setCurrentStep(1)
      setSelectedDiagnosis('')
      setDiagnosisSearchInput('')
      setCustomDiagnosis('')
      setPrescribedMedicines([])
      setSelectedFollowUp('No schedule needed')
      setSelectedBedRest('No Bed Rest Advised')
      setCustomBedRestDays('3')
      setCustomBedRestReason('')
      setStepError(null)
      setDrugSearchQuery('')
      setCustomDrugName('')
      setCustomMorning(true)
      setCustomAfternoon(false)
      setCustomNight(true)
      setCustomDuration('3 days')
      setCustomInstruction('After food')
      setActiveCategory('All')
    }
  }, [patient?.rollNo, isOpen, presetPrescription])

  /* ── 1. STEP 1: DIAGNOSIS GHOST MATCH & COMPREHENSIVE SEARCH FILTER ── */
  const topDiagnosisMatch = useMemo(() => {
    const q = diagnosisSearchInput.trim().toLowerCase()
    if (!q) return null
    const allDiagnoses = [
      ...Object.values(CLINICAL_PROTOCOLS).map((p) => p.label),
      ...MASTER_DIAGNOSES,
    ]
    // 1. Starts with exact query
    const prefix = allDiagnoses.find((d) => d.toLowerCase().startsWith(q))
    if (prefix) return prefix
    // 2. Starts with any word
    const word = allDiagnoses.find((d) => {
      const words = d.toLowerCase().split(/[\s()/-]+/)
      return words.some((w) => w.startsWith(q))
    })
    if (word) return word
    // 3. Contains match
    return allDiagnoses.find((d) => d.toLowerCase().includes(q)) || null
  }, [diagnosisSearchInput])

  const diagnosisGhostSuffix = useMemo(() => {
    if (!diagnosisSearchInput || !topDiagnosisMatch) return ''
    if (topDiagnosisMatch.toLowerCase().startsWith(diagnosisSearchInput.toLowerCase())) {
      return topDiagnosisMatch.slice(diagnosisSearchInput.length)
    }
    return ''
  }, [diagnosisSearchInput, topDiagnosisMatch])

  // Filter diagnoses comprehensively across clinical protocols and master list
  const searchDiagnosisResults = useMemo(() => {
    const q = diagnosisSearchInput.trim().toLowerCase()
    if (!q) {
      return Object.entries(CLINICAL_PROTOCOLS).map(([key, proto]) => ({
        id: key,
        label: proto.label,
        isProtocol: true,
        protocolKey: key,
        shortcut: proto.shortcut,
      }))
    }

    const results = []
    const seen = new Set()

    // 1. Clinical protocols matching
    Object.entries(CLINICAL_PROTOCOLS).forEach(([key, proto]) => {
      if (
        proto.label.toLowerCase().includes(q) ||
        proto.code.toLowerCase().includes(q) ||
        (proto.medications && proto.medications.some((m) => m.name.toLowerCase().includes(q)))
      ) {
        results.push({
          id: key,
          label: proto.label,
          isProtocol: true,
          protocolKey: key,
          shortcut: proto.shortcut,
        })
        seen.add(proto.label.toLowerCase())
      }
    })

    // 2. Master diagnoses matching
    MASTER_DIAGNOSES.forEach((diag) => {
      if (!seen.has(diag.toLowerCase()) && diag.toLowerCase().includes(q)) {
        results.push({
          id: diag,
          label: diag,
          isProtocol: false,
          protocolKey: null,
          shortcut: null,
        })
        seen.add(diag.toLowerCase())
      }
    })

    // 3. Custom entry if user typed a unique term
    if (!seen.has(q) && q.length > 0) {
      results.push({
        id: '__custom__',
        label: diagnosisSearchInput.trim(),
        isCustom: true,
        isProtocol: false,
        shortcut: null,
      })
    }

    return results
  }, [diagnosisSearchInput])

  /* ── 2. STEP 2: FORMULARY SEARCH & SAFE STRING FILTER (CRASH FIX) ── */
  const filteredDrugs = useMemo(() => {
    let list = MEDICINE_FORMULARY
    const q = drugSearchQuery.trim().toLowerCase()
    if (!q && activeCategory !== 'All') {
      list = list.filter((m) => m.category === activeCategory)
    } else if (q) {
      list = list.filter((m) => {
        const nameMatch = m.name?.toLowerCase().includes(q)
        const genMatch = m.genericName?.toLowerCase().includes(q)
        // Safe string / array check for indications:
        const indMatch = typeof m.indications === 'string'
          ? m.indications.toLowerCase().includes(q)
          : Array.isArray(m.indications)
          ? m.indications.some((ind) => String(ind).toLowerCase().includes(q))
          : false
        return Boolean(nameMatch || genMatch || indMatch)
      })
    }
    return list.slice(0, 12)
  }, [drugSearchQuery, activeCategory])

  const formularyGhostMatch = useMemo(() => {
    const q = drugSearchQuery.trim().toLowerCase()
    if (!q || q.length < 1) return null
    // 1. Exact prefix
    const prefix = MEDICINE_FORMULARY.find((m) => m.name.toLowerCase().startsWith(q))
    if (prefix) return prefix.name
    // 2. Word prefix (e.g. "dolo" -> "Paracetamol 650mg (Dolo)")
    const word = MEDICINE_FORMULARY.find((m) => {
      const words = m.name.toLowerCase().split(/[\s()/-]+/)
      return words.some((w) => w.startsWith(q))
    })
    if (word) return word.name
    // 3. Generic name prefix
    const gen = MEDICINE_FORMULARY.find((m) => m.genericName?.toLowerCase().startsWith(q))
    if (gen) return gen.name
    // 4. Contains
    const contains = MEDICINE_FORMULARY.find(
      (m) => m.name.toLowerCase().includes(q) || m.genericName?.toLowerCase().includes(q)
    )
    return contains ? contains.name : null
  }, [drugSearchQuery])

  const formularyGhostSuffix = useMemo(() => {
    if (!drugSearchQuery || !formularyGhostMatch) return ''
    if (formularyGhostMatch.toLowerCase().startsWith(drugSearchQuery.toLowerCase())) {
      return formularyGhostMatch.slice(drugSearchQuery.length)
    }
    return ''
  }, [drugSearchQuery, formularyGhostMatch])

  /* ── 3. STEP 2: CUSTOM DRUG GHOST MATCH ── */
  const customGhostMatch = useMemo(() => {
    const q = customDrugName.trim().toLowerCase()
    if (!q || q.length < 1) return null
    const prefix = MEDICINE_FORMULARY.find((m) => m.name.toLowerCase().startsWith(q))
    if (prefix) return prefix
    const word = MEDICINE_FORMULARY.find((m) => {
      const words = m.name.toLowerCase().split(/[\s()/-]+/)
      return words.some((w) => w.startsWith(q))
    })
    if (word) return word
    return MEDICINE_FORMULARY.find(
      (m) => m.name.toLowerCase().includes(q) || m.genericName?.toLowerCase().includes(q)
    ) || null
  }, [customDrugName])

  const customGhostSuffix = useMemo(() => {
    if (!customDrugName || !customGhostMatch) return ''
    if (customGhostMatch.name.toLowerCase().startsWith(customDrugName.toLowerCase())) {
      return customGhostMatch.name.slice(customDrugName.length)
    }
    return ''
  }, [customDrugName, customGhostMatch])

  // Select diagnosis by full name
  const handleSelectDiagnosisByName = (diagName) => {
    if (!diagName) return
    const matchedProtocolEntry = Object.entries(CLINICAL_PROTOCOLS).find(
      ([_, proto]) => proto.label.toLowerCase() === diagName.toLowerCase()
    )

    if (matchedProtocolEntry) {
      handleToggleDiagnosis(matchedProtocolEntry[0])
    } else {
      setSelectedDiagnosis(diagName)
      setCustomDiagnosis(diagName)
      setDiagnosisSearchInput(diagName)
    }
    setStepError(null)
  }

  // Toggle Diagnosis selection: Click to select + pre-populate; click again to unselect + clear
  const handleToggleDiagnosis = (protocolKey) => {
    const proto = CLINICAL_PROTOCOLS[protocolKey]
    if (!proto) return

    if (selectedDiagnosis === proto.label) {
      // Unselect & clear
      setSelectedDiagnosis('')
      setCustomDiagnosis('')
      setDiagnosisSearchInput('')
      setPrescribedMedicines([])
      setSelectedFollowUp('No schedule needed')
      setSelectedBedRest('No Bed Rest Advised')
      setStepError(null)
    } else {
      // Select & pre-populate medicines without overriding Step 3 defaults
      setSelectedDiagnosis(proto.label)
      setCustomDiagnosis('')
      setDiagnosisSearchInput(proto.label)
      setPrescribedMedicines(proto.medications)
      setSelectedFollowUp('No schedule needed')
      setSelectedBedRest('No Bed Rest Advised')
      setStepError(null)
    }
  }

  // Keyboard Shortcuts for Diagnosis (1 - 7)
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return
      if (currentStep === 1) {
        const protocols = Object.keys(CLINICAL_PROTOCOLS)
        const num = parseInt(e.key, 10)
        if (num >= 1 && num <= protocols.length) {
          handleToggleDiagnosis(protocols[num - 1])
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, currentStep, selectedDiagnosis])

  const patientAllergies = patient?.allergies || []

  // Add Formulary Drug Handler
  const handleAddFormularyDrug = (drug) => {
    const isAlreadyAdded = prescribedMedicines.some(
      (m) => m.name.toLowerCase() === drug.name.toLowerCase()
    )
    if (isAlreadyAdded) {
      setStepError(`"${drug.name}" is already in the prescription.`)
      return
    }

    const defaultQty = calculatePrescriptionQuantity(drug.defaultDosage, drug.defaultDuration)
    const newItem = {
      id: drug.id,
      name: drug.name,
      dosage: drug.defaultDosage,
      duration: drug.defaultDuration,
      instruction: drug.defaultTiming || 'After food',
      qty: defaultQty,
      unit: drug.unit || 'tabs',
      genericName: drug.genericName,
    }

    setPrescribedMedicines((prev) => [...prev, newItem])
    setStepError(null)
  }

  // Accept Custom Drug Autocomplete match
  const acceptCustomGhostMatch = (match) => {
    if (!match) return
    setCustomDrugName(match.name)
    setCustomDuration(match.defaultDuration || '3 days')
    setCustomInstruction(match.defaultTiming || 'After food')

    const dosage = match.defaultDosage || '1-0-1'
    const parts = dosage.split('-')
    if (parts.length === 3) {
      setCustomMorning(parts[0] === '1')
      setCustomAfternoon(parts[1] === '1')
      setCustomNight(parts[2] === '1')
    }
  }

  // Add Custom Drug Handler
  const handleAddCustomDrug = (e) => {
    e?.preventDefault()
    if (!customDrugName.trim()) {
      setStepError('Please enter the medicine name.')
      return
    }

    const m = customMorning ? '1' : '0'
    const a = customAfternoon ? '1' : '0'
    const n = customNight ? '1' : '0'
    const dosageCode = `${m}-${a}-${n}`

    if (dosageCode === '0-0-0') {
      setStepError('Select at least one schedule slot (Morning, Afternoon, or Night).')
      return
    }

    const qty = calculatePrescriptionQuantity(dosageCode, customDuration)
    const newItem = {
      id: `custom-${Date.now()}`,
      name: customDrugName.trim(),
      dosage: dosageCode,
      duration: customDuration,
      instruction: customInstruction,
      qty: qty || 3,
      unit: 'tabs',
      genericName: 'Custom Entry',
    }

    setPrescribedMedicines((prev) => [...prev, newItem])
    setCustomDrugName('')
    setStepError(null)
  }

  const handleRemoveMedicine = (index) => {
    setPrescribedMedicines((prev) => prev.filter((_, i) => i !== index))
  }

  const handleProceedStep = () => {
    setStepError(null)

    if (currentStep === 1) {
      if (!effectiveDiagnosis.trim()) {
        setStepError('Select or enter a patient diagnosis to proceed.')
        return
      }
      setCurrentStep(2)
      return
    }

    if (currentStep === 2) {
      if (prescribedMedicines.length === 0) {
        setStepError('Prescribe at least one medication to proceed.')
        return
      }
      setCurrentStep(3)
      return
    }

    if (currentStep === 3) {
      setCurrentStep(4)
      return
    }
  }

  const handleDispatch = () => {
    const payload = {
      diagnosis: effectiveDiagnosis,
      clinicalNotes: `Patient presented with complaints; evaluated.`,
      medicines: prescribedMedicines,
      dietAdvice: 'Follow prescribed medication schedule. Hydrate well.',
      followUp: selectedFollowUp,
      bedRest: effectiveBedRestString,
    }
    onFinalizePrescription(payload)
  }

  if (!isOpen || !patient) return null

  const currentDateStr = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  const currentCustomScheduleMAN = formatDosageMAN(
    `${customMorning ? '1' : '0'}-${customAfternoon ? '1' : '0'}-${customNight ? '1' : '0'}`
  )

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-6 bg-slate-900/50 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-4xl max-h-[92vh] bg-white border border-slate-200 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-900"
          >
            
            {/* ── TOP HEADER & PATIENT BANNER ── */}
            <div className="px-5 py-4 border-b border-slate-200 bg-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-2xl bg-teal-700 text-white flex items-center justify-center font-mono font-bold text-sm shrink-0 shadow-xs">
                  <Stethoscope className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 text-sm sm:text-base truncate">
                      E-Prescription Studio
                    </span>
                    <span className="text-xs px-2.5 py-0.5 rounded-md bg-teal-50 text-teal-800 font-semibold border border-teal-200">
                      {patient.name}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">
                      Roll: {patient.rollNo}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-slate-600 mt-1 flex-wrap">
                    <span>Age: <strong className="text-slate-800">{patient.age} yrs</strong></span>
                    <span>Blood: <strong className="text-slate-800">{patient.bloodGroup}</strong></span>
                    
                    {patientAllergies.some((a) => a !== 'None declared') ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                        Allergy: {patientAllergies.join(', ')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                        No Known Drug Allergies
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <QuestionnaireProgress className="bg-slate-100 text-slate-700 px-3 py-1 rounded-lg border border-slate-200">
                  {currentStep <= 3 ? `Step ${currentStep} of 3 • ${Math.round((currentStep / 3) * 100)}%` : 'Formal Review'}
                </QuestionnaireProgress>

                <button
                  type="button"
                  onClick={onClose}
                  disabled={isFinalizing}
                  className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                  aria-label="Close modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* ── QUESTIONNAIRE CONTENT SCROLL REGION ── */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6 bg-white">
              {stepError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{stepError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStepError(null)}
                    className="text-rose-600 font-bold px-1.5 py-0.5 cursor-pointer hover:bg-rose-100 rounded"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              <Questionnaire>
                
                {/* ═══════════════════════════════════════════════════════════
                    STEP 1: PRIMARY CLINICAL DIAGNOSIS
                   ═══════════════════════════════════════════════════════════ */}
                {currentStep === 1 && (
                  <QuestionnaireItem>
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800 block mb-0.5">
                        PATIENT COMPLAINT
                      </span>
                      <p className="text-slate-900 text-sm font-medium">
                        "{patient.complaint || 'General Consultation'}"
                      </p>
                    </div>

                    <QuestionnaireTitle>
                      Primary Clinical Diagnosis
                    </QuestionnaireTitle>

                    {/* ── INPUT 1: SEARCH & GHOST AUTOCOMPLETE FOR DIAGNOSIS ── */}
                    <div className="pt-1 pb-2">
                      <div className="relative flex items-center bg-white border border-slate-300 rounded-xl overflow-hidden focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-600/20">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />

                        {/* Ghost Overlay */}
                        {diagnosisGhostSuffix && (
                          <div className="absolute inset-0 pl-9 pr-24 py-2 text-xs sm:text-sm pointer-events-none flex items-center overflow-hidden font-sans select-none">
                            <span className="invisible whitespace-pre">{diagnosisSearchInput}</span>
                            <span className="text-slate-400 font-normal whitespace-pre">
                              {diagnosisGhostSuffix}
                            </span>
                          </div>
                        )}

                        <input
                          type="text"
                          value={diagnosisSearchInput}
                          onChange={(e) => {
                            setDiagnosisSearchInput(e.target.value)
                            setCustomDiagnosis(e.target.value)
                            if (e.target.value.trim()) setSelectedDiagnosis('')
                          }}
                          onKeyDown={(e) => {
                            if ((e.key === 'Tab' || e.key === 'ArrowRight' || e.key === 'Enter') && topDiagnosisMatch) {
                              e.preventDefault()
                              handleSelectDiagnosisByName(topDiagnosisMatch)
                            }
                          }}
                          placeholder="Search or enter diagnosis (e.g. Tonsillitis, Gastritis, Migraine, Cough, Eye)..."
                          className="w-full pl-9 pr-24 py-2 text-xs sm:text-sm bg-transparent outline-none relative z-10 text-slate-900"
                        />

                        {/* Quick Tab chip */}
                        {topDiagnosisMatch && diagnosisSearchInput.trim() && diagnosisSearchInput.toLowerCase() !== topDiagnosisMatch.toLowerCase() && (
                          <button
                            type="button"
                            onClick={() => handleSelectDiagnosisByName(topDiagnosisMatch)}
                            className="absolute right-2.5 z-20 text-[10px] font-semibold bg-slate-100 hover:bg-teal-50 text-teal-800 px-2 py-0.5 rounded border border-slate-200 cursor-pointer"
                          >
                            Tab ⇥ {topDiagnosisMatch.split(' ')[0]}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* ── DIAGNOSIS OPTIONS: PURE MAIN TEXT ONLY, ZERO SUBTEXT ── */}
                    <QuestionnaireChoices className="grid-cols-1 sm:grid-cols-2 pt-1 max-h-56 overflow-y-auto pr-1">
                      {searchDiagnosisResults.map((item) => {
                        const isSelected = effectiveDiagnosis.toLowerCase() === item.label.toLowerCase()
                        return (
                          <QuestionnaireChoice
                            key={item.id}
                            checked={isSelected}
                            shortcut={item.shortcut}
                            onClick={() => {
                              if (item.isProtocol) {
                                handleToggleDiagnosis(item.protocolKey)
                              } else {
                                handleSelectDiagnosisByName(item.label)
                              }
                            }}
                          >
                            <div className="flex items-center justify-between w-full gap-2">
                              <span className="font-bold text-slate-900 text-sm truncate">
                                {item.isCustom ? `Use "${item.label}"` : item.label}
                              </span>
                              {item.isProtocol && (
                                <span className="text-[10px] font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200 shrink-0">
                                  Protocol
                                </span>
                              )}
                              {item.isCustom && (
                                <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 shrink-0">
                                  Custom
                                </span>
                              )}
                            </div>
                          </QuestionnaireChoice>
                        )
                      })}
                    </QuestionnaireChoices>

                    <QuestionnaireActions>
                      <span className="text-xs text-slate-500">
                        Selected: <strong className="text-slate-900">{effectiveDiagnosis || 'None (select at least one)'}</strong>
                      </span>
                      <QuestionnaireNext
                        onClick={handleProceedStep}
                        disabled={!effectiveDiagnosis.trim()}
                        className={cn(
                          !effectiveDiagnosis.trim() && 'opacity-40 cursor-not-allowed pointer-events-none'
                        )}
                      >
                        <span>Continue to Medications</span>
                        <ArrowRight className="w-4 h-4 ms-1.5" />
                      </QuestionnaireNext>
                    </QuestionnaireActions>
                  </QuestionnaireItem>
                )}

                {/* ═══════════════════════════════════════════════════════════
                    STEP 2: PRESCRIBE MEDICATIONS & DISPENSARY SCHEDULE
                   ═══════════════════════════════════════════════════════════ */}
                {currentStep === 2 && (
                  <QuestionnaireItem>
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">Active Diagnosis:</span>
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                          {effectiveDiagnosis}
                        </span>
                      </div>
                      <span className="text-xs font-semibold text-slate-500">
                        {prescribedMedicines.length} Item(s) in Draft
                      </span>
                    </div>

                    <QuestionnaireTitle>
                      Prescribe Medications & Dispensary Schedule
                    </QuestionnaireTitle>

                    {/* ── INPUT 2: FORMULARY SEARCH BAR WITH WORKING GHOST TYPING ── */}
                    <div className="space-y-3 pt-1">
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                        
                        <div className="relative flex-1 flex items-center bg-white border border-slate-300 rounded-xl overflow-hidden focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-600/20">
                          <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                          
                          {/* Ghost Completion Overlay */}
                          {formularyGhostSuffix && (
                            <div className="absolute inset-0 pl-9 pr-24 py-2 text-xs sm:text-sm pointer-events-none flex items-center overflow-hidden font-sans select-none">
                              <span className="invisible whitespace-pre">{drugSearchQuery}</span>
                              <span className="text-slate-400 font-normal whitespace-pre">
                                {formularyGhostSuffix}
                              </span>
                            </div>
                          )}

                          <input
                            type="text"
                            value={drugSearchQuery}
                            onChange={(e) => setDrugSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                              if ((e.key === 'Tab' || e.key === 'ArrowRight' || e.key === 'Enter') && formularyGhostMatch) {
                                e.preventDefault()
                                setDrugSearchQuery(formularyGhostMatch)
                              }
                            }}
                            placeholder="Search formulary (e.g. Dolo, Paracetamol, Cetirizine, Azithromycin)..."
                            className="w-full pl-9 pr-24 py-2 text-xs sm:text-sm bg-transparent outline-none relative z-10 text-slate-900"
                          />

                          {/* Quick Tab suggestion chip */}
                          {formularyGhostMatch && drugSearchQuery.trim() && drugSearchQuery.toLowerCase() !== formularyGhostMatch.toLowerCase() && (
                            <button
                              type="button"
                              onClick={() => setDrugSearchQuery(formularyGhostMatch)}
                              className="absolute right-2.5 z-20 text-[10px] font-semibold bg-slate-100 hover:bg-teal-50 text-teal-800 px-2 py-0.5 rounded border border-slate-200 cursor-pointer"
                            >
                              Tab ⇥ {formularyGhostMatch.split(' ')[0]}
                            </button>
                          )}
                        </div>

                        {/* Deduplicated Category Filter Pills (Only ONE 'All') */}
                        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                          {FORMULARY_CATEGORIES.slice(0, 4).map((cat) => (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setActiveCategory(cat)}
                              className={cn(
                                'px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer border transition-colors',
                                activeCategory === cat
                                  ? 'bg-teal-800 text-white border-teal-800'
                                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200/70'
                              )}
                            >
                              {cat}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Filtered Drug Chips with Dynamic M-A-N Dosage */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                        {filteredDrugs.map((drug) => {
                          const allergyConflict = checkDrugAllergyConflict(drug, patientAllergies)
                          const alreadyAdded = prescribedMedicines.some(
                            (m) => m.name.toLowerCase() === drug.name.toLowerCase()
                          )
                          const dosageMAN = formatDosageMAN(drug.defaultDosage)

                          return (
                            <div
                              key={drug.id}
                              className={cn(
                                'p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs shadow-2xs',
                                allergyConflict.hasConflict
                                  ? 'bg-rose-50/60 border-rose-300'
                                  : 'bg-white border-slate-200'
                              )}
                            >
                              <div className="min-w-0 flex-1">
                                <span className="font-bold text-slate-900 truncate block">
                                  {drug.name}
                                </span>
                                <span className="text-[11px] text-slate-500 block truncate">
                                  <strong className="text-teal-900 font-mono">{dosageMAN}</strong> • {drug.defaultDuration} • {drug.defaultTiming}
                                </span>
                                {allergyConflict.hasConflict && (
                                  <span className="text-[10px] font-bold text-rose-600 block mt-0.5">
                                    Allergy Risk: {allergyConflict.matchedAllergy}
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleAddFormularyDrug(drug)}
                                disabled={alreadyAdded}
                                className={cn(
                                  'px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer transition-all',
                                  alreadyAdded
                                    ? 'bg-slate-100 text-slate-400 border border-slate-200'
                                    : 'bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100'
                                )}
                              >
                                {alreadyAdded ? (
                                  <span>Added</span>
                                ) : (
                                  <>
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Add</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )
                        })}

                        {filteredDrugs.length === 0 && drugSearchQuery.trim() && (
                          <div className="col-span-full p-3 rounded-xl border border-dashed border-teal-300 bg-teal-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <span className="text-xs font-bold text-slate-800 block">
                                "{drugSearchQuery}" not in formulary list
                              </span>
                              <span className="text-[11px] text-slate-500 block">
                                Prescribe as a custom medication with custom schedule and dosage
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setCustomDrugName(drugSearchQuery.trim())
                                setDrugSearchQuery('')
                              }}
                              className="px-3 py-1.5 rounded-lg bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shrink-0 transition-colors shadow-2xs"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Prescribe Custom</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── INPUT 3: CUSTOM DRUG ADDER WITH WORKING GHOST TYPING ── */}
                    <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
                          Or Prescribe Custom Medication
                        </span>
                        <span className="text-[11px] font-semibold text-teal-800">
                          Schedule: <strong className="font-mono bg-teal-100/70 px-1.5 py-0.5 rounded">{currentCustomScheduleMAN}</strong>
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                        
                        <div className="sm:col-span-5 relative">
                          <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                            Drug Name & Strength
                          </label>
                          
                          <div className="relative flex items-center bg-white border border-slate-300 rounded-lg overflow-hidden focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-600/20">
                            {customGhostSuffix && (
                              <div className="absolute inset-0 px-3 py-1.5 text-xs pointer-events-none flex items-center overflow-hidden font-sans select-none">
                                <span className="invisible whitespace-pre">{customDrugName}</span>
                                <span className="text-slate-400 font-normal whitespace-pre">
                                  {customGhostSuffix}
                                </span>
                              </div>
                            )}

                            <input
                              type="text"
                              value={customDrugName}
                              onChange={(e) => setCustomDrugName(e.target.value)}
                              onKeyDown={(e) => {
                                if ((e.key === 'Tab' || e.key === 'ArrowRight' || e.key === 'Enter') && customGhostMatch) {
                                  e.preventDefault()
                                  acceptCustomGhostMatch(customGhostMatch)
                                }
                              }}
                              placeholder="Enter medicine name..."
                              className="w-full px-3 pr-24 py-1.5 text-xs bg-transparent outline-none relative z-10 text-slate-900"
                            />

                            {/* Quick Tab suggestion chip */}
                            {customGhostMatch && customDrugName.trim() && customDrugName.toLowerCase() !== customGhostMatch.name.toLowerCase() && (
                              <button
                                type="button"
                                onClick={() => acceptCustomGhostMatch(customGhostMatch)}
                                className="absolute right-2 z-20 text-[10px] font-semibold bg-slate-100 hover:bg-teal-50 text-teal-800 px-2 py-0.5 rounded border border-slate-200 cursor-pointer"
                              >
                                Tab ⇥ {customGhostMatch.name.split(' ')[0]}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Frequency (M - A - N) Toggles */}
                        <div className="sm:col-span-3">
                          <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                            Frequency (M - A - N)
                          </label>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setCustomMorning((p) => !p)}
                              className={cn(
                                'flex-1 py-1 rounded text-xs font-bold border cursor-pointer transition-colors',
                                customMorning ? 'bg-teal-700 text-white border-teal-700' : 'bg-white text-slate-500 border-slate-200'
                              )}
                              title="Morning Dose"
                            >
                              M
                            </button>
                            <button
                              type="button"
                              onClick={() => setCustomAfternoon((p) => !p)}
                              className={cn(
                                'flex-1 py-1 rounded text-xs font-bold border cursor-pointer transition-colors',
                                customAfternoon ? 'bg-teal-700 text-white border-teal-700' : 'bg-white text-slate-500 border-slate-200'
                              )}
                              title="Afternoon Dose"
                            >
                              A
                            </button>
                            <button
                              type="button"
                              onClick={() => setCustomNight((p) => !p)}
                              className={cn(
                                'flex-1 py-1 rounded text-xs font-bold border cursor-pointer transition-colors',
                                customNight ? 'bg-teal-700 text-white border-teal-700' : 'bg-white text-slate-500 border-slate-200'
                              )}
                              title="Night Dose"
                            >
                              N
                            </button>
                          </div>
                        </div>

                        {/* Duration Selector */}
                        <div className="sm:col-span-2">
                          <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                            Duration
                          </label>
                          <select
                            value={customDuration}
                            onChange={(e) => setCustomDuration(e.target.value)}
                            className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-lg outline-none"
                          >
                            <option value="2 days">2 days</option>
                            <option value="3 days">3 days</option>
                            <option value="5 days">5 days</option>
                            <option value="7 days">7 days</option>
                            <option value="10 days">10 days</option>
                          </select>
                        </div>

                        {/* Add Button */}
                        <div className="sm:col-span-2">
                          <button
                            type="button"
                            onClick={handleAddCustomDrug}
                            className="w-full py-1.5 rounded-lg bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* ── CURRENT SCHEDULED ITEMS ── */}
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">
                          Scheduled Medications ({prescribedMedicines.length})
                        </span>
                        {prescribedMedicines.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setPrescribedMedicines([])}
                            className="text-xs text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            Clear All
                          </button>
                        )}
                      </div>

                      {prescribedMedicines.length === 0 ? (
                        <div className="p-6 rounded-2xl border border-dashed border-slate-300 text-center text-slate-400 space-y-1">
                          <Pill className="w-6 h-6 mx-auto text-slate-400" />
                          <p className="text-xs font-semibold text-slate-600">
                            No medications scheduled yet.
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Search formulary items above or type custom drug details.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {prescribedMedicines.map((med, idx) => (
                            <div
                              key={idx}
                              className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-3 text-xs shadow-2xs"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900 text-xs sm:text-sm">
                                    {med.name}
                                  </span>
                                  <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 font-mono font-bold text-[10px]">
                                    {formatDosageMAN(med.dosage)}
                                  </span>
                                </div>
                                <span className="text-[11px] text-slate-500 block mt-0.5">
                                  {med.duration} • {med.instruction} • Qty to dispense: <strong className="text-slate-800">{med.qty} {med.unit || 'units'}</strong>
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveMedicine(idx)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                aria-label={`Remove ${med.name}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <QuestionnaireActions>
                      <QuestionnairePrevious onClick={() => setCurrentStep(1)}>
                        <ArrowLeft className="w-4 h-4 me-1.5" />
                        <span>Back to Diagnosis</span>
                      </QuestionnairePrevious>
                      <QuestionnaireNext
                        onClick={handleProceedStep}
                        disabled={prescribedMedicines.length === 0}
                        className={cn(
                          prescribedMedicines.length === 0 && 'opacity-40 cursor-not-allowed pointer-events-none'
                        )}
                      >
                        <span>Continue to Follow-Up & Bed Rest</span>
                        <ArrowRight className="w-4 h-4 ms-1.5" />
                      </QuestionnaireNext>
                    </QuestionnaireActions>
                  </QuestionnaireItem>
                )}

                {/* ═══════════════════════════════════════════════════════════
                    STEP 3: FOLLOW-UP & SEPARATE BED REST DIRECTIVE (NO SUBTEXT)
                   ═══════════════════════════════════════════════════════════ */}
                {currentStep === 3 && (
                  <QuestionnaireItem>
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                      <span className="text-xs text-slate-500">
                        Prescribed Medications: <strong className="text-slate-800">{prescribedMedicines.length} scheduled</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentStep(2)}
                        className="text-xs font-semibold text-teal-700 hover:underline cursor-pointer"
                      >
                        Edit Medicines
                      </button>
                    </div>

                    <QuestionnaireTitle>
                      Follow-Up & Academic Leave Certification
                    </QuestionnaireTitle>

                    {/* ── SECTION 1: FOLLOW-UP (MAIN TEXT ONLY, ZERO SUBTEXT) ── */}
                    <div className="space-y-2 pt-1">
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wide block">
                        Clinical Follow-Up / Review Schedule
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {FOLLOW_UP_OPTIONS.map((opt) => {
                          const isSelected = selectedFollowUp === opt
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setSelectedFollowUp(opt)}
                              className={cn(
                                'px-3.5 py-3 rounded-xl border text-left cursor-pointer transition-all flex items-center justify-between',
                                isSelected
                                  ? 'bg-teal-50/80 border-teal-700 text-teal-950 font-bold shadow-2xs ring-2 ring-teal-700/20'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                              )}
                            >
                              <span className="font-bold text-xs sm:text-sm text-slate-900">{opt}</span>
                              {isSelected && <Check className="w-4 h-4 text-teal-700 shrink-0" />}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* ── SECTION 2: DEDICATED BED REST (MAIN TEXT ONLY, ZERO SUBTEXT) ── */}
                    <div className="pt-4 border-t border-slate-200 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1 rounded bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                          <Bed className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-900 block">
                          Bed Rest Requirement and Note
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                        {BED_REST_OPTIONS.map((opt) => {
                          const isSelected = selectedBedRest === opt
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setSelectedBedRest(opt)}
                              className={cn(
                                'px-3.5 py-3 rounded-xl border text-left cursor-pointer transition-all flex items-center justify-between',
                                isSelected
                                  ? 'bg-amber-50/70 border-amber-600 text-amber-950 font-bold shadow-2xs ring-2 ring-amber-600/20'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                              )}
                            >
                              <span className="font-bold text-xs sm:text-sm text-slate-900">{opt}</span>
                              {isSelected && <Check className="w-4 h-4 text-amber-700 shrink-0" />}
                            </button>
                          )
                        })}
                      </div>

                      {/* Custom Days Input for Bed Rest */}
                      {selectedBedRest === 'Custom Days' && (
                        <div className="mt-2.5 p-3 rounded-xl bg-amber-50/50 border border-amber-200 flex flex-col sm:flex-row items-center gap-3">
                          <div className="w-full sm:w-32">
                            <label className="text-[10px] font-bold text-slate-700 block mb-1">Days of Rest:</label>
                            <input
                              type="number"
                              min="1"
                              max="30"
                              value={customBedRestDays}
                              onChange={(e) => setCustomBedRestDays(e.target.value)}
                              className="w-full px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-lg outline-none"
                            />
                          </div>
                          <div className="flex-1 w-full">
                            <label className="text-[10px] font-bold text-slate-700 block mb-1">Quarantine / Medical Note (Optional):</label>
                            <input
                              type="text"
                              value={customBedRestReason}
                              onChange={(e) => setCustomBedRestReason(e.target.value)}
                              placeholder="e.g. High fever quarantine, contagious infection..."
                              className="w-full px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-lg outline-none"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <QuestionnaireActions>
                      <QuestionnairePrevious onClick={() => setCurrentStep(2)}>
                        <ArrowLeft className="w-4 h-4 me-1.5" />
                        <span>Back</span>
                      </QuestionnairePrevious>
                      <QuestionnaireSubmit onClick={handleProceedStep}>
                        <span>Review Formal Prescription</span>
                        <ArrowRight className="w-4 h-4 ms-1.5" />
                      </QuestionnaireSubmit>
                    </QuestionnaireActions>
                  </QuestionnaireItem>
                )}

                {/* ═══════════════════════════════════════════════════════════
                    STAGE 4: FORMAL BLACK & WHITE E-PRESCRIPTION REVIEW
                   ═══════════════════════════════════════════════════════════ */}
                {currentStep === 4 && (
                  <div className="space-y-5 animate-fadeIn">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-slate-800" />
                        <h3 className="font-bold text-slate-900 text-base sm:text-lg">
                          Formal E-Prescription Review & Dispatch
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCurrentStep(1)}
                        className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                      >
                        Edit Responses
                      </button>
                    </div>

                    {/* ── AUTHENTIC CLINICAL BLACK & WHITE PRESCRIPTION SHEET ── */}
                    <div className="p-6 sm:p-8 bg-white border border-slate-300 rounded-2xl shadow-sm text-black space-y-5 font-sans">
                      
                      {/* Clinic & Doctor Header */}
                      <div className="space-y-1">
                        <h2 className="text-base sm:text-lg font-bold tracking-tight text-black">
                          CAMPUSCARE HEALTH CENTRE
                        </h2>
                        <p className="text-xs text-slate-700">
                          Thapar Institute of Engineering & Technology, Patiala - 147004
                        </p>
                        <p className="text-xs text-slate-700">
                          Ph: +91 175-2393000 | Email: healthcentre@thapar.edu | Closed: Sunday
                        </p>
                        <div className="pt-1">
                          <p className="text-sm font-bold text-black">
                            {doctor?.name ? (doctor.name.startsWith('Dr') ? doctor.name : `Dr. ${doctor.name}`) : 'Dr. Neha Kapoor'}
                          </p>
                          <p className="text-xs text-slate-700">
                            M.B.B.S, MD ({doctor?.specialization || 'General Physician'}) | Reg. No: {doctor?.regNo || 'TIET-DOC-0104'} | Room: {doctor?.room || '104'}
                          </p>
                        </div>
                      </div>

                      {/* Solid Black Dividing Line */}
                      <div className="border-b-2 border-black" />

                      {/* Patient Details & Date Bar */}
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <p className="font-bold text-black text-sm">
                            Patient Name: {patient.name} ({patient.gender || 'Student'})
                          </p>
                          <p className="font-bold text-black text-xs">
                            Date: {currentDateStr}
                          </p>
                        </div>
                        <p className="text-slate-700">
                          OPD ID: <strong className="text-black font-mono">{patient.rollNo}</strong>, Age: <strong className="text-black">{patient.age} Y</strong> | Blood: <strong className="text-black">{patient.bloodGroup}</strong>
                        </p>
                        <p className="text-slate-700">
                          Address: TIET Campus Hostels, Patiala - 147004
                        </p>
                      </div>

                      {/* Subtle Line */}
                      <div className="border-b border-slate-300" />

                      {/* Clinical Evaluation Section */}
                      <div className="space-y-3 text-xs">
                        <div>
                          <p className="font-bold text-black uppercase">Chief Complaints:</p>
                          <p className="text-slate-800 mt-0.5">
                            - {(patient.complaint || 'General Consultation').toUpperCase()}
                          </p>
                        </div>

                        <div>
                          <p className="font-bold text-black uppercase">Diagnosis:</p>
                          <p className="text-black font-bold text-xs sm:text-sm mt-0.5">
                            - {effectiveDiagnosis.toUpperCase()}
                          </p>
                        </div>
                      </div>

                      {/* Rx Symbol */}
                      <div className="pt-2">
                        <span className="font-serif font-bold text-2xl text-black block mb-1">
                          R
                        </span>

                        {/* Prescribed Medicines Table */}
                        <div className="border-y border-black py-1">
                          <table className="w-full text-left text-xs">
                            <thead className="border-b border-black text-black uppercase font-bold text-[11px]">
                              <tr>
                                <th className="py-2 px-1">Medicine Name</th>
                                <th className="py-2 px-1 text-center">Dosage (M-A-N)</th>
                                <th className="py-2 px-1 text-center">Duration</th>
                                <th className="py-2 px-1 text-right">Qty</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {prescribedMedicines.map((m, idx) => (
                                <tr key={idx} className="align-top">
                                  <td className="py-2 px-1">
                                    <span className="font-bold text-black block">
                                      {idx + 1}. {m.name.toUpperCase()}
                                    </span>
                                    <span className="text-[11px] text-slate-600 italic block">
                                      ({m.instruction || 'After Food'})
                                    </span>
                                  </td>
                                  <td className="py-2 px-1 text-center font-mono font-bold text-black">
                                    {formatDosageMAN(m.dosage)}
                                  </td>
                                  <td className="py-2 px-1 text-center text-slate-800">
                                    {m.duration}
                                  </td>
                                  <td className="py-2 px-1 text-right font-bold text-black">
                                    {m.qty}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Advice Given & Follow Up */}
                      <div className="space-y-3 pt-1 text-xs">
                        <div>
                          <p className="font-bold text-black uppercase">Advice Given:</p>
                          <p className="text-slate-800 mt-0.5">
                            - Follow prescribed medication schedule. Return if symptoms worsen.
                          </p>
                        </div>

                        <div>
                          <p className="font-bold text-black">
                            Follow Up:{' '}
                            <span className="font-semibold">
                              {selectedFollowUp === 'No schedule needed'
                                ? 'No schedule needed (SOS if symptoms persist)'
                                : selectedFollowUp}
                            </span>
                          </p>
                        </div>
                      </div>

                      {/* ── ACADEMIC BED REST CERTIFICATE (MAKE-UP EXAM PROOF) ── */}
                      {selectedBedRest !== 'No Bed Rest Advised' && (
                        <div className="p-3.5 border-2 border-black rounded-lg bg-slate-50/50 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between border-b border-black pb-1">
                            <span className="font-bold text-black uppercase tracking-wider text-[11px]">
                              OFFICIAL MEDICAL CERTIFICATE / ACADEMIC EXCUSE DIRECTIVE
                            </span>
                            <span className="font-mono text-[9px] font-bold text-black border border-black px-1.5 py-0.5 rounded">
                              PROOF FOR MAKE-UP EXAM
                            </span>
                          </div>
                          <p className="text-black leading-relaxed">
                            This is to certify that <strong>{patient.name}</strong> (Roll No: <strong className="font-mono">{patient.rollNo}</strong>) has been clinically evaluated at the TIET Health Centre and diagnosed with <strong>{effectiveDiagnosis}</strong>. The patient is advised strict bed rest and medical quarantine for <strong>{effectiveBedRestString}</strong> with effect from <strong>{currentDateStr}</strong>. The student is medically unfit to attend academic lectures, laboratory sessions, or examinations during this period.
                          </p>
                        </div>
                      )}

                      {/* Doctor Signature Block (Bottom Right) */}
                      <div className="pt-8 flex flex-col items-end text-right text-xs">
                        <p className="font-bold text-black text-sm">
                          {doctor?.name ? (doctor.name.startsWith('Dr') ? doctor.name : `Dr. ${doctor.name}`) : 'Dr. Neha Kapoor'}
                        </p>
                        <p className="text-slate-700">
                          M.B.B.S, MD, Reg. No: {doctor?.regNo || 'TIET-DOC-0104'}
                        </p>
                        <p className="text-slate-600 text-[11px]">
                          Medical Officer, TIET Health Centre
                        </p>
                      </div>

                      {/* Page Footer */}
                      <div className="pt-4 border-t border-slate-300 flex items-center justify-between text-[11px] text-slate-500">
                        <span>Page 1 of 1</span>
                        <span>CampusCare Health Centre Official Clinical Record</span>
                      </div>
                    </div>

                    {/* Final Actions */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={() => setCurrentStep(3)}
                          className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
                        >
                          Back to Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            generatePrescriptionPdf({
                              prescription: {
                                diagnosis: effectiveDiagnosis || 'OPD Consultation',
                                reason_for_visit: patient.complaint,
                                clinical_notes: 'Patient evaluated.',
                                dietAdvice: 'Take medications as prescribed.',
                                followUp: selectedFollowUp,
                                bedRest: effectiveBedRestString,
                              },
                              doctor: doctor || {},
                              patient: patient,
                              medicines: prescribedMedicines,
                              autoDownload: false,
                              openPrint: true,
                            })
                          }}
                          className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Printer className="w-4 h-4 text-slate-600" />
                          <span>Print Formal Slip</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={handleDispatch}
                        disabled={isFinalizing}
                        className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-900 disabled:opacity-50 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md"
                      >
                        <Send className="w-4 h-4" />
                        <span>{isFinalizing ? 'Dispatching to Dispensary...' : 'Sign & Dispatch to Dispensary'}</span>
                      </button>
                    </div>
                  </div>
                )}

              </Questionnaire>
            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
