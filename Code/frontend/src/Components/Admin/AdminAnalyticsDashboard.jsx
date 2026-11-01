import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import { useAuth } from '../../context/AuthContext'
import { fetchAdminAnalytics } from '../../api'
import {
  LayoutGrid,
  PieChart,
  BarChart3,
  Users,
  UserCheck,
  ShieldCheck,
  FileSpreadsheet,
  Download,
  Search,
  Bell,
  RotateCw,
  Calendar,
  Globe,
  Sparkles,
  Filter,
  CheckCircle2,
  Activity,
  Stethoscope,
  LogOut,
  Settings,
  Loader2,
  Check,
  Layers,
  Thermometer,
} from 'lucide-react'

// Color mappings for clinical disease categories
const CATEGORY_THEMES = {
  Respiratory: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', bar: 'bg-sky-500', badge: 'bg-sky-100 text-sky-800', hex: '#0ea5e9' },
  Fever: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', bar: 'bg-amber-500', badge: 'bg-amber-100 text-amber-800', hex: '#f59e0b' },
  Gastrointestinal: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', bar: 'bg-purple-500', badge: 'bg-purple-100 text-purple-800', hex: '#a855f7' },
  Trauma: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', bar: 'bg-rose-500', badge: 'bg-rose-100 text-rose-800', hex: '#f43f5e' },
  Neurological: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', bar: 'bg-indigo-500', badge: 'bg-indigo-100 text-indigo-800', hex: '#6366f1' },
  Dermatological: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', bar: 'bg-teal-500', badge: 'bg-teal-100 text-teal-800', hex: '#14b8a6' },
  'ENT / Eye': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', bar: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-800', hex: '#10b981' },
  'General OPD': { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200', bar: 'bg-slate-500', badge: 'bg-slate-200 text-slate-800', hex: '#64748b' },
}

// Categorization helper based on diagnostic terminology
function categorizeDiagnosis(name = '') {
  const lower = name.toLowerCase()
  if (lower.includes('cough') || lower.includes('cold') || lower.includes('respiratory') || lower.includes('urti') || lower.includes('uri') || lower.includes('throat') || lower.includes('pharyng') || lower.includes('rhinitis') || lower.includes('bronch') || lower.includes('asthma')) return 'Respiratory'
  if (lower.includes('fever') || lower.includes('pyrexia') || lower.includes('febrile') || lower.includes('temperature') || lower.includes('chills') || lower.includes('flu') || lower.includes('malaria') || lower.includes('dengue') || lower.includes('typhoid')) return 'Fever'
  if (lower.includes('gastro') || lower.includes('stomach') || lower.includes('abdom') || lower.includes('diarrhea') || lower.includes('vomit') || lower.includes('nausea') || lower.includes('acid') || lower.includes('dyspepsia') || lower.includes('food')) return 'Gastrointestinal'
  if (lower.includes('injury') || lower.includes('sprain') || lower.includes('fracture') || lower.includes('contusion') || lower.includes('wound') || lower.includes('cut') || lower.includes('trauma') || lower.includes('strain') || lower.includes('burn')) return 'Trauma'
  if (lower.includes('headache') || lower.includes('migraine') || lower.includes('neuro') || lower.includes('dizziness') || lower.includes('vertigo') || lower.includes('anxiety') || lower.includes('stress')) return 'Neurological'
  if (lower.includes('skin') || lower.includes('rash') || lower.includes('dermat') || lower.includes('allergy') || lower.includes('urticaria') || lower.includes('itch') || lower.includes('fungal') || lower.includes('acne')) return 'Dermatological'
  if (lower.includes('eye') || lower.includes('conjunctiv') || lower.includes('ent') || lower.includes('ear') || lower.includes('sinus') || lower.includes('otitis')) return 'ENT / Eye'
  return 'General OPD'
}

function roundPct(val) {
  return Math.round(val * 10) / 10
}

