/**
 * MotionReal — Apresentação com telas idênticas ao sistema real.
 * Rota pública: /motion-real
 * Simula um usuário navegando: Dashboard → Eventos → Financeiro → Membresia → RH
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Bell, Moon, LogOut, ChevronDown,
  CalendarDays, FolderKanban, Users, DollarSign,
  Truck, Tag, BookOpen, HandHelping, ShoppingCart,
  BrainCircuit, Map, Pause, Play, ChevronLeft, ChevronRight,
  Activity, Package, AlertTriangle, Clock,
  UsersRound, CheckCircle2, Circle, MoreHorizontal,
} from 'lucide-react';

// ── Paleta (idêntica ao sistema) ───────────────────────────────────────────────
const C = {
  bg: '#0a0a0a', card: '#161616', border: '#262626',
  text: '#e5e5e5', text2: '#a3a3a3', text3: '#737373',
  primary: '#00B39D', input: '#1e1e1e',
};

// ── Dimensões da demo (viewport fixo escalado) ─────────────────────────────────
const DW = 1280; // largura lógica
const DH = 732;  // altura lógica (inclui header de 52px)
const HH = 52;   // altura do header

// ── FakeHeader ─────────────────────────────────────────────────────────────────
function FakeHeader({ activeNav, onNav }) {
  const navItems = ['Administrativo', 'Projetos e Eventos', 'Ministerial', 'Criativo'];
  return (
    <div style={{
      height: HH, background: '#111111', borderBottom: `1px solid ${C.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 24px', flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 160 }}>
        <img src="/logo-cbrio-text.png" alt="CBRio" style={{ height: 28, objectFit: 'contain' }} />
      </div>

      {/* Nav */}
      <div style={{ display: 'flex', gap: 4 }}>
        {navItems.map(n => (
          <button
            key={n}
            onClick={() => onNav?.(n)}
            style={{
              padding: '6px 14px', borderRadius: 7, fontSize: 13, fontWeight: 500,
              background: activeNav === n ? `${C.primary}15` : 'transparent',
              color: activeNav === n ? C.primary : C.text2,
              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              transition: 'all 0.15s',
            }}
          >
            {n} <ChevronDown size={11} style={{ opacity: 0.5 }} />
          </button>
        ))}
      </div>

      {/* Right actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 160, justifyContent: 'flex-end' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
          border: `1px solid ${C.border}`, borderRadius: 7, color: C.text3, fontSize: 12,
        }}>
          <Search size={12} /> Buscar <kbd style={{ fontSize: 10, opacity: 0.5 }}>⌘K</kbd>
        </div>
        <button style={{ padding: 8, borderRadius: 7, border: 'none', background: 'transparent', color: C.text2, cursor: 'pointer' }}>
          <Moon size={15} />
        </button>
        <button style={{ position: 'relative', padding: 8, borderRadius: 7, border: 'none', background: 'transparent', color: C.text2, cursor: 'pointer' }}>
          <Bell size={15} />
          <span style={{
            position: 'absolute', top: 3, right: 3, width: 15, height: 15,
            background: C.primary, borderRadius: '50%', fontSize: 9, fontWeight: 700,
            color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>3</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 7, cursor: 'pointer' }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', background: `${C.primary}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: C.primary,
          }}>JS</div>
          <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>João</span>
        </div>
        <button style={{ padding: 8, borderRadius: 7, border: 'none', background: 'transparent', color: C.text2, cursor: 'pointer' }}>
          <LogOut size={15} />
        </button>
      </div>
    </div>
  );
}

export { FakeHeader, C, DW, DH, HH };
