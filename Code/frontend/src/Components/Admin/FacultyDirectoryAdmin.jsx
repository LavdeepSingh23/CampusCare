import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  fetchAdminFacultyDirectory,
  addAdminFacultyDirectoryEntry,
  updateAdminFacultyDirectoryEntry,
} from '../../api'
import {
  ShieldCheck,
  UserCheck,
  UserX,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  LogOut,
  X,
  BookOpen,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react'
import tiMark from '../../assets/ti-mark.png'

export default function FacultyDirectoryAdmin() {
  const { admin, logout } = useAuth()
  const navigate = useNavigate()

  const [directory, setDirectory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('ALL')

  // Add Faculty Modal State
  const [showAddModal, setShowAddModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [addError, setAddError] = useState(null)
  const [newFaculty, setNewFaculty] = useState({
    institutional_email: '',
    full_name: '',
    department: 'Computer Science & Engineering',
    designation: 'Assistant Professor',
    employee_code: '',
  })

  // Load directory list
  const loadDirectory = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchAdminFacultyDirectory()
      setDirectory(Array.isArray(res) ? res : [])
    } catch (err) {
      setError(err.message || 'Failed to load faculty directory')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDirectory()
  }, [])

  // Toggle active status
  const handleToggleActive = async (entry) => {
    try {
      const updated = await updateAdminFacultyDirectoryEntry(entry.directory_id, {
        is_active: !entry.is_active,
      })
      setDirectory((prev) =>
        prev.map((item) => (item.directory_id === entry.directory_id ? updated : item))
      )
    } catch (err) {
      alert(`Failed to update status: ${err.message}`)
    }
  }

  // Handle Add Faculty
  const handleAddSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setAddError(null)
    try {
      const cleanEmail = newFaculty.institutional_email.trim().toLowerCase()
      if (!cleanEmail.endsWith('@thapar.edu')) {
        throw new Error('Institutional email must belong to the @thapar.edu domain.')
      }
      const created = await addAdminFacultyDirectoryEntry({
        ...newFaculty,
        institutional_email: cleanEmail,
      })
      setDirectory((prev) => [created, ...prev])
      setShowAddModal(false)
      setNewFaculty({
        institutional_email: '',
        full_name: '',
        department: 'Computer Science & Engineering',
        designation: 'Assistant Professor',
        employee_code: '',
      })
    } catch (err) {
      setAddError(err.message || 'Failed to add faculty directory entry')
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/user_login')
  }

  // Filtered directory
  const filtered = directory.filter((item) => {
    const matchesSearch =
      !search ||
      item.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      item.institutional_email?.toLowerCase().includes(search.toLowerCase()) ||
      item.department?.toLowerCase().includes(search.toLowerCase())
    const matchesDept = departmentFilter === 'ALL' || item.department === departmentFilter
    return matchesSearch && matchesDept
  })

  const departments = Array.from(new Set(directory.map((d) => d.department).filter(Boolean)))

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      {/* ── TOP NAVBAR ── */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={tiMark} alt="TIET" className="w-8 h-8 object-contain" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm sm:text-base tracking-tight">CampusCare Admin</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-950 text-teal-400 border border-teal-800">
                  Directory Control
                </span>
              </div>
              <p className="text-[10px] text-slate-400 hidden sm:block">Faculty Healthcare Eligibility & Provisioning</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 hidden sm:inline">
              Logged in as <strong className="text-white">{admin?.email || 'Administrator'}</strong>
            </span>
            <button
              onClick={handleLogout}
              className="p-2 sm:px-3 sm:py-1.5 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Top Control Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Approved Faculty Directory
            </h1>
            <p className="text-xs text-slate-400">
              Only faculty and academic staff present in this directory can authenticate and access health services.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={loadDirectory}
              className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg cursor-pointer transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Add Approved Faculty</span>
            </button>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search faculty by name, @thapar.edu email, or department…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500 hidden sm:block" />
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs sm:text-sm text-slate-300 focus:outline-none focus:border-teal-500"
            >
              <option value="ALL">All Departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table of Directory Entries */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
          {loading ? (
            <div className="p-12 text-center text-slate-500 space-y-3">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-teal-400" />
              <p className="text-xs">Fetching verified faculty directory…</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center text-rose-400 space-y-2">
              <AlertCircle className="w-6 h-6 mx-auto" />
              <p className="text-xs font-semibold">{error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-500 space-y-2">
              <BookOpen className="w-8 h-8 mx-auto text-slate-600" />
              <p className="text-sm font-semibold text-slate-400">No Faculty Entries Found</p>
              <p className="text-xs text-slate-600">Try adjusting your search criteria or add a new faculty entry.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase font-semibold text-[11px] tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4">Faculty Member</th>
                    <th className="py-3.5 px-4">Institutional Email</th>
                    <th className="py-3.5 px-4">Department & Role</th>
                    <th className="py-3.5 px-4 text-center">Status</th>
                    <th className="py-3.5 px-4 text-right">Access Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filtered.map((entry) => (
                    <tr key={entry.directory_id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-bold text-white block text-sm">{entry.full_name}</span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {entry.employee_code || 'ID: ' + entry.directory_id}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-teal-300">
                        {entry.institutional_email}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-slate-200 block">{entry.department}</span>
                        <span className="text-[11px] text-slate-400">{entry.designation || 'Academic Staff'}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {entry.is_active ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                            <CheckCircle2 className="w-3 h-3" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-950 text-rose-400 border border-rose-800">
                            <XCircle className="w-3 h-3" />
                            Disabled
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(entry)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                            entry.is_active
                              ? 'bg-rose-900/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/80'
                              : 'bg-emerald-900/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/80'
                          }`}
                        >
                          {entry.is_active ? 'Revoke Access' : 'Enable Access'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* ── ADD FACULTY MODAL ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-800 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-teal-950 text-teal-400 border border-teal-800">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Add Approved Faculty</h3>
                  <p className="text-[11px] text-slate-400">Permit institutional Google sign-in</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {addError && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{addError}</span>
              </div>
            )}

            <form onSubmit={handleAddSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Institutional Email (@thapar.edu)
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. prof.name@thapar.edu"
                  value={newFaculty.institutional_email}
                  onChange={(e) =>
                    setNewFaculty({ ...newFaculty, institutional_email: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Ramesh Kumar"
                  value={newFaculty.full_name}
                  onChange={(e) => setNewFaculty({ ...newFaculty, full_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Computer Science"
                    value={newFaculty.department}
                    onChange={(e) => setNewFaculty({ ...newFaculty, department: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Designation
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Professor"
                    value={newFaculty.designation}
                    onChange={(e) => setNewFaculty({ ...newFaculty, designation: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Employee Code (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. TIET-FAC-104"
                  value={newFaculty.employee_code}
                  onChange={(e) => setNewFaculty({ ...newFaculty, employee_code: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-teal-500 font-mono"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  <span>Add to Directory</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

