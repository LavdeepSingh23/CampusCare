import { useRef, useEffect, useState } from 'react';
import './GooeyNav.css';

const GooeyNav = ({
  items,
  animationTime = 500,
  particleCount = 14,
  particleDistances = [70, 10],
  particleR = 90,
  timeVariance = 200,
  colors = ['#2dd4bf', '#14b8a6', '#10b981', '#34d399', '#5eead4'],
  initialActiveIndex = 0,
  activeIndex: controlledIndex,
  onChange,
}) => {
  const containerRef = useRef(null);
  const navRef = useRef(null);
  const pillRef = useRef(null);
  const particleSpotRef = useRef(null);
  const [internalActiveIndex, setInternalActiveIndex] = useState(initialActiveIndex);

  const activeIndex = controlledIndex !== undefined ? controlledIndex : internalActiveIndex;

  const noise = (n = 1) => n / 2 - Math.random() * n;

  const getXY = (distance, pointIndex, totalPoints) => {
    const angle = ((360 + noise(8)) / totalPoints) * pointIndex * (Math.PI / 180);
    return [distance * Math.cos(angle), distance * Math.sin(angle)];
  };

  const createParticle = (i, t, d, r) => {
    let rotate = noise(r / 10);
    return {
      start: getXY(d[0], particleCount - i, particleCount),
      end: getXY(d[1] + noise(7), particleCount - i, particleCount),
      time: t,
      scale: 1 + noise(0.2),
      color: colors[Math.floor(Math.random() * colors.length)],
      rotate: rotate > 0 ? (rotate + r / 20) * 10 : (rotate - r / 20) * 10,
    };
  };

  const makeParticles = (spotElement) => {
    if (!spotElement) return;
    const d = particleDistances;
    const r = particleR;
    const bubbleTime = animationTime * 2 + timeVariance;
    spotElement.style.setProperty('--time', `${bubbleTime}ms`);

    // Clean previous particles
    const existing = spotElement.querySelectorAll('.particle');
    existing.forEach((p) => {
      try {
        spotElement.removeChild(p);
      } catch {
        // Ignore
      }
    });

    for (let i = 0; i < particleCount; i++) {
      const t = animationTime * 1.5 + noise(timeVariance);
      const p = createParticle(i, t, d, r);

      setTimeout(() => {
        if (!spotElement) return;
        const particle = document.createElement('span');
        const point = document.createElement('span');
        particle.classList.add('particle');
        particle.style.setProperty('--start-x', `${p.start[0]}px`);
        particle.style.setProperty('--start-y', `${p.start[1]}px`);
        particle.style.setProperty('--end-x', `${p.end[0]}px`);
        particle.style.setProperty('--end-y', `${p.end[1]}px`);
        particle.style.setProperty('--time', `${p.time}ms`);
        particle.style.setProperty('--scale', `${p.scale}`);
        particle.style.setProperty('--color', `${p.color}`);
        particle.style.setProperty('--rotate', `${p.rotate}deg`);

        point.classList.add('point');
        particle.appendChild(point);
        spotElement.appendChild(particle);

        setTimeout(() => {
          try {
            spotElement.removeChild(particle);
          } catch {
            // Ignore
          }
        }, t);
      }, 20);
    }
  };

  const updatePillPosition = (element) => {
    if (!containerRef.current || !pillRef.current || !element) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const pos = element.getBoundingClientRect();

    const left = pos.x - containerRect.x;
    const top = pos.y - containerRect.y;
    const width = pos.width;
    const height = pos.height;

    pillRef.current.style.left = `${left}px`;
    pillRef.current.style.top = `${top}px`;
    pillRef.current.style.width = `${width}px`;
    pillRef.current.style.height = `${height}px`;

    if (particleSpotRef.current) {
      particleSpotRef.current.style.left = `${left + width / 2}px`;
      particleSpotRef.current.style.top = `${top + height / 2}px`;
    }
  };

  const handleClick = (e, index) => {
    e.preventDefault();
    const liEl = navRef.current?.querySelectorAll('li')[index];
    const item = items[index];

    if (item && item.onClick) {
      item.onClick(e);
    }
    if (onChange) {
      onChange(index, item);
    }

    if (activeIndex === index) return;

    setInternalActiveIndex(index);
    if (liEl) {
      updatePillPosition(liEl);
    }
    if (particleSpotRef.current) {
      makeParticles(particleSpotRef.current);
    }
  };

  useEffect(() => {
    if (!navRef.current || !containerRef.current) return;
    const activeLi = navRef.current.querySelectorAll('li')[activeIndex];
    if (activeLi) {
      updatePillPosition(activeLi);
    }

    const resizeObserver = new ResizeObserver(() => {
      const currentActiveLi = navRef.current?.querySelectorAll('li')[activeIndex];
      if (currentActiveLi) {
        updatePillPosition(currentActiveLi);
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [activeIndex]);

  return (
    <div className="gooey-nav-container" ref={containerRef}>
      {/* Dynamic sliding white pill backdrop */}
      <span className="active-pill-bg" ref={pillRef} />

      {/* Scoped particle emission spot with zero external bleed */}
      <div className="effect-container">
        <span className="particle-spot" ref={particleSpotRef} />
      </div>

      <nav>
        <ul ref={navRef}>
          {items.map((item, index) => {
            const isActive = activeIndex === index;
            return (
              <li
                key={index}
                className={isActive ? 'active' : ''}
                onClick={(e) => handleClick(e, index)}
              >
                <button
                  type="button"
                  aria-selected={isActive}
                >
                  {item.icon && <span className="shrink-0">{item.icon}</span>}
                  <span className="whitespace-nowrap">{item.label}</span>
                  {item.badge !== undefined && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ml-0.5 shrink-0 transition-colors ${
                        isActive
                          ? 'bg-teal-800 text-white'
                          : 'bg-teal-500/25 text-teal-200 border border-teal-400/30'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
};

export default GooeyNav;
