import React, { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export function SpotlightCard({
  children,
  className = '',
  spotlightColor = 'rgba(20, 184, 166, 0.22)',
}) {
  const divRef = useRef(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = (e) => {
    if (!divRef.current) return;
    const rect = divRef.current.getBoundingClientRect();
    setPosition({ x: e.client - rect.left, y: e.client - rect.top });
  };

  const handleMouseEnter = () => setOpacity(1);
  const handleMouseLeave = () => setOpacity(0);

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'relative rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-md overflow-hidden transition-all duration-300 hover:border-teal-500/40 hover:shadow-[0_12px_40px_rgba(0,0,0,0.35)]',
        className
      )}
    >
      <div
        className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300"
        style={{
          opacity,
          background: `radial-gradient(400px circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 70%)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export default SpotlightCard;
