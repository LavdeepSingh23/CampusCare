import React, { useEffect, useRef, useState } from "react";
import { useScroll, useTransform, motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function Timeline({ data = [], className = "" }) {
  const ref = useRef(null);
  const containerRef = useRef(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setHeight(rect.height);
    }
  }, [ref, data]);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 70%", "end 80%"],
  });

  const heightTransform = useTransform(scrollYProgress, [0, 1], [0, height]);
  const opacityTransform = useTransform(scrollYProgress, [0, 0.1], [0, 1]);

  return (
    <div
      ref={containerRef}
      className={cn('w-full relative max-w-5xl mx-auto px-4 sm:px-6 py-8', className)}
    >
      <div ref={ref} className="relative pb-10">
        {data.map((item, index) => (
          <div
            key={index}
            className="flex justify-start pt-10 md:pt-14 md:gap-10"
          >
            <div className="sticky flex flex-col md:flex-row z-30 items-center top-36 self-start max-w-xs lg:max-w-sm md:w-full">
              <div className="h-10 absolute left-3 md:left-3 w-10 rounded-full bg-[#0c2827] border-2 border-teal-500/50 flex items-center justify-center shadow-[0_0_15px_rgba(20,184,166,0.35)]">
                <div className="h-3.5 w-3.5 rounded-full bg-teal-400" />
              </div>
              <div className="hidden md:flex flex-col md:pl-20">
                <span className="text-xs uppercase font-semibold tracking-wider text-teal-400">Step 0{index + 1}</span>
                <h3 className="text-xl font-bold text-white tracking-tight">
                  {item.title}
                </h3>
              </div>
            </div>

            <div className="relative pl-20 pr-4 md:pl-4 w-full">
              <div className="md:hidden block mb-3">
                <span className="text-[11px] uppercase font-semibold tracking-wider text-teal-400">Step 0{index  + 1}</span>
                <h3 className="text-lg font-bold text-white">
                  {item.title}
                </h3>
              </div>
              {item.content}
            </div>
          </div>
        ))}
        <div
          style={{ height: height + 'px' }}
          className="absolute md:left-8 left-8 top-0 overflow-hidden w-[2px] bg-teal-500/20"
        >
          <motion.div
            style={{
              height: heightTransform,
              opacity: opacityTransform,
            }}
            className="absolute inset-x-0 top-0 w-[2px] bg-gradient-to-t from-teal-300 via-teal-400 to-transparent rounded-full shadow-[0_0_12px_rgba(45,212,191,0.8)]"
          />
        </div>
      </div>
    </div>
  );
}

export default Timeline;
