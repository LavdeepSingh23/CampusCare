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
  Search,
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
} from 'lucide-react'
import tiMark from '../../assets/ti-mark.png'

function cn(...classes) {
  return classes.filter(Boolean).join(' ')
}

function BentoGrid({ className, children }) {
  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-3 gap-5 auto-rows-[22rem]', className)}>
      {children}
    </div>
  )
}

function BentoCard({ name, description, Icon, className, cta, onCtaClick, background }) {
  return (
    <div
      className={cn(
        'group relative col-span-3 flex flex-col justify-between overflow-hidden rounded-3xl',
        'bg-white/[0.04] border border-teal-500/25 p-6 backdrop-blur-md hover:border-teal-400/50 transition-all duration-300',
        className
      )}
    >
      <div>{background}</div>
      <div className="relative z-10 flex flex-col gap-2">
        <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-500/30 text-teal-300 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <h3 className="text-lg font-bold text-white mt-2">{name}</h3>
        <p className="text-xs sm:text-sm text-teal-100/75 leading-relaxed">{description}</p>
      </div>
      <div className="relative z-10 mt-4 flex items-center justify-between pt-3 border-t border-white/10">
        <button
          type="button"
          onClick={onCtaClick}
          className="text-xs font-semibold text-teal-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <span>{cta}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

function BorderBeam({ duration = 8, colorFrom = '#2dd4bf', colorTo = '#0d9488' }) {
  return (
    <div className="pointer-events-none absolute inset-0 rounded-[inherit] border border-teal-500/30 overflow-hidden">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration, repeat: Infinity, ease: 'linear' }}
        className="absolute -inset-[100%] opacity-30"
        style={{
          background: `conic-gradient(from 0deg, transparent 0 340deg, ${colorFrom} 360deg)`,
        }}
      />
    </div>
  )
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

// Campus landmarks with coordinates & schematic vectors
const CAMPUS_LANDMARKS = [
  {
    id: 'hostel-j',
    name: 'Hostel J & PG (Girls)',
    category: 'Residence',
    walkingTime: '3 min walk',
    distance: '250 meters',
    instruction: 'Head South along the paved walkway -> Pass cafeteria pavilion -> Health Centre is directly ahead on your left.',
    x: 75,
    y: 24,
    pathD: 'M 450 144 Q 380 230 300 300',
  },
  {
    id: 'hostel-h',
    name: 'Hostel H & M (Boys)',
    category: 'Residence',
    walkingTime: '5 min walk',
    distance: '400 meters',
    instruction: 'Walk East past Central Lawn -> Follow avenue toward Academic Quad -> Health Centre entrance is next to block B.',
    x: 25,
    y: 28,
    pathD: 'M 150 168 Q 210 240 300 300',
  },
  {
    id: 'library',
    name: 'Central Library & TAN',
    category: 'Academic',
    walkingTime: '4 min walk',
    distance: '350 meters',
    instruction: 'Exit Main Library portal -> Walk North along University Boulevard -> Health Centre is situated opposite Student Plaza.',
    x: 78,
    y: 72,
    pathD: 'M 468 432 Q 400 360 300 300',
  },
  {
    id: 'main-gate',
    name: 'Main Campus Gate 1',
    category: 'Campus Entry',
    walkingTime: '7 min walk',
    distance: '600 meters',
    instruction: 'Enter via Bhadson Road Gate -> Proceed along Palm Avenue -> Turn right at the Institute Fountain toward Medical Wing.',
    x: 20,
    y: 78,
    pathD: 'M 120 468 Q 200 390 300 300',
  },
  {
    id: 'sports',
    name: 'COS & Sports Complex',
    category: 'Sports & Rec',
    walkingTime: '4 min walk',
    distance: '320 meters',
    instruction: 'Exit athletic pavilion -> Head North-East past Tennis Courts -> Arrive at Health Centre primary emergency drop-off.',
    x: 48,
    y: 86,
    pathD: 'M 288 516 Q 295 410 300 300',
  },
]

// Real OPD Schedule from thapar.edu
const OPD_SCHEDULE = [
  {
    day: 'Monday – Friday',
    hours: '24 Hours Operational',
    status: 'Full Service',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    details: [
      { time: '8:30 AM – 7:30 PM (Summer)', desc: 'General OPD, Day Physician Consultations & Formulary Dispensary' },
      { time: '8:30 AM – 7:00 PM (Winter)', desc: 'Winter OPD Hours for Consultations and Injections' },
      { time: '10:00 PM – 6:00 AM', desc: 'Night Medical Officer Consultation & Emergency Triage' },
      { time: '2:00 AM – 8:30 AM', desc: 'Medical Assistant on Duty + 24/7 Ambulance On-Call' },
    ],
  },
  {
    day: 'Saturday',
    hours: '9:00 AM – 2:00 AM',
    status: 'Scheduled OPD',
    badgeColor: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
    details: [
      { time: '9:00 AM – 2:00 PM', desc: 'Morning OPD Consultations & Regular Medicine Dispensing' },
      { time: '3:00 PM – 2:00 AM', desc: 'Evening & Night Clinical Coverage with Duty Medical Staff' },
      { time: 'Emergency Coverage', desc: 'Continuous on-campus ambulance availability' },
    ],
  },
  {
    day: 'Sunday',
    hours: 'Day & Night Shifts',
    status: 'Weekend OPD',
    badgeColor: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
    details: [
      { time: '9:00 AM – 2:00 PM', desc: 'Sunday Morning OPD Clinic' },
      { time: '3:00 PM – 8:00 PM', desc: 'Sunday Evening Clinical Review' },
      { time: '10:00 PM – 6:00 AM', desc: 'Night Medical Assistant Shift + Emergency Referral' },
    ],
  },
  {
    day: 'Gazetted Holidays',
    hours: 'Emergency & Ambulance Only',
    status: 'Emergency Active',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    details: [
      { time: '24/7 Hotline', desc: 'Emergency response line active at +91 8288008122' },
      { time: 'Hospital Referrals', desc: 'Immediate transit to empanelled hospitals in Patiala city' },
      { time: 'On-Call Doctors', desc: 'Senior Medical Officers available for urgent hospitalizations' },
    ],
  },
]

// Real Medical Faculty from thapar.edu
const MEDICAL_TEAM = [
  {
    name: 'Dr. Vishal Srivastava',
    designation: 'Faculty-in-Charge, Health Centre',
    role: 'Associate Dean of Student Affairs (Health & Wellness) & Professor, EIED',
    qualification: 'Ph.D., M.Tech, B.Tech',
    specialty: 'Healthcare Operations & Student Wellness Administration',
    avatar: 'VS',
    avatarBg: 'bg-teal-700',
  },
  {
    name: 'Dr. Ritu Bassi',
    designation: 'Senior Medical Officer',
    role: 'Lead Campus Physician & Clinical Administrator',
    qualification: 'M.B.B.S., PGDHA (23+ Years Experience)',
    specialty: 'Internal Medicine, Student Health Surveillance & Emergency Triage',
    avatar: 'RB',
    avatarBg: 'bg-emerald-700',
  },
  {
    name: 'Dr. Ajay Gupta',
    designation: 'Medical Officer',
    role: 'Attending Physician, OPD & Clinical Care',
    qualification: 'M.B.B.S.',
    specialty: 'Primary Care, Acute Trauma Dressing & Outpatient Management',
    avatar: 'AG',
    avatarBg: 'bg-teal-800',
  },
]

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

  // State for interactive campus schematic map
  const [selectedLandmarkId, setSelectedLandmarkId] = useState('hostel-j')
  const [copiedCoords, setCopiedCoords] = useState(false)
  const [showEmergencyModal, setShowEmergencyModal] = useState(false)
  const [toastMessage, setToastMessage] = useState(null)

  const selectedLandmark = useMemo(
    () => CAMPUS_LANDMARKS.find((l) => l.id === selectedLandmarkId) || CAMPUS_LANDMARKS[0],
    [selectedLandmarkId]
  )

  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3500)
  }

  const handleCopyCoords = () => {
    navigator.clipboard?.writeText('30.3566, 76.3641')
    setCopiedCoords(true)
    showToast('Coordinates copied: 30.3566° N, 76.3641° E (TIET Health Centre)')
    setTimeout(() => setCopiedCoords(false), 2500)
  }

  // Check live OPD status based on current time
  const currentOpdStatus = useMemo(() => {
    const now = new Date()
    const hour = now.getHours()
    const day = now.getDay() // 0 = Sunday, 6 = Saturday

    if (day >= 1 && day <= 5) {
      // Weekday
      if (hour >= 8 && hour < 20) {
        return { label: 'OPD Currently Open', sub: 'Day consultations & dispensary active', active: true }
      }
      return { label: 'Night Shift Active', sub: 'Attending Medical Officer & Ambulance on-call', active: true }
    }
    if (day === 6) {
      // Saturday
      if ((hour >= 9 && hour < 14) || (hour >= 15 && hour < 26)) {
        return { label: 'Saturday OPD Open', sub: 'Doctor consults & treatment room active', active: true }
      }
      return { label: 'On-Call Emergency Active', sub: 'Medical Assistant available', active: false }
    }
    // Sunday
    if ((hour >= 9 && hour < 14) || (hour >= 15 && hour < 20)) {
      return { label: 'Sunday Clinic Open', sub: 'Consultations available', active: true }
    }
    return { label: 'Night Assistant Active', sub: '24/7 Ambulance line open', active: false }
  }, [])

  return (
    <div className="min-h-screen bg-[#0c2827] text-white selection:bg-teal-400 selection:text-slate-900 overflow-x-hidden relative flex flex-col justify-between">
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

      {/* Silky breathing radial ambient spotlight */}
      <motion.div
        animate={{
          scale: [1, 1.08, 1],
          opacity: [0.2, 0.28, 0.2],
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

          {/* Navigation Items (Confirmed: Campus Map, OPD Timings, Facilities, Doctors, Emergency SOS) */}
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
              className="text-xs font-medium text-emerald-300 hover:text-white transition-colors duration-200 px-2.5 py-1.5 rounded-full hover:bg-emerald-500/20 flex items-center gap-1.5 cursor-pointer"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
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

      {/* ── HERO SECTION: 100% UNCHANGED AS IN ATTACHED SCREENSHOT ── */}
      <main className="snap-hero relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 pt-24 sm:pt-28 pb-12 flex flex-col items-center">
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

      {/* ── SECTION 1: STYLIZED CAMPUS SCHEMATIC CARD (#campus-map) ── */}
      <section id="campus-map" className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-20">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-xs font-semibold text-teal-300 mb-3">
            <Compass className="w-3.5 h-3.5" />
            <span>TIET Patiala Campus Navigation</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Find the Health Centre
          </h2>
          <p className="mt-3 text-sm sm:text-base text-teal-100/70 max-w-xl mx-auto">
            Situated centrally on the 250-acre TIET campus. Select your current hostel or hall below for instant walking guidance and route telemetry.
          </p>
        </div>

        {/* ── The 2D Interactive Schematic Map Card ── */}
        <div className="rounded-3xl border border-teal-500/30 bg-gradient-to-b from-[#0e3b38]/95 via-[#0b2f2c]/95 to-[#082220]/95 shadow-[0_25px_80px_rgba(0,0,0,0.6)] backdrop-blur-2xl overflow-hidden p-6 sm:p-8">
          {/* Top Quick Status & Actions Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-teal-500/20">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-teal-600/30 border border-teal-500/40 text-teal-300 flex items-center justify-center shrink-0 shadow-inner">
                <MapPin className="w-5 h-5 text-teal-300 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-bold text-white">TIET Health Centre Building</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                    Live Destination
                  </span>
                </div>
                <p className="text-xs text-teal-200/70">
                  Near Student Activity Centre / Hostels • Coordinates: 30.3566° N, 76.3641° E
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={handleCopyCoords}
                className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-teal-100 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                {copiedCoords ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <CreditCard className="w-3.5 h-3.5 text-teal-300" />}
                <span>{copiedCoords ? 'Coordinates Copied' : '30.3566, 76.3641'}</span>
              </button>

              <a
                href="https://www.google.com/maps/search/?api=1&query=30.3566,76.3641"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open in Google Maps</span>
              </a>

              <a
                href="tel:+918288008122"
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>Call Ambulance (+91 8288008122)</span>
              </a>
            </div>
          </div>

          {/* Interactive Starting Point Selector Pills */}
          <div className="my-6">
            <p className="text-xs font-semibold text-teal-200/80 mb-2.5 uppercase tracking-wider">
              Where are you walking from?
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
              {CAMPUS_LANDMARKS.map((landmark) => {
                const isSelected = selectedLandmarkId === landmark.id
                return (
                  <button
                    key={landmark.id}
                    onClick={() => setSelectedLandmarkId(landmark.id)}
                    className={cn(
                      'p-3 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between',
                      isSelected
                        ? 'bg-teal-500/25 border-teal-400 shadow-[0_0_20px_rgba(20,184,166,0.3)]'
                        : 'bg-white/5 border-white/10 hover:bg-white/10 text-teal-100/70 hover:text-white'
                    )}
                  >
                    <div>
                      <span className="text-[10px] font-medium text-teal-300 block mb-0.5">
                        {landmark.category}
                      </span>
                      <span className="text-xs font-bold text-white block leading-snug">
                        {landmark.name}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] font-semibold text-emerald-300">
                      <span>{landmark.walkingTime}</span>
                      <span className="text-[10px] text-teal-300/70">{landmark.distance}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 2D Vector Schematic Canvas */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Visual Interactive Map Area */}
            <div className="lg:col-span-7 relative h-72 sm:h-96 w-full rounded-2xl bg-[#071d1b] border border-teal-500/20 overflow-hidden p-4">
              {/* Grid Background Lines */}
              <div
                className="absolute inset-0 opacity-15"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, rgba(20,184,166,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(20,184,166,0.2) 1px, transparent 1px)',
                  backgroundSize: '24px 24px',
                }}
              />

              {/* Campus Roads & Walkways Decorative SVGs */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 600 600">
                {/* Main campus ring road */}
                <ellipse cx="300" cy="300" rx="220" ry="200" fill="none" stroke="rgba(20, 184, 166, 0.15)" strokeWidth="18" />
                <ellipse cx="300" cy="300" rx="220" ry="200" fill="none" stroke="rgba(255, 255, 255, 0.2)" strokeWidth="1.5" strokeDasharray="6 6" />

                {/* Central Avenue boulevard crossing */}
                <path d="M 80 300 L 520 300" stroke="rgba(20, 184, 166, 0.2)" strokeWidth="10" />
                <path d="M 300 80 L 300 520" stroke="rgba(20, 184, 166, 0.2)" strokeWidth="10" />

                {/* Animated active path from selected landmark to Health Centre */}
                {selectedLandmark && (
                  <motion.path
                    key={selectedLandmark.id}
                    d={selectedLandmark.pathD}
                    fill="none"
                    stroke="#2dd4bf"
                    strokeWidth="4"
                    strokeDasharray="8 8"
                    initial={{ pathOffset: 0 }}
                    animate={{ pathOffset: -1 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                  />
                )}
              </svg>

              {/* Central Destination Marker: TIET Health Centre */}
              <div
                className="absolute transform -translate-x-1/2 -translate-y-1/2 z-20 cursor-pointer"
                style={{ left: '50%', top: '50%' }}
              >
                <div className="relative flex items-center justify-center">
                  <span className="animate-ping absolute h-12 w-12 rounded-full bg-teal-400 opacity-75"></span>
                  <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-teal-500 to-emerald-400 text-slate-950 font-extrabold flex items-center justify-center shadow-[0_0_25px_rgba(20,184,166,0.8)] border-2 border-white">
                    <Stethoscope className="w-5 h-5 text-slate-950" />
                  </div>
                </div>
                <div className="mt-1 px-2.5 py-0.5 rounded-md bg-slate-900/90 text-[10px] font-bold text-teal-300 border border-teal-500/40 text-center whitespace-nowrap shadow-lg">
                  TIET Health Centre
                </div>
              </div>

              {/* Landmark Pins */}
              {CAMPUS_LANDMARKS.map((lm) => {
                const isSelected = selectedLandmarkId === lm.id
                return (
                  <button
                    key={lm.id}
                    onClick={() => setSelectedLandmarkId(lm.id)}
                    className="absolute transform -translate-x-1/2 -translate-y-1/2 z-20 group cursor-pointer focus:outline-none"
                    style={{ left: `${lm.x}%`, top: `${lm.y}%` }}
                  >
                    <div
                      className={cn(
                        'h-7 w-7 rounded-full flex items-center justify-center font-bold text-[10px] transition-all duration-200 border',
                        isSelected
                          ? 'bg-teal-400 text-slate-950 border-white scale-125 shadow-[0_0_15px_rgba(45,212,191,0.8)]'
                          : 'bg-slate-900/90 text-teal-200 border-teal-500/40 hover:bg-teal-700 hover:text-white'
                      )}
                    >
                      <MapPin className="w-3.5 h-3.5" />
                    </div>
                    <span
                      className={cn(
                        'mt-1 px-2 py-0.5 rounded text-[9px] font-semibold whitespace-nowrap block transition-all shadow-md',
                        isSelected
                          ? 'bg-teal-300 text-slate-950 font-bold scale-105'
                          : 'bg-black/80 text-teal-200/90 group-hover:text-white'
                      )}
                    >
                      {lm.name.split(' (')[0]}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Right: Step-by-Step Walking Guidance Card */}
            <div className="lg:col-span-5 p-5 sm:p-6 rounded-2xl bg-white/5 border border-teal-500/20 flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                  <div>
                    <span className="text-[11px] font-semibold text-teal-300 uppercase tracking-wide">
                      Selected Route
                    </span>
                    <h4 className="text-base font-bold text-white mt-0.5">{selectedLandmark.name}</h4>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-extrabold text-emerald-300 block">
                      {selectedLandmark.walkingTime}
                    </span>
                    <span className="text-xs text-teal-200/70">{selectedLandmark.distance}</span>
                  </div>
                </div>

                <div className="space-y-3 text-xs text-teal-100/80">
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 rounded-lg bg-teal-500/20 text-teal-300 border border-teal-500/30 mt-0.5">
                      <Navigation className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="font-semibold text-white block mb-0.5">Walking Navigation Instructions</span>
                      <p className="leading-relaxed">{selectedLandmark.instruction}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 mt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="font-semibold text-white block mb-0.5">Entrance & Reception Desk</span>
                      <p className="leading-relaxed">
                        Enter via the primary glass foyer. Check-in kiosk and Medical Assistant desk are located immediately on the ground floor lobby.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 mt-0.5">
                      <Ambulance className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="font-semibold text-white block mb-0.5">Cannot Walk? Emergency Dispatch</span>
                      <p className="leading-relaxed">
                        If unable to walk due to fracture, fever, or acute illness, dial the campus ambulance for instant pickup.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between">
                <span className="text-[11px] text-teal-300/70 font-mono">TIET Patiala Campus • Sector 147004</span>
                <a
                  href="tel:+918288008122"
                  className="text-xs font-bold text-rose-300 hover:text-rose-200 flex items-center gap-1"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Call +91 8288008122</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 2: REAL OPD TIMINGS & SHIFTS (#opd-timings) ── */}
      <section id="opd-timings" className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-xs font-semibold text-teal-300 mb-3">
            <Clock className="w-3.5 h-3.5" />
            <span>Official Operating Hours</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            OPD Timings & Duty Shifts
          </h2>
          <p className="mt-3 text-sm sm:text-base text-teal-100/70 max-w-xl mx-auto">
            The TIET Health Centre operates 24 hours a day on weekdays with continuous day consultations, on-duty night physicians, and emergency on-call staffing.
          </p>

          {/* Real-time Open/Closed Badge */}
          <div className="mt-5 inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-teal-500/15 border border-teal-500/30 text-xs font-medium">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="font-bold text-white">{currentOpdStatus.label}</span>
            <span className="text-teal-200/70">• {currentOpdStatus.sub}</span>
          </div>
        </div>

        {/* Timings 4-Card Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {OPD_SCHEDULE.map((sched, idx) => (
            <div
              key={idx}
              className="p-6 rounded-3xl bg-white/[0.04] border border-teal-500/20 hover:border-teal-400/40 transition-all backdrop-blur-md flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">{sched.day}</h3>
                    <p className="text-xs text-teal-300 font-medium">{sched.hours}</p>
                  </div>
                  <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${sched.badgeColor}`}>
                    {sched.status}
                  </span>
                </div>

                <div className="space-y-2.5 mt-4">
                  {sched.details.map((item, dIdx) => (
                    <div key={dIdx} className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-start gap-3">
                      <div className="p-1 rounded bg-teal-500/20 text-teal-300 mt-0.5">
                        <Clock className="w-3 h-3" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-white block">{item.time}</span>
                        <span className="text-[11px] text-teal-100/70">{item.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-teal-200/60">
                <span>TIET Health Regulations</span>
                <span className="text-emerald-400 font-semibold">24/7 Ambulance Synchronized</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── SECTION 3: CORE FACILITIES & CLINICAL SERVICES (#facilities) ── */}
      <section id="facilities" className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-xs font-semibold text-teal-300 mb-3">
            <HeartPulse className="w-3.5 h-3.5" />
            <span>Comprehensive Student & Staff Care</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Facilities & Health Services
          </h2>
          <p className="mt-3 text-sm sm:text-base text-teal-100/70 max-w-xl mx-auto">
            Everything provided inside the TIET Health Centre for complete physical, medical, and emotional well-being.
          </p>
        </div>

        <BentoGrid>
          <BentoCard
            name="Outpatient Department (OPD)"
            description="Daily medical consultations with registered physicians for fever, colds, seasonal allergies, injuries, and routine medical checkups. Free consultations for all enrolled TIET students."
            Icon={Stethoscope}
            className="md:col-span-2"
            cta="View Doctor Duty"
            onCtaClick={() => scrollToElement('#doctors')}
            background={
              <div className="absolute inset-0 bg-gradient-to-br from-teal-500/15 via-transparent to-teal-900/30" />
            }
          />

          <BentoCard
            name="24x7 Campus Ambulance"
            description="Fully equipped emergency ambulance on active standby across campus. Rapid hospital transfer to Rajindra Hospital and Columbia Asia / Manipal Hospital in Patiala."
            Icon={Ambulance}
            className="md:col-span-1"
            cta="Call +91 8288008122"
            onCtaClick={() => (window.location.href = 'tel:+918288008122')}
            background={
              <div className="absolute inset-0 bg-gradient-to-b from-rose-500/15 via-transparent to-transparent" />
            }
          />

          <BentoCard
            name="Institute Dispensary & Pharmacy"
            description="Fully stocked dispensary providing essential formulary medications (analgesics, antibiotics, antiallergics, antacids, ORS) at no cost to university students upon doctor prescription."
            Icon={Pill}
            className="md:col-span-1"
            cta="Check Timings"
            onCtaClick={() => scrollToElement('#opd-timings')}
            background={
              <div className="absolute inset-0 bg-gradient-to-t from-teal-500/15 to-transparent" />
            }
          />

          <BentoCard
            name="Emergency Dressing & Minor Trauma Room"
            description="Equipped for aseptic wound cleansing, suture dressings, first aid, burn care, emergency nebulization for asthma, and immediate tetanus toxoid (TT) administration."
            Icon={Activity}
            className="md:col-span-1"
            cta="Learn More"
            onCtaClick={() => showToast('Minor treatment and dressing room open during all OPD hours.')}
            background={
              <div className="absolute inset-0 bg-gradient-to-tl from-amber-500/15 via-transparent to-transparent" />
            }
          />

          <BentoCard
            name="Observation & Recovery Restrooms"
            description="Clean daycare beds for students suffering from severe acute fever, dehydration requiring IV saline infusions, post-syncopal recovery, or monitoring prior to hospital transfer."
            Icon={Bed}
            className="md:col-span-1"
            cta="Patient Care"
            onCtaClick={() => showToast('Restroom observation beds are supervised by duty nursing staff.')}
            background={
              <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/15 via-transparent to-transparent" />
            }
          />

          <BentoCard
            name="Mental Health Counseling (TICC Integration)"
            description="Direct linkage with the Thapar Institute Counselling Cell (TICC). Confidential clinical psychologist and psychiatric consultations for stress, anxiety, insomnia, and exam fatigue."
            Icon={HeartPulse}
            className="md:col-span-3"
            cta="Confidential Support"
            onCtaClick={() => showToast('TICC counseling is 100% confidential. Book through Health Centre or DoSA.')}
            background={
              <div className="absolute inset-0 bg-gradient-to-r from-teal-500/10 via-transparent to-emerald-500/15" />
            }
          />
        </BentoGrid>
      </section>

      {/* ── SECTION 4: MEDICAL OFFICERS & HEALTHCARE TEAM (#doctors) ── */}
      <section id="doctors" className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-xs font-semibold text-teal-300 mb-3">
            <Users className="w-3.5 h-3.5" />
            <span>Official TIET Healthcare Leadership</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Medical Officers & Leadership
          </h2>
          <p className="mt-3 text-sm sm:text-base text-teal-100/70 max-w-xl mx-auto">
            Experienced medical practitioners and university leadership dedicated to the student body and campus community health.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {MEDICAL_TEAM.map((doc, idx) => (
            <div
              key={idx}
              className="p-6 rounded-3xl bg-white/[0.04] border border-teal-500/25 hover:border-teal-400 transition-all backdrop-blur-md flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-3.5 mb-4">
                  <div className={`h-14 w-14 rounded-2xl ${doc.avatarBg} text-white font-bold text-lg flex items-center justify-center shadow-md shrink-0`}>
                    {doc.avatar}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">{doc.name}</h3>
                    <p className="text-xs text-teal-300 font-semibold">{doc.designation}</p>
                    <span className="text-[10px] text-teal-100/60 block">{doc.qualification}</span>
                  </div>
                </div>

                <div className="space-y-2 mt-4 text-xs text-teal-100/75">
                  <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                    <span className="text-[10px] text-teal-400 font-bold uppercase block mb-0.5">Role</span>
                    <p className="leading-relaxed">{doc.role}</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                    <span className="text-[10px] text-teal-400 font-bold uppercase block mb-0.5">Specialty & Oversight</span>
                    <p className="leading-relaxed">{doc.specialty}</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-teal-200">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>TIET Verified</span>
                </span>
                <span className="text-[11px] text-teal-400/80 font-mono">Room 101 – 105</span>
              </div>
            </div>
          ))}
        </div>

        {/* Nursing & Paramedical Support Staff Bar */}
        <div className="mt-6 p-5 rounded-2xl bg-teal-900/30 border border-teal-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-teal-100/80">
          <div className="flex items-center gap-2.5">
            <Award className="w-4 h-4 text-teal-300 shrink-0" />
            <span>
              <strong>Supporting Healthcare Team:</strong> Qualified nursing officers, registered dispensary pharmacists, lab assistants, and 24x7 ambulance paramedics on rotation.
            </span>
          </div>
          <span className="text-teal-300 font-semibold shrink-0">Official Thapar Roster</span>
        </div>
      </section>

      {/* ── SECTION 5: STUDENT ACADEMIC GUIDELINES & MEDICAL SLIPS ── */}
      <section className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="p-8 sm:p-10 rounded-3xl bg-gradient-to-r from-teal-900/40 via-[#0a302d] to-[#0c2827] border border-teal-500/30 shadow-2xl">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-teal-500/20">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-xs font-semibold text-teal-300 mb-2">
                <FileCheck className="w-3.5 h-3.5" />
                <span>Academic Examination & Leave Regulations</span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-white">
                Medical Certificates & Make-Up Exams
              </h3>
              <p className="text-xs sm:text-sm text-teal-100/70 mt-1 max-w-2xl leading-relaxed">
                Important official guidelines from Thapar Institute regarding medical absences and external treatment endorsements.
              </p>
            </div>

            <button
              onClick={() => showToast('Contact healthcentre@thapar.edu or visit Room 102 for certificate vetting.')}
              className="px-5 py-2.5 rounded-full bg-teal-700 hover:bg-teal-600 text-white font-semibold text-xs transition-all cursor-pointer shadow-md shrink-0 flex items-center gap-1.5"
            >
              <Info className="w-3.5 h-3.5" />
              <span>Vetting Procedure</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
              <div className="flex items-center gap-2.5 mb-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                <h4 className="text-sm font-bold text-white">External Treatment Endorsement</h4>
              </div>
              <p className="text-xs text-teal-100/75 leading-relaxed">
                If treated outside the institute, students must consult a registered MBBS/MD physician. All prescription slips, diagnostic bills, and discharge summaries <strong>must be vetted and signed by the TIET Health Centre Medical Officer</strong> upon return to campus.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
              <div className="flex items-center gap-2.5 mb-2">
                <Calendar className="w-4 h-4 text-teal-400" />
                <h4 className="text-sm font-bold text-white">Make-Up Examination Requests</h4>
              </div>
              <p className="text-xs text-teal-100/75 leading-relaxed">
                Students unable to appear for mid-semester or end-semester examinations due to medical emergencies must submit their Health Centre-verified treatment slips to the <strong>Office of the Dean of Academic Affairs (DoAA)</strong> within university deadlines.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 6: 24/7 EMERGENCY SOS BANNER & ACTION DIRECTORY ── */}
      <section className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="relative rounded-3xl overflow-hidden p-8 sm:p-12 text-center border border-teal-500/30 bg-gradient-to-b from-teal-900/50 via-[#0a2f2c]/90 to-[#07201e] shadow-2xl">
          <BorderBeam duration={8} colorFrom="#2dd4bf" colorTo="#0d9488" />

          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-rose-500/20 border border-rose-500/30 text-xs font-semibold text-rose-300 mb-4">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>24/7 Campus Emergency Medical Hotline</span>
          </div>

          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Need Immediate Medical Assistance?
          </h2>

          <p className="mt-4 text-sm sm:text-base text-teal-100/75 max-w-xl mx-auto leading-relaxed">
            Our campus ambulance and medical assistants are ready 24/7. Call directly, visit the on-campus clinic, or log into the portal.
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

          <div className="mt-8 pt-6 border-t border-white/10 flex flex-wrap items-center justify-center gap-6 text-xs text-teal-200/70">
            <span className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-teal-400" />
              <span>healthcentre@thapar.edu</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-teal-400" />
              <span>TIET Patiala Campus - 147004</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-teal-400" />
              <span>Internal Ext. 108 / 102</span>
            </span>
          </div>
        </div>
      </section>

      {/* ── FOOTER: OFFICIAL INSTITUTIONAL BRANDING ── */}
      <footer className="relative z-10 w-full border-t border-white/10 bg-black/30 backdrop-blur-md py-6 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-medium text-teal-100/70">
          <div className="flex items-center gap-2 text-teal-200">
            <Shield className="w-4 h-4 text-teal-300" />
            <span>Official TIET Campus Health Centre Portal • CampusCare</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6">
            <span>24/7 Ambulance: +91 8288008122</span>
            <span>Email: healthcentre@thapar.edu</span>
            <span>Patiala, Punjab</span>
          </div>

          <div className="text-teal-300/80">
            <span>Thapar Institute of Engineering & Technology</span>
          </div>
        </div>
      </footer>

      {/* ── EMERGENCY SOS MODAL POPUP (Triggered by Navbar SOS button) ── */}
      <AnimatePresence>
        {showEmergencyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md rounded-3xl bg-[#0c2827] border border-rose-500/40 p-6 shadow-2xl text-white relative"
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
                  <p className="text-xs text-rose-300">TIET Health Centre & Campus Security</p>
                </div>
              </div>

              <p className="text-xs text-teal-100/80 mb-5 leading-relaxed">
                For sudden unconsciousness, acute sports trauma, breathing distress, or urgent campus ambulance pickup, click below to dial instantly:
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
                    <Phone className="w-4 h-4 text-teal-300" />
                    <span>Campus Security Control Room</span>
                  </div>
                  <span className="font-mono">0175-2393000</span>
                </a>

                <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-xs text-teal-100/70">
                  <span className="font-semibold text-white block mb-0.5">Location</span>
                  <span>TIET Health Centre Ground Floor, Room 101-105 (30.3566° N, 76.3641° E)</span>
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
