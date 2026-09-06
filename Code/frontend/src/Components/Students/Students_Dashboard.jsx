import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  fetchPatientProfile,
  fetchPatientSummary,
  fetchPatientHistory,
} from '../../api'

// ── Icons ──────────────────────────────────────────────────────────────

function ChevronIcon({ open }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={'transition-transform duration-200 flex' + (open ? ' rotate-90' : '')}
    >
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <polyline points="3 7 12 13 21 7" />
    </svg>
  )
}

function DropletIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2s7 8.5 7 13a7 7 0 0 1-14 0c0-4.5 7-13 7-13z" />
    </svg>
  )
}

function BookIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}

function PillIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7z" />
      <path d="m8.5 8.5 7 7" />
    </svg>
  )
}

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    </svg>
  )
}

// ── Reusable accordion section (read-only version, no Edit button) ─────

function Section({ label, valuePreview, tone, open, onToggle, children }) {
  const labelColor = tone === 'red' ? 'text-red-600' : 'text-teal-700/70'
  return (
    <div className="mb-1">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 px-2 py-2 rounded-md text-left hover:bg-teal-50/70 transition-colors"
      >
        <div className="min-w-0">
          <div className={'text-xs font-semibold tracking-wide uppercase ' + labelColor}>{label}</div>
          {valuePreview && !open && (
            <div className="text-xs font-normal text-slate-400 truncate mt-0.5">{valuePreview}</div>
          )}
        </div>
        <span className="text-teal-600/60 shrink-0">
          <ChevronIcon open={open} />
        </span>
      </button>
      <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 250ms ease' }}>
        <div className="overflow-hidden">
          <div className="pt-1 pb-2 px-2">{children}</div>
        </div>
      </div>
    </div>
  )
}

const EMPTY_SUMMARY = { conditions: 'None recorded', allergies: 'None recorded', medication: 'None recorded' }

// Numbers a student may need in a hurry. Swap in your campus's real
// numbers here — these are placeholders.
const IMPORTANT_NUMBERS = [
  { label: 'Campus Health Centre', number: '+91-000-000-0000' },
  { label: 'Ambulance', number: '108' },
  { label: 'Campus Security', number: '+91-000-000-0001' },
  { label: 'Hostel Warden (On Duty)', number: '+91-000-000-0002' },
  { label: 'Mental Health Helpline (Tele-MANAS)', number: '14416' },
]

