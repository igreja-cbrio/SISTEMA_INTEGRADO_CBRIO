import { useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';

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
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/80 animate-in fade-in" onClick={onClose}>
      <div className="flex flex-col items-center gap-4 text-white text-center p-8">
        <CheckCircle2 className="h-24 w-24 text-green-400 animate-in zoom-in" />
        <h2 className="text-3xl font-bold">Check-in realizado!</h2>
        <p className="text-2xl">{volunteerName}</p>
        {teamName && <p className="text-lg text-white/70">{teamName}{positionName ? ` - ${positionName}` : ''}</p>}
        {isUnscheduled && <span className="px-3 py-1 bg-yellow-500/20 text-yellow-300 rounded-full text-sm">Sem escala</span>}
      </div>
    </div>
  );
}
