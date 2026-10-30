import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  BookOpen,
  ArrowLeft,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import tiMark from '../../assets/ti-mark.png'
import PortalSelectorModal from './PortalSelectorModal'

const GoogleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 48 48">
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

const GlassInputWrapper = ({ children }) => (
  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 transition-all focus-within:border-amber-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-amber-600/20">
    {children}
  </div>
)

export default function FacultyLogin() {
  const { loginFaculty, error, setError, loading } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isPortalModalOpen, setIsPortalModalOpen] = useState(false)
  const [localError, setLocalError] = useState('')
  const [googleLoading, setGoogleLoading] = useState(false)
  const [gisRendered, setGisRendered] = useState(false)

  const DEFAULT_GOOGLE_CLIENT_ID = '537555774720-50raj44tbc0qdma0u10s776lhua7ov5m.apps.googleusercontent.com'
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID
  const googleBtnRef = useRef(null)

  useEffect(() => {
    if (!googleClientId) return

    function renderGis() {
      if (!window.google?.accounts?.id) return
      try {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (resp) => {
            if (!resp?.credential) return
            setGoogleLoading(true)
            setLocalError('')
            try {
              const fac = await loginFaculty(resp.credential)
              if (fac) {
                navigate('/faculty_dashboard')
              }
            } catch (err) {
              setLocalError(err.message || 'Faculty Google sign-in failed. Please verify your @thapar.edu directory account.')
            } finally {
              setGoogleLoading(false)
            }
          },
          hosted_domain: 'thapar.edu',
          auto_select: false,
        })
        if (googleBtnRef.current) {
          googleBtnRef.current.innerHTML = ''
          setGisRendered(true)
          window.google.accounts.id.renderButton(googleBtnRef.current, {
            theme: 'outline',
            size: 'large',
            type: 'standard',
            text: 'continue_with',
            shape: 'pill',
            width: 320,
          })
        }
      } catch (e) {
        console.error('Faculty Google GIS error', e)
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
  }, [googleClientId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email) {
      setLocalError('Please enter your institutional @thapar.edu email.')
      return
    }
    setLocalError('')
    if (setError) setError('')
    try {
      const success = await loginFaculty(email, password)
      if (success) {
        navigate('/faculty_dashboard')
      }
    } catch (err) {
      setLocalError(err.message || 'Faculty authentication failed.')
    }
  }

  const handleGoogleSignIn = async () => {
    setLocalError('')
    if (setError) setError('')
    setGoogleLoading(true)
    try {
      const devToken =
        'dev_gtoken_' +
        btoa(
          JSON.stringify({
            sub: 'google_dr_sharma',
            email: 'dr.sharma@thapar.edu',
            name: 'Dr. Rajesh Sharma',
            hd: 'thapar.edu',
          })
        )
      const success = await loginFaculty(devToken)
      if (success) {
        navigate('/faculty_dashboard')
      }
    } catch (err) {
      setLocalError(err.message || 'Google sign-in failed.')
    } finally {
      setGoogleLoading(false)
    }
  }

  const handleFillDemo = (demoEmail) => {
    setEmail(demoEmail)
    setPassword('password123')
    setLocalError('')
  }

  const effectiveError = localError || error
  const isBusy = loading || googleLoading

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
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-200">
                  <BookOpen className="w-3.5 h-3.5 text-amber-600" />
                  Faculty Portal
                </span>
                <button
                  type="button"
                  onClick={() => setIsPortalModalOpen(true)}
                  className="text-xs font-medium text-slate-500 hover:text-amber-800 transition-colors cursor-pointer"
                >
                  Switch role
                </button>
              </div>

              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                Sign In
              </h1>
              <p className="mt-1 text-xs text-slate-500">
                Sign in with your @thapar.edu account to access OPD visits and dependent care.
              </p>
            </div>

            {/* Error Banner */}
            {effectiveError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">{effectiveError}</p>
              </div>
            )}

            {/* Google Login Only */}
            <div className="w-full flex flex-col items-center">
              <div ref={googleBtnRef} className={`w-full flex justify-center min-h-[44px] ${gisRendered ? 'block' : 'hidden'}`} />

              {!gisRendered && (
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isBusy}
                  className="w-full flex items-center justify-center gap-2.5 border border-slate-200 rounded-2xl py-3 px-4 hover:border-slate-300 hover:bg-slate-50 text-slate-800 font-medium text-xs sm:text-sm transition-all shadow-2xs cursor-pointer disabled:opacity-60"
                >
                  <GoogleIcon />
                  <span>{googleLoading ? 'Signing in…' : 'Sign in with Google'}</span>
                </button>
              )}
            </div>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink mx-3 text-slate-400 text-xs">or password</span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            {/* Form */}
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="text-xs font-medium text-slate-700 mb-1.5 block">
                  Institutional Email
                </label>
                <GlassInputWrapper>
                  <input
                    name="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="faculty@thapar.edu"
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
                disabled={isBusy}
                className="w-full rounded-2xl bg-amber-600 py-3 font-semibold text-white hover:bg-amber-700 disabled:bg-slate-300 transition-all cursor-pointer shadow-sm text-sm mt-2 flex items-center justify-center gap-2"
              >
                {isBusy && <Loader2 className="w-4 h-4 animate-spin text-white" />}
                <span>{isBusy ? 'Signing in…' : 'Sign In'}</span>
              </button>
            </form>

            {/* Subtle Demo Credential Filler */}
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => handleFillDemo('dr.sharma@thapar.edu')}
                className="text-xs text-slate-400 hover:text-amber-700 transition-colors cursor-pointer"
              >
                Use demo credentials (Dr. Rajesh Sharma)
              </button>
            </div>
          </div>
        </div>

        {/* Empty bottom spacer to balance layout */}
        <div className="text-center text-xs text-slate-400">
          TIET Faculty & Staff Health Services
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
            <span>Faculty & Family Dependent Health Service</span>
          </div>

          {/* Middle: Headline */}
          <div className="relative z-10 max-w-md my-auto py-8">
            <h2 className="text-3xl xl:text-4xl font-bold leading-tight tracking-tight mb-4">
              Institutional care.
              <br />
              Connected for family.
            </h2>
            <p className="text-teal-100/80 text-sm leading-relaxed">
              Complete healthcare coverage for faculty members and dependents. View past clinical consultations and verified digital prescriptions.
            </p>
          </div>

          {/* Bottom Info */}
          <div className="relative z-10 text-xs text-teal-200/70 flex items-center justify-between">
            <span>Thapar Institute of Engineering & Technology</span>
            <span>Patiala, Punjab</span>
          </div>
        </div>
      </section>

      {/* Portal Switcher Modal */}
      <PortalSelectorModal
        isOpen={isPortalModalOpen}
        onClose={() => setIsPortalModalOpen(false)}
      />
    </div>
  )
}
