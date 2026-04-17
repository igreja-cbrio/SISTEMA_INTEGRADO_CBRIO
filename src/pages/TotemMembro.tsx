import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { membresia } from '@/api';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Users, UserCheck, Droplets, Mountain, Heart, CalendarDays,
  ArrowRight, HandHeart, Lock, Eye, EyeOff, ChevronLeft,
  QrCode, Loader2, CheckCircle2, Maximize, Minimize,
  MapPin, Clock, Star, Map, List, Navigation,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { GruposMapView } from '@/components/grupos/GruposMapView';

// ── Menu ──────────────────────────────────────────────────────────────────────

const MENU_OPTIONS = [
  { id: 'grupos',       label: 'Grupos de Conexão', icon: Users,        color: '#00B39D', desc: 'Encontre seu grupo' },
  { id: 'membresia',    label: 'Meus Dados',         icon: UserCheck,    color: '#3B82F6', desc: 'Atualizar cadastro' },
  { id: 'batismo',      label: 'Batismo',             icon: Droplets,     color: '#6366F1', desc: 'Inscrição para batismo' },
  { id: 'retiro',       label: 'Retiro',              icon: Mountain,     color: '#F59E0B', desc: 'Próximos retiros' },
  { id: 'contribuicao', label: 'Contribuição',        icon: Heart,        color: '#EF4444', desc: 'Dízimo ou oferta' },
  { id: 'agendamento',  label: 'Ag. Pastoral',        icon: CalendarDays, color: '#8B5CF6', desc: 'Visita pastoral' },
  { id: 'next',         label: 'Next',                icon: ArrowRight,   color: '#10B981', desc: 'Jornada de membros' },
  { id: 'voluntariado', label: 'Voluntariado',        icon: HandHeart,    color: '#F97316', desc: 'Servir na CBRio' },
] as const;

type OptionId = (typeof MENU_OPTIONS)[number]['id'];
type KioskState = 'setup' | 'locked' | 'idle' | 'scanning' | 'greeting' | 'option' | 'done' | 'exit_confirm';

interface MemberData {
  nome: string;
  foto_url?: string | null;
  id?: string;
  cpf?: string;
  email?: string;
  telefone?: string;
  pending?: boolean;
  raw?: any;
}

const PIN_KEY = 'cbrio-totem-pin';

// ── Root component ────────────────────────────────────────────────────────────

