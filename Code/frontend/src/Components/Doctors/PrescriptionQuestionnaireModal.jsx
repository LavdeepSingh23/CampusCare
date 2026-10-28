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
  Sparkles,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  User,
  HeartPulse,
  Activity,
  Clock,
  FileText,
  Pill,
  Calendar,
  Stethoscope,
  ChevronRight,
  Info,
} from 'lucide-react'
import {
  Questionnaire,
  QuestionnaireProgress,
  QuestionnaireItem,
  QuestionnaireTitle,
  QuestionnaireDescription,
  QuestionnaireChoices,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireInput,
  QuestionnaireError,
  QuestionnaireActions,
  QuestionnairePrevious,
  QuestionnaireSkip,
  QuestionnaireNext,
  QuestionnaireSubmit,
  buttonVariants,
} from '../ui/questionnaire'
import { cn } from '../../lib/utils'
import {
  MEDICINE_FORMULARY,
  FORMULARY_CATEGORIES,
} from '../../data/medicineFormulary'
import {
  calculatePrescriptionQuantity,
  checkDrugAllergyConflict,
  validatePrescriptionDraft,
} from '../../utils/prescriptionCalculations'
import { generatePrescriptionPdf } from '../../utils/prescriptionPdf'

/* ── PRE-CONFIGURED CLINICAL EVIDENCE PROTOCOLS ── */
const CLINICAL_PROTOCOLS = {
  'Viral Upper Respiratory Infection': {
    code: 'URI',
    label: 'Viral Upper Respiratory Infection',
    shortcut: '1',
    observations: ['Throat congested and erythematous', 'Chest clear bilaterally', 'Afebrile at examination', 'Vitals stable'],
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
    dietAdvice: 'Warm saline gargles thrice daily, steam inhalation, and ample warm fluid intake.',
    followUp: 'In 3 Days',
  },
  'Acute Pharyngitis / Tonsillitis': {
    code: 'PHARYNG',
    label: 'Acute Pharyngitis / Tonsillitis',
    shortcut: '2',
    observations: ['Pharyngeal congestion marked', 'Bilateral tonsillar hypertrophy', 'Cervical lymphadenopathy mild'],
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
    dietAdvice: 'Warm saline gargles thrice daily, soft non-spicy diet, avoid cold beverages.',
    followUp: 'In 3 Days',
  },
  'Allergic Rhinitis / Sinusitis': {
    code: 'RHINITIS',
    label: 'Allergic Rhinitis / Sinusitis',
    shortcut: '3',
    observations: ['Nasal mucosal edema present', 'Clear rhinorrhea noted', 'Posterior pharyngeal wall cobblestoning'],
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
    dietAdvice: 'Avoid allergen and cold air exposure, steam inhalation twice daily.',
    followUp: 'In 5 Days',
  },
  'Acute Gastritis / Dyspepsia': {
    code: 'GASTRITIS',
    label: 'Acute Gastritis / Dyspepsia',
    shortcut: '4',
    observations: ['Epigastric tenderness mild', 'Abdomen soft, non-distended', 'Bowel sounds present and normal'],
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
    dietAdvice: 'Bland non-spicy diet, small frequent meals, avoid tea, coffee and oily foods.',
    followUp: 'In 3 Days',
  },
  'Tension Headache / Migraine': {
    code: 'HEADACHE',
    label: 'Tension Headache / Migraine',
    shortcut: '5',
    observations: ['Neurological exam intact', 'Neck muscle tenderness present', 'Photophobia mild, afebrile'],
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
    dietAdvice: 'Strict screen break, adequate hydration, dark quiet room rest.',
    followUp: 'SOS as needed',
  },
  'Acute Muscular Strain': {
    code: 'STRAIN',
    label: 'Acute Muscular Strain',
    shortcut: '6',
    observations: ['Localized muscle tenderness', 'Range of motion mildly guarded', 'No joint effusion'],
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
    dietAdvice: 'Rest affected muscle, warm compress, avoid strenuous athletic activity.',
    followUp: 'In 5 Days',
  },
  'Acute Gastroenteritis': {
    code: 'AGE',
    label: 'Acute Gastroenteritis',
    shortcut: '7',
    observations: ['Diffuse abdominal discomfort', 'Mild dehydration signs', 'Hyperactive bowel sounds'],
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
    dietAdvice: 'Strict oral rehydration solution, boiled cooled water, banana and rice curd diet.',
    followUp: 'In 2 Days',
  },
}

