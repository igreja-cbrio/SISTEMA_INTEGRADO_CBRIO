"use client";

import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { Circle } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function ElegantShape({
  className,
  delay = 0,
  width = 400,
  height = 100,
  rotate = 0,
  gradient = "from-[hsl(var(--primary))]/[0.08]",
}: {
  className?: string;
  delay?: number;
  width?: number;
  height?: number;
  rotate?: number;
  gradient?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -150, rotate: rotate - 15 }}
      animate={{ opacity: 1, y: 0, rotate: rotate }}
      transition={{
        duration: 2.4,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={cn("absolute", className)}
    >
      <motion.div
        animate={{ y: [0, 15, 0] }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        style={{ width, height }}
        className="relative"
      >
        <div
          className={cn(
            "absolute inset-0 rounded-full",
            "bg-gradient-to-r to-transparent",
            gradient,
            "blur-[2px]"
          )}
        />
        <div
          className={cn(
            "absolute inset-[1px] rounded-full",
            "bg-gradient-to-r to-transparent",
            gradient,
            "opacity-50 blur-[1px]"
          )}
        />
      </motion.div>
    </motion.div>
  );
}

function LoginShapesBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-br from-[#00B39D]/[0.05] via-transparent to-[#00736B]/[0.05]" />

      <ElegantShape
        delay={0.3}
        width={600}
        height={140}
        rotate={12}
        gradient="from-[#00B39D]/[0.12]"
        className="top-[-10%] left-[-5%]"
      />
      <ElegantShape
        delay={0.5}
        width={500}
        height={120}
        rotate={-15}
        gradient="from-[#00736B]/[0.10]"
        className="top-[15%] right-[-10%]"
      />
      <ElegantShape
        delay={0.4}
        width={300}
        height={80}
        rotate={-8}
        gradient="from-[#00B39D]/[0.08]"
        className="bottom-[5%] left-[5%]"
      />
      <ElegantShape
        delay={0.6}
        width={200}
        height={60}
        rotate={20}
        gradient="from-[#009985]/[0.10]"
        className="top-[60%] right-[5%]"
      />
      <ElegantShape
        delay={0.7}
        width={150}
        height={40}
        rotate={-25}
        gradient="from-[#00736B]/[0.08]"
        className="top-[35%] left-[15%]"
      />
    </div>
  );
}

export { LoginShapesBackground };
