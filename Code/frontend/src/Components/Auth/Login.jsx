import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import tietLogo from '../../assets/tiet-logo.jpg'

function EyeIcon({ open }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A10.4 10.4 0 0 1 12 4c7 0 11 8 11 8a20.3 20.3 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

export default function Login() {
  const { login, error, loading } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('doctor')
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
    // TODO: wire this up to your real OAuth flow, e.g.
    // window.location.href = `${import.meta.env.VITE_API_URL}/api/auth/google`
    // or a Firebase/Auth0/Google Identity Services popup that resolves
    // to the same `login`-style success path used above.
    console.log('Google sign-in not wired up yet')
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
    <div className="min-h-screen flex bg-white relative">
      <img
        src={tietLogo}
        alt="Thapar Institute of Engineering & Technology"
        className="absolute top-6 left-6 h-24 w-auto z-10"
      />
      {/* ── Left: form ─────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Welcome</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {mode === 'doctor' ? "Sign in to CampusCare's Doctor's Dashboard" : 'Look up your CampusCare prescription history'}
            </p>
          </div>

          <div className="inline-flex bg-slate-100 rounded-full p-1 mb-6">
            <button
              type="button"
              onClick={() => setMode('doctor')}
              className={
                'px-4 py-1.5 rounded-full text-sm font-medium transition-colors ' +
                (mode === 'doctor' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')
              }
            >
              Doctor
            </button>
            <button
              type="button"
              onClick={() => setMode('student')}
              className={
                'px-4 py-1.5 rounded-full text-sm font-medium transition-colors ' +
                (mode === 'student' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')
              }
            >
              Student
            </button>
          </div>

          {mode === 'doctor' && error && (
            <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-5 text-sm text-red-700">
              {error}
            </div>
          )}

          {mode === 'doctor' && (
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="text-sm font-medium block mb-1.5 text-slate-700">Email address</label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@thapar.edu"
                className="border border-slate-300 bg-slate-50 p-2.5 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-teal-400/40 focus:border-teal-400 focus:bg-white transition-colors"
              />
            </div>

            <div className="mb-3">
              <label className="text-sm font-medium block mb-1.5 text-slate-700">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="border border-slate-300 bg-slate-50 p-2.5 pr-10 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-teal-400/40 focus:border-teal-400 focus:bg-white transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between mb-6 mt-3">
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={keepSignedIn}
                  onChange={(e) => setKeepSignedIn(e.target.checked)}
                  className="accent-teal-600"
                />
                Keep me signed in
              </label>
              <button
                type="button"
                title="Not available in this demo"
                className="text-sm text-teal-700 hover:text-teal-900 cursor-not-allowed opacity-70"
              >
                Reset password
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          )}

          {mode === 'doctor' && (
          <>
          <div className="flex items-center gap-3 my-5">
            <div className="h-px bg-slate-200 flex-1" />
            <span className="text-xs text-slate-400">Or continue with</span>
            <div className="h-px bg-slate-200 flex-1" />
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-2.5 border border-slate-300 hover:bg-slate-50 text-slate-700 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46c-.28 1.5-1.13 2.77-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81z" />
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.94-2.92l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.94H1.28v3.1C3.26 21.3 7.31 24 12 24z" />
              <path fill="#FBBC05" d="M5.29 14.29A7.2 7.2 0 0 1 4.91 12c0-.79.14-1.56.38-2.29v-3.1H1.28A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l4.01-3.1z" />
              <path fill="#EA4335" d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.44-3.44C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.28 6.61l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77z" />
            </svg>
            Continue with Google
          </button>

          <p className="text-sm text-slate-500 text-center mt-5">
            New to CampusCare?{' '}
            <button
              type="button"
              title="Not available in this demo"
              className="text-teal-700 font-medium hover:text-teal-900 cursor-not-allowed opacity-70"
            >
              Create Account
            </button>
          </p>
          </>
          )}

          {mode === 'student' && (
          <form onSubmit={handleStudentSubmit}>
            <div className="mb-4">
              <label className="text-sm font-medium block mb-1.5 text-slate-700">Roll number</label>
              <input
                type="text"
                autoFocus
                value={rollNumber}
                onChange={(e) => {
                  setRollNumber(e.target.value)
                  if (rollError) setRollError('')
                }}
                placeholder="e.g. CS21B045"
                className="border border-slate-300 bg-slate-50 p-2.5 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-teal-400/40 focus:border-teal-400 focus:bg-white transition-colors"
              />
              <p className="text-xs text-slate-400 mt-1.5">Use the roll number on your ID card.</p>
            </div>

            {rollError && (
              <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4 text-sm text-red-700">
                {rollError}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-slate-900 hover:bg-slate-800 text-white py-2.5 rounded-lg text-sm font-medium transition-colors mt-3"
            >
              View my dashboard
            </button>
          </form>
          )}

          {mode === 'student' && (
          <>
          <div className="flex items-center gap-3 my-5">
            <div className="h-px bg-slate-200 flex-1" />
            <span className="text-xs text-slate-400">Or continue with</span>
            <div className="h-px bg-slate-200 flex-1" />
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-2.5 border border-slate-300 hover:bg-slate-50 text-slate-700 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46c-.28 1.5-1.13 2.77-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81z" />
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.94-2.92l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.94H1.28v3.1C3.26 21.3 7.31 24 12 24z" />
              <path fill="#FBBC05" d="M5.29 14.29A7.2 7.2 0 0 1 4.91 12c0-.79.14-1.56.38-2.29v-3.1H1.28A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l4.01-3.1z" />
              <path fill="#EA4335" d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.44-3.44C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.28 6.61l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77z" />
            </svg>
            Continue with Google
          </button>
          </>
          )}

          <p className="text-xs text-slate-400 mt-8 text-center">
            {mode === 'doctor'
              ? 'Doctor access is limited to verified Thapar staff email addresses.'
              : "Don't know your roll number? Check your Thapar ID card."}
          </p>
        </div>
      </div>

      {/* ── Right: visual panel ────────────────────────────── */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(135deg, #134E4A 0%, #0F766E 45%, #1E293B 100%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'repeating-linear-gradient(115deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 2px, transparent 2px, transparent 40px)',
          }}
        />

        <div className="relative z-10 flex flex-col justify-end p-10 w-full">
          <h2 className="text-white text-3xl font-bold leading-tight tracking-tight max-w-sm mb-2">
            One queue.<br />Every patient's full picture.
          </h2>
          <p className="text-teal-100/80 text-sm max-w-sm mb-8">
            See who's waiting, their history, and their prescriptions — all in one screen.
          </p>

          <div className="bg-white/95 backdrop-blur rounded-xl p-4 max-w-sm shadow-lg">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                NK
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800">Dr. Neha Kapoor</div>
                <div className="text-xs text-slate-400 mb-1.5">General Physician</div>
                <p className="text-sm text-slate-600 leading-snug">
                  I stopped juggling paper charts between patients — everything's already pulled up before they sit down.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}