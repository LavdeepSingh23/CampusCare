import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from 'framer-motion'
import {
  Activity,
  Calendar,
  Clock,
  ChevronDown,
  ChevronUp,
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
} from 'lucide-react'
import tiMark from '../../assets/ti-mark.png'
import { GlassFilter, GlassEffect, GlassButton, GlassDock } from '@/components/ui/liquid-glass'

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

const INITIAL_QUEUE = [
  {
    id: 1,
    name: 'Neha Kapoor',
    initials: 'NK',
    rollNo: '102403001',
    waitTime: '3 min',
    status: 'In Consultation',
    statusBadge: 'bg-teal-100 text-teal-800 border-teal-200/80',
    avatarBg: 'bg-teal-700 text-white',
    complaint: 'Seasonal allergic rhinitis & dry cough',
    history: 'Childhood asthma (mild). Penicillin allergy flagged.',
    allergies: ['Penicillin', 'Dust mites'],
    prescriptions: ['Cetirizine 10mg - Once daily at night', 'Salbutamol Inhaler - SOS'],
    vitals: { bp: '118/76', pulse: '72 bpm', temp: '98.4 F', spo2: '99%' },
  },
  {
    id: 2,
    name: 'Nahar Tharron',
    initials: 'NT',
    rollNo: '102403112',
    waitTime: '7 min',
    status: 'Next in Line',
    statusBadge: 'bg-emerald-100 text-emerald-800 border-emerald-200/80',
    avatarBg: 'bg-slate-700 text-white',
    complaint: 'Sports injury — acute ankle sprain during football',
    history: 'Previous ligament strain in 2024. Normal bone alignment.',
    allergies: ['None declared'],
    prescriptions: ['Ibuprofen 400mg - Twice daily after meals', 'Crepe bandage support'],
    vitals: { bp: '124/82', pulse: '80 bpm', temp: '98.6 F', spo2: '98%' },
  },
  {
    id: 3,
    name: 'Natha Thparin',
    initials: 'NP',
    rollNo: '102403205',
    waitTime: '14 min',
    status: 'Waiting',
    statusBadge: 'bg-amber-100 text-amber-800 border-amber-200/80',
    avatarBg: 'bg-amber-700 text-white',
    complaint: 'Routine hostel medical clearance & vision test',
    history: 'Normal medical fitness. Myopia with -1.5D correction.',
    allergies: ['Sulfa drugs'],
    prescriptions: ['Multivitamin daily (30 days)'],
    vitals: { bp: '116/74', pulse: '68 bpm', temp: '98.5 F', spo2: '99%' },
  },
  {
    id: 4,
    name: 'Matha Naparin',
    initials: 'MN',
    rollNo: '102403348',
    waitTime: '20 min',
    status: 'Waiting',
    statusBadge: 'bg-amber-100 text-amber-800 border-amber-200/80',
    avatarBg: 'bg-indigo-700 text-white',
    complaint: 'Contact dermatitis on wrist from watch strap',
    history: 'Sensitive skin. No prior hospitalizations.',
    allergies: ['Latex'],
    prescriptions: ['Hydrocortisone cream 1% - Apply BID'],
    vitals: { bp: '120/78', pulse: '76 bpm', temp: '98.2 F', spo2: '99%' },
  },
]

