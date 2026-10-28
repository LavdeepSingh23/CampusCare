import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from 'framer-motion'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import {
  Activity,
  Calendar,
  Clock,
  ChevronDown,
  Shield,
  Building2,
  ArrowRight,
  Stethoscope,
  Sparkles,
  CreditCard,
  FileText,
  Check,
  PhoneCall,
  Menu,
  MapPin,
  Navigation,
  Compass,
  Phone,
  Mail,
  ExternalLink,
  FileCheck,
  HeartPulse,
  Info,
  X,
  Bed,
  Ambulance,
  Pill,
  Award,
  AlertTriangle,
  GraduationCap,
  ChevronRight,
} from 'lucide-react'
import tiMark from '../../assets/ti-mark.png'
import campusCareLogo from '../../assets/campuscare-logo.png'
import { LiquidGlassCard, LiquidGlassFilter } from '../ui/liquid-glass'

function cn(...classes) {
  return classes.filter(Boolean).join(' ')
}

const EXPAND_SCROLL_THRESHOLD = 80

const containerVariants = {
  expanded: {
    y: 0,
    opacity: 1,
    width: 'auto',
    transition: {
      y: { type: 'spring', damping: 20, stiffness: 260 },
      opacity: { duration: 0.25 },
      type: 'spring',
      damping: 24,
      stiffness: 280,
      staggerChildren: 0.05,
      delayChildren: 0.15,
    },
  },
  collapsed: {
    y: 0,
    opacity: 1,
    width: '3rem',
    transition: {
      type: 'spring',
      damping: 24,
      stiffness: 300,
      when: 'afterChildren',
      staggerChildren: 0.04,
      staggerDirection: -1,
    },
  },
}

const logoVariants = {
  expanded: { opacity: 1, x: 0, rotate: 0, transition: { type: 'spring', damping: 18 } },
  collapsed: { opacity: 0, x: -25, rotate: -180, transition: { duration: 0.25 } },
}

const itemVariants = {
  expanded: { opacity: 1, x: 0, scale: 1, transition: { type: 'spring', damping: 18 } },
  collapsed: { opacity: 0, x: -16, scale: 0.95, transition: { duration: 0.2 } },
}

const collapsedIconVariants = {
  expanded: { opacity: 0, scale: 0.75, transition: { duration: 0.2 } },
  collapsed: {
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring',
      damping: 18,
      stiffness: 300,
      delay: 0.1,
    },
  },
}

// Exact Coordinates of TIET Health Centre verified by user
const HEALTH_CENTRE_COORDS = {
  lat: 30.356008,
  lng: 76.368689,
  string: '30.356008, 76.368689',
}

// Campus landmarks with exact navigation queries
const CAMPUS_LANDMARKS = [
  {
    id: 'hostel-j',
    name: 'Hostel J & PG (Girls)',
    category: 'Residence',
    walkingTime: '3 min walk',
    distance: '250 meters',
    query: 'Hostel J Thapar Institute Patiala',
    instruction: 'Head South along the paved walkway past cafeteria pavilion -> Health Centre is directly ahead on your left.',
  },
  {
    id: 'hostel-h',
    name: 'Hostel H & M (Boys)',
    category: 'Residence',
    walkingTime: '5 min walk',
    distance: '400 meters',
    query: 'Hostel H Thapar Institute Patiala',
    instruction: 'Walk East past Central Lawn -> Follow avenue toward Academic Quad -> Health Centre entrance is next to block B.',
  },
  {
    id: 'hostel-kln',
    name: 'Hostels K, L & N',
    category: 'Residence',
    walkingTime: '4 min walk',
    distance: '320 meters',
    query: 'Hostel K Thapar Institute Patiala',
    instruction: 'Walk past Student Activity Centre -> Follow North avenue -> Arrive at Health Centre primary front desk.',
  },
  {
    id: 'library',
    name: 'Central Library & TAN',
    category: 'Academic',
    walkingTime: '4 min walk',
    distance: '350 meters',
    query: 'Central Library Thapar Institute Patiala',
    instruction: 'Exit Main Library portal -> Walk North along University Boulevard -> Health Centre is situated opposite Student Plaza.',
  },
  {
    id: 'main-gate',
    name: 'Main Campus Gate 1',
    category: 'Campus Entry',
    walkingTime: '7 min walk',
    distance: '600 meters',
    query: 'Main Gate 1 Thapar Institute Patiala',
    instruction: 'Enter via Bhadson Road Gate -> Proceed along Palm Avenue -> Turn right at the Institute Fountain toward Medical Wing.',
  },
  {
    id: 'sports',
    name: 'COS & Sports Complex',
    category: 'Sports & Rec',
    walkingTime: '4 min walk',
    distance: '300 meters',
    query: 'Sports Complex Thapar Institute Patiala',
    instruction: 'Exit athletic pavilion -> Head North-East past Tennis Courts -> Arrive at Health Centre primary emergency drop-off.',
  },
]

// Real OPD Schedule with shift types - styled with clean, elegant non-neon badges
const OPD_SCHEDULE_TABS = [
  {
    id: 'weekdays',
    label: 'Weekdays (Mon – Fri)',
    subtitle: '24 Hours Operational',
    badge: '24/7 Full Service',
    badgeColor: 'bg-white/10 text-white border-white/20',
    description: 'Round-the-clock medical care with senior physicians, duty medical officers, formulary dispensary, and continuous emergency readiness.',
    shifts: [
      { time: '8:30 AM – 7:30 PM (Summer)', title: 'Day OPD Consultations', desc: 'Physicians on duty, routine ailments, triage & free dispensary prescriptions.' },
      { time: '8:30 AM – 7:00 PM (Winter)', title: 'Winter Day OPD', desc: 'Standard winter clinical hours across all consultation suites.' },
      { time: '10:00 PM – 6:00 AM', title: 'Night Shift Physician', desc: 'Attending Duty Medical Officer for overnight patient evaluations & admissions.' },
      { time: '2:00 AM – 8:30 AM', title: 'Early Morning Coverage', desc: 'Medical Assistant on duty + 24/7 campus ambulance on active standby.' },
    ],
  },
  {
    id: 'saturday',
    label: 'Saturday Schedule',
    subtitle: 'Morning & Evening Shifts',
    badge: 'Scheduled OPD',
    badgeColor: 'bg-white/10 text-white border-white/20',
    description: 'Scheduled clinical coverage for students residing on campus over the weekend.',
    shifts: [
      { time: '9:00 AM – 2:00 PM', title: 'Morning Clinic', desc: 'General consultations, follow-ups, and dispensary medicine issue.' },
      { time: '3:00 PM – 2:00 AM', title: 'Evening & Night Shift', desc: 'Duty medical staff on-call for sports injuries & hostel medical calls.' },
      { time: '24 Hours Standby', title: 'Emergency Dispatch', desc: 'Ambulance & urgent hospital referral active continuously.' },
    ],
  },
  {
    id: 'sunday',
    label: 'Sunday Schedule',
    subtitle: 'Weekend Medical Clinic',
    badge: 'Weekend Duty',
    badgeColor: 'bg-white/10 text-white border-white/20',
    description: 'Essential medical clinic sessions and emergency stabilization support.',
    shifts: [
      { time: '9:00 AM – 2:00 PM', title: 'Sunday Morning Clinic', desc: 'Weekend medical evaluations & acute treatment.' },
      { time: '3:00 PM – 8:00 PM', title: 'Sunday Evening Clinic', desc: 'Evening doctor consultation & vital monitoring.' },
      { time: '10:00 PM – 6:00 AM', title: 'Overnight Assistant Duty', desc: 'Medical Assistant on duty for hostel emergencies.' },
    ],
  },
  {
    id: 'holidays',
    label: 'Gazetted Holidays',
    subtitle: 'Emergency Only',
    badge: 'On-Call Protocol',
    badgeColor: 'bg-white/10 text-white border-white/20',
    description: 'Routine OPD remains closed; emergency triage and on-campus ambulance operate seamlessly without interruption.',
    shifts: [
      { time: '24/7 Active', title: 'Campus Ambulance Hotline', desc: 'Direct dial +91 8288008122 for immediate transport.' },
      { time: 'On-Call Protocol', title: 'Senior Medical Officers', desc: 'Senior physicians available on-call for urgent hospitalization.' },
      { time: 'Referral System', title: 'Patiala Empanelled Hospitals', desc: 'Swift referral to Rajindra Hospital and Manipal/Columbia Asia Hospital.' },
    ],
  },
]

