import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Eye, EyeOff, Stethoscope, Building2, ArrowLeft, CheckCircle2, AlertCircle, GraduationCap, X, Loader2, UserCheck } from 'lucide-react'
import tiMark from '../../assets/ti-mark.png'
import campusCareLogo from '../../assets/campuscare-logo.png'

// --- HELPER COMPONENTS (ICONS) ---

const GoogleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 48 48">
    <path
      fill="#FFC107"
      d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s12-5.373 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-2.641-.21-5.236-.611-7.743z"
    />
    <path
      fill="#FF3D00"
      d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.022 35.026 44 30.038 44 24c0-2.641-.21-5.236-.611-7.743z"
    />
  </svg>
)

// --- SUB-COMPONENTS ---

const GlassInputWrapper = ({ children }) => (
  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 backdrop-blur-sm transition-all focus-within:border-teal-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-teal-500/20">
    {children}
  </div>
)

const TestimonialCard = ({ avatarText, name, handle, text, isSpecial }) => (
  <div className="rounded-3xl p-5 shadow-xl text-white bg-white/10 backdrop-blur-md border border-white/20 transition-all hover:bg-white/15">
    <div className="flex items-start gap-3">
      <div className="h-10 w-10 rounded-2xl bg-teal-800 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-sm border border-white/20">
        {avatarText}
      </div>
      <div className="text-sm leading-snug">
        <p className="flex items-center gap-1 font-semibold text-white">
          {name}
          {isSpecial && <CheckCircle2 className="w-3.5 h-3.5 text-teal-300" />}
        </p>
        <p className="text-xs text-teal-100/70">{handle}</p>
        <p className="mt-1.5 text-xs text-white/85 leading-relaxed">{text}</p>
      </div>
    </div>
  </div>
)

// --- MAIN LOGIN COMPONENT ---

