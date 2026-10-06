import React, { useState, createContext, useContext } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/utils'

const SidebarContext = createContext(undefined)

export const useSidebar = () => {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider')
  }
  return context
}

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
}) => {
  const [openState, setOpenState] = useState(false)

  const open = openProp !== undefined ? openProp : openState
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate }}>
      {children}
    </SidebarContext.Provider>
  )
}

export const Sidebar = ({
  children,
  open,
  setOpen,
  animate = true,
}) => {
  return (
    <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
      {children}
    </SidebarProvider>
  )
}

export const SidebarBody = (props) => {
  return (
    <>
      <DesktopSidebar {...props} />
      <MobileSidebar {...props} />
    </>
  )
}

export const DesktopSidebar = ({
  className,
  children,
  ...props
}) => {
  const { open, setOpen, animate } = useSidebar()
  return (
    <motion.div
      className={cn(
        'h-screen sticky top-0 px-3.5 py-5 hidden md:flex md:flex-col bg-[#f4f5f6] border-r border-slate-200/70 w-[260px] flex-shrink-0 select-none transition-all duration-300 z-30',
        className
      )}
      animate={{
        width: animate ? (open ? '260px' : '64px') : '260px',
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      {...props}
    >
      {children}
    </motion.div>
  )
}

export const MobileSidebar = ({
  className,
  children,
  ...props
}) => {
  const { open, setOpen } = useSidebar()
  return (
    <>
      <div
        className={cn(
          'h-14 px-4 flex flex-row md:hidden items-center justify-between bg-[#f4f5f6] border-b border-slate-200 w-full'
        )}
        {...props}
      >
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 bg-slate-900 text-white rounded-lg flex items-center justify-center font-bold text-xs shadow-xs">
            C
          </div>
          <span className="font-bold text-slate-900 text-sm">CampusCare</span>
        </div>
        <div className="flex justify-end z-20">
          <Menu
            className="text-slate-800 cursor-pointer w-6 h-6"
            onClick={() => setOpen(!open)}
          />
        </div>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ x: '-100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '-100%', opacity: 0 }}
              transition={{
                duration: 0.3,
                ease: 'easeInOut',
              }}
              className={cn(
                'fixed h-full w-full inset-0 bg-[#f4f5f6] p-6 z-[100] flex flex-col justify-between overflow-y-auto',
                className
              )}
            >
              <div
                className="absolute right-6 top-6 z-50 text-slate-700 cursor-pointer p-1.5 rounded-lg hover:bg-slate-200"
                onClick={() => setOpen(!open)}
              >
                <X className="w-6 h-6" />
              </div>
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}

export const SidebarLink = ({
  link,
  className,
  active = false,
  badge,
  onClick,
  ...props
}) => {
  const { open, animate, setOpen } = useSidebar()

  const content = (
    <>
      <div className={cn('flex items-center justify-center shrink-0 w-6 h-6 transition-colors', active ? 'text-teal-700 font-bold' : 'text-slate-700 group-hover/sidebar:text-slate-900')}>
        {link.icon}
      </div>
      <motion.div
        animate={{
          display: animate ? (open ? 'flex' : 'none') : 'flex',
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        transition={{ duration: 0.15 }}
        className="flex items-center justify-between flex-1 overflow-hidden whitespace-nowrap !p-0 !m-0"
      >
        <span
          className={cn(
            'text-sm font-medium group-hover/sidebar:translate-x-0.5 transition duration-150 truncate',
            active ? 'text-teal-950 font-bold' : 'text-slate-700 group-hover/sidebar:text-slate-900'
          )}
        >
          {link.label}
        </span>
        {badge !== undefined && badge !== null && (
          <span className="ml-2 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-teal-700 text-white shrink-0">
            {badge}
          </span>
        )}
      </motion.div>
    </>
  )

  const combinedClass = cn(
    'flex items-center justify-start gap-3 group/sidebar py-2.5 px-2.5 rounded-xl transition-all duration-150 cursor-pointer w-full text-left select-none',
    active
      ? 'bg-white text-teal-950 font-bold shadow-xs border border-slate-200/80'
      : 'hover:bg-slate-200/60 text-slate-700',
    className
  )

  if (link.href || link.to) {
    return (
      <Link
        to={link.to || link.href}
        onClick={(e) => {
          if (onClick) onClick(e)
          if (link.onClick) link.onClick(e)
          setOpen(false)
        }}
        className={combinedClass}
        {...props}
      >
        {content}
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        if (onClick) onClick(e)
        if (link.onClick) link.onClick(e)
        setOpen(false)
      }}
      className={combinedClass}
      {...props}
    >
      {content}
    </button>
  )
}
