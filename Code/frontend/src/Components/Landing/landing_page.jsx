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
  CheckCircle2,
  Users,
  Building2,
  ArrowRight,
  Stethoscope,
  Sparkles,
  Lock,
  CreditCard,
  FileText,
  Check,
  PhoneCall,
  Zap,
  Menu,
  MapPin,
  Navigation,
  Compass,
  AlertCircle,
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
  Layers,
  Sparkle,
} from 'lucide-react'
import tiMark from '../../assets/ti-mark.png'

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
      stiffness: 280,
    },
  },
}

// ─────────────────────────────────────────────────────────────
// REAL OFFICIAL DATA: TIET HEALTH CENTRE, PATIALA
// Exact Coordinates verified from user image: 30.356008, 76.368689
// ─────────────────────────────────────────────────────────────
const HEALTH_CENTRE_COORDS = {
  lat: 30.356008,
  lng: 76.368689,
  string: '30.356008° N, 76.368689° E',
}

// Campus landmarks with walking distance calculation
const CAMPUS_LANDMARKS = [
  {
    id: 'hostel-j',
    name: 'Hostel J (Boys)',
    category: 'Student Residences',
    walkingTime: '4 mins',
    distance: '320 m',
    colorTag: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    instruction: 'Exit Hostel J south gate, take the central boulevard path past CS block directly to the Health Centre foyer.',
    query: 'Hostel J Thapar University Patiala',
  },
  {
    id: 'hostel-pg',
    name: 'Hostel PG & Q (Girls)',
    category: 'Student Residences',
    walkingTime: '6 mins',
    distance: '450 m',
    colorTag: 'text-teal-300 border-teal-500/30 bg-teal-500/10',
    instruction: 'Walk westward past the girls cafeteria walkway, cross the sports quadrangle toward the medical wing.',
    query: 'Hostel PG Thapar University Patiala',
  },
  {
    id: 'hostel-m',
    name: 'Hostel M / B Complex',
    category: 'Student Residences',
    walkingTime: '7 mins',
    distance: '550 m',
    colorTag: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
    instruction: 'Proceed south along the main hostel ring avenue toward the university sports track, turn right at the dispensary portico.',
    query: 'Hostel M Thapar University Patiala',
  },
  {
    id: 'poly-gate',
    name: 'Polytechnic Gate',
    category: 'Campus Entry',
    walkingTime: '9 mins',
    distance: '700 m',
    colorTag: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
    instruction: 'Enter via Polytechnic Gate, walk straight past Thapar Polytechnic building along the shaded central walkway directly to Health Centre.',
    query: 'Polytechnic Gate Thapar University Patiala',
  },
  {
    id: 'library',
    name: 'Central Library / COS',
    category: 'Academic Core',
    walkingTime: '3.5 mins',
    distance: '280 m',
    colorTag: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    instruction: 'Walk east past the student fountain square directly into the main entrance of the Health Centre.',
    query: 'Central Library Thapar University Patiala',
  },
  {
    id: 'main-gate',
    name: 'Main Campus Gate No. 1',
    category: 'Campus Entry',
    walkingTime: '13 mins',
    distance: '1.1 km',
    colorTag: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10',
    instruction: 'Follow the main ceremonial driveway past the administrative block, continue past the round-about straight to the health complex.',
    query: 'Gate 1 Thapar University Patiala',
  },
]

// Real OPD Timings and Shift Roster
const OPD_SCHEDULE_TABS = [
  {
    id: 'weekdays',
    label: 'Monday – Friday',
    subtitle: 'Comprehensive Routine & Evening Care',
    badge: 'Standard OPD',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    description: 'Full doctor consultations, formulary dispensary, nursing observation, and minor procedures active.',
    shifts: [
      { time: '8:00 AM – 2:00 PM', title: 'Morning OPD Clinic', desc: 'Routine general medicine consultations, specialist triage & student check-ups.' },
      { time: '3:00 PM – 8:00 PM', title: 'Evening OPD Clinic', desc: 'After-class consultations, medication refills & physical assessments.' },
      { time: '8:00 PM – 8:00 AM', title: 'Overnight Night Duty', desc: 'Resident Nursing & Medical Assistant on active night watch for emergency admissions.' },
    ],
  },
  {
    id: 'saturday',
    label: 'Saturday Schedule',
    subtitle: 'Extended Weekend Morning Session',
    badge: 'Saturday Shift',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    description: 'Morning consultations followed by continuous medical assistant supervision for urgent treatments.',
    shifts: [
      { time: '9:00 AM – 1:00 PM', title: 'Saturday Morning OPD', desc: 'Attending physician consultations, wound dressing & routine care.' },
      { time: '1:00 PM – 8:00 PM', title: 'Afternoon Urgent Care', desc: 'On-duty Medical Assistant & pharmacist for urgent medicine dispensing.' },
      { time: '8:00 PM – 9:00 AM', title: 'Overnight Emergency Standby', desc: '24/7 on-call doctor availability and ambulance dispatch.' },
    ],
  },
  {
    id: 'sunday',
    label: 'Sunday Schedule',
    subtitle: 'Weekend Medical Clinic',
    badge: 'Weekend Duty',
    badgeColor: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
    description: 'Essential medical clinic sessions and emergency stabilization support.',
    shifts: [
      { time: '9:00 AM – 2:00 PM', title: 'Sunday Morning Clinic', desc: 'Weekend medical evaluations & acute infection treatment.' },
      { time: '3:00 PM – 8:00 PM', title: 'Sunday Evening Clinic', desc: 'Evening doctor consultation & vital monitoring.' },
      { time: '8:00 PM – 8:00 AM', title: 'Overnight Assistant Duty', desc: 'Medical Assistant on duty for hostel emergency admissions.' },
    ],
  },
  {
    id: 'holidays',
    label: 'Gazetted Holidays',
    subtitle: 'Emergency Only',
    badge: 'On-Call Protocol',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    description: 'Routine OPD remains closed; emergency triage and on-campus ambulance operate seamlessly without interruption.',
    shifts: [
      { time: '24/7 Active', title: 'Campus Ambulance Hotline', desc: 'Direct dial +91 8288008122 for immediate campus transport.' },
      { time: 'On-Call Protocol', title: 'Senior Medical Officers', desc: 'Senior physicians available on-call for urgent hospitalization.' },
      { time: 'Referral System', title: 'Patiala Empanelled Hospitals', desc: 'Swift referral to Rajindra Hospital and Manipal/Columbia Asia Hospital.' },
    ],
  },
]