export default function LandingPage() {
  const navigate = useNavigate()

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

  // Interactive Tab State inside the macOS Window (21st.dev Tab Switcher)
  const [activeWindowTab, setActiveWindowTab] = useState('queue') // 'queue' | 'doctor' | 'rfid'

  // Queue & Patient State
  const [patients, setPatients] = useState(INITIAL_QUEUE)
  const [selectedPatientId, setSelectedPatientId] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [openAccordion, setOpenAccordion] = useState('history')
  const [actionAlert, setActionAlert] = useState(null)
  const [rfidTapped, setRfidTapped] = useState(false)

  const selectedPatient = patients.find((p) => p.id === selectedPatientId) || patients[0]

  // Filtered queue
  const filteredPatients = patients.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.rollNo.includes(searchQuery)
  )

  // Interactive: Call Next Patient action
  function handleCallNext() {
    const nextWaiting = patients.find(
      (p) => p.status === 'Next in Line' || p.status === 'Waiting'
    )
    if (nextWaiting) {
      setPatients((prev) =>
        prev.map((p) => {
          if (p.id === nextWaiting.id) {
            return {
              ...p,
              status: 'In Consultation',
              statusBadge: 'bg-teal-100 text-teal-800 border-teal-200/80',
            }
          }
          if (p.status === 'In Consultation') {
            return {
              ...p,
              status: 'Completed',
              statusBadge: 'bg-slate-100 text-slate-700 border-slate-200',
            }
          }
          return p
        })
      )
      setSelectedPatientId(nextWaiting.id)
      setActionAlert(`Calling ${nextWaiting.name} (Roll #${nextWaiting.rollNo}) to Room 104`)
      setTimeout(() => setActionAlert(null), 3500)
    } else {
      setActionAlert('All checked-in students have been called!')
      setTimeout(() => setActionAlert(null), 3000)
    }
  }

  // Interactive: Simulate RFID Tap Check-In
  function handleSimulateRfidTap() {
    setRfidTapped(true)
    const newStudent = {
      id: Date.now(),
      name: 'Simar Singh',
      initials: 'SS',
      rollNo: '102403499',
      waitTime: '25 min',
      status: 'Waiting',
      statusBadge: 'bg-amber-100 text-amber-800 border-amber-200/80',
      avatarBg: 'bg-teal-800 text-white',
      complaint: 'RFID Kiosk Auto Check-In — General Consultation',
      history: 'First campus medical visit this semester.',
      allergies: ['None declared'],
      prescriptions: ['Pending doctor review'],
      vitals: { bp: '120/80', pulse: '72 bpm', temp: '98.6 F', spo2: '99%' },
    }
    setPatients((prev) => [...prev, newStudent])
    setActionAlert('RFID Card Tapped! Simar Singh joined live queue at #' + (patients.length + 1))
    setTimeout(() => {
      setRfidTapped(false)
      setActionAlert(null)
    }, 4000)
  }

  return (
    <div className="min-h-screen bg-[#0c2827] text-white selection:bg-teal-400 selection:text-slate-900 overflow-x-hidden relative flex flex-col justify-between">
      {/* ── Liquid Glass SVG Turbulence & Refraction Filter ── */}
      <GlassFilter />

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

      {/* ── Fixed Top-Left: TI Logo ── */}
      <motion.div
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        onClick={() => navigate('/')}
        className="fixed top-5 sm:top-6 left-5 sm:left-8 z-40 cursor-pointer group flex items-center"
      >
        <img
          src={tiMark}
          alt="TI Logo"
          className="h-9 sm:h-10 w-auto object-contain drop-shadow-md transition-opacity duration-300 group-hover:opacity-90"
        />
      </motion.div>

      {/* ── Fixed Top-Right: CampusCare Branding ── */}
      <motion.div
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        onClick={() => navigate('/')}
        className="fixed top-5 sm:top-6 right-5 sm:right-8 z-40 cursor-pointer group flex items-center gap-2 select-none"
      >
        <span className="text-base sm:text-lg font-bold tracking-tight text-white/90 group-hover:text-white transition-colors duration-300">
          CampusCare
        </span>
      </motion.div>

      {/* ── Animated Floating Navbar (21st.dev AnimatedNavFramer) ── */}
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
              'flex items-center gap-1 sm:gap-2 pr-2.5',
              !isNavExpanded && 'pointer-events-none'
            )}
          >
            <motion.button
              variants={itemVariants}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => {
                e.stopPropagation()
                setActiveWindowTab('queue')
                document.getElementById('browser-showcase')?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="text-xs font-medium text-teal-100/80 hover:text-white transition-colors duration-200 px-2.5 py-1.5 rounded-full hover:bg-white/10 cursor-pointer"
            >
              Live Queue
            </motion.button>

            <motion.button
              variants={itemVariants}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => {
                e.stopPropagation()
                setActiveWindowTab('doctor')
                document.getElementById('browser-showcase')?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="text-xs font-medium text-teal-100/80 hover:text-white transition-colors duration-200 px-2.5 py-1.5 rounded-full hover:bg-white/10 cursor-pointer"
            >
              Doctor Console
            </motion.button>

            <motion.button
              variants={itemVariants}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => {
                e.stopPropagation()
                setActiveWindowTab('rfid')
                document.getElementById('browser-showcase')?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="text-xs font-medium text-teal-100/80 hover:text-white transition-colors duration-200 px-2.5 py-1.5 rounded-full hover:bg-white/10 cursor-pointer"
            >
              RFID Kiosk
            </motion.button>

            <motion.button
              variants={itemVariants}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => {
                e.stopPropagation()
                setActionAlert('Emergency SOS line active: Medical Wing Ext. 108')
                setTimeout(() => setActionAlert(null), 3500)
              }}
              className="text-xs font-medium text-teal-200 hover:text-white transition-colors duration-200 px-2.5 py-1.5 rounded-full hover:bg-white/10 flex items-center gap-1.5 cursor-pointer"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Emergency</span>
            </motion.button>

            {/* Sign In Action Button */}
            <motion.button
              variants={itemVariants}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              onClick={(e) => {
                e.stopPropagation()
                navigate('/user_login')
              }}
              className="ml-1 px-3.5 py-1.5 rounded-full text-xs font-semibold text-slate-950 bg-white hover:bg-slate-100 shadow-sm transition-all duration-200 cursor-pointer"
            >
              Sign in
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
        {actionAlert && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-slate-900/95 text-teal-200 text-xs font-medium border border-teal-500/40 shadow-2xl backdrop-blur-md flex items-center gap-2"
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-400 shrink-0" />
            <span>{actionAlert}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Hero Section (with top padding for floating nav) ── */}
      <main className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 pt-24 sm:pt-28 pb-12 flex flex-col items-center">
        {/* Institutional Pill Badge (Strictly NO emojis) */}
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
          className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-center text-white max-w-4xl leading-[1.12]"
        >
          One queue. Every patient's full picture.
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-4 text-base sm:text-lg text-teal-100/80 text-center max-w-2xl font-normal leading-relaxed"
        >
          Smart campus healthcare — appointments, prescriptions, emergency services, all digitized.
        </motion.p>

        {/* ── Liquid Glass Action Prompt ── */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="mt-7 sm:mt-8 w-full max-w-md flex justify-center"
        >
          <GlassButton
            onClick={() => navigate('/user_login')}
            className="border border-white/25 bg-white/10 hover:bg-white/15 shadow-2xl"
          >
            <div className="flex items-center gap-3 text-xs sm:text-sm font-medium text-white tracking-wide">
              <span className="h-2 w-2 rounded-full bg-teal-300 animate-pulse" />
              <span>How can CampusCare help you today?</span>
              <ArrowRight className="w-3.5 h-3.5 text-teal-300 ml-1" />
            </div>
          </GlassButton>
        </motion.div>

        {/* ── Elevated Safari/macOS Window Showcase (Front-Facing, Smooth & Crisp) ── */}
        <div
          id="browser-showcase"
          className="relative w-full max-w-5xl mt-12 mb-8 flex flex-col items-center"
        >
          {/* Ambient Diffuse Teal Aura behind window */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5/6 h-5/6 bg-teal-400/25 blur-[120px] rounded-full pointer-events-none" />

          {/* ── Elevated Safari / macOS Window Container (Silky Floating Hover Motion) ── */}
          <motion.div
            animate={{ y: [-3, 3, -3] }}
            transition={{
              duration: 6.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="w-full rounded-2xl border border-white/25 bg-slate-50/95 shadow-[0_25px_80px_-15px_rgba(0,0,0,0.65),0_0_50px_rgba(20,184,166,0.25)] backdrop-blur-2xl overflow-hidden text-slate-800 transition-all duration-300"
          >
            {/* macOS Window Title Bar */}
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200/80">
              {/* Traffic Light Window Controls */}
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-[#FF5F56] border border-[#E0443E]/60 shadow-xs" />
                <div className="h-3 w-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]/60 shadow-xs" />
                <div className="h-3 w-3 rounded-full bg-[#27C93F] border border-[#1AAB29]/60 shadow-xs" />
              </div>

              {/* Centered Pill Address Bar */}
              <div className="flex items-center gap-2 px-4 py-1 rounded-full bg-slate-100/90 border border-slate-200 text-xs text-slate-600 font-medium">
                <Lock className="w-3 h-3 text-emerald-600" />
                <span className="text-[11px]">campuscare.thapar.edu/live-console</span>
              </div>

              {/* View Control Tabs (21st.dev Animated Sliding Tab Switcher) */}
              <div className="flex items-center gap-0.5 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs relative">
                {[
                  { id: 'queue', label: 'Live Queue' },
                  { id: 'doctor', label: 'Doctor Console' },
                  { id: 'rfid', label: 'RFID Kiosk' },
                ].map((tab) => {
                  const isActive = activeWindowTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveWindowTab(tab.id)}
                      className={cn(
                        'relative px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors duration-200 cursor-pointer z-10',
                        isActive ? 'text-teal-950 font-bold' : 'text-slate-500 hover:text-slate-800'
                      )}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="activeWindowTabIndicator"
                          className="absolute inset-0 bg-white rounded-md shadow-xs"
                          transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                        />
                      )}
                      <span className="relative z-10">{tab.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Tab Content Area with Smooth Crossfade Animation */}
            <AnimatePresence mode="wait">
              {/* ── TAB 1: LIVE QUEUE VIEW ── */}
              {activeWindowTab === 'queue' && (
                <motion.div
                  key="queue-view"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="p-4 sm:p-5 flex flex-col lg:flex-row gap-4"
                >
                  {/* Left Mini Sidebar */}
                  <div className="w-full lg:w-48 bg-white rounded-xl p-3.5 border border-slate-200/80 flex flex-col justify-between shrink-0 shadow-xs">
                    <div>
                      <div className="flex items-center gap-2 mb-3.5">
                        <div className="h-6 w-6 rounded-md bg-teal-700 flex items-center justify-center text-white shadow-xs">
                          <Stethoscope className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs font-bold text-slate-900 tracking-tight">
                          CampusCare
                        </span>
                      </div>

                      {/* Active Doctor Profile Badge */}
                      <div className="flex items-center gap-2.5 p-2 rounded-lg bg-teal-50/70 border border-teal-100/80 mb-3">
                        <div className="h-8 w-8 rounded-full bg-teal-700 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
                          NK
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-xs font-semibold text-slate-900 truncate">Dr. Neha Kapoor</p>
                          <p className="text-[10px] text-teal-700">Room 104 • General</p>
                        </div>
                      </div>

                      <div className="space-y-1 text-xs">
                        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-teal-700 text-white font-medium shadow-xs">
                          <div className="flex items-center gap-2">
                            <Activity className="w-3.5 h-3.5" />
                            <span>OPD Queue</span>
                          </div>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-teal-800 text-teal-100">
                            {filteredPatients.length}
                          </span>
                        </div>
                        <div
                          onClick={() => setActiveWindowTab('doctor')}
                          className="flex items-center justify-between px-2.5 py-1.5 rounded-md text-slate-600 hover:bg-slate-50 font-medium cursor-pointer transition-colors duration-200"
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5 text-slate-400" />
                            <span>Prescriptions</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Working Call Next Action */}
                    <div className="pt-3 mt-3 border-t border-slate-100">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={handleCallNext}
                        className="w-full py-2 px-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors duration-200 cursor-pointer shadow-sm"
                      >
                        <PhoneCall className="w-3.5 h-3.5" />
                        <span>Call Next Student</span>
                      </motion.button>
                    </div>
                  </div>

                  {/* Center Table: Patient Queue */}
                  <div className="flex-1 bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs flex flex-col justify-between">
                    <div>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2.5 border-b border-slate-100">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-900">Today's Consultation Line</h3>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200/50">
                              Live Sync
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400">Click any student to inspect medical history</p>
                        </div>

                        {/* Working Filter Input */}
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200 text-slate-600 text-xs focus-within:border-teal-500 focus-within:bg-white transition-all duration-200">
                          <Search className="w-3 h-3 text-slate-400" />
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Filter name / roll #..."
                            className="bg-transparent text-slate-800 text-[11px] outline-hidden placeholder:text-slate-400 w-28 sm:w-32"
                          />
                        </div>
                      </div>

                      {/* Patient Rows with Buttery Hover Transitions */}
                      <div className="space-y-1.5">
                        {filteredPatients.length === 0 ? (
                          <div className="text-center py-8 text-slate-400 text-xs">
                            No student record matching "{searchQuery}"
                          </div>
                        ) : (
                          filteredPatients.map((patient) => {
                            const isSelected = patient.id === selectedPatientId
                            return (
                              <motion.div
                                key={patient.id}
                                whileHover={{ x: 2 }}
                                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                onClick={() => setSelectedPatientId(patient.id)}
                                className={cn(
                                  'flex items-center justify-between p-2.5 rounded-lg text-xs transition-all duration-200 cursor-pointer border',
                                  isSelected
                                    ? 'bg-teal-50/90 border-teal-300 shadow-xs'
                                    : 'bg-white hover:bg-slate-50/80 border-slate-100'
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <div
                                    className={`h-7 w-7 rounded-full ${patient.avatarBg} font-semibold text-[11px] flex items-center justify-center shrink-0 shadow-xs`}
                                  >
                                    {patient.initials}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <p className="font-semibold text-slate-900 leading-tight">
                                        {patient.name}
                                      </p>
                                      {isSelected && (
                                        <span className="text-[9px] px-1 py-0.2 rounded bg-teal-700 text-white font-medium">
                                          Inspecting
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-slate-400">Roll: {patient.rollNo}</p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-3">
                                  <span className="text-[11px] text-slate-500 font-medium">
                                    {patient.waitTime}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${patient.statusBadge}`}
                                  >
                                    {patient.status}
                                  </span>
                                </div>
                              </motion.div>
                            )
                          })
                        )}
                      </div>
                    </div>

                    <div className="pt-2 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                      <span>Active student: <strong className="text-slate-700">{selectedPatient.name}</strong></span>
                      <button
                        onClick={handleCallNext}
                        className="text-teal-700 font-semibold hover:underline cursor-pointer"
                      >
                        Call Next →
                      </button>
                    </div>
                  </div>

                  {/* Right Drawer: Selected Patient Medical Chart (Smooth Morphing) */}
                  <div className="w-full lg:w-56 bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-xs flex flex-col justify-between shrink-0">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={selectedPatient.id}
                        initial={{ opacity: 0, x: 6 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -6 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <div className="flex items-center gap-2.5 mb-3 pb-2.5 border-b border-slate-100">
                          <div
                            className={`h-8 w-8 rounded-full ${selectedPatient.avatarBg} font-bold text-xs flex items-center justify-center shrink-0 shadow-xs`}
                          >
                            {selectedPatient.initials}
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-xs font-bold text-slate-900 truncate">
                              {selectedPatient.name}
                            </p>
                            <p className="text-[10px] text-slate-400">Roll: {selectedPatient.rollNo}</p>
                          </div>
                        </div>

                        {/* Vitals */}
                        <div className="grid grid-cols-3 gap-1 bg-slate-50 p-1.5 rounded-md text-center text-[10px] text-slate-600 mb-2.5 border border-slate-100">
                          <div>
                            <span className="text-slate-400 block text-[9px]">BP</span>
                            <span className="font-bold">{selectedPatient.vitals.bp}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px]">Pulse</span>
                            <span className="font-bold">{selectedPatient.vitals.pulse}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px]">SpO2</span>
                            <span className="font-bold">{selectedPatient.vitals.spo2}</span>
                          </div>
                        </div>

                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                          Clinical Chart
                        </p>

                        {/* Expandable Accordions with Smooth Height Transitions */}
                        <div className="space-y-1 text-xs">
                          {/* History */}
                          <div className="border border-slate-100 rounded-md overflow-hidden bg-slate-50 transition-colors duration-200">
                            <button
                              onClick={() =>
                                setOpenAccordion((prev) => (prev === 'history' ? null : 'history'))
                              }
                              className="w-full flex items-center justify-between p-2 text-slate-700 font-medium text-[11px] hover:bg-slate-100/70 transition-colors cursor-pointer"
                            >
                              <span>Diagnosis & Complaint</span>
                              <motion.div
                                animate={{ rotate: openAccordion === 'history' ? 180 : 0 }}
                                transition={{ duration: 0.2 }}
                              >
                                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                              </motion.div>
                            </button>
                            <AnimatePresence initial={false}>
                              {openAccordion === 'history' && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                                  className="overflow-hidden"
                                >
                                  <div className="p-2 pt-0 text-[10px] text-slate-600 leading-relaxed border-t border-slate-100">
                                    <p className="font-medium text-teal-800 mb-0.5">Complaint:</p>
                                    <p className="mb-1">{selectedPatient.complaint}</p>
                                    <p className="font-medium text-slate-700 mb-0.5">Medical Notes:</p>
                                    <p>{selectedPatient.history}</p>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>

                          {/* Allergies */}
                          <div className="border border-slate-100 rounded-md overflow-hidden bg-slate-50 transition-colors duration-200">
                            <button
                              onClick={() =>
                                setOpenAccordion((prev) => (prev === 'allergies' ? null : 'allergies'))
                              }
                              className="w-full flex items-center justify-between p-2 text-slate-700 font-medium text-[11px] hover:bg-slate-100/70 transition-colors cursor-pointer"
                            >
                              <span>Allergies ({selectedPatient.allergies.length})</span>
                              <motion.div
                                animate={{ rotate: openAccordion === 'allergies' ? 180 : 0 }}
                                transition={{ duration: 0.2 }}
                              >
                                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                              </motion.div>
                            </button>
                            <AnimatePresence initial={false}>
                              {openAccordion === 'allergies' && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                                  className="overflow-hidden"
                                >
                                  <div className="p-2 pt-0 text-[10px] text-slate-600 space-y-0.5 border-t border-slate-100">
                                    {selectedPatient.allergies.map((allergy, idx) => (
                                      <div key={idx} className="flex items-center gap-1 text-red-700 font-medium">
                                        <span className="h-1 w-1 rounded-full bg-red-500" />
                                        <span>{allergy}</span>
                                      </div>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>

                          {/* Active Prescriptions */}
                          <div className="border border-slate-100 rounded-md overflow-hidden bg-slate-50 transition-colors duration-200">
                            <button
                              onClick={() =>
                                setOpenAccordion((prev) => (prev === 'rx' ? null : 'rx'))
                              }
                              className="w-full flex items-center justify-between p-2 text-slate-700 font-medium text-[11px] hover:bg-slate-100/70 transition-colors cursor-pointer"
                            >
                              <span>Active Prescriptions</span>
                              <motion.div
                                animate={{ rotate: openAccordion === 'rx' ? 180 : 0 }}
                                transition={{ duration: 0.2 }}
                              >
                                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                              </motion.div>
                            </button>
                            <AnimatePresence initial={false}>
                              {openAccordion === 'rx' && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                                  className="overflow-hidden"
                                >
                                  <div className="p-2 pt-0 text-[10px] text-slate-600 space-y-1 border-t border-slate-100">
                                    {selectedPatient.prescriptions.map((rx, idx) => (
                                      <div key={idx} className="flex items-start gap-1">
                                        <Check className="w-3 h-3 text-teal-600 shrink-0 mt-0.5" />
                                        <span>{rx}</span>
                                      </div>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      </motion.div>
                    </AnimatePresence>

                    <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 text-[10px] text-teal-700 font-semibold">
                        <CheckCircle2 className="w-3 h-3 text-teal-600" />
                        <span>TIET Verified</span>
                      </span>
                      <span className="text-[10px] text-slate-400">RFID Verified</span>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── TAB 2: DOCTOR CONSOLE VIEW ── */}
              {activeWindowTab === 'doctor' && (
                <motion.div
                  key="doctor-view"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="p-5 sm:p-6 bg-white"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Dr. Neha Kapoor — Consultation Suite
                      </h3>
                      <p className="text-xs text-slate-500">
                        Department of General Medicine • Room 104 • Shift: 09:00 - 17:00
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => navigate('/user_login')}
                        className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Open Full Doctor Portal →
                      </motion.button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
                    <div className="p-4 rounded-xl bg-teal-50/60 border border-teal-100">
                      <p className="text-xs font-semibold text-teal-800 mb-1">Active Consultation</p>
                      <p className="text-sm font-bold text-slate-900">{selectedPatient.name}</p>
                      <p className="text-xs text-slate-500 mb-3">Roll #: {selectedPatient.rollNo}</p>
                      <div className="text-xs text-slate-700 bg-white p-2.5 rounded-lg border border-teal-100/80">
                        <span className="font-semibold text-teal-900">Diagnosis: </span>
                        {selectedPatient.complaint}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                      <p className="text-xs font-semibold text-slate-800 mb-1">Queue Throughput</p>
                      <p className="text-2xl font-bold text-slate-900">18</p>
                      <p className="text-xs text-slate-500 mt-0.5">Students seen today</p>
                      <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
                        <Zap className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Avg 4.2 min per consult</span>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                      <p className="text-xs font-semibold text-slate-800 mb-1">E-Prescription Desk</p>
                      <div className="space-y-1.5 mt-2">
                        <div className="p-2 rounded bg-white border border-slate-200 text-xs flex justify-between items-center">
                          <span className="font-medium text-slate-800">Paracetamol 500mg</span>
                          <span className="text-[10px] text-teal-700 font-semibold bg-teal-50 px-1.5 py-0.5 rounded">TID</span>
                        </div>
                        <div className="p-2 rounded bg-white border border-slate-200 text-xs flex justify-between items-center">
                          <span className="font-medium text-slate-800">Cetirizine 10mg</span>
                          <span className="text-[10px] text-teal-700 font-semibold bg-teal-50 px-1.5 py-0.5 rounded">HS</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── TAB 3: RFID KIOSK CHECK-IN SIMULATION ── */}
              {activeWindowTab === 'rfid' && (
                <motion.div
                  key="rfid-view"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="p-6 sm:p-8 bg-white flex flex-col items-center text-center"
                >
                  <div className="h-14 w-14 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center mb-4 shadow-sm">
                    <CreditCard className="w-7 h-7" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-1">
                    Contactless RFID Kiosk Simulation
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mb-6 leading-relaxed">
                    Students simply tap their physical TIET University ID card at the Health Center turnstile or kiosk to automatically queue for OPD without waiting in paper lines.
                  </p>

                  <div className="w-full max-w-sm p-4 rounded-xl bg-slate-50 border border-slate-200 text-left mb-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-700">Digital Health ID</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                        RFID Tag: Active
                      </span>
                    </div>
                    <p className="text-sm font-bold text-slate-900">Simar Singh</p>
                    <p className="text-xs text-slate-500">Roll No: 102403499 • Computer Science</p>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    onClick={handleSimulateRfidTap}
                    disabled={rfidTapped}
                    className="px-6 py-2.5 rounded-full bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-md"
                  >
                    <Zap className="w-4 h-4 text-teal-200" />
                    <span>{rfidTapped ? 'Processing RFID Tap...' : 'Tap TIET Smart Card Now'}</span>
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </main>

      {/* ── Bottom Trust & Institutional Bar (Strictly NO emojis) ── */}
      <footer className="relative z-10 w-full border-t border-white/10 bg-black/20 backdrop-blur-md py-4 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-medium text-teal-100/70">
          <div className="flex items-center gap-2 text-teal-200">
            <Shield className="w-4 h-4 text-teal-300" />
            <span>Official TIET Campus Health Portal</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
              Trusted by 500+ Thapar students
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
              4 specialist doctors
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
              RFID-enabled check-in
            </span>
          </div>

          <div className="text-teal-300/80">
            <span>Thapar Institute</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
