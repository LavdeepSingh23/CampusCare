// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Home, FileText, HeartPulse, AlertTriangle, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export const STUDENT_DOCK_ITEMS = [
  { id: 1, key: 'home', label: 'Home', icon: <Home size={28} /> },
  { id: 2, key: 'prescription', label: 'Prescription', icon: <FileText size={28} /> },
  { id: 3, key: 'health', label: 'Medical History', icon: <HeartPulse size={28} /> },
  { id: 4, key: 'help', label: 'Emergency', icon: <AlertTriangle size={28} />, urgent: true },
  { id: 5, key: 'account', label: 'Account', icon: <User size={28} /> },
];

export default function TiltedDock({
  tab = 'home',
  onChange = () => {},
  items = STUDENT_DOCK_ITEMS,
  className = '',
}) {
  const [hovered, setHovered] = useState(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e) => {
      setMouse({
        x: e.clientX / window.innerWidth - 0.5,
        y: e.clientY / window.innerHeight - 0.5,
      });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className={cn('fixed bottom-7 sm:bottom-9 left-1/2 -translate-x-1/2 z-50 pointer-events-auto', className)}>
      <motion.div
        className="flex items-center gap-6 sm:gap-10 px-7 sm:px-12 py-4 sm:py-5 rounded-3xl 
                   backdrop-blur-2xl bg-white/80 dark:bg-slate-900/80 
                   border border-white/50 dark:border-white/15 
                   shadow-[0_15px_40px_rgba(0,0,0,0.22)]"
        style={{
          transformStyle: 'preserve-3d',
          boxShadow: 'inset 1.5px 1.5px 2px 0 rgba(255,255,255,0.7), inset -1.5px -1.5px 2px 0 rgba(0,0,0,0.06), 0 16px 42px rgba(0,0,0,0.18)',
        }}
        animate={{
          rotateX: 18, // stage tilt
          rotateY: mouse.x * 10, // subtle parallax left/right
        }}
        transition={{ type: 'spring', stiffness: 80, damping: 20 }}
      >
        {items.map((item) => {
          const isActive = tab === item.key;
          return (
            <motion.div
              key={item.id || item.key}
              className="relative flex flex-col items-center justify-center cursor-pointer select-none"
              onClick={() => onChange(item.key)}
              onHoverStart={() => setHovered(item.id)}
              onHoverEnd={() => setHovered(null)}
              animate={{
                scale: hovered === item.id ? 1.4 : isActive ? 1.18 : 1,
                z: hovered === item.id ? 120 : isActive ? 50 : hovered ? -20 : 0, // depth layers
                opacity: hovered && hovered !== item.id ? 0.5 : 1,
              }}
              transition={{ type: 'spring', stiffness: 200, damping: 18 }}
              style={{ transformStyle: 'preserve-3d' }}
            >
              {/* Active Indicator Backdrop Pill */}
              {isActive && (
                <motion.div
                  layoutId="tiltedDockActiveIndicator"
                  className={cn(
                    'absolute -inset-2.5 rounded-2xl -z-10 shadow-xs',
                    item.urgent
                      ? 'bg-rose-100/90 border border-rose-200'
                      : 'bg-teal-100/80 border border-teal-200/90'
                  )}
                  transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                />
              )}

              {/* Icon */}
              <motion.div
                animate={{
                  rotateX: hovered === item.id ? -10 : 0,
                  rotateY: hovered === item.id ? 10 : 0,
                }}
                transition={{ type: 'spring', stiffness: 150, damping: 15 }}
                className={cn(
                  'transition-colors duration-200',
                  item.urgent
                    ? isActive
                      ? 'text-rose-600'
                      : 'text-rose-500 hover:text-rose-600'
                    : isActive
                    ? 'text-teal-800 dark:text-teal-300 font-bold'
                    : 'text-gray-700 dark:text-gray-200 hover:text-gray-900'
                )}
              >
                {item.icon}
              </motion.div>

              {/* Label */}
              <motion.span
                className={cn(
                  'absolute -bottom-7 text-[11px] font-semibold tracking-tight whitespace-nowrap pointer-events-none drop-shadow-xs',
                  item.urgent
                    ? 'text-rose-600 font-bold'
                    : isActive
                    ? 'text-teal-900 font-bold dark:text-teal-200'
                    : 'text-gray-800 dark:text-gray-200'
                )}
                animate={{
                  opacity: hovered === item.id || isActive ? 1 : 0,
                  y: hovered === item.id || isActive ? 0 : 5,
                }}
                transition={{ duration: 0.25 }}
              >
                {item.label}
              </motion.span>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
