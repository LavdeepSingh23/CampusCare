"use client";

import React from "react";

// Types
export interface GlassEffectProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  href?: string;
  target?: string;
  onClick?: () => void;
}

export interface DockIcon {
  src: string;
  alt: string;
  onClick?: () => void;
}

// Glass Effect Wrapper Component - GPU Accelerated & Zero-Lag
export const GlassEffect: React.FC<GlassEffectProps> = ({
  children,
  className = "",
  style = {},
  href,
  target = "_blank",
  onClick,
}) => {
  const glassStyle: React.CSSProperties = {
    boxShadow:
      "0 8px 32px 0 rgba(0, 0, 0, 0.25), 0 2px 6px 0 rgba(0, 0, 0, 0.12)",
    transform: "translateZ(0)",
    WebkitTransform: "translateZ(0)",
    ...style,
  };

  const content = (
    <div
      onClick={onClick}
      className={`relative flex font-semibold overflow-hidden cursor-pointer transition-transform duration-300 ease-out will-change-transform ${className}`}
      style={glassStyle}
    >
      {/* 1. GPU Accelerated Hardware Backdrop Blur Layer */}
      <div
        className="absolute inset-0 z-0 rounded-inherit pointer-events-none"
        style={{
          backdropFilter: "blur(14px) saturate(170%)",
          WebkitBackdropFilter: "blur(14px) saturate(170%)",
          backgroundColor: "rgba(255, 255, 255, 0.08)",
          transform: "translateZ(0)",
        }}
      />

      {/* 2. Liquid Glass Specular & Inner Rim Refraction */}
      <div
        className="absolute inset-0 z-10 rounded-inherit pointer-events-none overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0.03) 45%, rgba(255, 255, 255, 0.12) 100%)",
          boxShadow:
            "inset 1.5px 1.5px 2px 0 rgba(255, 255, 255, 0.45), inset -1px -1px 2px 0 rgba(255, 255, 255, 0.15)",
        }}
      />

      {/* 3. Lightweight Optical Liquid Refraction Wave */}
      <div
        className="absolute inset-0 z-20 rounded-inherit pointer-events-none opacity-35 mix-blend-overlay"
        style={{
          filter: "url(#glass-distortion)",
          transform: "translateZ(0)",
          contain: "paint",
        }}
      />

      {/* 4. Content Container */}
      <div className="relative z-30 w-full">{children}</div>
    </div>
  );

  return href ? (
    <a href={href} target={target} rel="noopener noreferrer" className="block">
      {content}
    </a>
  ) : (
    content
  );
};

// Dock Component - High Performance GPU scale transitions
export const GlassDock: React.FC<{ icons: DockIcon[]; href?: string }> = ({
  icons,
  href,
}) => (
  <GlassEffect
    href={href}
    className="rounded-3xl p-3 hover:scale-[1.02] active:scale-[0.98] transition-transform duration-300 ease-out"
  >
    <div className="flex items-center justify-center gap-2 rounded-3xl p-2 overflow-hidden">
      {icons.map((icon, index) => (
        <img
          key={index}
          src={icon.src}
          alt={icon.alt}
          className="w-12 h-12 sm:w-14 sm:h-14 transition-transform duration-300 hover:scale-110 active:scale-95 cursor-pointer object-contain"
          onClick={icon.onClick}
        />
      ))}
    </div>
  </GlassEffect>
);

// Button Component - High Performance GPU scale transitions (no layout thrashing)
export const GlassButton: React.FC<{
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
}> = ({ children, href, onClick, className = "" }) => (
  <GlassEffect
    href={href}
    onClick={onClick}
    className={`rounded-full sm:rounded-3xl px-8 sm:px-10 py-3.5 sm:py-4 hover:scale-[1.02] active:scale-[0.98] transition-transform duration-300 ease-out overflow-hidden text-white ${className}`}
  >
    <div className="flex items-center justify-center pointer-events-none">
      {children}
    </div>
  </GlassEffect>
);

// High-Performance SVG Filter Component (GPU-Friendly, Zero CPU Stalling)
export const GlassFilter: React.FC = () => (
  <svg
    style={{
      position: "absolute",
      width: 0,
      height: 0,
      pointerEvents: "none",
      visibility: "hidden",
    }}
    aria-hidden="true"
  >
    <filter
      id="glass-distortion"
      x="-10%"
      y="-10%"
      width="120%"
      height="120%"
      filterUnits="objectBoundingBox"
      primitiveUnits="userSpaceOnUse"
      colorInterpolationFilters="sRGB"
    >
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.018 0.018"
        numOctaves="1"
        seed="17"
        result="turbulence"
      />
      <feComponentTransfer in="turbulence" result="mapped">
        <feFuncR type="gamma" amplitude="1" exponent="1.5" offset="0" />
        <feFuncG type="gamma" amplitude="1" exponent="1.5" offset="0" />
      </feComponentTransfer>
      <feDisplacementMap
        in="SourceGraphic"
        in2="mapped"
        scale="12"
        xChannelSelector="R"
        yChannelSelector="G"
      />
    </filter>
  </svg>
);

// Main Demo Component
export const Component = () => {
  const dockIcons: DockIcon[] = [
    {
      src: "https://cdn.21st.dev/assets/mirror/8d/8d2757d81dfac86570f4c8836c7406741afce9309493d7d32a5176dfb48604b6.png",
      alt: "Claude",
    },
    {
      src: "https://cdn.21st.dev/assets/mirror/a7/a7f5c3a20ee7e3979c200ae2de37dee2396d7b2eae8da7c5c294b1f308f8ebe3.png",
      alt: "Finder",
    },
    {
      src: "https://cdn.21st.dev/assets/mirror/06/06182c64d1993c122cceffea2e27a04c36a824f54b4a01163547b77f197f37bc.png",
      alt: "Chatgpt",
    },
    {
      src: "https://cdn.21st.dev/assets/mirror/b4/b4b6b0474a5074704d0f627855076899d0f1ab61685645103d3839d56297a93a.png",
      alt: "Maps",
    },
    {
      src: "https://cdn.21st.dev/assets/mirror/c2/c208bfbd8c5ceaf0d16c20f77f769600c3ee2c3084934bb74273f348948dc192.png",
      alt: "Safari",
    },
    {
      src: "https://cdn.21st.dev/assets/mirror/ce/ce6c5811b78662b15db06143f35dca896cd78790a05e2f652a921d0c18fbc166.png",
      alt: "Steam",
    },
  ];

  return (
    <div
      className="min-h-screen h-full flex items-center justify-center font-light relative overflow-hidden w-full"
      style={{
        background: `url("https://cdn.21st.dev/assets/mirror/17/171c1b4f04924b3d3783eb3181616526d023c11de774861827927a3a863094f9.jpg") center center`,
        animation: "moveBackground 60s linear infinite",
      }}
    >
      <GlassFilter />

      <div className="flex flex-col gap-6 items-center justify-center w-full">
        <GlassDock icons={dockIcons} href="https://x.com/notsurajgaud" />

        <GlassButton href="https://x.com/notsurajgaud">
          <div className="text-xl text-white">
            <p>How can i help you today?</p>
          </div>
        </GlassButton>
      </div>
    </div>
  );
};

export default Component;