/* ── COMMON CLINICAL FINDINGS REPOSITORY ── */
const CLINICAL_OBSERVATION_PRESETS = [
  'Throat congested and erythematous',
  'Chest clear bilaterally, vesicular breath sounds',
  'Afebrile at examination',
  'Vitals stable, hemodynamically compensated',
  'Abdomen soft, non-tender, no organomegaly',
  'Tonsillar hypertrophy with exudates',
  'Posterior pharyngeal cobblestoning',
  'Nasal mucosal congestion present',
  'Muscle tenderness without focal neurological deficit',
  'Pupils equal and reactive, neck supple',
]

/* ── DIET & LIFESTYLE PRESETS ── */
const DIET_ADVICE_PRESETS = [
  'Warm saline gargles thrice daily',
  'Steam inhalation twice daily',
  'Adequate oral hydration (2.5 - 3L daily)',
  'Bland, non-spicy, easily digestible diet',
  'Avoid cold beverages and refrigerated foods',
  'Adequate physical rest and uninterrupted sleep',
  'Strict screen rest and dark room environment',
  'Oral rehydration salts (ORS) in boiled cooled water',
]

/* ── FOLLOW UP INTERVALS ── */
const FOLLOW_UP_OPTIONS = [
  { label: 'In 2 Days', desc: 'Short-term review for acute symptoms' },
  { label: 'In 3 Days', desc: 'Standard clinical evaluation interval' },
  { label: 'In 5 Days', desc: 'Completion of antimicrobial/anti-inflammatory course' },
  { label: 'In 7 Days', desc: 'Resolution and post-recovery assessment' },
  { label: 'SOS as needed', desc: 'Return immediately if warning signs or persistent fever develop' },
]

