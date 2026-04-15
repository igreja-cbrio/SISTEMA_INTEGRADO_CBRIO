import { useEffect } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { playCheckinSound } from '@/lib/sounds';

interface SuccessOverlayProps {
  volunteerName: string;
  teamName?: string | null;
  positionName?: string | null;
  isUnscheduled?: boolean;
  onClose: () => void;
  duration?: number;
}

export default function SuccessOverlay({ volunteerName, teamName, positionName, isUnscheduled, onClose, duration = 3000 }: SuccessOverlayProps) {
  useEffect(() => {
    playCheckinSound();
    // Usuarios sem escala precisam ler o aviso — dobra o tempo
    const effectiveDuration = isUnscheduled ? Math.max(duration, 6000) : duration;
    const timer = setTimeout(onClose, effectiveDuration);
    return () => clearTimeout(timer);
  }, [onClose, duration, isUnscheduled]);

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/80 animate-in fade-in p-4" onClick={onClose}>
      <div className="flex flex-col items-center gap-4 text-white text-center p-8 max-w-lg">
        <CheckCircle2 className="h-24 w-24 text-green-400 animate-in zoom-in" />
        <h2 className="text-3xl font-bold">Check-in realizado!</h2>
        <p className="text-2xl">{volunteerName}</p>
        {teamName && <p className="text-lg text-white/70">{teamName}{positionName ? ` - ${positionName}` : ''}</p>}
        {isUnscheduled && (
          <div className="mt-2 w-full rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-left">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-300 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-yellow-200">Voce nao estava escalado para hoje.</p>
                <p className="text-sm text-yellow-100/90 leading-relaxed">
                  A lideranca aconselha que voce se escale nas proximas vezes para
                  ajudar na gestao dos voluntarios da CBRio.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
