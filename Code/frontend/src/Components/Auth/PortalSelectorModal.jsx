import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen,
  GraduationCap,
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
      id: 'student',
      title: 'Student Portal',
      desc: 'Digital OPD tokens, prescriptions & medical file',
      icon: GraduationCap,
      route: '/signin/student',
    },
    {
      id: 'faculty',
      title: 'Faculty Portal',
      desc: 'Personal OPD consultations & verified family care',
      icon: BookOpen,
      route: '/signin/faculty',
    },
  ]

  const handleSelect = (route) => {
    onClose()
    navigate(route)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-150">
      <div
        className="w-full max-w-sm sm:max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={tiMark} alt="TI Logo" className="h-7 w-auto object-contain" />
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight leading-none">
                Select Portal
              </h2>
              <p className="text-[11px] text-slate-500 mt-1">
                TIET CampusCare Health Centre
              </p>
            </div>
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

        {/* 2 Focused Clean Portal Options: Student & Faculty */}
        <div className="p-4 sm:p-5 flex flex-col gap-2.5 sm:gap-3 bg-white">
          {portals.map((p) => {
            const IconComponent = p.icon
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelect(p.route)}
                className="p-3.5 sm:p-4 rounded-2xl border border-slate-200 hover:border-teal-700 bg-white hover:bg-teal-50/40 text-left transition-all duration-200 flex items-center justify-between group cursor-pointer hover:shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="h-11 w-11 rounded-xl bg-[#0c2e2b] text-white flex items-center justify-center shrink-0 shadow-xs transition-transform group-hover:scale-105 group-hover:bg-teal-800">
                    <IconComponent className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1 pr-2">
                    <span className="text-sm font-bold text-slate-900 group-hover:text-teal-950 transition-colors block leading-snug">
                      {p.title}
                    </span>
                    <span className="text-xs text-slate-500 font-normal leading-snug block line-clamp-1">
                      {p.desc}
                    </span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-teal-800 transition-transform group-hover:translate-x-1 shrink-0 ml-1" />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
