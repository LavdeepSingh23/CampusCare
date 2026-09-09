import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { cn } from '@/lib/utils';

export function BlurText({
  text = '',
  delay = 0.05,
  className = '',
  animateBy = 'words', // 'words' | 'letters'
  direction = 'top', // 'top' | 'bottom'
  onAnimationComplete,
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-20px' });

  const elements = animateBy === 'words' ? text.split(' ') : text.split('');

  const defaultFrom = {
    filter: 'blur(10px)',
    opacity: 0,
    y: direction === 'top' ? -18 : 18,
  };

  const defaultTo = {
    filter: 'blur(0px)',
    opacity: 1,
    y: 0,
  };

  return (
    <span ref={ref} className={cn('inline-flex flex-wrap', className)}>
      {elements.map((element, index) => (
        <motion.span
          key={index}
          initial={defaultFrom}
          animate={isInView ? defaultTo : defaultFrom}
          transition={{
            duration: 0.5,
            delay: index * delay,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          onAnimationComplete={
            index === elements.length - 1 ? onAnimationComplete : undefined
          }
          className="inline-block mr-[0.25em] last:mr-0"
        >
          {element === ' ' ? '\u00A0' : element}
        </motion.span>
 ))}
 </span>
 );
}

export default BlurText;