export default function PrescriptionQuestionnaireModal({
  isOpen,
  onClose,
  patient,
  doctor,
  onFinalizePrescription,
  isFinalizing,
}) {
  // Stepper state: 1: Diagnosis | 2: Examination | 3: Medications | 4: Advice & Follow-up | 5: Formal Rx Review
  const [currentStep, setCurrentStep] = useState(1)

  // Clinical Draft State
  const [selectedDiagnosis, setSelectedDiagnosis] = useState('')
  const [customDiagnosis, setCustomDiagnosis] = useState('')
  const [selectedFindings, setSelectedFindings] = useState([])
  const [customClinicalNotes, setCustomClinicalNotes] = useState('')
  const [prescribedMedicines, setPrescribedMedicines] = useState([])
  const [selectedAdvice, setSelectedAdvice] = useState([])
  const [customAdvice, setCustomAdvice] = useState('')
  const [selectedFollowUp, setSelectedFollowUp] = useState('In 3 Days')

  // Drug Catalog / Formulary State inside Question 3
  const [drugSearchQuery, setDrugSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [customDrugName, setCustomDrugName] = useState('')
  const [customMorning, setCustomMorning] = useState(true)
  const [customAfternoon, setCustomAfternoon] = useState(false)
  const [customNight, setCustomNight] = useState(true)
  const [customDuration, setCustomDuration] = useState('3 days')
  const [customInstruction, setCustomInstruction] = useState('After food')
  const [customManualQty, setCustomManualQty] = useState('')

  // Validation / Error Notification
  const [stepError, setStepError] = useState(null)

  // Effective Clinical Diagnosis string
  const effectiveDiagnosis = customDiagnosis.trim() || selectedDiagnosis || ''

  // Initialize or reset draft when patient opens
  useEffect(() => {
    if (patient && isOpen) {
      setCurrentStep(1)
      setSelectedDiagnosis('')
      setCustomDiagnosis('')
      setSelectedFindings([])
      setCustomClinicalNotes('')
      setPrescribedMedicines([])
      setSelectedAdvice([])
      setCustomAdvice('')
      setSelectedFollowUp('In 3 Days')
      setStepError(null)
      setDrugSearchQuery('')
    }
  }, [patient?.rollNo, isOpen])

  // Filter Formulary Drugs
  const filteredDrugs = useMemo(() => {
    let list = MEDICINE_FORMULARY
    if (activeCategory !== 'All') {
      list = list.filter((m) => m.category === activeCategory)
    }
    if (drugSearchQuery.trim()) {
      const q = drugSearchQuery.toLowerCase()
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.genericName.toLowerCase().includes(q) ||
          m.indications.some((ind) => ind.toLowerCase().includes(q))
      )
    }
    return list.slice(0, 10)
  }, [drugSearchQuery, activeCategory])

  // Auto-fill fast-track protocol
  const applyProtocol = (protocolKey) => {
    const proto = CLINICAL_PROTOCOLS[protocolKey]
    if (!proto) return

    setSelectedDiagnosis(proto.label)
    setCustomDiagnosis('')
    setSelectedFindings(proto.observations)
    setPrescribedMedicines(proto.medications)
    setSelectedAdvice([proto.dietAdvice])
    setSelectedFollowUp(proto.followUp)
    setStepError(null)
  }

  // Handle Keyboard Shortcuts for Diagnosis (1 - 7)
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      // Ignore shortcut if user is typing in an input or textarea
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return

      if (currentStep === 1) {
        const protocols = Object.keys(CLINICAL_PROTOCOLS)
        const num = parseInt(e.key, 10)
        if (num >= 1 && num <= protocols.length) {
          applyProtocol(protocols[num - 1])
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, currentStep])

  // Allergy safety check
  const patientAllergies = patient?.allergies || []

  // Add Formulary Drug Handler
  const handleAddFormularyDrug = (drug) => {
    const isAlreadyAdded = prescribedMedicines.some((m) => m.name.toLowerCase() === drug.name.toLowerCase())
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

  // Add Custom Drug Handler
  const handleAddCustomDrug = (e) => {
    e?.preventDefault()
    if (!customDrugName.trim()) {
      setStepError('Please enter the medicine name.')
      return
    }

    // Build dosage code
    const m = customMorning ? '1' : '0'
    const a = customAfternoon ? '1' : '0'
    const n = customNight ? '1' : '0'
    const dosageCode = `${m}-${a}-${n}`

    if (dosageCode === '0-0-0') {
      setStepError('Select at least one frequency schedule (Morning, Afternoon, or Night).')
      return
    }

    const calculatedQty = customManualQty
      ? parseInt(customManualQty, 10)
      : calculatePrescriptionQuantity(dosageCode, customDuration)

    const newItem = {
      name: customDrugName.trim(),
      dosage: dosageCode,
      duration: customDuration,
      instruction: customInstruction,
      qty: calculatedQty || 1,
      unit: 'units',
    }

    setPrescribedMedicines((prev) => [...prev, newItem])
    setCustomDrugName('')
    setCustomManualQty('')
    setStepError(null)
  }

  // Remove drug from draft
  const handleRemoveMedicine = (index) => {
    setPrescribedMedicines((prev) => prev.filter((_, i) => i !== index))
  }

  // Step Validation & Forward Navigation
  const handleProceedStep = () => {
    setStepError(null)

    if (currentStep === 1) {
      if (!effectiveDiagnosis.trim()) {
        setStepError('Select or enter a clinical diagnosis to proceed.')
        return
      }
      setCurrentStep(2)
      return
    }

    if (currentStep === 2) {
      setCurrentStep(3)
      return
    }

    if (currentStep === 3) {
      if (prescribedMedicines.length === 0) {
        setStepError('Prescribe at least one medication or apply the recommended protocol.')
        return
      }
      setCurrentStep(4)
      return
    }

    if (currentStep === 4) {
      setCurrentStep(5)
      return
    }
  }

  // Final Dispatch
  const handleDispatch = () => {
    const combinedAdvice = [
      ...selectedAdvice,
      customAdvice.trim() ? customAdvice.trim() : null,
    ]
      .filter(Boolean)
      .join('; ')

    const combinedNotes = [
      ...selectedFindings,
      customClinicalNotes.trim() ? customClinicalNotes.trim() : null,
    ]
      .filter(Boolean)
      .join('. ')

    const payload = {
      diagnosis: effectiveDiagnosis,
      clinicalNotes: combinedNotes,
      medicines: prescribedMedicines,
      dietAdvice: combinedAdvice,
      followUp: selectedFollowUp,
    }

    onFinalizePrescription(payload)
  }

  if (!isOpen || !patient) return null

  // Active protocol recommendation for Step 3 banner
  const matchedProtocol = Object.values(CLINICAL_PROTOCOLS).find(
    (p) => p.label.toLowerCase() === effectiveDiagnosis.toLowerCase()
  )

  const currentDateStr = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

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
            
            {/* ── TOP HEADER & PATIENT BANNER (PURE WHITE LIGHT THEME) ── */}
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
                    <span>Age: <strong className="text-slate-800">{patient.age}</strong></span>
                    <span>Blood: <strong className="text-slate-800">{patient.bloodGroup}</strong></span>
                    <span>BP: <strong className="text-slate-800">{patient.vitals?.bp || 'N/A'}</strong></span>
                    <span>Pulse: <strong className="text-slate-800">{patient.vitals?.pulse || 'N/A'} bpm</strong></span>
                    <span>SpO2: <strong className="text-slate-800">{patient.vitals?.spo2 || 'N/A'}%</strong></span>
                    <span>Temp: <strong className="text-slate-800">{patient.vitals?.temp || 'N/A'}</strong></span>
                    
                    {patientAllergies.some((a) => a !== 'None declared') ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                        Allergy: {patientAllergies.join(', ')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                        NKDA
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <QuestionnaireProgress className="bg-slate-100 text-slate-700 px-3 py-1 rounded-lg border border-slate-200">
                  {currentStep <= 4 ? `Step ${currentStep} of 4 • ${currentStep * 25}%` : 'Formal Review'}
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
                    QUESTION 1: PRIMARY CLINICAL DIAGNOSIS
                   ═══════════════════════════════════════════════════════════ */}
                {currentStep === 1 && (
                  <QuestionnaireItem>
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800 block mb-0.5">
                        Triage Chief Complaint
                      </span>
                      <p className="text-slate-900 text-sm font-medium">
                        "{patient.complaint || 'No complaint recorded at intake.'}"
                      </p>
                    </div>

                    <QuestionnaireTitle>
                      Primary Clinical Diagnosis
                    </QuestionnaireTitle>
                    <QuestionnaireDescription>
                      Select an evidence-based clinical presentation or enter a specific diagnosis for this student. Press 1 through 7 on your keyboard for rapid selection.
                    </QuestionnaireDescription>

                    <QuestionnaireChoices className="grid-cols-1 sm:grid-cols-2 pt-2">
                      {Object.entries(CLINICAL_PROTOCOLS).map(([key, proto]) => {
                        const isSelected = selectedDiagnosis === proto.label
                        return (
                          <QuestionnaireChoice
                            key={key}
                            checked={isSelected}
                            shortcut={proto.shortcut}
                            onClick={() => applyProtocol(key)}
                          >
                            <span className="font-bold text-slate-900 text-sm">
                              {proto.label}
                            </span>
                            <QuestionnaireChoiceDescription>
                              Pre-configured protocol: {proto.medications.map((m) => m.name.split(' ')[0]).join(' + ')}
                            </QuestionnaireChoiceDescription>
                          </QuestionnaireChoice>
                        )
                      })}
                    </QuestionnaireChoices>

                    <div className="pt-2">
                      <label className="text-xs font-bold text-slate-800 block mb-1.5">
                        Or Enter Custom Diagnosis:
                      </label>
                      <QuestionnaireInput
                        value={customDiagnosis}
                        onChange={(e) => {
                          setCustomDiagnosis(e.target.value)
                          if (e.target.value.trim()) setSelectedDiagnosis('')
                        }}
                        placeholder="Enter diagnosis..."
                      />
                    </div>

                    <QuestionnaireActions>
                      <span className="text-xs text-slate-500">
                        Selected: <strong className="text-slate-900">{effectiveDiagnosis || 'None selected'}</strong>
                      </span>
                      <QuestionnaireNext onClick={handleProceedStep}>
                        <span>Continue to Examination</span>
                        <ArrowRight className="w-4 h-4 ms-1.5" />
                      </QuestionnaireNext>
                    </QuestionnaireActions>
                  </QuestionnaireItem>
                )}

                {/* ═══════════════════════════════════════════════════════════
                    QUESTION 2: CLINICAL EXAMINATION & OBSERVATIONS
                   ═══════════════════════════════════════════════════════════ */}
                {currentStep === 2 && (
                  <QuestionnaireItem multiple>
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">Diagnosis:</span>
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                          {effectiveDiagnosis}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCurrentStep(1)}
                        className="text-xs font-semibold text-teal-700 hover:underline cursor-pointer"
                      >
                        Edit Diagnosis
                      </button>
                    </div>

                    <QuestionnaireTitle>
                      Objective Clinical Findings & Physical Examination
                    </QuestionnaireTitle>
                    <QuestionnaireDescription>
                      Select any observed clinical signs during your physical check-up. You may select multiple items or add custom examination notes.
                    </QuestionnaireDescription>

                    <QuestionnaireChoices className="grid-cols-1 sm:grid-cols-2 pt-2">
                      {CLINICAL_OBSERVATION_PRESETS.map((finding) => {
                        const isChecked = selectedFindings.includes(finding)
                        return (
                          <QuestionnaireChoice
                            key={finding}
                            checked={isChecked}
                            onClick={() => {
                              setSelectedFindings((prev) =>
                                prev.includes(finding)
                                  ? prev.filter((f) => f !== finding)
                                  : [...prev, finding]
                              )
                            }}
                          >
                            <span className="font-semibold text-slate-800 text-xs sm:text-sm">
                              {finding}
                            </span>
                          </QuestionnaireChoice>
                        )
                      })}
                    </QuestionnaireChoices>

                    <div className="pt-2">
                      <label className="text-xs font-bold text-slate-800 block mb-1.5">
                        Additional Clinical Examination Notes (Optional):
                      </label>
                      <textarea
                        rows={2}
                        value={customClinicalNotes}
                        onChange={(e) => setCustomClinicalNotes(e.target.value)}
                        placeholder="Enter clinical examination notes..."
                        className="w-full text-xs sm:text-sm text-slate-900 bg-white border border-slate-300 rounded-xl p-3 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
                      />
                    </div>

                    <QuestionnaireActions>
                      <QuestionnairePrevious onClick={() => setCurrentStep(1)}>
                        <ArrowLeft className="w-4 h-4 me-1.5" />
                        <span>Back</span>
                      </QuestionnairePrevious>
                      <div className="flex items-center gap-2">
                        <QuestionnaireSkip onClick={() => setCurrentStep(3)}>
                          Skip Observations
                        </QuestionnaireSkip>
                        <QuestionnaireNext onClick={handleProceedStep}>
                          <span>Continue to Medications</span>
                          <ArrowRight className="w-4 h-4 ms-1.5" />
                        </QuestionnaireNext>
                      </div>
                    </QuestionnaireActions>
                  </QuestionnaireItem>
                )}

                {/* ═══════════════════════════════════════════════════════════
                    QUESTION 3: PRESCRIBE MEDICATIONS & DOSAGE
                   ═══════════════════════════════════════════════════════════ */}
                {currentStep === 3 && (
                  <QuestionnaireItem>
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">Active Consultation:</span>
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
                    <QuestionnaireDescription>
                      Apply the recommended clinical evidence bundle or search university formulary inventory. Dosages and total quantities are calculated automatically.
                    </QuestionnaireDescription>

                    {/* ── FAST TRACK RECOMMENDATION BANNER ── */}
                    {matchedProtocol && (
                      <div className="p-4 rounded-2xl bg-teal-50/70 border border-teal-200 space-y-3">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800 block">
                              Fast-Track Treatment Bundle for {matchedProtocol.label}
                            </span>
                            <p className="text-xs text-slate-700 mt-0.5">
                              {matchedProtocol.medications.map((m) => `${m.name} (${m.dosage})`).join(' + ')}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setPrescribedMedicines(matchedProtocol.medications)
                              setStepError(null)
                            }}
                            className="px-3.5 py-1.5 rounded-xl bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-teal-200" />
                            <span>Apply Protocol Bundle</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ── FORMULARY SEARCH & CATALOG ── */}
                    <div className="space-y-3 pt-1">
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                        <div className="relative flex-1">
                          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={drugSearchQuery}
                            onChange={(e) => setDrugSearchQuery(e.target.value)}
                            placeholder="Search medicines by trade or salt name..."
                            className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-white border border-slate-300 rounded-xl outline-none focus:border-teal-600"
                          />
                        </div>
                        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                          {['All', ...FORMULARY_CATEGORIES.slice(0, 4)].map((cat) => (
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

                      {/* Filtered Drug Chips */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                        {filteredDrugs.map((drug) => {
                          const allergyConflict = checkDrugAllergyConflict(drug, patientAllergies)
                          const alreadyAdded = prescribedMedicines.some((m) => m.name.toLowerCase() === drug.name.toLowerCase())
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
                                  {drug.defaultDosage} • {drug.defaultDuration} • {drug.defaultTiming}
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
                      </div>
                    </div>

                    {/* ── CUSTOM DRUG ADDER ── */}
                    <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
                        Or Prescribe Custom Medication
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                        <div className="sm:col-span-5">
                          <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                            Drug Name & Strength
                          </label>
                          <input
                            type="text"
                            value={customDrugName}
                            onChange={(e) => setCustomDrugName(e.target.value)}
                            placeholder="Enter medicine name..."
                            className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg outline-none focus:border-teal-600"
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                            Frequency (M - A - N)
                          </label>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setCustomMorning((p) => !p)}
                              className={cn(
                                'flex-1 py-1 rounded text-xs font-bold border cursor-pointer',
                                customMorning ? 'bg-teal-700 text-white border-teal-700' : 'bg-white text-slate-500 border-slate-200'
                              )}
                            >
                              M
                            </button>
                            <button
                              type="button"
                              onClick={() => setCustomAfternoon((p) => !p)}
                              className={cn(
                                'flex-1 py-1 rounded text-xs font-bold border cursor-pointer',
                                customAfternoon ? 'bg-teal-700 text-white border-teal-700' : 'bg-white text-slate-500 border-slate-200'
                              )}
                            >
                              A
                            </button>
                            <button
                              type="button"
                              onClick={() => setCustomNight((p) => !p)}
                              className={cn(
                                'flex-1 py-1 rounded text-xs font-bold border cursor-pointer',
                                customNight ? 'bg-teal-700 text-white border-teal-700' : 'bg-white text-slate-500 border-slate-200'
                              )}
                            >
                              N
                            </button>
                          </div>
                        </div>
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
                            Click "Apply Protocol Bundle" above or add items from the catalog.
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
                                    {med.dosage}
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
                      <QuestionnairePrevious onClick={() => setCurrentStep(2)}>
                        <ArrowLeft className="w-4 h-4 me-1.5" />
                        <span>Back</span>
                      </QuestionnairePrevious>
                      <QuestionnaireNext onClick={handleProceedStep}>
                        <span>Continue to Advice & Review</span>
                        <ArrowRight className="w-4 h-4 ms-1.5" />
                      </QuestionnaireNext>
                    </QuestionnaireActions>
                  </QuestionnaireItem>
                )}

                {/* ═══════════════════════════════════════════════════════════
                    QUESTION 4: DIET ADVICE & FOLLOW-UP SCHEDULE
                   ═══════════════════════════════════════════════════════════ */}
                {currentStep === 4 && (
                  <QuestionnaireItem multiple>
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                      <span className="text-xs text-slate-500">
                        Prescribed Items: <strong className="text-slate-800">{prescribedMedicines.length} scheduled</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentStep(3)}
                        className="text-xs font-semibold text-teal-700 hover:underline cursor-pointer"
                      >
                        Edit Medicines
                      </button>
                    </div>

                    <QuestionnaireTitle>
                      Dietary & Lifestyle Advice
                    </QuestionnaireTitle>
                    <QuestionnaireDescription>
                      Select recommended patient counseling instructions. Multi-select all that apply.
                    </QuestionnaireDescription>

                    <QuestionnaireChoices className="grid-cols-1 sm:grid-cols-2 pt-2">
                      {DIET_ADVICE_PRESETS.map((advice) => {
                        const isChecked = selectedAdvice.includes(advice)
                        return (
                          <QuestionnaireChoice
                            key={advice}
                            checked={isChecked}
                            onClick={() => {
                              setSelectedAdvice((prev) =>
                                prev.includes(advice)
                                  ? prev.filter((a) => a !== advice)
                                  : [...prev, advice]
                              )
                            }}
                          >
                            <span className="font-semibold text-slate-800 text-xs sm:text-sm">
                              {advice}
                            </span>
                          </QuestionnaireChoice>
                        )
                      })}
                    </QuestionnaireChoices>

                    <div className="pt-2">
                      <label className="text-xs font-bold text-slate-800 block mb-1.5">
                        Custom Dietary / Lifestyle Instructions:
                      </label>
                      <QuestionnaireInput
                        value={customAdvice}
                        onChange={(e) => setCustomAdvice(e.target.value)}
                        placeholder="Enter advice..."
                      />
                    </div>

                    <div className="pt-3">
                      <label className="text-xs font-bold text-slate-800 block mb-1.5">
                        Follow-Up / Review Schedule:
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {FOLLOW_UP_OPTIONS.map((f) => (
                          <button
                            key={f.label}
                            type="button"
                            onClick={() => setSelectedFollowUp(f.label)}
                            className={cn(
                              'p-2.5 rounded-xl border text-xs text-left cursor-pointer transition-all',
                              selectedFollowUp === f.label
                                ? 'bg-teal-50 border-teal-700 font-bold text-teal-900 shadow-2xs'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            )}
                          >
                            <span className="block font-bold">{f.label}</span>
                            <span className="text-[10px] text-slate-400 block mt-0.5 leading-tight">{f.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <QuestionnaireActions>
                      <QuestionnairePrevious onClick={() => setCurrentStep(3)}>
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
                    STAGE 5: FORMAL BLACK & WHITE E-PRESCRIPTION REVIEW
                   ═══════════════════════════════════════════════════════════ */}
                {currentStep === 5 && (
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

                    {/* ── AUTHENTIC CLINICAL BLACK & WHITE PRESCRIPTION SHEET (Matching Image 3) ── */}
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
                            - {(patient.complaint || 'Eye Irritation').toUpperCase()}
                          </p>
                        </div>

                        <div>
                          <p className="font-bold text-black uppercase">Diagnosis:</p>
                          <p className="text-black font-bold text-xs sm:text-sm mt-0.5">
                            - {effectiveDiagnosis.toUpperCase()}
                          </p>
                        </div>

                        {(selectedFindings.length > 0 || customClinicalNotes.trim()) && (
                          <div>
                            <p className="font-bold text-black uppercase">Investigations / Clinical Notes:</p>
                            <p className="text-slate-800 mt-0.5">
                              - {[...selectedFindings, customClinicalNotes.trim()].filter(Boolean).join('. ').toUpperCase()}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Rx Symbol */}
                      <div className="pt-2">
                        <span className="font-serif font-bold text-2xl text-black block mb-1">
                          R
                        </span>

                        {/* Prescribed Medicines Table (Black & White Rules) */}
                        <div className="border-y border-black py-1">
                          <table className="w-full text-left text-xs">
                            <thead className="border-b border-black text-black uppercase font-bold text-[11px]">
                              <tr>
                                <th className="py-2 px-1">Medicine Name</th>
                                <th className="py-2 px-1 text-center">Dosage</th>
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
                                  <td className="py-2 px-1 text-center font-mono font-semibold text-black">
                                    {m.dosage}
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
                          <div className="mt-0.5 space-y-0.5 text-slate-800">
                            {[...selectedAdvice, customAdvice.trim()].filter(Boolean).map((adv, i) => (
                              <p key={i}>- {adv.toUpperCase()}</p>
                            ))}
                            {selectedAdvice.length === 0 && !customAdvice.trim() && (
                              <p>- ADEQUATE HYDRATION AND REST.</p>
                            )}
                          </div>
                        </div>

                        <div>
                          <p className="font-bold text-black">
                            Follow Up: <span className="font-semibold">{selectedFollowUp}</span>
                          </p>
                        </div>
                      </div>

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
                          onClick={() => setCurrentStep(4)}
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
                                clinical_notes: [...selectedFindings, customClinicalNotes.trim()].filter(Boolean).join('. '),
                                dietAdvice: [...selectedAdvice, customAdvice.trim()].filter(Boolean).join('; '),
                                followUp: selectedFollowUp,
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
