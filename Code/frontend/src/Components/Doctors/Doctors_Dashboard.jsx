import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  fetchDoctorProfile,
  fetchDoctorQueue,
  fetchDoctorStats,
  fetchPatientSummary,
  fetchPatientHistory,
  completeConsultation,
  updateAllergy,
  updateCondition,
  updateMedication,
} from '../../api'

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

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="4" y1="4" x2="20" y2="20" />
      <line x1="20" y1="4" x2="4" y2="20" />
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

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
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

function UsersIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function CheckCircleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

function Section({ label, valuePreview, badgeTone, open, onToggle, children }) {
  const labelColor = badgeTone === 'red' ? 'text-red-600' : 'text-teal-700/70'

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

      <div
        style={{
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: 'grid-template-rows 250ms ease',
        }}
      >
        <div className="overflow-hidden">
          <div className="pt-1 pb-2 px-2">{children}</div>
        </div>
      </div>
    </div>
  )
}

const EMPTY_SUMMARY = { conditions: 'None recorded', allergies: 'None recorded', medication: 'None recorded' }

function Doctors_Dashboard() {
  const { doctor, logout } = useAuth()
  const doctorId = doctor?.doctorId

  const [doctorProfile, setDoctorProfile] = useState({
    name: doctor?.name ?? '',
    specialization: doctor?.specialization ?? '',
    shift: '',
    email: '',
  })

  const [queue, setQueue] = useState([])
  const [stats, setStats] = useState({ waiting: 0, seenToday: 0 })
  const [loadingQueue, setLoadingQueue] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [selected, setSelected] = useState(null)

  const [diagnosis, setDiagnosis] = useState('')
  const [general, setGeneral] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [savedMessage, setSavedMessage] = useState('')

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [summary, setSummary] = useState(EMPTY_SUMMARY)
  const [history, setHistory] = useState([])
  const [loadingRecord, setLoadingRecord] = useState(false)

  const [openSections, setOpenSections] = useState({})
  const [editingField, setEditingField] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [savingField, setSavingField] = useState(false)
  const [expandedVisit, setExpandedVisit] = useState(null)

  // profile dropdown state
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef(null)

  const [medicines, setMedicines] = useState([
    { name: '', morning: false, evening: false, night: false, note: '' },
  ])

  // ── initial load: profile, queue, stats ────────────────────────────

  const loadQueueAndStats = useCallback(async () => {
    if (!doctorId) return
    setLoadError('')
    try {
      const [queueRes, statsRes] = await Promise.all([
        fetchDoctorQueue(doctorId),
        fetchDoctorStats(doctorId),
      ])
      setQueue(queueRes)
      setStats(statsRes)
    } catch (err) {
      setLoadError(err.message || 'Failed to load queue')
    } finally {
      setLoadingQueue(false)
    }
  }, [doctorId])

  useEffect(() => {
    if (!doctorId) return
    fetchDoctorProfile(doctorId)
      .then((p) =>
        setDoctorProfile({
          name: p.name,
          specialization: p.specialization,
          shift: p.shift,
          email: p.email,
        })
      )
      .catch(() => {
        /* fall back to the name/specialization we already have from login */
      })
    loadQueueAndStats()
  }, [doctorId, loadQueueAndStats])

  // close the profile dropdown on outside click or Escape
  useEffect(() => {
    function handleClickOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false)
      }
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

  // find the patient object that matches whoever is selected in the queue
  let currentPatient = null
  for (const patient of queue) {
    if (patient.rollNumber === selected) {
      currentPatient = patient
      break
    }
  }

  function handleSelect(rollNumber) {
    setSelected(rollNumber)
    setDiagnosis('')
    setGeneral('')
    setSubmitError('')
    setSavedMessage('')
    setMedicines([{ name: '', morning: false, evening: false, night: false, note: '' }])
    setDrawerOpen(false)
    setOpenSections({})
    setEditingField(null)
    setExpandedVisit(null)
    setSummary(EMPTY_SUMMARY)
    setHistory([])

    setLoadingRecord(true)
    Promise.all([fetchPatientSummary(rollNumber), fetchPatientHistory(rollNumber)])
      .then(([summaryRes, historyRes]) => {
        setSummary(summaryRes)
        setHistory(historyRes)
      })
      .catch((err) => setLoadError(err.message || 'Failed to load patient record'))
      .finally(() => setLoadingRecord(false))
  }

  function toggleSection(key) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
    setEditingField(null)
  }

  function startEdit(field, currentValue) {
    setEditingField(field)
    setEditValue(currentValue === 'None recorded' ? '' : currentValue)
  }

  async function saveCard(field) {
    if (!selected) return
    setSavingField(true)
    try {
      const value = editValue.trim() === '' ? 'None recorded' : editValue.trim()
      const updaters = { conditions: updateCondition, allergies: updateAllergy, medication: updateMedication }
      const updatedSummary = await updaters[field](selected, value)
      setSummary(updatedSummary)
      setEditingField(null)
    } catch (err) {
      setLoadError(err.message || `Failed to save ${field}`)
    } finally {
      setSavingField(false)
    }
  }

  function toggleVisit(index) {
    setExpandedVisit(expandedVisit === index ? null : index)
  }

  function handleMedicineChange(index, field, value) {
    const updated = [...medicines]
    updated[index][field] = value
    setMedicines(updated)
  }

  function addMedicine() {
    setMedicines([...medicines, { name: '', morning: false, evening: false, night: false, note: '' }])
  }

  function removeMedicine(index) {
    setMedicines(medicines.filter((_, i) => i !== index))
  }

  async function markDone() {
    if (!currentPatient || !doctorId) return
    if (!diagnosis.trim()) {
      setSubmitError('Please add a diagnosis before completing the consultation.')
      return
    }
    setSubmitting(true)
    setSubmitError('')
    try {
      await completeConsultation(doctorId, {
        roll_number: selected,
        diagnosis,
        general,
        medicines,
      })
      setSavedMessage(`${currentPatient.name}'s consultation was saved successfully.`)
      setSelected(null)
      setDrawerOpen(false)
      await loadQueueAndStats()
    } catch (err) {
      setSubmitError(err.message || 'Failed to save consultation')
    } finally {
      setSubmitting(false)
    }
  }

  const totalToday = stats.seenToday + queue.length

  return (
    <div className="min-h-screen bg-[#F7F8F6] px-4 py-5 sm:px-6 sm:py-7">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-700 text-white flex items-center justify-center shadow-sm">
              <span className="text-lg font-semibold">+</span>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Doctor Dashboard</h1>
              <p className="text-sm text-slate-500">CampusCare Medical Wing</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">
              {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}
            </span>
            <div className="w-px h-6 bg-slate-200" />

            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen((prev) => !prev)}
                aria-expanded={profileOpen}
                aria-haspopup="true"
                className={
                  'flex items-center gap-2 pl-1 pr-2 py-1 rounded-full border transition-colors ' +
                  (profileOpen ? 'bg-white border-slate-200' : 'border-transparent hover:bg-white hover:border-slate-200')
                }
              >
                <div className="w-8 h-8 rounded-full bg-teal-700 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                  {doctorProfile.name.split(' ').map((n) => n[0]).slice(-2).join('')}
                </div>
                <div className="text-left leading-tight">
                  <div className="text-sm font-semibold text-slate-800">{doctorProfile.name}</div>
                  <div className="text-xs text-slate-400">{doctorProfile.specialization}</div>
                </div>
                <span className={'text-slate-400 ml-0.5 transition-transform duration-200' + (profileOpen ? ' rotate-180' : '')}>
                  <ChevronDownIcon />
                </span>
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden">
                  <div className="p-3 border-b border-slate-100 bg-teal-50/50 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-teal-700 text-white flex items-center justify-center text-sm font-semibold shrink-0">
                      {doctorProfile.name.split(' ').map((n) => n[0]).slice(-2).join('')}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800 truncate">{doctorProfile.name}</div>
                      <div className="text-xs text-teal-700">{doctorProfile.specialization}</div>
                    </div>
                  </div>

                  <div className="p-3 space-y-2 border-b border-slate-100">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <span className="text-teal-600/70 shrink-0">
                        <ClockIcon />
                      </span>
                      <span>Shift: {doctorProfile.shift}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <span className="text-teal-600/70 shrink-0">
                        <MailIcon />
                      </span>
                      <span className="truncate">{doctorProfile.email}</span>
                    </div>
                  </div>

                  <div className="p-3 border-b border-slate-100">
                    <div className="text-xs font-semibold tracking-wide uppercase text-teal-700/70 mb-2">Today</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-teal-50 rounded-md px-3 py-2">
                        <div className="flex items-center gap-1.5 text-teal-700/80 mb-1">
                          <CheckCircleIcon />
                          <span className="text-xs">Seen</span>
                        </div>
                        <div className="text-lg font-bold text-slate-800">{stats.seenToday}</div>
                      </div>
                      <div className="bg-slate-50 rounded-md px-3 py-2">
                        <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                          <UsersIcon />
                          <span className="text-xs">Waiting</span>
                        </div>
                        <div className="text-lg font-bold text-slate-800">{queue.length}</div>
                      </div>
                    </div>
                    <div className="text-xs text-slate-400 mt-2">
                      {totalToday} patient{totalToday === 1 ? '' : 's'} total today
                    </div>
                  </div>

                  <button
                    onClick={logout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 border-t border-slate-100 transition-colors"
                  >
                    <LogoutIcon />
                    End shift
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {loadError && (
          <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4 text-sm text-red-700 flex items-center justify-between">
            <span>{loadError}</span>
            <button onClick={loadQueueAndStats} className="text-red-700 underline text-xs">
              Retry
            </button>
          </div>
        )}

        {savedMessage && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-700 text-xs font-bold text-white">
                ✓
              </span>
              {savedMessage}
            </div>
            <button onClick={() => setSavedMessage('')} className="text-xs font-semibold text-teal-800 hover:text-teal-950">
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-5 items-start">
          <aside className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-sm lg:sticky lg:top-5">
            <div className="flex items-center justify-between mb-3 px-1">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-700">Live queue</p>
                <h2 className="font-semibold text-slate-900 text-sm mt-0.5">Waiting patients</h2>
              </div>
              <span className="min-w-7 h-7 px-2 rounded-full bg-teal-50 text-teal-800 text-xs font-bold flex items-center justify-center">
                {queue.length}
              </span>
            </div>

            {loadingQueue && <p className="text-sm text-slate-400 py-3 text-center">Loading queue…</p>}

            {!loadingQueue && queue.length === 0 && (
              <p className="text-sm text-slate-400 py-3 text-center">No one in queue</p>
            )}
            {queue.map((p) => (
              <button
                key={p.rollNumber}
                type="button"
                onClick={() => handleSelect(p.rollNumber)}
                className={
                  'w-full text-left p-3 mb-1.5 rounded-xl border transition-all ' +
                  (p.rollNumber === selected
                    ? 'bg-teal-50 border-teal-300 shadow-sm'
                    : 'border-transparent hover:bg-slate-50 hover:border-slate-200')
                }
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm text-slate-800">{p.name}</span>
                  {p.priority && <span className="text-red-600 text-xs">urgent</span>}
                </div>
                <div className="text-xs text-slate-500">{p.rollNumber}</div>
                <div className="text-xs text-slate-400">Waiting since {p.waitingSince}</div>
              </button>
            ))}
          </aside>

          <main className="min-h-[590px] bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm relative overflow-hidden">
            {!currentPatient && (
              <div className="max-w-xs mx-auto text-center py-28">
                <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center text-lg">
                  +
                </div>
                <h2 className="font-semibold text-slate-800">Select a patient</h2>
                <p className="text-slate-500 text-sm mt-1.5">
                  Choose someone from the live queue to begin their consultation.
                </p>
              </div>
            )}

            {currentPatient && (
              <div>
                <div className="flex justify-between items-start border-b border-slate-100 pb-4 mb-5">
                  <div>
                    <h2 className="font-bold text-lg text-slate-800">{currentPatient.name}</h2>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-0.5">
                      <span>{currentPatient.rollNumber}</span>
                      <span>·</span>
                      <span>{currentPatient.age} yrs</span>
                      <span>·</span>
                      <span className="font-medium text-teal-700">{currentPatient.bloodGroup}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setDrawerOpen(true)}
                      title="Patient history, medication, allergies, conditions"
                      className="p-2 rounded-md border border-slate-200 text-slate-500 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 transition-colors"
                    >
                      <MenuIcon />
                    </button>
                    <button
                      onClick={markDone}
                      disabled={submitting}
                      className="bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white px-4 py-1.5 rounded-md text-sm transition-colors"
                    >
                      {submitting ? 'Saving…' : 'Done'}
                    </button>
                  </div>
                </div>

                {submitError && (
                  <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4 text-sm text-red-700">
                    {submitError}
                  </div>
                )}

                {summary.allergies !== 'None recorded' && (
                  <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4 text-sm text-red-700">
                    <span className="font-medium">Allergy alert:</span> {summary.allergies}
                  </div>
                )}

                <h3 className="font-semibold text-sm mb-2 text-slate-700">New Prescription</h3>

                <div className="mb-3">
                  <label className="text-sm block mb-1 text-slate-600">Diagnosis</label>
                  <input
                    type="text"
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    placeholder="eg. viral fever, cold etc"
                    className="border border-slate-300 p-1.5 rounded-md text-sm w-full focus:outline-none focus:ring-1 focus:ring-teal-400 focus:border-teal-400"
                  />
                </div>

                <div className="border border-slate-200 rounded-md p-3 mb-3 bg-slate-50">
                  <p className="font-semibold text-sm mb-2 text-slate-700">Daywise</p>

                  {medicines.map((med, index) => (
                    <div key={index} className="flex flex-wrap gap-2 items-center mb-2">
                      <input
                        type="text"
                        placeholder="medicine name"
                        value={med.name}
                        onChange={(e) => handleMedicineChange(index, 'name', e.target.value)}
                        className="border border-slate-300 bg-white p-1.5 rounded-md text-sm"
                      />

                      <label className="text-sm flex items-center gap-1 text-slate-600">
                        <input
                          type="checkbox"
                          checked={med.morning}
                          onChange={(e) => handleMedicineChange(index, 'morning', e.target.checked)}
                          className="accent-teal-600"
                        />
                        morning
                      </label>

                      <label className="text-sm flex items-center gap-1 text-slate-600">
                        <input
                          type="checkbox"
                          checked={med.evening}
                          onChange={(e) => handleMedicineChange(index, 'evening', e.target.checked)}
                          className="accent-teal-600"
                        />
                        evening
                      </label>

                      <label className="text-sm flex items-center gap-1 text-slate-600">
                        <input
                          type="checkbox"
                          checked={med.night}
                          onChange={(e) => handleMedicineChange(index, 'night', e.target.checked)}
                          className="accent-teal-600"
                        />
                        night
                      </label>

                      <input
                        type="text"
                        placeholder="instructions (after food etc)"
                        value={med.note}
                        onChange={(e) => handleMedicineChange(index, 'note', e.target.value)}
                        className="border border-slate-300 bg-white p-1.5 rounded-md text-sm flex-1"
                      />

                      {medicines.length > 1 && (
                        <button onClick={() => removeMedicine(index)} className="text-red-600 text-xs">
                          remove
                        </button>
                      )}
                    </div>
                  ))}

                  <button
                    onClick={addMedicine}
                    className="text-sm border border-dashed border-teal-400 px-2 py-1 rounded-md mt-1 text-teal-700 hover:bg-white"
                  >
                    + add medicine
                  </button>
                </div>

                <div>
                  <label className="text-sm block mb-1 text-slate-600">General Instructions</label>
                  <textarea
                    value={general}
                    onChange={(e) => setGeneral(e.target.value)}
                    rows="3"
                    placeholder="anything without fixed timing - rest, diet, follow up etc"
                    className="border border-slate-300 p-1.5 rounded-md text-sm w-full focus:outline-none focus:ring-1 focus:ring-teal-400 focus:border-teal-400"
                  ></textarea>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {currentPatient && (
        <>
          <div
            onClick={() => setDrawerOpen(false)}
            className={
              'fixed inset-0 bg-black/30 transition-opacity z-40 ' +
              (drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')
            }
          />
          <div
            className={
              'fixed top-0 right-0 h-full w-80 bg-white border-l border-slate-200 shadow-xl z-50 transition-transform duration-300 overflow-y-auto ' +
              (drawerOpen ? 'translate-x-0' : 'translate-x-full')
            }
          >
            <div className="flex items-center justify-between p-4 border-b border-teal-100 bg-teal-50/50">
              <div>
                <h3 className="font-semibold text-slate-800 text-sm">Patient Record</h3>
                <p className="text-xs text-slate-500">
                  {currentPatient.name} · {currentPatient.rollNumber}
                </p>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 rounded-md text-slate-400 hover:bg-white hover:text-teal-700"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="p-3">
              {loadingRecord && <p className="text-sm text-slate-400 text-center py-4">Loading record…</p>}

              {!loadingRecord && (
                <>
                  <Section
                    label="Conditions"
                    valuePreview={summary.conditions}
                    open={!!openSections.conditions}
                    onToggle={() => toggleSection('conditions')}
                  >
                    {editingField === 'conditions' ? (
                      <div>
                        <textarea
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          rows="2"
                          placeholder="eg. Asthma, diabetes etc"
                          className="border border-slate-300 bg-white p-1.5 rounded-md text-sm w-full focus:outline-none focus:ring-1 focus:ring-teal-400 focus:border-teal-400"
                        />
                        <div className="flex justify-end gap-2 mt-1.5">
                          <button onClick={() => setEditingField(null)} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1">
                            Cancel
                          </button>
                          <button
                            onClick={() => saveCard('conditions')}
                            disabled={savingField}
                            className="text-xs bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white px-2.5 py-1 rounded-md"
                          >
                            {savingField ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-700">{summary.conditions}</span>
                        <button
                          onClick={() => startEdit('conditions', summary.conditions)}
                          className="text-xs text-teal-700 hover:text-teal-900 ml-2"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </Section>

                  <Section
                    label="Allergies"
                    valuePreview={summary.allergies}
                    badgeTone={summary.allergies === 'None recorded' ? 'default' : 'red'}
                    open={!!openSections.allergies}
                    onToggle={() => toggleSection('allergies')}
                  >
                    {editingField === 'allergies' ? (
                      <div>
                        <textarea
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          rows="2"
                          placeholder="eg. Peanuts, penicillin etc"
                          className="border border-slate-300 bg-white p-1.5 rounded-md text-sm w-full focus:outline-none focus:ring-1 focus:ring-teal-400 focus:border-teal-400"
                        />
                        <div className="flex justify-end gap-2 mt-1.5">
                          <button onClick={() => setEditingField(null)} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1">
                            Cancel
                          </button>
                          <button
                            onClick={() => saveCard('allergies')}
                            disabled={savingField}
                            className="text-xs bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white px-2.5 py-1 rounded-md"
                          >
                            {savingField ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className={summary.allergies === 'None recorded' ? 'text-sm text-slate-700' : 'text-sm text-red-700 font-medium'}>
                          {summary.allergies}
                        </span>
                        <button
                          onClick={() => startEdit('allergies', summary.allergies)}
                          className="text-xs text-teal-700 hover:text-teal-900 ml-2"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </Section>

                  <Section
                    label="Ongoing Medication"
                    valuePreview={summary.medication}
                    open={!!openSections.medication}
                    onToggle={() => toggleSection('medication')}
                  >
                    {editingField === 'medication' ? (
                      <div>
                        <textarea
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          rows="2"
                          placeholder="eg. Metformin 500mg - morning, night"
                          className="border border-slate-300 bg-white p-1.5 rounded-md text-sm w-full focus:outline-none focus:ring-1 focus:ring-teal-400 focus:border-teal-400"
                        />
                        <div className="flex justify-end gap-2 mt-1.5">
                          <button onClick={() => setEditingField(null)} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1">
                            Cancel
                          </button>
                          <button
                            onClick={() => saveCard('medication')}
                            disabled={savingField}
                            className="text-xs bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white px-2.5 py-1 rounded-md"
                          >
                            {savingField ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-700">{summary.medication}</span>
                        <button
                          onClick={() => startEdit('medication', summary.medication)}
                          className="text-xs text-teal-700 hover:text-teal-900 ml-2"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </Section>

                  <Section
                    label="Previous Visits"
                    valuePreview={history.length === 0 ? 'No previous visits' : `${history.length} visit${history.length > 1 ? 's' : ''}`}
                    open={!!openSections.visits}
                    onToggle={() => toggleSection('visits')}
                  >
                    {history.length === 0 && <p className="text-sm text-slate-400">No previous visits</p>}

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
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateRows: expandedVisit === index ? '1fr' : '0fr',
                            transition: 'grid-template-rows 250ms ease',
                          }}
                        >
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
                  </Section>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default Doctors_Dashboard