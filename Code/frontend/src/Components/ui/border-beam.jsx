import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export function BorderBeam({
  className = '',
  duration = 8,
  colorFrom = '#2dd4bf',
  colorTo = '#0d9488',
}) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 rounded-[inherit] overflow-hidden', className)}>
      <motion.div
        animate={{ rotate: 360 }}
        transition={{
          duration,
          repeat: Infinity,
          ease: 'linear',
        }}
        className="absolute -inset-[150%] m-auto w-[400%] h-[400%]"
        style={{
          background: `conic-gradient(from 0deg, transparent 0deg, transparent 270deg, ${colorTo} 315deg, ${colorFrom} 360deg)`,
        }}
      />
      <div className="absolute inset-[1px] rounded-[inherit] bg-[#0c2827]/95 backdrop-blur-xl" />
    </div>
  );
}

export default BorderBeam;
