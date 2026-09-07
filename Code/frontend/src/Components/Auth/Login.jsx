import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Eye, EyeOff, Stethoscope, Building2, ArrowLeft, CheckCircle2 } from 'lucide-react'
import tiMark from '../../assets/ti-mark.png'
import { GlassFilter, GlassEffect } from '@/components/ui/liquid-glass'

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
  <GlassEffect className="rounded-3xl p-5 shadow-xl text-white transition-all hover:bg-white/20 border border-white/25">
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
  </GlassEffect>
)

// --- MAIN LOGIN COMPONENT ---

export default function Login() {
  const { login, error, loading } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState('doctor') // 'doctor' | 'student'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [keepSignedIn, setKeepSignedIn] = useState(false)

  const [rollNumber, setRollNumber] = useState('')
  const [rollError, setRollError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    login(email, password).then((success) => {
      if (success) navigate('/doctor_dashboard')
    })
  }

  function handleGoogleSignIn() {
    console.log('Google sign-in flow placeholder')
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
      <GlassFilter />
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
                  : 'Look up your live prescriptions and medical history'}
              </p>
            </div>

            {/* Mode Toggle (Doctor / Student) */}
            <div className="inline-flex bg-slate-100 rounded-full p-1 self-start border border-slate-200/80">
              <button
                type="button"
                onClick={() => setMode('doctor')}
                className={`px-5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  mode === 'doctor'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Doctor Portal
              </button>
              <button
                type="button"
                onClick={() => setMode('student')}
                className={`px-5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  mode === 'student'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Student Portal
              </button>
            </div>

            {/* Error Message */}
            {mode === 'doctor' && error && (
              <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-xs text-red-700 font-medium">
                {error}
              </div>
            )}

            {/* ── DOCTOR FORM ── */}
            {mode === 'doctor' && (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">
                    Institutional Email Address
                  </label>
                  <GlassInputWrapper>
                    <input
                      name="email"
                      type="email"
                      required
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@thapar.edu"
                      className="w-full bg-transparent text-sm p-4 rounded-2xl focus:outline-none text-slate-900 placeholder:text-slate-400"
                    />
                  </GlassInputWrapper>
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
                    title="Not available in this demo"
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

            {/* ── STUDENT FORM ── */}
            {mode === 'student' && (
              <form className="space-y-4" onSubmit={handleStudentSubmit}>
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">
                    University Roll Number
                  </label>
                  <GlassInputWrapper>
                    <input
                      name="rollNumber"
                      type="text"
                      required
                      autoFocus
                      value={rollNumber}
                      onChange={(e) => {
                        setRollNumber(e.target.value)
                        if (rollError) setRollError('')
                      }}
                      placeholder="e.g. 102403001 or CS21B045"
                      className="w-full bg-transparent text-sm p-4 rounded-2xl focus:outline-none text-slate-900 placeholder:text-slate-400"
                    />
                  </GlassInputWrapper>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    Found directly on your physical TIET Student ID card.
                  </p>
                </div>

                {rollError && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-xs text-red-700 font-medium">
                    {rollError}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full rounded-2xl bg-slate-900 py-3.5 font-semibold text-white hover:bg-slate-800 transition-all cursor-pointer shadow-md hover:scale-[1.01] active:scale-[0.99] text-sm mt-2"
                >
                  View My Student Dashboard
                </button>
              </form>
            )}

            {/* Divider */}
            <div className="relative flex items-center justify-center my-1">
              <span className="w-full border-t border-slate-200"></span>
              <span className="px-3 text-xs text-slate-400 bg-white absolute">
                Or continue with
              </span>
            </div>

            {/* Google Sign In */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-3 border border-slate-200 rounded-2xl py-3 hover:bg-slate-50 text-slate-700 font-medium text-xs sm:text-sm transition-all shadow-xs cursor-pointer"
            >
              <GoogleIcon />
              <span>Continue with Thapar Google Workspace</span>
            </button>

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
            ? 'Doctor access is restricted to verified Thapar medical faculty.'
            : 'Your medical telemetry is encrypted under TIET student health privacy guidelines.'}
        </div>
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
          </div>
        </div>
      </section>
    </div>
  )
}