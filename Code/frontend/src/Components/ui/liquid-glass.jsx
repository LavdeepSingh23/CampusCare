// @ts-nocheck
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export const LiquidGlassFilter = () => (
  <svg
    className="hidden w-0 h-0 absolute pointer-events-none"
    aria-hidden="true"
  >
    <defs>
      <filter
        id="glass-blur"
        x="0"
        y="0"
        width="100%"
        height="100%"
        filterUnits="objectBoundingBox"
      >
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.003 0.007"
          numOctaves="1"
          result="turbulence"
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="turbulence"
          scale="30"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </defs>
  </svg>
);

export const LiquidGlassCard = ({
  children,
  className = '',
  draggable = false,
  expandable = false,
  width,
  height,
  expandedWidth,
  expandedHeight,
  blurIntensity = 'xl',
  borderRadius = '24px',
  glowIntensity = 'sm',
  shadowIntensity = 'md',
  onClick,
  ...props
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggleExpansion = (e) => {
    if (!expandable) return;
    if (e.target?.closest?.('a, button, input, select, textarea')) return;
    setIsExpanded(!isExpanded);
    if (onClick) onClick(e);
  };

  const blurClasses = {
    sm: 'backdrop-blur-sm',
    md: 'backdrop-blur-md',
    lg: 'backdrop-blur-lg',
    xl: 'backdrop-blur-xl',
  };

  // Physical beveled glass inner highlights (specular rim lighting) - pure neutral white alpha, ZERO neon
  const shadowStyles = {
    none: 'inset 0 0 0 0 rgba(255, 255, 255, 0)',
    xs: 'inset 1px 1px 1px 0 rgba(255, 255, 255, 0.25), inset -1px -1px 1px 0 rgba(255, 255, 255, 0.15)',
    sm: 'inset 2px 2px 2px 0 rgba(255, 255, 255, 0.3), inset -2px -2px 2px 0 rgba(255, 255, 255, 0.2)',
    md: 'inset 2.5px 2.5px 3px 0 rgba(255, 255, 255, 0.35), inset -2px -2px 3px 0 rgba(255, 255, 255, 0.22)',
    lg: 'inset 3.5px 3.5px 4px 0 rgba(255, 255, 255, 0.45), inset -3px -3px 4px 0 rgba(255, 255, 255, 0.28)',
    xl: 'inset 4.5px 4.5px 6px 0 rgba(255, 255, 255, 0.5), inset -4px -4px 6px 0 rgba(255, 255, 255, 0.32)',
    '2xl':
      'inset 6px 6px 8px 0 rgba(255, 255, 255, 0.55), inset -6px -6px 8px 0 rgba(255, 255, 255, 0.38)',
  };

  // Outer ambient glass shadows & soft depth
  const glowStyles = {
    none: '0 4px 12px rgba(0, 0, 0, 0.1)',
    xs: '0 4px 14px rgba(0, 0, 0, 0.2), 0 0 16px rgba(255, 255, 255, 0.03)',
    sm: '0 8px 24px rgba(0, 0, 0, 0.25), 0 0 24px rgba(255, 255, 255, 0.05)',
    md: '0 12px 32px rgba(0, 0, 0, 0.3), 0 0 32px rgba(255, 255, 255, 0.07)',
    lg: '0 16px 40px rgba(0, 0, 0, 0.35), 0 0 40px rgba(255, 255, 255, 0.09)',
    xl: '0 20px 48px rgba(0, 0, 0, 0.4), 0 0 48px rgba(255, 255, 255, 0.12)',
    '2xl':
      '0 24px 60px rgba(0, 0, 0, 0.45), 0 0 60px rgba(255, 255, 255, 0.15)',
  };

  const containerVariants = expandable
    ? {
        collapsed: {
          width: width || 'auto',
          height: height || 'auto',
          transition: {
            duration: 0.4,
            ease: [0.5, 1.5, 0.5, 1],
          },
        },
        expanded: {
          width: expandedWidth || 'auto',
          height: expandedHeight || 'auto',
          transition: {
            duration: 0.4,
            ease: [0.5, 1.5, 0.5, 1],
          },
        },
      }
    : {};

  const motionProps =
    draggable || expandable
      ? {
          variants: expandable ? containerVariants : undefined,
          animate: expandable
            ? isExpanded
              ? 'expanded'
              : 'collapsed'
            : undefined,
          onClick: expandable ? handleToggleExpansion : onClick,
          drag: draggable,
          dragConstraints: draggable
            ? { left: 0, right: 0, top: 0, bottom: 0 }
            : undefined,
          dragElastic: draggable ? 0.3 : undefined,
          dragTransition: draggable
            ? {
                bounceStiffness: 300,
                bounceDamping: 10,
                power: 0.3,
              }
            : undefined,
          whileDrag: draggable ? { scale: 1.02 } : undefined,
          whileHover: { scale: 1.005 },
          whileTap: { scale: 0.995 },
        }
      : {
          onClick,
        };

  return (
    <>
      <motion.div
        className={cn(
          'relative overflow-hidden',
          draggable ? 'cursor-grab active:cursor-grabbing' : '',
          expandable ? 'cursor-pointer' : '',
          className
        )}
        style={{
          borderRadius,
          ...(width && !expandable && { width }),
          ...(height && !expandable && { height }),
        }}
        {...motionProps}
        {...props}
      >
        {/* 1. Bend Layer (Backdrop blur with physical liquid distortion) */}
        <div
          className={`absolute inset-0 ${blurClasses[blurIntensity] || blurClasses.xl} z-0 pointer-events-none`}
          style={{
            borderRadius,
            filter: 'url(#glass-blur)',
          }}
        />

        {/* 2. Face Layer (Soft depth shadow & ambient glow) */}
        <div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{
            borderRadius,
            boxShadow: glowStyles[glowIntensity] || glowStyles.sm,
          }}
        />

        {/* 3. Edge Layer (Specular inner bevel highlight rim) */}
        <div
          className="absolute inset-0 z-20 pointer-events-none"
          style={{
            borderRadius,
            boxShadow: shadowStyles[shadowIntensity] || shadowStyles.md,
          }}
        />

        {/* 4. Content */}
        <div className="relative z-30 w-full h-full">{children}</div>
      </motion.div>
    </>
  );
};

export default LiquidGlassCard;
