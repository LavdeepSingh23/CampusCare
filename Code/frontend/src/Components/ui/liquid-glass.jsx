// @ts-nocheck
'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

// High-Performance Advanced Optical SVG Glass Filter (Specular Point Light + Caustic Wave Distortion)
export const LiquidGlassFilter = () => (
  <svg
    style={{
      position: 'absolute',
      width: 0,
      height: 0,
      pointerEvents: 'none',
      visibility: 'hidden',
    }}
    aria-hidden="true"
  >
    <defs>
      {/* Primary Specular & Caustic Light Refraction Filter */}
      <filter
        id="glass-distortion"
        x="0%"
        y="0%"
        width="100%"
        height="100%"
        filterUnits="objectBoundingBox"
      >
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.001 0.005"
          numOctaves="1"
          seed="17"
          result="turbulence"
        />
        <feComponentTransfer in="turbulence" result="mapped">
          <feFuncR type="gamma" amplitude="1" exponent="10" offset="0.5" />
          <feFuncG type="gamma" amplitude="0" exponent="1" offset="0" />
          <feFuncB type="gamma" amplitude="0" exponent="1" offset="0.5" />
        </feComponentTransfer>
        <feGaussianBlur in="turbulence" stdDeviation="3" result="softMap" />
        <feSpecularLighting
          in="softMap"
          surfaceScale="5"
          specularConstant="1"
          specularExponent="100"
          lightingColor="white"
          result="specLight"
        >
          <fePointLight x="-200" y="-200" z="300" />
        </feSpecularLighting>
        <feComposite
          in="specLight"
          operator="arithmetic"
          k1="0"
          k2="1"
          k3="1"
          k4="0"
          result="litImage"
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="softMap"
          scale="25"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>

      {/* Secondary Fluid Wave Filter (Backward compatible with #glass-blur) */}
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
          baseFrequency="0.002 0.006"
          numOctaves="1"
          result="turbulence"
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="turbulence"
          scale="20"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </defs>
  </svg>
);

export const GlassFilter = LiquidGlassFilter;

