import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
  Lock,
  User,
  HeartPulse,
  Phone,
  Plus,
  Trash2,
  AlertTriangle,
  RotateCcw,
  Loader2,
  Building2,
  GraduationCap,
  Save,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { fetchStudentMe, updateStudentProfile } from '../../api'
import campusCareLogo from '../../assets/campuscare-logo.png'

const VALID_SEX_OPTIONS = ['MALE', 'FEMALE', 'OTHER']
const VALID_BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
const SEVERITY_OPTIONS = ['MILD', 'MODERATE', 'SEVERE', 'UNKNOWN']

const SECTION_STEPS = [
  { id: 'academic', title: 'University Records', icon: GraduationCap, readOnly: true },
  { id: 'personal', title: 'Personal Demographics', icon: User },
  { id: 'emergency', title: 'Emergency Contact', icon: Phone },
  { id: 'clinical', title: 'Medical Declarations', icon: HeartPulse },
]

export default function StudentProfileOnboarding({ isOnboarding = false }) {
  const { student: authStudent, userRole, logout } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isForceOnboarding = isOnboarding || searchParams.get('onboarding') === 'true'

  const [activeSection, setActiveSection] = useState('personal')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')
  const [showExitConfirm, setShowExitConfirm] = useState(false)

  // Server-provided initial data & completion status
  const [initialData, setInitialData] = useState(null)
  const [completionStatus, setCompletionStatus] = useState({
    isComplete: false,
    percentage: 0,
    status: 'INCOMPLETE',
    missingFields: [],
    completedFields: [],
  })

  // Form state
  const [formData, setFormData] = useState({
    // Academic (read-only)
    rollNumber: '',
    fullName: '',
    email: '',
    program: 'B.E.',
    branch: '',
    department: '',
    semester: 6,
    status: 'ACTIVE',

    // Personal (editable)
    phoneNumber: '',
    dateOfBirth: '',
    sex: '',
    bloodGroup: '',

    // Emergency Contact (editable)
    emergencyName: '',
    emergencyRelationship: '',
    emergencyPhone: '',

    // Clinical Declarations
    hasAllergies: false,
    allergies: [],

    hasChronicConditions: false,
    chronicConditions: [],

    hasCurrentMedications: false,
    currentMedications: [],
  })

  // Inline validation errors
  const [fieldErrors, setFieldErrors] = useState({})

  // Load current student telemetry
  const loadProfile = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const data = await fetchStudentMe()
      const s = data.student || {}
      const contacts = data.emergencyContacts || []
      const primaryContact = contacts[0] || {}

      const hasAllergiesExist = Array.isArray(data.allergies) && data.allergies.length > 0
      const hasConditionsExist = Array.isArray(data.chronicConditions) && data.chronicConditions.length > 0
      const hasMedsExist = Array.isArray(data.currentMedications) && data.currentMedications.length > 0

      const parsedData = {
        rollNumber: s.rollNumber || authStudent?.rollNumber || '',
        fullName: s.fullName || s.name || authStudent?.name || '',
        email: s.email || authStudent?.email || '',
        program: s.program || 'B.E.',
        branch: s.branch || '',
        department: s.department || s.branch || '',
        semester: s.semester || 6,
        status: s.status || 'ACTIVE',

        phoneNumber: s.phoneNumber || '',
        dateOfBirth: s.dateOfBirth ? s.dateOfBirth.slice(0, 10) : '',
        sex: s.sex || '',
        bloodGroup: s.bloodGroup && s.bloodGroup !== 'Not recorded' ? s.bloodGroup : '',

        emergencyName: primaryContact.name || '',
        emergencyRelationship: primaryContact.relationship || '',
        emergencyPhone: primaryContact.phoneNumber || '',

        hasAllergies: hasAllergiesExist,
        allergies: hasAllergiesExist
          ? data.allergies.map((a) => ({
              allergen: typeof a === 'string' ? a : a.allergen || '',
              reaction: typeof a === 'string' ? '' : a.reaction || '',
              severity: typeof a === 'string' ? 'MILD' : a.severity || 'MILD',
            }))
          : [],

        hasChronicConditions: hasConditionsExist,
        chronicConditions: hasConditionsExist
          ? data.chronicConditions.map((c) => (typeof c === 'string' ? c : c.name || ''))
          : [],

        hasCurrentMedications: hasMedsExist,
        currentMedications: hasMedsExist
          ? data.currentMedications.map((m) =>
              typeof m === 'string'
                ? { medicineName: m, strength: '', dose: '', reason: '' }
                : {
                    medicineName: m.medicineName || m.name || '',
                    strength: m.strength || '',
                    dose: m.dose || '',
                    reason: m.reason || '',
                  }
            )
          : [],
      }

      setFormData(parsedData)
      setInitialData(JSON.parse(JSON.stringify(parsedData)))

      if (data.profileCompletion) {
        setCompletionStatus(data.profileCompletion)
      }
    } catch (err) {
      if (err.status === 401) {
        logout()
        navigate('/user_login?expired=true')
        return
      }
      setLoadError(err.message || 'Failed to load profile data. Please refresh or retry.')
    } finally {
      setLoading(false)
    }
  }, [authStudent, logout, navigate])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  // Track if form has unsaved changes
  const isDirty = useMemo(() => {
    if (!initialData) return false
    return JSON.stringify(formData) !== JSON.stringify(initialData)
  }, [formData, initialData])

  // Prevent accidental unload if dirty
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  // Validate fields per backend specification
  const validateForm = () => {
    const errors = {}

    // 1. Phone number (10 to 15 digits)
    const phoneDigits = (formData.phoneNumber || '').replace(/\D/g, '')
    if (!formData.phoneNumber.trim()) {
      errors.phoneNumber = 'Personal phone number is required.'
    } else if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      errors.phoneNumber = 'Phone number must contain between 10 and 15 digits.'
    }

    // 2. Date of birth
    if (!formData.dateOfBirth) {
      errors.dateOfBirth = 'Date of birth is required.'
    } else {
      const dob = new Date(formData.dateOfBirth)
      const now = new Date()
      if (isNaN(dob.getTime())) {
        errors.dateOfBirth = 'Invalid date format. Use YYYY-MM-DD.'
      } else if (dob > now) {
        errors.dateOfBirth = 'Date of birth cannot be in the future.'
      } else {
        const age = (now - dob) / (1000 * 60 * 60 * 24 * 365.25)
        if (age < 15 || age > 100) {
          errors.dateOfBirth = `Student age must be between 15 and 100 years (calculated: ${Math.floor(age)}).`
        }
      }
    }

    // 3. Gender Identity
    if (!formData.sex) {
      errors.sex = 'Please select a gender identity.'
    } else if (!VALID_SEX_OPTIONS.includes(formData.sex)) {
      errors.sex = 'Invalid gender identity selection.'
    }

    // 4. Blood Group
    if (!formData.bloodGroup) {
      errors.bloodGroup = 'Blood group is required for clinical emergency safety.'
    } else if (!VALID_BLOOD_GROUPS.includes(formData.bloodGroup)) {
      errors.bloodGroup = 'Please select a valid ABO/Rh blood group.'
    }

    // 5. Emergency Contact
    if (!formData.emergencyName.trim()) {
      errors.emergencyName = 'Emergency contact full name is required.'
    } else if (formData.emergencyName.trim().length < 2) {
      errors.emergencyName = 'Contact name must be at least 2 characters.'
    }

    if (!formData.emergencyRelationship.trim()) {
      errors.emergencyRelationship = 'Relationship is required (e.g. Father, Mother, Guardian).'
    } else if (formData.emergencyRelationship.trim().length < 2) {
      errors.emergencyRelationship = 'Relationship must be at least 2 characters.'
    }

    const emPhoneDigits = (formData.emergencyPhone || '').replace(/\D/g, '')
    if (!formData.emergencyPhone.trim()) {
      errors.emergencyPhone = 'Emergency contact phone number is required.'
    } else if (emPhoneDigits.length < 7 || emPhoneDigits.length > 15) {
      errors.emergencyPhone = 'Contact phone number must contain between 7 and 15 digits.'
    }

    // 6. Allergies validation
    if (formData.hasAllergies) {
      if (formData.allergies.length === 0) {
        errors.allergies = 'Please add at least one allergy item or select "No known allergies".'
      } else {
        formData.allergies.forEach((a, i) => {
          if (!a.allergen.trim()) {
            errors[`allergy_${i}`] = 'Allergen name is required.'
          }
        })
      }
    }

    // 7. Chronic conditions validation
    if (formData.hasChronicConditions) {
      if (formData.chronicConditions.length === 0) {
        errors.chronicConditions = 'Please add at least one condition or select "No chronic conditions".'
      } else {
        formData.chronicConditions.forEach((c, i) => {
          if (!c.trim()) {
            errors[`condition_${i}`] = 'Condition name cannot be blank.'
          }
        })
      }
    }

    // 8. Medications validation
    if (formData.hasCurrentMedications) {
      if (formData.currentMedications.length === 0) {
        errors.currentMedications = 'Please add at least one medication or select "No ongoing medications".'
      } else {
        formData.currentMedications.forEach((m, i) => {
          if (!m.medicineName.trim()) {
            errors[`medication_${i}`] = 'Medicine name is required.'
          }
        })
      }
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  // Handle Save Submission
  const handleSave = async (e) => {
    if (e) e.preventDefault()
    setSaveError('')
    setSaveSuccess('')

    if (!validateForm()) {
      // Auto navigate to the first section with an error
      const keys = Object.keys(fieldErrors)
      if (keys.some((k) => ['phoneNumber', 'dateOfBirth', 'sex', 'bloodGroup'].includes(k))) {
        setActiveSection('personal')
      } else if (keys.some((k) => ['emergencyName', 'emergencyRelationship', 'emergencyPhone'].includes(k))) {
        setActiveSection('emergency')
      } else if (keys.some((k) => k.includes('allergy') || k.includes('condition') || k.includes('medication'))) {
        setActiveSection('clinical')
      }
      return
    }

    setSaving(true)

    const payload = {
      phoneNumber: formData.phoneNumber.trim(),
      dateOfBirth: formData.dateOfBirth,
      sex: formData.sex,
      bloodGroup: formData.bloodGroup,
      emergencyContact: {
        name: formData.emergencyName.trim(),
        relationship: formData.emergencyRelationship.trim(),
        phoneNumber: formData.emergencyPhone.trim(),
      },
      hasAllergies: Boolean(formData.hasAllergies),
      allergies: formData.hasAllergies
        ? formData.allergies.map((a) => ({
            allergen: a.allergen.trim(),
            reaction: (a.reaction || '').trim() || null,
            severity: a.severity || 'MILD',
          }))
        : [],
      hasChronicConditions: Boolean(formData.hasChronicConditions),
      chronicConditions: formData.hasChronicConditions
        ? formData.chronicConditions.map((c) => c.trim()).filter(Boolean)
        : [],
      hasCurrentMedications: Boolean(formData.hasCurrentMedications),
      currentMedications: formData.hasCurrentMedications
        ? formData.currentMedications.map((m) => ({
            medicineName: m.medicineName.trim(),
            strength: (m.strength || '').trim() || null,
            dose: (m.dose || '').trim() || null,
            reason: (m.reason || '').trim() || null,
          }))
        : [],
    }

    try {
      const res = await updateStudentProfile(payload)
      setSaveSuccess(res.message || 'Profile saved successfully.')

      if (res.profileCompletion) {
        setCompletionStatus(res.profileCompletion)
      }

      setInitialData(JSON.parse(JSON.stringify(formData)))

      // Return to dashboard after saving with a slight delay so user sees confirmation
      setTimeout(() => {
        navigate('/student_dashboard', { replace: true })
      }, 1200)
    } catch (err) {
      if (err.status === 401) {
        logout()
        navigate('/user_login?expired=true')
        return
      }
      setSaveError(err.message || 'Failed to update profile. Please verify your fields and retry.')
    } finally {
      setSaving(false)
    }
  }

  // Navigation back with unsaved warning
  const handleBackToDashboard = () => {
    if (isDirty) {
      setShowExitConfirm(true)
    } else {
      navigate('/student_dashboard')
    }
  }

  // Helper for adding/removing array rows
  const addAllergy = () => {
    setFormData((prev) => ({
      ...prev,
      hasAllergies: true,
      allergies: [...prev.allergies, { allergen: '', reaction: '', severity: 'MILD' }],
    }))
  }

  const removeAllergy = (index) => {
    setFormData((prev) => {
      const next = prev.allergies.filter((_, i) => i !== index)
      return { ...prev, allergies: next, hasAllergies: next.length > 0 }
    })
  }

  const addCondition = () => {
    setFormData((prev) => ({
      ...prev,
      hasChronicConditions: true,
      chronicConditions: [...prev.chronicConditions, ''],
    }))
  }

  const removeCondition = (index) => {
    setFormData((prev) => {
      const next = prev.chronicConditions.filter((_, i) => i !== index)
      return { ...prev, chronicConditions: next, hasChronicConditions: next.length > 0 }
    })
  }

  const addMedication = () => {
    setFormData((prev) => ({
      ...prev,
      hasCurrentMedications: true,
      currentMedications: [
        ...prev.currentMedications,
        { medicineName: '', strength: '', dose: '', reason: '' },
      ],
    }))
  }

  const removeMedication = (index) => {
    setFormData((prev) => {
      const next = prev.currentMedications.filter((_, i) => i !== index)
      return { ...prev, currentMedications: next, hasCurrentMedications: next.length > 0 }
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F2F6F5] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-teal-800 animate-spin" />
        <p className="text-slate-500 font-medium text-sm">Loading student registration portal…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F2F6F5] text-slate-900 pb-28">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&display=swap');
        .cc-display { font-family: 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif; letter-spacing: -0.01em; }
      `}</style>

      {/* ── Top Header ── */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBackToDashboard}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2.5">
            <img src={campusCareLogo} alt="Logo" className="w-8 h-8 object-contain" />
            <div>
              <h1 className="cc-display text-sm sm:text-base font-bold text-slate-900 leading-tight">
                {isForceOnboarding ? 'Student Profile Onboarding' : 'Edit Health Profile'}
              </h1>
              <p className="text-[11px] text-slate-500 font-medium">
                TIET Health Centre • Verified Medical Records
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isDirty && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-semibold">
              <Clock className="w-3 h-3 text-amber-600" />
              Unsaved changes
            </span>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-800 hover:bg-teal-900 active:bg-teal-950 text-white font-semibold text-xs sm:text-sm shadow-sm transition-all cursor-pointer disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving…</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Profile</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* ── Main Container ── */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Onboarding Banner & Progress Status */}
        <section className="rounded-3xl bg-white border border-slate-200/80 p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs uppercase font-bold tracking-wider text-teal-800">
                  Profile Registration
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    completionStatus.isComplete
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}
                >
                  {completionStatus.isComplete ? 'Complete' : 'Incomplete'}
                </span>
              </div>
              <h2 className="cc-display text-xl sm:text-2xl font-bold text-slate-900">
                {isForceOnboarding
                  ? 'Complete your medical registration'
                  : 'Review & update permitted records'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Accurate emergency contacts and allergy declarations protect you during campus consultations.
              </p>
            </div>

            {/* Circular / Pill Progress Indicator */}
            <div className="flex sm:flex-col items-center sm:items-end justify-between shrink-0">
              <span className="text-xs text-slate-400 font-medium">Profile Completeness</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="cc-display text-2xl sm:text-3xl font-bold text-teal-800">
                  {completionStatus.percentage}%
                </span>
                <span className="text-xs text-slate-400">of 100%</span>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-4">
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-teal-700 h-2.5 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${Math.max(5, completionStatus.percentage)}%` }}
              />
            </div>

            {completionStatus.missingFields && completionStatus.missingFields.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-slate-400 text-[11px] font-medium mr-1">Required to finish:</span>
                {completionStatus.missingFields.map((field) => (
                  <span
                    key={field}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200/80 text-[10px] font-semibold"
                  >
                    <AlertCircle className="w-3 h-3 text-amber-600" />
                    {field}
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Feedback Alerts */}
        {saveSuccess && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs sm:text-sm text-emerald-900 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{saveSuccess} Returning to dashboard…</span>
            </div>
          </div>
        )}

        {saveError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs sm:text-sm text-red-900 flex items-start justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-red-950">Update Failed</p>
                <p className="text-red-800 text-xs mt-0.5 leading-relaxed">{saveError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSave}
              className="px-3 py-1.5 rounded-xl bg-red-100 hover:bg-red-200 text-red-900 text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry Save
            </button>
          </div>
        )}

        {loadError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs sm:text-sm text-red-900 flex items-center justify-between shadow-xs">
            <span>{loadError}</span>
            <button
              type="button"
              onClick={loadProfile}
              className="text-xs text-red-800 underline font-semibold"
            >
              Retry
            </button>
          </div>
        )}

        {/* Section Navigation Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-200">
          {SECTION_STEPS.map((s) => {
            const Icon = s.icon
            const isCurrent = activeSection === s.id
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveSection(s.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isCurrent
                    ? 'bg-teal-800 text-white shadow-sm'
                    : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200/80'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isCurrent ? 'text-teal-200' : 'text-slate-400'}`} />
                <span>{s.title}</span>
                {s.readOnly && (
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded-md ${
                      isCurrent ? 'bg-teal-900 text-teal-200' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    Lock
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── SECTION 1: UNIVERSITY RECORDS (READ-ONLY) ── */}
        {activeSection === 'academic' && (
          <section className="rounded-3xl bg-white border border-slate-200/80 p-5 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="cc-display text-lg font-bold text-slate-900">
                  Institutional Academic Records
                </h3>
                <p className="text-xs text-slate-500">
                  Official data pulled from Thapar University student records. These fields are immutable.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold shrink-0">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                Read-Only Record
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">
                  Student Roll Number
                </label>
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-mono font-bold text-slate-800 flex items-center justify-between">
                  <span>{formData.rollNumber}</span>
                  <ShieldCheck className="w-4 h-4 text-teal-700" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">
                  Full Name (University Roster)
                </label>
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800">
                  {formData.fullName}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">
                  Official Thapar Email
                </label>
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-sm text-slate-700">
                  {formData.email}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">
                  Enrolled Program
                </label>
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-sm text-slate-700">
                  {formData.program}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">
                  Department / Branch
                </label>
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-sm text-slate-700">
                  {formData.branch || formData.department || 'Not specified'}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">
                  Academic Status
                </label>
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-sm text-slate-700 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="font-semibold text-emerald-800">{formData.status}</span>
                  <span className="text-slate-400 text-xs">· Semester {formData.semester}</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-400 italic">
              Notice: To update academic roster information, contact the Office of the Registrar.
            </p>
          </section>
        )}

        {/* ── SECTION 2: PERSONAL DEMOGRAPHICS (EDITABLE) ── */}
        {activeSection === 'personal' && (
          <section className="rounded-3xl bg-white border border-slate-200/80 p-5 sm:p-6 space-y-5">
            <div className="pb-3 border-b border-slate-100">
              <h3 className="cc-display text-lg font-bold text-slate-900">
                Personal Demographics & Clinical Identification
              </h3>
              <p className="text-xs text-slate-500">
                Personal contact information and baseline biological markers required for safe clinical prescribing.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Personal Phone Number */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Personal Mobile Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  value={formData.phoneNumber}
                  onChange={(e) => {
                    setFormData({ ...formData, phoneNumber: e.target.value })
                    if (fieldErrors.phoneNumber) {
                      setFieldErrors({ ...fieldErrors, phoneNumber: null })
                    }
                  }}
                  placeholder="+91 98765 43210"
                  className={`w-full p-3.5 rounded-2xl bg-slate-50/70 border text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                    fieldErrors.phoneNumber
                      ? 'border-rose-400 focus:ring-rose-200'
                      : 'border-slate-200 focus:border-teal-600 focus:ring-teal-500/20'
                  }`}
                />
                {fieldErrors.phoneNumber ? (
                  <p className="text-xs text-rose-600 mt-1 font-medium">{fieldErrors.phoneNumber}</p>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-1">10–15 digits used for OPD SMS updates.</p>
                )}
              </div>

              {/* Date of Birth */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Date of Birth <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => {
                    setFormData({ ...formData, dateOfBirth: e.target.value })
                    if (fieldErrors.dateOfBirth) {
                      setFieldErrors({ ...fieldErrors, dateOfBirth: null })
                    }
                  }}
                  max={new Date().toISOString().split('T')[0]}
                  className={`w-full p-3.5 rounded-2xl bg-slate-50/70 border text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                    fieldErrors.dateOfBirth
                      ? 'border-rose-400 focus:ring-rose-200'
                      : 'border-slate-200 focus:border-teal-600 focus:ring-teal-500/20'
                  }`}
                />
                {fieldErrors.dateOfBirth ? (
                  <p className="text-xs text-rose-600 mt-1 font-medium">{fieldErrors.dateOfBirth}</p>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-1">Age must be between 15 and 100 years.</p>
                )}
              </div>

              {/* Gender Identity */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Gender Identity <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {VALID_SEX_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, sex: opt })
                        if (fieldErrors.sex) setFieldErrors({ ...fieldErrors, sex: null })
                      }}
                      className={`py-3 rounded-2xl text-xs font-semibold border transition-all cursor-pointer ${
                        formData.sex === opt
                          ? 'bg-teal-800 text-white border-teal-800 shadow-xs'
                          : 'bg-slate-50/70 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                {fieldErrors.sex && (
                  <p className="text-xs text-rose-600 mt-1 font-medium">{fieldErrors.sex}</p>
                )}
              </div>

              {/* Blood Group */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  ABO / Rh Blood Group <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {VALID_BLOOD_GROUPS.map((bg) => (
                    <button
                      key={bg}
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, bloodGroup: bg })
                        if (fieldErrors.bloodGroup) {
                          setFieldErrors({ ...fieldErrors, bloodGroup: null })
                        }
                      }}
                      className={`py-2.5 rounded-2xl text-xs font-bold border transition-all cursor-pointer ${
                        formData.bloodGroup === bg
                          ? 'bg-teal-800 text-white border-teal-800 shadow-xs'
                          : 'bg-slate-50/70 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {bg}
                    </button>
                  ))}
                </div>
                {fieldErrors.bloodGroup && (
                  <p className="text-xs text-rose-600 mt-1 font-medium">{fieldErrors.bloodGroup}</p>
                )}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveSection('emergency')}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Next: Emergency Contact →
              </button>
            </div>
          </section>
        )}

        {/* ── SECTION 3: EMERGENCY CONTACT (EDITABLE) ── */}
        {activeSection === 'emergency' && (
          <section className="rounded-3xl bg-white border border-slate-200/80 p-5 sm:p-6 space-y-5">
            <div className="pb-3 border-b border-slate-100">
              <h3 className="cc-display text-lg font-bold text-slate-900">
                Primary Emergency Contact
              </h3>
              <p className="text-xs text-slate-500">
                First point of contact for the Health Centre in critical cases or hospitalization.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Contact Name */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Contact Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.emergencyName}
                  onChange={(e) => {
                    setFormData({ ...formData, emergencyName: e.target.value })
                    if (fieldErrors.emergencyName) {
                      setFieldErrors({ ...fieldErrors, emergencyName: null })
                    }
                  }}
                  placeholder="e.g. Col. R.S. Sharma"
                  className={`w-full p-3.5 rounded-2xl bg-slate-50/70 border text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                    fieldErrors.emergencyName
                      ? 'border-rose-400 focus:ring-rose-200'
                      : 'border-slate-200 focus:border-teal-600 focus:ring-teal-500/20'
                  }`}
                />
                {fieldErrors.emergencyName && (
                  <p className="text-xs text-rose-600 mt-1 font-medium">{fieldErrors.emergencyName}</p>
                )}
              </div>

              {/* Relationship */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Relationship to Student <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.emergencyRelationship}
                  onChange={(e) => {
                    setFormData({ ...formData, emergencyRelationship: e.target.value })
                    if (fieldErrors.emergencyRelationship) {
                      setFieldErrors({ ...fieldErrors, emergencyRelationship: null })
                    }
                  }}
                  placeholder="e.g. Father / Mother / Guardian / Sibling"
                  className={`w-full p-3.5 rounded-2xl bg-slate-50/70 border text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                    fieldErrors.emergencyRelationship
                      ? 'border-rose-400 focus:ring-rose-200'
                      : 'border-slate-200 focus:border-teal-600 focus:ring-teal-500/20'
                  }`}
                />
                {fieldErrors.emergencyRelationship && (
                  <p className="text-xs text-rose-600 mt-1 font-medium">{fieldErrors.emergencyRelationship}</p>
                )}
              </div>

              {/* Contact Phone */}
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Contact Phone Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  value={formData.emergencyPhone}
                  onChange={(e) => {
                    setFormData({ ...formData, emergencyPhone: e.target.value })
                    if (fieldErrors.emergencyPhone) {
                      setFieldErrors({ ...fieldErrors, emergencyPhone: null })
                    }
                  }}
                  placeholder="+91-9876500011"
                  className={`w-full p-3.5 rounded-2xl bg-slate-50/70 border text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                    fieldErrors.emergencyPhone
                      ? 'border-rose-400 focus:ring-rose-200'
                      : 'border-slate-200 focus:border-teal-600 focus:ring-teal-500/20'
                  }`}
                />
                {fieldErrors.emergencyPhone ? (
                  <p className="text-xs text-rose-600 mt-1 font-medium">{fieldErrors.emergencyPhone}</p>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-1">Direct phone number for campus medical alerts.</p>
                )}
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setActiveSection('personal')}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-colors cursor-pointer"
              >
                ← Back: Demographics
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('clinical')}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Next: Medical Declarations →
              </button>
            </div>
          </section>
        )}

        {/* ── SECTION 4: MEDICAL DECLARATIONS (ALLERGIES / CONDITIONS / MEDS) ── */}
        {activeSection === 'clinical' && (
          <section className="rounded-3xl bg-white border border-slate-200/80 p-5 sm:p-6 space-y-6">
            <div className="pb-3 border-b border-slate-100">
              <h3 className="cc-display text-lg font-bold text-slate-900">
                Clinical Declarations & Medical History
              </h3>
              <p className="text-xs text-slate-500">
                Declare any allergies, ongoing chronic conditions, or daily medications to prevent adverse reactions.
              </p>
            </div>

            {/* 1. ALLERGIES DECLARATION */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">1. Drug & Food Allergies</h4>
                  <p className="text-xs text-slate-500">Do you experience severe or mild adverse reactions to any medicines or foods?</p>
                </div>
                <div className="inline-flex rounded-xl bg-white border border-slate-200 p-1 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setFormData((p) => ({ ...p, hasAllergies: false, allergies: [] }))
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      !formData.hasAllergies ? 'bg-teal-800 text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    No Known Allergies
                  </button>
                  <button
                    type="button"
                    onClick={addAllergy}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      formData.hasAllergies ? 'bg-teal-800 text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Yes, I Have Allergies
                  </button>
                </div>
              </div>

              {formData.hasAllergies && (
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  {formData.allergies.map((al, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-white rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center gap-2.5"
                    >
                      <div className="flex-1 w-full">
                        <input
                          type="text"
                          value={al.allergen}
                          onChange={(e) => {
                            const updated = [...formData.allergies]
                            updated[idx].allergen = e.target.value
                            setFormData({ ...formData, allergies: updated })
                          }}
                          placeholder="Allergen (e.g. Penicillin, Peanuts, Sulfa)"
                          className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-teal-600"
                        />
                        {fieldErrors[`allergy_${idx}`] && (
                          <p className="text-[10px] text-rose-600 mt-0.5">{fieldErrors[`allergy_${idx}`]}</p>
                        )}
                      </div>

                      <div className="flex-1 w-full">
                        <input
                          type="text"
                          value={al.reaction}
                          onChange={(e) => {
                            const updated = [...formData.allergies]
                            updated[idx].reaction = e.target.value
                            setFormData({ ...formData, allergies: updated })
                          }}
                          placeholder="Reaction symptoms (e.g. Hives, facial rash)"
                          className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-teal-600"
                        />
                      </div>

                      <div className="w-full sm:w-32">
                        <select
                          value={al.severity}
                          onChange={(e) => {
                            const updated = [...formData.allergies]
                            updated[idx].severity = e.target.value
                            setFormData({ ...formData, allergies: updated })
                          }}
                          className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-teal-600 font-semibold"
                        >
                          {SEVERITY_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeAllergy(idx)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Remove Allergy"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addAllergy}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800 hover:text-teal-950 py-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Another Allergen</span>
                  </button>
                </div>
              )}
            </div>

            {/* 2. CHRONIC CONDITIONS DECLARATION */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">2. Chronic Health Conditions</h4>
                  <p className="text-xs text-slate-500">Do you manage any recurring condition (Asthma, Diabetes, Migraine, Epilepsy)?</p>
                </div>
                <div className="inline-flex rounded-xl bg-white border border-slate-200 p-1 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setFormData((p) => ({ ...p, hasChronicConditions: false, chronicConditions: [] }))
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      !formData.hasChronicConditions ? 'bg-teal-800 text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    None Recorded
                  </button>
                  <button
                    type="button"
                    onClick={addCondition}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      formData.hasChronicConditions ? 'bg-teal-800 text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Yes, I Have Conditions
                  </button>
                </div>
              </div>

              {formData.hasChronicConditions && (
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  {formData.chronicConditions.map((cond, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={cond}
                        onChange={(e) => {
                          const updated = [...formData.chronicConditions]
                          updated[idx] = e.target.value
                          setFormData({ ...formData, chronicConditions: updated })
                        }}
                        placeholder="e.g. Asthma, Type 1 Diabetes, Allergic Rhinitis"
                        className="flex-1 text-xs p-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-teal-600"
                      />
                      <button
                        type="button"
                        onClick={() => removeCondition(idx)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Remove Condition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addCondition}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800 hover:text-teal-950 py-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Another Condition</span>
                  </button>
                </div>
              )}
            </div>

            {/* 3. CURRENT MEDICATIONS DECLARATION */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">3. Ongoing Medications</h4>
                  <p className="text-xs text-slate-500">Are you currently taking any prescription medications or maintenance inhalers?</p>
                </div>
                <div className="inline-flex rounded-xl bg-white border border-slate-200 p-1 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setFormData((p) => ({ ...p, hasCurrentMedications: false, currentMedications: [] }))
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      !formData.hasCurrentMedications ? 'bg-teal-800 text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    No Ongoing Meds
                  </button>
                  <button
                    type="button"
                    onClick={addMedication}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      formData.hasCurrentMedications ? 'bg-teal-800 text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Yes, Taking Meds
                  </button>
                </div>
              </div>

              {formData.hasCurrentMedications && (
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  {formData.currentMedications.map((m, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-white rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-2 items-center"
                    >
                      <div>
                        <input
                          type="text"
                          value={m.medicineName}
                          onChange={(e) => {
                            const updated = [...formData.currentMedications]
                            updated[idx].medicineName = e.target.value
                            setFormData({ ...formData, currentMedications: updated })
                          }}
                          placeholder="Medicine name (e.g. Salbutamol)"
                          className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-none focus:border-teal-600"
                        />
                      </div>
                      <div>
                        <input
                          type="text"
                          value={m.strength}
                          onChange={(e) => {
                            const updated = [...formData.currentMedications]
                            updated[idx].strength = e.target.value
                            setFormData({ ...formData, currentMedications: updated })
                          }}
                          placeholder="Strength / Dose (e.g. 100mcg, 2 puffs)"
                          className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-none focus:border-teal-600"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={m.reason}
                          onChange={(e) => {
                            const updated = [...formData.currentMedications]
                            updated[idx].reason = e.target.value
                            setFormData({ ...formData, currentMedications: updated })
                          }}
                          placeholder="Reason (e.g. Asthma flare-ups)"
                          className="flex-1 text-xs p-2 rounded-lg border border-slate-200 focus:outline-none focus:border-teal-600"
                        />
                        <button
                          type="button"
                          onClick={() => removeMedication(idx)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
                          title="Remove Medication"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addMedication}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800 hover:text-teal-950 py-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Another Medication</span>
                  </button>
                </div>
              )}
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActiveSection('emergency')}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-colors cursor-pointer"
              >
                ← Back: Emergency Contact
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-900 active:bg-teal-950 text-white font-semibold text-xs sm:text-sm shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving Profile…</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Finish & Save to Clinic Registry</span>
                  </>
                )}
              </button>
            </div>
          </section>
        )}
      </div>

      {/* ── Unsaved Changes Exit Confirmation Modal ── */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Discard unsaved changes?</h4>
                <p className="text-xs text-slate-500">You have modified your medical profile.</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              If you leave now without saving, any newly entered contact numbers, blood group, or allergy declarations will be lost.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                className="px-3.5 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold text-xs transition-colors cursor-pointer"
              >
                Stay & Keep Editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowExitConfirm(false)
                  navigate('/student_dashboard')
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition-colors cursor-pointer shadow-xs"
              >
                Discard & Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