export default function TotemMembro() {
  const navigate = useNavigate();
  const [state, setState] = useState<KioskState>('locked');
  const [member, setMember] = useState<MemberData | null>(null);
  const [selectedOption, setSelectedOption] = useState<OptionId | null>(null);
  const [clock, setClock] = useState(new Date());
  const [scanError, setScanError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // PIN
  const [storedPin, setStoredPin] = useState('');
  const [pinA, setPinA] = useState('');
  const [pinB, setPinB] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [exitInput, setExitInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [pinError, setPinError] = useState('');

  // USB scanner buffer
  const scanBuf = useRef('');
  const scanTimer = useRef<ReturnType<typeof setTimeout>>();
  const inactivityTimer = useRef<ReturnType<typeof setTimeout>>();

  // ── Init ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const p = localStorage.getItem(PIN_KEY) || '';
    setStoredPin(p);
    setState(p ? 'locked' : 'setup');
  }, []);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── USB scanner ─────────────────────────────────────────────────────────────

  const handleQrToken = useCallback(async (token: string) => {
    setState('scanning');
    try {
      const data = await membresia.qrLookup(token);
      if (data.found) {
        const src = data.membro || data.cadastro || {};
        setMember({
          nome: src.nome || 'Membro',
          foto_url: src.foto_url,
          id: src.id,
          cpf: src.cpf,
          email: src.email,
          telefone: src.telefone,
          pending: !!data.pending,
          raw: data,
        });
        setState('greeting');
        resetInactivity();
      } else {
        setScanError('QR Code não reconhecido');
        setState('idle');
        setTimeout(() => setScanError(''), 3000);
      }
    } catch {
      setScanError('Não foi possível identificar este QR Code');
      setState('idle');
      setTimeout(() => setScanError(''), 3000);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state !== 'idle') return;

    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'Enter') {
        const buf = scanBuf.current.trim();
        scanBuf.current = '';
        clearTimeout(scanTimer.current);
        if (buf.length >= 8) handleQrToken(buf);
      } else if (e.key.length === 1) {
        scanBuf.current += e.key;
        clearTimeout(scanTimer.current);
        scanTimer.current = setTimeout(() => { scanBuf.current = ''; }, 500);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(scanTimer.current);
    };
  }, [state, handleQrToken]);

  // ── Inactivity ──────────────────────────────────────────────────────────────

  const resetInactivity = useCallback(() => {
    clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      setState('idle');
      setMember(null);
      setSelectedOption(null);
    }, 60_000);
  }, []);

  useEffect(() => {
    if (state === 'greeting' || state === 'option' || state === 'done') resetInactivity();
    return () => clearTimeout(inactivityTimer.current);
  }, [state, resetInactivity]);

  // ── Fullscreen ──────────────────────────────────────────────────────────────

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // ── PIN handlers ─────────────────────────────────────────────────────────────

  const handleSetup = () => {
    if (pinA.length < 4) { setPinError('PIN deve ter pelo menos 4 dígitos'); return; }
    if (pinA !== pinB) { setPinError('PINs não coincidem'); return; }
    localStorage.setItem(PIN_KEY, pinA);
    setStoredPin(pinA);
    setPinError('');
    setState('idle');
  };

  const handleActivate = () => {
    if (pinInput === storedPin) {
      setPinInput(''); setPinError(''); setState('idle');
    } else {
      setPinError('PIN incorreto'); setPinInput('');
      setTimeout(() => setPinError(''), 2000);
    }
  };

  const handleExit = () => {
    if (exitInput === storedPin) {
      setState('idle'); navigate('/dashboard');
    } else {
      setPinError('PIN incorreto'); setExitInput('');
      setTimeout(() => { setPinError(''); setState('idle'); setMember(null); }, 1500);
    }
  };

  const goToOption = (id: OptionId) => {
    setSelectedOption(id);
    setState('option');
    resetInactivity();
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════

  // ── Setup ──────────────────────────────────────────────────────────────────
  if (state === 'setup') return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <img src="/logo-cbrio-text.png" alt="CBRio" className="h-10 mx-auto object-contain brightness-0 invert mb-4" />
          <h1 className="text-2xl font-bold">Configurar Totem</h1>
          <p className="text-white/50 text-sm mt-1">Crie um PIN para proteger este modo</p>
        </div>
        <div className="space-y-3">
          <div className="relative">
            <Input
              type={showPin ? 'text' : 'password'}
              inputMode="numeric"
              placeholder="Criar PIN (mín. 4 dígitos)"
              value={pinA}
              onChange={e => setPinA(e.target.value.replace(/\D/g, ''))}
              className="bg-white/10 border-white/20 text-white placeholder:text-white/30 pr-10"
              maxLength={8}
            />
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40" onClick={() => setShowPin(v => !v)}>
              {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Input
            type="password"
            inputMode="numeric"
            placeholder="Confirmar PIN"
            value={pinB}
            onChange={e => setPinB(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => e.key === 'Enter' && handleSetup()}
            className="bg-white/10 border-white/20 text-white placeholder:text-white/30"
            maxLength={8}
          />
        </div>
        {pinError && <p className="text-red-400 text-sm text-center">{pinError}</p>}
        <Button onClick={handleSetup} className="w-full bg-[#00B39D] hover:bg-[#00B39D]/90">Ativar Modo Totem</Button>
        <button onClick={() => navigate('/dashboard')} className="w-full text-center text-white/30 text-sm hover:text-white/60">Cancelar</button>
      </div>
    </div>
  );

  // ── Locked ────────────────────────────────────────────────────────────────
  if (state === 'locked') return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Lock className="h-10 w-10 mx-auto text-white/20 mb-3" />
          <img src="/logo-cbrio-text.png" alt="CBRio" className="h-9 mx-auto object-contain brightness-0 invert mb-2" />
          <h1 className="text-xl font-bold">Modo Totem</h1>
          <p className="text-white/50 text-sm mt-1">Digite o PIN para ativar</p>
        </div>
        <Input
          type="password"
          inputMode="numeric"
          placeholder="PIN"
          value={pinInput}
          onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))}
          onKeyDown={e => e.key === 'Enter' && handleActivate()}
          autoFocus
          className="bg-white/10 border-white/20 text-white placeholder:text-white/30 text-center text-2xl tracking-widest"
          maxLength={8}
        />
        {pinError && <p className="text-red-400 text-sm text-center">{pinError}</p>}
        <Button onClick={handleActivate} className="w-full bg-[#00B39D] hover:bg-[#00B39D]/90">Entrar</Button>
        <button onClick={() => navigate('/dashboard')} className="w-full text-center text-white/30 text-sm hover:text-white/60">Voltar ao sistema</button>
      </div>
    </div>
  );

  // ── Exit confirm ──────────────────────────────────────────────────────────
  if (state === 'exit_confirm') return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Lock className="h-10 w-10 mx-auto text-white/20 mb-3" />
          <h1 className="text-xl font-bold">Sair do Modo Totem</h1>
          <p className="text-white/50 text-sm mt-1">Digite o PIN para desativar</p>
        </div>
        <Input
          type="password"
          inputMode="numeric"
          placeholder="PIN"
          value={exitInput}
          onChange={e => setExitInput(e.target.value.replace(/\D/g, ''))}
          onKeyDown={e => e.key === 'Enter' && handleExit()}
          autoFocus
          className="bg-white/10 border-white/20 text-white placeholder:text-white/30 text-center text-2xl tracking-widest"
          maxLength={8}
        />
        {pinError && <p className="text-red-400 text-sm text-center">{pinError}</p>}
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => { setExitInput(''); setPinError(''); setState('idle'); setMember(null); }} className="flex-1 border-white/20 text-white">Cancelar</Button>
          <Button onClick={handleExit} className="flex-1 bg-[#00B39D] hover:bg-[#00B39D]/90">Confirmar</Button>
        </div>
      </div>
    </div>
  );

  // ── Scanning ──────────────────────────────────────────────────────────────
  if (state === 'scanning') return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="text-center space-y-4">
        <Loader2 className="h-16 w-16 mx-auto text-[#00B39D] animate-spin" />
        <p className="text-lg text-white/60">Identificando...</p>
      </div>
    </div>
  );

  // ── Option flow ───────────────────────────────────────────────────────────
  if (state === 'option' && selectedOption && member) return (
    <OptionFlow
      optionId={selectedOption}
      member={member}
      onBack={() => { setState('greeting'); setSelectedOption(null); resetInactivity(); }}
      onDone={() => setState('done')}
      onActivity={resetInactivity}
    />
  );

  // ── Done ──────────────────────────────────────────────────────────────────
  if (state === 'done') return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="text-center space-y-6 animate-in fade-in zoom-in">
        <CheckCircle2 className="h-24 w-24 mx-auto text-[#00B39D]" />
        <div>
          <h2 className="text-3xl font-bold">Tudo certo!</h2>
          <p className="text-white/60 mt-2">Deus abençoe sua semana, {member?.nome.split(' ')[0]}!</p>
        </div>
        <Button onClick={() => { setState('idle'); setMember(null); setSelectedOption(null); }} className="bg-[#00B39D] hover:bg-[#00B39D]/90">
          Concluir
        </Button>
      </div>
    </div>
  );

  // ── Greeting / menu ───────────────────────────────────────────────────────
  if (state === 'greeting' && member) return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-4">
          {member.foto_url ? (
            <img src={member.foto_url} alt="" className="h-14 w-14 rounded-full object-cover ring-2 ring-[#00B39D]" />
          ) : (
            <div className="h-14 w-14 rounded-full bg-[#00B39D]/20 ring-2 ring-[#00B39D] flex items-center justify-center text-2xl font-bold text-[#00B39D]">
              {member.nome.charAt(0)}
            </div>
          )}
          <div>
            <p className="text-white/50 text-sm">Que bom te ver!</p>
            <h2 className="text-2xl font-bold">{member.nome.split(' ')[0]}</h2>
          </div>
        </div>
        <div className="text-right">
          <p className="text-white/40 text-xs hidden sm:block">{format(clock, "EEEE, dd 'de' MMMM", { locale: ptBR })}</p>
          <p className="text-xl font-mono font-bold tabular-nums">{format(clock, 'HH:mm')}</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          <p className="text-center text-white/50 text-base mb-6">O que você gostaria de fazer?</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {MENU_OPTIONS.map(opt => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.id}
                  onClick={() => goToOption(opt.id)}
                  className="flex flex-col items-center gap-2.5 p-4 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 hover:scale-[1.03] active:scale-[0.98] transition-all duration-150 group"
                >
                  <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: opt.color + '25' }}>
                    <Icon className="h-6 w-6" style={{ color: opt.color }} />
                  </div>
                  <p className="text-sm font-semibold text-center leading-tight">{opt.label}</p>
                  <p className="text-xs text-white/35 text-center leading-tight hidden sm:block">{opt.desc}</p>
                </button>
              );
            })}
          </div>
          <p className="text-center text-white/20 text-xs mt-5">Toque em uma opção para continuar</p>
        </div>
      </div>

      <div className="flex items-center justify-between px-6 py-3">
        <button onClick={() => { setState('idle'); setMember(null); }} className="text-white/30 text-sm hover:text-white/60 flex items-center gap-1 transition-colors">
          <ChevronLeft className="h-4 w-4" /> Voltar
        </button>
        <button onClick={() => setState('exit_confirm')} className="text-transparent hover:text-white/10 text-xs transition-colors select-none">
          Sair do modo totem
        </button>
      </div>
    </div>
  );

  // ── Idle (default) ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 text-white flex flex-col select-none">
      <div className="flex items-center justify-between px-6 py-4">
        <img src="/logo-cbrio-text.png" alt="CBRio" className="h-8 object-contain brightness-0 invert" />
        <div className="flex items-center gap-4">
          <span className="text-xs text-white/40 hidden sm:inline">
            {format(clock, "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </span>
          <span className="text-2xl font-mono font-bold tabular-nums text-white/80">{format(clock, 'HH:mm:ss')}</span>
          <button onClick={toggleFullscreen} className="text-white/20 hover:text-white/50 transition-colors p-1">
            {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-8 p-6">
        <div className="relative">
          <div className="absolute inset-0 rounded-3xl bg-[#00B39D]/10 animate-ping" style={{ animationDuration: '2s' }} />
          <div className="relative h-36 w-36 rounded-3xl bg-[#00B39D]/10 border-2 border-[#00B39D]/30 flex items-center justify-center">
            <QrCode className="h-20 w-20 text-[#00B39D]" />
          </div>
        </div>

        <div className="text-center space-y-3">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight">Bem-vindo!</h1>
          <p className="text-xl text-white/60">Aproxime o QR Code da sua carteirinha</p>
        </div>

        {scanError && (
          <div className="px-6 py-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 animate-in fade-in slide-in-from-bottom-2">
            {scanError}
          </div>
        )}

        <p className="text-white/20 text-sm text-center max-w-xs">
          Não tem carteirinha digital? Acesse o app → Perfil → Carteirinha Digital
        </p>
      </div>

      <div className="flex items-center justify-between px-6 py-3">
        <p className="text-white/10 text-xs">CBRio Sistema</p>
        <button onClick={() => setState('exit_confirm')} className="text-white/5 hover:text-white/20 text-xs transition-colors">
          Sair do modo totem
        </button>
      </div>
    </div>
  );
}

// ── Option Flow router ────────────────────────────────────────────────────────

function OptionFlow({ optionId, member, onBack, onDone, onActivity }: {
  optionId: OptionId;
  member: MemberData;
  onBack: () => void;
  onDone: () => void;
  onActivity: () => void;
}) {
  const opt = MENU_OPTIONS.find(o => o.id === optionId)!;

  if (optionId === 'grupos') {
    return <GruposFlow opt={opt} member={member} onBack={onBack} onDone={onDone} onActivity={onActivity} />;
  }

  // Demais opções — placeholder até implementação
  const Icon = opt.icon;
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col" onClick={onActivity}>
      <OptionHeader opt={opt} member={member} onBack={onBack} />
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-5 max-w-sm">
          <div className="h-20 w-20 rounded-2xl flex items-center justify-center mx-auto" style={{ backgroundColor: opt.color + '20' }}>
            <Icon className="h-10 w-10" style={{ color: opt.color }} />
          </div>
          <div>
            <h3 className="text-2xl font-bold">{opt.label}</h3>
            <p className="text-white/40 mt-2">Em breve disponível neste totem.</p>
          </div>
          <Button onClick={onBack} variant="outline" className="border-white/20 text-white hover:bg-white/10">
            Voltar ao menu
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Shared header ─────────────────────────────────────────────────────────────

function OptionHeader({ opt, member, onBack }: { opt: (typeof MENU_OPTIONS)[number]; member: MemberData; onBack: () => void }) {
  const Icon = opt.icon;
  return (
    <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10 shrink-0">
      <button onClick={onBack} className="text-white/40 hover:text-white transition-colors p-1 -ml-1">
        <ChevronLeft className="h-6 w-6" />
      </button>
      <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: opt.color + '30' }}>
        <Icon className="h-5 w-5" style={{ color: opt.color }} />
      </div>
      <h2 className="text-xl font-semibold">{opt.label}</h2>
      <div className="ml-auto text-sm text-white/30">{member.nome.split(' ')[0]}</div>
    </div>
  );
}