// Core LiquidGlassCard Component with Tactile Jelly-Glass Optics & Zero Neon
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
  style = {},
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

  // Physically modeled specular rim highlights (top-left glint + bottom-right edge bevel)
  const shadowStyles = {
    none: 'inset 0 0 0 0 rgba(255, 255, 255, 0)',
    xs: 'inset 1.5px 1.5px 1px 0 rgba(255, 255, 255, 0.35), inset -1px -1px 1px 1px rgba(255, 255, 255, 0.18)',
    sm: 'inset 2px 2px 1.5px 0 rgba(255, 255, 255, 0.45), inset -1.5px -1.5px 1.5px 1px rgba(255, 255, 255, 0.22)',
    md: 'inset 2.5px 2.5px 2px 0 rgba(255, 255, 255, 0.5), inset -2px -2px 2px 1px rgba(255, 255, 255, 0.25)',
    lg: 'inset 3.5px 3.5px 2.5px 0 rgba(255, 255, 255, 0.55), inset -2.5px -2.5px 2.5px 1px rgba(255, 255, 255, 0.3)',
    xl: 'inset 4.5px 4.5px 3.5px 0 rgba(255, 255, 255, 0.6), inset -3.5px -3.5px 3.5px 1.5px rgba(255, 255, 255, 0.35)',
    '2xl':
      'inset 6px 6px 4px 0 rgba(255, 255, 255, 0.65), inset -4.5px -4.5px 4px 2px rgba(255, 255, 255, 0.4)',
  };

  // Pure neutral white/dark ambient depth (100% free of neon tints)
  const glowStyles = {
    none: '0 4px 12px rgba(0, 0, 0, 0.15)',
    xs: '0 6px 16px rgba(0, 0, 0, 0.2), 0 0 16px rgba(255, 255, 255, 0.04)',
    sm: '0 10px 30px rgba(0, 0, 0, 0.28), 0 0 24px rgba(255, 255, 255, 0.06)',
    md: '0 14px 38px rgba(0, 0, 0, 0.35), 0 0 32px rgba(255, 255, 255, 0.08)',
    lg: '0 18px 46px rgba(0, 0, 0, 0.4), 0 0 40px rgba(255, 255, 255, 0.1)',
    xl: '0 24px 56px rgba(0, 0, 0, 0.45), 0 0 48px rgba(255, 255, 255, 0.12)',
    '2xl':
      '0 30px 70px rgba(0, 0, 0, 0.5), 0 0 60px rgba(255, 255, 255, 0.15)',
  };

  const containerVariants = expandable
    ? {
        collapsed: {
          width: width || 'auto',
          height: height || 'auto',
          transition: {
            duration: 0.4,
            ease: [0.175, 0.885, 0.32, 2.2],
          },
        },
        expanded: {
          width: expandedWidth || 'auto',
          height: expandedHeight || 'auto',
          transition: {
            duration: 0.4,
            ease: [0.175, 0.885, 0.32, 2.2],
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
                bounceDamping: 12,
                power: 0.3,
              }
            : undefined,
          whileDrag: draggable ? { scale: 1.02 } : undefined,
          whileHover: { scale: 1.01 },
          whileTap: { scale: 0.99 },
        }
      : {
          onClick,
        };

  return (
    <motion.div
      className={cn(
        'relative overflow-hidden transition-transform duration-500 ease-out',
        draggable ? 'cursor-grab active:cursor-grabbing' : '',
        expandable ? 'cursor-pointer' : '',
        className
      )}
      style={{
        borderRadius,
        transitionTimingFunction: 'cubic-bezier(0.175, 0.885, 0.32, 1.4)',
        boxShadow: glowStyles[glowIntensity] || glowStyles.sm,
        ...(width && !expandable && { width }),
        ...(height && !expandable && { height }),
        ...style,
      }}
      {...motionProps}
      {...props}
    >
      {/* ── Layer 1: Optical Distortion Refraction Wave (Hardware Accelerated) ── */}
      <div
        className="absolute inset-0 z-0 pointer-events-none overflow-hidden"
        style={{
          borderRadius,
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
          filter: 'url(#glass-distortion)',
          isolation: 'isolate',
        }}
      />

      {/* ── Layer 2: Deep Frosted Glass Face Diffusion & Ambient Glow ── */}
      <div
        className={cn(
          'absolute inset-0 z-10 pointer-events-none',
          blurClasses[blurIntensity] || blurClasses.xl
        )}
        style={{
          borderRadius,
          background:
            'linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.03) 50%, rgba(255, 255, 255, 0.08) 100%)',
          backdropFilter: 'blur(16px) saturate(180%)',
          WebkitBackdropFilter: 'blur(16px) saturate(180%)',
        }}
      />

      {/* ── Layer 3: Physical Beveled Rim Edge Highlight ── */}
      <div
        className="absolute inset-0 z-20 pointer-events-none overflow-hidden"
        style={{
          borderRadius,
          boxShadow: shadowStyles[shadowIntensity] || shadowStyles.md,
        }}
      />

      {/* ── Layer 4: Interactive Content Container ── */}
      <div className="relative z-30 w-full h-full">{children}</div>
    </motion.div>
  );
};

// Elastic Glass Button with Tactile Physics
export const GlassButton = ({
  children,
  href,
  onClick,
  className = '',
  ...props
}) => {
  const content = (
    <div
      onClick={onClick}
      className={cn(
        'relative inline-flex items-center justify-center font-semibold overflow-hidden text-white cursor-pointer px-8 py-3.5 rounded-full transition-all duration-500 hover:scale-[1.02] active:scale-[0.98]',
        className
      )}
      style={{
        transitionTimingFunction: 'cubic-bezier(0.175, 0.885, 0.32, 2.2)',
        boxShadow:
          '0 8px 24px rgba(0, 0, 0, 0.3), inset 2px 2px 1.5px 0 rgba(255, 255, 255, 0.5), inset -1.5px -1.5px 1.5px 1px rgba(255, 255, 255, 0.2)',
      }}
      {...props}
    >
      {/* Glass Layers */}
      <div
        className="absolute inset-0 z-0 pointer-events-none rounded-inherit"
        style={{
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          filter: 'url(#glass-distortion)',
        }}
      />
      <div
        className="absolute inset-0 z-10 pointer-events-none rounded-inherit"
        style={{
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(14px)',
        }}
      />
      <div className="relative z-30 flex items-center justify-center gap-2">{children}</div>
    </div>
  );

  return href ? (
    <a href={href} className="inline-block">
      {content}
    </a>
  ) : (
    content
  );
};

// Glass Effect for general element wrapping
export const GlassEffect = LiquidGlassCard;

export default LiquidGlassCard;
