import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface Logo {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  rotation: number;
  speed: number;
  dur: number;
}

// Fundo animado com o coração da CBRio flutuando · usado nos formulários públicos.
export default function AnimatedBackground() {
  const [logos, setLogos] = useState<Logo[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    const count = isMobile ? 7 : 14;
    setLogos(Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: isMobile ? 34 + Math.random() * 40 : 46 + Math.random() * 64,
      opacity: 0.05 + Math.random() * 0.09,
      rotation: Math.random() * 40 - 20,
      speed: 0.08 + Math.random() * 0.22,
      dur: 3 + Math.random() * 2.5,
    })));
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setLogos(prev => prev.map(l => ({
        ...l,
        y: l.y <= -12 ? 112 : l.y - l.speed,
      })));
    }, 50);
    return () => clearInterval(id);
  }, []);

  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {logos.map(l => (
        <motion.img
          key={l.id}
          src="/logo-cbrio-icon.png"
          alt=""
          className="absolute select-none"
          style={{
            left: `${l.x}%`,
            top: `${l.y}%`,
            width: l.size,
            height: l.size,
            opacity: l.opacity,
            rotate: l.rotation,
          }}
          animate={{ y: [0, -18, 0] }}
          transition={{ duration: l.dur, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}