// Real Medical Facilities with rich interactive details - Clean non-neon badges
const FACILITIES_DATA = [
  {
    id: 'opd',
    title: 'Outpatient Department (OPD)',
    category: 'Consultation & Triage',
    tag: 'Free Consultations',
    icon: Stethoscope,
    badgeColor: 'bg-white/10 text-white border-white/20',
    shortDesc: 'Comprehensive medical evaluations with registered campus physicians for fever, acute infections, respiratory conditions, and routine examinations.',
    details: 'Free consultations for all enrolled TIET students and university staff. Equipped with digital diagnostic sets, pulse oximetry, automated blood pressure telemetry, and ECG machines for cardiac evaluation.',
    stat: '4 Doctor Cabins',
  },
  {
    id: 'ambulance',
    title: '24x7 Campus Ambulance',
    category: 'Emergency Dispatch',
    tag: 'Active Standby',
    icon: Ambulance,
    badgeColor: 'bg-rose-500/20 text-rose-200 border-rose-500/30',
    shortDesc: 'Dedicated on-campus emergency ambulance vehicle on 24-hour active standby. Rapid transit to premier hospitals across Patiala.',
    details: 'Equipped with basic life support, portable oxygen cylinders, cervical collars, and emergency stretcher. Fast transfer to Rajindra Hospital & Columbia Asia/Manipal Hospital in Patiala.',
    stat: 'Dial +91 8288008122',
  },
  {
    id: 'dispensary',
    title: 'In-House Formulary Dispensary',
    category: 'Pharmacy Services',
    tag: '100% Free Medicines',
    icon: Pill,
    badgeColor: 'bg-white/10 text-white border-white/20',
    shortDesc: 'Fully stocked campus pharmacy dispensing verified institutional formulary medications without charge to enrolled students.',
    details: 'Supplies antibiotics, analgesics, antipyretics, antiallergics, oral rehydration salts, multivitamin supplements, and asthma inhalers prescribed by TIET medical officers.',
    stat: 'Free of Charge',
  },
  {
    id: 'trauma',
    title: 'Minor Trauma & Dressing Room',
    category: 'Emergency Stabilization',
    tag: 'Aseptic Care',
    icon: Activity,
    badgeColor: 'bg-white/10 text-white border-white/20',
    shortDesc: 'Equipped for minor surgical dressings, laceration suturing, first aid, burn care, and emergency tetanus toxoid (TT) injections.',
    details: 'Includes ultrasonic nebulizers for asthma attacks, antiseptic wound irrigation, splinting for sports sprains, and sterile dressing trays handled by experienced nursing officers.',
    stat: 'Rooms 103 – 104',
  },
  {
    id: 'observation',
    title: 'Observation & Recovery Beds',
    category: 'Daycare Monitoring',
    tag: 'Supervised Restrooms',
    icon: Bed,
    badgeColor: 'bg-white/10 text-white border-white/20',
    shortDesc: 'Daycare recovery beds for students suffering from severe acute fever, dehydration requiring IV saline infusions, or post-accident rest.',
    details: 'Supervised continuously by nursing assistants. Temperature monitoring, blood sugar testing, and oral fluid administration prior to hostel discharge or specialist referral.',
    stat: 'Recovery Wing',
  },
  {
    id: 'ticc',
    title: 'Mental Health Cell (TICC)',
    category: 'Psychological Wellness',
    tag: 'Confidential Support',
    icon: HeartPulse,
    badgeColor: 'bg-white/10 text-white border-white/20',
    shortDesc: 'Direct partnership with Thapar Institute Counselling Cell (TICC) providing confidential psychiatric & psychological counseling.',
    details: 'Licensed psychologists support students through academic stress, exam anxiety, loneliness, insomnia, and emotional distress in a strictly confidential clinical environment.',
    stat: '100% Confidential',
  },
]

// Real Medical Faculty from thapar.edu
const MEDICAL_TEAM = [
  {
    id: 'vs',
    name: 'Dr. Vishal Srivastava',
    designation: 'Faculty-in-Charge, Health Centre',
    role: 'Associate Dean of Student Affairs (Health, Wellness & DoSA Digital) & Professor, EIED',
    qualification: 'Ph.D., M.Tech, B.Tech',
    specialty: 'Strategic healthcare operations, student wellness programs & medical emergency infrastructure.',
    avatar: 'VS',
    avatarBg: 'bg-teal-900/80 border border-white/20',
    cabin: 'Administrative Office',
  },
  {
    id: 'rb',
    name: 'Dr. Ritu Bassi',
    designation: 'Senior Medical Officer',
    role: 'Lead Campus Physician & Chief Clinical Administrator',
    qualification: 'M.B.B.S., PGDHA',
    specialty: 'Internal medicine, student epidemiology, infectious diseases, and university emergency triage.',
    avatar: 'RB',
    avatarBg: 'bg-teal-900/80 border border-white/20',
    cabin: 'Cabin Room 102',
  },
  {
    id: 'ag',
    name: 'Dr. Ajay Gupta',
    designation: 'Medical Officer',
    role: 'Attending Physician, OPD & Clinical Care',
    qualification: 'M.B.B.S.',
    specialty: 'Primary healthcare consultations, minor trauma management & campus preventive surveillance.',
    avatar: 'AG',
    avatarBg: 'bg-teal-900/80 border border-white/20',
    cabin: 'Cabin Room 104',
  },
]