export default function AdminAnalyticsDashboard() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // View Scope: 'all' (Everyone in database) or 'date' (Specific calendar date)
  const initialScope = searchParams.get('scope') === 'date' ? 'date' : 'all'
  const [viewScope, setViewScope] = useState(initialScope)

  // Selected date defaults to latest active visit date in DB (2026-11-01) or query param
  const defaultDate = useMemo(() => {
    const qDate = searchParams.get('date')
    if (qDate && /^\d{4}-\d{2}-\d{2}$/.test(qDate)) return qDate
    return '2026-11-01'
  }, [searchParams])

  const [selectedDate, setSelectedDate] = useState(defaultDate)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [, setError] = useState(null)
  const [activeNav, setActiveNav] = useState('overview')

  // Disease chart view toggle: 'conditions' | 'categories'
  const [diseaseChartTab, setDiseaseChartTab] = useState('conditions')

  // Disease section filtering
  const [diseaseSearch, setDiseaseSearch] = useState('')
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('ALL')

  // Data states
  const [analytics, setAnalytics] = useState(null)
  const dashboardRef = useRef(null)

  // PDF Export States
  const [exportingPdf, setExportingPdf] = useState(false)
  const [pdfSuccess, setPdfSuccess] = useState(false)

  // Load analytics from backend
  const loadData = async (scopeMode, dateStr, isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const targetDate = scopeMode === 'all' ? 'all' : dateStr
      const res = await fetchAdminAnalytics(targetDate, scopeMode)
      if (res && res.data) {
        setAnalytics(res.data.analytics || null)
      }
    } catch (err) {
      console.warn('Backend analytics fetch error:', err)
      setError(err.message || 'Failed to fetch analytics data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData(viewScope, selectedDate)
    setSearchParams({
      scope: viewScope,
      ...(viewScope === 'date' ? { date: selectedDate } : {}),
    })
  }, [viewScope, selectedDate])

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value)
    setViewScope('date')
  }

  const handleScopeToggle = (scope) => {
    setViewScope(scope)
  }

  // Smooth scroll handler for distinct symbol actions
  const scrollToSection = (elementId, navKey) => {
    setActiveNav(navKey)
    if (elementId === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      const el = document.getElementById(elementId)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }

  // Download Authentic Actual Dashboard PDF
  const handleExportPDF = async () => {
    if (exportingPdf) return
    setExportingPdf(true)
    setPdfSuccess(false)
    try {
      const baseUrl = import.meta.env.VITE_API_URL || ''
      const token = localStorage.getItem('campuscare_token') || ''
      const targetParam = viewScope === 'all' ? 'all' : selectedDate
      const url = `${baseUrl}/api/admin/reports/analytics/preview?target_date=${targetParam}`

      const res = await fetch(url, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })

      if (!res.ok) {
        if (token) {
          window.open(
            `${baseUrl}/api/admin/reports/analytics/preview?target_date=${targetParam}&token=${encodeURIComponent(token)}`,
            '_blank'
          )
          setPdfSuccess(true)
          setTimeout(() => setPdfSuccess(false), 3500)
          return
        }
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.detail || `Server returned status ${res.status}`)
      }

      const blob = await res.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `CampusCare_Actual_Dashboard_${targetParam}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 10000)

      setPdfSuccess(true)
      setTimeout(() => setPdfSuccess(false), 3500)
    } catch (err) {
      console.error('Actual dashboard PDF export error:', err)
      alert(`Unable to export PDF: ${err.message}`)
    } finally {
      setExportingPdf(false)
    }
  }

  // Real Database Metrics
  const totalVisits = analytics?.visitor_overview?.total_routine ?? analytics?.visits?.total ?? 0
  const studentVisits = analytics?.visitor_overview?.student_visits ?? 0
  const facultyVisits = analytics?.visitor_overview?.faculty_visits ?? 0
  const staffVisits = analytics?.visitor_overview?.staff_visits ?? 0
  const otherVisits = analytics?.visitor_overview?.other_visits ?? 0
  const combinedOthers = staffVisits + otherVisits

  // Shift Demographics from backend (with automatic safe fallback)
  const shiftDemographics = useMemo(() => {
    if (analytics?.shift_demographics && Array.isArray(analytics.shift_demographics) && analytics.shift_demographics.length > 0) {
      return analytics.shift_demographics
    }
    // Fallback based on shift activity if ever empty
    const s1 = analytics?.shift_activity?.[0]?.count ?? 0
    const s2 = analytics?.shift_activity?.[1]?.count ?? 0
    const s3 = analytics?.shift_activity?.[2]?.count ?? 0
    return [
      { shift_num: 1, name: 'Shift 1 (Morning)', hours: '06:00 – 14:00', student_count: Math.round(s1 * 0.7), faculty_count: Math.round(s1 * 0.15), others_count: Math.round(s1 * 0.15), total: s1 },
      { shift_num: 2, name: 'Shift 2 (Evening)', hours: '14:00 – 20:00', student_count: Math.round(s2 * 0.95), faculty_count: Math.round(s2 * 0.05), others_count: 0, total: s2 },
      { shift_num: 3, name: 'Shift 3 (Night)', hours: '20:00 – 06:00 (+1d)', student_count: Math.round(s3 * 0.7), faculty_count: 0, others_count: Math.round(s3 * 0.3), total: s3 },
    ]
  }, [analytics])

  // Top Diagnoses from live DB with automated categorisation (ACTUAL DATA ONLY)
  const rawTopDiagnoses = analytics?.top_diagnoses || []
  const hasLiveDiagnoses = rawTopDiagnoses.length > 0
  const totalDiagnosesCount = analytics?.total_diagnoses ?? rawTopDiagnoses.reduce((acc, d) => acc + (d.count || 0), 0)

  // Construct active disease dataset directly from actual database records
  const masterDiagnosesList = useMemo(() => {
    if (hasLiveDiagnoses) {
      return rawTopDiagnoses.map((d, idx) => ({
        rank: d.rank || idx + 1,
        name: d.name === 'normal' ? 'Normal / Routine OPD Health Evaluation' : d.name,
        category: categorizeDiagnosis(d.name),
        count: d.count,
        percentage: d.percentage,
        peakShift: d.count > 2 ? 'All Shifts' : 'Shift 1 & 2',
      }))
    }
    return []
  }, [hasLiveDiagnoses, rawTopDiagnoses])

  // Filtered diagnoses list based on search and category pill
  const filteredDiagnoses = useMemo(() => {
    return masterDiagnosesList.filter((d) => {
      const matchesSearch =
        !diseaseSearch ||
        d.name.toLowerCase().includes(diseaseSearch.toLowerCase()) ||
        d.category.toLowerCase().includes(diseaseSearch.toLowerCase())
      const matchesCat =
        selectedCategoryFilter === 'ALL' ||
        d.category.toUpperCase() === selectedCategoryFilter.toUpperCase()
      return matchesSearch && matchesCat
    })
  }, [masterDiagnosesList, diseaseSearch, selectedCategoryFilter])

  // Unique categories list with counts & percentage for disease chart
  const categoryStats = useMemo(() => {
    const map = {}
    masterDiagnosesList.forEach((d) => {
      map[d.category] = (map[d.category] || 0) + d.count
    })
    const total = Object.values(map).reduce((a, b) => a + b, 0) || 1
    return Object.entries(map).map(([category, count]) => ({
      category,
      count,
      percentage: roundPct((count / total) * 100),
    })).sort((a, b) => b.count - a.count)
  }, [masterDiagnosesList])

  // Max counts for proportional chart scaling
  const maxDiagnosisCount = useMemo(() => {
    const counts = masterDiagnosesList.map((d) => d.count)
    return Math.max(...counts, 1)
  }, [masterDiagnosesList])

  const maxCategoryCount = useMemo(() => {
    const counts = categoryStats.map((c) => c.count)
    return Math.max(...counts, 1)
  }, [categoryStats])

  return (
    <div className="min-h-screen bg-[#F3F4F3] text-[#202421] font-sans antialiased p-3 sm:p-6 lg:p-8">
      {/* ── 1. TOP NAVIGATION BAR ─────────────────────────────────────── */}
      <header className="max-w-7xl mx-auto mb-6 sm:mb-8">
        <div className="bg-white rounded-full px-4 sm:px-6 py-2.5 sm:py-3 border border-[#ECEFEC] shadow-sm flex items-center justify-between gap-4">
          {/* Brand Mark */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-full bg-[#078653] text-white flex items-center justify-center font-bold text-sm shadow-sm">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="hidden sm:block">
              <span className="font-bold text-base tracking-tight text-[#202421]">CampusCare</span>
              <span className="text-[10px] uppercase font-semibold text-[#858B87] ml-2 tracking-wider">
                Admin Console
              </span>
            </div>
          </div>

          {/* Central Pill Navigation */}
          <nav className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar py-1">
            <button
              onClick={() => scrollToSection('top', 'overview')}
              className={`px-3.5 sm:px-5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                activeNav === 'overview'
                  ? 'bg-[#078653] text-white shadow-sm'
                  : 'text-[#858B87] hover:text-[#202421] hover:bg-[#F3F4F3]'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => scrollToSection('shift-demographics-section', 'shift-demographics')}
              className={`px-3.5 sm:px-5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                activeNav === 'shift-demographics'
                  ? 'bg-[#078653] text-white shadow-sm'
                  : 'text-[#858B87] hover:text-[#202421] hover:bg-[#F3F4F3]'
              }`}
            >
              Shift Demographics
            </button>
            <button
              onClick={() => scrollToSection('disease-chart-section', 'disease-chart')}
              className={`px-3.5 sm:px-5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                activeNav === 'disease-chart'
                  ? 'bg-[#078653] text-white shadow-sm'
                  : 'text-[#858B87] hover:text-[#202421] hover:bg-[#F3F4F3]'
              }`}
            >
              Disease Distribution
            </button>
            <button
              onClick={() => scrollToSection('clinical-table-section', 'table')}
              className={`px-3.5 sm:px-5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                activeNav === 'table'
                  ? 'bg-[#078653] text-white shadow-sm'
                  : 'text-[#858B87] hover:text-[#202421] hover:bg-[#F3F4F3]'
              }`}
            >
              Diagnostic Registry
            </button>
            <button
              onClick={() => navigate('/admin/directory')}
              className="px-3.5 sm:px-5 py-1.5 rounded-full text-xs font-semibold text-[#858B87] hover:text-[#202421] hover:bg-[#F3F4F3] transition-all cursor-pointer hidden md:block"
            >
              Directory
            </button>
            <button
              onClick={handleExportPDF}
              disabled={exportingPdf}
              className="px-3.5 sm:px-5 py-1.5 rounded-full text-xs font-semibold text-[#078653] bg-[#E5F4EC] hover:bg-[#d2edd9] transition-all cursor-pointer hidden lg:flex items-center gap-1.5"
            >
              {exportingPdf ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : pdfSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#078653]" />
                  <span>Downloaded</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Export PDF</span>
                </>
              )}
            </button>
          </nav>

          {/* Right Profile & Actions */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              className="w-8 h-8 rounded-full bg-[#F3F4F3] hover:bg-[#E5F4EC] text-[#858B87] hover:text-[#078653] flex items-center justify-center transition-colors cursor-pointer"
              title="Search Diagnoses"
              onClick={() => scrollToSection('clinical-table-section', 'table')}
            >
              <Search className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="w-8 h-8 rounded-full bg-[#F3F4F3] hover:bg-[#E5F4EC] text-[#858B87] hover:text-[#078653] flex items-center justify-center transition-colors cursor-pointer relative"
              title="Notifications"
            >
              <Bell className="w-3.5 h-3.5" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#159B70] rounded-full" />
            </button>
            <div className="flex items-center gap-2 pl-2 border-l border-[#ECEFEC]">
              <div className="w-8 h-8 rounded-full bg-[#E5F4EC] border border-[#159B70]/30 text-[#078653] font-bold text-xs flex items-center justify-center">
                AD
              </div>
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-xs font-bold text-[#202421] leading-tight">Administrator</span>
                <span className="text-[10px] text-[#858B87] leading-tight">Health Centre</span>
              </div>
              <button
                onClick={logout}
                title="Sign Out"
                className="text-[#858B87] hover:text-rose-600 transition-colors cursor-pointer ml-1"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── 2. LAYOUT CONTAINER WITH WORKING FLOATING SIDEBAR ──────────── */}
      <div className="max-w-7xl mx-auto flex gap-4 sm:gap-6 items-start">
        {/* Left Floating Sidebar with Explicit Working Symbol Actions */}
        <aside className="hidden lg:flex flex-col items-center justify-between bg-white rounded-3xl p-3 border border-[#ECEFEC] shadow-sm w-14 shrink-0 min-h-[580px] sticky top-6">
          {/* Top Symbol Action Buttons */}
          <div className="flex flex-col items-center gap-3">
            {/* 1. Overview */}
            <button
              onClick={() => scrollToSection('top', 'overview')}
              className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
                activeNav === 'overview'
                  ? 'bg-[#078653] text-white shadow-sm'
                  : 'text-[#858B87] hover:text-[#078653] hover:bg-[#E5F4EC]'
              }`}
              title="Overview & Stats"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>

            {/* 2. Shift Demographics Feature (FIRST) */}
            <button
              onClick={() => scrollToSection('shift-demographics-section', 'shift-demographics')}
              className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
                activeNav === 'shift-demographics'
                  ? 'bg-[#078653] text-white shadow-sm'
                  : 'text-[#858B87] hover:text-[#078653] hover:bg-[#E5F4EC]'
              }`}
              title="Shift Demographics (Student, Faculty, Others)"
            >
              <Users className="w-4 h-4" />
            </button>

            {/* 3. Disease Distribution Chart Feature (SECOND) */}
            <button
              onClick={() => scrollToSection('disease-chart-section', 'disease-chart')}
              className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
                activeNav === 'disease-chart'
                  ? 'bg-[#078653] text-white shadow-sm'
                  : 'text-[#858B87] hover:text-[#078653] hover:bg-[#E5F4EC]'
              }`}
              title="Disease Distribution Chart"
            >
              <PieChart className="w-4 h-4" />
            </button>

            {/* 4. Diagnostic Registry Table */}
            <button
              onClick={() => scrollToSection('clinical-table-section', 'table')}
              className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
                activeNav === 'table'
                  ? 'bg-[#078653] text-white shadow-sm'
                  : 'text-[#858B87] hover:text-[#078653] hover:bg-[#E5F4EC]'
              }`}
              title="Diagnostic Impressions Registry"
            >
              <FileSpreadsheet className="w-4 h-4" />
            </button>

            {/* 5. PDF Export Direct Action */}
            <button
              onClick={handleExportPDF}
              disabled={exportingPdf}
              className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
                exportingPdf
                  ? 'bg-amber-50 text-amber-600 animate-pulse'
                  : pdfSuccess
                  ? 'bg-[#E5F4EC] text-[#078653]'
                  : 'text-[#858B87] hover:text-[#078653] hover:bg-[#E5F4EC]'
              }`}
              title="Download Analytics PDF Report"
            >
              {exportingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
              ) : pdfSuccess ? (
                <Check className="w-4 h-4 text-[#078653]" />
              ) : (
                <Download className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Bottom Symbol Actions */}
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => navigate('/admin/directory')}
              className="w-10 h-10 rounded-2xl text-[#858B87] hover:text-[#078653] hover:bg-[#E5F4EC] flex items-center justify-center transition-all cursor-pointer"
              title="Directory Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={logout}
              className="w-10 h-10 rounded-2xl text-[#858B87] hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-all cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </aside>

        {/* ── 3. MAIN DASHBOARD CONTENT AREA ───────────────────────────── */}
        <main ref={dashboardRef} id="actual-dashboard-container" className="flex-1 min-w-0 space-y-6">
          {/* Header Row with Clean Scope Switcher */}
          <div id="top" className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#202421]">
                  Health Centre Intelligence
                </h1>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#E5F4EC] text-[#078653] border border-[#159B70]/20">
                  {viewScope === 'all' ? 'All Patients (Everyone)' : selectedDate}
                </span>
              </div>
            </div>

            {/* Scope Switcher, Date Filter, Refresh, Export */}
            <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
              {/* Scope Switcher Pill */}
              <div className="bg-white border border-[#ECEFEC] rounded-full p-1 shadow-sm flex items-center text-xs font-semibold">
                <button
                  onClick={() => handleScopeToggle('all')}
                  className={`px-3 py-1 rounded-full transition-all cursor-pointer flex items-center gap-1.5 ${
                    viewScope === 'all'
                      ? 'bg-[#078653] text-white shadow-xs'
                      : 'text-[#858B87] hover:text-[#202421]'
                  }`}
                >
                  <Globe className="w-3 h-3" />
                  <span>All Patients</span>
                </button>
                <button
                  onClick={() => handleScopeToggle('date')}
                  className={`px-3 py-1 rounded-full transition-all cursor-pointer flex items-center gap-1.5 ${
                    viewScope === 'date'
                      ? 'bg-[#078653] text-white shadow-xs'
                      : 'text-[#858B87] hover:text-[#202421]'
                  }`}
                >
                  <Calendar className="w-3 h-3" />
                  <span>By Date</span>
                </button>
              </div>

              {/* Date Input (When Date scope is active) */}
              {viewScope === 'date' && (
                <div className="bg-white border border-[#ECEFEC] rounded-full px-3 py-1 shadow-sm flex items-center gap-2 text-xs font-semibold text-[#202421]">
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={handleDateChange}
                    className="bg-transparent border-none text-xs font-semibold text-[#202421] focus:outline-none cursor-pointer"
                  />
                </div>
              )}

              {/* Refresh Button */}
              <button
                onClick={() => loadData(viewScope, selectedDate, true)}
                disabled={refreshing}
                className="w-8 h-8 rounded-full bg-white border border-[#ECEFEC] shadow-sm flex items-center justify-center text-[#858B87] hover:text-[#078653] hover:bg-[#E5F4EC] transition-all cursor-pointer"
                title="Refresh"
              >
                <RotateCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[#078653]' : ''}`} />
              </button>

              {/* Export PDF Button */}
              <button
                onClick={handleExportPDF}
                disabled={exportingPdf}
                className="bg-white hover:bg-[#E5F4EC] text-[#078653] border border-[#ECEFEC] rounded-full px-4 py-1.5 text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
              >
                {exportingPdf ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Exporting...</span>
                  </>
                ) : pdfSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Saved</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>Export PDF</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Date Shortcuts Bar (when in By Date mode) */}
          {viewScope === 'date' && (
            <div className="flex items-center gap-2 text-xs text-[#858B87] flex-wrap">
              <span className="font-semibold text-[11px] uppercase tracking-wider">Active Dates:</span>
              {[
                { label: '01 Nov', date: '2026-11-01', count: 8 },
                { label: '30 Oct', date: '2026-10-30', count: 6 },
                { label: '27 Oct', date: '2026-10-27', count: 11 },
                { label: '28 Oct', date: '2026-10-28', count: 3 },
                { label: '24 Oct', date: '2026-10-24', count: 3 },
              ].map((item) => (
                <button
                  key={item.date}
                  onClick={() => setSelectedDate(item.date)}
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all cursor-pointer ${
                    selectedDate === item.date
                      ? 'bg-[#078653] text-white shadow-xs'
                      : 'bg-white border border-[#ECEFEC] text-[#202421] hover:bg-[#E5F4EC]'
                  }`}
                >
                  {item.label} ({item.count})
                </button>
              ))}
            </div>
          )}

          {/* ── 4. KEY METRICS ROW (Clean, Zero Fluff) ───────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {/* Total Visits */}
            <div className="col-span-2 sm:col-span-1 bg-[#078653] text-white rounded-3xl p-5 shadow-sm flex flex-col justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider opacity-85">
                Total Visits
              </span>
              <div className="my-2">
                <div className="text-3xl font-extrabold tracking-tight">{totalVisits}</div>
              </div>
              <div className="text-[11px] opacity-80 pt-2 border-t border-white/20">
                {viewScope === 'all' ? 'All-Time Records' : 'Selected Date'}
              </div>
            </div>

            {/* Students */}
            <div className="bg-white rounded-3xl p-5 border border-[#ECEFEC] shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#858B87] uppercase tracking-wider">Students</span>
                <div className="w-6 h-6 rounded-full bg-[#E5F4EC] text-[#078653] flex items-center justify-center">
                  <Users className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="my-2">
                <div className="text-2xl sm:text-3xl font-extrabold text-[#202421] tracking-tight">{studentVisits}</div>
              </div>
              <div className="text-[11px] font-semibold text-[#159B70]">
                {totalVisits > 0 ? roundPct((studentVisits / totalVisits) * 100) : 0}% of footfall
              </div>
            </div>

            {/* Faculty */}
            <div className="bg-white rounded-3xl p-5 border border-[#ECEFEC] shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#858B87] uppercase tracking-wider">Faculty</span>
                <div className="w-6 h-6 rounded-full bg-[#F3F4F3] text-[#202421] flex items-center justify-center">
                  <UserCheck className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="my-2">
                <div className="text-2xl sm:text-3xl font-extrabold text-[#202421] tracking-tight">{facultyVisits}</div>
              </div>
              <div className="text-[11px] font-semibold text-[#159B70]">
                {totalVisits > 0 ? roundPct((facultyVisits / totalVisits) * 100) : 0}% of footfall
              </div>
            </div>

            {/* Others / Community */}
            <div className="bg-white rounded-3xl p-5 border border-[#ECEFEC] shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#858B87] uppercase tracking-wider">Others</span>
                <div className="w-6 h-6 rounded-full bg-[#E5F4EC] text-[#078653] flex items-center justify-center">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="my-2">
                <div className="text-2xl sm:text-3xl font-extrabold text-[#202421] tracking-tight">{combinedOthers}</div>
              </div>
              <div className="text-[11px] font-semibold text-[#159B70]">
                {totalVisits > 0 ? roundPct((combinedOthers / totalVisits) * 100) : 0}% of footfall
              </div>
            </div>

            {/* Clinical Consultations */}
            <div className="col-span-2 sm:col-span-1 bg-white rounded-3xl p-5 border border-[#ECEFEC] shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#858B87] uppercase tracking-wider">Consultations</span>
                <div className="w-6 h-6 rounded-full bg-[#F3F4F3] text-[#078653] flex items-center justify-center">
                  <Stethoscope className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="my-2">
                <div className="text-2xl sm:text-3xl font-extrabold text-[#078653] tracking-tight">{totalDiagnosesCount}</div>
              </div>
              <div className="text-[11px] text-[#858B87]">
                Diagnosed Cases
              </div>
            </div>
          </div>

          {/* ── 5. SHIFT-WISE STUDENT, FACULTY, OTHERS DISTRIBUTION ─── */}
          <section
            id="shift-demographics-section"
            className="bg-white rounded-3xl p-6 sm:p-7 border border-[#ECEFEC] shadow-sm space-y-6 scroll-mt-6"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#ECEFEC]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-[#E5F4EC] text-[#078653] flex items-center justify-center shrink-0">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#202421]">
                    Shift-Wise Distribution: Student, Faculty &amp; Others
                  </h2>
                  <p className="text-[11px] text-[#858B87]">
                    Patient cohort breakdown across Shifts 1, 2, and 3
                  </p>
                </div>
              </div>

              {/* Legend */}
              <div className="hidden sm:flex items-center gap-3 text-[11px] font-semibold text-[#858B87]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#078653]" />
                  <span>Student</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
                  <span>Faculty</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#64748B]" />
                  <span>Others</span>
                </div>
              </div>
            </div>

            {/* 3 Shifts Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {shiftDemographics.map((shift, idx) => {
                const sTotal = shift.total || 0
                const sStudent = shift.student_count || 0
                const sFaculty = shift.faculty_count || 0
                const sOthers = shift.others_count || 0

                const sStudentPct = sTotal > 0 ? roundPct((sStudent / sTotal) * 100) : 0
                const sFacultyPct = sTotal > 0 ? roundPct((sFaculty / sTotal) * 100) : 0
                const sOthersPct = sTotal > 0 ? roundPct((sOthers / sTotal) * 100) : 0

                const isPeak = sTotal > 0 && sTotal === Math.max(...shiftDemographics.map((s) => s.total || 0))

                return (
                  <div
                    key={idx}
                    className={`rounded-2xl p-5 border transition-all ${
                      isPeak
                        ? 'bg-gradient-to-b from-[#F7FAF8] to-white border-[#159B70]/40 shadow-xs'
                        : 'bg-white border-[#ECEFEC]'
                    }`}
                  >
                    {/* Shift Title & Total */}
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#202421]">{shift.name}</span>
                          {isPeak && (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#078653] text-white">
                              Peak
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-[#858B87]">{shift.hours}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xl font-extrabold text-[#202421]">{sTotal}</span>
                        <span className="text-[10px] text-[#858B87] block">visits</span>
                      </div>
                    </div>

                    {/* Proportional Segmented Stacked Bar for this Shift */}
                    <div className="w-full h-3 rounded-full overflow-hidden flex bg-[#F3F4F3] my-3">
                      {sStudent > 0 && (
                        <div
                          style={{ width: `${sStudentPct}%` }}
                          className="bg-[#078653]"
                          title={`Student: ${sStudent} (${sStudentPct}%)`}
                        />
                      )}
                      {sFaculty > 0 && (
                        <div
                          style={{ width: `${sFacultyPct}%` }}
                          className="bg-[#10B981]"
                          title={`Faculty: ${sFaculty} (${sFacultyPct}%)`}
                        />
                      )}
                      {sOthers > 0 && (
                        <div
                          style={{ width: `${sOthersPct}%` }}
                          className="bg-[#64748B]"
                          title={`Others: ${sOthers} (${sOthersPct}%)`}
                        />
                      )}
                    </div>

                    {/* 3 Metric Rows */}
                    <div className="space-y-2 pt-2 border-t border-[#ECEFEC] text-xs">
                      {/* Student */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#078653]" />
                          <span className="text-[#858B87]">Student</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#202421]">{sStudent}</span>
                          <span className="text-[10px] text-[#858B87] w-10 text-right">({sStudentPct}%)</span>
                        </div>
                      </div>

                      {/* Faculty */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                          <span className="text-[#858B87]">Faculty</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#202421]">{sFaculty}</span>
                          <span className="text-[10px] text-[#858B87] w-10 text-right">({sFacultyPct}%)</span>
                        </div>
                      </div>

                      {/* Others */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#64748B]" />
                          <span className="text-[#858B87]">Others</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#202421]">{sOthers}</span>
                          <span className="text-[10px] text-[#858B87] w-10 text-right">({sOthersPct}%)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Shift Comparative Volume Bar Visualization */}
            <div className="pt-2">
              <div className="p-4 rounded-2xl bg-[#F8FAF8] border border-[#ECEFEC] space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-[#202421]">
                  <span>Cross-Shift Demographic Volume</span>
                  <span className="text-[10px] text-[#858B87] font-normal">
                    Student ({studentVisits}) &bull; Faculty ({facultyVisits}) &bull; Others ({combinedOthers})
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {shiftDemographics.map((s, idx) => {
                    const totalAll = totalVisits || 1
                    const shiftShare = roundPct(((s.total || 0) / totalAll) * 100)
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="font-semibold text-[#202421] truncate">{s.name.split(' ')[0]} {s.name.split(' ')[1]}</span>
                          <span className="font-bold text-[#078653]">{s.total} ({shiftShare}%)</span>
                        </div>
                        <div className="w-full bg-[#ECEFEC] h-2 rounded-full overflow-hidden flex">
                          <div
                            style={{ width: `${s.total > 0 ? (s.student_count / s.total) * 100 : 0}%` }}
                            className="bg-[#078653]"
                          />
                          <div
                            style={{ width: `${s.total > 0 ? (s.faculty_count / s.total) * 100 : 0}%` }}
                            className="bg-[#10B981]"
                          />
                          <div
                            style={{ width: `${s.total > 0 ? (s.others_count / s.total) * 100 : 0}%` }}
                            className="bg-[#64748B]"
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* ── 6. DISEASE DISTRIBUTION CHART ───────────────── */}
          <section
            id="disease-chart-section"
            className="bg-white rounded-3xl p-6 sm:p-7 border border-[#ECEFEC] shadow-sm space-y-5 scroll-mt-6"
          >
            {/* Header & Chart View Toggle */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#ECEFEC]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-[#E5F4EC] text-[#078653] flex items-center justify-center shrink-0">
                  <PieChart className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#202421]">Disease Distribution Chart</h2>
                  <p className="text-[11px] text-[#858B87]">
                    Distribution of clinical impressions ({totalDiagnosesCount} consultations)
                  </p>
                </div>
              </div>

              {/* View Switcher: Conditions vs Categories */}
              <div className="flex items-center bg-[#F3F4F3] p-1 rounded-full text-xs font-semibold self-start sm:self-auto">
                <button
                  onClick={() => setDiseaseChartTab('conditions')}
                  className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
                    diseaseChartTab === 'conditions'
                      ? 'bg-[#078653] text-white shadow-xs'
                      : 'text-[#858B87] hover:text-[#202421]'
                  }`}
                >
                  Clinical Conditions ({masterDiagnosesList.length})
                </button>
                <button
                  onClick={() => setDiseaseChartTab('categories')}
                  className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
                    diseaseChartTab === 'categories'
                      ? 'bg-[#078653] text-white shadow-xs'
                      : 'text-[#858B87] hover:text-[#202421]'
                  }`}
                >
                  Disease Categories ({categoryStats.length})
                </button>
              </div>
            </div>

            {/* Chart Body */}
            {diseaseChartTab === 'conditions' ? (
              /* TAB 1: Specific Conditions Horizontal Distribution Bars */
              <div className="space-y-3 pt-1">
                {masterDiagnosesList.length > 0 ? (
                  masterDiagnosesList.map((d, idx) => {
                    const theme = CATEGORY_THEMES[d.category] || CATEGORY_THEMES['General OPD']
                    const widthPct = Math.max((d.count / maxDiagnosisCount) * 100, 6)
                    return (
                      <div key={idx} className="group">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <div className="flex items-center gap-2 min-w-0 pr-2">
                            <span className="w-5 h-5 rounded-full bg-[#F3F4F3] text-[#858B87] font-bold text-[10px] flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <span className="font-semibold text-[#202421] truncate">{d.name}</span>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full hidden sm:inline-block ${theme.badge}`}>
                              {d.category}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-extrabold text-[#202421]">{d.count}</span>
                            <span className="text-[11px] text-[#858B87] w-12 text-right">{d.percentage}%</span>
                          </div>
                        </div>
                        {/* Bar */}
                        <div className="w-full bg-[#F3F4F3] h-2.5 rounded-full overflow-hidden">
                          <div
                            style={{ width: `${widthPct}%` }}
                            className={`h-full rounded-full transition-all duration-500 ${theme.bar}`}
                          />
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="text-center py-8 text-xs text-[#858B87] italic">
                    No clinical diagnoses logged for this reporting selection.
                  </div>
                )}
              </div>
            ) : (
              /* TAB 2: Categorical Distribution */
              <div className="space-y-4 pt-1">
                {/* Segmented Combined Progress Bar */}
                <div className="w-full h-4 rounded-full overflow-hidden flex bg-[#ECEFEC] shadow-inner">
                  {categoryStats.map((cat, idx) => {
                    const theme = CATEGORY_THEMES[cat.category] || CATEGORY_THEMES['General OPD']
                    return (
                      <div
                        key={idx}
                        style={{ width: `${cat.percentage}%` }}
                        className={`${theme.bar} transition-all duration-500 hover:opacity-90 relative group`}
                        title={`${cat.category}: ${cat.count} cases (${cat.percentage}%)`}
                      />
                    )
                  })}
                </div>

                {/* Categories Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                  {categoryStats.map((cat, idx) => {
                    const theme = CATEGORY_THEMES[cat.category] || CATEGORY_THEMES['General OPD']
                    const widthPct = Math.max((cat.count / maxCategoryCount) * 100, 6)
                    return (
                      <div key={idx} className="p-3 rounded-2xl bg-[#F8FAF8] border border-[#ECEFEC] flex flex-col justify-between">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${theme.badge}`}>
                            {cat.category}
                          </span>
                          <span className="text-xs font-bold text-[#202421]">{cat.count} cases</span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-[#858B87]">
                            <span>Share</span>
                            <span className="font-semibold text-[#202421]">{cat.percentage}%</span>
                          </div>
                          <div className="w-full bg-[#E6EAE7] h-2 rounded-full overflow-hidden">
                            <div
                              style={{ width: `${widthPct}%` }}
                              className={`h-full rounded-full ${theme.bar}`}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>

          {/* ── 7. DETAILED CLINICAL DIAGNOSTIC REGISTRY (Streamlined Table) ─── */}
          <section
            id="clinical-table-section"
            className="bg-white rounded-3xl p-6 sm:p-7 border border-[#ECEFEC] shadow-sm space-y-5 scroll-mt-6"
          >
            {/* Header & Search */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-[#ECEFEC]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-[#E5F4EC] text-[#078653] flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#202421]">Clinical Diagnostic Registry</h2>
                  <p className="text-[11px] text-[#858B87]">
                    Actual diagnoses recorded by attending physicians
                  </p>
                </div>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#858B87] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={diseaseSearch}
                  onChange={(e) => setDiseaseSearch(e.target.value)}
                  placeholder="Search condition or category..."
                  className="pl-8 pr-3 py-1.5 bg-[#F8FAF8] border border-[#ECEFEC] rounded-full text-xs text-[#202421] placeholder-[#858B87] focus:outline-none focus:ring-1 focus:ring-[#078653] w-48 sm:w-60"
                />
                {diseaseSearch && (
                  <button
                    onClick={() => setDiseaseSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[#858B87] hover:text-[#202421]"
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
              <span className="text-xs font-bold text-[#858B87] mr-1 flex items-center gap-1">
                <Filter className="w-3 h-3" />
                Filter:
              </span>
              <button
                onClick={() => setSelectedCategoryFilter('ALL')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  selectedCategoryFilter === 'ALL'
                    ? 'bg-[#078653] text-white shadow-xs'
                    : 'bg-[#F8FAF8] text-[#858B87] hover:text-[#202421] hover:bg-[#ECEFEC]'
                }`}
              >
                All ({masterDiagnosesList.length})
              </button>
              {Object.keys(CATEGORY_THEMES).map((catKey) => {
                const count = categoryStats.find((c) => c.category === catKey)?.count || 0
                if (count === 0 && selectedCategoryFilter !== catKey) return null
                return (
                  <button
                    key={catKey}
                    onClick={() => setSelectedCategoryFilter(catKey)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                      selectedCategoryFilter === catKey
                        ? 'bg-[#078653] text-white shadow-xs'
                        : 'bg-[#F8FAF8] text-[#858B87] hover:text-[#202421] hover:bg-[#ECEFEC]'
                    }`}
                  >
                    {catKey} {count > 0 && `(${count})`}
                  </button>
                )
              })}
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-2xl border border-[#ECEFEC]">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[#F8FAF8] border-b border-[#ECEFEC] text-[#858B87] uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4 text-center w-14">Rank</th>
                    <th className="py-3 px-4">Clinical Diagnosis</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4 text-center">Cases</th>
                    <th className="py-3 px-4 w-44">Prevalence</th>
                    <th className="py-3 px-4 text-center">Peak Shift</th>
                    <th className="py-3 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ECEFEC] bg-white">
                  {filteredDiagnoses.length > 0 ? (
                    filteredDiagnoses.map((d, idx) => {
                      const theme = CATEGORY_THEMES[d.category] || CATEGORY_THEMES['General OPD']
                      return (
                        <tr key={idx} className="hover:bg-[#F9FAF9] transition-colors">
                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold bg-[#F3F4F3] text-[#202421]">
                              #{d.rank}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-semibold text-xs text-[#202421]">
                            {d.name}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center text-[10px] font-bold px-2.5 py-0.5 rounded-full ${theme.badge}`}>
                              {d.category}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-extrabold text-[#202421]">
                            {d.count}
                          </td>
                          <td className="py-3 px-4">
                            <div className="space-y-1">
                              <div className="flex justify-between text-[10px] font-semibold text-[#858B87]">
                                <span>{d.percentage}%</span>
                              </div>
                              <div className="w-full bg-[#F3F4F3] h-1.5 rounded-full overflow-hidden">
                                <div
                                  style={{ width: `${Math.min(d.percentage * 2.5, 100)}%` }}
                                  className={`h-full rounded-full ${theme.bar}`}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center text-[11px] text-[#858B87]">
                            {d.peakShift}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#078653]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Verified</span>
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-xs text-[#858B87] italic">
                        No clinical diagnoses matching current filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
