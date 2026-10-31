import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen,
  GraduationCap,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react'
import tiMark from '../../assets/ti-mark.png'

export default function PortalSelectorPage() {
  const navigate = useNavigate()

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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col justify-between p-4 sm:p-8">
      {/* Top Navbar */}
      <header className="max-w-md mx-auto w-full flex items-center justify-between gap-2 py-2">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Home</span>
        </button>

        <span className="text-[11px] font-semibold text-teal-900 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200 shrink-0">
          TIET Health Centre
        </span>
      </header>

      {/* Main Container */}
      <div className="max-w-md mx-auto w-full my-auto py-6">
        <div className="text-center mb-6 sm:mb-8">
          <img src={tiMark} alt="TIET Mark" className="w-11 h-11 object-contain mx-auto mb-3" />
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Select Portal
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1.5">
            Choose your role to access your campus health services
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {portals.map((p) => {
            const IconComponent = p.icon
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => navigate(p.route)}
                className="p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-teal-700 bg-white hover:bg-teal-50/40 text-left transition-all duration-200 flex items-center justify-between group cursor-pointer shadow-xs hover:shadow-md"
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-xl bg-[#0c2e2b] text-white flex items-center justify-center shrink-0 shadow-xs transition-transform group-hover:scale-105 group-hover:bg-teal-800">
                    <IconComponent className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div className="min-w-0 flex-1 pr-2">
                    <span className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-teal-950 transition-colors block leading-snug">
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

      <div className="text-center text-xs text-slate-400 py-2">
        CampusCare • Thapar Institute of Engineering & Technology
      </div>
    </div>
  )
}
