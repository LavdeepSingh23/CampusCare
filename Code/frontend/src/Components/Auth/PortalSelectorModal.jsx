import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Stethoscope,
  BookOpen,
  GraduationCap,
  UserCheck,
  X,
  ArrowRight,
} from 'lucide-react'
import tiMark from '../../assets/ti-mark.png'

export default function PortalSelectorModal({ isOpen, onClose }) {
  const navigate = useNavigate()

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const portals = [
    {
      id: 'doctor',
      title: 'Doctor Portal',
      icon: Stethoscope,
      route: '/signin/doctor',
    },
    {
      id: 'faculty',
      title: 'Faculty Portal',
      icon: BookOpen,
      route: '/signin/faculty',
    },
    {
      id: 'student',
      title: 'Student Portal',
      icon: GraduationCap,
      route: '/signin/student',
    },
    {
      id: 'receptionist',
      title: 'Receptionist Portal',
      icon: UserCheck,
      route: '/signin/receptionist',
    },
  ]

  const handleSelect = (route) => {
    onClose()
    navigate(route)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={tiMark} alt="TI Logo" className="h-7 w-auto object-contain" />
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Select Portal
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 4 Unified Clean Portal Options */}
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white">
          {portals.map((p) => {
            const IconComponent = p.icon
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelect(p.route)}
                className="p-4 rounded-2xl border border-slate-200 hover:border-teal-700 bg-white hover:bg-teal-50/40 text-left transition-all duration-200 flex items-center justify-between group cursor-pointer hover:shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-xl bg-[#0c2e2b] text-white flex items-center justify-center shrink-0 shadow-xs transition-transform group-hover:scale-105 group-hover:bg-teal-800">
                    <IconComponent className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-semibold text-slate-900 group-hover:text-teal-950 transition-colors">
                    {p.title}
                  </span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-teal-800 transition-transform group-hover:translate-x-1" />
              </button>
            )
          })}
        </div>


      </div>
    </div>
  )
}
