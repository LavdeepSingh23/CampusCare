import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  UserCheck,
  ArrowLeft,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import tiMark from '../../assets/ti-mark.png'

const GlassInputWrapper = ({ children }) => (
  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 transition-all focus-within:border-slate-800 focus-within:bg-white focus-within:ring-2 focus-within:ring-slate-800/20">
    {children}
  </div>
)

export default function ReceptionistLogin() {
  const { loginReceptionist, error, setError, loading } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [localError, setLocalError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || !password) {
      setLocalError('Please enter both your email and password.')
      return
    }
    setLocalError('')
    if (setError) setError('')
    const success = await loginReceptionist(email, password)
    if (success) {
      navigate('/reception_dashboard')
    }
  }

  const handleFillDemo = () => {
    setEmail('reception@thapar.edu')
    setPassword('reception123')
    setLocalError('')
  }

  const effectiveError = localError || error

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-white">
      {/* ── Left Column: Clean Essential Form ── */}
      <section className="flex-1 flex flex-col justify-between p-6 sm:p-10 lg:p-16 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
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
            <span>Home</span>
          </button>
        </div>

        {/* Center Container */}
        <div className="w-full max-w-sm mx-auto my-auto py-8">
          <div className="flex flex-col gap-6">
            {/* Title & Portal Badge */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-900 border border-slate-200">
                  <UserCheck className="w-3.5 h-3.5 text-slate-700" />
                  Receptionist Portal
                </span>
                <button
                  type="button"
                  onClick={() => navigate('/signin/doctor')}
                  className="text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                >
                  Doctor OPD &rarr;
                </button>
              </div>

              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                Sign In
              </h1>
              <p className="mt-1 text-xs text-slate-500">
                Enter your staff credentials to access check-in desk and queue triage.
              </p>
            </div>

            {/* Error Banner */}
            {effectiveError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">{effectiveError}</p>
              </div>
            )}

            {/* Form */}
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="text-xs font-medium text-slate-700 mb-1.5 block">
                  Staff Email
                </label>
                <GlassInputWrapper>
                  <input
                    name="email"
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="reception@thapar.edu"
                    className="w-full bg-transparent text-sm p-3.5 rounded-2xl focus:outline-none text-slate-900 placeholder:text-slate-400"
                  />
                </GlassInputWrapper>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 mb-1.5 block">
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
                      placeholder="••••••••"
                      className="w-full bg-transparent text-sm p-3.5 pr-11 rounded-2xl focus:outline-none text-slate-900 placeholder:text-slate-400"
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

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-slate-900 py-3 font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300 transition-all cursor-pointer shadow-sm text-sm mt-2 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin text-white" />}
                <span>{loading ? 'Signing in…' : 'Sign In'}</span>
              </button>
            </form>

            {/* Subtle Demo Credential Filler */}
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={handleFillDemo}
                className="text-xs text-slate-400 hover:text-slate-800 transition-colors cursor-pointer"
              >
                Use demo credentials (Counter 1)
              </button>
            </div>
          </div>
        </div>

        {/* Empty bottom spacer to balance layout */}
        <div className="text-center text-xs text-slate-400">
          TIET Reception & Triage Services
        </div>
      </section>

      {/* ── Right Column: Clean Signature Visual Panel ── */}
      <section className="hidden lg:flex flex-1 relative p-6">
        <div
          className="relative w-full h-full rounded-3xl overflow-hidden shadow-xl flex flex-col justify-between p-12 text-white"
          style={{
            background: 'linear-gradient(135deg, #134E4A 0%, #0F766E 45%, #1E293B 100%)',
          }}
        >
          {/* Diagonal Line Pattern Overlay */}
          <div
            className="absolute inset-0 opacity-20 pointer-events-none"
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

          {/* Top Status */}
          <div className="relative z-10 flex items-center gap-2 text-xs font-semibold text-teal-200">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Front Desk Reception & Triage Registry</span>
          </div>

          {/* Middle: Headline */}
          <div className="relative z-10 max-w-md my-auto py-8">
            <h2 className="text-3xl xl:text-4xl font-bold leading-tight tracking-tight mb-4">
              One unified clinic.
              <br />
              Every check-in verified.
            </h2>
            <p className="text-teal-100/80 text-sm leading-relaxed">
              Contactless student RFID check-in, community visitor passes, and automated live dispatch to attending physicians.
            </p>
          </div>

          {/* Bottom Info */}
          <div className="relative z-10 text-xs text-teal-200/70 flex items-center justify-between">
            <span>Thapar Institute of Engineering & Technology</span>
            <span>Patiala, Punjab</span>
          </div>
        </div>
      </section>
    </div>
  )
}