// Academic Stepper for Medical Leave & Make-Up Exams
const ACADEMIC_STEPS = [
  {
    step: '01',
    title: 'External Treatment Consultation',
    subtitle: 'Registered Doctor Visit',
    desc: 'If consulting outside campus, ensure the doctor holds a recognized M.B.B.S. or M.D. degree. Retain all original prescription slips, pharmacy bills, and diagnostic reports.',
    icon: FileText,
  },
  {
    step: '02',
    title: 'TIET Health Centre Vetting',
    subtitle: 'Physical Endorsement at Room 102',
    desc: 'Present all external documentation to the TIET Senior Medical Officer upon returning to campus. The Medical Officer reviews and provides an official verified endorsement seal.',
    icon: FileCheck,
  },
  {
    step: '03',
    title: 'Dean of Academic Affairs (DoAA)',
    subtitle: 'Make-up Examination Approval',
    desc: 'Submit the Health Centre-endorsed medical recommendation to the Office of DoAA within university academic deadlines for make-up examination sanction.',
    icon: GraduationCap,
  },
]

// 3D Perspective Tilt Wrapper for Liquid Glass Cards
function TiltContainer({ children, className = '', onClick }) {
  const [rotateX, setRotateX] = useState(0)
  const [rotateY, setRotateY] = useState(0)

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left - rect.width / 2
    const y = e.clientY - rect.top - rect.height / 2
    setRotateX((-y / rect.height) * 8)
    setRotateY((x / rect.width) * 8)
  }

  const handleMouseLeave = () => {
    setRotateX(0)
    setRotateY(0)
  }

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      animate={{ rotateX, rotateY }}
      transition={{ type: 'spring', stiffness: 280, damping: 20 }}
      style={{ transformStyle: 'preserve-3d' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export default function LandingPage() {
  const navigate = useNavigate()
  const lenisRef = useRef(null)

  // Initialize Lenis physics-based smooth momentum scrolling
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.25,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1.05,
      touchMultiplier: 1.8,
      infinite: false,
    })

    lenisRef.current = lenis

    function raf(time) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }

    const rafId = requestAnimationFrame(raf)

    return () => {
      cancelAnimationFrame(rafId)
      lenis.destroy()
      lenisRef.current = null
    }
  }, [])

  function scrollToElement(targetId) {
    if (lenisRef.current) {
      lenisRef.current.scrollTo(targetId, {
        offset: -90,
        duration: 1.2,
      })
    } else {
      const el = document.querySelector(targetId)
      if (el) el.scrollIntoView({ behavior: 'smooth' })
    }
  }

  // Animated Navbar scroll and collapse state
  const [isNavExpanded, setIsNavExpanded] = useState(true)
  const { scrollY } = useScroll()
  const lastScrollY = useRef(0)
  const scrollPositionOnCollapse = useRef(0)

  useMotionValueEvent(scrollY, 'change', (latest) => {
    const previous = lastScrollY.current

    if (isNavExpanded && latest > previous && latest > 150) {
      setIsNavExpanded(false)
      scrollPositionOnCollapse.current = latest
    } else if (
      !isNavExpanded &&
      latest < previous &&
      scrollPositionOnCollapse.current - latest > EXPAND_SCROLL_THRESHOLD
    ) {
      setIsNavExpanded(true)
    }

    lastScrollY.current = latest
  })

  const handleNavClick = (e) => {
    if (!isNavExpanded) {
      e.preventDefault()
      setIsNavExpanded(true)
    }
  }

  // Interactive UI State
  const [selectedLandmarkId, setSelectedLandmarkId] = useState('hostel-j')
  const [mapMode, setMapMode] = useState('roadmap') // 'roadmap' | 'satellite'
  const [activeTimetableTab, setActiveTimetableTab] = useState('weekdays')
  const [selectedFacility, setSelectedFacility] = useState(null)
  const [activeAcademicStep, setActiveAcademicStep] = useState(0)
  const [hoveredDoctorId, setHoveredDoctorId] = useState(null)
  const [copiedCoords, setCopiedCoords] = useState(false)
  const [showEmergencyModal, setShowEmergencyModal] = useState(false)
  const [toastMessage, setToastMessage] = useState(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const selectedLandmark = useMemo(
    () => CAMPUS_LANDMARKS.find((l) => l.id === selectedLandmarkId) || CAMPUS_LANDMARKS[0],
    [selectedLandmarkId]
  )

  const currentTabSchedule = useMemo(
    () => OPD_SCHEDULE_TABS.find((t) => t.id === activeTimetableTab) || OPD_SCHEDULE_TABS[0],
    [activeTimetableTab]
  )

  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3500)
  }

  const handleCopyCoords = () => {
    navigator.clipboard?.writeText(HEALTH_CENTRE_COORDS.string)
    setCopiedCoords(true)
    showToast(`Coordinates copied: ${HEALTH_CENTRE_COORDS.string} (TIET Health Centre)`)
    setTimeout(() => setCopiedCoords(false), 2500)
  }

  // Live OPD status dynamically derived from clock
  const liveStatus = useMemo(() => {
    const now = new Date()
    const hour = now.getHours()
    const day = now.getDay() // 0 = Sunday, 6 = Saturday

    if (day >= 1 && day <= 5) {
      if (hour >= 8 && hour < 20) {
        return { label: 'OPD Currently Open', sub: 'Day doctors & free dispensary active', active: true, shift: 'Day OPD Suite' }
      }
      return { label: 'Night Shift Active', sub: 'Duty Medical Officer on consultation call', active: true, shift: 'Night Physician' }
    }
    if (day === 6) {
      if ((hour >= 9 && hour < 14) || (hour >= 15 && hour < 20)) {
        return { label: 'Saturday OPD Open', sub: 'Clinic & treatment room active', active: true, shift: 'Saturday Roster' }
      }
      return { label: 'Assistant On-Call', sub: 'Emergency medical assistant active', active: false, shift: 'Medical Assistant' }
    }
    if ((hour >= 9 && hour < 14) || (hour >= 15 && hour < 20)) {
      return { label: 'Sunday Clinic Open', sub: 'Weekend OPD consultation available', active: true, shift: 'Sunday Clinic' }
    }
    return { label: '24/7 Ambulance On-Call', sub: 'Night emergency standby', active: false, shift: 'Ambulance Standby' }
  }, [])

  return (
    <div className="min-h-screen bg-[#0c2827] text-white selection:bg-white selection:text-slate-900 overflow-x-hidden relative flex flex-col justify-between">
      {/* ── Global SVG Displacement Filter for Liquid Glass Refraction ── */}
      <LiquidGlassFilter />

      {/* ── Background: Signature Medical Teal Gradient + 115° Diagonal Pattern ── */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background: 'linear-gradient(135deg, #134E4A 0%, #0F766E 45%, #1E293B 100%)',
        }}
      />
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-20"
        style={{
          backgroundImage:
            'repeating-linear-gradient(115deg, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.08) 2px, transparent 2px, transparent 40px)',
        }}
      />

      {/* Ambient breathing spotlight (clean white/soft teal, non-neon) */}
      <motion.div
        animate={{
          scale: [1, 1.06, 1],
          opacity: [0.15, 0.22, 0.15],
        }}
        transition={{
          duration: 9,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background: 'radial-gradient(circle at 50% 25%, rgba(255, 255, 255, 0.18), transparent 70%)',
        }}
      />

      {/* ── Fixed Top-Left: TI Logo (Non-Clickable) ── */}
      <div className="fixed top-3.5 sm:top-6 left-3.5 sm:left-8 z-40 select-none flex items-center pointer-events-none">
        <img
          src={tiMark}
          alt="TI Logo"
          className="h-7 sm:h-10 w-auto object-contain drop-shadow-md"
        />
      </div>

      {/* ── Fixed Top-Right: Sign In Action ── */}
      <motion.button
        type="button"
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        onClick={() => navigate('/user_login')}
        className="fixed top-3 sm:top-6 right-3.5 sm:right-8 z-50 px-3.5 py-1.5 sm:px-5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold text-slate-950 bg-white hover:bg-slate-100 shadow-[0_4px_18px_rgba(0,0,0,0.25)] transition-all duration-200 cursor-pointer select-none"
      >
        Sign in
      </motion.button>

      {/* ── Mobile Floating Navigation Pill (Visible on mobile only) ── */}
      <div className="block sm:hidden fixed top-3 left-1/2 -translate-x-1/2 z-50">
        <button
          type="button"
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
          className="h-8 px-3 rounded-full border border-white/20 bg-[#0c2e2b]/90 shadow-[0_4px_20px_rgba(0,0,0,0.35)] backdrop-blur-xl text-white flex items-center gap-1.5 text-xs font-semibold cursor-pointer active:scale-95 transition-transform"
          style={{
            boxShadow: 'inset 1px 1px 1.5px 0 rgba(255,255,255,0.35), 0 4px 18px rgba(0,0,0,0.35)',
          }}
        >
          <img src={campusCareLogo} alt="Logo" className="h-4 w-4 rounded-sm object-contain" />
          <span>Menu</span>
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", mobileNavOpen && "rotate-180")} />
        </button>

        {/* Mobile Dropdown Menu Sheet */}
        <AnimatePresence>
          {mobileNavOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 450, damping: 28 }}
              className="absolute top-10 left-1/2 -translate-x-1/2 w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-white/20 bg-[#0c2e2b]/95 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-2xl p-3 text-white space-y-1"
              style={{
                boxShadow: 'inset 1.5px 1.5px 2px 0 rgba(255,255,255,0.3), 0 12px 40px rgba(0,0,0,0.5)',
              }}
            >
              <div className="flex items-center justify-between pb-2 mb-1 border-b border-white/10 px-2">
                <div className="flex items-center gap-2">
                  <img src={campusCareLogo} alt="CampusCare" className="h-4 w-4 rounded-sm" />
                  <span className="text-xs font-bold text-white">CampusCare Desk</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setMobileNavOpen(false);
                  scrollToElement('#campus-map');
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-white/90 hover:bg-white/10 transition-colors flex items-center justify-between cursor-pointer"
              >
                <span>Campus Map & Navigation</span>
                <ChevronRight className="w-3.5 h-3.5 text-white/50" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileNavOpen(false);
                  scrollToElement('#opd-timings');
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-white/90 hover:bg-white/10 transition-colors flex items-center justify-between cursor-pointer"
              >
                <span>OPD Timings & Shift Rosters</span>
                <ChevronRight className="w-3.5 h-3.5 text-white/50" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileNavOpen(false);
                  scrollToElement('#facilities');
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-white/90 hover:bg-white/10 transition-colors flex items-center justify-between cursor-pointer"
              >
                <span>Clinical Facilities & Services</span>
                <ChevronRight className="w-3.5 h-3.5 text-white/50" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileNavOpen(false);
                  scrollToElement('#doctors');
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-white/90 hover:bg-white/10 transition-colors flex items-center justify-between cursor-pointer"
              >
                <span>Medical Officers & Staff</span>
                <ChevronRight className="w-3.5 h-3.5 text-white/50" />
              </button>

              <div className="pt-1 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false);
                    setShowEmergencyModal(true);
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-rose-200 bg-rose-500/20 hover:bg-rose-500/30 transition-colors flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-rose-400 animate-pulse" />
                    <span>24/7 Emergency SOS Hotline</span>
                  </span>
                  <PhoneCall className="w-3.5 h-3.5 text-rose-200" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Liquid Glass Floating Navbar (Desktop screens) ── */}
      <div className="hidden sm:block fixed top-6 left-1/2 -translate-x-1/2 z-50">
        <motion.nav
          initial={{ y: -80, opacity: 0 }}
          animate={isNavExpanded ? 'expanded' : 'collapsed'}
          variants={containerVariants}
          whileHover={!isNavExpanded ? { scale: 1.06 } : {}}
          whileTap={!isNavExpanded ? { scale: 0.96 } : {}}
          onClick={handleNavClick}
          className={cn(
            'flex items-center overflow-hidden rounded-full border border-white/20 bg-[#0c2e2b]/85 shadow-[0_12px_36px_rgba(0,0,0,0.4)] backdrop-blur-xl h-12 text-white transition-all duration-300',
            !isNavExpanded && 'cursor-pointer justify-center w-12'
          )}
          style={{
            boxShadow: 'inset 1.5px 1.5px 2px 0 rgba(255,255,255,0.35), inset -1.5px -1.5px 2px 0 rgba(255,255,255,0.2), 0 12px 36px rgba(0,0,0,0.4)',
          }}
        >
          {/* Left Brand Logo in Expanded Navbar */}
          <motion.div
            variants={logoVariants}
            className="flex-shrink-0 flex items-center pl-3 pr-1"
          >
            <img
              src={campusCareLogo}
              alt="CampusCare"
              className="h-5 w-5 rounded-md object-contain shadow-sm"
            />
          </motion.div>

          {/* Navigation Items */}
          <motion.div
            className={cn(
              'flex items-center gap-1 sm:gap-2 pr-3.5',
              !isNavExpanded && 'pointer-events-none'
            )}
          >
            <motion.button
              variants={itemVariants}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={(e) => {
                e.stopPropagation()
                scrollToElement('#campus-map')
              }}
              className="text-xs font-medium text-white/80 hover:text-white transition-colors duration-200 px-2.5 py-1.5 rounded-full hover:bg-white/10 cursor-pointer"
            >
              Campus Map
            </motion.button>

            <motion.button
              variants={itemVariants}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={(e) => {
                e.stopPropagation()
                scrollToElement('#opd-timings')
              }}
              className="text-xs font-medium text-white/80 hover:text-white transition-colors duration-200 px-2.5 py-1.5 rounded-full hover:bg-white/10 cursor-pointer"
            >
              OPD Timings
            </motion.button>

            <motion.button
              variants={itemVariants}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={(e) => {
                e.stopPropagation()
                scrollToElement('#facilities')
              }}
              className="text-xs font-medium text-white/80 hover:text-white transition-colors duration-200 px-2.5 py-1.5 rounded-full hover:bg-white/10 cursor-pointer"
            >
              Facilities
            </motion.button>

            <motion.button
              variants={itemVariants}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={(e) => {
                e.stopPropagation()
                scrollToElement('#doctors')
              }}
              className="text-xs font-medium text-white/80 hover:text-white transition-colors duration-200 px-2.5 py-1.5 rounded-full hover:bg-white/10 cursor-pointer"
            >
              Doctors
            </motion.button>

            <motion.button
              variants={itemVariants}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={(e) => {
                e.stopPropagation()
                setShowEmergencyModal(true)
              }}
              className="text-xs font-semibold text-rose-200 hover:text-white transition-colors duration-200 px-2.5 py-1.5 rounded-full hover:bg-rose-500/20 flex items-center gap-1.5 cursor-pointer"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
              <span>Emergency SOS</span>
            </motion.button>
          </motion.div>

          {/* Collapsed State Icon (Menu) */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <motion.div
              variants={collapsedIconVariants}
              animate={isNavExpanded ? 'expanded' : 'collapsed'}
              className="text-white"
            >
              <Menu className="h-5 w-5" />
            </motion.div>
          </div>
        </motion.nav>
      </div>

      {/* ── Action Toast ── */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-slate-900/95 text-white text-xs font-medium border border-white/20 shadow-2xl backdrop-blur-md flex items-center gap-2"
          >
            <Sparkles className="w-3.5 h-3.5 text-white/80 shrink-0" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── HERO SECTION ── */}
      <main className="snap-hero relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 pt-24 sm:pt-28 pb-8 flex flex-col items-center">
        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="text-5xl sm:text-7xl lg:text-8xl font-extrabold tracking-tight text-center text-white max-w-4xl leading-[1.05]"
        >
          CampusCare
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-4 text-base sm:text-lg text-teal-100/80 text-center max-w-2xl font-normal leading-relaxed"
        >
          Student healthcare, consultations, prescriptions, and 24/7 emergency support.
        </motion.p>
      </main>

      {/* ── DYNAMIC COMPONENT 1: LIQUID GLASS STATS CARDS ── */}
      <section className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <LiquidGlassCard
            borderRadius="20px"
            shadowIntensity="sm"
            glowIntensity="xs"
            className="p-3.5 sm:p-5 text-white bg-white/[0.04] border border-white/10 hover:border-white/25 transition-all group"
          >
            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
              <span className="text-[9px] sm:text-[10px] font-bold text-white/80 uppercase tracking-wider">Clinical Duty</span>
              <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-white/10 text-white flex items-center justify-center">
                <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
            </div>
            <div className="text-xl sm:text-3xl font-extrabold text-white tracking-tight">24 / 7</div>
            <p className="text-[11px] sm:text-xs text-white/70 mt-0.5 sm:mt-1 font-medium leading-snug">Weekday OPD & Night Shift</p>
          </LiquidGlassCard>

          <LiquidGlassCard
            borderRadius="20px"
            shadowIntensity="sm"
            glowIntensity="xs"
            className="p-3.5 sm:p-5 text-white bg-white/[0.04] border border-white/10 hover:border-white/25 transition-all group"
          >
            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
              <span className="text-[9px] sm:text-[10px] font-bold text-white/80 uppercase tracking-wider">Dispensary</span>
              <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-white/10 text-white flex items-center justify-center">
                <Pill className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
            </div>
            <div className="text-xl sm:text-3xl font-extrabold text-white tracking-tight">100% Free</div>
            <p className="text-[11px] sm:text-xs text-white/70 mt-0.5 sm:mt-1 font-medium leading-snug">Essential Formulary Medications</p>
          </LiquidGlassCard>

          <LiquidGlassCard
            borderRadius="20px"
            shadowIntensity="sm"
            glowIntensity="xs"
            className="p-3.5 sm:p-5 text-white bg-white/[0.04] border border-white/10 hover:border-white/25 transition-all group"
          >
            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
              <span className="text-[9px] sm:text-[10px] font-bold text-white/80 uppercase tracking-wider">Clinical Lead</span>
              <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-white/10 text-white flex items-center justify-center">
                <Award className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
            </div>
            <div className="text-xl sm:text-3xl font-extrabold text-white tracking-tight">23+ Years</div>
            <p className="text-[11px] sm:text-xs text-white/70 mt-0.5 sm:mt-1 font-medium leading-snug">Clinical Practice Experience</p>
          </LiquidGlassCard>

          <LiquidGlassCard
            borderRadius="20px"
            shadowIntensity="sm"
            glowIntensity="xs"
            className="p-3.5 sm:p-5 text-white bg-white/[0.04] border border-white/10 hover:border-white/25 transition-all group"
          >
            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
              <span className="text-[9px] sm:text-[10px] font-bold text-rose-300 uppercase tracking-wider">Ambulance</span>
              <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-rose-500/20 text-rose-300 flex items-center justify-center">
                <Ambulance className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
            </div>
            <div className="text-xl sm:text-3xl font-extrabold text-white tracking-tight">&lt; 3 mins</div>
            <p className="text-[11px] sm:text-xs text-white/70 mt-0.5 sm:mt-1 font-medium leading-snug">Average Emergency Response</p>
          </LiquidGlassCard>
        </div>
      </section>

      {/* ── DYNAMIC COMPONENT 2: LIQUID GLASS REAL MAP ISLAND (#campus-map) ── */}
      <section id="campus-map" className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-24 sm:pt-28 pb-16 scroll-mt-28">
        <div className="text-center mb-8">
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Navigate to the Health Centre
          </h2>
          <p className="mt-2 text-sm sm:text-base text-white/75 max-w-xl mx-auto">
            Centrally situated on campus. View walking directions and routes from all hostels.
          </p>
        </div>

        {/* Liquid Glass Map Card Container */}
        <LiquidGlassCard
          borderRadius="28px"
          shadowIntensity="lg"
          glowIntensity="md"
          className="border border-white/15 bg-[#061b19]/80 shadow-2xl"
        >
          {/* Top Glass HUD Header */}
          <div className="relative z-20 p-4 sm:p-5 bg-gradient-to-b from-[#0c2e2b]/95 via-[#0c2e2b]/80 to-transparent border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3.5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-white/10 border border-white/20 text-white flex items-center justify-center shrink-0 shadow-inner">
                <MapPin className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white">TIET Health Centre Station</h3>
                <p className="text-xs text-white/70 mt-0.5">
                  Ground Floor Suites, Thapar University
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Map/Satellite View Toggle */}
              <div className="flex items-center bg-black/40 p-1 rounded-xl border border-white/15 text-xs">
                <button
                  type="button"
                  onClick={() => setMapMode('roadmap')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer',
                    mapMode === 'roadmap'
                      ? 'bg-white text-slate-950 shadow-sm font-bold'
                      : 'text-white/70 hover:text-white'
                  )}
                >
                  Roadmap
                </button>
                <button
                  type="button"
                  onClick={() => setMapMode('satellite')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer',
                    mapMode === 'satellite'
                      ? 'bg-white text-slate-950 shadow-sm font-bold'
                      : 'text-white/70 hover:text-white'
                  )}
                >
                  Satellite
                </button>
              </div>

              {/* Direct Open in Google Maps */}
              <a
                href="https://www.google.com/maps/search/?api=1&query=30.356008,76.368689"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open in Google Maps</span>
              </a>

              {/* Ambulance Call */}
              <a
                href="tel:+918288008122"
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>Ambulance: +91 8288008122</span>
              </a>
            </div>
          </div>

          {/* Real Google Maps Canvas */}
          <div className="relative w-full h-[400px] sm:h-[480px]">
            <iframe
              title="TIET Health Centre Live Google Map"
              src={`https://maps.google.com/maps?q=30.356008,76.368689&hl=en&z=17&t=${mapMode === 'satellite' ? 'k' : 'm'}&output=embed`}
              className="w-full h-full border-0"
              style={{ border: 0 }}
              allowFullScreen=""
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />

            {/* Overlaid Liquid Glass Walking Telemetry HUD */}
            <div className="absolute top-4 left-4 right-4 sm:right-auto sm:max-w-md z-10">
              <LiquidGlassCard
                borderRadius="18px"
                shadowIntensity="xs"
                glowIntensity="sm"
                className="p-4 bg-slate-950/80 border border-white/15 text-xs text-white"
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                  <span className="text-[11px] font-bold text-white/90 uppercase tracking-wide">
                    Route: {selectedLandmark.name}
                  </span>
                  <span className="text-xs font-extrabold text-white">
                    {selectedLandmark.walkingTime} • {selectedLandmark.distance}
                  </span>
                </div>
                <p className="text-white/80 leading-relaxed mb-3">
                  {selectedLandmark.instruction}
                </p>
                <div className="flex items-center gap-2">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(selectedLandmark.query)}&destination=30.356008,76.368689&travelmode=walking`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-950 font-bold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Start Walking GPS</span>
                  </a>
                </div>
              </LiquidGlassCard>
            </div>
          </div>

          {/* Bottom Campus Origin Dock */}
          <div className="relative z-20 p-4 sm:p-5 bg-gradient-to-t from-[#0c2e2b]/95 via-[#0c2e2b]/90 to-transparent border-t border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-white uppercase tracking-wider">
                Select Campus Location for Directions:
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {CAMPUS_LANDMARKS.map((lm) => {
                const isSelected = selectedLandmarkId === lm.id
                return (
                  <button
                    key={lm.id}
                    onClick={() => setSelectedLandmarkId(lm.id)}
                    className={cn(
                      'p-2.5 rounded-xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between',
                      isSelected
                        ? 'bg-white/15 border-white/40 shadow-lg text-white ring-1 ring-white/30'
                        : 'bg-white/[0.04] border-white/10 hover:bg-white/10 text-white/70 hover:text-white'
                    )}
                    style={isSelected ? {
                      boxShadow: 'inset 1.5px 1.5px 2px 0 rgba(255,255,255,0.4), inset -1.5px -1.5px 2px 0 rgba(255,255,255,0.2)',
                    } : {}}
                  >
                    <div>
                      <span className="text-[9px] font-semibold text-white/60 block">{lm.category}</span>
                      <span className="text-xs font-bold text-white block truncate">{lm.name}</span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] font-semibold text-white/90">
                      <span>{lm.walkingTime}</span>
                      <span className="text-white/60">{lm.distance}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </LiquidGlassCard>
      </section>

      {/* ── DYNAMIC COMPONENT 3: LIQUID GLASS SLIDING OPD TIMETABLE (#opd-timings) ── */}
      <section id="opd-timings" className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            OPD Timings & Duty Rosters
          </h2>
          <p className="mt-2 text-sm sm:text-base text-white/75 max-w-xl mx-auto">
            Clinical hours, daily consultations, and emergency duty rosters.
          </p>

          {/* Live System Time Status Beacon - Crisp non-neon */}
          <div className="mt-4 inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-xs font-medium">
            <span className="h-2 w-2 rounded-full bg-white" />
            <span className="font-bold text-white">{liveStatus.label}</span>
            <span className="text-white/70">• {liveStatus.sub}</span>
          </div>
        </div>

        {/* Sliding Tab Switcher with Liquid Glass Border & Pill */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center gap-1 p-1.5 rounded-2xl bg-white/[0.04] border border-white/15 backdrop-blur-xl flex-wrap justify-center shadow-lg"
            style={{
              boxShadow: 'inset 1.5px 1.5px 2px 0 rgba(255,255,255,0.25), inset -1.5px -1.5px 2px 0 rgba(255,255,255,0.15)',
            }}
          >
            {OPD_SCHEDULE_TABS.map((tab) => {
              const isActive = activeTimetableTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTimetableTab(tab.id)}
                  className={cn(
                    'relative px-4 py-2 rounded-xl text-xs font-bold transition-colors duration-200 cursor-pointer z-10',
                    isActive ? 'text-slate-950 font-extrabold' : 'text-white/75 hover:text-white'
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeOpdTab"
                      className="absolute inset-0 bg-white rounded-xl shadow-md"
                      transition={{ type: 'spring', stiffness: 450, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab Content Display Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTabSchedule.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
          >
            <LiquidGlassCard
              borderRadius="28px"
              shadowIntensity="md"
              glowIntensity="sm"
              className="p-6 sm:p-8 bg-white/[0.04] border border-white/15 shadow-2xl"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-6 border-b border-white/10 mb-6">
                <div>
                  <h3 className="text-xl font-bold text-white">{currentTabSchedule.label}</h3>
                  <p className="text-xs text-white/75 mt-0.5">{currentTabSchedule.description}</p>
                </div>
                <span className={`text-xs font-bold px-3 py-1 rounded-full border self-start sm:self-auto ${currentTabSchedule.badgeColor}`}>
                  {currentTabSchedule.badge}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentTabSchedule.shifts.map((s, idx) => (
                  <LiquidGlassCard
                    key={idx}
                    borderRadius="18px"
                    shadowIntensity="xs"
                    glowIntensity="none"
                    className="p-4 bg-white/[0.03] border border-white/5 hover:border-white/20 transition-all flex items-start gap-3.5 group"
                  >
                    <div className="h-9 w-9 rounded-xl bg-white/10 text-white flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-mono font-bold text-white block mb-0.5">{s.time}</span>
                      <h4 className="text-sm font-bold text-white">{s.title}</h4>
                      <p className="text-xs text-white/70 mt-1 leading-relaxed">{s.desc}</p>
                    </div>
                  </LiquidGlassCard>
                ))}
              </div>
            </LiquidGlassCard>
          </motion.div>
        </AnimatePresence>
      </section>

      {/* ── DYNAMIC COMPONENT 4: LIQUID GLASS 3D TILT CLINICAL FACILITIES (#facilities) ── */}
      <section id="facilities" className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Facilities & Health Services
          </h2>
          <p className="mt-2 text-sm sm:text-base text-white/75 max-w-xl mx-auto">
            Comprehensive medical care and clinical infrastructure available on campus.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FACILITIES_DATA.map((fac) => {
            const Icon = fac.icon
            return (
              <TiltContainer
                key={fac.id}
                onClick={() => setSelectedFacility(fac)}
                className="h-full"
              >
                <LiquidGlassCard
                  borderRadius="24px"
                  shadowIntensity="sm"
                  glowIntensity="sm"
                  className="group cursor-pointer p-4 sm:p-6 bg-white/[0.04] border border-white/15 hover:border-white/30 transition-all flex flex-col justify-between h-full"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="h-12 w-12 rounded-2xl bg-white/10 border border-white/20 text-white flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
                        <Icon className="w-6 h-6" />
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${fac.badgeColor}`}>
                        {fac.tag}
                      </span>
                    </div>

                    <span className="text-[10px] font-semibold text-white/70 uppercase tracking-wider block mb-1">
                      {fac.category}
                    </span>
                    <h3 className="text-lg font-bold text-white group-hover:text-white transition-colors">
                      {fac.title}
                    </h3>
                    <p className="text-xs text-white/75 mt-2 leading-relaxed">
                      {fac.shortDesc}
                    </p>
                  </div>

                  <div className="mt-5 pt-3 border-t border-white/10 flex items-center justify-between text-xs">
                    <span className="text-[11px] font-mono text-white/80">{fac.stat}</span>
                    <span className="text-white font-semibold group-hover:translate-x-1 transition-transform flex items-center gap-1">
                      <span>Explore</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </LiquidGlassCard>
              </TiltContainer>
            )
          })}
        </div>
      </section>

      {/* ── DYNAMIC COMPONENT 5: LIQUID GLASS MEDICAL FACULTY FOCUS DECK (#doctors) ── */}
      <section id="doctors" className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Medical Officers & Leadership
          </h2>
          <p className="mt-2 text-sm sm:text-base text-white/75 max-w-xl mx-auto">
            Experienced medical practitioners managing campus student healthcare.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {MEDICAL_TEAM.map((doc) => {
            const isHovered = hoveredDoctorId === doc.id
            const isAnyHovered = hoveredDoctorId !== null
            return (
              <motion.div
                key={doc.id}
                onMouseEnter={() => setHoveredDoctorId(doc.id)}
                onMouseLeave={() => setHoveredDoctorId(null)}
                animate={{
                  scale: isHovered ? 1.03 : isAnyHovered ? 0.98 : 1,
                  opacity: isHovered ? 1 : isAnyHovered ? 0.8 : 1,
                }}
                transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                className="h-full"
              >
                <LiquidGlassCard
                  borderRadius="24px"
                  shadowIntensity={isHovered ? 'lg' : 'sm'}
                  glowIntensity={isHovered ? 'md' : 'xs'}
                  className={cn(
                    'p-6 bg-white/[0.04] border transition-all flex flex-col justify-between h-full',
                    isHovered ? 'border-white/40' : 'border-white/15'
                  )}
                >
                  <div>
                    <div className="flex items-center gap-3.5 mb-4">
                      <div className={`h-14 w-14 rounded-2xl ${doc.avatarBg} text-white font-bold text-lg flex items-center justify-center shadow-md shrink-0`}>
                        {doc.avatar}
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-white">{doc.name}</h3>
                        <p className="text-xs text-white/90 font-semibold">{doc.designation}</p>
                        <span className="text-[10px] text-white/60 block">{doc.qualification}</span>
                      </div>
                    </div>

                    <p className="text-xs text-white/75 mt-4 leading-relaxed">
                      {doc.specialty}
                    </p>
                  </div>

                  <div className="mt-5 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-white/80">
                    <span>Office</span>
                    <span className="text-[11px] font-mono text-white font-bold">{doc.cabin}</span>
                  </div>
                </LiquidGlassCard>
              </motion.div>
            )
          })}
        </div>

      </section>

      {/* ── DYNAMIC COMPONENT 6: LIQUID GLASS ACADEMIC STEPPER (#guidelines) ── */}
      <section className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <LiquidGlassCard
          borderRadius="28px"
          shadowIntensity="lg"
          glowIntensity="sm"
          className="p-7 sm:p-10 bg-white/[0.03] border border-white/15 shadow-2xl"
        >
          <div className="text-center mb-8">
            <h3 className="text-2xl sm:text-4xl font-extrabold text-white">
              Medical Slips & Make-Up Exams
            </h3>
            <p className="text-xs sm:text-sm text-white/75 mt-1 max-w-xl mx-auto">
              Endorsement process for student medical leaves and make-up exams.
            </p>
          </div>

          {/* Stepper Tabs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {ACADEMIC_STEPS.map((st, idx) => {
              const Icon = st.icon
              const isSelected = activeAcademicStep === idx
              return (
                <button
                  key={idx}
                  onClick={() => setActiveAcademicStep(idx)}
                  className={cn(
                    'p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between',
                    isSelected
                      ? 'bg-white/15 border-white/40 shadow-lg text-white ring-1 ring-white/30'
                      : 'bg-white/[0.04] border-white/10 hover:bg-white/10 text-white/70 hover:text-white'
                  )}
                  style={isSelected ? {
                    boxShadow: 'inset 2px 2px 2px 0 rgba(255,255,255,0.35), inset -2px -2px 2px 0 rgba(255,255,255,0.18)',
                  } : {}}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-lg font-black text-white">{st.step}</span>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <h4 className="text-sm font-bold text-white leading-tight">{st.title}</h4>
                  <span className="text-[11px] text-white/70 block mt-1">{st.subtitle}</span>
                </button>
              )
            })}
          </div>

          {/* Active Step Detailed Display */}
          <LiquidGlassCard
            borderRadius="20px"
            shadowIntensity="xs"
            glowIntensity="none"
            className="p-5 bg-white/[0.03] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div>
              <h4 className="text-base font-bold text-white">{ACADEMIC_STEPS[activeAcademicStep].title}</h4>
              <p className="text-xs text-white/80 mt-1 leading-relaxed max-w-2xl">
                {ACADEMIC_STEPS[activeAcademicStep].desc}
              </p>
            </div>
            <button
              onClick={() => showToast('Visit Health Centre Room 102 or email healthcentre@thapar.edu for vetting.')}
              className="px-5 py-2.5 rounded-full bg-white hover:bg-slate-100 text-slate-950 font-bold text-xs transition-all cursor-pointer shadow-md shrink-0 flex items-center gap-1.5 self-start sm:self-auto"
            >
              <span>Vetting Guidelines</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </LiquidGlassCard>
        </LiquidGlassCard>
      </section>

      {/* ── DYNAMIC COMPONENT 7: LIQUID GLASS 24/7 EMERGENCY SOS DECK ── */}
      <section className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <LiquidGlassCard
          borderRadius="28px"
          shadowIntensity="lg"
          glowIntensity="md"
          className="relative overflow-hidden p-8 sm:p-12 text-center border border-white/15 bg-white/[0.03] shadow-2xl"
        >
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Immediate Medical Assistance
          </h2>

          <p className="mt-3 text-sm sm:text-base text-white/75 max-w-xl mx-auto leading-relaxed">
            24-hour campus ambulance and emergency medical dispatch.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3.5">
            <a
              href="tel:+918288008122"
              className="w-full sm:w-auto px-8 py-3.5 rounded-full text-xs sm:text-sm font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-[0_4px_25px_rgba(225,29,72,0.4)] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <PhoneCall className="w-4 h-4" />
              <span>Call Ambulance: +91 8288008122</span>
            </a>

            <button
              onClick={() => navigate('/user_login')}
              className="w-full sm:w-auto px-8 py-3.5 rounded-full text-xs sm:text-sm font-bold text-slate-950 bg-white hover:bg-slate-100 shadow-[0_4px_20px_rgba(255,255,255,0.25)] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Sign In</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-white/10 flex flex-wrap items-center justify-center gap-6 text-xs text-white/70">
            <span className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-white/80" />
              <span>healthcentre@thapar.edu</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-white/80" />
              <span>TIET Patiala Campus - 147004</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-white/80" />
              <span>Internal Ext. 108 / 102</span>
            </span>
          </div>
        </LiquidGlassCard>
      </section>

      {/* ── FOOTER: OFFICIAL INSTITUTIONAL BRANDING ── */}
      <footer className="relative z-10 w-full border-t border-white/10 bg-black/30 backdrop-blur-md py-6 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-medium text-white/70">
          <div className="flex items-center gap-2.5 text-white">
            <img
              src={campusCareLogo}
              alt="CampusCare"
              className="h-5 w-5 rounded-md object-contain shadow-sm"
            />
            <span>Official TIET Campus Health Centre Portal • CampusCare</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6">
            <span>24/7 Ambulance: +91 8288008122</span>
            <span>Email: healthcentre@thapar.edu</span>
            <span>Patiala, Punjab</span>
          </div>

          <div className="text-white/80">
            <span>Thapar Institute of Engineering & Technology</span>
          </div>
        </div>
      </footer>

      {/* ── FACILITY DETAIL LIQUID GLASS MODAL ── */}
      <AnimatePresence>
        {selectedFacility && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-lg"
            >
              <LiquidGlassCard
                borderRadius="28px"
                shadowIntensity="xl"
                glowIntensity="lg"
                className="w-full bg-[#082220]/95 border border-white/20 p-6 sm:p-8 shadow-2xl text-white relative"
              >
                <button
                  onClick={() => setSelectedFacility(null)}
                  className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-3.5 mb-4">
                  <div className="h-12 w-12 rounded-2xl bg-white/10 border border-white/20 text-white flex items-center justify-center">
                    <selectedFacility.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider block">
                      {selectedFacility.category}
                    </span>
                    <h3 className="text-xl font-bold text-white">{selectedFacility.title}</h3>
                  </div>
                </div>

                <div className="space-y-3.5 my-5 text-xs text-white/85">
                  <p className="leading-relaxed">{selectedFacility.details}</p>
                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between">
                    <span className="text-white/80 font-semibold">Location / Access:</span>
                    <span className="font-mono text-white font-bold">{selectedFacility.stat}</span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                  <button
                    onClick={() => setSelectedFacility(null)}
                    className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-all cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      setSelectedFacility(null)
                      scrollToElement('#campus-map')
                    }}
                    className="px-5 py-2.5 rounded-full bg-white hover:bg-slate-100 text-slate-950 font-bold text-xs transition-all cursor-pointer shadow-md flex items-center gap-1.5"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Navigate There</span>
                  </button>
                </div>
              </LiquidGlassCard>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── EMERGENCY SOS LIQUID GLASS MODAL ── */}
      <AnimatePresence>
        {showEmergencyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md"
            >
              <LiquidGlassCard
                borderRadius="28px"
                shadowIntensity="xl"
                glowIntensity="lg"
                className="w-full bg-[#082220]/95 border border-rose-500/40 p-6 shadow-2xl text-white relative"
              >
                <button
                  onClick={() => setShowEmergencyModal(false)}
                  className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-3 mb-4">
                  <div className="h-12 w-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-300 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Emergency SOS Dispatch</h3>
                    <p className="text-xs text-rose-200">TIET Health Centre & Campus Security</p>
                  </div>
                </div>

                <p className="text-xs text-white/80 mb-5 leading-relaxed">
                  For acute sports trauma, breathing distress, sudden unconsciousness, or urgent campus ambulance pickup, click below to dial instantly:
                </p>

                <div className="space-y-2.5 mb-5">
                  <a
                    href="tel:+918288008122"
                    className="p-3.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm flex items-center justify-between transition-all shadow-lg"
                  >
                    <div className="flex items-center gap-2.5">
                      <Ambulance className="w-5 h-5" />
                      <span>24/7 Campus Ambulance</span>
                    </div>
                    <span>+91 8288008122</span>
                  </a>

                  <a
                    href="tel:01752393000"
                    className="p-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-semibold text-xs flex items-center justify-between transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-white" />
                      <span>Campus Security Control Room</span>
                    </div>
                    <span className="font-mono">0175-2393000</span>
                  </a>

                  <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-xs text-white/70">
                    <span className="font-semibold text-white block mb-0.5">Location</span>
                    <span>TIET Health Centre Ground Floor, Rooms 101–105</span>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => setShowEmergencyModal(false)}
                    className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-all cursor-pointer"
                  >
                    Dismiss SOS
                  </button>
                </div>
              </LiquidGlassCard>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
