import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import StudentDock from '../ui/dock'
import {
  fetchPatientProfile,
  fetchPatientSummary,
  fetchPatientHistory,
  fetchStudentMe,
  fetchStudentProfileByRoll,
  fetchStudentVisitHistoryByRoll,
} from '../../api'

// ── Constants ──────────────────────────────────────────────────────────

const NONE = 'None recorded'
const EMPTY_SUMMARY = { conditions: NONE, allergies: NONE, medication: NONE }

// Placeholders — swap in your campus's real numbers.
const EMERGENCY = [
  { label: 'Ambulance', sub: 'Medical emergencies', number: '108', icon: Ambulance },
  { label: 'Tele-MANAS', sub: 'Mental health support, 24×7', number: '14416', icon: HeartPulse },
]
const CAMPUS_NUMBERS = [
  { label: 'Campus Health Centre', sub: 'Appointments and medical help', number: '+91-000-000-0000' },
  { label: 'Campus Security', sub: 'Safety issues on campus', number: '+91-000-000-0001' },
  { label: 'Hostel Warden (on duty)', sub: 'Hostel issues, late-night help', number: '+91-000-000-0002' },
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
  medicines.forEach((m) => {
    const t = (m.timing || '').toLowerCase()
    let placed = false
    SLOTS.forEach((s) => {
      if (t.includes(s.key)) {
        groups[s.key].push(m)
        placed = true
      }
    })
    if (!placed) groups.other.push(m)
  })
  return groups
}

const telHref = (n) => `tel:${n.replace(/[^0-9+]/g, '')}`
const joinTiming = (m, sep) => [m.timing, m.note].filter(Boolean).join(sep)

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
        <p className="text-sm text-slate-500">No medicines to take right now.</p>
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

