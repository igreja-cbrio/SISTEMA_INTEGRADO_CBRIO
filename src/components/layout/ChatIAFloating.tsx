"use client";

import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const CBRIO_PRIMARY = '#00B39D';

/**
 * Floating button bottom-right · leva pra /assistente-ia
 * Substituiu o SpotifyPlayer (removido em 2026-05-26).
 */
export default function ChatIAFloating() {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate('/assistente-ia')}
      aria-label="Abrir Assistente IA"
      title="Assistente IA · Chat, fila de aprovação e auditorias"
      className={cn(
        'fixed bottom-6 right-6 z-50',
        'h-14 w-14 rounded-full shadow-lg',
        'flex items-center justify-center',
        'text-white hover:scale-110 active:scale-95',
        'transition-all duration-150',
        'ring-2 ring-white/20 hover:ring-white/40'
      )}
      style={{
        background: `linear-gradient(135deg, ${CBRIO_PRIMARY} 0%, #008e7d 100%)`,
        boxShadow: `0 8px 24px ${CBRIO_PRIMARY}55, 0 2px 8px rgba(0,0,0,0.12)`,
      }}
    >
      <Sparkles className="h-6 w-6" strokeWidth={2.2} />
    </button>
  );
}
