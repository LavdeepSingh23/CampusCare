// @ts-nocheck
'use client';

import React, {
  Children,
  cloneElement,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  AnimatePresence,
} from 'framer-motion';
import { Home, FileText, HeartPulse, AlertTriangle, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const DOCK_HEIGHT = 128;
const DEFAULT_MAGNIFICATION = 72;
const DEFAULT_DISTANCE = 140;
const DEFAULT_PANEL_HEIGHT = 60;

const DockContext = createContext(undefined);

function DockProvider({ children, value }) {
  return <DockContext.Provider value={value}>{children}</DockContext.Provider>;
}

function useDock() {
  const context = useContext(DockContext);
  if (!context) {
    throw new Error('useDock must be used within a DockProvider');
  }
  return context;
}

function Dock({
  children,
  className = '',
  spring = { mass: 0.1, stiffness: 150, damping: 12 },
  magnification = DEFAULT_MAGNIFICATION,
  distance = DEFAULT_DISTANCE,
  panelHeight = DEFAULT_PANEL_HEIGHT,
}) {
  const mouseX = useMotionValue(Infinity);
  const isHovered = useMotionValue(0);

  const maxHeight = useMemo(() => {
    return Math.max(DOCK_HEIGHT, magnification + magnification / 2 + 4);
  }, [magnification]);

  const heightRow = useTransform(isHovered, [0, 1], [panelHeight, maxHeight]);
  const height = useSpring(heightRow, spring);

  return (
    <motion.div
      style={{
        height: height,
        scrollbarWidth: 'none',
      }}
      className="mx-2 flex max-w-full items-end overflow-visible select-none"
    >
      <motion.div
        onMouseMove={(e) => {
          isHovered.set(1);
          mouseX.set(e.clientX ?? e.pageX);
        }}
        onMouseLeave={() => {
          isHovered.set(0);
          mouseX.set(Infinity);
        }}
        className={cn(
          'mx-auto flex w-fit items-end gap-3 sm:gap-4 rounded-3xl bg-white/90 backdrop-blur-2xl px-3.5 sm:px-4 pb-2.5 pt-2 border border-slate-200/90 shadow-[0_14px_40px_rgba(15,23,42,0.14),0_1px_3px_rgba(0,0,0,0.06),inset_0_1px_1px_rgba(255,255,255,0.9)]',
          className
        )}
        style={{ height: panelHeight }}
        role="toolbar"
        aria-label="Application dock"
      >
        <DockProvider value={{ mouseX, spring, distance, magnification }}>
          {children}
        </DockProvider>
      </motion.div>
    </motion.div>
  );
}

function DockItem({ children, className = '', onClick, isActive = false, isUrgent = false }) {
  const ref = useRef(null);

  const { distance, magnification, mouseX, spring } = useDock();

  const isHovered = useMotionValue(0);

  const mouseDistance = useTransform(mouseX, (val) => {
    const domRect = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - domRect.x - domRect.width / 2;
  });

  const widthTransform = useTransform(
    mouseDistance,
    [-distance, 0, distance],
    [42, magnification, 42]
  );

  const width = useSpring(widthTransform, spring);

  return (
    <motion.div
      ref={ref}
      style={{ width }}
      onClick={onClick}
      onHoverStart={() => isHovered.set(1)}
      onHoverEnd={() => isHovered.set(0)}
      onFocus={() => isHovered.set(1)}
      onBlur={() => isHovered.set(0)}
      className={cn(
        'relative inline-flex items-center justify-center aspect-square rounded-2xl cursor-pointer transition-colors duration-150',
        isActive
          ? isUrgent
            ? 'bg-rose-50 border-2 border-rose-400 text-rose-700 shadow-sm'
            : 'bg-teal-50 border-2 border-teal-500 text-teal-800 shadow-sm'
          : isUrgent
          ? 'bg-rose-50/60 hover:bg-rose-100/70 border border-rose-200 text-rose-600 hover:text-rose-700 shadow-xs'
          : 'bg-slate-100/90 hover:bg-slate-200/80 border border-slate-200/80 text-slate-700 hover:text-slate-900 shadow-xs',
        className
      )}
      tabIndex={0}
      role="button"
      aria-haspopup="true"
    >
      {Children.map(children, (child) =>
        React.isValidElement(child)
          ? cloneElement(child, { width, isHovered })
          : child
      )}

      {/* macOS Active Dot Indicator */}
      {isActive && (
        <span
          className={cn(
            'absolute -bottom-1.5 w-1.5 h-1.5 rounded-full transition-all duration-200',
            isUrgent ? 'bg-rose-600' : 'bg-teal-700'
          )}
        />
      )}
    </motion.div>
  );
}

function DockLabel({ children, className = '', ...rest }) {
  const isHovered = rest['isHovered'];
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!isHovered) return;
    const unsubscribe = isHovered.on('change', (latest) => {
      setIsVisible(latest === 1);
    });

    return () => unsubscribe();
  }, [isHovered]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: 1, y: -10 }}
          exit={{ opacity: 0, y: 0 }}
          transition={{ duration: 0.15 }}
          className={cn(
            'absolute -top-7 left-1/2 w-fit whitespace-nowrap rounded-lg border border-slate-200/90 bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-slate-800 shadow-md backdrop-blur-md pointer-events-none z-30',
            className
          )}
          role="tooltip"
          style={{ x: '-50%' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DockIcon({ children, className = '', ...rest }) {
  const width = rest['width'];
  const widthTransform = useTransform(
    width || useMotionValue(42),
    (val) => (val ? val * 0.52 : 22)
  );

  return (
    <motion.div
      style={{ width: widthTransform, height: widthTransform }}
      className={cn('flex items-center justify-center shrink-0 pointer-events-none', className)}
    >
      {children}
    </motion.div>
  );
}

export const STUDENT_DOCK_ITEMS = [
  { id: 1, key: 'home', label: 'Home', icon: Home },
  { id: 2, key: 'prescription', label: 'Prescription', icon: FileText },
  { id: 3, key: 'health', label: 'Medical History', icon: HeartPulse },
  { id: 4, key: 'help', label: 'Emergency', icon: AlertTriangle, urgent: true },
  { id: 5, key: 'account', label: 'Account', icon: User },
];

export function StudentDock({
  tab = 'home',
  onChange = () => {},
  items = STUDENT_DOCK_ITEMS,
  className = '',
}) {
  return (
    <div className={cn('fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-auto', className)}>
      <Dock className="items-end pb-2.5">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = tab === item.key;
          return (
            <DockItem
              key={item.id || item.key}
              isActive={isActive}
              isUrgent={item.urgent}
              onClick={() => onChange(item.key)}
            >
              <DockLabel>{item.label}</DockLabel>
              <DockIcon>
                <Icon className={cn('w-full h-full', item.urgent && !isActive ? 'text-rose-600' : '')} />
              </DockIcon>
            </DockItem>
          );
        })}
      </Dock>
    </div>
  );
}

