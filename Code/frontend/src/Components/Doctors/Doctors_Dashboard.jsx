import React, { useState, useRef, useEffect } from 'react'

const queueData = [
  { rollNumber: '2021CS045', name: 'Aman Sharma', waitingSince: '10:12 AM', age: 21, bloodGroup: 'B+' },
  { rollNumber: '2022ME102', name: 'Priya Verma', waitingSince: '10:20 AM', age: 20, bloodGroup: 'O+' },
  { rollNumber: '2020EC078', name: 'Rohit Singh', waitingSince: '10:25 AM', age: 22, bloodGroup: 'A-' },
]

const historyData = {
  '2021CS045': [
    {
      date: '12 Aug 2026',
      diagnosis: 'Viral fever',
      notes: 'Advised rest, fluids',
      medicines: [{ name: 'Paracetamol 650', timing: 'morning, night', note: 'after food' }],
    },
    {
      date: '02 Jul 2026',
      diagnosis: 'Common cold',
      notes: 'Prescribed antihistamine',
      medicines: [{ name: 'Cetirizine 10mg', timing: 'night', note: '' }],
    },
  ],
}

const summaryData = {
  '2021CS045': { conditions: 'Asthma', allergies: 'None recorded', medication: 'None recorded' },
  '2022ME102': { conditions: 'None recorded', allergies: 'Peanuts', medication: 'None recorded' },
  '2020EC078': { conditions: 'None recorded', allergies: 'None recorded', medication: 'None recorded' },
}

const doctorProfile = {
  name: 'Dr. Neha Kapoor',
  specialization: 'General Physician',
  shift: '9:00 AM – 2:00 PM',
  email: 'neha.kapoor@campuscare.edu',
}

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

function Doctors_Dashboard() {
  const [queue, setQueue] = useState(queueData)
  const [selected, setSelected] = useState(null)

  const [diagnosis, setDiagnosis] = useState('')
  const [general, setGeneral] = useState('')

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [records, setRecords] = useState(summaryData)
  const [openSections, setOpenSections] = useState({})
  const [editingField, setEditingField] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [expandedVisit, setExpandedVisit] = useState(null)

  // profile dropdown state
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef(null)
  const [patientsSeen, setPatientsSeen] = useState(0)
  const totalToday = patientsSeen + queue.length

  const [medicines, setMedicines] = useState([
    { name: '', morning: false, evening: false, night: false, note: '' },
  ])

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

  const history = selected && historyData[selected] ? historyData[selected] : []

  const summary =
    selected && records[selected]
      ? records[selected]
      : { conditions: 'None recorded', allergies: 'None recorded', medication: 'None recorded' }

  function handleSelect(rollNumber) {
    setSelected(rollNumber)
    setDiagnosis('')
    setGeneral('')
    setMedicines([{ name: '', morning: false, evening: false, night: false, note: '' }])
    setDrawerOpen(false)
    setOpenSections({})
    setEditingField(null)
    setExpandedVisit(null)
  }

  function toggleSection(key) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
    setEditingField(null)
  }

  function startEdit(field, currentValue) {
    setEditingField(field)
    setEditValue(currentValue === 'None recorded' ? '' : currentValue)
  }

  function saveCard(field) {
    const value = editValue.trim() === '' ? 'None recorded' : editValue.trim()
    setRecords({
      ...records,
      [selected]: { ...records[selected], [field]: value },
    })
    setEditingField(null)
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

  function markDone() {
    if (!currentPatient) return

    // this is where we'd normally hit the API to save the prescription
    console.log('diagnosis:', diagnosis)
    console.log('medicines:', medicines)
    console.log('general notes:', general)

    setQueue(queue.filter((p) => p.rollNumber !== selected))
    setPatientsSeen((prev) => prev + 1)
    setSelected(null)
    setDrawerOpen(false)
  }

  return (
    <div className="max-w-6xl mx-auto p-5 bg-slate-50 min-h-screen relative">
      <div className="flex items-center justify-between mb-5 border-b border-teal-100 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-9 rounded-full bg-teal-600" />
          <div>
            <h1 className="text-xl font-bold text-slate-800">Doctor's Dashboard</h1>
            <p className="text-sm text-teal-700/70">CampusCare</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">Monday, 24 Aug</span>
          <div className="w-px h-6 bg-slate-200" />

          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen((prev) => !prev)}
              aria-expanded={profileOpen}
              aria-haspopup="true"
              className={
                'flex items-center gap-2 pl-1 pr-2 py-1 rounded-full transition-colors ' +
                (profileOpen ? 'bg-white' : 'hover:bg-white')
              }
            >
              <div className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-semibold shrink-0">
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
                  <div className="w-10 h-10 rounded-full bg-teal-600 text-white flex items-center justify-center text-sm font-semibold shrink-0">
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
                      <div className="text-lg font-bold text-slate-800">{patientsSeen}</div>
                    </div>
                    <div className="bg-slate-50 rounded-md px-3 py-2">
                      <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                        <UsersIcon />
                        <span className="text-xs">Waiting</span>
                      </div>
                      <div className="text-lg font-bold text-slate-800">{queue.length}</div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-400 mt-2">{totalToday} patient{totalToday === 1 ? '' : 's'} total today</div>
                </div>

                <button
                  onClick={() => setProfileOpen(false)}
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

      <div className="flex gap-4 items-start">
        <div className="w-64 bg-white border border-slate-200 rounded-lg p-3 shadow-sm h-fit">
          <h2 className="font-semibold mb-2 text-slate-700 text-sm">Waiting ({queue.length})</h2>

          {queue.length === 0 && (
            <p className="text-sm text-slate-400 py-3 text-center">No one in queue</p>
          )}
          {queue.map((p) => (
            <div
              key={p.rollNumber}
              onClick={() => handleSelect(p.rollNumber)}
              className={
                'p-2.5 mb-1.5 rounded-md cursor-pointer border transition-colors ' +
                (p.rollNumber === selected
                  ? 'bg-teal-50 border-teal-300'
                  : 'border-transparent hover:bg-slate-50')
              }
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm text-slate-800">{p.name}</span>
                {p.priority && <span className="text-red-600 text-xs">urgent</span>}
              </div>
              <div className="text-xs text-slate-500">{p.rollNumber}</div>
              <div className="text-xs text-slate-400">since {p.waitingSince}</div>
            </div>
          ))}
        </div>

        <div className="flex-1 bg-white border border-slate-200 rounded-lg p-4 shadow-sm relative overflow-hidden">
          {!currentPatient && (
            <p className="text-slate-400 text-sm text-center py-10">Select a patient from the queue to start</p>
          )}

          {currentPatient && (
            <div>
              <div className="flex justify-between items-start border-b border-slate-100 pb-3 mb-4">
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
                    className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-1.5 rounded-md text-sm transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>

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
                <p className="text-xs text-slate-500">{currentPatient.name} · {currentPatient.rollNumber}</p>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 rounded-md text-slate-400 hover:bg-white hover:text-teal-700"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="p-3">
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
                        className="text-xs bg-teal-600 hover:bg-teal-700 text-white px-2.5 py-1 rounded-md"
                      >
                        Save
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
                        className="text-xs bg-teal-600 hover:bg-teal-700 text-white px-2.5 py-1 rounded-md"
                      >
                        Save
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
                        className="text-xs bg-teal-600 hover:bg-teal-700 text-white px-2.5 py-1 rounded-md"
                      >
                        Save
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
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default Doctors_Dashboard