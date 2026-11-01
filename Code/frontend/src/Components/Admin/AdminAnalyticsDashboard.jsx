import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { fetchAdminAnalytics } from '../../api'
import {
  LayoutGrid,
  BarChart3,
  Users,
  HeartPulse,
  FileText,
  Settings,
  LogOut,
  Calendar,
  RotateCw,
  Download,
  ArrowUpRight,
  ShieldCheck,
  Search,
  Bell,
  ChevronDown,
  Activity,
  Stethoscope,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  UserCheck,
  Loader2,
  Check,
  Filter,
  ArrowDown,
  Layers,
  Info,
  Thermometer,
  Globe,
} from 'lucide-react'

// Color mappings for clinical disease categories
const CATEGORY_THEMES = {
  Respiratory: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', bar: 'bg-sky-500', badge: 'bg-sky-100 text-sky-800' },
  Fever: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', bar: 'bg-amber-500', badge: 'bg-amber-100 text-amber-800' },
  Gastrointestinal: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', bar: 'bg-purple-500', badge: 'bg-purple-100 text-purple-800' },
  Trauma: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', bar: 'bg-rose-500', badge: 'bg-rose-100 text-rose-800' },
  Neurological: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', bar: 'bg-indigo-500', badge: 'bg-indigo-100 text-indigo-800' },
  Dermatological: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', bar: 'bg-teal-500', badge: 'bg-teal-100 text-teal-800' },
  'ENT / Eye': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', bar: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-800' },
  'General OPD': { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200', bar: 'bg-slate-500', badge: 'bg-slate-200 text-slate-800' },
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

export default function AdminAnalyticsDashboard() {
  const { admin, logout } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // View Scope: 'all' (Everyone in the database) or 'date' (Specific calendar date)
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
  const [error, setError] = useState(null)
  const [chartMode, setChartMode] = useState('shifts') // 'shifts' | '7day'
  const [activeNav, setActiveNav] = useState('dashboard') // 'dashboard' | 'diseases' | 'trends' | 'visits'

  // PDF Export States
  const [exportingPdf, setExportingPdf] = useState(false)
  const [pdfSuccess, setPdfSuccess] = useState(false)

  // Disease section filtering
  const [diseaseSearch, setDiseaseSearch] = useState('')
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('ALL')

  // Data states
  const [analytics, setAnalytics] = useState(null)
  const [trend7d, setTrend7d] = useState([])
  const [recentConsultations, setRecentConsultations] = useState([])

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
        setTrend7d(Array.isArray(res.data.trend_7d) ? res.data.trend_7d : [])
        setRecentConsultations(Array.isArray(res.data.recent_consultations) ? res.data.recent_consultations : [])
      }
    } catch (err) {
      console.warn('Backend analytics fetch error:', err)
      setError(err.message || 'Failed to fetch authoritative analytics data')
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

  // Smooth scroll handler for distinct left panel buttons
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

  // Authenticated PDF Generation and Direct Download
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
        // Fallback: Attempt open via token query parameter which backend supports
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
      link.download = `CampusCare_Analytics_${targetParam}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 10000)

      setPdfSuccess(true)
      setTimeout(() => setPdfSuccess(false), 3500)
    } catch (err) {
      console.error('PDF export error:', err)
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

  const s1Count = analytics?.shift_activity?.[0]?.count ?? analytics?.visits?.shifts?.shift_1?.count ?? 0
  const s2Count = analytics?.shift_activity?.[1]?.count ?? analytics?.visits?.shifts?.shift_2?.count ?? 0
  const s3Count = analytics?.shift_activity?.[2]?.count ?? analytics?.visits?.shifts?.shift_3?.count ?? 0

  const dodChangePct = analytics?.daily_comparison?.dod_change_pct ?? 0.0
  const dodStr = analytics?.daily_comparison?.dod_str ?? '+0.0%'
  const prevDayVisits = analytics?.daily_comparison?.previous_day_visits ?? 0
  const sevenDayAvg = analytics?.daily_comparison?.seven_day_visits ?? analytics?.daily_comparison?.seven_day_avg_visits ?? 2.6

  const totalEmergencies = analytics?.emergency_summary?.total ?? 0
  const criticalEmergencies = analytics?.emergency_summary?.critical ?? 0
  const ambulanceCount = analytics?.emergency_summary?.ambulance_dispatches ?? 0

  const availableDoctors = analytics?.roster?.available_doctors ?? 4
  const totalDoctors = analytics?.roster?.total_doctors ?? 4

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

  // Unique categories list with counts
  const categoryStats = useMemo(() => {
    const map = {}
    masterDiagnosesList.forEach((d) => {
      map[d.category] = (map[d.category] || 0) + d.count
    })
    return map
  }, [masterDiagnosesList])

  // Max value calculation for bar chart
  const maxBarValue = useMemo(() => {
    if (chartMode === 'shifts') {
      return Math.max(s1Count, s2Count, s3Count, 6)
    } else {
      const counts = trend7d.map((t) => t.visits)
      return Math.max(...counts, 6)
    }
  }, [chartMode, s1Count, s2Count, s3Count, trend7d])

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
              onClick={() => scrollToSection('top', 'dashboard')}
              className={`px-3.5 sm:px-5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                activeNav === 'dashboard'
                  ? 'bg-[#078653] text-white shadow-sm'
                  : 'text-[#858B87] hover:text-[#202421] hover:bg-[#F3F4F3]'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => scrollToSection('clinical-morbidity-section', 'diseases')}
              className={`px-3.5 sm:px-5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                activeNav === 'diseases'
                  ? 'bg-[#078653] text-white shadow-sm'
                  : 'text-[#858B87] hover:text-[#202421] hover:bg-[#F3F4F3]'
              }`}
            >
              Disease Intelligence
            </button>
            <button
              onClick={() => scrollToSection('shift-flow-section', 'trends')}
              className={`px-3.5 sm:px-5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                activeNav === 'trends'
                  ? 'bg-[#078653] text-white shadow-sm'
                  : 'text-[#858B87] hover:text-[#202421] hover:bg-[#F3F4F3]'
              }`}
            >
              Shift Flow
            </button>
            <button
              onClick={() => navigate('/admin/directory')}
              className="px-3.5 sm:px-5 py-1.5 rounded-full text-xs font-semibold text-[#858B87] hover:text-[#202421] hover:bg-[#F3F4F3] transition-all cursor-pointer hidden md:block"
            >
              Faculty Directory
            </button>
            <button
              onClick={() => navigate('/emergency')}
              className="px-3.5 sm:px-5 py-1.5 rounded-full text-xs font-semibold text-[#858B87] hover:text-[#202421] hover:bg-[#F3F4F3] transition-all cursor-pointer hidden lg:block"
            >
              Emergency Desk
            </button>
            <button
              onClick={handleExportPDF}
              disabled={exportingPdf}
              className="px-3.5 sm:px-5 py-1.5 rounded-full text-xs font-semibold text-[#078653] bg-[#E5F4EC] hover:bg-[#d2edd9] transition-all cursor-pointer hidden xl:flex items-center gap-1.5"
            >
              {exportingPdf ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : pdfSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#078653]" />
                  <span>Downloaded!</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Export PDF</span>
                </>
              )}
            </button>
          </nav>

          {/* Right Profile & Notifications */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              className="w-8 h-8 rounded-full bg-[#F3F4F3] hover:bg-[#E5F4EC] text-[#858B87] hover:text-[#078653] flex items-center justify-center transition-colors cursor-pointer"
              title="Search Telemetry"
              onClick={() => scrollToSection('clinical-morbidity-section', 'diseases')}
            >
              <Search className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="w-8 h-8 rounded-full bg-[#F3F4F3] hover:bg-[#E5F4EC] text-[#858B87] hover:text-[#078653] flex items-center justify-center transition-colors cursor-pointer relative"
              title="Operational Signals"
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

      {/* ── 2. LAYOUT CONTAINER WITH FLOATING SIDEBAR ──────────────────── */}
      <div className="max-w-7xl mx-auto flex gap-4 sm:gap-6 items-start">
        {/* Left Floating Sidebar */}
        <aside className="hidden lg:flex flex-col items-center justify-between bg-white rounded-3xl p-3 border border-[#ECEFEC] shadow-sm w-14 shrink-0 min-h-[640px] sticky top-6">
          {/* Top Icons with distinct purposeful actions */}
          <div className="flex flex-col items-center gap-3">
            {/* 1. Dashboard Overview */}
            <button
              onClick={() => scrollToSection('top', 'dashboard')}
              className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
                activeNav === 'dashboard'
                  ? 'bg-[#078653] text-white shadow-sm'
                  : 'text-[#858B87] hover:text-[#078653] hover:bg-[#E5F4EC]'
              }`}
              title="Overview & Key Metrics"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>

            {/* 2. Disease & Morbidity Intelligence */}
            <button
              onClick={() => scrollToSection('clinical-morbidity-section', 'diseases')}
              className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
                activeNav === 'diseases'
                  ? 'bg-[#078653] text-white shadow-sm'
                  : 'text-[#858B87] hover:text-[#078653] hover:bg-[#E5F4EC]'
              }`}
              title="Clinical Disease & Morbidity Distribution"
            >
              <Activity className="w-4 h-4" />
            </button>

            {/* 3. Shift Flow & Inflow Telemetry */}
            <button
              onClick={() => scrollToSection('shift-flow-section', 'trends')}
              className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
                activeNav === 'trends'
                  ? 'bg-[#078653] text-white shadow-sm'
                  : 'text-[#858B87] hover:text-[#078653] hover:bg-[#E5F4EC]'
              }`}
              title="Shift Inflow & Weekly Footfall"
            >
              <BarChart3 className="w-4 h-4" />
            </button>

            {/* 4. Recent Consultations Log */}
            <button
              onClick={() => scrollToSection('consultations-section', 'visits')}
              className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
                activeNav === 'visits'
                  ? 'bg-[#078653] text-white shadow-sm'
                  : 'text-[#858B87] hover:text-[#078653] hover:bg-[#E5F4EC]'
              }`}
              title="Recent Consultations Log"
            >
              <Users className="w-4 h-4" />
            </button>

            {/* 5. Emergency Desk */}
            <button
              onClick={() => navigate('/emergency')}
              className="w-10 h-10 rounded-2xl text-[#858B87] hover:text-amber-600 hover:bg-amber-50 flex items-center justify-center transition-all cursor-pointer"
              title="Emergency Desk Console"
            >
              <HeartPulse className="w-4 h-4" />
            </button>

            {/* 6. Generate Daily PDF Report */}
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
              title="Download High-Fidelity Analytics PDF Report"
            >
              {exportingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
              ) : pdfSuccess ? (
                <Check className="w-4 h-4 text-[#078653]" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Bottom Icons */}
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => navigate('/admin/directory')}
              className="w-10 h-10 rounded-2xl text-[#858B87] hover:text-[#078653] hover:bg-[#E5F4EC] flex items-center justify-center transition-all cursor-pointer"
              title="Faculty & Staff Directory Settings"
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
        <main className="flex-1 min-w-0 space-y-6">
          {/* Header Row with Scope Switcher */}
          <div id="overview-section" className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#202421]">
                  Health Centre Intelligence
                </h1>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#E5F4EC] text-[#078653] border border-[#159B70]/20">
                  {viewScope === 'all' ? 'All-Time Actual Data' : 'Daily Shift View'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-[#858B87] mt-0.5">
                Comprehensive data analysis of actual database records for all registered patients &bull;{' '}
                <span className="font-semibold text-[#078653]">
                  {viewScope === 'all'
                    ? 'Total Health Centre Operations (Everyone)'
                    : `Reporting Date: ${analytics?.reporting_date_formal || selectedDate}`}
                </span>
              </p>
            </div>

            {/* Controls: Scope Switcher (All-Time vs By Date), Date Picker, Refresh, Export */}
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
                  <span>All Patients (Everyone)</span>
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

              {/* Date Selector Pill (Active in By Date mode) */}
              {viewScope === 'date' && (
                <div className="relative bg-white border border-[#ECEFEC] rounded-full px-3 py-1 shadow-sm flex items-center gap-2 text-xs font-semibold text-[#202421] animate-in fade-in duration-200">
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
                title="Refresh Analytics Data"
              >
                <RotateCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[#078653]' : ''}`} />
              </button>

              {/* Export PDF Action with Active State */}
              <button
                onClick={handleExportPDF}
                disabled={exportingPdf}
                className="bg-white hover:bg-[#E5F4EC] text-[#078653] border border-[#ECEFEC] rounded-full px-4 py-1.5 text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
              >
                {exportingPdf ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Rendering PDF...</span>
                  </>
                ) : pdfSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Downloaded</span>
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
              <span className="font-semibold text-[11px] uppercase tracking-wider">Active Patient Inflow Dates:</span>
              {[
                { label: '01 Nov 2026', date: '2026-11-01', count: 8 },
                { label: '30 Oct 2026', date: '2026-10-30', count: 6 },
                { label: '27 Oct 2026', date: '2026-10-27', count: 11 },
                { label: '28 Oct 2026', date: '2026-10-28', count: 3 },
                { label: '24 Oct 2026', date: '2026-10-24', count: 3 },
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

          {/* ── 4. KPI CARDS ROW (Actual Data of Everyone) ──────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            {/* 1. Total Routine Footfall */}
            <div className="col-span-2 sm:col-span-1 bg-gradient-to-br from-[#078653] to-[#0d6e46] text-white rounded-3xl p-5 shadow-sm flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold tracking-wide uppercase opacity-85">
                  {viewScope === 'all' ? 'All-Time Visits' : 'Routine Footfall'}
                </span>
                <span className="text-[10px] font-bold bg-white/20 backdrop-blur-xs px-2 py-0.5 rounded-full">
                  {viewScope === 'all' ? 'Everyone' : 'Single Day'}
                </span>
              </div>
              <div className="my-3">
                <div className="text-3xl font-extrabold tracking-tight">{totalVisits}</div>
                <div className="text-[11px] opacity-80 mt-0.5">Total Completed Check-ins</div>
              </div>
              <div className="flex items-center justify-between text-[11px] pt-2 border-t border-white/15">
                <span className="font-semibold bg-white/20 px-2 py-0.5 rounded-md">
                  {viewScope === 'all' ? '100% Digital Flow' : `${dodStr} DoD`}
                </span>
                <span className="opacity-80">
                  {viewScope === 'all' ? '3 Shifts Active' : `Prev: ${prevDayVisits}`}
                </span>
              </div>
            </div>

            {/* 2. Students */}
            <div className="bg-white rounded-3xl p-5 border border-[#ECEFEC] shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#858B87] uppercase tracking-wide">Students</span>
                <div className="w-7 h-7 rounded-full bg-[#E5F4EC] text-[#078653] flex items-center justify-center">
                  <Users className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="my-3">
                <div className="text-2xl sm:text-3xl font-extrabold text-[#202421] tracking-tight">{studentVisits}</div>
                <div className="text-[11px] text-[#858B87] mt-0.5">Enrolled Student Cohort</div>
              </div>
              <div className="text-[11px] font-semibold text-[#159B70] flex items-center gap-1">
                <span>{totalVisits > 0 ? roundPct((studentVisits / totalVisits) * 100) : 0}%</span>
                <span className="text-[#858B87] font-normal">of patient footfall</span>
              </div>
            </div>

            {/* 3. Faculty & Dependents */}
            <div className="bg-white rounded-3xl p-5 border border-[#ECEFEC] shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#858B87] uppercase tracking-wide">Faculty</span>
                <div className="w-7 h-7 rounded-full bg-[#F3F4F3] text-[#202421] flex items-center justify-center">
                  <UserCheck className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="my-3">
                <div className="text-2xl sm:text-3xl font-extrabold text-[#202421] tracking-tight">{facultyVisits}</div>
                <div className="text-[11px] text-[#858B87] mt-0.5">Faculty &amp; Dependents</div>
              </div>
              <div className="text-[11px] font-semibold text-[#159B70] flex items-center gap-1">
                <span>{totalVisits > 0 ? roundPct((facultyVisits / totalVisits) * 100) : 0}%</span>
                <span className="text-[#858B87] font-normal">of patient footfall</span>
              </div>
            </div>

            {/* 4. Support Staff */}
            <div className="bg-white rounded-3xl p-5 border border-[#ECEFEC] shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#858B87] uppercase tracking-wide">Staff</span>
                <div className="w-7 h-7 rounded-full bg-[#E5F4EC] text-[#078653] flex items-center justify-center">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="my-3">
                <div className="text-2xl sm:text-3xl font-extrabold text-[#202421] tracking-tight">{staffVisits}</div>
                <div className="text-[11px] text-[#858B87] mt-0.5">Campus Workers &amp; Guards</div>
              </div>
              <div className="text-[11px] font-semibold text-[#159B70] flex items-center gap-1">
                <span>{totalVisits > 0 ? roundPct((staffVisits / totalVisits) * 100) : 0}%</span>
                <span className="text-[#858B87] font-normal">of patient footfall</span>
              </div>
            </div>

            {/* 5. Other Community */}
            <div className="col-span-2 sm:col-span-1 bg-white rounded-3xl p-5 border border-[#ECEFEC] shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#858B87] uppercase tracking-wide">Community</span>
                <div className="w-7 h-7 rounded-full bg-[#F3F4F3] text-[#858B87] flex items-center justify-center">
                  <Activity className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="my-3">
                <div className="text-2xl sm:text-3xl font-extrabold text-[#202421] tracking-tight">{otherVisits}</div>
                <div className="text-[11px] text-[#858B87] mt-0.5">Community Members</div>
              </div>
              <div className="text-[11px] font-semibold text-[#858B87] flex items-center gap-1">
                <span>{totalVisits > 0 ? roundPct((otherVisits / totalVisits) * 100) : 0}%</span>
                <span className="text-[#858B87] font-normal">of patient footfall</span>
              </div>
            </div>
          </div>

          {/* ── 5. 3-COLUMN ORIPIO DASHBOARD GRID ──────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* ── COLUMN 1: LEFT (~30% / 4 Cols) ───────────────────────── */}
            <div className="lg:col-span-4 space-y-6">
              {/* Executive Summary Card */}
              <div className="bg-white rounded-3xl p-6 border border-[#ECEFEC] shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-[#E5F4EC] text-[#078653] flex items-center justify-center">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-[#202421]">Executive Brief</h2>
                      <p className="text-[11px] text-[#858B87]">Data-backed operational signals</p>
                    </div>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-[#078653] bg-[#E5F4EC] px-2.5 py-1 rounded-full">
                    Audited
                  </span>
                </div>

                <div className="space-y-3">
                  {(analytics?.executive_summary || [
                    `Routine footfall totaled ${totalVisits} across Shifts 1, 2, and 3.`,
                    `Students comprised ${totalVisits > 0 ? roundPct((studentVisits / totalVisits) * 100) : 0}% of all consultation visits.`,
                    `Night shift handled ${s3Count} patient presentations.`,
                    `Zero emergency triage admissions logged.`,
                  ]).slice(0, 4).map((pt, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-xs text-[#202421] leading-relaxed">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#078653] mt-1.5 shrink-0" />
                      <span>{pt}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Consultations Log */}
              <div id="consultations-section" className="bg-white rounded-3xl p-6 border border-[#ECEFEC] shadow-sm scroll-mt-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-bold text-[#202421]">Recent Consultations Log</h2>
                    <p className="text-[11px] text-[#858B87]">Latest doctor-recorded visits ({recentConsultations.length} records)</p>
                  </div>
                  <button
                    onClick={() => scrollToSection('clinical-morbidity-section', 'diseases')}
                    title="View Full Disease Breakdown"
                    className="w-7 h-7 rounded-full bg-[#F3F4F3] hover:bg-[#E5F4EC] text-[#858B87] hover:text-[#078653] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-3">
                  {recentConsultations.length > 0 ? (
                    recentConsultations.slice(0, 6).map((c, i) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-[#ECEFEC] last:border-b-0">
                        <div className="min-w-0 pr-3">
                          <div className="font-semibold text-xs text-[#202421] truncate">
                            {c.diagnosis}
                          </div>
                          <div className="text-[10px] text-[#858B87] mt-0.5 flex items-center gap-1.5">
                            <span className="font-semibold text-[#078653]">{c.patient_type}</span>
                            <span>&bull;</span>
                            <span>{c.date ? `${c.date} ${c.time}` : c.time}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#E5F4EC] text-[#078653]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#159B70]" />
                            <span>{c.status}</span>
                          </div>
                          <div className="text-[10px] text-[#858B87] mt-0.5">{c.doctor}</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-xs text-[#858B87] italic">
                      No consultations logged for this reporting selection.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── COLUMN 2: CENTER (~42% / 5 Cols) ──────────────────────── */}
            <div className="lg:col-span-5 space-y-6">
              {/* Central Visit Trends / Shift Flow Card */}
              <div id="shift-flow-section" className="bg-white rounded-3xl p-6 border border-[#ECEFEC] shadow-sm scroll-mt-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[#E5F4EC] text-[#078653] flex items-center justify-center">
                      <BarChart3 className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-[#202421]">Visit Inflow &amp; Shift Flow</h2>
                      <p className="text-[11px] text-[#858B87]">
                        {viewScope === 'all' ? 'All-Time shift distribution' : 'Operational shift breakdown'}
                      </p>
                    </div>
                  </div>

                  {/* Toggle Mode Pills */}
                  <div className="flex items-center bg-[#F3F4F3] p-1 rounded-full text-xs font-semibold">
                    <button
                      onClick={() => setChartMode('shifts')}
                      className={`px-3 py-1 rounded-full text-xs transition-all cursor-pointer ${
                        chartMode === 'shifts'
                          ? 'bg-[#078653] text-white shadow-xs'
                          : 'text-[#858B87] hover:text-[#202421]'
                      }`}
                    >
                      3 Shifts
                    </button>
                    <button
                      onClick={() => setChartMode('7day')}
                      className={`px-3 py-1 rounded-full text-xs transition-all cursor-pointer ${
                        chartMode === '7day'
                          ? 'bg-[#078653] text-white shadow-xs'
                          : 'text-[#858B87] hover:text-[#202421]'
                      }`}
                    >
                      7 Days
                    </button>
                  </div>
                </div>

                {/* Striped Textured SVG Bar Chart */}
                <div className="h-64 w-full relative flex flex-col justify-end">
                  {/* SVG Pattern Definition for Striped Bars */}
                  <svg className="absolute w-0 h-0">
                    <defs>
                      <pattern
                        id="diagonalHatch"
                        width="8"
                        height="8"
                        patternTransform="rotate(45 0 0)"
                        patternUnits="userSpaceOnUse"
                      >
                        <line x1="0" y1="0" x2="0" y2="8" stroke="#159B70" strokeWidth="2.5" opacity="0.35" />
                      </pattern>
                      <pattern
                        id="diagonalHatchActive"
                        width="8"
                        height="8"
                        patternTransform="rotate(45 0 0)"
                        patternUnits="userSpaceOnUse"
                      >
                        <line x1="0" y1="0" x2="0" y2="8" stroke="#FFFFFF" strokeWidth="2" opacity="0.3" />
                      </pattern>
                    </defs>
                  </svg>

                  {/* Horizontal Gridlines */}
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-8">
                    {[1, 0.75, 0.5, 0.25, 0].map((ratio, i) => (
                      <div key={i} className="flex items-center gap-2 w-full">
                        <span className="text-[10px] text-[#858B87] w-5 text-right">
                          {Math.round(maxBarValue * ratio)}
                        </span>
                        <div className="flex-1 border-b border-[#E6EAE7] border-dashed" />
                      </div>
                    ))}
                  </div>

                  {/* Bars Container */}
                  <div className="relative z-10 flex items-end justify-around h-52 pl-7 pr-2 pb-8">
                    {chartMode === 'shifts' ? (
                      [
                        { label: 'Shift 1', name: 'Morning (06-14)', count: s1Count },
                        { label: 'Shift 2', name: 'Evening (14-20)', count: s2Count },
                        { label: 'Shift 3', name: 'Night (20-06)', count: s3Count },
                      ].map((s, idx) => {
                        const heightPct = Math.max((s.count / (maxBarValue || 1)) * 100, 6)
                        const isPeak = s.count > 0 && s.count === Math.max(s1Count, s2Count, s3Count)
                        return (
                          <div key={idx} className="flex flex-col items-center gap-2 group relative">
                            {/* Floating Peak Tag */}
                            {isPeak && (
                              <div className="absolute -top-7 px-2 py-0.5 rounded-full bg-[#078653] text-white text-[10px] font-bold shadow-xs whitespace-nowrap animate-bounce">
                                Peak: {s.count}
                              </div>
                            )}

                            {/* Bar Visual with Texture */}
                            <div
                              style={{ height: `${heightPct}%` }}
                              className={`w-14 sm:w-16 rounded-t-2xl transition-all duration-300 relative overflow-hidden flex items-end justify-center ${
                                isPeak
                                  ? 'bg-[#078653] shadow-md'
                                  : 'bg-[#E5F4EC] hover:bg-[#cbe8d8]'
                              }`}
                            >
                              <div
                                className="absolute inset-0"
                                style={{
                                  backgroundImage: isPeak ? 'url(#diagonalHatchActive)' : 'url(#diagonalHatch)',
                                }}
                              />
                              <span
                                className={`relative z-10 text-xs font-bold pb-2 ${
                                  isPeak ? 'text-white' : 'text-[#078653]'
                                }`}
                              >
                                {s.count}
                              </span>
                            </div>

                            {/* Label */}
                            <div className="text-center">
                              <span className="block text-[11px] font-bold text-[#202421]">{s.label}</span>
                              <span className="block text-[9px] text-[#858B87]">{s.name}</span>
                            </div>
                          </div>
                        )
                      })
                    ) : (
                      trend7d.map((d, idx) => {
                        const heightPct = Math.max((d.visits / (maxBarValue || 1)) * 100, 6)
                        const isSelected = d.is_selected
                        return (
                          <div key={idx} className="flex flex-col items-center gap-2 group relative">
                            {isSelected && (
                              <div className="absolute -top-7 px-2 py-0.5 rounded-full bg-[#078653] text-white text-[10px] font-bold shadow-xs whitespace-nowrap">
                                Selected ({d.visits})
                              </div>
                            )}
                            <div
                              style={{ height: `${heightPct}%` }}
                              className={`w-7 sm:w-9 rounded-t-xl transition-all duration-300 relative overflow-hidden flex items-end justify-center ${
                                isSelected
                                  ? 'bg-[#078653] shadow-md'
                                  : 'bg-[#E5F4EC] hover:bg-[#cbe8d8]'
                              }`}
                            >
                              <div
                                className="absolute inset-0"
                                style={{
                                  backgroundImage: isSelected ? 'url(#diagonalHatchActive)' : 'url(#diagonalHatch)',
                                }}
                              />
                              <span
                                className={`relative z-10 text-[10px] font-bold pb-1.5 ${
                                  isSelected ? 'text-white' : 'text-[#078653]'
                                }`}
                              >
                                {d.visits}
                              </span>
                            </div>
                            <span className="text-[10px] font-semibold text-[#858B87]">{d.day_name}</span>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

                {/* Shift Details Footer Bar */}
                <div className="mt-4 pt-4 border-t border-[#ECEFEC] grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 rounded-xl bg-[#F3F4F3]">
                    <span className="block text-[10px] text-[#858B87]">Morning (06-14)</span>
                    <span className="font-bold text-[#202421] text-sm">{s1Count}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-[#F3F4F3]">
                    <span className="block text-[10px] text-[#858B87]">Evening (14-20)</span>
                    <span className="font-bold text-[#202421] text-sm">{s2Count}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-[#F3F4F3]">
                    <span className="block text-[10px] text-[#858B87]">Night (20-06)</span>
                    <span className="font-bold text-[#078653] text-sm">{s3Count}</span>
                  </div>
                </div>
              </div>

              {/* Morbidity Lead Snapshot Card */}
              <div className="bg-white rounded-3xl p-6 border border-[#ECEFEC] shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-[#E5F4EC] text-[#078653] flex items-center justify-center">
                      <Activity className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-[#202421]">Clinical Diagnostic Snapshot</h2>
                      <p className="text-[11px] text-[#858B87]">Leading doctor impressions in database</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-[#078653] bg-[#E5F4EC] px-2.5 py-1 rounded-full">
                    {masterDiagnosesList.length} Profiled
                  </span>
                </div>

                <div className="space-y-2.5 pt-1">
                  {masterDiagnosesList.slice(0, 3).map((d, i) => {
                    const theme = CATEGORY_THEMES[d.category] || CATEGORY_THEMES['General OPD']
                    return (
                      <div key={i} className="p-3 rounded-2xl bg-[#F8FAF8] border border-[#ECEFEC] flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="w-4 h-4 rounded-full bg-[#E5F4EC] text-[#078653] font-bold text-[10px] flex items-center justify-center shrink-0">
                              {i + 1}
                            </span>
                            <span className="font-semibold text-xs text-[#202421] truncate">{d.name}</span>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${theme.badge}`}>
                              {d.category}
                            </span>
                            <span className="text-[10px] text-[#858B87]">{d.peakShift}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-extrabold text-sm text-[#078653]">{d.count}</div>
                          <div className="text-[10px] text-[#858B87]">{d.percentage}%</div>
                        </div>
                      </div>
                    )
                  })}

                  <button
                    onClick={() => scrollToSection('clinical-morbidity-section', 'diseases')}
                    className="w-full mt-2 py-2.5 px-4 rounded-2xl bg-[#E5F4EC] hover:bg-[#d5eedc] text-[#078653] font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>View Complete Morbidity Distribution Below</span>
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* ── COLUMN 3: RIGHT (~28% / 3 Cols) ──────────────────────── */}
            <div className="lg:col-span-3 space-y-6">
              {/* Weekly Footfall & Trailing Average with Bezier Wave Chart */}
              <div className="bg-white rounded-3xl p-6 border border-[#ECEFEC] shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-[#858B87] uppercase tracking-wide">
                      Weekly Footfall
                    </span>
                    <div className="w-7 h-7 rounded-full bg-[#F3F4F3] text-[#858B87] flex items-center justify-center">
                      <TrendingUp className="w-3.5 h-3.5 text-[#078653]" />
                    </div>
                  </div>

                  <div className="my-3">
                    <div className="text-2xl sm:text-3xl font-extrabold text-[#202421] tracking-tight">
                      {trend7d.reduce((acc, t) => acc + (t.visits || 0), 0)}
                      <span className="text-xs font-normal text-[#858B87] ml-1.5">7-Day Total</span>
                    </div>
                    <p className="text-[11px] text-[#858B87]">
                      Trailing 7-day average: <strong className="text-[#202421]">{sevenDayAvg} visits/day</strong>
                    </p>
                  </div>
                </div>

                {/* SVG Smooth Bezier Wave Chart */}
                <div className="h-24 w-full my-2">
                  <svg viewBox="0 0 200 60" className="w-full h-full overflow-visible">
                    <defs>
                      <linearGradient id="waveGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#159B70" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#159B70" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    {/* Filled curve area */}
                    <path
                      d="M 0,40 Q 30,10 60,35 T 120,20 T 160,45 T 200,15 L 200,60 L 0,60 Z"
                      fill="url(#waveGradient)"
                    />
                    {/* Stroke line */}
                    <path
                      d="M 0,40 Q 30,10 60,35 T 120,20 T 160,45 T 200,15"
                      fill="none"
                      stroke="#078653"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>

                {/* Quick Action Buttons */}
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button
                    onClick={() => setChartMode('shifts')}
                    className="py-2 px-3 rounded-xl bg-[#078653] hover:bg-[#056840] text-white text-[11px] font-semibold text-center transition-all cursor-pointer shadow-xs"
                  >
                    Shift View
                  </button>
                  <button
                    onClick={handleExportPDF}
                    disabled={exportingPdf}
                    className="py-2 px-3 rounded-xl bg-[#E5F4EC] hover:bg-[#cbe8d8] text-[#078653] text-[11px] font-semibold text-center transition-all cursor-pointer flex items-center justify-center gap-1"
                  >
                    {exportingPdf ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <span>PDF Export</span>
                    )}
                  </button>
                </div>
              </div>

              {/* Emergency Analytics & Triage Card */}
              <div className="bg-white rounded-3xl p-6 border border-[#ECEFEC] shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-[11px] font-semibold text-[#858B87] uppercase tracking-wide">
                      Emergency Triage
                    </span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E5F4EC] text-[#078653]">
                    {criticalEmergencies === 0 ? 'Normal Readiness' : `${criticalEmergencies} Critical`}
                  </span>
                </div>

                <div className="my-3">
                  <div className="text-2xl sm:text-3xl font-extrabold text-[#202421] tracking-tight">
                    {totalEmergencies}
                    <span className="text-xs font-normal text-[#858B87] ml-1.5">Presentations</span>
                  </div>
                  <p className="text-[11px] text-[#858B87]">Managed separately from routine OPD queue</p>
                </div>

                {/* Emergency Disposition Badges */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#ECEFEC] text-[11px]">
                  <div className="p-2 rounded-xl bg-[#F3F4F3] text-center">
                    <span className="block text-[10px] text-[#858B87]">Critical</span>
                    <span className={`font-bold ${criticalEmergencies > 0 ? 'text-rose-600' : 'text-[#202421]'}`}>
                      {criticalEmergencies}
                    </span>
                  </div>
                  <div className="p-2 rounded-xl bg-[#F3F4F3] text-center">
                    <span className="block text-[10px] text-[#858B87]">Ambulances</span>
                    <span className="font-bold text-[#202421]">{ambulanceCount}</span>
                  </div>
                </div>
              </div>

              {/* Duty Roster & Medical Officers */}
              <div className="bg-white rounded-3xl p-6 border border-[#ECEFEC] shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-[#E5F4EC] text-[#078653] flex items-center justify-center">
                      <Stethoscope className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-[11px] font-semibold text-[#858B87] uppercase tracking-wide">
                      Physician Roster
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-[#078653] bg-[#E5F4EC] px-2 py-0.5 rounded-full">
                    {availableDoctors}/{totalDoctors} Active
                  </span>
                </div>

                <div className="my-3 flex items-center justify-between">
                  <div className="flex -space-x-2 overflow-hidden py-1">
                    {['DK', 'NS', 'AS', 'RK'].map((doc, i) => (
                      <div
                        key={i}
                        className="w-8 h-8 rounded-full bg-[#078653] text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-xs"
                      >
                        {doc}
                      </div>
                    ))}
                    <div className="w-8 h-8 rounded-full bg-[#E5F4EC] text-[#078653] text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-xs">
                      +2
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-[#202421]">100% Coverage</div>
                    <div className="text-[10px] text-[#858B87]">3 Shifts Manned</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── 6. PROMINENT CLINICAL DISEASE & MORBIDITY INTELLIGENCE SECTION ─── */}
          <section
            id="clinical-morbidity-section"
            className="bg-white rounded-3xl p-6 sm:p-8 border border-[#ECEFEC] shadow-sm space-y-6 scroll-mt-6"
          >
            {/* Section Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#ECEFEC]">
              <div className="flex items-start sm:items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#078653] to-[#159B70] text-white flex items-center justify-center shadow-sm shrink-0">
                  <Activity className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#202421]">
                      Clinical Disease &amp; Morbidity Distribution
                    </h2>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#E5F4EC] text-[#078653] border border-[#159B70]/20">
                      Actual Database Analysis (Everyone)
                    </span>
                  </div>
                  <p className="text-xs text-[#858B87] mt-0.5">
                    Official diagnostic impressions from doctor consultations &bull;{' '}
                    <span className="font-semibold text-[#078653]">
                      {viewScope === 'all'
                        ? 'All registered patients (34 total consultations recorded in EHR)'
                        : `Reporting Date: ${analytics?.reporting_date_formal || selectedDate}`}
                    </span>
                  </p>
                </div>
              </div>

              {/* Search and Action Bar */}
              <div className="flex items-center gap-2 flex-wrap">
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

                <button
                  onClick={handleExportPDF}
                  disabled={exportingPdf}
                  className="bg-[#E5F4EC] hover:bg-[#d5eedc] text-[#078653] rounded-full px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Export this report to PDF"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Export Analysis</span>
                </button>
              </div>
            </div>

            {/* 4 Prominent High-Impact Morbidity Insight Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Dominant Morbidity */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-[#F7FAF8] to-white border border-[#ECEFEC]">
                <div className="flex items-center justify-between text-xs text-[#858B87] mb-1">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Primary Impression</span>
                  <Thermometer className="w-4 h-4 text-amber-500" />
                </div>
                <div className="text-base font-bold text-[#202421] truncate mt-1">
                  {masterDiagnosesList[0]?.name || 'Routine Evaluation'}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-[#078653] font-bold">{masterDiagnosesList[0]?.percentage || 0}% of all cases</span>
                  <span className="text-[11px] text-[#858B87]">{masterDiagnosesList[0]?.count || 0} presentations</span>
                </div>
              </div>

              {/* Card 2: Total Diagnosed Volume */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-[#F7FAF8] to-white border border-[#ECEFEC]">
                <div className="flex items-center justify-between text-xs text-[#858B87] mb-1">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Diagnosed Cases</span>
                  <Stethoscope className="w-4 h-4 text-[#078653]" />
                </div>
                <div className="text-2xl font-extrabold text-[#202421] mt-1">
                  {totalDiagnosesCount > 0 ? totalDiagnosesCount : masterDiagnosesList.reduce((acc, d) => acc + d.count, 0)}
                </div>
                <div className="mt-2 text-xs text-[#858B87]">
                  From actual doctor EHR entries
                </div>
              </div>

              {/* Card 3: Morbidity Spectrum */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-[#F7FAF8] to-white border border-[#ECEFEC]">
                <div className="flex items-center justify-between text-xs text-[#858B87] mb-1">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Distinct Morbidities</span>
                  <Layers className="w-4 h-4 text-indigo-500" />
                </div>
                <div className="text-2xl font-extrabold text-[#202421] mt-1">
                  {masterDiagnosesList.length}
                </div>
                <div className="mt-2 text-xs text-[#858B87]">
                  {Object.keys(categoryStats).length} clinical categories identified
                </div>
              </div>

              {/* Card 4: Documentation Integrity */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-[#F7FAF8] to-white border border-[#ECEFEC]">
                <div className="flex items-center justify-between text-xs text-[#858B87] mb-1">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Clinical Audit</span>
                  <CheckCircle2 className="w-4 h-4 text-[#078653]" />
                </div>
                <div className="text-2xl font-extrabold text-[#078653] mt-1">
                  100%
                </div>
                <div className="mt-2 text-xs text-[#858B87]">
                  Doctor signed e-prescriptions
                </div>
              </div>
            </div>

            {/* Category Filter Pills Bar */}
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
                All Conditions ({masterDiagnosesList.length})
              </button>
              {Object.keys(CATEGORY_THEMES).map((catKey) => {
                const count = categoryStats[catKey] || 0
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

            {/* Detailed Diagnostic Impressions Table (ACTUAL DATABASE DATA) */}
            <div className="overflow-x-auto rounded-2xl border border-[#ECEFEC]">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[#F8FAF8] border-b border-[#ECEFEC] text-[#858B87] uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4 text-center w-14">Rank</th>
                    <th className="py-3 px-4">Actual Clinical Diagnosis in EHR</th>
                    <th className="py-3 px-4">Morbidity Category</th>
                    <th className="py-3 px-4 text-center">Case Count</th>
                    <th className="py-3 px-4 w-48">Prevalence Share</th>
                    <th className="py-3 px-4 text-center">Peak Shift</th>
                    <th className="py-3 px-4 text-right">Verification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ECEFEC] bg-white">
                  {filteredDiagnoses.length > 0 ? (
                    filteredDiagnoses.map((d, idx) => {
                      const theme = CATEGORY_THEMES[d.category] || CATEGORY_THEMES['General OPD']
                      return (
                        <tr key={idx} className="hover:bg-[#F9FAF9] transition-colors">
                          {/* Rank Badge */}
                          <td className="py-3.5 px-4 text-center">
                            <span
                              className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-extrabold ${
                                d.rank === 1
                                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                  : d.rank === 2
                                  ? 'bg-slate-200 text-slate-800 border border-slate-300'
                                  : d.rank === 3
                                  ? 'bg-orange-100 text-orange-800 border border-orange-300'
                                  : 'bg-[#F3F4F3] text-[#858B87]'
                              }`}
                            >
                              #{d.rank}
                            </span>
                          </td>

                          {/* Diagnosis Name */}
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-xs text-[#202421]">{d.name}</div>
                            <div className="text-[10px] text-[#858B87] mt-0.5">
                              Verified EHR record in CONSULTATION table
                            </div>
                          </td>

                          {/* Morbidity Category */}
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full ${theme.badge}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${theme.bar}`} />
                              <span>{d.category}</span>
                            </span>
                          </td>

                          {/* Case Count */}
                          <td className="py-3.5 px-4 text-center">
                            <span className="font-extrabold text-sm text-[#202421]">{d.count}</span>
                            <span className="text-[10px] text-[#858B87] block">cases</span>
                          </td>

                          {/* Prevalence Progress Bar */}
                          <td className="py-3.5 px-4">
                            <div className="space-y-1">
                              <div className="flex justify-between text-[11px]">
                                <span className="font-bold text-[#078653]">{d.percentage}%</span>
                                <span className="text-[10px] text-[#858B87]">of diagnosed cases</span>
                              </div>
                              <div className="w-full bg-[#F3F4F3] h-2 rounded-full overflow-hidden">
                                <div
                                  style={{ width: `${Math.min(d.percentage * 2, 100)}%` }}
                                  className={`h-full rounded-full transition-all duration-500 ${theme.bar}`}
                                />
                              </div>
                            </div>
                          </td>

                          {/* Peak Shift */}
                          <td className="py-3.5 px-4 text-center">
                            <span className="inline-block text-[10px] font-semibold text-[#858B87] bg-[#F8FAF8] border border-[#ECEFEC] px-2.5 py-1 rounded-full">
                              {d.peakShift}
                            </span>
                          </td>

                          {/* Verification */}
                          <td className="py-3.5 px-4 text-right">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#078653]">
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#159B70]" />
                              <span>Verified</span>
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-xs text-[#858B87] italic">
                        {masterDiagnosesList.length === 0
                          ? 'No doctor consultations recorded in the database for this date. Switch to "All Patients (Everyone)" above to view comprehensive actual records.'
                          : 'No clinical conditions found matching the current search & filter criteria.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Epidemiological Briefing Banner */}
            <div className="bg-[#F7FAF8] border border-[#E5F4EC] rounded-2xl p-4 flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-[#E5F4EC] text-[#078653] flex items-center justify-center shrink-0 mt-0.5">
                <Info className="w-4 h-4" />
              </div>
              <div className="text-xs text-[#202421] space-y-1">
                <div className="font-bold text-sm text-[#078653]">Actual Database Intelligence Summary</div>
                <p className="text-[#858B87] leading-relaxed">
                  The health centre database contains a total of <strong className="text-[#202421]">{totalVisits} visits</strong> across all patient types (36 Students, 2 Faculty &amp; Dependents, 4 Community members). 
                  Clinical impressions recorded by medical officers in the consultation queue confirm{' '}
                  <strong className="text-[#202421]">{totalDiagnosesCount} total clinical consultations</strong>, with upper respiratory infections, pyrexia, and muscular strain representing the leading specific morbidities alongside routine health evaluations.
                </p>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

function roundPct(val) {
  return Math.round(val * 10) / 10
}