export default function Login() {
  const { login, loginReceptionist, loginStudentGoogle, error, setError, loading } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState('doctor') // 'doctor' | 'student' | 'receptionist'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [keepSignedIn, setKeepSignedIn] = useState(false)

  // Receptionist Portal State
  const [receptionEmail, setReceptionEmail] = useState('reception@thapar.edu')
  const [receptionPassword, setReceptionPassword] = useState('reception123')
  const [showReceptionPassword, setShowReceptionPassword] = useState(false)
  const [receptionKeepSignedIn, setReceptionKeepSignedIn] = useState(false)

  const [rollNumber, setRollNumber] = useState('')
  const [rollError, setRollError] = useState('')

  // Google Student Authorization State
  const [googleError, setGoogleError] = useState('')
  const [googleLoading, setGoogleLoading] = useState(false)
  const [showSandboxModal, setShowSandboxModal] = useState(false)
  const [customTestEmail, setCustomTestEmail] = useState('')

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
  const googleBtnRef = useRef(null)
  const [gisLoaded, setGisLoaded] = useState(false)

  // Initialize and render Google Identity Services
  useEffect(() => {
    if (!googleClientId) return

    function renderGis() {
      if (!window.google?.accounts?.id) return
      try {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleCredentialResponse,
          hosted_domain: 'thapar.edu',
          auto_select: false,
        })
        if (googleBtnRef.current) {
          googleBtnRef.current.innerHTML = ''
          window.google.accounts.id.renderButton(googleBtnRef.current, {
            theme: 'outline',
            size: 'large',
            type: 'standard',
            text: 'continue_with',
            shape: 'pill',
            logo_alignment: 'left',
            width: 340,
          })
          setGisLoaded(true)
        }
        // Also trigger One Tap prompt if eligible
        window.google.accounts.id.prompt(() => {})
      } catch (e) {
        console.error('Google GIS render error', e)
      }
    }

    if (!window.google?.accounts?.id) {
      const scriptId = 'google-gsi-client'
      let script = document.getElementById(scriptId)
      if (!script) {
        script = document.createElement('script')
        script.id = scriptId
        script.src = 'https://accounts.google.com/gsi/client'
        script.async = true
        script.defer = true
        script.onload = renderGis
        document.body.appendChild(script)
      } else {
        script.addEventListener('load', renderGis)
      }
    } else {
      renderGis()
    }
  }, [googleClientId, mode])

  function handleSubmit(e) {
    e.preventDefault()
    login(email, password).then((success) => {
      if (success) navigate('/doctor_dashboard')
    })
  }

  async function handleReceptionistSubmit(e) {
    e.preventDefault()
    setError('')
    const success = await loginReceptionist(receptionEmail, receptionPassword)
    if (success) {
      navigate('/reception_dashboard')
    }
  }

  function handleAutoFillReceptionist() {
    setReceptionEmail('reception@thapar.edu')
    setReceptionPassword('reception123')
    setError('')
  }

  async function handleGoogleCredentialResponse(response) {
    if (!response?.credential) return
    setGoogleLoading(true)
    setGoogleError('')
    try {
      const student = await loginStudentGoogle(response.credential)
      if (student) {
        navigate(`/student_dashboard/${student.rollNumber}`)
      }
    } catch (err) {
      setGoogleError(err.message || 'Google sign-in failed. Please ensure you use an official @thapar.edu account.')
    } finally {
      setGoogleLoading(false)
    }
  }

  async function handleSimulatedSignIn(simulatedUser) {
    setGoogleLoading(true)
    setGoogleError('')
    setShowSandboxModal(false)
    try {
      const student = await loginStudentGoogle(null, simulatedUser)
      if (student) {
        navigate(`/student_dashboard/${student.rollNumber}`)
      }
    } catch (err) {
      setGoogleError(err.message || 'Domain rejected. Only @thapar.edu accounts are permitted.')
    } finally {
      setGoogleLoading(false)
    }
  }

  function handleGoogleSignInClick() {
    setGoogleError('')
    if (googleClientId && window.google?.accounts?.id) {
      try {
        window.google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            setShowSandboxModal(true)
          }
        })
      } catch {
        setShowSandboxModal(true)
      }
    } else {
      setShowSandboxModal(true)
    }
  }

  function handleStudentSubmit(e) {
    e.preventDefault()
    const trimmed = rollNumber.trim().toUpperCase()
    if (!trimmed) {
      setRollError('Enter your roll number to continue.')
      return
    }
    setRollError('')
    navigate(`/student_dashboard/${trimmed}`)
  }

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-white">
      {/* ── Left Column: Sign-in Form ── */}
      <section className="flex-1 flex flex-col justify-between p-6 sm:p-10 lg:p-14 overflow-y-auto">
        {/* Top Header: Brand & Back to Home */}
        <div className="flex items-center justify-between mb-8">
          <div
            onClick={() => navigate('/')}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <img
              src={tiMark}
              alt="TI Logo"
              className="h-8 w-auto object-contain transition-transform group-hover:scale-105"
            />
            <span className="text-lg font-bold tracking-tight text-slate-900">
              CampusCare
            </span>
          </div>

          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-xs font-medium text-slate-500 hover:text-slate-900 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to home</span>
          </button>
        </div>

        {/* Center Form Container */}
        <div className="w-full max-w-md mx-auto my-auto py-4">
          <div className="flex flex-col gap-6">
            {/* Title & Description */}
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
                Welcome
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {mode === 'doctor'
                  ? "Sign in to CampusCare's Doctor & Medical Staff Console"
                  : mode === 'receptionist'
                  ? "Sign in to CampusCare's Front Desk & Reception Console"
                  : 'Look up your live prescriptions and medical history'}
              </p>
            </div>

            {/* Mode Toggle (Doctor / Student / Receptionist) */}
            <div className="inline-flex bg-slate-100 rounded-full p-1 self-start border border-slate-200/80 flex-wrap gap-1 sm:gap-0">
              <button
                type="button"
                onClick={() => {
                  setMode('doctor')
                  setError('')
                }}
                className={`px-4 sm:px-5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  mode === 'doctor'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Doctor Portal
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('student')
                  setError('')
                }}
                className={`px-4 sm:px-5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  mode === 'student'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Student Portal
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('receptionist')
                  setError('')
                }}
                className={`px-4 sm:px-5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  mode === 'receptionist'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Receptionist Portal
              </button>
            </div>

            {/* Error Message */}
            {(mode === 'doctor' || mode === 'receptionist') && error && (
              <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-xs text-red-700 font-medium">
                {error}
              </div>
            )}

            {/* ── RECEPTIONIST FORM ── */}
            {mode === 'receptionist' && (
              <form className="space-y-4" onSubmit={handleReceptionistSubmit}>
                {/* Institutional Badge */}
                <div className="rounded-2xl border border-teal-500/25 bg-teal-50/70 p-3.5 flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-teal-800 text-white shrink-0 mt-0.5">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-teal-950">
                      Front Desk & Dispensary Terminal
                    </h3>
                    <p className="text-[11px] text-teal-800/80 leading-relaxed mt-0.5">
                      TIET Health Centre patient intake, live OPD queue management, and RFID dispensing.
                    </p>
                  </div>
                </div>

                {/* Dummy Credential Quick Pill */}
                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
                  <div className="leading-tight">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Dummy Credentials</span>
                    <span className="font-mono text-slate-700 text-xs font-semibold">reception@thapar.edu • reception123</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAutoFillReceptionist}
                    className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200/70 transition-colors cursor-pointer shadow-xs"
                  >
                    Auto-fill
                  </button>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">
                    Receptionist / Front Desk Email
                  </label>
                  <GlassInputWrapper>
                    <input
                      name="receptionEmail"
                      type="email"
                      required
                      autoFocus
                      value={receptionEmail}
                      onChange={(e) => setReceptionEmail(e.target.value)}
                      placeholder="reception@thapar.edu"
                      className="w-full bg-transparent text-sm p-4 rounded-2xl focus:outline-none text-slate-900 placeholder:text-slate-400"
                    />
                  </GlassInputWrapper>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Front desk console for student intake and dispensary management.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">
                    Password
                  </label>
                  <GlassInputWrapper>
                    <div className="relative">
                      <input
                        name="receptionPassword"
                        type={showReceptionPassword ? 'text' : 'password'}
                        required
                        value={receptionPassword}
                        onChange={(e) => setReceptionPassword(e.target.value)}
                        placeholder="Enter reception security password"
                        className="w-full bg-transparent text-sm p-4 pr-12 rounded-2xl focus:outline-none text-slate-900 placeholder:text-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowReceptionPassword(!showReceptionPassword)}
                        className="absolute inset-y-0 right-3.5 flex items-center text-slate-400 hover:text-slate-700 transition-colors"
                      >
                        {showReceptionPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </GlassInputWrapper>
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <label className="flex items-center gap-2 text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={receptionKeepSignedIn}
                      onChange={(e) => setReceptionKeepSignedIn(e.target.checked)}
                      className="rounded accent-teal-700"
                    />
                    <span>Keep me signed in</span>
                  </label>
                  <button
                    type="button"
                    title="Contact administrator"
                    className="hover:underline text-teal-700 font-medium transition-colors cursor-not-allowed opacity-80"
                  >
                    Reset password
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-2xl bg-teal-800 py-3.5 font-semibold text-white hover:bg-teal-900 disabled:bg-slate-400 transition-all cursor-pointer shadow-md hover:scale-[1.01] active:scale-[0.99] text-sm mt-2"
                >
                  {loading ? 'Authenticating…' : 'Sign In as Receptionist'}
                </button>
              </form>
            )}

            {/* ── DOCTOR FORM ── */}
            {mode === 'doctor' && (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">
                    Doctor / Staff Email Address
                  </label>
                  <GlassInputWrapper>
                    <input
                      name="email"
                      type="email"
                      required
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="dr.kapoor@campuscare.edu"
                      className="w-full bg-transparent text-sm p-4 rounded-2xl focus:outline-none text-slate-900 placeholder:text-slate-400"
                    />
                  </GlassInputWrapper>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Medical console access for authorized doctors and clinical staff.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">
                    Password
                  </label>
                  <GlassInputWrapper>
                    <div className="relative">
                      <input
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your security password"
                        className="w-full bg-transparent text-sm p-4 pr-12 rounded-2xl focus:outline-none text-slate-900 placeholder:text-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-3.5 flex items-center text-slate-400 hover:text-slate-700 transition-colors"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </GlassInputWrapper>
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <label className="flex items-center gap-2 text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={keepSignedIn}
                      onChange={(e) => setKeepSignedIn(e.target.checked)}
                      className="rounded accent-teal-700"
                    />
                    <span>Keep me signed in</span>
                  </label>
                  <button
                    type="button"
                    title="Contact administrator"
                    className="hover:underline text-teal-700 font-medium transition-colors cursor-not-allowed opacity-80"
                  >
                    Reset password
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-2xl bg-slate-900 py-3.5 font-semibold text-white hover:bg-slate-800 disabled:bg-slate-400 transition-all cursor-pointer shadow-md hover:scale-[1.01] active:scale-[0.99] text-sm mt-2"
                >
                  {loading ? 'Signing in…' : 'Sign In as Doctor'}
                </button>
              </form>
            )}

            {/* ── STUDENT FORM (GOOGLE WORKSPACE AUTHORIZATION) ── */}
            {mode === 'student' && (
              <div className="space-y-4">
                {/* Institutional Badge */}
                <div className="rounded-2xl border border-teal-500/25 bg-teal-50/70 p-3.5 flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-teal-800 text-white shrink-0 mt-0.5">
                    <GraduationCap className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-teal-950">
                      TIET Student Single Sign-On
                    </h3>
                    <p className="text-[11px] text-teal-800/80 leading-relaxed mt-0.5">
                      Log in with your official Thapar University Google account to view prescriptions, medical history, and queue position.
                    </p>
                  </div>
                </div>

                {/* Domain Mismatch Alert */}
                {googleError && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-xs text-red-700 font-medium flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-red-800">Thapar Account Required</p>
                      <p className="mt-0.5 text-red-700 leading-relaxed">{googleError}</p>
                    </div>
                  </div>
                )}

                {/* Official Google Workspace Sign-In Area */}
                <div className="w-full flex flex-col items-center gap-3">
                  {/* Official Google GIS Button Container */}
                  <div
                    ref={googleBtnRef}
                    className="w-full flex justify-center items-center min-h-[44px]"
                  />

                  {/* Fallback button if Google script is loading or blocked by adblock */}
                  {!gisLoaded && (
                    <button
                      type="button"
                      onClick={handleGoogleSignInClick}
                      disabled={googleLoading}
                      className="w-full flex items-center justify-between gap-3 border-2 border-slate-200/90 rounded-2xl p-3.5 hover:border-teal-600 hover:bg-teal-50/40 text-slate-800 font-semibold text-xs sm:text-sm transition-all shadow-sm hover:shadow-md cursor-pointer group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-xl bg-white shadow-xs group-hover:scale-105 transition-transform">
                          <GoogleIcon />
                        </div>
                        <div className="text-left leading-tight">
                          <span className="block font-semibold text-slate-900">
                            {googleLoading ? 'Authorizing with Google…' : 'Continue with Thapar Google Workspace'}
                          </span>
                          <span className="text-[11px] text-slate-500 font-normal">
                            TIET Single Sign-On
                          </span>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
                        @thapar.edu only
                      </span>
                    </button>
                  )}

                  {googleLoading && (
                    <div className="flex items-center gap-2 text-xs text-teal-700 font-medium py-1">
                      <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                      <span>Verifying your Thapar account…</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between w-full px-1 pt-0.5">
                    <span className="text-[10px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200/80">
                      @thapar.edu only
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowSandboxModal(true)}
                      className="text-[11px] text-slate-400 hover:text-teal-700 transition-colors underline cursor-pointer"
                    >
                      Dev Sandbox Chooser
                    </button>
                  </div>
                </div>

                {/* Divider */}
                <div className="relative flex items-center justify-center my-2">
                  <span className="w-full border-t border-slate-200"></span>
                  <span className="px-3 text-xs text-slate-400 bg-white absolute">
                    Or direct ID lookup
                  </span>
                </div>

                {/* Roll Number Form */}
                <form className="space-y-3" onSubmit={handleStudentSubmit}>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1.5 block">
                      University Roll Number
                    </label>
                    <GlassInputWrapper>
                      <input
                        name="rollNumber"
                        type="text"
                        value={rollNumber}
                        onChange={(e) => {
                          setRollNumber(e.target.value)
                          if (rollError) setRollError('')
                        }}
                        placeholder="e.g. 102403499 or CS21B045"
                        className="w-full bg-transparent text-sm p-4 rounded-2xl focus:outline-none text-slate-900 placeholder:text-slate-400"
                      />
                    </GlassInputWrapper>
                  </div>

                  {rollError && (
                    <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-xs text-red-700 font-medium">
                      {rollError}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full rounded-2xl bg-slate-100 hover:bg-slate-200 py-3 font-semibold text-slate-700 transition-all cursor-pointer text-xs"
                  >
                    View My Student Dashboard
                  </button>
                </form>
              </div>
            )}

            {/* Bottom info */}
            <p className="text-center text-xs text-slate-500 mt-1">
              New to CampusCare?{' '}
              <button
                type="button"
                className="text-teal-700 font-semibold hover:underline cursor-not-allowed opacity-80"
              >
                Create Account
              </button>
            </p>
          </div>
        </div>

        {/* Footer legal note */}
        <div className="text-center text-[11px] text-slate-400 mt-6">
          {mode === 'doctor'
            ? 'Doctor access is restricted to verified medical faculty.'
            : mode === 'receptionist'
            ? 'Front desk access is restricted to authorized dispensary and reception staff.'
            : 'Your medical telemetry is encrypted under TIET student health privacy guidelines.'}
        </div>

        {/* ── Thapar Google Workspace Sandbox Modal ── */}
        {showSandboxModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-slate-100 relative">
              <button
                type="button"
                onClick={() => setShowSandboxModal(false)}
                className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 rounded-2xl bg-teal-50 border border-teal-100 text-teal-800">
                  <GoogleIcon />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Thapar Google Workspace SSO
                  </h3>
                  <p className="text-xs text-slate-500">
                    Select an account to verify domain authorization
                  </p>
                </div>
              </div>

              <div className="space-y-2.5 my-4">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Test Student Accounts
                </p>

                {/* Valid Account 1 */}
                <button
                  type="button"
                  onClick={() =>
                    handleSimulatedSignIn({
                      name: 'Simar Singh',
                      email: 'simar.singh102403499@thapar.edu',
                      rollNumber: '102403499',
                    })
                  }
                  className="w-full flex items-center justify-between p-3 rounded-2xl border border-slate-200 hover:border-teal-500 hover:bg-teal-50/40 text-left transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-teal-800 text-white font-bold flex items-center justify-center text-xs">
                      SS
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-800 group-hover:text-teal-900">
                        Simar Singh
                      </p>
                      <p className="text-[11px] text-slate-500">
                        simar.singh102403499@thapar.edu
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    Valid
                  </span>
                </button>

                {/* Valid Account 2 */}
                <button
                  type="button"
                  onClick={() =>
                    handleSimulatedSignIn({
                      name: 'Priya Singh',
                      email: 'priya.singh@thapar.edu',
                      rollNumber: 'EC20B012',
                    })
                  }
                  className="w-full flex items-center justify-between p-3 rounded-2xl border border-slate-200 hover:border-teal-500 hover:bg-teal-50/40 text-left transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-teal-600 text-white font-bold flex items-center justify-center text-xs">
                      PS
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-800 group-hover:text-teal-900">
                        Priya Singh
                      </p>
                      <p className="text-[11px] text-slate-500">
                        priya.singh@thapar.edu
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    Valid
                  </span>
                </button>

                {/* Invalid Personal Gmail Account (Domain Rejection Test) */}
                <button
                  type="button"
                  onClick={() =>
                    handleSimulatedSignIn({
                      name: 'Student Personal',
                      email: 'student.personal@gmail.com',
                      rollNumber: 'NON_THAPAR',
                    })
                  }
                  className="w-full flex items-center justify-between p-3 rounded-2xl border border-rose-200 bg-rose-50/30 hover:bg-rose-50/80 text-left transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-rose-500 text-white font-bold flex items-center justify-center text-xs">
                      GM
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-800">
                        Personal Gmail Account
                      </p>
                      <p className="text-[11px] text-rose-600 font-medium">
                        student.personal@gmail.com
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                    Test Rejection
                  </span>
                </button>
              </div>

              {/* Custom Email Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!customTestEmail.trim()) return
                  handleSimulatedSignIn({
                    name: customTestEmail.split('@')[0],
                    email: customTestEmail.trim(),
                  })
                }}
                className="mt-4 pt-4 border-t border-slate-100"
              >
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                  Or test any custom email:
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={customTestEmail}
                    onChange={(e) => setCustomTestEmail(e.target.value)}
                    placeholder="username@thapar.edu"
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-teal-500"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-slate-900 text-white font-semibold text-xs hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Authorize
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </section>

      {/* ── Right Column: CampusCare Signature Visual Panel + Testimonials ── */}
      <section className="hidden lg:flex flex-1 relative p-4 lg:p-6">
        <div
          className="relative w-full h-full rounded-3xl overflow-hidden shadow-2xl flex flex-col justify-between p-8 xl:p-12 text-white"
          style={{
            background: 'linear-gradient(135deg, #134E4A 0%, #0F766E 45%, #1E293B 100%)',
          }}
        >
          {/* Diagonal Line Pattern Overlay */}
          <div
            className="absolute inset-0 opacity-25 pointer-events-none"
            style={{
              backgroundImage:
                'repeating-linear-gradient(115deg, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.08) 2px, transparent 2px, transparent 40px)',
            }}
          />

          {/* Radial Ambient Glow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(circle at 75% 35%, rgba(20, 184, 166, 0.25), transparent 60%)',
            }}
          />

          {/* Top: Institutional Pill Tag */}
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/20 backdrop-blur-md text-xs font-medium text-teal-100 shadow-sm">
              <Building2 className="w-3.5 h-3.5 text-teal-300" />
              <span>TIET Health Center • Digital Medical Wing</span>
            </div>
          </div>

          {/* Middle: Headline & Value Proposition */}
          <div className="relative z-10 max-w-lg my-auto py-8">
            <h2 className="text-3xl xl:text-4xl font-bold leading-tight tracking-tight mb-3">
              One queue.
              <br />
              Every patient's full picture.
            </h2>
            <p className="text-teal-100/80 text-sm xl:text-base leading-relaxed">
              Instant contactless RFID check-ins, zero paper lines, real-time doctor consultation queues, and verified student prescription histories.
            </p>
          </div>

          {/* Bottom: Testimonials (Matching user layout specifications) */}
          <div className="relative z-10 flex flex-col xl:flex-row gap-3.5 w-full">
            {mode === 'receptionist' ? (
              <>
                <TestimonialCard
                  avatarText="RK"
                  name="Rajesh Kumar"
                  handle="Front Desk • Counter 1"
                  text="Tapping a student's RFID card pulls up their active queue position instantly. Zero paper files."
                  isSpecial={true}
                />
                <div className="hidden xl:block">
                  <TestimonialCard
                    avatarText="NK"
                    name="Dr. Neha Kapoor"
                    handle="General Physician • Room 104"
                    text="Patients are triaged before they even step into the clinic."
                    isSpecial={false}
                  />
                </div>
              </>
            ) : (
              <>
                <TestimonialCard
                  avatarText="NK"
                  name="Dr. Neha Kapoor"
                  handle="General Physician • Room 104"
                  text="I stopped juggling paper charts between patients — everything's already pulled up before they sit down."
                  isSpecial={true}
                />
                <div className="hidden xl:block">
                  <TestimonialCard
                    avatarText="SS"
                    name="Simar Singh"
                    handle="Roll #102403499 • B.Tech CSE"
                    text="Tapping my RFID card at the dispensary kiosk saves 20 minutes between lectures."
                    isSpecial={false}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}