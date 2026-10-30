import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Stethoscope,
  BookOpen,
  GraduationCap,
  UserCheck,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react'
import tiMark from '../../assets/ti-mark.png'

export default function PortalSelectorPage() {
  const navigate = useNavigate()

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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col justify-between p-6 sm:p-12">
      {/* Top Navbar */}
      <header className="max-w-xl mx-auto w-full flex items-center justify-between py-2">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Home</span>
        </button>

        <span className="text-xs font-semibold text-teal-900 bg-teal-50 px-3 py-1 rounded-full border border-teal-200">
          TIET Health Centre
        </span>
      </header>

      {/* Main Container */}
      <div className="max-w-xl mx-auto w-full my-auto py-8">
        <div className="text-center mb-8">
          <img src={tiMark} alt="TIET Mark" className="w-10 h-10 object-contain mx-auto mb-3" />
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Select Portal
          </h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {portals.map((p) => {
            const IconComponent = p.icon
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => navigate(p.route)}
                className="p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-teal-700 bg-white hover:bg-teal-50/40 text-left transition-all duration-200 flex items-center justify-between group cursor-pointer shadow-xs hover:shadow-md"
              >
                <div className="flex items-center gap-3.5">
                  <div className="h-12 w-12 rounded-xl bg-[#0c2e2b] text-white flex items-center justify-center shrink-0 shadow-xs transition-transform group-hover:scale-105 group-hover:bg-teal-800">
                    <IconComponent className="w-6 h-6" />
                  </div>
                  <span className="text-base font-semibold text-slate-900 group-hover:text-teal-950 transition-colors">
                    {p.title}
                  </span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-teal-800 transition-transform group-hover:translate-x-1" />
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