function VisitHistory({ history }) {
  const [expanded, setExpanded] = useState(null)
  return (
    <Card title="Visit history" icon={CalendarDays}>
      {history.length === 0 ? (
        <p className="text-sm text-slate-500">No previous visits on record.</p>
      ) : (
        <ol className="relative border-l-2 border-slate-200 ml-2 space-y-1">
          {history.map((h, index) => {
            const open = expanded === index
            return (
              <li key={index} className="pl-5 relative">
                <span
                  aria-hidden="true"
                  className={
                    'absolute -left-[7px] top-4 w-3 h-3 rounded-full border-2 border-white ' +
                    (index === 0 ? 'bg-teal-700' : 'bg-slate-300')
                  }
                />
                <button
                  onClick={() => setExpanded(open ? null : index)}
                  aria-expanded={open}
                  className="w-full flex items-center justify-between gap-3 text-left rounded-xl px-3 py-3 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 transition-colors"
                >
                  <span>
                    <span className="block text-xs text-slate-400">{h.date}</span>
                    <span className="block text-sm font-semibold text-slate-900">{h.diagnosis}</span>
                  </span>
                  <ChevronRight
                    className={'w-4 h-4 text-slate-400 cc-anim transition-transform duration-200 ' + (open ? 'rotate-90' : '')}
                    aria-hidden="true"
                  />
                </button>
                <div
                  className="cc-anim"
                  style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 250ms ease' }}
                >
                  <div className="overflow-hidden">
                    <div className="mx-3 mb-3 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 space-y-2">
                      {h.notes && <p className="text-sm text-slate-600">{h.notes}</p>}
                      {h.medicines && h.medicines.length > 0 ? (
                        <ul className="space-y-1">
                          {h.medicines.map((m, mi) => (
                            <li key={mi} className="text-sm text-slate-700">
                              {m.name}
                              {joinTiming(m, ', ') && <span className="text-slate-400"> — {joinTiming(m, ', ')}</span>}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-slate-400">No medicines were prescribed at this visit.</p>
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
    <Card title="Latest prescription" icon={Stethoscope} aside={latest && <span className="text-xs text-slate-400">{latest.date}</span>}>
      {!latest ? (
        <p className="text-sm text-slate-500">No prescriptions yet. Once a doctor sees you, it'll show up here.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Diagnosis</p>
            <p className="cc-display text-2xl font-semibold text-slate-900">{latest.diagnosis || 'Not specified'}</p>
          </div>
          {latest.notes && (
            <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-400 mb-0.5">Doctor's notes</p>
              <p className="text-sm text-slate-700 leading-relaxed">{latest.notes}</p>
            </div>
          )}
          {latest.medicines && latest.medicines.length > 0 ? (
            <div>
              <p className="text-xs text-slate-400 mb-2">Medicines</p>
              <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden">
                {latest.medicines.map((m, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                      <Pill className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-900">{m.name}</span>
                      <span className="block text-xs text-slate-500">{joinTiming(m, ' — ')}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No medicines were prescribed at this visit.</p>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Tab views ──────────────────────────────────────────────────────────

function HomeView({ profile, latest, history, hasAllergies, summary, hour, activeVisit, goTo }) {
  const firstName = (profile.name || '').split(' ')[0]
  return (
    <div className="space-y-4">
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
        <div className="hidden lg:block">
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

function PrescriptionView({ latest, history }) {
  return (
    <div>
      <PageTitle sub="What your doctor prescribed, and your past visits">Prescription</PageTitle>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <LatestPrescription latest={latest} />
        <VisitHistory history={history} />
      </div>
    </div>
  )
}

function HealthView({ profile, summary, hasAllergies }) {
  return (
    <div className="space-y-4">
      <PageTitle sub="Show this to a doctor or first responder in an emergency">Medical ID</PageTitle>

      <Card className="!p-0 overflow-hidden">
        <div className="bg-teal-900 text-white px-5 py-4 lg:px-6 lg:py-5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="cc-display text-lg lg:text-xl font-semibold truncate">{profile.name || 'Student'}</p>
            <p className="text-xs text-teal-100/80">{profile.rollNumber}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[11px] text-teal-100/70">Blood group</p>
            <p className="cc-display text-2xl lg:text-3xl font-bold leading-none">{profile.bloodGroup || '—'}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100">
          <div className="p-5 lg:p-6">
            <p className="text-xs text-slate-400 mb-0.5">Allergies</p>
            <p className={'text-sm font-semibold ' + (hasAllergies ? 'text-red-700' : 'text-slate-800')}>{summary.allergies}</p>
          </div>
          <div className="p-5 lg:p-6">
            <p className="text-xs text-slate-400 mb-0.5">Conditions</p>
            <p className="text-sm font-semibold text-slate-800">{summary.conditions}</p>
          </div>
          <div className="p-5 lg:p-6">
            <p className="text-xs text-slate-400 mb-0.5">Ongoing medication</p>
            <p className="text-sm font-semibold text-slate-800">{summary.medication}</p>
          </div>
        </div>
      </Card>

      <p className="text-xs text-slate-400 px-1 leading-relaxed">
        Kept up to date by the doctors who treat you. If something here looks wrong, contact the health centre.
      </p>
    </div>
  )
}

function HelpView() {
  return (
    <div>
      <PageTitle sub="Tap a number to call">Helplines</PageTitle>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div className="grid grid-cols-2 gap-3">
          {EMERGENCY.map((e) => (
            <CallButton key={e.label} item={e} />
          ))}
        </div>

        <Card title="On campus" icon={Phone}>
          <ul className="divide-y divide-slate-100 -my-1.5">
            {CAMPUS_NUMBERS.map((c) => (
              <li key={c.label}>
                <a
                  href={telHref(c.number)}
                  aria-label={`Call ${c.label} at ${c.number}`}
                  className="flex items-center justify-between gap-3 py-3.5 active:bg-slate-50 hover:text-teal-800"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-800">{c.label}</span>
                    <span className="block text-xs text-slate-500">{c.sub}</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-teal-800 tabular-nums shrink-0">
                    <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                    {c.number}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}

function AccountView({ profile, logout }) {
  return (
    <div className="max-w-xl space-y-4">
      <PageTitle>Account</PageTitle>

      <Card>
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <span className="w-14 h-14 rounded-full bg-teal-800 text-white flex items-center justify-center text-lg font-semibold">
            {getInitials(profile.name)}
          </span>
          <div className="min-w-0">
            <p className="cc-display text-lg font-semibold text-slate-900 truncate">{profile.name}</p>
            <p className="text-sm text-slate-500">{profile.rollNumber}</p>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          <InfoRow icon={GraduationCap} label="Course">
            {profile.course ? `${profile.course}${profile.branch ? ` · ${profile.branch}` : ''}` : 'Not on file'}
          </InfoRow>
          <InfoRow icon={Droplet} label="Blood group">{profile.bloodGroup || 'Not on file'}</InfoRow>
          <InfoRow icon={Mail} label="Email">{profile.email || 'Not on file'}</InfoRow>
          <InfoRow icon={Phone} label="Contact number">{profile.contact || 'Not on file'}</InfoRow>
          <InfoRow icon={IdCard} label="Roll number">{profile.rollNumber}</InfoRow>
        </div>
      </Card>

      <button
        onClick={logout}
        className="w-full flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white text-red-600 py-3.5 text-sm font-semibold hover:bg-red-50 active:bg-red-100 transition-colors"
      >
        <LogOut className="w-4 h-4" aria-hidden="true" />
        Log out
      </button>
    </div>
  )
}

// Navigation handled by floating TiltedDock component

// ── Main component ─────────────────────────────────────────────────────

function StudentDashboard() {
  const { rollNumber: urlRollNumber } = useParams()
  const { student: authStudent, userRole, logout } = useAuth()
  const navigate = useNavigate()

  const [tab, setTab] = useState('home')
  const [profile, setProfile] = useState({
    name: authStudent?.name || '',
    rollNumber: authStudent?.rollNumber || '',
    course: '',
    branch: '',
    bloodGroup: '',
    email: authStudent?.email || '',
    contact: '',
  })
  const [summary, setSummary] = useState(EMPTY_SUMMARY)
  const [history, setHistory] = useState([])
  const [activeVisit, setActiveVisit] = useState(null)
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

        const [meData, historyRes] = await Promise.all([
          fetchStudentMe(),
          fetchStudentVisitHistoryByRoll(authStudent?.rollNumber || ''),
        ])

        const s = meData?.student || {}
        setProfile({
          name: s.fullName || s.name || authStudent?.name || 'Student',
          rollNumber: s.rollNumber || authStudent?.rollNumber || '',
          course: s.program || s.course || '',
          branch: s.branch || s.department || '',
          bloodGroup: s.bloodGroup || '',
          email: s.email || authStudent?.email || '',
          contact: s.phoneNumber || s.contact || '',
        })

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
        setHistory(Array.isArray(historyRes) ? historyRes : [])
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
        handleLogout()
        return
      }
      setLoadError(err.message || 'Failed to load your health record')
    } finally {
      setLoading(false)
    }
  }, [userRole, urlRollNumber, authStudent, navigate, handleLogout])

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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F2F6F5] flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-3 border-teal-700 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 font-medium text-sm">Loading your verified health records…</p>
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
              goTo={setTab}
            />
          )}
          {tab === 'prescription' && <PrescriptionView latest={latest} history={history} />}
          {tab === 'health' && <HealthView profile={profile} summary={summary} hasAllergies={hasAllergies} />}
          {tab === 'help' && <HelpView />}
          {tab === 'account' && <AccountView profile={profile} logout={handleLogout} />}
        </main>
      </div>

      <StudentDock tab={tab} onChange={setTab} />
    </div>
  )
}

export default StudentDashboard