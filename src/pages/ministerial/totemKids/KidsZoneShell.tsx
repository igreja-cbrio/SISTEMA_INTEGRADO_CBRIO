// Moldura visual "Kids Zone" do Totem Kids (check-in e check-out) ·
// referência aprovada pelo Matheus (2026-07-06): gradiente índigo/roxo/fúcsia
// com blobs animados + cartão branco arredondado de quiosque. Telas de totem
// são intencionalmente sólidas/brand (CLAUDE.md · não aplicar vidro).
import { useEffect, useState } from 'react';

const KIDS_ZONE_CSS = `
@keyframes kz-blob { 0%,100%{ transform: translate(0,0) scale(1);} 33%{ transform: translate(30px,-40px) scale(1.1);} 66%{ transform: translate(-20px,20px) scale(.95);} }
.kz-blob{ animation: kz-blob 16s infinite ease-in-out; }
.kz-blob-d1{ animation-delay: -6s; } .kz-blob-d2{ animation-delay: -11s; }
`;

export function KidsZoneRelogio() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="text-right hidden sm:block">
      <p className="text-lg font-bold text-slate-700 leading-none">
        {agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
      </p>
      <p className="text-xs text-slate-400 capitalize">
        {agora.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
      </p>
    </div>
  );
}

// Alternância segmentada Check-in / Check-out
export function KidsZoneToggle({ ativo, onCheckin, onCheckout }: {
  ativo: 'checkin' | 'checkout';
  onCheckin?: () => void;
  onCheckout?: () => void;
}) {
  const base = 'relative z-10 flex-1 py-2 text-sm font-bold rounded-full transition-colors';
  return (
    <div className="relative flex bg-slate-100 rounded-full p-1 w-56">
      <div
        className="absolute top-1 left-1 h-[calc(100%-8px)] w-[calc(50%-4px)] rounded-full bg-gradient-to-r from-orange-400 to-pink-500 shadow-md transition-transform duration-300"
        style={{ transform: ativo === 'checkout' ? 'translateX(100%)' : 'translateX(0)' }}
      />
      <button type="button" onClick={onCheckin} className={`${base} ${ativo === 'checkin' ? 'text-white' : 'text-slate-500 hover:text-slate-700'}`}>Check-in</button>
      <button type="button" onClick={onCheckout} className={`${base} ${ativo === 'checkout' ? 'text-white' : 'text-slate-500 hover:text-slate-700'}`}>Check-out</button>
    </div>
  );
}

// fullscreen: modo totem (tela cheia · sem o header do app descontado)
export function KidsZoneShell({ children, fullscreen = false }: { children: React.ReactNode; fullscreen?: boolean }) {
  return (
    <div className={`${fullscreen ? 'min-h-screen' : 'min-h-[calc(100vh-4rem)]'} relative overflow-x-hidden bg-gradient-to-br from-indigo-950 via-purple-900 to-fuchsia-900 flex items-stretch justify-center p-2 sm:p-4`}>
      <style>{KIDS_ZONE_CSS}</style>
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="kz-blob absolute -top-24 -left-16 w-96 h-96 bg-fuchsia-500/30 rounded-full blur-3xl" />
        <div className="kz-blob kz-blob-d1 absolute top-1/3 -right-24 w-[28rem] h-[28rem] bg-cyan-400/20 rounded-full blur-3xl" />
        <div className="kz-blob kz-blob-d2 absolute bottom-0 left-1/4 w-80 h-80 bg-amber-400/20 rounded-full blur-3xl" />
      </div>
      {/* O card do totem é sempre branco/brand (sólido, não segue o tema do app).
          Forçamos data-theme="light" pra os componentes shadcn (Button outline/ghost,
          Input, Select) resolverem tokens CLAROS aqui dentro — senão, no dark mode do
          app, ficam escuros sobre o branco (ex.: "Voltar pro Kids" preto no preto). */}
      <div data-theme="light" className="relative z-10 w-full max-w-[1500px] bg-white/95 backdrop-blur rounded-[2rem] shadow-2xl ring-1 ring-black/5 p-4 sm:p-8 text-slate-800 self-stretch">
        {children}
      </div>
    </div>
  );
}
