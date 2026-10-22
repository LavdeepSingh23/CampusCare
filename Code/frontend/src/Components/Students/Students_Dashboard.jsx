import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import campusCareLogo from '../../assets/campuscare-logo.png'
import {
  Sun,
  Sunset,
  Moon,
  Pill,
  Phone,
  Ambulance,
  Droplet,
  ChevronRight,
  LogOut,
  Mail,
  GraduationCap,
  AlertTriangle,
  Clock,
  Stethoscope,
  HeartPulse,
  Activity,
  CalendarDays,
  Home,
  FileText,
  User,
  IdCard,
  AlertCircle,
  CheckCircle2,
  Edit3,
  ShieldCheck,
  Plus,
  Trash2,
  X,
  Save,
  Loader2,
  Lock,
  AlertOctagon,
  Check,
  RotateCcw,
  Sparkles,
  Info,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import StudentDock from '../ui/dock'
import {
  fetchPatientProfile,
  fetchPatientSummary,
  fetchPatientHistory,
  fetchStudentMe,
  fetchStudentProfile,
  fetchStudentVisits,
  fetchStudentPrescriptions,
  fetchStudentSummary,
  fetchStudentProfileByRoll,
  fetchStudentVisitHistoryByRoll,
  fetchStudentMyHistory,
  fetchStudentMedicalProfile,
  updateStudentMedicalProfile,
  fetchStudentEmergencyDirectory,
} from '../../api'

// ── Constants ──────────────────────────────────────────────────────────

const NONE = 'None recorded'
const EMPTY_SUMMARY = { conditions: NONE, allergies: NONE, medication: NONE }

// Verified campus emergency and health centre contacts (SD-4)
const EMERGENCY = [
  { label: 'Ambulance', sub: 'Medical emergencies (National)', number: '108', icon: Ambulance },
  { label: 'Tele-MANAS', sub: 'Mental health support, 24×7 toll-free', number: '14416', icon: HeartPulse },
]
const CAMPUS_NUMBERS = [
  { label: 'Campus Health Centre', sub: '24×7 Dispensary & Emergency Desk', number: '+91-175-2393108' },
  { label: 'Campus Security Control Room', sub: 'Main Gate 24×7 Security Desk', number: '+91-175-2393110' },
  { label: 'Hostel Warden / Student Affairs', sub: 'Hostel Emergency Assistance', number: '+91-175-2393112' },
  { label: 'Campus Ambulance On-Duty Driver', sub: 'Emergency Patient Transport', number: '+91-987-654-3108' },
]

const SLOTS = [
  { key: 'morning', label: 'Morning', icon: Sun, tint: 'bg-amber-50 text-amber-700 border-amber-200' },
  { key: 'evening', label: 'Evening', icon: Sunset, tint: 'bg-orange-50 text-orange-700 border-orange-200' },
  { key: 'night', label: 'Night', icon: Moon, tint: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
]

const TABS = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'prescription', label: 'Prescription', icon: FileText },
  { key: 'health', label: 'Medical History', icon: HeartPulse },
  { key: 'help', label: 'Emergency', icon: AlertTriangle, urgent: true },
  { key: 'account', label: 'Account', icon: User },
]

// ── Helpers ────────────────────────────────────────────────────────────