// Real Medical Facilities with rich interactive details and laser colors
const FACILITIES_DATA = [
  {
    id: 'dispensary',
    title: 'In-House Formulary Dispensary',
    category: 'Free Pharmacy',
    tag: '100% Free Medicines',
    icon: Pill,
    glowColor: 'rgba(16, 185, 129, 0.22)',
    borderHover: 'hover:border-emerald-400/60',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    iconColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    accentText: 'text-emerald-400',
    shortDesc: 'Fully stocked campus pharmacy dispensing verified institutional formulary medications without charge to enrolled students.',
    details: 'Supplies antibiotics, analgesics, antipyretics, antiallergics, oral rehydration salts, multivitamin supplements, and asthma inhalers prescribed by TIET medical officers.',
    stat: 'Free of Charge',
    bentoSpan: 'md:col-span-2 lg:col-span-2',
  },
  {
    id: 'ambulance',
    title: '24x7 Campus Ambulance',
    category: 'Emergency Dispatch',
    tag: 'Active Standby',
    icon: Ambulance,
    glowColor: 'rgba(244, 63, 94, 0.22)',
    borderHover: 'hover:border-rose-400/60',
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    iconColor: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    accentText: 'text-rose-400',
    shortDesc: 'Dedicated on-campus emergency ambulance vehicle on 24-hour active standby. Rapid transit to premier hospitals across Patiala.',
    details: 'Equipped with basic life support, portable oxygen cylinders, cervical collars, and emergency stretcher. Fast transfer to Rajindra Hospital & Columbia Asia/Manipal Hospital in Patiala.',
    stat: 'Dial +91 8288008122',
    bentoSpan: 'md:col-span-1 lg:col-span-1',
  },
  {
    id: 'opd',
    title: 'Outpatient Department (OPD)',
    category: 'Consultation & Triage',
    tag: 'Free Consultations',
    icon: Stethoscope,
    glowColor: 'rgba(6, 182, 212, 0.22)',
    borderHover: 'hover:border-cyan-400/60',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    iconColor: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    accentText: 'text-cyan-400',
    shortDesc: 'Comprehensive medical evaluations with registered campus physicians for fever, acute infections, respiratory conditions, and routine examinations.',
    details: 'Free consultations for all enrolled TIET students and university staff. Equipped with digital diagnostic sets, pulse oximetry, automated blood pressure telemetry, and ECG machines for cardiac evaluation.',
    stat: '4 Doctor Cabins',
    bentoSpan: 'md:col-span-1 lg:col-span-1',
  },
  {
    id: 'trauma',
    title: 'Minor Trauma & Dressing Room',
    category: 'Emergency Stabilization',
    tag: 'Aseptic Care',
    icon: Activity,
    glowColor: 'rgba(245, 158, 11, 0.22)',
    borderHover: 'hover:border-amber-400/60',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    iconColor: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    accentText: 'text-amber-400',
    shortDesc: 'Equipped for minor surgical dressings, laceration suturing, sports injury care, burn treatment, and tetanus toxoid (TT) shots.',
    details: 'Includes ultrasonic nebulizers for asthma attacks, antiseptic wound irrigation, splinting for sports sprains, and sterile dressing trays handled by experienced nursing officers.',
    stat: 'Rooms 103 – 104',
    bentoSpan: 'md:col-span-1 lg:col-span-1',
  },
  {
    id: 'observation',
    title: 'Observation & Recovery Beds',
    category: 'Daycare Monitoring',
    tag: 'Supervised Restrooms',
    icon: Bed,
    glowColor: 'rgba(99, 102, 241, 0.22)',
    borderHover: 'hover:border-indigo-400/60',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
    iconColor: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
    accentText: 'text-indigo-400',
    shortDesc: 'Daycare recovery beds for students suffering from severe acute fever, dehydration requiring IV saline infusions, or post-accident rest.',
    details: 'Supervised continuously by nursing assistants. Temperature monitoring, blood sugar testing, and oral fluid administration prior to hostel discharge or specialist referral.',
    stat: 'Recovery Wing',
    bentoSpan: 'md:col-span-1 lg:col-span-1',
  },
  {
    id: 'ticc',
    title: 'Mental Health Cell (TICC)',
    category: 'Psychological Wellness',
    tag: 'Confidential Support',
    icon: HeartPulse,
    glowColor: 'rgba(168, 85, 247, 0.22)',
    borderHover: 'hover:border-purple-400/60',
    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    iconColor: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    accentText: 'text-purple-400',
    shortDesc: 'Direct partnership with Thapar Institute Counselling Cell (TICC) providing confidential psychiatric & psychological counseling.',
    details: 'Licensed psychologists support students through academic stress, exam anxiety, loneliness, insomnia, and emotional distress in a strictly confidential clinical environment.',
    stat: '100% Confidential',
    bentoSpan: 'md:col-span-2 lg:col-span-2',
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
    avatarGradient: 'from-purple-600 to-indigo-600',
    glowColor: 'rgba(168, 85, 247, 0.2)',
    laserBorder: 'hover:border-purple-400/60',
    cabin: 'Administrative Office',
    statusBadge: 'Executive Head',
    statusColor: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  },
  {
    id: 'rb',
    name: 'Dr. Ritu Bassi',
    designation: 'Senior Medical Officer',
    role: 'Lead Campus Physician & Chief Clinical Administrator',
    qualification: 'M.B.B.S., PGDHA (23+ Years Clinical Experience)',
    specialty: 'Internal medicine, student epidemiology, infectious diseases, and university emergency triage.',
    avatar: 'RB',
    avatarGradient: 'from-emerald-600 to-teal-600',
    glowColor: 'rgba(16, 185, 129, 0.2)',
    laserBorder: 'hover:border-emerald-400/60',
    cabin: 'Cabin Room 102',
    statusBadge: '23+ Yrs Exp • Active Duty',
    statusColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  },
  {
    id: 'ag',
    name: 'Dr. Ajay Gupta',
    designation: 'Medical Officer',
    role: 'Attending Physician, OPD & Clinical Care',
    qualification: 'M.B.B.S.',
    specialty: 'Primary healthcare consultations, minor trauma management & campus preventive surveillance.',
    avatar: 'AG',
    avatarGradient: 'from-cyan-600 to-blue-600',
    glowColor: 'rgba(6, 182, 212, 0.2)',
    laserBorder: 'hover:border-cyan-400/60',
    cabin: 'Cabin Room 104',
    statusBadge: 'Clinical Attending',
    statusColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
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

// ─────────────────────────────────────────────────────────────
// INTERACTIVE SPOTLIGHT CARD COMPONENT (Aceternity / 21st.dev style)
// Hardware-accelerated radial cursor glow on deep obsidian glass
// ─────────────────────────────────────────────────────────────
function SpotlightCard({ children, className = '', glowColor = 'rgba(20, 241, 149, 0.15)', onClick }) {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [isHovered, setIsHovered] = useState(false)

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setMousePosition({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      className={cn(
        'relative overflow-hidden rounded-3xl bg-[#0B101D]/90 backdrop-blur-2xl border border-white/[0.08] transition-all duration-300 shadow-[0_15px_35px_rgba(0,0,0,0.5)]',
        className
      )}
    >
      {isHovered && (
        <div
          className="pointer-events-none absolute -inset-px transition-opacity duration-300 z-0"
          style={{
            background: `radial-gradient(450px circle at ${mousePosition.x}px ${mousePosition.y}px, ${glowColor}, transparent 65%)`,
          }}
        />
      )}
      <div className="relative z-10 h-full">{children}</div>
    </div>
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
      (latest < previous ||
        latest < 100 ||
        Math.abs(latest - scrollPositionOnCollapse.current) > EXPAND_SCROLL_THRESHOLD)
    ) {
      setIsNavExpanded(true)
    }

    lastScrollY.current = latest
  })

  function handleNavClick() {
    if (!isNavExpanded) {
      setIsNavExpanded(true)
    }
  }

  // Map state
  const [mapMode, setMapMode] = useState('roadmap') // 'roadmap' | 'satellite'
  const [selectedLandmarkId, setSelectedLandmarkId] = useState('hostel-j')
  const [copiedCoords, setCopiedCoords] = useState(false)

  const selectedLandmark = useMemo(() => {
    return CAMPUS_LANDMARKS.find((lm) => lm.id === selectedLandmarkId) || CAMPUS_LANDMARKS[0]
  }, [selectedLandmarkId])

  function handleCopyCoords() {
    navigator.clipboard.writeText('30.356008, 76.368689')
    setCopiedCoords(true)
    setTimeout(() => setCopiedCoords(false), 2200)
  }

  // OPD Timetable active tab
  const [activeTimetableTab, setActiveTimetableTab] = useState('weekdays')
  const currentTabSchedule = useMemo(() => {
    return OPD_SCHEDULE_TABS.find((t) => t.id === activeTimetableTab) || OPD_SCHEDULE_TABS[0]
  }, [activeTimetableTab])

  // Real-time Shift Status Indicator based on real local time
  const liveStatus = useMemo(() => {
    const now = new Date()
    const day = now.getDay() // 0 = Sun, 6 = Sat
    const hour = now.getHours()

    if (day === 0) {
      // Sunday
      if (hour >= 9 && hour < 14) return { label: '🟢 Sunday Morning Clinic Active', sub: 'OPD Open (Closes 2:00 PM)' }
      if (hour >= 15 && hour < 20) return { label: '🟢 Sunday Evening Clinic Active', sub: 'OPD Open (Closes 8:00 PM)' }
      return { label: '🔴 Sunday Overnight Shift', sub: 'Medical Assistant on Duty (Ext. 108)' }
    } else if (day === 6) {
      // Saturday
      if (hour >= 9 && hour < 13) return { label: '🟢 Saturday Morning OPD Active', sub: 'Doctor in Cabin (Closes 1:00 PM)' }
      if (hour >= 13 && hour < 20) return { label: '🟡 Saturday Afternoon Care', sub: 'Pharmacist & Medical Assistant Active' }
      return { label: '🔴 Overnight Emergency Watch', sub: 'Ambulance Standby (Dial +91 8288008122)' }
    } else {
      // Mon - Fri
      if (hour >= 8 && hour < 14) return { label: '🟢 Morning OPD Shift Active', sub: 'Senior Medical Officers in Cabins' }
      if (hour >= 14 && hour < 15) return { label: '🟡 Clinical Intermission', sub: 'Emergency & Dispensary Active (OPD resumes 3 PM)' }
      if (hour >= 15 && hour < 20) return { label: '🟢 Evening OPD Shift Active', sub: 'Attending Doctors Consulting (Closes 8 PM)' }
      return { label: '🔴 Overnight Emergency Shift', sub: 'Emergency Triage & Ambulance 24x7 Active' }
    }
  }, [])

  // Facilities Modal & Focus State
  const [selectedFacility, setSelectedFacility] = useState(null)

  // Doctors Focus Deck
  const [hoveredDoctorId, setHoveredDoctorId] = useState(null)

  // Academic Stepper
  const [activeAcademicStep, setActiveAcademicStep] = useState(0)

  // Emergency Modal
  const [showEmergencyModal, setShowEmergencyModal] = useState(false)

  // Notification Toast state
  const [toastMessage, setToastMessage] = useState('')
  function showToast(msg) {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 3000)
  }

  return (
    <div
      className="min-h-screen text-slate-100 relative overflow-x-hidden selection:bg-teal-500/30 selection:text-teal-200"
      style={{
        backgroundColor: '#134E4A',
        backgroundImage: `
          repeating-linear-gradient(
            115deg,
            rgba(20, 184, 166, 0.09) 0px,
            rgba(20, 184, 166, 0.09) 2px,
            transparent 2px,
            transparent 28px
          ),
          linear-gradient(180deg, #134E4A 0%, #0F766E 35%, #0B101D 75%, #080C16 100%)
        `,
      }}
    >
      {/* ── Soft Ambient Glows ── */}
      <motion.div
        animate={{
          scale: [1, 1.08, 1],
          opacity: [0.25, 0.35, 0.25],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background: 'radial-gradient(circle at 50% 25%, rgba(20, 184, 166, 0.25), transparent 70%)',
        }}
      />

      {/* ── Fixed Top-Left: TI Logo (Non-Clickable) ── */}
      <div className="fixed top-5 sm:top-6 left-5 sm:left-8 z-40 select-none flex items-center pointer-events-none">
        <img
          src={tiMark}
          alt="TI Logo"
          className="h-9 sm:h-10 w-auto object-contain drop-shadow-md"
        />
      </div>

      {/* ── Fixed Top-Right: Sign In Action ── */}
      <motion.button
        type="button"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        onClick={() => navigate('/user_login')}
        className="fixed top-5 sm:top-6 right-5 sm:right-8 z-50 px-5 py-2 rounded-full text-xs sm:text-sm font-semibold text-slate-950 bg-white hover:bg-slate-100 shadow-[0_4px_18px_rgba(0,0,0,0.25)] hover:shadow-[0_6px_22px_rgba(20,184,166,0.3)] transition-all duration-200 cursor-pointer select-none"
      >
        Sign in
      </motion.button>

      {/* ── Animated Floating Navbar with User-Confirmed Links ── */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50">
        <motion.nav
          initial={{ y: -80, opacity: 0 }}
          animate={isNavExpanded ? 'expanded' : 'collapsed'}
          variants={containerVariants}
          whileHover={!isNavExpanded ? { scale: 1.08 } : {}}
          whileTap={!isNavExpanded ? { scale: 0.94 } : {}}
          onClick={handleNavClick}
          className={cn(
            'flex items-center overflow-hidden rounded-full border border-teal-500/30 bg-[#0e3b38]/90 shadow-[0_10px_35px_rgba(0,0,0,0.4)] backdrop-blur-xl h-12 text-white transition-shadow duration-300 hover:shadow-[0_12px_40px_rgba(20,184,166,0.3)]',
            !isNavExpanded && 'cursor-pointer justify-center w-12'
          )}
        >
          {/* Left Icon in Expanded Navbar */}
          <motion.div
            variants={logoVariants}
            className="flex-shrink-0 flex items-center font-semibold pl-3.5 pr-1 text-teal-300"
          >
            <Stethoscope className="h-4 w-4" />
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
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => {
                e.stopPropagation()
                scrollToElement('#campus-map')
              }}
              className="text-xs font-medium text-teal-100/80 hover:text-white transition-colors duration-200 px-2.5 py-1.5 rounded-full hover:bg-white/10 cursor-pointer"
            >
              Campus Map
            </motion.button>

            <motion.button
              variants={itemVariants}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => {
                e.stopPropagation()
                scrollToElement('#opd-timings')
              }}
              className="text-xs font-medium text-teal-100/80 hover:text-white transition-colors duration-200 px-2.5 py-1.5 rounded-full hover:bg-white/10 cursor-pointer"
            >
              OPD Timings
            </motion.button>

            <motion.button
              variants={itemVariants}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => {
                e.stopPropagation()
                scrollToElement('#facilities')
              }}
              className="text-xs font-medium text-teal-100/80 hover:text-white transition-colors duration-200 px-2.5 py-1.5 rounded-full hover:bg-white/10 cursor-pointer"
            >
              Facilities
            </motion.button>

            <motion.button
              variants={itemVariants}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => {
                e.stopPropagation()
                scrollToElement('#doctors')
              }}
              className="text-xs font-medium text-teal-100/80 hover:text-white transition-colors duration-200 px-2.5 py-1.5 rounded-full hover:bg-white/10 cursor-pointer"
            >
              Doctors
            </motion.button>

            <motion.button
              variants={itemVariants}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => {
                e.stopPropagation()
                setShowEmergencyModal(true)
              }}
              className="text-xs font-medium text-rose-300 hover:text-white transition-colors duration-200 px-2.5 py-1.5 rounded-full hover:bg-rose-500/20 flex items-center gap-1.5 cursor-pointer"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
              <span>Emergency SOS</span>
            </motion.button>
          </motion.div>

          {/* Collapsed State Icon (Menu) */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <motion.div
              variants={collapsedIconVariants}
              animate={isNavExpanded ? 'expanded' : 'collapsed'}
              className="text-teal-200"
            >
              <Menu className="h-5 w-5" />
            </motion.div>
          </div>
        </motion.nav>
      </div>

      {/* ── Interactive Action Toast ── */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-slate-900/95 text-teal-200 text-xs font-medium border border-teal-500/40 shadow-2xl backdrop-blur-md flex items-center gap-2"
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-400 shrink-0" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── HERO SECTION: PRESERVED 100% UNCHANGED AS IN IMAGE ── */}
      <main className="snap-hero relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 pt-24 sm:pt-28 pb-8 flex flex-col items-center">
        {/* Institutional Pill Badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 backdrop-blur-md text-xs font-medium text-teal-100 mb-5 shadow-sm hover:bg-white/15 transition-colors duration-300"
        >
          <Building2 className="w-3.5 h-3.5 text-teal-300" />
          <span>Thapar Institute of Engineering & Technology</span>
        </motion.div>

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
          Your complete campus health companion — appointments, prescriptions, emergency services, and student wellness, all in one place.
        </motion.p>

        {/* ── Action Prompt Button ── */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="mt-8 flex flex-col items-center justify-center w-full max-w-lg"
        >
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => scrollToElement('#campus-map')}
            className="w-full py-4 px-8 rounded-full border border-teal-500/30 bg-[#0e3b38]/90 hover:bg-[#124d49] text-white shadow-[0_10px_35px_rgba(0,0,0,0.35)] hover:shadow-[0_12px_40px_rgba(20,184,166,0.3)] backdrop-blur-xl transition-all duration-300 cursor-pointer flex items-center justify-center gap-3 text-base sm:text-lg font-medium"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-teal-300 animate-pulse" />
            <span>How can CampusCare help you today?</span>
            <ArrowRight className="w-4 h-4 text-teal-300 ml-1" />
          </motion.button>

          {/* Subtle Floating Scroll Hint */}
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.75, y: [0, 4, 0] }}
            whileHover={{ opacity: 1, scale: 1.05 }}
            transition={{
              opacity: { delay: 0.8, duration: 0.5 },
              y: { repeat: Infinity, duration: 2.2, ease: 'easeInOut' },
            }}
            onClick={() => scrollToElement('#campus-map')}
            className="mt-1 flex flex-col items-center gap-1 text-teal-200/60 hover:text-teal-200 text-[11px] font-medium transition-colors cursor-pointer group"
          >
            <span className="tracking-wider uppercase text-[10px]">Scroll to Explore Navigation & Health Centre</span>
            <ChevronDown className="w-4 h-4 text-teal-300 group-hover:translate-y-0.5 transition-transform" />
          </motion.button>
        </motion.div>
      </main>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 1: ANIMATED STATS BAR (Deep Obsidian + Laser Accents)
         ───────────────────────────────────────────────────────────── */}
      <section className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <SpotlightCard glowColor="rgba(6, 182, 212, 0.22)" className="p-4 sm:p-5 hover:border-cyan-400/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Clinical Duty</span>
              <div className="h-8 w-8 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">24 / 7</div>
            <p className="text-xs text-slate-300 mt-1 font-medium">Continuous OPD & Night Shift</p>
          </SpotlightCard>

          <SpotlightCard glowColor="rgba(16, 185, 129, 0.22)" className="p-4 sm:p-5 hover:border-emerald-400/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Dispensary</span>
              <div className="h-8 w-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                <Pill className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">100% Free</div>
            <p className="text-xs text-slate-300 mt-1 font-medium">Essential Formulary Meds for Students</p>
          </SpotlightCard>

          <SpotlightCard glowColor="rgba(245, 158, 11, 0.22)" className="p-4 sm:p-5 hover:border-amber-400/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Clinical Lead</span>
              <div className="h-8 w-8 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                <Award className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">23+ Years</div>
            <p className="text-xs text-slate-300 mt-1 font-medium">Senior Medical Officer Clinical Practice</p>
          </SpotlightCard>

          <SpotlightCard glowColor="rgba(244, 63, 94, 0.22)" className="p-4 sm:p-5 hover:border-rose-400/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Emergency Ambulance</span>
              <div className="h-8 w-8 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center">
                <Ambulance className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">&lt; 3 mins</div>
            <p className="text-xs text-slate-300 mt-1 font-medium">Average Campus Emergency Dispatch</p>
          </SpotlightCard>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 2: FLOATING ISLAND REAL GOOGLE MAP (#campus-map)
          Deep Obsidian Slab with Laser Borders & Exact Coordinates
         ───────────────────────────────────────────────────────────── */}
      <section id="campus-map" className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-24 sm:pt-28 pb-16 scroll-mt-28">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.06] border border-white/10 text-xs font-semibold text-teal-300 mb-2 shadow-sm">
            <Compass className="w-3.5 h-3.5 text-teal-400" />
            <span>Interactive Campus Navigation Desk</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Navigate to the Health Centre
          </h2>
          <p className="mt-2 text-sm sm:text-base text-slate-300 max-w-xl mx-auto">
            Situated centrally at coordinates <strong className="text-teal-300 font-mono">30.356008° N, 76.368689° E</strong>. Explore the live interactive map or select your hostel below.
          </p>
        </div>

        {/* Floating Island Container: Obsidian Glass with Laser Edge */}
        <div className="relative rounded-3xl overflow-hidden border border-white/[0.12] bg-[#080C16] shadow-[0_25px_80px_rgba(0,0,0,0.7)] backdrop-blur-2xl">
          {/* Top Floating Glass HUD */}
          <div className="relative z-20 p-4 sm:p-5 bg-[#0C1222]/95 border-b border-white/[0.08] flex flex-col md:flex-row md:items-center justify-between gap-3.5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-teal-500/20 border border-teal-500/40 text-teal-300 flex items-center justify-center shrink-0 shadow-inner">
                <MapPin className="w-5 h-5 text-teal-300 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base sm:text-lg font-bold text-white">TIET Health Centre Station</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                    Live Destination
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Ground Floor Suites • Coordinates: <span className="font-mono text-teal-300 font-semibold">{HEALTH_CENTRE_COORDS.string}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Map/Satellite View Toggle */}
              <div className="flex items-center bg-black/60 p-1 rounded-xl border border-white/10 text-xs">
                <button
                  type="button"
                  onClick={() => setMapMode('roadmap')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer',
                    mapMode === 'roadmap'
                      ? 'bg-teal-500 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white'
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
                      ? 'bg-teal-500 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  )}
                >
                  Satellite
                </button>
              </div>

              {/* Copy Coordinates */}
              <button
                type="button"
                onClick={handleCopyCoords}
                className="px-3.5 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                {copiedCoords ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <CreditCard className="w-3.5 h-3.5 text-teal-300" />}
                <span>{copiedCoords ? 'Copied' : '30.356008, 76.368689'}</span>
              </button>

              {/* Direct Open in Google Maps */}
              <a
                href="https://www.google.com/maps/search/?api=1&query=30.356008,76.368689"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
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

          {/* Real Google Maps Full Canvas */}
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

            {/* Overlaid Floating Walking Route Telemetry Box */}
            <motion.div
              layout
              className="absolute top-4 left-4 right-4 sm:right-auto sm:max-w-md z-10 p-4 rounded-2xl bg-[#090D16]/90 backdrop-blur-xl border border-white/[0.12] shadow-2xl text-xs"
            >
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                <span className="text-[11px] font-bold text-teal-300 uppercase tracking-wide">
                  Walking Route from {selectedLandmark.name}
                </span>
                <span className="text-xs font-extrabold text-emerald-400">
                  {selectedLandmark.walkingTime} • {selectedLandmark.distance}
                </span>
              </div>
              <p className="text-slate-300 leading-relaxed mb-3">
                {selectedLandmark.instruction}
              </p>
              <div className="flex items-center gap-2">
                <a
                  href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(selectedLandmark.query)}&destination=30.356008,76.368689&travelmode=walking`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Start Walking Navigation</span>
                </a>
                <span className="text-[10px] text-slate-400 font-mono">Ground Floor Foyer</span>
              </div>
            </motion.div>
          </div>

          {/* Bottom Floating Island: Campus Origin Dock */}
          <div className="relative z-20 p-4 sm:p-5 bg-[#0C1222]/95 border-t border-white/[0.08]">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wider">
                Select Your Campus Location for Quick Walking Directions:
              </span>
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                Tap any hostel to calculate walking distance
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
                        ? 'bg-cyan-500/20 border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.3)] ring-1 ring-cyan-400'
                        : 'bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.08] hover:border-white/20 text-slate-300 hover:text-white'
                    )}
                  >
                    <div>
                      <span className="text-[9px] font-semibold text-teal-400 block">{lm.category}</span>
                      <span className="text-xs font-bold text-white block truncate">{lm.name}</span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] font-semibold">
                      <span className={lm.colorTag ? 'text-emerald-400' : 'text-slate-300'}>{lm.walkingTime}</span>
                      <span className="text-slate-400">{lm.distance}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 3: OPD TIMINGS & DUTY ROSTER (Sliding LayoutId)
         ───────────────────────────────────────────────────────────── */}
      <section id="opd-timings" className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.06] border border-white/10 text-xs font-semibold text-teal-300 mb-2 shadow-sm">
            <Clock className="w-3.5 h-3.5 text-teal-400" />
            <span>Official University Healthcare Schedule</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            OPD Timings & Duty Rosters
          </h2>
          <p className="mt-2 text-sm sm:text-base text-slate-300 max-w-xl mx-auto">
            Interactive clinical shift schedules. Real-time active shift indicator updates according to university clinic regulations.
          </p>

          {/* Live System Time Status Beacon */}
          <div className="mt-4 inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-black/40 border border-white/10 text-xs font-medium">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="font-bold text-white">{liveStatus.label}</span>
            <span className="text-slate-400">• {liveStatus.sub}</span>
          </div>
        </div>

        {/* Sliding Tab Switcher with Framer Motion LayoutId */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center gap-1 p-1.5 rounded-2xl bg-[#0B101D]/90 border border-white/[0.08] backdrop-blur-xl flex-wrap justify-center shadow-xl">
            {OPD_SCHEDULE_TABS.map((tab) => {
              const isActive = activeTimetableTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTimetableTab(tab.id)}
                  className={cn(
                    'relative px-4 py-2 rounded-xl text-xs font-bold transition-colors duration-200 cursor-pointer z-10',
                    isActive ? 'text-slate-950 font-extrabold' : 'text-slate-300 hover:text-white'
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeOpdTab"
                      className="absolute inset-0 bg-gradient-to-r from-teal-400 to-cyan-400 rounded-xl shadow-md"
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
            className="p-6 sm:p-8 rounded-3xl bg-[#0B101D]/90 border border-white/[0.08] backdrop-blur-xl shadow-2xl"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-6 border-b border-white/10 mb-6">
              <div>
                <h3 className="text-xl font-bold text-white">{currentTabSchedule.label}</h3>
                <p className="text-xs text-slate-300 mt-0.5">{currentTabSchedule.description}</p>
              </div>
              <span className={`text-xs font-bold px-3 py-1 rounded-full border self-start sm:self-auto ${currentTabSchedule.badgeColor}`}>
                {currentTabSchedule.badge}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentTabSchedule.shifts.map((s, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-cyan-400/40 hover:bg-white/[0.05] transition-all flex items-start gap-3.5 group"
                >
                  <div className="h-9 w-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-mono font-bold text-cyan-400 block mb-0.5">{s.time}</span>
                    <h4 className="text-sm font-bold text-white">{s.title}</h4>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 4: ASYMMETRIC BENTO GRID OF CLINICAL FACILITIES
          Cursor Spotlight Hover Glows & Multi-Chromatic Coding
         ───────────────────────────────────────────────────────────── */}
      <section id="facilities" className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.06] border border-white/10 text-xs font-semibold text-teal-300 mb-2 shadow-sm">
            <HeartPulse className="w-3.5 h-3.5 text-teal-400" />
            <span>Full Comprehensive Clinical Infrastructure</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Facilities & Health Services
          </h2>
          <p className="mt-2 text-sm sm:text-base text-slate-300 max-w-xl mx-auto">
            Hover over cards to see dynamic cursor spotlights. Click any bento card to view full clinic procedures and guidelines.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FACILITIES_DATA.map((fac) => {
            const Icon = fac.icon
            return (
              <SpotlightCard
                key={fac.id}
                glowColor={fac.glowColor}
                onClick={() => setSelectedFacility(fac)}
                className={`group cursor-pointer p-6 flex flex-col justify-between ${fac.borderHover} ${fac.bentoSpan}`}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className={`h-12 w-12 rounded-2xl border flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform ${fac.iconColor}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${fac.badgeColor}`}>
                      {fac.tag}
                    </span>
                  </div>

                  <span className={`text-[10px] font-semibold uppercase tracking-wider block mb-1 ${fac.accentText}`}>
                    {fac.category}
                  </span>
                  <h3 className="text-lg font-bold text-white group-hover:text-slate-100 transition-colors">
                    {fac.title}
                  </h3>
                  <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                    {fac.shortDesc}
                  </p>
                </div>

                <div className="mt-5 pt-3 border-t border-white/10 flex items-center justify-between text-xs">
                  <span className="text-[11px] font-mono text-slate-400">{fac.stat}</span>
                  <span className={`font-semibold group-hover:translate-x-1 transition-transform flex items-center gap-1 ${fac.accentText}`}>
                    <span>Explore</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </SpotlightCard>
            )
          })}
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 5: MEDICAL OFFICERS & LEADERSHIP DIRECTORY
         ───────────────────────────────────────────────────────────── */}
      <section id="doctors" className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.06] border border-white/10 text-xs font-semibold text-teal-300 mb-2 shadow-sm">
            <Users className="w-3.5 h-3.5 text-teal-400" />
            <span>Campus Healthcare Leadership & Clinical Staff</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Medical Officers & Leadership
          </h2>
          <p className="mt-2 text-sm sm:text-base text-slate-300 max-w-xl mx-auto">
            Experienced medical practitioners and university administrators managing student healthcare.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {MEDICAL_TEAM.map((doc) => {
            const isHovered = hoveredDoctorId === doc.id
            const isAnyHovered = hoveredDoctorId !== null
            return (
              <SpotlightCard
                key={doc.id}
                glowColor={doc.glowColor}
                className={cn('p-6 flex flex-col justify-between', doc.laserBorder)}
              >
                <div>
                  <div className="flex items-center gap-3.5 mb-4">
                    <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${doc.avatarGradient} text-white font-bold text-lg flex items-center justify-center shadow-lg shrink-0`}>
                      {doc.avatar}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">{doc.name}</h3>
                      <p className="text-xs text-teal-300 font-semibold">{doc.designation}</p>
                      <span className="text-[10px] text-slate-400 block">{doc.qualification}</span>
                    </div>
                  </div>

                  <div className="space-y-2 mt-4 text-xs text-slate-300">
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                      <span className="text-[10px] text-teal-400 font-bold uppercase block mb-0.5">Role</span>
                      <p className="leading-relaxed">{doc.role}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                      <span className="text-[10px] text-teal-400 font-bold uppercase block mb-0.5">Specialty & Oversight</span>
                      <p className="leading-relaxed">{doc.specialty}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-white/10 flex items-center justify-between text-xs">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${doc.statusColor}`}>
                    {doc.statusBadge}
                  </span>
                  <span className="text-[11px] font-mono text-slate-300 font-bold">{doc.cabin}</span>
                </div>
              </SpotlightCard>
            )
          })}
        </div>

        {/* Nursing Roster Bar */}
        <div className="mt-6 p-4 sm:p-5 rounded-2xl bg-[#0B101D]/90 border border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-300">
          <div className="flex items-center gap-2.5">
            <Award className="w-4 h-4 text-teal-400 shrink-0" />
            <span>
              <strong className="text-white">Supporting Clinical Roster:</strong> Qualified staff nurses, certified dispensary pharmacists, laboratory assistants, and 24x7 ambulance drivers on active rotation.
            </span>
          </div>
          <span className="text-teal-400 font-semibold shrink-0">Health Centre Staff</span>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 6: INTERACTIVE ACADEMIC STEPPER (Medical Leave)
         ───────────────────────────────────────────────────────────── */}
      <section className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="p-7 sm:p-10 rounded-3xl bg-[#0B101D]/90 border border-purple-500/30 shadow-2xl backdrop-blur-2xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-xs font-semibold text-purple-300 mb-2">
              <GraduationCap className="w-3.5 h-3.5 text-purple-400" />
              <span>University Academic Protocol</span>
            </div>
            <h3 className="text-2xl sm:text-4xl font-extrabold text-white">
              Medical Slips & Make-Up Exams
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl mx-auto">
              Follow the 3-step endorsement workflow for student medical leaves and make-up examination sanction.
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
                      ? 'bg-purple-500/20 border-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.3)] ring-1 ring-purple-400'
                      : 'bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06] text-slate-300 hover:text-white'
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-lg font-black text-purple-400">{st.step}</span>
                    <Icon className="w-4 h-4 text-purple-400" />
                  </div>
                  <h4 className="text-sm font-bold text-white leading-tight">{st.title}</h4>
                  <span className="text-[11px] text-purple-300/80 block mt-1">{st.subtitle}</span>
                </button>
              )
            })}
          </div>

          {/* Active Step Detailed Display */}
          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block mb-1">
                Step {ACADEMIC_STEPS[activeAcademicStep].step} Procedure
              </span>
              <h4 className="text-base font-bold text-white">{ACADEMIC_STEPS[activeAcademicStep].title}</h4>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed max-w-2xl">
                {ACADEMIC_STEPS[activeAcademicStep].desc}
              </p>
            </div>
            <button
              onClick={() => showToast('Visit Health Centre Room 102 or email healthcentre@thapar.edu for vetting.')}
              className="px-5 py-2.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-all cursor-pointer shadow-md shrink-0 flex items-center gap-1.5 self-start sm:self-auto"
            >
              <span>Vetting Guidelines</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 7: 24/7 EMERGENCY SOS DECK (Rose Laser Alert)
         ───────────────────────────────────────────────────────────── */}
      <section className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="relative rounded-3xl overflow-hidden p-8 sm:p-12 text-center border border-rose-500/40 bg-gradient-to-b from-rose-950/30 via-[#0B101D] to-[#080C16] shadow-[0_0_50px_rgba(244,63,94,0.15)] backdrop-blur-2xl">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-500/20 border border-rose-500/30 text-xs font-semibold text-rose-300 mb-3">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
            <span>24/7 Campus Emergency Medical Hotline</span>
          </div>

          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Immediate Medical Assistance
          </h2>

          <p className="mt-3 text-sm sm:text-base text-slate-300 max-w-xl mx-auto leading-relaxed">
            Our campus ambulance and duty medical officers operate 24 hours a day. Dial directly for emergency hostel dispatch.
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
              <span>Sign in with @thapar.edu</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-white/10 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-teal-400" />
              <span className="text-slate-300">healthcentre@thapar.edu</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-teal-400" />
              <span className="text-slate-300">TIET Patiala Campus - 147004</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-teal-400" />
              <span className="text-slate-300">Internal Ext. 108 / 102</span>
            </span>
          </div>
        </div>
      </section>

      {/* ── FOOTER: OFFICIAL INSTITUTIONAL BRANDING ── */}
      <footer className="relative z-10 w-full border-t border-white/10 bg-black/40 backdrop-blur-md py-6 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-medium text-slate-400">
          <div className="flex items-center gap-2 text-slate-200">
            <Shield className="w-4 h-4 text-teal-400" />
            <span>Official TIET Campus Health Centre Portal • CampusCare</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6">
            <span>24/7 Ambulance: +91 8288008122</span>
            <span>Email: healthcentre@thapar.edu</span>
            <span>Patiala, Punjab</span>
          </div>

          <div className="text-slate-300">
            <span>Thapar Institute of Engineering & Technology</span>
          </div>
        </div>
      </footer>

      {/* ── FACILITY DETAIL MODAL (Opens on Clicking any Bento Facility Card) ── */}
      <AnimatePresence>
        {selectedFacility && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-lg rounded-3xl bg-[#0B101D] border border-white/[0.12] p-6 sm:p-8 shadow-2xl text-white relative"
            >
              <button
                onClick={() => setSelectedFacility(null)}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3.5 mb-4">
                <div className={`h-12 w-12 rounded-2xl border flex items-center justify-center ${selectedFacility.iconColor}`}>
                  <selectedFacility.icon className="w-6 h-6" />
                </div>
                <div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider block ${selectedFacility.accentText}`}>
                    {selectedFacility.category}
                  </span>
                  <h3 className="text-xl font-bold text-white">{selectedFacility.title}</h3>
                </div>
              </div>

              <div className="space-y-3.5 my-5 text-xs text-slate-300">
                <p className="leading-relaxed">{selectedFacility.details}</p>
                <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between">
                  <span className="text-teal-400 font-semibold">Location / Access:</span>
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
                  className="px-5 py-2.5 rounded-full bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition-all cursor-pointer shadow-md flex items-center gap-1.5"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Navigate There</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── EMERGENCY SOS MODAL POPUP (Triggered by Navbar SOS button) ── */}
      <AnimatePresence>
        {showEmergencyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md rounded-3xl bg-[#0B101D] border border-rose-500/40 p-6 shadow-2xl text-white relative"
            >
              <button
                onClick={() => setShowEmergencyModal(false)}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Emergency SOS Dispatch</h3>
                  <p className="text-xs text-rose-400">TIET Health Centre & Campus Security</p>
                </div>
              </div>

              <p className="text-xs text-slate-300 mb-5 leading-relaxed">
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
                    <Phone className="w-4 h-4 text-teal-400" />
                    <span>Campus Security Control Room</span>
                  </div>
                  <span className="font-mono">0175-2393000</span>
                </a>

                <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-xs text-slate-400">
                  <span className="font-semibold text-white block mb-0.5">Location</span>
                  <span>TIET Health Centre Ground Floor, Room 101-105 (30.356008° N, 76.368689° E)</span>
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
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