function Students_Dashboard() {
  const { rollNumber } = useParams()

  const [profile, setProfile] = useState({
    name: '',
    rollNumber: rollNumber ?? '',
    course: '',
    branch: '',
    bloodGroup: '',
    email: '',
    contact: '',
  })

  const [summary, setSummary] = useState(EMPTY_SUMMARY)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [openSections, setOpenSections] = useState({})
  const [expandedVisit, setExpandedVisit] = useState(null)

  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef(null)

  const loadAll = useCallback(async () => {
    if (!rollNumber) return
    setLoading(true)
    setLoadError('')
    try {
      const [profileRes, summaryRes, historyRes] = await Promise.all([
        fetchPatientProfile(rollNumber),
        fetchPatientSummary(rollNumber),
        fetchPatientHistory(rollNumber),
      ])
      setProfile((prev) => ({ ...prev, ...profileRes }))
      setSummary(summaryRes)
      setHistory(historyRes)
    } catch (err) {
      setLoadError(err.message || 'Failed to load your health record')
    } finally {
      setLoading(false)
    }
  }, [rollNumber])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  useEffect(() => {
    function handleClickOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false)
    }
    function handleEscape(e) {
      if (e.key === 'Escape') setProfileOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  function toggleSection(key) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function toggleVisit(index) {
    setExpandedVisit(expandedVisit === index ? null : index)
  }

  // Assumes fetchPatientHistory returns visits newest-first, matching the
  // order they're rendered in the doctor's dashboard. If your API returns
  // oldest-first instead, swap this to history[history.length - 1].
  const latest = history.length > 0 ? history[0] : null

  const initials = (profile.name || '')
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .slice(-2)
    .join('')

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-5 min-h-screen flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading your dashboard…</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-5 bg-slate-50 min-h-screen relative">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5 border-b border-teal-100 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-9 rounded-full bg-teal-600" />
          <div>
            <h1 className="text-xl font-bold text-slate-800">My Health Dashboard</h1>
            <p className="text-sm text-teal-700/70">CampusCare</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400 hidden sm:inline">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}
          </span>
          <div className="w-px h-6 bg-slate-200 hidden sm:block" />

          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen((prev) => !prev)}
              aria-expanded={profileOpen}
              aria-haspopup="true"
              className={'flex items-center gap-2 pl-1 pr-2 py-1 rounded-full transition-colors ' + (profileOpen ? 'bg-white' : 'hover:bg-white')}
            >
              <div className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                {initials}
              </div>
              <div className="text-left leading-tight hidden sm:block">
                <div className="text-sm font-semibold text-slate-800">{profile.name}</div>
                <div className="text-xs text-slate-400">{profile.rollNumber}</div>
              </div>
              <span className={'text-slate-400 ml-0.5 transition-transform duration-200' + (profileOpen ? ' rotate-180' : '')}>
                <ChevronDownIcon />
              </span>
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden">
                <div className="p-3 border-b border-slate-100 bg-teal-50/50 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-teal-600 text-white flex items-center justify-center text-sm font-semibold shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-800 truncate">{profile.name}</div>
                    <div className="text-xs text-teal-700">{profile.rollNumber}</div>
                  </div>
                </div>

                <div className="p-3 space-y-2 border-b border-slate-100">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <span className="text-teal-600/70 shrink-0"><BookIcon /></span>
                    <span>{profile.course}{profile.branch ? ` · ${profile.branch}` : ''}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <span className="text-teal-600/70 shrink-0"><DropletIcon /></span>
                    <span>Blood group: {profile.bloodGroup || 'Not on file'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <span className="text-teal-600/70 shrink-0"><MailIcon /></span>
                    <span className="truncate">{profile.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <span className="text-teal-600/70 shrink-0"><PhoneIcon /></span>
                    <span>{profile.contact || 'Not on file'}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {/* ── Main grid ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left / main column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Latest prescription */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold tracking-wide uppercase text-teal-700/70">Latest Prescription</h2>
              {latest && <span className="text-xs text-slate-400">{latest.date}</span>}
            </div>

            {!latest && (
              <p className="text-sm text-slate-400">No prescriptions yet. Once a doctor sees you, it'll show up here.</p>
            )}

            {latest && (
              <div>
                <div className="mb-3">
                  <div className="text-xs text-slate-400 mb-0.5">Diagnosis</div>
                  <div className="text-base font-semibold text-slate-800">{latest.diagnosis || 'Not specified'}</div>
                </div>

                {latest.notes && (
                  <div className="mb-4">
                    <div className="text-xs text-slate-400 mb-0.5">Doctor's notes</div>
                    <p className="text-sm text-slate-600">{latest.notes}</p>
                  </div>
                )}

                {latest.medicines && latest.medicines.length > 0 ? (
                  <div>
                    <div className="text-xs text-slate-400 tracking-wide mb-2">MEDICINES</div>
                    <div className="space-y-2">
                      {latest.medicines.map((m, mi) => (
                        <div key={mi} className="flex items-start gap-2.5 bg-teal-50/60 rounded-lg px-3 py-2">
                          <span className="text-teal-600 mt-0.5 shrink-0"><PillIcon /></span>
                          <div>
                            <div className="text-sm font-medium text-slate-800">{m.name}</div>
                            <div className="text-xs text-slate-500">
                              {m.timing}{m.note ? ` — ${m.note}` : ''}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">No medicines were prescribed at this visit.</p>
                )}
              </div>
            )}
          </div>

          {/* Prescription history */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h2 className="text-sm font-semibold tracking-wide uppercase text-teal-700/70 px-2 mb-1">Prescription History</h2>

            {history.length === 0 && <p className="text-sm text-slate-400 px-2 py-2">No previous visits on record.</p>}

            {history.map((h, index) => (
              <div key={index} className="border border-slate-200 rounded-md mb-1.5 overflow-hidden">
                <button
                  onClick={() => toggleVisit(index)}
                  className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-teal-50/60 transition-colors"
                >
                  <div>
                    <b className="text-slate-800 text-sm block">{h.date}</b>
                    <span className="text-sm text-slate-600">{h.diagnosis}</span>
                  </div>
                  <span className="text-teal-600/60">
                    <ChevronIcon open={expandedVisit === index} />
                  </span>
                </button>
                <div style={{ display: 'grid', gridTemplateRows: expandedVisit === index ? '1fr' : '0fr', transition: 'grid-template-rows 250ms ease' }}>
                  <div className="overflow-hidden">
                    <div className="px-3 pb-3 pt-1 bg-slate-50 border-t border-slate-100">
                      <div className="text-xs text-slate-500 mb-2">{h.notes}</div>
                      {h.medicines && h.medicines.length > 0 && (
                        <div>
                          <div className="text-slate-400 text-xs tracking-wide mb-1">MEDICINES GIVEN</div>
                          {h.medicines.map((m, mi) => (
                            <div key={mi} className="text-sm text-slate-700 mb-0.5">
                              {m.name} <span className="text-slate-400">— {m.timing}{m.note ? `, ${m.note}` : ''}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right / sidebar column */}
        <div className="space-y-5">
          {/* Health summary */}
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <h2 className="text-sm font-semibold tracking-wide uppercase text-teal-700/70 px-2 pt-1 mb-1">Health Summary</h2>

            <Section
              label="Conditions"
              valuePreview={summary.conditions}
              open={!!openSections.conditions}
              onToggle={() => toggleSection('conditions')}
            >
              <span className="text-sm text-slate-700">{summary.conditions}</span>
            </Section>

            <Section
              label="Allergies"
              valuePreview={summary.allergies}
              tone={summary.allergies === 'None recorded' ? 'default' : 'red'}
              open={!!openSections.allergies}
              onToggle={() => toggleSection('allergies')}
            >
              <span className={summary.allergies === 'None recorded' ? 'text-sm text-slate-700' : 'text-sm text-red-700 font-medium'}>
                {summary.allergies}
              </span>
            </Section>

            <Section
              label="Ongoing Medication"
              valuePreview={summary.medication}
              open={!!openSections.medication}
              onToggle={() => toggleSection('medication')}
            >
              <span className="text-sm text-slate-700">{summary.medication}</span>
            </Section>

            <p className="text-xs text-slate-400 px-2 pt-1 pb-2">
              This information is maintained by the doctors who've treated you. Contact the health centre if anything here looks wrong.
            </p>
          </div>

          {/* Important numbers */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h2 className="text-sm font-semibold tracking-wide uppercase text-teal-700/70 mb-3 flex items-center gap-1.5">
              <span className="text-red-500"><AlertIcon /></span>
              Important Numbers
            </h2>
            <div className="space-y-1">
              {IMPORTANT_NUMBERS.map((item, i) => (
                <a
                  key={i}
                  href={`tel:${item.number.replace(/[^0-9+]/g, '')}`}
                  className="flex items-center justify-between px-2 py-2 rounded-md hover:bg-teal-50/70 transition-colors group"
                >
                  <span className="text-sm text-slate-600">{item.label}</span>
                  <span className="text-sm font-semibold text-teal-700 flex items-center gap-1.5">
                    <PhoneIcon />
                    {item.number}
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Students_Dashboard