function AppleStyleDock({
  items = [
    { title: 'Home', icon: <Home className="h-full w-full text-slate-700" />, href: '#' },
    { title: 'Prescription', icon: <FileText className="h-full w-full text-slate-700" />, href: '#' },
    { title: 'Medical History', icon: <HeartPulse className="h-full w-full text-slate-700" />, href: '#' },
    { title: 'Emergency', icon: <AlertTriangle className="h-full w-full text-rose-600" />, href: '#' },
    { title: 'Account', icon: <User className="h-full w-full text-slate-700" />, href: '#' },
  ],
}) {
  return (
    <div className="fixed bottom-4 sm:bottom-6 left-1/2 max-w-full -translate-x-1/2 z-50">
      <Dock className="items-end pb-2.5">
        {items.map((item, idx) => (
          <DockItem
            key={idx}
            className="aspect-square rounded-2xl bg-slate-100 hover:bg-slate-200/80 border border-slate-200/80 shadow-xs"
            onClick={item.onClick}
          >
            <DockLabel>{item.title}</DockLabel>
            <DockIcon>{item.icon}</DockIcon>
          </DockItem>
        ))}
      </Dock>
    </div>
  );
}

export { Dock, DockIcon, DockItem, DockLabel, AppleStyleDock };
export default StudentDock;