function getInitials(name) {
  const parts = (name || '').split(' ').filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function greeting(hour) {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function currentSlot(hour) {
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 19) return 'evening'
  return 'night'
}

// Splits medicines into morning / evening / night by reading the free-text
// `timing` field (e.g. "morning, night"). Anything else goes to `other`.
function groupBySlot(medicines = []) {
  const groups = { morning: [], evening: [], night: [], other: [] }
  if (!Array.isArray(medicines)) return groups

  medicines.forEach((m) => {
    const name = typeof m === 'string' ? m : m.name
    const timing = typeof m === 'string' ? '' : (m.timing || '').toLowerCase()
    const note = typeof m === 'string' ? '' : m.note
    const item = { name, timing, note }

    let placed = false
    SLOTS.forEach((s) => {
      if (timing.includes(s.key)) {
        groups[s.key].push(item)
        placed = true
      }
    })
    if (!placed) groups.other.push(item)
  })
  return groups
}

const telHref = (n) => `tel:${(n || '').replace(/[^0-9+]/g, '')}`
const joinTiming = (m, sep = ' — ') => {
  if (!m) return ''
  if (typeof m === 'string') return ''
  return [m.timing, m.note].filter(Boolean).join(sep)
}

// ── Shared UI ──────────────────────────────────────────────────────────

function Card({ title, icon: Icon, aside, children, className = '' }) {
  return (
    <section className={'rounded-3xl bg-white border border-slate-200/80 p-5 lg:p-6 ' + className}>
      {title && (
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="cc-display flex items-center gap-2 text-lg font-semibold text-slate-900">
            {Icon && <Icon className="w-[18px] h-[18px] text-teal-700" aria-hidden="true" />}
            {title}
          </h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  )
}

function PageTitle({ children, sub }) {
  return (
    <div className="mb-4 px-1">
      <h1 className="cc-display text-2xl lg:text-3xl font-bold text-slate-900">{children}</h1>
      {sub && <p className="text-sm text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function Stat({ icon: Icon, label, value, className = '' }) {
  return (
    <div className={'rounded-2xl bg-white/10 border border-white/15 px-3.5 py-2.5 flex-1 min-w-[96px] ' + className}>
      <div className="flex items-center gap-1.5 text-teal-100/80 text-xs mb-0.5">
        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
        {label}
      </div>
      <div className="cc-display text-lg font-semibold text-white leading-tight whitespace-nowrap">{value}</div>
    </div>
  )
}

function InfoRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <span className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm font-medium text-slate-800 break-words">{children}</p>
      </div>
    </div>
  )
}

function AllergyAlert({ allergies }) {
  return (
    <div role="alert" className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 flex items-start gap-2.5">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" aria-hidden="true" />
      <span>
        <span className="font-semibold">Allergic to: </span>
        {allergies}. Tell any doctor or pharmacist before you take new medicine.
      </span>
    </div>
  )
}

function CallButton({ item }) {
  const Icon = item.icon
  return (
    <a
      href={telHref(item.number)}
      aria-label={`Call ${item.label} at ${item.number}`}
      className="rounded-2xl bg-red-600 active:bg-red-800 hover:bg-red-700 text-white p-4 lg:p-5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 focus-visible:ring-offset-2"
    >
      <Icon className="w-5 h-5 mb-2" aria-hidden="true" />
      <span className="block text-sm text-red-100">{item.label}</span>
      <span className="cc-display block text-3xl font-bold tabular-nums">{item.number}</span>
      {item.sub && <span className="block text-xs text-red-100/80 mt-1">{item.sub}</span>}
    </a>
  )
}

// ── Dose schedule ──────────────────────────────────────────────────────

function DoseSchedule({ latest, nowSlot }) {
  const groups = groupBySlot(latest?.medicines)
  return (
    <Card
      title="Dose schedule"
      icon={Clock}
      aside={latest && <span className="text-xs text-slate-400">{latest.date} prescription</span>}
    >
      {!latest || !latest.medicines || latest.medicines.length === 0 ? (
        <div className="py-6 text-center space-y-2">
          <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center mx-auto">
            <Clock className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold text-slate-800">No medicines scheduled right now</p>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            When campus dispensary doctors prescribe medications, your daily dose times (Morning, Evening, Night) will appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {SLOTS.map((s) => {
              const list = groups[s.key]
              const isNow = s.key === nowSlot
              const SlotIcon = s.icon
              return (
                <div
                  key={s.key}
                  className={'rounded-2xl border p-3.5 lg:p-4 ' + (isNow ? s.tint : 'bg-slate-50/70 border-slate-200 text-slate-600')}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      <SlotIcon className="w-4 h-4" aria-hidden="true" />
                      {s.label}
                    </span>
                    {isNow && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/80">Now</span>}
                  </div>
                  {list.length === 0 ? (
                    <p className="text-xs opacity-60">Nothing to take</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {list.map((m, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-sm text-slate-800">
                          <Pill className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-60" aria-hidden="true" />
                          <span>
                            {m.name}
                            {m.note && <span className="block text-xs text-slate-500">{m.note}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>

          {groups.other.length > 0 && (
            <div className="mt-3 rounded-2xl bg-slate-50 border border-slate-200 p-3.5">
              <p className="text-sm font-semibold text-slate-700 mb-1.5">As directed</p>
              <ul className="space-y-1">
                {groups.other.map((m, i) => (
                  <li key={i} className="text-sm text-slate-700">
                    {m.name}
                    {joinTiming(m, ', ') && <span className="text-slate-400"> — {joinTiming(m, ', ')}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Card>
  )
}

// ── Visit history timeline ─────────────────────────────────────────────

function VisitHistory({ history = [] }) {
  const [expanded, setExpanded] = useState(0)
  return (
    <Card
      title="Visit history"
      icon={CalendarDays}
      aside={
        <span className="text-xs text-slate-400">
          {history.length} {history.length === 1 ? 'consultation' : 'consultations'}
        </span>
      }
    >
      {history.length === 0 ? (
        <div className="py-8 text-center space-y-2">
          <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
            <CalendarDays className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold text-slate-700">No previous visits on record</p>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Your university health centre consultations will be preserved in this clinical timeline.
          </p>
        </div>
      ) : (
        <ol className="relative border-l-2 border-slate-200 ml-2 space-y-2">
          {history.map((h, index) => {
            const open = expanded === index
            const hDate =
              h.date ||
              (h.completedAt
                ? new Date(h.completedAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : 'Recent visit')
            return (
              <li key={h.visitId || index} className="pl-5 relative">
                <span
                  aria-hidden="true"
                  className={
                    'absolute -left-[7px] top-4 w-3 h-3 rounded-full border-2 border-white ' +
                    (index === 0 ? 'bg-teal-700 ring-2 ring-teal-100' : 'bg-slate-300')
                  }
                />
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : index)}
                  aria-expanded={open}
                  className="w-full flex items-center justify-between gap-3 text-left rounded-xl px-3 py-3 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 transition-colors cursor-pointer"
                >
                  <span className="min-w-0">
                    <span className="block text-xs text-slate-400 font-mono">{hDate}</span>
                    <span className="block text-sm font-bold text-slate-900 truncate">
                      {h.diagnosis || 'General Consultation'}
                    </span>
                    {h.doctorName && (
                      <span className="block text-[11px] text-teal-800 font-medium mt-0.5">
                        {h.doctorName}
                        {h.specialty && ` · ${h.specialty}`}
                      </span>
                    )}
                  </span>
                  <ChevronRight
                    className={
                      'w-4 h-4 text-slate-400 cc-anim transition-transform duration-200 shrink-0 ' +
                      (open ? 'rotate-90 text-teal-700' : '')
                    }
                    aria-hidden="true"
                  />
                </button>
                <div
                  className="cc-anim"
                  style={{
                    display: 'grid',
                    gridTemplateRows: open ? '1fr' : '0fr',
                    transition: 'grid-template-rows 250ms ease',
                  }}
                >
                  <div className="overflow-hidden">
                    <div className="mx-3 mb-3 rounded-2xl bg-slate-50 border border-slate-100 p-4 space-y-3">
                      {(h.notes || h.clinicalNotes || h.generalInstructions) && (
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                            Doctor's Advice
                          </p>
                          <p className="text-xs text-slate-700 leading-relaxed">
                            {h.notes || h.clinicalNotes || h.generalInstructions}
                          </p>
                        </div>
                      )}
                      {h.medicines && h.medicines.length > 0 ? (
                        <div className="pt-2 border-t border-slate-200/70">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                            Prescribed Medications
                          </p>
                          <ul className="space-y-1.5">
                            {h.medicines.map((m, mi) => {
                              const mName = typeof m === 'string' ? m : m.name
                              const mTiming = typeof m === 'string' ? '' : m.timing
                              const mNote = typeof m === 'string' ? '' : m.note
                              return (
                                <li
                                  key={mi}
                                  className="flex items-center justify-between gap-2 text-xs bg-white border border-slate-200/80 px-3 py-2 rounded-xl"
                                >
                                  <span className="font-semibold text-slate-800 truncate">{mName}</span>
                                  {(mTiming || mNote) && (
                                    <span className="text-[11px] font-medium text-slate-500 bg-slate-50 px-2 py-0.5 rounded-lg shrink-0">
                                      {[mTiming, mNote].filter(Boolean).join(' • ')}
                                    </span>
                                  )}
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic">No medicines were prescribed at this visit.</p>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </Card>
  )
}

// ── Prescription card (used on Prescription tab) ───────────────────────

function LatestPrescription({ latest }) {
  return (
    <Card
      title="Latest prescription"
      icon={Stethoscope}
      aside={
        latest && (
          <div className="flex items-center gap-2">
            {latest.doctorName && (
              <span className="text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full">
                {latest.doctorName}
              </span>
            )}
            <span className="text-xs text-slate-400 font-mono">{latest.date || 'Recent'}</span>
          </div>
        )
      }
    >
      {!latest ? (
        <div className="py-10 text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center mx-auto">
            <Stethoscope className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-slate-800">No active prescription</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Prescriptions issued during doctor visits at the campus health centre will appear here with complete
            dosage instructions.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Diagnosis</span>
              {latest.specialty && (
                <span className="text-[11px] font-medium text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">
                  {latest.specialty}
                </span>
              )}
            </div>
            <p className="cc-display text-2xl font-bold text-slate-900 leading-tight">
              {latest.diagnosis || 'General Medical Consultation'}
            </p>
          </div>

          {(latest.notes || latest.generalInstructions) && (
            <div className="rounded-2xl bg-slate-50 border border-slate-200/90 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Doctor's advice & instructions
              </p>
              <p className="text-sm text-slate-700 leading-relaxed">
                {latest.notes || latest.generalInstructions}
              </p>
            </div>
          )}

          {latest.medicines && latest.medicines.length > 0 ? (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                Prescribed Medicines ({latest.medicines.length})
              </p>
              <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-xs">
                {latest.medicines.map((m, i) => {
                  const mName = typeof m === 'string' ? m : m.name
                  const mTiming = typeof m === 'string' ? '' : m.timing
                  const mNote = typeof m === 'string' ? '' : m.note
                  const mDuration = typeof m === 'string' ? '' : m.duration
                  return (
                    <li key={i} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-4 bg-white hover:bg-slate-50/60 transition-colors">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                          <Pill className="w-4 h-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <span className="block text-sm font-bold text-slate-900 truncate">{mName}</span>
                          {mNote && <span className="block text-xs text-slate-500 mt-0.5">{mNote}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 self-start sm:self-auto shrink-0 pl-12 sm:pl-0">
                        {mTiming && (
                          <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 border border-teal-200">
                            {mTiming}
                          </span>
                        )}
                        {mDuration && (
                          <span className="text-xs font-medium text-slate-400 px-2 py-0.5">
                            {mDuration}
                          </span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : (
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-xs text-slate-500">
              No prescription medicines were dispensed for this visit.
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Tab views ──────────────────────────────────────────────────────────

function HomeView({ profile, latest, history, hasAllergies, summary, hour, activeVisit, profileCompletion, goTo, onCompleteProfile }) {
  const firstName = (profile.name || '').split(' ')[0]
  return (
    <div className="space-y-4">
      {/* First-Time Student Profile Completion Guidance */}
      {profileCompletion && !profileCompletion.isComplete && (
        <section className="rounded-3xl bg-amber-50/90 border border-amber-300 p-4 sm:p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5 border border-amber-200">
                <AlertCircle className="w-5 h-5" />
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-amber-950 text-sm">
                    First-Time Setup: Health Profile Incomplete ({profileCompletion.percentage || 0}%)
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-900 uppercase tracking-wider">
                    Action Required
                  </span>
                </div>
                <p className="text-xs text-amber-900/90 mt-1 leading-relaxed max-w-2xl">
                  Campus health centre doctors require your verified emergency contact and allergy declarations before prescribing or dispensing medications.
                </p>
                {profileCompletion.missingFields && profileCompletion.missingFields.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-medium text-amber-900">Required:</span>
                    {profileCompletion.missingFields.map((f, i) => (
                      <span
                        key={i}
                        className="text-[11px] font-semibold text-amber-950 bg-amber-100/80 border border-amber-300 px-2 py-0.5 rounded-md"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-center shrink-0 pt-2 sm:pt-0">
              <button
                type="button"
                onClick={onCompleteProfile}
                className="px-4 py-2.5 rounded-xl bg-amber-800 hover:bg-amber-900 active:bg-amber-950 text-white font-semibold text-xs transition-colors cursor-pointer shadow-xs"
              >
                Complete Registration →
              </button>
              <button
                type="button"
                onClick={() => goTo('health')}
                className="px-3.5 py-2.5 rounded-xl border border-amber-300 text-amber-950 hover:bg-amber-100/70 text-xs font-semibold transition-colors cursor-pointer"
              >
                Medical ID
              </button>
            </div>
          </div>
          <div className="w-full bg-amber-200/60 rounded-full h-1.5 mt-3 overflow-hidden">
            <div
              className="bg-amber-600 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${profileCompletion.percentage || 0}%` }}
            />
          </div>
        </section>
      )}

      {/* Hero */}
      <section className="rounded-3xl bg-teal-900 text-white p-5 sm:p-6 lg:p-8 relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{ backgroundImage: 'repeating-linear-gradient(115deg, #fff 0, #fff 1px, transparent 1px, transparent 28px)' }}
        />
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
          <div className="max-w-xl">
            <h1 className="cc-display text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight">
              {greeting(hour)}{firstName ? `, ${firstName}` : ''}.
            </h1>
            <p className="mt-1.5 text-teal-100/85 text-sm lg:text-base leading-relaxed">
              {latest
                ? `Last visit: ${latest.date}, ${latest.diagnosis || 'check-up'}.`
                : 'No visits yet. Your prescriptions will show up here after a doctor sees you.'}
            </p>
          </div>
          <div className="flex gap-2.5 lg:min-w-[380px]">
            <Stat icon={Droplet} label="Blood group" value={profile.bloodGroup || '—'} />
            <Stat icon={Activity} label="Visits" value={history.length} />
            <Stat icon={CalendarDays} label="Last visit" value={latest ? latest.date : '—'} className="hidden sm:block" />
          </div>
        </div>
      </section>

      {/* Live OPD Queue Telemetry Card (Active Check-In) */}
      {activeVisit && (
        <section className="rounded-3xl bg-gradient-to-r from-teal-800 to-teal-950 text-white p-5 border border-teal-700/80 shadow-md">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs uppercase font-bold tracking-wider text-teal-200">
                Live OPD Queue Status
              </span>
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-teal-900 text-teal-100 border border-teal-600/70 shadow-xs">
              Position #{activeVisit.queueSequence || activeVisit.queueEntryId || '1'}
            </span>
          </div>
          <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-teal-700/60">
            <div>
              <p className="text-sm sm:text-base font-semibold text-white">
                {activeVisit.doctorName || 'Assigned Physician'}
              </p>
              <p className="text-xs text-teal-200/80">
                {activeVisit.specialty || 'General Medicine'}
                {activeVisit.complaint ? ` • ${activeVisit.complaint}` : ''}
              </p>
            </div>
            <div className="text-xs bg-white/10 px-3 py-1.5 rounded-xl border border-white/15 text-teal-100 self-start sm:self-auto font-medium">
              {activeVisit.status === 'IN_CONSULTATION'
                ? '🩺 In Consultation with Doctor'
                : '⏳ Waiting for Call in Waiting Lounge'}
            </div>
          </div>
        </section>
      )}

      {hasAllergies && <AllergyAlert allergies={summary.allergies} />}

      <DoseSchedule latest={latest} nowSlot={currentSlot(hour)} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Desktop-only preview — phones have the Prescription tab */}
        <div className="block">
          <Card
            title="Latest prescription"
            icon={Stethoscope}
            aside={
              <button onClick={() => goTo('prescription')} className="text-xs font-medium text-teal-700 hover:text-teal-900 flex items-center gap-0.5">
                View all <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            }
          >
            {!latest ? (
              <p className="text-sm text-slate-500">No prescriptions yet.</p>
            ) : (
              <div className="space-y-3">
                <p className="cc-display text-xl font-semibold text-slate-900">{latest.diagnosis || 'Not specified'}</p>
                {latest.notes && <p className="text-sm text-slate-600 leading-relaxed">{latest.notes}</p>}
                {latest.medicines && latest.medicines.length > 0 && (
                  <ul className="space-y-1.5">
                    {latest.medicines.map((m, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-slate-800">
                        <Pill className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
                        {m.name}
                        <span className="text-slate-400 text-xs">{joinTiming(m, ' — ')}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {/* Emergency strip */}
          <section className="rounded-3xl bg-red-50 border border-red-200 p-4 lg:p-5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="cc-display text-base font-semibold text-red-900">Emergency?</p>
              <button onClick={() => goTo('help')} className="text-xs text-red-700 underline underline-offset-2">
                See all helplines
              </button>
            </div>
            <a
              href={telHref(EMERGENCY[0].number)}
              aria-label="Call ambulance at 108"
              className="flex items-center gap-2 rounded-full bg-red-600 active:bg-red-800 hover:bg-red-700 text-white px-5 py-3 text-sm font-semibold transition-colors shrink-0"
            >
              <Ambulance className="w-4 h-4" aria-hidden="true" />
              Call 108
            </a>
          </section>

          {/* Desktop-only health snapshot */}
          <div className="hidden lg:block">
            <Card
              title="Health snapshot"
              icon={HeartPulse}
              aside={
                <button onClick={() => goTo('health')} className="text-xs font-medium text-teal-700 hover:text-teal-900 flex items-center gap-0.5">
                  Medical ID <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              }
            >
              <dl className="space-y-3">
                <div>
                  <dt className="text-xs text-slate-400">Conditions</dt>
                  <dd className="text-sm font-medium text-slate-800">{summary.conditions}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Allergies</dt>
                  <dd className={'text-sm font-medium ' + (hasAllergies ? 'text-red-700' : 'text-slate-800')}>{summary.allergies}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Ongoing medication</dt>
                  <dd className="text-sm font-medium text-slate-800">{summary.medication}</dd>
                </div>
              </dl>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function PrescriptionView({ latest, history, prescriptions = [] }) {
  const activePrescription = latest || (prescriptions.length > 0 ? prescriptions[0] : null)
  const pastPrescriptions = prescriptions.length > 1 ? prescriptions.slice(1) : []

  return (
    <div className="space-y-4">
      <PageTitle sub="What your doctor prescribed, dosage timings, and past visits">
        Prescription & Medical Orders
      </PageTitle>

      {!activePrescription && history.length === 0 ? (
        <Card className="text-center py-12">
          <div className="w-14 h-14 rounded-3xl bg-teal-50 text-teal-700 flex items-center justify-center mx-auto mb-3">
            <FileText className="w-7 h-7" />
          </div>
          <h3 className="cc-display text-lg font-bold text-slate-900">No Prescriptions On File</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
            Prescriptions issued during campus health centre consultations will be preserved here with complete dosage instructions, duration, and meal relations.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <div className="space-y-4">
            <LatestPrescription latest={activePrescription} />

            {pastPrescriptions.length > 0 && (
              <Card title="Previous Prescriptions" icon={FileText}>
                <div className="divide-y divide-slate-100">
                  {pastPrescriptions.map((p, idx) => (
                    <div key={p.prescriptionId || idx} className="py-3.5 first:pt-0 last:pb-0 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-slate-900">{p.diagnosis || 'Consultation'}</span>
                        <span className="text-xs text-slate-400 font-mono">{p.date}</span>
                      </div>
                      <p className="text-xs text-teal-800 font-medium">
                        {p.doctorName} {p.specialty && `• ${p.specialty}`}
                      </p>
                      {p.medicines && p.medicines.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {p.medicines.map((m, mi) => (
                            <span key={mi} className="text-xs bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg text-slate-700">
                              {typeof m === 'string' ? m : m.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          <VisitHistory history={history} />
        </div>
      )}
    </div>
  )
}

// ── HealthView & Medical Declarations (SD-3) ─────────────────────────

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
const SEVERITIES = ['MILD', 'MODERATE', 'SEVERE']
const COMMON_CONDITIONS = [
  'Asthma',
  'Type 1 Diabetes',
  'Type 2 Diabetes',
  'Hypertension',
  'Migraine',
  'Epilepsy',
  'Thyroid Disorder',
  'Allergic Rhinitis',
]

function formatLastSaved(iso) {
  if (!iso) return null
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return null
    return d.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return null
  }
}

function StatusPill({ status, count }) {
  if (status === 'HAS_RECORDS') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200">
        <span className="w-1.5 h-1.5 rounded-full bg-teal-600 animate-pulse" />
        {count ? `${count} Active` : 'Recorded'}
      </span>
    )
  }
  if (status === 'NONE_REPORTED') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
        Confirmed: None recorded
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
      <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
      Not declared yet
    </span>
  )
}

function SeverityBadge({ severity }) {
  const sev = (severity || 'MILD').toUpperCase()
  if (sev === 'SEVERE') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-red-100 text-red-800 border border-red-200">
        <AlertOctagon className="w-3 h-3 text-red-600" />
        SEVERE
      </span>
    )
  }
  if (sev === 'MODERATE') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
        <AlertTriangle className="w-3 h-3 text-amber-600" />
        MODERATE
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
      MILD
    </span>
  )
}

function SourceTag({ source, canEdit }) {
  if (source === 'CLINICAL') {
    return (
      <span
        title="Recorded by health centre clinical staff — protected record"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-teal-50 text-teal-800 border border-teal-200/80"
      >
        <ShieldCheck className="w-3 h-3 text-teal-700" />
        Clinician Verified
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-50 text-slate-600 border border-slate-200">
      <User className="w-3 h-3 text-slate-500" />
      Self-Reported
    </span>
  )
}

function HealthView({
  profile,
  summary,
  hasAllergies: initialHasAllergies,
  medicalProfile,
  onMedicalUpdated,
  canEdit = true,
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')

  // Derive status from medicalProfile or fallback to summary
  const allergyStatus =
    medicalProfile?.medicalStatus?.allergyStatus ||
    (initialHasAllergies ? 'HAS_RECORDS' : summary.allergies === NONE ? 'NONE_REPORTED' : 'NOT_REPORTED')
  const conditionStatus =
    medicalProfile?.medicalStatus?.conditionStatus ||
    (summary.conditions && summary.conditions !== NONE
      ? 'HAS_RECORDS'
      : summary.conditions === NONE
      ? 'NONE_REPORTED'
      : 'NOT_REPORTED')
  const medicationStatus =
    medicalProfile?.medicalStatus?.medicationStatus ||
    (summary.medication && summary.medication !== NONE
      ? 'HAS_RECORDS'
      : summary.medication === NONE
      ? 'NONE_REPORTED'
      : 'NOT_REPORTED')

  const lastSavedFormatted = formatLastSaved(medicalProfile?.medicalStatus?.updatedAt)

  // Edit form states
  const [editBloodGroup, setEditBloodGroup] = useState(profile.bloodGroup || medicalProfile?.bloodGroup || '')
  const [editHasAllergies, setEditHasAllergies] = useState(allergyStatus === 'HAS_RECORDS')
  const [editAllergies, setEditAllergies] = useState([])
  const [editHasConditions, setEditHasConditions] = useState(conditionStatus === 'HAS_RECORDS')
  const [editConditions, setEditConditions] = useState([])
  const [customConditionInput, setCustomConditionInput] = useState('')
  const [editHasMedications, setEditHasMedications] = useState(medicationStatus === 'HAS_RECORDS')
  const [editMedications, setEditMedications] = useState([])

  // Synchronize form when editing opens or medicalProfile loads
  const initFormFromProfile = useCallback(() => {
    setEditBloodGroup(medicalProfile?.bloodGroup || profile.bloodGroup || '')
    setEditHasAllergies(
      medicalProfile?.medicalStatus?.allergyStatus === 'HAS_RECORDS' ||
        (medicalProfile?.allergies && medicalProfile.allergies.length > 0)
    )
    setEditAllergies(
      (medicalProfile?.allergies || []).map((a) => ({
        allergyId: a.allergyId,
        allergen: a.allergen || '',
        reaction: a.reaction || '',
        severity: (a.severity || 'MILD').toUpperCase(),
        source: a.source || 'SELF_REPORTED',
        canEdit: a.canEdit !== false,
      }))
    )

    setEditHasConditions(
      medicalProfile?.medicalStatus?.conditionStatus === 'HAS_RECORDS' ||
        (medicalProfile?.conditions && medicalProfile.conditions.length > 0)
    )
    setEditConditions(
      (medicalProfile?.conditions || []).map((c) => ({
        name: c.name || '',
        otherDescription: c.otherDescription || '',
        source: c.source || 'SELF_REPORTED',
        canEdit: c.canEdit !== false,
      }))
    )

    setEditHasMedications(
      medicalProfile?.medicalStatus?.medicationStatus === 'HAS_RECORDS' ||
        (medicalProfile?.medications && medicalProfile.medications.length > 0)
    )
    setEditMedications(
      (medicalProfile?.medications || []).map((m) => ({
        medicineName: m.medicineName || '',
        strength: m.strength || '',
        dose: m.dose || '',
        reason: m.reason || '',
        source: m.source || 'SELF_REPORTED',
        canEdit: m.canEdit !== false,
      }))
    )
  }, [medicalProfile, profile.bloodGroup])

  useEffect(() => {
    initFormFromProfile()
  }, [initFormFromProfile])

  const handleStartEdit = () => {
    initFormFromProfile()
    setSaveError('')
    setSaveSuccess('')
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    initFormFromProfile()
    setSaveError('')
    setIsEditing(false)
  }

  // Allergy item helpers
  const handleAddAllergy = () => {
    setEditAllergies((prev) => [
      ...prev,
      { allergen: '', reaction: '', severity: 'MILD', source: 'SELF_REPORTED', canEdit: true },
    ])
  }

  const handleUpdateAllergy = (index, field, value) => {
    setEditAllergies((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const handleRemoveAllergy = (index) => {
    setEditAllergies((prev) => prev.filter((_, i) => i !== index))
  }

  // Condition item helpers
  const handleAddCondition = (name) => {
    const clean = (name || '').trim()
    if (!clean) return
    if (editConditions.some((c) => c.name.toLowerCase() === clean.toLowerCase())) return
    setEditConditions((prev) => [
      ...prev,
      { name: clean, source: 'SELF_REPORTED', canEdit: true },
    ])
    setCustomConditionInput('')
  }

  const handleRemoveCondition = (index) => {
    setEditConditions((prev) => prev.filter((_, i) => i !== index))
  }

  // Medication item helpers
  const handleAddMedication = () => {
    setEditMedications((prev) => [
      ...prev,
      { medicineName: '', strength: '', dose: '', reason: '', source: 'SELF_REPORTED', canEdit: true },
    ])
  }

  const handleUpdateMedication = (index, field, value) => {
    setEditMedications((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const handleRemoveMedication = (index) => {
    setEditMedications((prev) => prev.filter((_, i) => i !== index))
  }

  // Save handler
  const handleSave = async (e) => {
    e.preventDefault()
    setSaveError('')
    setSaveSuccess('')

    // Validate
    if (editHasAllergies) {
      const emptyAllergen = editAllergies.find((a) => !a.allergen.trim())
      if (emptyAllergen || editAllergies.length === 0) {
        setSaveError('Please provide an allergen name for all allergy entries, or choose "No known allergies".')
        return
      }
    }

    if (editHasConditions && editConditions.length === 0) {
      setSaveError('Please add at least one chronic condition, or choose "No chronic conditions".')
      return
    }

    if (editHasMedications) {
      const emptyMed = editMedications.find((m) => !m.medicineName.trim())
      if (emptyMed || editMedications.length === 0) {
        setSaveError('Please provide the medicine name for all ongoing medications, or choose "No regular medications".')
        return
      }
    }

    setSaving(true)
    try {
      const payload = {
        bloodGroup: editBloodGroup || null,
        hasAllergies: editHasAllergies,
        allergies: editHasAllergies
          ? editAllergies
              .filter((a) => a.allergen.trim())
              .map((a) => ({
                allergen: a.allergen.trim(),
                reaction: a.reaction ? a.reaction.trim() : null,
                severity: (a.severity || 'MILD').toUpperCase(),
              }))
          : [],
        hasChronicConditions: editHasConditions,
        chronicConditions: editHasConditions
          ? editConditions.map((c) => c.name.trim()).filter(Boolean)
          : [],
        hasCurrentMedications: editHasMedications,
        currentMedications: editHasMedications
          ? editMedications
              .filter((m) => m.medicineName.trim())
              .map((m) => ({
                medicineName: m.medicineName.trim(),
                strength: m.strength ? m.strength.trim() : null,
                dose: m.dose ? m.dose.trim() : null,
                reason: m.reason ? m.reason.trim() : null,
              }))
          : [],
      }

      const updated = await updateStudentMedicalProfile(payload)
      if (onMedicalUpdated) {
        onMedicalUpdated(updated)
      }
      setSaveSuccess('Medical details saved and synchronized with campus health records.')
      setIsEditing(false)
    } catch (err) {
      setSaveError(err.message || 'Failed to save medical details. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Active items in view mode
  const allergiesList = medicalProfile?.allergies || []
  const conditionsList = medicalProfile?.conditions || []
  const medicationsList = medicalProfile?.medications || []
  const consultationsList = medicalProfile?.recentConsultations || []
  const hasSevereAlert =
    medicalProfile?.summary?.hasSevereAllergyAlert ||
    allergiesList.some((a) => (a.severity || '').toUpperCase() === 'SEVERE')

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <PageTitle sub="Official campus medical identification, clinical history, and allergy warnings">
          Medical ID & History
        </PageTitle>

        {!isEditing && canEdit && (
          <button
            type="button"
            onClick={handleStartEdit}
            className="self-start sm:self-auto inline-flex items-center gap-2 rounded-xl bg-teal-800 text-white px-4 py-2.5 text-xs font-semibold hover:bg-teal-900 active:bg-teal-950 shadow-sm transition-colors cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
            Edit Medical Record
          </button>
        )}
      </div>

      {/* Notifications */}
      {saveSuccess && (
        <div
          role="status"
          className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl px-4 py-3 text-sm flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{saveSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setSaveSuccess('')}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {saveError && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 text-red-800 rounded-2xl px-4 py-3 text-sm flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{saveError}</span>
          </div>
          <button
            type="button"
            onClick={() => setSaveError('')}
            className="text-red-700 hover:text-red-900 text-xs font-bold cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Severe Allergy Alert Banner */}
      {!isEditing && hasSevereAlert && (
        <div
          role="alert"
          className="rounded-2xl border-2 border-red-500 bg-red-50 p-4 sm:p-5 text-red-950 flex items-start gap-3 shadow-xs"
        >
          <div className="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0">
            <AlertOctagon className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="cc-display text-sm font-bold text-red-900 uppercase tracking-wide">
              Critical Clinical Alert — Severe Allergy Reported
            </h2>
            <p className="text-xs text-red-800 mt-0.5 leading-relaxed">
              Patient has verified high-severity adverse drug or allergen reactions. Attending clinical staff and first
              responders must review allergy declarations before administering medication.
            </p>
          </div>
        </div>
      )}

      {/* ── MODE: EDITING (REGISTRATION FORM) ────────────────────── */}
      {isEditing ? (
        <form onSubmit={handleSave} className="space-y-6">
          <Card
            title="Edit Medical Details & Declarations"
            icon={Edit3}
            aside={
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={saving}
                className="text-xs font-medium text-slate-500 hover:text-slate-800 p-1 cursor-pointer"
              >
                Cancel
              </button>
            }
          >
            <p className="text-xs text-slate-500 -mt-2 mb-6">
              Update your blood group and clinically declare allergies, chronic conditions, and ongoing medications.
              Records are maintained on your verified university health file.
            </p>

            <div className="space-y-8">
              {/* 1. Blood Group */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Blood Group <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  {BLOOD_GROUPS.map((bg) => {
                    const isSelected = editBloodGroup === bg
                    return (
                      <button
                        key={bg}
                        type="button"
                        onClick={() => setEditBloodGroup(bg)}
                        className={`py-2.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-teal-800 text-white border-teal-800 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {bg}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 2. Allergies Declaration */}
              <div className="pt-4 border-t border-slate-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Allergies & Drug Sensitivities
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Include medicines (e.g. Penicillin), foods, insect stings, or latex.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setEditHasAllergies(false)
                      }}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                        !editHasAllergies
                          ? 'bg-white text-emerald-800 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      No known allergies
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditHasAllergies(true)
                        if (editAllergies.length === 0) handleAddAllergy()
                      }}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                        editHasAllergies
                          ? 'bg-teal-800 text-white shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      I have allergies
                    </button>
                  </div>
                </div>

                {!editHasAllergies ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-emerald-900 flex items-center gap-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <p className="text-xs">
                      Confirmed: “None recorded”. You declare having no known adverse drug or environmental allergies.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {editAllergies.map((allergy, index) => (
                      <div
                        key={allergy.allergyId || index}
                        className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-700">Allergy #{index + 1}</span>
                          <div className="flex items-center gap-2">
                            <SourceTag source={allergy.source} canEdit={allergy.canEdit} />
                            {allergy.canEdit ? (
                              <button
                                type="button"
                                onClick={() => handleRemoveAllergy(index)}
                                title="Remove allergy"
                                className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <span title="Clinician verified item" className="text-slate-400 p-1">
                                <Lock className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">
                              Allergen / Drug Name <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={allergy.allergen}
                              disabled={!allergy.canEdit}
                              onChange={(e) => handleUpdateAllergy(index, 'allergen', e.target.value)}
                              placeholder="e.g. Penicillin, Peanuts, Sulfa"
                              className="w-full text-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-none focus:border-teal-700 disabled:bg-slate-100"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">
                              Known Reaction
                            </label>
                            <input
                              type="text"
                              value={allergy.reaction || ''}
                              disabled={!allergy.canEdit}
                              onChange={(e) => handleUpdateAllergy(index, 'reaction', e.target.value)}
                              placeholder="e.g. Hives, throat swelling, rash"
                              className="w-full text-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-none focus:border-teal-700 disabled:bg-slate-100"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">
                              Severity Level
                            </label>
                            <select
                              value={allergy.severity}
                              disabled={!allergy.canEdit}
                              onChange={(e) => handleUpdateAllergy(index, 'severity', e.target.value)}
                              className="w-full text-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-none focus:border-teal-700 disabled:bg-slate-100"
                            >
                              <option value="MILD">Mild (Localized rash, itching)</option>
                              <option value="MODERATE">Moderate (Generalized hives, mild wheeze)</option>
                              <option value="SEVERE">Severe (Anaphylaxis, airway difficulty)</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={handleAddAllergy}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800 hover:text-teal-950 py-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add another allergy
                    </button>
                  </div>
                )}
              </div>

              {/* 3. Chronic Conditions Declaration */}
              <div className="pt-4 border-t border-slate-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Chronic Health Conditions
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Pre-existing medical conditions that doctors should know about.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setEditHasConditions(false)}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                        !editHasConditions
                          ? 'bg-white text-emerald-800 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      No chronic conditions
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditHasConditions(true)}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                        editHasConditions
                          ? 'bg-teal-800 text-white shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      I have conditions
                    </button>
                  </div>
                </div>

                {!editHasConditions ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-emerald-900 flex items-center gap-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <p className="text-xs">
                      Confirmed: “None recorded”. You declare having no ongoing chronic medical conditions.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Quick suggestion chips */}
                    <div>
                      <p className="text-[11px] font-medium text-slate-400 mb-1.5">Common conditions (tap to add):</p>
                      <div className="flex flex-wrap gap-1.5">
                        {COMMON_CONDITIONS.map((cond) => {
                          const isAlreadyAdded = editConditions.some(
                            (c) => c.name.toLowerCase() === cond.toLowerCase()
                          )
                          return (
                            <button
                              key={cond}
                              type="button"
                              disabled={isAlreadyAdded}
                              onClick={() => handleAddCondition(cond)}
                              className={`text-xs px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                                isAlreadyAdded
                                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-default'
                                  : 'bg-white text-slate-700 border-slate-200 hover:border-teal-700 hover:text-teal-900'
                              }`}
                            >
                              + {cond}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Custom input */}
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={customConditionInput}
                        onChange={(e) => setCustomConditionInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleAddCondition(customConditionInput)
                          }
                        }}
                        placeholder="Add other medical condition…"
                        className="flex-1 text-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-none focus:border-teal-700"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddCondition(customConditionInput)}
                        className="text-xs font-semibold px-4 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                      >
                        Add
                      </button>
                    </div>

                    {/* List of current conditions */}
                    <div className="space-y-2">
                      {editConditions.map((cond, index) => (
                        <div
                          key={cond.name + index}
                          className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-slate-200 bg-white"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-semibold text-slate-800 truncate">{cond.name}</span>
                            <SourceTag source={cond.source} canEdit={cond.canEdit} />
                          </div>
                          {cond.canEdit ? (
                            <button
                              type="button"
                              onClick={() => handleRemoveCondition(index)}
                              className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span title="Clinician verified" className="text-slate-400 p-1">
                              <Lock className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 4. Ongoing Medications Declaration */}
              <div className="pt-4 border-t border-slate-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Ongoing & Regular Medications
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Prescriptions, inhalers, insulin, or vitamins you take daily or regularly.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setEditHasMedications(false)}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                        !editHasMedications
                          ? 'bg-white text-emerald-800 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      No regular medications
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditHasMedications(true)
                        if (editMedications.length === 0) handleAddMedication()
                      }}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                        editHasMedications
                          ? 'bg-teal-800 text-white shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      I take regular medications
                    </button>
                  </div>
                </div>

                {!editHasMedications ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-emerald-900 flex items-center gap-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <p className="text-xs">
                      Confirmed: “None recorded”. You declare that you are not currently taking regular ongoing medications.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {editMedications.map((med, index) => (
                      <div
                        key={med.studentMedicationId || index}
                        className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-700">Medication #{index + 1}</span>
                          <div className="flex items-center gap-2">
                            <SourceTag source={med.source} canEdit={med.canEdit} />
                            {med.canEdit ? (
                              <button
                                type="button"
                                onClick={() => handleRemoveMedication(index)}
                                title="Remove medication"
                                className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <span title="Clinician verified item" className="text-slate-400 p-1">
                                <Lock className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">
                              Medicine Name <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={med.medicineName}
                              disabled={!med.canEdit}
                              onChange={(e) => handleUpdateMedication(index, 'medicineName', e.target.value)}
                              placeholder="e.g. Salbutamol, Cetirizine"
                              className="w-full text-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-none focus:border-teal-700 disabled:bg-slate-100"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">Strength</label>
                            <input
                              type="text"
                              value={med.strength || ''}
                              disabled={!med.canEdit}
                              onChange={(e) => handleUpdateMedication(index, 'strength', e.target.value)}
                              placeholder="e.g. 100mcg, 10mg"
                              className="w-full text-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-none focus:border-teal-700 disabled:bg-slate-100"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">Dose / Frequency</label>
                            <input
                              type="text"
                              value={med.dose || ''}
                              disabled={!med.canEdit}
                              onChange={(e) => handleUpdateMedication(index, 'dose', e.target.value)}
                              placeholder="e.g. 1 puff as needed, Daily"
                              className="w-full text-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-none focus:border-teal-700 disabled:bg-slate-100"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">Reason / Indication</label>
                            <input
                              type="text"
                              value={med.reason || ''}
                              disabled={!med.canEdit}
                              onChange={(e) => handleUpdateMedication(index, 'reason', e.target.value)}
                              placeholder="e.g. Asthma symptom relief"
                              className="w-full text-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-none focus:border-teal-700 disabled:bg-slate-100"
                            />
                          </div>
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={handleAddMedication}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800 hover:text-teal-950 py-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add another medication
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Clinician protection notice */}
            {medicalProfile?.summary?.clinicalVerifiedCount > 0 && (
              <div className="mt-6 p-3.5 rounded-2xl bg-teal-50/70 border border-teal-200 text-teal-900 text-xs flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0" />
                <span>
                  Some entries were recorded by campus health centre doctors. For medical safety, clinical staff
                  entries cannot be removed online.
                </span>
              </div>
            )}

            {/* Form Footer Buttons */}
            <div className="flex items-center justify-end gap-3 pt-6 mt-6 border-t border-slate-100">
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={saving}
                className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-teal-800 text-xs font-bold text-white hover:bg-teal-900 active:bg-teal-950 disabled:opacity-50 shadow-sm cursor-pointer"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving Record…
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Medical Record
                  </>
                )}
              </button>
            </div>
          </Card>
        </form>
      ) : (
        /* ── MODE: VIEW (MEDICAL ID & HISTORY) ─────────────────────── */
        <div className="space-y-6">
          {/* Medical ID Hero Credential Card */}
          <Card className="!p-0 overflow-hidden shadow-xs">
            <div className="bg-teal-900 text-white px-5 py-5 lg:px-6 lg:py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-teal-200/90">
                    CampusCare Verified Medical ID
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                  <span className="text-[11px] text-teal-200/70">Confidential</span>
                </div>
                <h2 className="cc-display text-xl lg:text-2xl font-bold truncate">
                  {profile.name || 'Student'}
                </h2>
                <p className="text-xs text-teal-100/80 font-mono mt-0.5">
                  Roll No: <span className="font-semibold text-white">{profile.rollNumber}</span>
                  {profile.course && ` · ${profile.course}`}
                </p>
              </div>

              <div className="flex items-center sm:flex-col sm:items-end justify-between sm:justify-center border-t sm:border-t-0 border-teal-800/80 pt-3 sm:pt-0 shrink-0">
                <p className="text-[11px] uppercase tracking-wider text-teal-200/70">Blood Group</p>
                <div className="cc-display text-3xl lg:text-4xl font-extrabold text-white leading-none mt-0.5">
                  {profile.bloodGroup || medicalProfile?.bloodGroup || '—'}
                </div>
              </div>
            </div>

            {/* Quick Status Bar */}
            <div className="bg-teal-950/20 border-b border-slate-100 px-5 py-3 lg:px-6 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  {lastSavedFormatted
                    ? `Last saved: ${lastSavedFormatted}`
                    : 'Awaiting initial medical record declaration'}
                </span>
              </div>

              {canEdit ? (
                <button
                  type="button"
                  onClick={handleStartEdit}
                  className="text-xs font-bold text-teal-800 hover:text-teal-950 underline cursor-pointer"
                >
                  Edit details
                </button>
              ) : (
                <span className="text-[11px] font-medium text-slate-400">Clinical Staff Read-Only</span>
              )}
            </div>

            {/* 3 Metric Declaration Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100">
              {/* Allergies status overview */}
              <div className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-400">Allergies Status</span>
                  <StatusPill
                    status={allergyStatus}
                    count={allergiesList.length}
                  />
                </div>
                <p
                  className={`text-sm font-semibold truncate ${
                    hasSevereAlert ? 'text-red-700' : 'text-slate-800'
                  }`}
                >
                  {allergyStatus === 'HAS_RECORDS'
                    ? allergiesList.map((a) => a.allergen).join(', ')
                    : allergyStatus === 'NONE_REPORTED'
                    ? 'None recorded'
                    : 'Not declared yet'}
                </p>
              </div>

              {/* Conditions status overview */}
              <div className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-400">Chronic Conditions</span>
                  <StatusPill
                    status={conditionStatus}
                    count={conditionsList.length}
                  />
                </div>
                <p className="text-sm font-semibold text-slate-800 truncate">
                  {conditionStatus === 'HAS_RECORDS'
                    ? conditionsList.map((c) => c.name).join(', ')
                    : conditionStatus === 'NONE_REPORTED'
                    ? 'None recorded'
                    : 'Not declared yet'}
                </p>
              </div>

              {/* Medications status overview */}
              <div className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-400">Ongoing Medication</span>
                  <StatusPill
                    status={medicationStatus}
                    count={medicationsList.length}
                  />
                </div>
                <p className="text-sm font-semibold text-slate-800 truncate">
                  {medicationStatus === 'HAS_RECORDS'
                    ? medicationsList.map((m) => m.medicineName).join(', ')
                    : medicationStatus === 'NONE_REPORTED'
                    ? 'None recorded'
                    : 'Not declared yet'}
                </p>
              </div>
            </div>
          </Card>

          {/* Section: Allergies & Sensitivities */}
          <Card
            title="Allergies & Adverse Reactions"
            icon={AlertTriangle}
            aside={
              <StatusPill
                status={allergyStatus}
                count={allergiesList.length}
              />
            }
          >
            {allergyStatus === 'HAS_RECORDS' && allergiesList.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {allergiesList.map((item) => (
                  <div
                    key={item.allergyId}
                    className="p-4 rounded-2xl border border-slate-200/90 bg-slate-50/50 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-slate-900">{item.allergen}</h4>
                      <SeverityBadge severity={item.severity} />
                    </div>
                    {item.reaction && (
                      <p className="text-xs text-slate-600">
                        <span className="font-medium text-slate-400">Reaction:</span> {item.reaction}
                      </p>
                    )}
                    <div className="pt-2 flex items-center justify-between border-t border-slate-100 text-[11px]">
                      <SourceTag source={item.source} canEdit={item.canEdit} />
                      {item.recordedAt && (
                        <span className="text-slate-400">
                          {new Date(item.recordedAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : allergyStatus === 'NONE_REPORTED' ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-emerald-950 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-emerald-900">Confirmed: None recorded</p>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    The student has affirmatively declared having no known food, drug, or environmental allergies.
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-amber-950 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-amber-900">Information Missing: Not declared yet</p>
                  <p className="text-xs text-amber-800 mt-0.5">
                    No allergy history is on file. Please complete your clinical declarations for campus health safety.
                  </p>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="mt-2 text-xs font-bold text-teal-800 hover:text-teal-950 underline cursor-pointer"
                    >
                      Declare allergies now →
                    </button>
                  )}
                </div>
              </div>
            )}
          </Card>

          {/* Section: Chronic Conditions */}
          <Card
            title="Chronic Conditions & Diagnoses"
            icon={HeartPulse}
            aside={
              <StatusPill
                status={conditionStatus}
                count={conditionsList.length}
              />
            }
          >
            {conditionStatus === 'HAS_RECORDS' && conditionsList.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {conditionsList.map((cond) => (
                  <div
                    key={cond.studentConditionId || cond.name}
                    className="p-4 rounded-2xl border border-slate-200/90 bg-slate-50/50 flex flex-col justify-between gap-2"
                  >
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{cond.name}</h4>
                      {cond.otherDescription && cond.otherDescription !== cond.name && (
                        <p className="text-xs text-slate-500 mt-0.5">{cond.otherDescription}</p>
                      )}
                    </div>
                    <div className="pt-2 flex items-center justify-between border-t border-slate-100 text-[11px]">
                      <SourceTag source={cond.source} canEdit={cond.canEdit} />
                    </div>
                  </div>
                ))}
              </div>
            ) : conditionStatus === 'NONE_REPORTED' ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-emerald-950 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-emerald-900">Confirmed: None recorded</p>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    The student has affirmatively reported no active chronic illnesses or ongoing medical conditions.
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-amber-950 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-amber-900">Information Missing: Not declared yet</p>
                  <p className="text-xs text-amber-800 mt-0.5">
                    Chronic conditions have not been reported. Update your medical declarations so doctors have complete context.
                  </p>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="mt-2 text-xs font-bold text-teal-800 hover:text-teal-950 underline cursor-pointer"
                    >
                      Declare chronic conditions now →
                    </button>
                  )}
                </div>
              </div>
            )}
          </Card>

          {/* Section: Ongoing Medications */}
          <Card
            title="Ongoing Medications"
            icon={Pill}
            aside={
              <StatusPill
                status={medicationStatus}
                count={medicationsList.length}
              />
            }
          >
            {medicationStatus === 'HAS_RECORDS' && medicationsList.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {medicationsList.map((med) => (
                  <div
                    key={med.studentMedicationId || med.medicineName}
                    className="p-4 rounded-2xl border border-slate-200/90 bg-slate-50/50 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-slate-900">{med.medicineName}</h4>
                      {med.strength && (
                        <span className="text-xs font-medium text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-lg">
                          {med.strength}
                        </span>
                      )}
                    </div>
                    {med.dose && (
                      <p className="text-xs text-slate-600">
                        <span className="font-medium text-slate-400">Dose/Frequency:</span> {med.dose}
                      </p>
                    )}
                    {med.reason && (
                      <p className="text-xs text-slate-600">
                        <span className="font-medium text-slate-400">Indication:</span> {med.reason}
                      </p>
                    )}
                    <div className="pt-2 flex items-center justify-between border-t border-slate-100 text-[11px]">
                      <SourceTag source={med.source} canEdit={med.canEdit} />
                    </div>
                  </div>
                ))}
              </div>
            ) : medicationStatus === 'NONE_REPORTED' ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-emerald-950 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-emerald-900">Confirmed: None recorded</p>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    The student has affirmatively reported taking no regular prescription or ongoing medications.
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-amber-950 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-amber-900">Information Missing: Not declared yet</p>
                  <p className="text-xs text-amber-800 mt-0.5">
                    Ongoing medication history is missing. Please declare any regular prescription drugs you take.
                  </p>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="mt-2 text-xs font-bold text-teal-800 hover:text-teal-950 underline cursor-pointer"
                    >
                      Declare medications now →
                    </button>
                  )}
                </div>
              </div>
            )}
          </Card>

          {/* Section: Verified Clinic Consultations (Sanitized) */}
          <Card title="Campus Clinic Consultation History" icon={Stethoscope}>
            {consultationsList.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {consultationsList.map((c) => (
                  <div key={c.visitId} className="py-3.5 first:pt-0 last:pb-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800">{c.diagnosis}</span>
                        <span className="text-[11px] font-medium text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
                          {c.doctorName}
                        </span>
                      </div>
                      {c.completedAt && (
                        <span className="text-xs text-slate-400">
                          {new Date(c.completedAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      )}
                    </div>
                    {c.prescriptions && c.prescriptions.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap text-xs text-slate-600">
                        <span className="text-slate-400">Prescribed:</span>
                        {c.prescriptions.map((pr, pIdx) => (
                          <span
                            key={pIdx}
                            className="bg-white border border-slate-200 px-2 py-0.5 rounded-md text-[11px] text-slate-700"
                          >
                            {pr}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 py-2">
                No past consultations recorded at the campus health centre yet.
              </p>
            )}
            <p className="text-[11px] text-slate-400 pt-3 border-t border-slate-100 leading-relaxed">
              Maintained automatically by attending doctors at the campus dispensary. Internal triage scratchpad notes are
              excluded to preserve student privacy.
            </p>
          </Card>
        </div>
      )}
    </div>
  )
}

function HelpView({ emergencyDirectory, personalContacts, onAddContact }) {
  const campusNumbers = emergencyDirectory?.campusServices || CAMPUS_NUMBERS
  const personalList = personalContacts || emergencyDirectory?.personalContacts || []
  const nationalList = emergencyDirectory?.nationalHelplines || EMERGENCY

  return (
    <div className="space-y-5">
      <PageTitle sub="Approved campus emergency numbers, 24×7 dispensary, and verified personal contacts">
        Emergency & Helplines
      </PageTitle>

      {/* Critical First Responder Call Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {nationalList.slice(0, 2).map((e) => (
          <CallButton
            key={e.label}
            item={{
              ...e,
              icon: (e.label || '').toLowerCase().includes('tele') ? HeartPulse : Ambulance,
            }}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Approved Campus Emergency Services */}
        <Card title="Approved Campus Emergency Contacts" icon={Phone}>
          <ul className="divide-y divide-slate-100 -my-1.5">
            {campusNumbers.map((c) => (
              <li key={c.label}>
                <a
                  href={telHref(c.number)}
                  aria-label={`Call ${c.label} at ${c.number}`}
                  className="flex items-center justify-between gap-3 py-3.5 px-1 rounded-xl active:bg-slate-50 hover:bg-slate-50/80 transition-colors"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-800">{c.label}</span>
                    <span className="block text-xs text-slate-500">{c.sub}</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-bold text-teal-800 tabular-nums shrink-0 bg-teal-50 border border-teal-200 px-3 py-1.5 rounded-xl shadow-2xs">
                    <Phone className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
                    {c.number}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Card>

        {/* Student's Verified Emergency Contact */}
        <div className="space-y-4">
          <Card title="Verified Personal Emergency Contact" icon={ShieldCheck}>
            {personalList.length > 0 ? (
              <div className="space-y-3">
                {personalList.map((pc, idx) => (
                  <div
                    key={pc.contactId || idx}
                    className="p-4 rounded-2xl bg-teal-50/70 border border-teal-200 flex items-center justify-between gap-3 shadow-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900 truncate">{pc.name}</span>
                        <span className="text-[11px] font-semibold text-teal-800 bg-white border border-teal-200 px-2 py-0.5 rounded-full shrink-0">
                          {pc.relationship}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 font-mono">{pc.phoneNumber}</p>
                    </div>
                    <a
                      href={telHref(pc.phoneNumber)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-800 text-white text-xs font-bold hover:bg-teal-900 active:bg-teal-950 transition-colors shadow-xs shrink-0 cursor-pointer"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      Call
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center space-y-2">
                <p className="text-xs text-amber-800 font-semibold">No personal emergency contact registered.</p>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                  Please register your primary contact so attending clinicians can reach your family during urgent medical situations.
                </p>
                {onAddContact && (
                  <button
                    type="button"
                    onClick={onAddContact}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-800 hover:bg-teal-900 text-white text-xs font-semibold cursor-pointer shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Register Contact
                  </button>
                )}
              </div>
            )}
          </Card>

          {/* National Helplines */}
          <Card title="National 24×7 Helplines" icon={HeartPulse}>
            <ul className="divide-y divide-slate-100 -my-1.5">
              {nationalList.map((nh) => (
                <li key={nh.label}>
                  <a
                    href={telHref(nh.number)}
                    className="flex items-center justify-between gap-3 py-3 px-1 hover:text-teal-800 transition-colors"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-slate-800">{nh.label}</span>
                      <span className="block text-[11px] text-slate-400">{nh.sub}</span>
                    </span>
                    <span className="text-xs font-bold text-slate-700 tabular-nums">
                      {nh.number}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}

function AccountView({ profile, profileCompletion, logout, onEditProfile }) {
  const isComplete = profileCompletion?.isComplete
  const percentage = profileCompletion?.percentage ?? 100

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <PageTitle sub="Official university record and student-editable profile demographics">
          Account & University Records
        </PageTitle>
        <button
          type="button"
          onClick={onEditProfile}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-800 text-white text-xs font-bold hover:bg-teal-900 active:bg-teal-950 transition-colors shadow-xs cursor-pointer"
        >
          <Edit3 className="w-3.5 h-3.5" />
          Edit Profile
        </button>
      </div>

      {/* Profile Completion Status Badge */}
      <Card className="!p-4 sm:!p-5 border-teal-100 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {isComplete ? (
              <span className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </span>
            ) : (
              <span className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </span>
            )}
            <div>
              <p className="text-xs font-bold text-slate-900">
                Health Profile Completion: {percentage}%
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {isComplete
                  ? 'All mandatory clinical declarations & emergency contacts on file.'
                  : 'Incomplete. Please complete your clinical profile for health centre records.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onEditProfile}
            className="text-xs font-bold text-teal-800 hover:text-teal-950 underline shrink-0 cursor-pointer"
          >
            {isComplete ? 'Update Info' : 'Complete Now'}
          </button>
        </div>
        {!isComplete && (
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
            <div
              className="bg-amber-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${percentage}%` }}
            />
          </div>
        )}
      </Card>

      {/* Authoritative University Record (Immutable) */}
      <Card
        title="Institutional Academic Record"
        icon={GraduationCap}
        aside={
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
            <Lock className="w-3 h-3 text-slate-400" />
            Registrar Verified
          </span>
        }
      >
        <div className="flex items-center gap-3.5 pb-4 border-b border-slate-100">
          <span className="w-14 h-14 rounded-2xl bg-teal-800 text-white flex items-center justify-center text-lg font-bold shadow-xs">
            {getInitials(profile.name)}
          </span>
          <div className="min-w-0">
            <p className="cc-display text-lg font-bold text-slate-900 truncate">{profile.name}</p>
            <p className="text-xs text-slate-500 font-mono">Roll: {profile.rollNumber}</p>
            <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 uppercase tracking-wider">
              {profile.status || 'ACTIVE'}
            </span>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          <InfoRow icon={IdCard} label="University Roll Number">
            {profile.rollNumber}
          </InfoRow>
          <InfoRow icon={Mail} label="Institutional Email">
            {profile.email || 'Not on file'}
          </InfoRow>
          <InfoRow icon={GraduationCap} label="Program & Degree">
            {profile.course || 'B.Tech / B.E.'}
          </InfoRow>
          <InfoRow icon={Building2} label="Branch / Department">
            {profile.branch || profile.department || 'Engineering'}
          </InfoRow>
          {profile.semester && (
            <InfoRow icon={CalendarDays} label="Current Academic Semester">
              Semester {profile.semester}
            </InfoRow>
          )}
        </div>
        <p className="text-[11px] text-slate-400 pt-3 border-t border-slate-100">
          Institutional identity and academic credentials are maintained by the campus registrar and cannot be modified online.
        </p>
      </Card>

      {/* Student Personal & Editable Demographics */}
      <Card
        title="Personal Demographics & Contacts"
        icon={User}
        aside={
          <button
            type="button"
            onClick={onEditProfile}
            className="text-xs font-bold text-teal-800 hover:text-teal-950 underline cursor-pointer"
          >
            Edit
          </button>
        }
      >
        <div className="divide-y divide-slate-100">
          <InfoRow icon={Phone} label="Personal Phone Number">
            {profile.contact || 'Not registered'}
          </InfoRow>
          <InfoRow icon={Droplet} label="Blood Group">
            <span className="font-bold text-slate-900">{profile.bloodGroup || 'Not reported'}</span>
          </InfoRow>
          <InfoRow icon={CalendarDays} label="Date of Birth">
            {profile.dateOfBirth || 'Not registered'}
          </InfoRow>
          <InfoRow icon={User} label="Gender Identity">
            {profile.sex || 'Not registered'}
          </InfoRow>
          {profile.emergencyContact && (
            <InfoRow icon={Phone} label={`Primary Emergency Contact (${profile.emergencyContact.relationship || 'Guardian'})`}>
              <span className="font-semibold text-slate-900">{profile.emergencyContact.name}</span>
              <span className="block text-xs text-slate-500 font-mono mt-0.5">{profile.emergencyContact.phoneNumber}</span>
            </InfoRow>
          )}
        </div>
      </Card>

      <div className="pt-2">
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white text-red-600 py-3.5 text-sm font-bold hover:bg-red-50 active:bg-red-100 transition-colors cursor-pointer shadow-2xs"
        >
          <LogOut className="w-4 h-4" aria-hidden="true" />
          Log out of CampusCare
        </button>
      </div>
    </div>
  )
}

// Navigation handled by floating TiltedDock component

// ── Main component ─────────────────────────────────────────────────────

function StudentDashboard() {
  const { rollNumber: urlRollNumber } = useParams()
  const { student: authStudent, userRole, logout } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [tab, setTab] = useState('home')
  const [profile, setProfile] = useState({
    name: authStudent?.name || '',
    rollNumber: authStudent?.rollNumber || '',
    course: '',
    branch: '',
    department: '',
    bloodGroup: '',
    email: authStudent?.email || '',
    contact: '',
    dateOfBirth: '',
    sex: '',
    semester: 6,
    status: 'ACTIVE',
    emergencyContact: null,
  })
  const [profileCompletion, setProfileCompletion] = useState(null)
  const [medicalProfile, setMedicalProfile] = useState(null)
  const [emergencyDirectory, setEmergencyDirectory] = useState(null)
  const [summary, setSummary] = useState(EMPTY_SUMMARY)
  const [history, setHistory] = useState([])
  const [activeVisit, setActiveVisit] = useState(null)
  const [prescriptions, setPrescriptions] = useState([])
  const [sessionExpired, setSessionExpired] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const handleLogout = useCallback(() => {
    logout()
    navigate('/user_login', { replace: true })
  }, [logout, navigate])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      if (userRole === 'STUDENT') {
        // Enforce SD-1: Authenticated session determines student identity, NOT URL params
        // If a student tries accessing another roll number via URL, normalize to their dashboard
        if (urlRollNumber && authStudent?.rollNumber && urlRollNumber.toUpperCase() !== authStudent.rollNumber.toUpperCase()) {
          navigate('/student_dashboard', { replace: true })
        }

        const [meData, historyRes, medProfileRes, emerRes, prescRes] = await Promise.all([
          fetchStudentMe(),
          fetchStudentVisits(),
          fetchStudentMedicalProfile().catch(() => null),
          fetchStudentEmergencyDirectory().catch(() => null),
          fetchStudentPrescriptions().catch(() => []),
        ])

        const s = meData?.student || {}
        const primaryContact =
          meData?.emergencyContacts && meData.emergencyContacts.length > 0
            ? meData.emergencyContacts[0]
            : null

        setProfile({
          name: s.fullName || s.name || authStudent?.name || 'Student',
          rollNumber: s.rollNumber || authStudent?.rollNumber || '',
          course: s.program || s.course || 'B.Tech',
          branch: s.branch || s.department || '',
          department: s.department || s.branch || '',
          bloodGroup: s.bloodGroup || medProfileRes?.bloodGroup || '',
          email: s.email || authStudent?.email || '',
          contact: s.phoneNumber || s.contact || '',
          dateOfBirth: s.dateOfBirth || '',
          sex: s.sex || '',
          semester: s.semester || 6,
          status: s.status || 'ACTIVE',
          emergencyContact: primaryContact,
        })
        if (emerRes) {
          setEmergencyDirectory(emerRes)
        }

        if (meData?.profileCompletion) {
          setProfileCompletion(meData.profileCompletion)

          // Route incomplete profiles to onboarding if first-time, unless explicitly skipped
          if (!meData.profileCompletion.isComplete && !searchParams.get('skipOnboarding')) {
            navigate('/student/onboarding', { replace: true })
            return
          }
        }

        const conditionsList =
          meData?.chronicConditions && meData.chronicConditions.length > 0
            ? meData.chronicConditions.join(', ')
            : NONE
        const allergiesList =
          meData?.allergies && meData.allergies.length > 0
            ? meData.allergies
                .map((a) =>
                  typeof a === 'string'
                    ? a
                    : `${a.allergen}${a.severity ? ` (${a.severity})` : ''}`
                )
                .join(', ')
            : NONE
        const medicationsList =
          meData?.currentMedications && meData.currentMedications.length > 0
            ? meData.currentMedications.join(', ')
            : NONE

        setSummary({
          conditions: conditionsList,
          allergies: allergiesList,
          medication: medicationsList,
        })
        if (medProfileRes) {
          setMedicalProfile(medProfileRes)
        }
        setHistory(Array.isArray(historyRes) ? historyRes : [])
        if (Array.isArray(prescRes)) setPrescriptions(prescRes)
        setActiveVisit(meData?.activeVisit || null)
      } else {
        // Medical staff view (Doctor or Receptionist)
        const targetRoll = urlRollNumber || authStudent?.rollNumber
        if (!targetRoll) {
          throw new Error('No student roll number specified')
        }
        const [profileRes, summaryRes, historyRes] = await Promise.all([
          fetchStudentProfileByRoll(targetRoll),
          fetchPatientSummary(targetRoll),
          fetchStudentVisitHistoryByRoll(targetRoll),
        ])
        setProfile((prev) => ({ ...prev, ...profileRes }))
        setSummary(summaryRes)
        setHistory(Array.isArray(historyRes) ? historyRes : [])
      }
    } catch (err) {
      if (err.status === 401 || err.message?.includes('Session expired')) {
        setSessionExpired(true)
        setLoading(false)
        return
      }
      setLoadError(err.message || 'Failed to load your health record')
    } finally {
      setLoading(false)
    }
  }, [userRole, urlRollNumber, authStudent, navigate, handleLogout, searchParams])

  const handleMedicalUpdated = useCallback((updatedMedProfile) => {
    if (!updatedMedProfile) return
    setMedicalProfile(updatedMedProfile)
    if (updatedMedProfile.bloodGroup) {
      setProfile((prev) => ({ ...prev, bloodGroup: updatedMedProfile.bloodGroup }))
    }
    const conditionsList =
      updatedMedProfile.conditions && updatedMedProfile.conditions.length > 0
        ? updatedMedProfile.conditions.map((c) => c.name).join(', ')
        : updatedMedProfile.medicalStatus?.conditionStatus === 'NONE_REPORTED'
        ? NONE
        : 'None recorded'
    const allergiesList =
      updatedMedProfile.allergies && updatedMedProfile.allergies.length > 0
        ? updatedMedProfile.allergies
            .map((a) => `${a.allergen}${a.severity ? ` (${a.severity})` : ''}`)
            .join(', ')
        : updatedMedProfile.medicalStatus?.allergyStatus === 'NONE_REPORTED'
        ? NONE
        : 'None recorded'
    const medicationsList =
      updatedMedProfile.medications && updatedMedProfile.medications.length > 0
        ? updatedMedProfile.medications
            .map((m) => `${m.medicineName}${m.strength ? ` ${m.strength}` : ''}`.trim())
            .join(', ')
        : updatedMedProfile.medicalStatus?.medicationStatus === 'NONE_REPORTED'
        ? NONE
        : 'None recorded'

    setSummary({
      conditions: conditionsList,
      allergies: allergiesList,
      medication: medicationsList,
    })
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Start each tab at the top of the page
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [tab])

  // Assumes history comes back newest-first (same as the doctor dashboard).
  const latest = history.length > 0 ? history[0] : null
  const hasAllergies = !!summary.allergies && summary.allergies !== NONE
  const now = new Date()
  const hour = now.getHours()

  if (sessionExpired) {
    return (
      <div className="min-h-screen bg-[#F2F6F5] flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-xl text-center space-y-4 border border-slate-200/80">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto border border-amber-200">
            <Lock className="w-7 h-7" />
          </div>
          <div>
            <h2 className="cc-display text-xl font-bold text-slate-900">Session Expired</h2>
            <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
              For your privacy and the security of your medical records, your authenticated session has timed out. Please sign in again.
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full py-3 px-4 rounded-xl bg-teal-800 hover:bg-teal-900 active:bg-teal-950 text-white font-semibold text-sm transition-colors cursor-pointer shadow-xs"
          >
            Sign In Again
          </button>
        </div>
      </div>
    )
  }

  if (loadError && !profile.name && !loading) {
    return (
      <div className="min-h-screen bg-[#F2F6F5] flex flex-col items-center justify-center p-4 text-center">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full border border-slate-200/80 shadow-md space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h2 className="cc-display text-xl font-bold text-slate-900">Unable to Load Records</h2>
            <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
              {loadError}
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={loadAll}
              className="flex-1 py-2.5 px-4 rounded-xl bg-teal-800 hover:bg-teal-900 text-white font-semibold text-sm transition-colors cursor-pointer shadow-xs"
            >
              Try Again
            </button>
            <button
              onClick={handleLogout}
              className="py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F2F6F5] flex flex-col items-center justify-center gap-3">
        <div className="w-9 h-9 border-3 border-teal-700 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-600 font-medium text-sm">Loading verified student health records…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F2F6F5]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&display=swap');
        .cc-display { font-family: 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif; letter-spacing: -0.01em; }
        @media (prefers-reduced-motion: reduce) { .cc-anim { transition: none !important; } }
      `}</style>

      <div className="max-w-5xl mx-auto px-4 pt-4 pb-36 sm:px-6 sm:pt-6 lg:px-10 lg:pt-8 lg:pb-36">
        {/* Top bar */}
        <header className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200/60">
          <div className="flex items-center gap-3">
            <img
              src={campusCareLogo}
              alt="CampusCare Logo"
              className="w-9 h-9 object-contain drop-shadow-xs"
            />
            <div>
              <span className="cc-display text-lg font-bold text-slate-900 tracking-tight block leading-tight">
                CampusCare
              </span>
              <span className="text-xs text-slate-500 font-medium">Student Health Portal</span>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <span className="text-xs sm:text-sm text-slate-500 hidden sm:inline">
              {now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>

            {profile.name && (
              <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
                <span className="w-8 h-8 rounded-full bg-teal-800 text-white flex items-center justify-center text-xs font-semibold shadow-xs">
                  {getInitials(profile.name)}
                </span>
                <span className="text-sm font-medium text-slate-800 hidden md:inline truncate max-w-[140px]">
                  {profile.name}
                </span>
              </div>
            )}

            <button
              onClick={handleLogout}
              title="Log out"
              aria-label="Log out"
              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {loadError && (
          <div role="alert" className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 mb-4 text-sm text-red-700 flex items-center justify-between">
            <span>{loadError}</span>
            <button onClick={loadAll} className="underline text-xs cursor-pointer">Retry</button>
          </div>
        )}

        <main>
          {tab === 'home' && (
            <HomeView
              profile={profile}
              latest={latest}
              history={history}
              hasAllergies={hasAllergies}
              summary={summary}
              hour={hour}
              activeVisit={activeVisit}
              profileCompletion={profileCompletion}
              goTo={setTab}
              onCompleteProfile={() => navigate('/student/onboarding')}
            />
          )}
          {tab === 'prescription' && <PrescriptionView latest={latest} history={history} prescriptions={prescriptions} />}
          {tab === 'health' && (
            <HealthView
              profile={profile}
              summary={summary}
              hasAllergies={hasAllergies}
              medicalProfile={medicalProfile}
              onMedicalUpdated={handleMedicalUpdated}
              canEdit={userRole === 'STUDENT'}
            />
          )}
          {tab === 'help' && (
            <HelpView
              emergencyDirectory={emergencyDirectory}
              personalContacts={profile.emergencyContact ? [profile.emergencyContact] : []}
              onAddContact={() => navigate('/student/profile')}
            />
          )}
          {tab === 'account' && (
            <AccountView
              profile={profile}
              profileCompletion={profileCompletion}
              logout={handleLogout}
              onEditProfile={() => navigate('/student/profile')}
            />
          )}
        </main>
      </div>

      <StudentDock tab={tab} onChange={setTab} />
    </div>
  )
}

export default StudentDashboard