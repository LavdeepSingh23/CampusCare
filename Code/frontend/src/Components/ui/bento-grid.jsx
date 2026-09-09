import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ArrowRight } from 'lucide-react';

export function BentoGrid({ children, className = '' }) {
  return (
    <div
      className={cn(
        'grid w-full grid-cols-1 md:grid-cols-3 gap-5 max-w-6xl mx-auto px-4 sm:px-6',
        className
      )}
    >
      {children}
    </div>
  );
}

export function BentoCard({
  name,
  className = '',
  background,
  Icon,
  description,
  href,
  cta = 'Explore feature',
  onCtaClick,
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'group relative col-span-3 flex flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-6 sm:p-7 backdrop-blur-md transition-all duration-300 hover:border-teal-500/40 hover:bg-white/[0.07] hover:shadow-[0_12px_40px_rgba(0,0,0,0.35)]',
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-300 group-hover:opacity-90">
        {background}
      </div>

      <div className="relative z-10 flex items-center justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-300 shadow-sm transition-transform duration-300 group-hover:scale-105">
          {Icon && <Icon className="h-5 w-5" />}
        </div>
      </div>

      <div className="relative z-10 mt-6">
        <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
          {name}
        </h3>
        <p className="mt-2 text-xs sm:text-sm text-teal-100/70 leading-relaxed max-w-lg">
          {description}
        </p>

        {(href || onCtaClick) && (
          <button
            type="button"
            onClick={onCtaClick}
            className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-teal-300 group-hover:text-teal-200 transition-colors cursor-pointer"
          >
            <span>{cta}</span>
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

export default BentoGrid;
