import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  fetchFacultyProfile,
  fetchFacultyMedicalRecords,
  fetchFacultyFamilyMembers,
  addFacultyFamilyMember,
  fetchFamilyMemberRecords,
} from '../../api'
import {
  BookOpen,
  User,
  Users,
  Plus,
  Clock,
  Calendar,
  Pill,
  Heart,
  LogOut,
  ShieldCheck,
  AlertCircle,
  Loader2,
  X,
  FileText,
  Activity,
  CheckCircle2,
  Stethoscope,
} from 'lucide-react'
import tiMark from '../../assets/ti-mark.png'

export default function FacultyDashboard() {
  const { faculty, logout } = useAuth()
  const navigate = useNavigate()

  const [profile, setProfile] = useState(faculty || null)
  const [medicalRecords, setMedicalRecords] = useState([])
  const [familyMembers, setFamilyMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Dependent Records View Modal
  const [selectedDependent, setSelectedDependent] = useState(null)
  const [dependentRecords, setDependentRecords] = useState([])
  const [loadingDependentRecords, setLoadingDependentRecords] = useState(false)

  // Add Family Member Modal State
  const [showAddModal, setShowAddModal] = useState(false)
  const [submittingAdd, setSubmittingAdd] = useState(false)
  const [addError, setAddError] = useState(null)
  const [newDependent, setNewDependent] = useState({
    full_name: '',
    relationship: 'SPOUSE',
    date_of_birth: '',
    gender: 'FEMALE',
  })

  // Load initial faculty profile & medical records
  useEffect(() => {
    async function loadData() {
      setLoading(true)
      setError(null)
      try {
        const [profileRes, recordsRes, familyRes] = await Promise.all([
          fetchFacultyProfile().catch(() => faculty),
          fetchFacultyMedicalRecords().catch(() => []),
          fetchFacultyFamilyMembers().catch(() => []),
        ])
        if (profileRes) setProfile(profileRes)
        if (Array.isArray(recordsRes)) setMedicalRecords(recordsRes)
        if (Array.isArray(familyRes)) setFamilyMembers(familyRes)
      } catch (err) {
        setError(err.message || 'Failed to load faculty portal data')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  // View dependent medical records
  const handleViewDependentRecords = async (dep) => {
    setSelectedDependent(dep)
    setLoadingDependentRecords(true)
    try {
      const records = await fetchFamilyMemberRecords(dep.family_member_id)
      setDependentRecords(Array.isArray(records) ? records : [])
    } catch (err) {
      setDependentRecords([])
    } finally {
      setLoadingDependentRecords(false)
    }
  }

  // Handle adding a dependent
  const handleAddSubmit = async (e) => {
    e.preventDefault()
    setSubmittingAdd(true)
    setAddError(null)
    try {
      const created = await addFacultyFamilyMember(newDependent)
      setFamilyMembers((prev) => [created, ...prev])
      setShowAddModal(false)
      setNewDependent({
        full_name: '',
        relationship: 'SPOUSE',
        date_of_birth: '',
        gender: 'FEMALE',
      })
    } catch (err) {
      setAddError(err.message || 'Failed to register family dependent')
    } finally {
      setSubmittingAdd(false)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/user_login')
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      {/* ── TOP NAVBAR ── */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={tiMark} alt="TIET" className="w-9 h-9 object-contain" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-sm sm:text-base tracking-tight">CampusCare</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                  Faculty Portal
                </span>
              </div>
              <p className="text-[10px] text-slate-500 hidden sm:block">Thapar Institute Health Centre System</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-slate-800">{profile?.name || 'Faculty Member'}</p>
              <p className="text-[11px] text-slate-500">{profile?.department || 'TIET Academic Staff'}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 sm:px-3 sm:py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Banner Card */}
        <div className="bg-gradient-to-r from-teal-900 via-teal-800 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-md relative overflow-hidden">
          <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-teal-200 text-xs font-semibold border border-white/15">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-300" />
                <span>Verified Institutional Healthcare Identity</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                {profile?.name || 'Faculty Health Dashboard'}
              </h1>
              <p className="text-xs sm:text-sm text-teal-100/80 max-w-2xl leading-relaxed">
                Access your consultation records, prescriptions, and manage medical profiles for your verified family dependents at the TIET Health Centre.
              </p>
            </div>

            {/* Profile Credentials Pill */}
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 text-xs space-y-2 shrink-0 md:min-w-[260px]">
              <div className="flex justify-between items-center text-teal-200">
                <span>Employee Code:</span>
                <strong className="text-white font-mono">{profile?.employee_code || profile?.employeeCode || 'FAC-1001'}</strong>
              </div>
              <div className="flex justify-between items-center text-teal-200">
                <span>Health Patient ID:</span>
                <strong className="text-white font-mono">#{profile?.patient_id || profile?.patientId || '—'}</strong>
              </div>
              <div className="flex justify-between items-center text-teal-200">
                <span>Department:</span>
                <strong className="text-white truncate max-w-[150px]">{profile?.department || 'Academic'}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* ── TWO COLUMN GRID: MEDICAL RECORDS & FAMILY DEPENDENTS ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT 2 COLS: PERSONAL CONSULTATIONS & PRESCRIPTIONS */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-teal-50 text-teal-800 border border-teal-200">
                    <Stethoscope className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Your OPD Medical Consultations</h2>
                    <p className="text-xs text-slate-500">Official CampusCare Health Centre history</p>
                  </div>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                  {medicalRecords.length} Visits
                </span>
              </div>

              {loading ? (
                <div className="p-8 text-center text-slate-400 space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-teal-600" />
                  <p className="text-xs">Loading clinical history…</p>
                </div>
              ) : medicalRecords.length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-slate-50 border border-dashed border-slate-200 space-y-2">
                  <Clock className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-sm font-semibold text-slate-700">No OPD Consultations Recorded</p>
                  <p className="text-xs text-slate-400">
                    When you check in at the TIET Health Centre, your consultations and prescriptions will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {medicalRecords.map((rec, idx) => (
                    <div
                      key={rec.visit_id || idx}
                      className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all space-y-3 shadow-2xs"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">
                            Visit #{rec.visit_id}
                          </span>
                          <span className="text-slate-500">
                            {rec.checked_in_at ? new Date(rec.checked_in_at).toLocaleDateString('en-IN') : 'Recent Visit'}
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-teal-800 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200">
                          {rec.diagnosis || 'Health Evaluation'}
                        </span>
                      </div>

                      {rec.doctor_name && (
                        <p className="text-xs text-slate-600">
                          Attending Physician: <strong className="text-slate-800">{rec.doctor_name}</strong> ({rec.specialization || 'OPD'})
                        </p>
                      )}

                      {rec.clinical_notes && (
                        <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100 italic">
                          "{rec.clinical_notes}"
                        </p>
                      )}

                      {Array.isArray(rec.medicines) && rec.medicines.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                            Prescribed Medications ({rec.medicines.length})
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {rec.medicines.map((m, mIdx) => (
                              <div
                                key={mIdx}
                                className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs flex items-center justify-between"
                              >
                                <div>
                                  <span className="font-bold text-slate-800 block truncate">{m.name}</span>
                                  <span className="text-[10px] text-slate-500">{m.duration || '3 days'} • {m.timing || '1-0-1'}</span>
                                </div>
                                <span className="text-[10px] font-bold text-teal-700 bg-teal-100/70 px-2 py-0.5 rounded">
                                  {m.dispensed ? 'Dispensed' : 'Active'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT 1 COL: FAMILY MEMBERS / DEPENDENTS */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-amber-600" />
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-slate-900">Family Dependents</h2>
                    <p className="text-[11px] text-slate-500">Authorized medical beneficiaries</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="px-2.5 py-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center gap-1 shadow-xs cursor-pointer transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </div>

              {familyMembers.length === 0 ? (
                <div className="p-6 text-center rounded-2xl bg-slate-50 border border-dashed border-slate-200 space-y-2">
                  <Heart className="w-6 h-6 text-slate-300 mx-auto" />
                  <p className="text-xs font-semibold text-slate-700">No Dependents Registered</p>
                  <p className="text-[11px] text-slate-400">
                    Add family members (spouse, children, parents) to allow them to receive care under your institutional coverage.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {familyMembers.map((dep) => (
                    <div
                      key={dep.family_member_id}
                      className="p-3.5 rounded-xl border border-slate-200 hover:border-amber-300 bg-slate-50/50 hover:bg-white transition-all space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs font-bold text-slate-900">{dep.name}</p>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                            <span className="capitalize">{dep.relationship?.toLowerCase()}</span>
                            <span>•</span>
                            <span>{dep.gender}</span>
                            <span>•</span>
                            <span className="font-mono">Patient #{dep.patient_id}</span>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                          {dep.relationship}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleViewDependentRecords(dep)}
                        className="w-full text-center py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer transition-colors"
                      >
                        View Medical Records →
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Institutional Information Card */}
            <div className="p-4 rounded-2xl bg-teal-50 border border-teal-200 text-xs text-teal-900 space-y-1.5">
              <span className="font-bold flex items-center gap-1.5 text-teal-950">
                <ShieldCheck className="w-4 h-4 text-teal-700" />
                TIET Healthcare Policy Note
              </span>
              <p className="text-teal-800 leading-relaxed text-[11px]">
                Dependents registered here are assigned permanent Patient IDs in the campus health system. They can be checked in at the reception desk for consultations and emergency care.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* ── ADD DEPENDENT MODAL ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Add Family Dependent</h3>
                  <p className="text-[11px] text-slate-500">Register beneficiary for health centre care</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {addError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{addError}</span>
              </div>
            )}

            <form onSubmit={handleAddSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Suman Sharma"
                  value={newDependent.full_name}
                  onChange={(e) => setNewDependent({ ...newDependent, full_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Relationship
                  </label>
                  <select
                    value={newDependent.relationship}
                    onChange={(e) => setNewDependent({ ...newDependent, relationship: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-teal-500 bg-white"
                  >
                    <option value="SPOUSE">Spouse</option>
                    <option value="CHILD">Child</option>
                    <option value="PARENT">Parent</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Gender
                  </label>
                  <select
                    value={newDependent.gender}
                    onChange={(e) => setNewDependent({ ...newDependent, gender: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-teal-500 bg-white"
                  >
                    <option value="FEMALE">Female</option>
                    <option value="MALE">Male</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Date of Birth (Optional)
                </label>
                <input
                  type="date"
                  value={newDependent.date_of_birth}
                  onChange={(e) => setNewDependent({ ...newDependent, date_of_birth: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-teal-500 bg-white"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAdd}
                  className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {submittingAdd ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  <span>Register Dependent</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── DEPENDENT MEDICAL RECORDS MODAL ── */}
      {selectedDependent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{selectedDependent.name}’s Medical Records</h3>
                <p className="text-[11px] text-slate-500">
                  {selectedDependent.relationship} • Patient #{selectedDependent.patient_id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDependent(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3">
              {loadingDependentRecords ? (
                <div className="p-8 text-center text-slate-400 space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-teal-600" />
                  <p className="text-xs">Fetching clinical records…</p>
                </div>
              ) : dependentRecords.length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-slate-50 border border-dashed border-slate-200 space-y-1.5">
                  <Clock className="w-6 h-6 text-slate-300 mx-auto" />
                  <p className="text-xs font-semibold text-slate-700">No Prior Records Found</p>
                  <p className="text-[11px] text-slate-400">No medical consultations recorded yet for this family dependent.</p>
                </div>
              ) : (
                dependentRecords.map((r, rIdx) => (
                  <div key={rIdx} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2 text-xs">
                    <div className="flex justify-between font-bold text-slate-800">
                      <span>Visit #{r.visit_id}</span>
                      <span className="text-teal-800">{r.diagnosis || 'Consultation'}</span>
                    </div>
                    {r.clinical_notes && <p className="italic text-slate-600">"{r.clinical_notes}"</p>}
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedDependent(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