// ── Map pins now rendered by GruposMapView (MapLibre) ──────────────────────

// ── Haversine distance ────────────────────────────────────────────────────────

function distKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371, d2r = Math.PI / 180;
  const dLat = (lat2 - lat1) * d2r, dLng = (lng2 - lng1) * d2r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * d2r) * Math.cos(lat2 * d2r) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtDist(km: number) {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

// ── Grupos de Conexão flow ────────────────────────────────────────────────────

const DIAS_MAP: Record<number, string> = { 0:'Dom', 1:'Seg', 2:'Ter', 3:'Qua', 4:'Qui', 5:'Sex', 6:'Sáb' };

function GruposFlow({ opt, member, onBack, onDone, onActivity }: {
  opt: (typeof MENU_OPTIONS)[number];
  member: MemberData;
  onBack: () => void;
  onDone: () => void;
  onActivity: () => void;
}) {
  const [grupos, setGrupos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [memberCoords, setMemberCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [filterCat, setFilterCat] = useState<string>('');
  const [showMap, setShowMap] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const grupoAtualId: string | undefined =
    member.raw?.grupo_atual?.id ?? member.raw?.grupo_atual?.grupo?.id;

  // Load groups + resolve device location (GPS first, CEP fallback)
  useEffect(() => {
    membresia.grupos.list({ ativo: 'true' })
      .then((data: any[]) => setGrupos(data || []))
      .catch(() => {})
      .finally(() => setLoading(false));

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setMemberCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {
          // GPS denied/unavailable — fall back to member's CEP
          const src = member.raw?.membro || member.raw?.cadastro || {};
          const cep = (member as any).cep || src.cep;
          if (cep) {
            membresia.totem.geocodeCep(cep)
              .then((geo: any) => { if (geo.lat && geo.lng) setMemberCoords({ lat: geo.lat, lng: geo.lng }); })
              .catch(() => {});
          }
        },
        { timeout: 8000, maximumAge: 60000 }
      );
    }
  }, []);

  // Enrich groups with distance
  const gruposEnriched = grupos.map(g => ({
    ...g,
    dist: memberCoords && g.lat && g.lng ? distKm(memberCoords.lat, memberCoords.lng, g.lat, g.lng) : null,
  })).sort((a, b) => {
    if (a.dist !== null && b.dist !== null) return a.dist - b.dist;
    if (a.dist !== null) return -1;
    if (b.dist !== null) return 1;
    return (a.nome || '').localeCompare(b.nome || '');
  });

  const categories = [...new Set(grupos.map(g => g.categoria).filter(Boolean))] as string[];
  const filtered = filterCat ? gruposEnriched.filter(g => g.categoria === filterCat) : gruposEnriched;

  const handleConfirm = async () => {
    if (!selected || !member.id) return;
    setSaving(true); setError('');
    try {
      await membresia.totem.entrarGrupo(selected.id, member.id);
      onDone();
    } catch {
      setError('Não foi possível registrar. Tente novamente.');
      setSaving(false);
    }
  };

  // ── Confirmation screen ──────────────────────────────────────────────────────
  if (selected) {
    const isChanging = !!grupoAtualId && grupoAtualId !== selected.id;
    const grupoAtual = grupos.find(g => g.id === grupoAtualId);
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col" onClick={onActivity}>
        <OptionHeader opt={opt} member={member} onBack={() => { setSelected(null); setError(''); }} />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-md space-y-6">
            <div className="text-center">
              <div className="h-16 w-16 rounded-2xl bg-[#00B39D]/20 flex items-center justify-center mx-auto mb-4">
                <Users className="h-8 w-8 text-[#00B39D]" />
              </div>
              <h3 className="text-2xl font-bold">Confirmar inscrição</h3>
              {isChanging && grupoAtual && (
                <p className="text-white/50 text-sm mt-1">Você sairá de <span className="text-white/80">{grupoAtual.nome}</span></p>
              )}
            </div>
            <div className="rounded-2xl border border-white/20 bg-white/5 p-5 space-y-2">
              <p className="text-lg font-semibold">{selected.nome}</p>
              {selected.lider?.nome && <p className="text-sm text-white/50">Líder: {selected.lider.nome}</p>}
              <div className="flex flex-wrap gap-3 text-sm text-white/50">
                {selected.dia_semana != null && (
                  <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{DIAS_MAP[selected.dia_semana]}{selected.horario ? ` às ${String(selected.horario).slice(0, 5)}` : ''}</span>
                )}
                {selected.local && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{selected.local}</span>}
                {selected.dist !== null && selected.dist !== undefined && (
                  <span className="flex items-center gap-1"><Navigation className="h-3.5 w-3.5 text-[#00B39D]" />{fmtDist(selected.dist)} de você</span>
                )}
              </div>
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => { setSelected(null); setError(''); }} className="flex-1 border-white/20 text-white hover:bg-white/10" disabled={saving}>Cancelar</Button>
              <Button onClick={handleConfirm} disabled={saving} className="flex-1 bg-[#00B39D] hover:bg-[#00B39D]/90">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── List / Map screen ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col" onClick={onActivity}>
      <OptionHeader opt={opt} member={member} onBack={onBack} />

      {/* Filters bar */}
      <div className="px-5 py-3 border-b border-white/10 flex items-center gap-2 flex-wrap shrink-0">
        {/* Category chips */}
        <button
          onClick={() => setFilterCat('')}
          className={`px-3 py-1.5 rounded-full text-sm transition-colors ${!filterCat ? 'bg-[#00B39D] text-white' : 'bg-white/10 text-white/60 hover:bg-white/15'}`}
        >
          Todos
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCat(cat === filterCat ? '' : cat)}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${filterCat === cat ? 'bg-[#00B39D] text-white' : 'bg-white/10 text-white/60 hover:bg-white/15'}`}
          >
            {cat}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          {memberCoords && (
            <span className="text-xs text-white/30 flex items-center gap-1">
              <Navigation className="h-3 w-3 text-[#00B39D]" /> ordenado por distância
            </span>
          )}
          {/* Map/List toggle */}
          <button
            onClick={() => setShowMap(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${showMap ? 'bg-[#00B39D] text-white' : 'bg-white/10 text-white/60 hover:bg-white/15'}`}
          >
            {showMap ? <List className="h-3.5 w-3.5" /> : <Map className="h-3.5 w-3.5" />}
            {showMap ? 'Lista' : 'Mapa'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#00B39D]" />
        </div>
      ) : showMap ? (
        /* ── Map view (MapLibre) ── */
        <div className="flex-1 relative">
          <GruposMapView
            grupos={filtered}
            memberCoords={memberCoords}
            variant="kiosk"
            defaultTheme="dark"
            onGroupSelect={(g) => { setSelected(g); setShowMap(false); onActivity(); }}
            onGroupSelectLabel="Quero participar"
          />
        </div>
      ) : (
        /* ── List view ── */
        <div className="flex-1 overflow-y-auto p-5">
          {filtered.length === 0 ? (
            <div className="text-center py-20 text-white/40">Nenhum grupo encontrado.</div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-3">
              {filtered.map(g => {
                const isCurrent = g.id === grupoAtualId;
                return (
                  <button
                    key={g.id}
                    onClick={() => { setSelected(g); onActivity(); }}
                    className={`w-full text-left rounded-2xl border p-4 transition-all hover:scale-[1.01] active:scale-[0.99] ${
                      isCurrent ? 'border-[#00B39D]/60 bg-[#00B39D]/10' : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-base leading-tight">{g.nome}</p>
                          {isCurrent && <Star className="h-3.5 w-3.5 text-[#00B39D] shrink-0" fill="currentColor" />}
                          {g.categoria && <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/50">{g.categoria}</span>}
                        </div>
                        {g.lider?.nome && <p className="text-sm text-white/50">Líder: {g.lider.nome}</p>}
                        <div className="flex flex-wrap gap-2 text-xs text-white/40 mt-1">
                          {g.dia_semana != null && (
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{DIAS_MAP[g.dia_semana]}{g.horario ? ` às ${String(g.horario).slice(0,5)}` : ''}</span>
                          )}
                          {g.local && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{g.local}</span>}
                          {g.dist !== null && g.dist !== undefined && (
                            <span className="flex items-center gap-1 text-[#00B39D]"><Navigation className="h-3 w-3" />{fmtDist(g.dist)}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0 space-y-1">
                        <Badge variant="outline" className="border-white/20 text-white/50 text-xs">{g.total_ativos ?? 0} membros</Badge>
                        {isCurrent && <p className="text-xs text-[#00B39D]">Meu grupo</p>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
