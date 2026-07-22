import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { membresia, kpis as kpisApi } from '@/api';
import { imprimirEtiquetaBatismo } from '@/lib/imprimirEtiquetaBatismo';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Users, UserCheck, Droplets, Mountain, Heart, CalendarDays,
  ArrowRight, HandHeart, Lock, Eye, EyeOff, ChevronLeft,
  QrCode, Loader2, CheckCircle2, Maximize, Minimize,
  MapPin, Clock, Star, Map, List, Navigation, Sun, Moon,
  Camera, RotateCcw, Save, X, ChevronRight, Delete, KeyRound,
  Baby, LogOut, Search, Printer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { GruposMapView } from '@/components/grupos/GruposMapView';
import { QRCodeSVG } from 'qrcode.react';

// ── Menu ──────────────────────────────────────────────────────────────────────

const MENU_OPTIONS = [
  { id: 'grupos',       label: 'Grupos de Conexão',   icon: Users,        color: '#00B39D', desc: 'Encontre seu grupo' },
  { id: 'membresia',    label: 'Meus Dados',           icon: UserCheck,    color: '#3B82F6', desc: 'Atualizar cadastro' },
  { id: 'batismo',      label: 'Batismo',              icon: Droplets,     color: '#6366F1', desc: 'Inscrição para batismo' },
  { id: 'next',         label: 'Next',                 icon: ArrowRight,   color: '#10B981', desc: 'Jornada de membros' },
  { id: 'apresentacao_bebe', label: 'Apresentar bebê', icon: Baby,         color: '#EC4899', desc: '2º domingo do mês' },
  // Retiro / Contribuição / Ag. Pastoral / Voluntariado saíram do menu:
  // eram placeholders sem implementação ("Em breve") — poda do atlas 2026-07.
  // Voluntariado tem totem próprio em /voluntariado/totem.
] as const;

type OptionId = (typeof MENU_OPTIONS)[number]['id'];
type KioskState = 'setup' | 'locked' | 'idle' | 'cpf_input' | 'scanning' | 'greeting' | 'option' | 'done' | 'exit_confirm' | 'checkin_batismo';

interface MemberData {
  nome: string;
  foto_url?: string | null;
  id?: string;
  cpf?: string;
  email?: string;
  telefone?: string;
  pending?: boolean;
  guest?: boolean;
  raw?: any;
}

const PIN_KEY = 'cbrio-totem-pin';
const THEME_KEY = 'cbrio-totem-theme';
// Flags one-shot gravadas pelo /cadastro-membresia?from=totem (consumidas no mount):
// RESUME = token do QR recém-criado → reabre a sessão da própria pessoa;
// UNLOCK = só pula a tela de PIN do operador e cai na tela inicial.
const RESUME_KEY = 'cbrio-totem-resume';
const UNLOCK_KEY = 'cbrio-totem-unlocked';

// Inatividade: menu/saudação/CPF 120s · dentro dos fluxos (formulários) 180s.
// 20s antes de expirar aparece o aviso "Você ainda está aí?".
const IDLE_MENU_MS = 120_000;
const IDLE_FLOW_MS = 180_000;
const IDLE_WARN_MS = 20_000;

const GUEST_MEMBER: MemberData = { nome: 'Visitante', guest: true };

// DV de CPF (mesma regra do cadastro público) — o batismo pelo totem exige CPF válido.
function cpfDvOk(v: string | undefined | null): boolean {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (base: string, fator: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i += 1) soma += parseInt(base[i], 10) * (fator - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return calc(d.slice(0, 9), 10) === parseInt(d[9], 10) && calc(d.slice(0, 10), 11) === parseInt(d[10], 10);
}

// ── Root component ────────────────────────────────────────────────────────────

export default function TotemMembro() {
  const navigate = useNavigate();
  const [state, setState] = useState<KioskState>('locked');
  const [member, setMember] = useState<MemberData | null>(null);
  const [selectedOption, setSelectedOption] = useState<OptionId | null>(null);
  const [clock, setClock] = useState(new Date());
  const [scanError, setScanError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDark, setIsDark] = useState(() => localStorage.getItem(THEME_KEY) !== 'light');
  const [showNovoCadastro, setShowNovoCadastro] = useState(false);
  const toggleTheme = () => setIsDark(v => { const n = !v; localStorage.setItem(THEME_KEY, n ? 'dark' : 'light'); return n; });

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
  const warnTimer = useRef<ReturnType<typeof setTimeout>>();
  const countdownTimer = useRef<ReturnType<typeof setInterval>>();

  // Aviso de inatividade ("Você ainda está aí?")
  const [idleWarning, setIdleWarning] = useState(false);
  const [idleSeconds, setIdleSeconds] = useState(IDLE_WARN_MS / 1000);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // ── Init ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const p = localStorage.getItem(PIN_KEY) || '';
    setStoredPin(p);
    let resume: string | null = null;
    let unlocked = false;
    try {
      resume = sessionStorage.getItem(RESUME_KEY);
      unlocked = sessionStorage.getItem(UNLOCK_KEY) === '1';
      sessionStorage.removeItem(RESUME_KEY);
      sessionStorage.removeItem(UNLOCK_KEY);
    } catch { /* sem sessionStorage — segue o fluxo normal */ }
    if (!p) { setState('setup'); return; }
    if (resume) {
      // Volta do cadastro feito no próprio totem: reabre a sessão da pessoa
      // sem pedir o PIN do operador (o token é one-shot e acabou de ser criado).
      handleQrTokenRef.current?.(resume);
      return;
    }
    setState(unlocked ? 'idle' : 'locked');
  }, []);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── USB scanner ─────────────────────────────────────────────────────────────

  const applyLookupResult = useCallback((data: any) => {
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleQrToken = useCallback(async (token: string) => {
    setState('scanning');
    try {
      const data = await membresia.qrLookup(token);
      if (data.found) {
        applyLookupResult(data);
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
  }, [applyLookupResult]);

  // Ref estável pro efeito de mount consumir o resume-token sem problema de
  // ordem de declaração (handleQrToken é definido depois do efeito de init).
  const handleQrTokenRef = useRef(handleQrToken);
  useEffect(() => { handleQrTokenRef.current = handleQrToken; }, [handleQrToken]);

  const handleCpfLookup = useCallback(async (cpf: string, nascimento: string) => {
    const digits = cpf.replace(/\D/g, '');
    if (digits.length !== 11) return { ok: false, error: 'CPF incompleto' };
    if (!nascimento) return { ok: false, error: 'Informe a data de nascimento' };
    try {
      const data = await membresia.cpfLookup(digits, nascimento);
      if (data.found) {
        applyLookupResult(data);
        return { ok: true };
      }
      // Não achou: nunca é erro — leva a "completar cadastro" (regra do Marcos).
      return { ok: false, notFound: true };
    } catch (e: any) {
      if (e?.status === 404) return { ok: false, notFound: true };
      return { ok: false, error: e?.message || 'Erro ao consultar CPF' };
    }
  }, [applyLookupResult]);

  // "Completar cadastro": abre o formulário já com CPF + nascimento preenchidos
  // (o loop de volta ao totem já identificado é o mesmo da Fase 1).
  const irCompletarCadastro = useCallback((cpf: string, nascimento: string) => {
    const qs = new URLSearchParams({
      from: 'totem',
      cpf: String(cpf).replace(/\D/g, ''),
      ...(nascimento ? { nasc: nascimento } : {}),
    });
    navigate(`/cadastro-membresia?${qs.toString()}`);
  }, [navigate]);

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
  // Dois estágios: aviso 20s antes (com contagem) e encerramento no limite.
  // O reset acontece em QUALQUER interação (listener global cobre toque,
  // teclado e rolagem — antes só clique contava e rolar a lista expirava).

  const limparTimersIdle = useCallback(() => {
    clearTimeout(inactivityTimer.current);
    clearTimeout(warnTimer.current);
    clearInterval(countdownTimer.current);
  }, []);

  const encerrarSessao = useCallback(() => {
    limparTimersIdle();
    setIdleWarning(false);
    setState('idle');
    setMember(null);
    setSelectedOption(null);
  }, [limparTimersIdle]);

  const resetInactivity = useCallback(() => {
    limparTimersIdle();
    setIdleWarning(false);
    const limite = stateRef.current === 'option' ? IDLE_FLOW_MS : IDLE_MENU_MS;
    warnTimer.current = setTimeout(() => {
      setIdleSeconds(IDLE_WARN_MS / 1000);
      setIdleWarning(true);
      countdownTimer.current = setInterval(
        () => setIdleSeconds((s) => Math.max(0, s - 1)),
        1000,
      );
    }, limite - IDLE_WARN_MS);
    inactivityTimer.current = setTimeout(encerrarSessao, limite);
  }, [limparTimersIdle, encerrarSessao]);

  const idleAtivo = state === 'greeting' || state === 'option' || state === 'done'
    || state === 'cpf_input' || showNovoCadastro;

  useEffect(() => {
    if (idleAtivo) {
      resetInactivity();
    } else {
      limparTimersIdle();
      setIdleWarning(false);
    }
    return limparTimersIdle;
  }, [idleAtivo, state, resetInactivity, limparTimersIdle]);

  useEffect(() => {
    if (!idleAtivo) return undefined;
    const onAtividade = () => resetInactivity();
    const evs: (keyof DocumentEventMap)[] = ['pointerdown', 'keydown', 'wheel', 'touchmove'];
    evs.forEach((e) => document.addEventListener(e, onAtividade, { passive: true }));
    document.addEventListener('scroll', onAtividade, { passive: true, capture: true });
    return () => {
      evs.forEach((e) => document.removeEventListener(e, onAtividade));
      document.removeEventListener('scroll', onAtividade, true);
    };
  }, [idleAtivo, resetInactivity]);

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

  const entrarSemCadastro = () => {
    setMember({ ...GUEST_MEMBER });
    setState('greeting');
  };

  // Sai da sessão atual e abre a tela de novo cadastro (usado pelo convidado
  // quando uma ação exige identificação — ex.: pedir entrada em grupo).
  const irParaNovoCadastro = () => {
    limparTimersIdle();
    setIdleWarning(false);
    setState('idle');
    setMember(null);
    setSelectedOption(null);
    setShowNovoCadastro(true);
  };

  // ── Gate de identificação do convidado (ponto 8) ──
  // Ao tentar uma inscrição, o convidado informa CPF + nascimento: achou →
  // PROMOVE a sessão pra identificada e o fluxo continua de onde estava; não
  // achou → completar cadastro. Reusa a tela de CPF do "Sou membro".
  const [identGate, setIdentGate] = useState(false);
  const solicitarIdentificacao = useCallback(() => setIdentGate(true), []);
  const handleGateLookup = useCallback(async (cpf: string, nascimento: string) => {
    const digits = cpf.replace(/\D/g, '');
    if (digits.length !== 11) return { ok: false, error: 'CPF incompleto' };
    if (!nascimento) return { ok: false, error: 'Informe a data de nascimento' };
    try {
      const data = await membresia.cpfLookup(digits, nascimento);
      if (data.found) {
        const src = data.membro || data.cadastro || {};
        setMember({
          nome: src.nome || 'Membro', foto_url: src.foto_url, id: src.id,
          cpf: src.cpf, email: src.email, telefone: src.telefone,
          pending: !!data.pending, raw: data,
        });
        setIdentGate(false);
        return { ok: true };
      }
      return { ok: false, notFound: true };
    } catch (e: any) {
      if (e?.status === 404) return { ok: false, notFound: true };
      return { ok: false, error: e?.message || 'Erro ao consultar CPF' };
    }
  }, []);
  const gateOverlay = identGate ? (
    <div className="fixed inset-0 z-[90]">
      <CpfInputScreen
        onBack={() => setIdentGate(false)}
        onLookup={handleGateLookup}
        onCompletarCadastro={(cpf, nascimento) => { setIdentGate(false); irCompletarCadastro(cpf, nascimento); }}
      />
    </div>
  ) : null;

  // Overlay "Você ainda está aí?" — aparece 20s antes do encerramento em
  // qualquer tela ativa; qualquer toque continua a sessão.
  const idleOverlay = idleWarning ? (
    <div
      className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={resetInactivity}
    >
      <div className="w-full max-w-md rounded-3xl bg-gray-900 border border-white/15 p-8 text-center space-y-5 text-white">
        <Clock className="h-12 w-12 mx-auto text-[#00B39D]" />
        <div>
          <h2 className="text-2xl font-bold">Você ainda está aí?</h2>
          <p className="text-white/60 mt-2 text-sm">
            A sessão será encerrada em{' '}
            <span className="font-mono font-bold text-white text-base">{idleSeconds}s</span>{' '}
            por inatividade.
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={(e) => { e.stopPropagation(); encerrarSessao(); }}
            variant="outline"
            className="flex-1 border-white/20 text-white hover:bg-white/10 py-6 text-base rounded-2xl"
          >
            Encerrar
          </Button>
          <Button
            onClick={(e) => { e.stopPropagation(); resetInactivity(); }}
            className="flex-1 bg-[#00B39D] hover:bg-[#00B39D]/90 py-6 text-base rounded-2xl"
          >
            Continuar
          </Button>
        </div>
      </div>
    </div>
  ) : null;

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
    <>
      <OptionFlow
        optionId={selectedOption}
        member={member}
        isDark={isDark}
        onBack={() => { setState('greeting'); setSelectedOption(null); resetInactivity(); }}
        onDone={() => { setState('greeting'); setSelectedOption(null); resetInactivity(); }}
        onEndSession={encerrarSessao}
        onNovoCadastro={irParaNovoCadastro}
        onNeedIdentify={solicitarIdentificacao}
        onActivity={resetInactivity}
      />
      {gateOverlay}
      {idleOverlay}
    </>
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
      {idleOverlay}
    </div>
  );

  // ── Greeting / menu ───────────────────────────────────────────────────────
  const greetBg = isDark ? 'bg-gray-950 text-white' : 'bg-gray-50 text-gray-900';
  const greetBorder = isDark ? 'border-white/10' : 'border-gray-200';
  const greetMuted = isDark ? 'text-white/50' : 'text-gray-500';
  const greetCardBg = isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white border-gray-200 hover:bg-gray-100';

  if (state === 'greeting' && member) return (
    <div className={`min-h-screen flex flex-col ${greetBg}`}>
      <div className={`flex items-center justify-between px-6 py-4 border-b ${greetBorder}`}>
        <div className="flex items-center gap-4">
          {member.foto_url ? (
            <img src={member.foto_url} alt="" className="h-14 w-14 rounded-full object-cover ring-2 ring-[#00B39D]" />
          ) : (
            <div className="h-14 w-14 rounded-full bg-[#00B39D]/20 ring-2 ring-[#00B39D] flex items-center justify-center text-2xl font-bold text-[#00B39D]">
              {member.nome.charAt(0)}
            </div>
          )}
          <div>
            <p className={`${greetMuted} text-sm`}>{member.guest ? 'Fique à vontade!' : 'Que bom te ver!'}</p>
            <h2 className="text-2xl font-bold">{member.nome.split(' ')[0]}</h2>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={toggleTheme} className={`p-2 rounded-lg transition-colors ${isDark ? 'text-white/40 hover:text-white/80 hover:bg-white/10' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200'}`}>
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <div className="text-right">
            <p className={`${greetMuted} text-xs hidden sm:block`}>{format(clock, "EEEE, dd 'de' MMMM", { locale: ptBR })}</p>
            <p className="text-xl font-mono font-bold tabular-nums">{format(clock, 'HH:mm')}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          <p className={`text-center ${greetMuted} text-base mb-6`}>O que você gostaria de fazer?</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Meus Dados edita mem_membros — some pra convidado e pra cadastro
                ainda pendente de aprovação (o PUT do totem não alcança pendentes) */}
            {MENU_OPTIONS.filter(opt => !((member.guest || member.pending) && opt.id === 'membresia')).map(opt => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.id}
                  onClick={() => goToOption(opt.id)}
                  className={`flex flex-col items-center gap-2.5 p-4 rounded-2xl border hover:scale-[1.03] active:scale-[0.98] transition-all duration-150 ${greetCardBg}`}
                >
                  <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: opt.color + '25' }}>
                    <Icon className="h-6 w-6" style={{ color: opt.color }} />
                  </div>
                  <p className="text-sm font-semibold text-center leading-tight">{opt.label}</p>
                  <p className={`text-xs ${greetMuted} text-center leading-tight hidden sm:block`}>{opt.desc}</p>
                </button>
              );
            })}
          </div>
          <p className={`text-center ${isDark ? 'text-white/20' : 'text-gray-400'} text-xs mt-5`}>
            {member.guest
              ? 'Explore à vontade — pediremos seus dados só se você se inscrever em algo'
              : 'Toque em uma opção para continuar'}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between px-6 py-3">
        <button onClick={() => { setState('idle'); setMember(null); }} className={`${greetMuted} text-sm hover:opacity-80 flex items-center gap-1 transition-colors`}>
          <ChevronLeft className="h-4 w-4" /> Voltar
        </button>
        <button
          onClick={() => setState('exit_confirm')}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            isDark
              ? 'border-white/10 text-white/40 hover:text-white/80 hover:bg-white/5'
              : 'border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-100'
          }`}
        >
          <LogOut className="h-3.5 w-3.5" /> Sair do totem
        </button>
      </div>
      {idleOverlay}
    </div>
  );

  // ── CPF input ─────────────────────────────────────────────────────────────
  if (state === 'cpf_input') return (
    <>
      <CpfInputScreen
        onBack={() => setState('idle')}
        onLookup={handleCpfLookup}
        onCompletarCadastro={irCompletarCadastro}
      />
      {idleOverlay}
    </>
  );

  // ── Check-in de batismo (quiosque · equipe) ─────────────────────────────────
  if (state === 'checkin_batismo') return (
    <CheckinBatismoFlow onExit={() => setState('idle')} />
  );

  // ── Idle (default) ────────────────────────────────────────────────────────
  if (showNovoCadastro) return (
    <>
      <NovoCadastroScreen onBack={() => setShowNovoCadastro(false)} />
      {idleOverlay}
    </>
  );

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
        <div className="text-center space-y-2">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Bem-vindo à CBRio!</h1>
          <p className="text-lg text-white/50">Como você quer começar?</p>
        </div>

        {scanError && (
          <div className="px-6 py-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 animate-in fade-in slide-in-from-bottom-2">
            {scanError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-4xl">
          <button
            onClick={() => setShowNovoCadastro(true)}
            className="flex flex-col items-center gap-3 p-7 rounded-3xl border border-[#00B39D]/40 bg-[#00B39D]/10 hover:bg-[#00B39D]/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <div className="h-14 w-14 rounded-2xl bg-[#00B39D]/25 flex items-center justify-center">
              <UserCheck className="h-7 w-7 text-[#00B39D]" />
            </div>
            <p className="font-bold text-lg leading-tight">Novo na CBRio</p>
            <p className="text-white/50 text-sm leading-snug">Faça seu cadastro aqui</p>
          </button>

          <button
            onClick={() => setState('cpf_input')}
            className="flex flex-col items-center gap-3 p-7 rounded-3xl border border-[#3B82F6]/40 bg-[#3B82F6]/10 hover:bg-[#3B82F6]/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <div className="h-14 w-14 rounded-2xl bg-[#3B82F6]/25 flex items-center justify-center">
              <KeyRound className="h-7 w-7 text-[#3B82F6]" />
            </div>
            <p className="font-bold text-lg leading-tight">Sou membro, tenho cadastro</p>
            <p className="text-white/50 text-sm leading-snug">Entre com seu CPF</p>
          </button>

          <button
            onClick={entrarSemCadastro}
            className="flex flex-col items-center gap-3 p-7 rounded-3xl border border-white/15 bg-white/5 hover:bg-white/10 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <div className="h-14 w-14 rounded-2xl bg-white/10 flex items-center justify-center">
              <Search className="h-7 w-7 text-white/70" />
            </div>
            <p className="font-bold text-lg leading-tight">Entrar sem cadastro</p>
            <p className="text-white/50 text-sm leading-snug">Explorar grupos, batismo e Next</p>
          </button>
        </div>

        <div className="flex flex-col items-center gap-2">
          <p className="flex items-center gap-2 text-white/40 text-sm">
            <QrCode className="h-4 w-4 text-[#00B39D]" />
            Tem a carteirinha digital? Aproxime o QR Code a qualquer momento
          </p>
          <button
            onClick={() => setState('checkin_batismo')}
            className="flex items-center gap-2 text-xs text-[#6366F1]/70 hover:text-[#6366F1] transition-colors py-1 px-3"
            title="Fluxo assistido pela equipe no dia do batismo"
          >
            <Droplets className="h-3.5 w-3.5" />
            Equipe · Check-in de Batismo
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between px-6 py-3">
        <p className="text-white/10 text-xs">CBRio Sistema</p>
        <button
          onClick={() => setState('exit_confirm')}
          className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/80 px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
          title="Requer PIN do totem"
        >
          <LogOut className="h-3.5 w-3.5" /> Sair do totem
        </button>
      </div>
    </div>
  );
}

// ── CPF Input screen ───────────────────────────────────────────────────────

function CpfInputScreen({ onBack, onLookup, onCompletarCadastro }: {
  onBack: () => void;
  onLookup: (cpf: string, nascimento: string) => Promise<{ ok: boolean; error?: string; notFound?: boolean }>;
  onCompletarCadastro: (cpf: string, nascimento: string) => void;
}) {
  // Dois passos: CPF (numpad) → data de nascimento (2º fator · 2026-07-22).
  const [step, setStep] = useState<'cpf' | 'nascimento' | 'nao_achou'>('cpf');
  const [cpf, setCpf] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const maskCpf = (raw: string) => {
    const d = raw.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
    return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  };

  const digits = cpf.replace(/\D/g, '');
  const cpfCompleto = digits.length === 11;

  const pressDigit = (d: string) => {
    if (loading) return;
    setError('');
    setCpf(prev => {
      const cur = prev.replace(/\D/g, '');
      if (cur.length >= 11) return prev;
      return maskCpf(cur + d);
    });
  };

  const pressBackspace = () => {
    if (loading) return;
    setError('');
    setCpf(prev => maskCpf(prev.replace(/\D/g, '').slice(0, -1)));
  };

  const buscar = async () => {
    if (!cpfCompleto || !nascimento || loading) return;
    setLoading(true);
    setError('');
    const r = await onLookup(digits, nascimento);
    setLoading(false);
    if (r.ok) return;               // applyLookupResult já trocou de tela
    if (r.notFound) { setStep('nao_achou'); return; }
    setError(r.error || 'Não foi possível identificar');
  };

  const KEYS = ['1','2','3','4','5','6','7','8','9'];
  const cabecalho = (titulo: string) => (
    <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10">
      <button
        onClick={step === 'cpf' ? onBack : () => { setStep('cpf'); setError(''); }}
        className="text-white/40 hover:text-white transition-colors p-1 -ml-1"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <h2 className="text-xl font-semibold">{titulo}</h2>
    </div>
  );

  // ── Não encontrou: sem erro, oferece completar o cadastro (regra do Marcos) ──
  if (step === 'nao_achou') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 text-white flex flex-col select-none">
        {cabecalho('Vamos te cadastrar')}
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md text-center space-y-6">
            <div className="h-16 w-16 rounded-2xl bg-[#00B39D]/15 border border-[#00B39D]/30 flex items-center justify-center mx-auto">
              <UserCheck className="h-8 w-8 text-[#00B39D]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Não achamos seu cadastro</h1>
              <p className="text-white/60 mt-2 leading-relaxed">
                Sem problema! Vamos completar seu cadastro agora — seu CPF e a data de
                nascimento já vão preenchidos.
              </p>
            </div>
            <div className="space-y-3">
              <Button
                onClick={() => onCompletarCadastro(digits, nascimento)}
                className="w-full bg-[#00B39D] hover:bg-[#00B39D]/90 text-white py-6 text-base rounded-2xl"
              >
                Completar meu cadastro
              </Button>
              <button
                onClick={() => { setStep('cpf'); setNascimento(''); setError(''); }}
                className="w-full text-white/40 hover:text-white/70 text-sm py-2"
              >
                Digitei algo errado — tentar de novo
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Passo 2: data de nascimento ──
  if (step === 'nascimento') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 text-white flex flex-col select-none">
        {cabecalho('Sua data de nascimento')}
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-md space-y-6 text-center">
            <div className="h-16 w-16 rounded-2xl bg-[#00B39D]/15 border border-[#00B39D]/30 flex items-center justify-center mx-auto">
              <CalendarDays className="h-8 w-8 text-[#00B39D]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Confirme quem é você</h1>
              <p className="text-white/50 text-sm mt-1">Informe sua data de nascimento para entrar com segurança.</p>
            </div>
            <input
              type="date"
              value={nascimento}
              onChange={(e) => { setError(''); setNascimento(e.target.value); }}
              max={format(new Date(), 'yyyy-MM-dd')}
              autoFocus
              className="w-full px-4 py-5 rounded-2xl border border-white/15 bg-white/5 text-white text-center text-2xl outline-none focus:border-[#00B39D] [color-scheme:dark]"
            />
            {error && (
              <p className="text-center text-red-300 text-sm bg-red-500/10 border border-red-500/20 rounded-xl py-2 px-4">
                {error}
              </p>
            )}
            <Button
              onClick={buscar}
              disabled={!nascimento || loading}
              className="w-full bg-[#00B39D] hover:bg-[#00B39D]/90 text-white py-6 text-base rounded-2xl gap-2 disabled:opacity-40"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
              {loading ? 'Procurando...' : 'Entrar'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Passo 1: CPF (numpad) ──
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 text-white flex flex-col select-none">
      {cabecalho('Entrar com CPF')}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="h-16 w-16 rounded-2xl bg-[#00B39D]/15 border border-[#00B39D]/30 flex items-center justify-center mx-auto">
              <KeyRound className="h-8 w-8 text-[#00B39D]" />
            </div>
            <h1 className="text-2xl font-bold">Digite seu CPF</h1>
            <p className="text-white/50 text-sm">Depois vamos pedir sua data de nascimento.</p>
          </div>

          <input
            value={cpf}
            onChange={e => { setError(''); setCpf(maskCpf(e.target.value)); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && cpfCompleto) { setStep('nascimento'); } }}
            placeholder="000.000.000-00"
            inputMode="numeric"
            autoFocus
            className="w-full px-4 py-4 rounded-2xl border border-white/15 bg-white/5 text-white text-center text-2xl font-mono tracking-widest placeholder:text-white/20 outline-none focus:border-[#00B39D]"
            maxLength={14}
          />

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-3">
            {KEYS.map(k => (
              <button
                key={k}
                type="button"
                onClick={() => pressDigit(k)}
                className="py-5 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 active:bg-white/20 transition-colors text-2xl font-semibold"
              >
                {k}
              </button>
            ))}
            <button
              type="button"
              onClick={pressBackspace}
              className="py-5 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 active:bg-white/20 transition-colors flex items-center justify-center"
              aria-label="Apagar"
            >
              <Delete className="h-6 w-6 text-white/60" />
            </button>
            <button
              type="button"
              onClick={() => pressDigit('0')}
              className="py-5 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 active:bg-white/20 transition-colors text-2xl font-semibold"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => cpfCompleto && setStep('nascimento')}
              disabled={!cpfCompleto}
              className="py-5 rounded-2xl bg-[#00B39D] hover:bg-[#00B39D]/90 active:bg-[#00B39D]/80 transition-colors flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Avançar"
            >
              <ArrowRight className="h-6 w-6" />
            </button>
          </div>

          <p className="text-center text-white/30 text-xs">
            Seus dados são protegidos. Usamos o CPF e a data de nascimento apenas para identificar seu cadastro.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Novo Cadastro screen ───────────────────────────────────────────────────────

function NovoCadastroScreen({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const cadastroUrl = `${window.location.origin}/cadastro-membresia`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 text-white flex flex-col">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10">
        <button onClick={onBack} className="text-white/40 hover:text-white transition-colors p-1 -ml-1">
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h2 className="text-xl font-semibold">Novo Cadastro</h2>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-2xl grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* Opção 1: pelo celular */}
          <div className="flex flex-col items-center gap-5 p-7 rounded-3xl border border-white/10 bg-white/5">
            <div className="h-12 w-12 rounded-2xl bg-[#00B39D]/20 flex items-center justify-center">
              <QrCode className="h-6 w-6 text-[#00B39D]" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-lg">Usar meu celular</p>
              <p className="text-white/40 text-sm mt-1">Escaneie o QR Code e preencha o formulário no seu telefone</p>
            </div>
            <div className="bg-white p-3 rounded-2xl">
              <QRCodeSVG value={cadastroUrl} size={160} level="M" includeMargin={false} />
            </div>
            <p className="text-white/20 text-xs text-center break-all">{cadastroUrl}</p>
          </div>

          {/* Opção 2: pelo totem */}
          <div className="flex flex-col items-center justify-center gap-5 p-7 rounded-3xl border border-white/10 bg-white/5">
            <div className="h-12 w-12 rounded-2xl bg-[#3B82F6]/20 flex items-center justify-center">
              <UserCheck className="h-6 w-6 text-[#3B82F6]" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-lg">Preencher aqui</p>
              <p className="text-white/40 text-sm mt-1">Preencha o formulário completo diretamente nesta tela</p>
            </div>
            <Button
              onClick={() => navigate('/cadastro-membresia?from=totem')}
              className="bg-[#3B82F6] hover:bg-[#3B82F6]/90 text-white w-full py-3 text-base rounded-2xl"
            >
              Começar cadastro
            </Button>
            <p className="text-white/20 text-xs text-center">
              Após o cadastro, você receberá um QR Code para adicionar na sua carteira digital
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Ações pós-inscrição (compartilhado pelos fluxos) ─────────────────────────
// "Continuar navegando" volta ao menu; "Encerrar sessão" volta à tela inicial.
// Sem toque, encerra sozinho em 20s (quiosque público não pode segurar sessão).

function SuccessActions({ onDone, onEndSession, accent = '#00B39D' }: {
  onDone: () => void;
  onEndSession: () => void;
  accent?: string;
}) {
  const [restante, setRestante] = useState(20);
  useEffect(() => {
    const t = setInterval(() => setRestante((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (restante <= 0) onEndSession();
  }, [restante, onEndSession]);
  return (
    <div className="w-full max-w-sm mx-auto space-y-3 pt-4">
      <Button
        onClick={onDone}
        className="w-full py-6 text-base rounded-2xl text-white hover:opacity-90"
        style={{ backgroundColor: accent }}
      >
        Continuar navegando
      </Button>
      <Button
        onClick={onEndSession}
        variant="outline"
        className="w-full py-5 rounded-2xl border-white/20 text-white hover:bg-white/10"
      >
        Encerrar sessão <span className="text-white/40 ml-1">({restante}s)</span>
      </Button>
    </div>
  );
}

// ── Option Flow router ────────────────────────────────────────────────────────

function OptionFlow({ optionId, member, isDark, onBack, onDone, onEndSession, onNovoCadastro, onNeedIdentify, onActivity }: {
  optionId: OptionId;
  member: MemberData;
  isDark: boolean;
  onBack: () => void;
  onDone: () => void;
  onEndSession: () => void;
  onNovoCadastro: () => void;
  onNeedIdentify: () => void;
  onActivity: () => void;
}) {
  const opt = MENU_OPTIONS.find(o => o.id === optionId)!;

  if (optionId === 'grupos') {
    return <GruposFlow opt={opt} member={member} onBack={onBack} onDone={onDone} onEndSession={onEndSession} onNovoCadastro={onNovoCadastro} onNeedIdentify={onNeedIdentify} onActivity={onActivity} />;
  }
  if (optionId === 'membresia') {
    return <MeusDadosFlow opt={opt} member={member} isDark={isDark} onBack={onBack} onDone={onDone} onActivity={onActivity} />;
  }
  if (optionId === 'batismo') {
    return <BatismoFlow opt={opt} member={member} onBack={onBack} onDone={onDone} onEndSession={onEndSession} onActivity={onActivity} />;
  }
  if (optionId === 'next') {
    return <NextFlow opt={opt} member={member} onBack={onBack} onDone={onDone} onEndSession={onEndSession} onActivity={onActivity} />;
  }
  if (optionId === 'apresentacao_bebe') {
    return <ApresentacaoBebeFlow opt={opt} member={member} onBack={onBack} onDone={onDone} onEndSession={onEndSession} onActivity={onActivity} />;
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

function OptionHeader({ opt, member, isDark = true, onBack }: { opt: (typeof MENU_OPTIONS)[number]; member: MemberData; isDark?: boolean; onBack: () => void }) {
  const Icon = opt.icon;
  const border = isDark ? 'border-white/10' : 'border-gray-200';
  const back   = isDark ? 'text-white/40 hover:text-white' : 'text-gray-400 hover:text-gray-700';
  const name   = isDark ? 'text-white/30' : 'text-gray-400';
  return (
    <div className={`flex items-center gap-3 px-6 py-4 border-b ${border} shrink-0`}>
      <button onClick={onBack} className={`${back} transition-colors p-1 -ml-1`}>
        <ChevronLeft className="h-6 w-6" />
      </button>
      <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: opt.color + '30' }}>
        <Icon className="h-5 w-5" style={{ color: opt.color }} />
      </div>
      <h2 className="text-xl font-semibold">{opt.label}</h2>
      <div className={`ml-auto text-sm ${name}`}>{member.nome.split(' ')[0]}</div>
    </div>
  );
}

// ── Meus Dados flow ───────────────────────────────────────────────────────────

function MeusDadosFlow({ opt, member, isDark, onBack, onDone, onActivity }: {
  opt: (typeof MENU_OPTIONS)[number];
  member: MemberData;
  isDark: boolean;
  onBack: () => void;
  onDone: () => void;
  onActivity: () => void;
}) {
  const src = member.raw?.membro || member.raw?.cadastro || {};
  const [form, setForm] = useState({
    email:        member.email        || src.email        || '',
    telefone:     member.telefone     || src.telefone     || '',
    data_nascimento: src.data_nascimento || '',
    estado_civil: src.estado_civil    || '',
    endereco:     src.endereco        || '',
    bairro:       src.bairro          || '',
    cidade:       src.cidade          || '',
    cep:          src.cep             || '',
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [fotoUrl, setFotoUrl] = useState<string>(member.foto_url || src.foto_url || '');

  // Camera
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camActive, setCamActive] = useState(false);
  const [camLoading, setCamLoading] = useState(false);
  const [camError, setCamError] = useState('');
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedPreview, setCapturedPreview] = useState('');

  const bg    = isDark ? 'bg-gray-950 text-white'    : 'bg-gray-50 text-gray-900';
  const card  = isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200';
  const input = isDark ? 'bg-white/10 border-white/15 text-white placeholder:text-white/30 focus:border-[#00B39D]'
                       : 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-[#00B39D]';
  const label = isDark ? 'text-white/50' : 'text-gray-500';

  const startCamera = async () => {
    setCamError('');
    setCamLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamActive(true);
      setCapturedBlob(null);
      setCapturedPreview('');
    } catch {
      setCamError('Câmera não disponível ou sem permissão.');
    }
    setCamLoading(false);
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCamActive(false);
  };

  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    c.toBlob(blob => {
      if (!blob) return;
      setCapturedBlob(blob);
      setCapturedPreview(URL.createObjectURL(blob));
      stopCamera();
    }, 'image/jpeg', 0.92);
  };

  const uploadPhoto = async () => {
    if (!capturedBlob || !member.id) return;
    const fd = new FormData();
    fd.append('foto', capturedBlob, 'foto.jpg');
    const res = await membresia.totem.uploadFoto(member.id, fd);
    if (res.foto_url) setFotoUrl(res.foto_url);
    return res.foto_url;
  };

  const handleSave = async () => {
    if (!member.id) return;
    setSaving(true);
    setSaveMsg('');
    onActivity();
    try {
      if (capturedBlob) await uploadPhoto();
      // Only send non-empty editable fields
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(form)) {
        if (v !== '' && v !== null && v !== undefined) payload[k] = v as string;
      }
      await membresia.totem.updateMembro(member.id, payload);
      setSaveMsg('Dados salvos com sucesso!');
      setTimeout(onDone, 1800);
    } catch (e: any) {
      setSaveMsg('Erro ao salvar: ' + (e?.message || 'tente novamente'));
    }
    setSaving(false);
  };

  // Cleanup camera on unmount
  useEffect(() => () => stopCamera(), []);

  const setField = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }));
    onActivity();
  };

  const ESTADO_CIVIL_OPTS = [
    { value: 'solteiro', label: 'Solteiro(a)' },
    { value: 'casado', label: 'Casado(a)' },
    { value: 'divorciado', label: 'Divorciado(a)' },
    { value: 'viuvo', label: 'Viúvo(a)' },
    { value: 'uniao_estavel', label: 'União estável' },
  ];

  const trilha: { etapa: string; concluida: boolean; data_conclusao?: string }[] = src.trilha || [];
  const hasNext    = trilha.find(t => t.etapa === 'next')?.concluida;
  const familia    = src.familia;
  const grupoAtual = src.grupo_atual;

  const chipDark  = isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200';
  const chipBadgeOk  = 'bg-[#00B39D]/15 text-[#00B39D]';
  const chipBadgeNo  = isDark ? 'bg-white/10 text-white/40' : 'bg-gray-100 text-gray-400';

  return (
    <div className={`min-h-screen flex flex-col ${bg}`} onClick={onActivity}>
      <OptionHeader opt={opt} member={member} isDark={isDark} onBack={onBack} />

      <div className="flex-1 overflow-y-auto p-6">

        {/* Info chips row */}
        <div className="max-w-3xl mx-auto grid grid-cols-3 gap-3 mb-5">
          {/* Família */}
          <div className={`rounded-2xl border p-3 flex flex-col gap-1 ${chipDark}`}>
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${label}`}>Família</p>
            {familia ? (
              <p className="text-sm font-semibold">{familia.nome}</p>
            ) : (
              <p className={`text-xs ${isDark ? 'text-white/30' : 'text-gray-400'}`}>Não vinculada</p>
            )}
          </div>

          {/* Grupo de Conexão */}
          <div className={`rounded-2xl border p-3 flex flex-col gap-1 ${chipDark}`}>
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${label}`}>Grupo de Conexão</p>
            {grupoAtual ? (
              <p className="text-sm font-semibold leading-tight">{grupoAtual.nome}</p>
            ) : (
              <p className={`text-xs ${isDark ? 'text-white/30' : 'text-gray-400'}`}>Sem grupo</p>
            )}
          </div>

          {/* Jornada */}
          <div className={`rounded-2xl border p-3 flex flex-col gap-1.5 ${chipDark}`}>
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${label}`}>Jornada</p>
            <div className="flex gap-1.5 flex-wrap">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${hasNext ? chipBadgeOk : chipBadgeNo}`}>
                Next {hasNext ? '✓' : '—'}
              </span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${trilha.find(t => t.etapa === 'voluntariado')?.concluida ? chipBadgeOk : chipBadgeNo}`}>
                Voluntariado {trilha.find(t => t.etapa === 'voluntariado')?.concluida ? '✓' : '—'}
              </span>
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">

          {/* Photo column */}
          <div className="flex flex-col items-center gap-4">
            <div className={`w-full rounded-2xl border p-4 flex flex-col items-center gap-3 ${card}`}>
              <p className={`text-xs font-semibold uppercase tracking-wider ${label}`}>Foto do Rosto</p>

              {/* Photo preview */}
              {capturedPreview ? (
                <img src={capturedPreview} className="h-48 w-48 rounded-2xl object-cover ring-2 ring-[#00B39D]" alt="Nova foto" />
              ) : fotoUrl ? (
                <img src={fotoUrl} className="h-48 w-48 rounded-2xl object-cover ring-2 ring-[#00B39D]/50" alt="Foto atual" />
              ) : (
                <div className="h-48 w-48 rounded-2xl bg-[#00B39D]/10 flex items-center justify-center text-6xl font-bold text-[#00B39D]">
                  {member.nome.charAt(0)}
                </div>
              )}

              {/* Camera or capture */}
              {camActive ? (
                <div className="w-full space-y-2">
                  <video ref={videoRef} className="w-full rounded-xl object-cover" autoPlay muted playsInline style={{ maxHeight: 200 }} />
                  <div className="flex gap-2">
                    <button onClick={capture} className="flex-1 py-2 rounded-xl bg-[#00B39D] text-white text-sm font-semibold flex items-center justify-center gap-2">
                      <Camera className="h-4 w-4" /> Capturar
                    </button>
                    <button onClick={stopCamera} className="p-2 rounded-xl border border-red-500/40 text-red-400">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={startCamera}
                  disabled={camLoading}
                  className={`w-full py-2.5 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 transition-colors ${isDark ? 'border-white/20 text-white/70 hover:bg-white/10' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}
                >
                  {camLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  {capturedPreview ? 'Tirar outra foto' : 'Abrir câmera'}
                </button>
              )}
              {camError && <p className="text-xs text-red-400 text-center">{camError}</p>}
              {capturedPreview && (
                <p className="text-xs text-[#00B39D] text-center">Nova foto pronta para salvar</p>
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </div>

          {/* Form column */}
          <div className={`rounded-2xl border p-5 space-y-4 ${card}`}>
            <p className={`text-xs font-semibold uppercase tracking-wider ${label}`}>Informações Pessoais</p>

            {/* Nome — read only */}
            <div>
              <label className={`block text-xs mb-1 ${label}`}>Nome completo</label>
              <div className={`px-3 py-2 rounded-xl border text-sm ${isDark ? 'bg-white/5 border-white/10 text-white/60' : 'bg-gray-100 border-gray-200 text-gray-500'}`}>
                {src.nome || member.nome}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`block text-xs mb-1 ${label}`}>E-mail</label>
                <input value={form.email} onChange={setField('email')} type="email"
                  className={`w-full px-3 py-2 rounded-xl border text-sm outline-none transition-colors ${input}`} />
              </div>
              <div>
                <label className={`block text-xs mb-1 ${label}`}>Telefone</label>
                <input value={form.telefone} onChange={setField('telefone')} type="tel"
                  className={`w-full px-3 py-2 rounded-xl border text-sm outline-none transition-colors ${input}`} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`block text-xs mb-1 ${label}`}>Data de nascimento</label>
                <input value={form.data_nascimento} onChange={setField('data_nascimento')} type="date"
                  className={`w-full px-3 py-2 rounded-xl border text-sm outline-none transition-colors ${input}`} />
              </div>
              <div>
                <label className={`block text-xs mb-1 ${label}`}>Estado civil</label>
                <select value={form.estado_civil} onChange={setField('estado_civil')}
                  className={`w-full px-3 py-2 rounded-xl border text-sm outline-none transition-colors ${input}`}>
                  <option value="">Selecionar</option>
                  {ESTADO_CIVIL_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <p className={`text-xs font-semibold uppercase tracking-wider pt-2 ${label}`}>Endereço</p>

            <div>
              <label className={`block text-xs mb-1 ${label}`}>Endereço</label>
              <input value={form.endereco} onChange={setField('endereco')}
                className={`w-full px-3 py-2 rounded-xl border text-sm outline-none transition-colors ${input}`} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`block text-xs mb-1 ${label}`}>Bairro</label>
                <input value={form.bairro} onChange={setField('bairro')}
                  className={`w-full px-3 py-2 rounded-xl border text-sm outline-none transition-colors ${input}`} />
              </div>
              <div>
                <label className={`block text-xs mb-1 ${label}`}>CEP</label>
                <input value={form.cep} onChange={setField('cep')}
                  className={`w-full px-3 py-2 rounded-xl border text-sm outline-none transition-colors ${input}`} />
              </div>
            </div>
            <div>
              <label className={`block text-xs mb-1 ${label}`}>Cidade</label>
              <input value={form.cidade} onChange={setField('cidade')}
                className={`w-full px-3 py-2 rounded-xl border text-sm outline-none transition-colors ${input}`} />
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="max-w-3xl mx-auto mt-6 flex items-center justify-between gap-4">
          {saveMsg && (
            <p className={`text-sm ${saveMsg.includes('Erro') ? 'text-red-400' : 'text-[#00B39D]'}`}>{saveMsg}</p>
          )}
          <div className="ml-auto flex gap-3">
            <Button variant="outline" onClick={onBack} className={isDark ? 'border-white/20 text-white hover:bg-white/10' : ''}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#00B39D] hover:bg-[#00B39D]/90 text-white gap-2 min-w-[140px]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Salvando...' : 'Salvar dados'}
            </Button>
          </div>
        </div>
      </div>
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

function GruposFlow({ opt, member, onBack, onDone, onEndSession, onNovoCadastro, onNeedIdentify, onActivity }: {
  opt: (typeof MENU_OPTIONS)[number];
  member: MemberData;
  onBack: () => void;
  onDone: () => void;
  onEndSession: () => void;
  onNovoCadastro: () => void;
  onNeedIdentify: () => void;
  onActivity: () => void;
}) {
  const [grupos, setGrupos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [memberCoords, setMemberCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [filterCat, setFilterCat] = useState<string>('');
  // Filtros em paridade com a inscrição pública (busca grupo|líder, dia,
  // frequência, bairro) — mantendo a ordenação por distância e o mapa do totem.
  const [busca, setBusca] = useState('');
  const [searchMode, setSearchMode] = useState<'grupo' | 'lider'>('grupo');
  const [fDia, setFDia] = useState<string>('');
  const [fRecorrencia, setFRecorrencia] = useState<string>('');
  const [fBairro, setFBairro] = useState<string>('');
  const [showFiltros, setShowFiltros] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [pedidoEnviado, setPedidoEnviado] = useState(false);
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

  // Opções data-driven (só aparecem quando há valor → sem filtro-fantasma)
  const categories = [...new Set(grupos.map(g => g.categoria).filter(Boolean))] as string[];
  const bairros = [...new Set(grupos.map(g => g.bairro).filter(Boolean))].sort() as string[];
  const dias = [...new Set(grupos.map(g => g.dia_semana).filter((v) => v != null))].sort((a, b) => a - b) as number[];
  const recorrencias = [...new Set(grupos.map(g => (g.recorrencia || '').toLowerCase().trim()).filter(Boolean))] as string[];
  const RECORRENCIA_LABEL: Record<string, string> = { diario: 'Diário', semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal' };

  const buscaNorm = busca.trim().toLowerCase();
  const filtered = gruposEnriched.filter((g) => {
    if (filterCat && g.categoria !== filterCat) return false;
    if (fBairro && g.bairro !== fBairro) return false;
    if (fDia !== '' && String(g.dia_semana) !== fDia) return false;
    if (fRecorrencia && (g.recorrencia || '').toLowerCase().trim() !== fRecorrencia) return false;
    if (buscaNorm) {
      const alvo = searchMode === 'lider'
        ? String(g.lider?.nome || '').toLowerCase()
        : String(g.nome || '').toLowerCase();
      if (!alvo.includes(buscaNorm)) return false;
    }
    return true;
  });
  const filtrosAtivos = [filterCat, fBairro, fDia !== '' ? fDia : '', fRecorrencia, buscaNorm].filter(Boolean).length;
  const limparFiltros = () => { setFilterCat(''); setFBairro(''); setFDia(''); setFRecorrencia(''); setBusca(''); };

  const handleConfirm = async () => {
    if (!selected || !member.id) return;
    setSaving(true); setError('');
    try {
      await membresia.totem.pedirGrupo(selected.id, {
        ...(member.pending ? { cadastro_pendente_id: member.id } : { membro_id: member.id }),
        nome: member.nome,
        telefone: member.telefone || null,
        email: member.email || null,
      });
      setPedidoEnviado(true);
    } catch {
      setError('Não foi possível registrar. Tente novamente.');
    }
    setSaving(false);
  };

  // ── Pedido enviado ────────────────────────────────────────────────────────
  if (pedidoEnviado && selected) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-6 p-8" onClick={onActivity}>
        <CheckCircle2 className="h-20 w-20 text-[#00B39D]" />
        <div className="text-center max-w-md">
          <h2 className="text-3xl font-bold">Pedido enviado!</h2>
          <p className="text-white/70 mt-3">
            Você pediu para entrar no grupo <span className="text-[#00B39D] font-semibold">{selected.nome}</span>.
          </p>
          <p className="text-white/50 mt-2 text-sm">
            O líder vai receber seu pedido e te chamar no WhatsApp para confirmar.
          </p>
        </div>
        <SuccessActions onDone={onDone} onEndSession={onEndSession} />
      </div>
    );
  }

  // ── Confirmation screen ──────────────────────────────────────────────────────
  if (selected) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col" onClick={onActivity}>
        <OptionHeader opt={opt} member={member} onBack={() => { setSelected(null); setError(''); }} />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-md space-y-6">
            <div className="text-center">
              <div className="h-16 w-16 rounded-2xl bg-[#00B39D]/20 flex items-center justify-center mx-auto mb-4">
                <Users className="h-8 w-8 text-[#00B39D]" />
              </div>
              <h3 className="text-2xl font-bold">{member.guest ? 'Quero participar' : 'Pedir para entrar'}</h3>
              <p className="text-white/50 text-sm mt-1">O líder do grupo aprova o pedido e te chama no WhatsApp.</p>
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
            {member.guest ? (
              <div className="space-y-3">
                <p className="text-white/60 text-sm text-center">
                  Pra enviar seu pedido, informe seu CPF e data de nascimento — se você já
                  tem cadastro, é só isso; se não, criamos rapidinho.
                </p>
                <Button onClick={onNeedIdentify} className="w-full bg-[#00B39D] hover:bg-[#00B39D]/90 py-6 text-base rounded-2xl">
                  Continuar
                </Button>
                <Button variant="outline" onClick={() => { setSelected(null); setError(''); }} className="w-full border-white/20 text-white hover:bg-white/10 rounded-2xl">
                  Voltar aos grupos
                </Button>
              </div>
            ) : (
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => { setSelected(null); setError(''); }} className="flex-1 border-white/20 text-white hover:bg-white/10" disabled={saving}>Cancelar</Button>
                <Button onClick={handleConfirm} disabled={saving} className="flex-1 bg-[#00B39D] hover:bg-[#00B39D]/90">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar pedido'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── List / Map screen ────────────────────────────────────────────────────────
  return (
    <div className="h-screen overflow-hidden bg-gray-950 text-white flex flex-col" onClick={onActivity}>
      <OptionHeader opt={opt} member={member} onBack={onBack} />

      {/* Filters bar */}
      <div className="px-5 py-3 border-b border-white/10 flex flex-col gap-3 shrink-0">
        <div className="flex items-center gap-2">
          {/* Busca por grupo | líder */}
          <div className="flex items-center gap-1 rounded-full bg-white/5 border border-white/10 p-1 shrink-0">
            <button
              onClick={() => setSearchMode('grupo')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${searchMode === 'grupo' ? 'bg-[#00B39D] text-white' : 'text-white/50 hover:text-white/80'}`}
            >
              Grupo
            </button>
            <button
              onClick={() => setSearchMode('lider')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${searchMode === 'lider' ? 'bg-[#00B39D] text-white' : 'text-white/50 hover:text-white/80'}`}
            >
              Líder
            </button>
          </div>
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={searchMode === 'lider' ? 'Buscar por líder...' : 'Buscar por grupo...'}
              className="w-full pl-9 pr-3 py-2 rounded-full bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/30 outline-none focus:border-[#00B39D]"
            />
          </div>
          <button
            onClick={() => setShowFiltros(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm transition-colors shrink-0 ${showFiltros || filtrosAtivos ? 'bg-[#00B39D] text-white' : 'bg-white/10 text-white/60 hover:bg-white/15'}`}
          >
            <List className="h-3.5 w-3.5" /> Filtros{filtrosAtivos ? ` (${filtrosAtivos})` : ''}
          </button>
          <button
            onClick={() => setShowMap(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm transition-colors shrink-0 ${showMap ? 'bg-[#00B39D] text-white' : 'bg-white/10 text-white/60 hover:bg-white/15'}`}
          >
            {showMap ? <List className="h-3.5 w-3.5" /> : <Map className="h-3.5 w-3.5" />}
            {showMap ? 'Lista' : 'Mapa'}
          </button>
        </div>

        {/* Painel de filtros (dia · frequência · bairro · categoria) */}
        {showFiltros && (
          <div className="flex flex-col gap-2.5 rounded-2xl bg-white/[0.03] border border-white/10 p-3">
            {dias.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-white/40 w-20 shrink-0">Dia</span>
                {dias.map((d) => (
                  <button key={d} onClick={() => setFDia(String(d) === fDia ? '' : String(d))}
                    className={`px-3 py-1 rounded-full text-xs transition-colors ${fDia === String(d) ? 'bg-[#00B39D] text-white' : 'bg-white/10 text-white/60 hover:bg-white/15'}`}>
                    {DIAS_MAP[d]}
                  </button>
                ))}
              </div>
            )}
            {recorrencias.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-white/40 w-20 shrink-0">Frequência</span>
                {recorrencias.map((r) => (
                  <button key={r} onClick={() => setFRecorrencia(r === fRecorrencia ? '' : r)}
                    className={`px-3 py-1 rounded-full text-xs transition-colors ${fRecorrencia === r ? 'bg-[#00B39D] text-white' : 'bg-white/10 text-white/60 hover:bg-white/15'}`}>
                    {RECORRENCIA_LABEL[r] || r}
                  </button>
                ))}
              </div>
            )}
            {bairros.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-white/40 w-20 shrink-0">Bairro</span>
                {bairros.map((b) => (
                  <button key={b} onClick={() => setFBairro(b === fBairro ? '' : b)}
                    className={`px-3 py-1 rounded-full text-xs transition-colors ${fBairro === b ? 'bg-[#00B39D] text-white' : 'bg-white/10 text-white/60 hover:bg-white/15'}`}>
                    {b}
                  </button>
                ))}
              </div>
            )}
            {categories.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-white/40 w-20 shrink-0">Categoria</span>
                {categories.map((cat) => (
                  <button key={cat} onClick={() => setFilterCat(cat === filterCat ? '' : cat)}
                    className={`px-3 py-1 rounded-full text-xs transition-colors ${filterCat === cat ? 'bg-[#00B39D] text-white' : 'bg-white/10 text-white/60 hover:bg-white/15'}`}>
                    {cat}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between pt-1">
              {memberCoords ? (
                <span className="text-xs text-white/30 flex items-center gap-1">
                  <Navigation className="h-3 w-3 text-[#00B39D]" /> ordenado por distância
                </span>
              ) : <span />}
              {filtrosAtivos > 0 && (
                <button onClick={limparFiltros} className="text-xs text-white/50 hover:text-white/80 underline">
                  Limpar filtros
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#00B39D]" />
        </div>
      ) : showMap ? (
        /* ── Map view (MapLibre) ── */
        <div className="flex-1 min-h-0 relative">
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
        <div className="flex-1 min-h-0 overflow-y-auto p-5">
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

// ── Batismo Flow ──────────────────────────────────────────────────────────────

function BatismoFlow({ opt, member, onBack, onDone, onEndSession, onActivity }: {
  opt: (typeof MENU_OPTIONS)[number];
  member: MemberData;
  onBack: () => void;
  onDone: () => void;
  onEndSession: () => void;
  onActivity: () => void;
}) {
  const guest = !!member.guest;
  const memberSrc = member.raw?.membro || member.raw?.cadastro || {};
  const [step, setStep] = useState<'info' | 'horario' | 'dados' | 'success'>('info');
  // Próximo batismo + horários com vaga (mesma fonte do formulário público)
  const [agenda, setAgenda] = useState<{ data_batismo: string | null; horarios: any[]; grupo_url: string | null }>({
    data_batismo: null, horarios: [], grupo_url: null,
  });
  const [agendaLoading, setAgendaLoading] = useState(true);
  const [horarioSel, setHorarioSel] = useState<any>(null);
  const [form, setForm] = useState({
    nome: guest ? '' : ((member.nome || '').split(' ')[0] || ''),
    sobrenome: guest ? '' : ((member.nome || '').split(' ').slice(1).join(' ') || ''),
    cpf: member.cpf || '',
    data_nascimento: memberSrc.data_nascimento || '',
    telefone: member.telefone || '',
    email: member.email || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    membresia.totem.batismoHorarios()
      .then((r: any) => setAgenda({
        data_batismo: r?.data_batismo || null,
        horarios: r?.horarios || [],
        grupo_url: r?.grupo_url || null,
      }))
      .catch(() => {})
      .finally(() => setAgendaLoading(false));
  }, []);

  const maskCpf = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
    return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  };

  const setField = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: k === 'cpf' ? maskCpf(e.target.value) : e.target.value }));

  // Sessão com dados completos pula a tela de dados (pedido do redesenho):
  // o totem exige CPF válido (mesma lei do formulário público de batismo)
  // e um telefone de contato.
  const dadosCompletos = !guest
    && !!form.nome && !!form.sobrenome
    && cpfDvOk(form.cpf)
    && form.telefone.replace(/\D/g, '').length >= 10;

  const handleSubmit = async () => {
    if (!form.nome || !form.sobrenome) { setError('Nome e sobrenome são obrigatórios'); setStep('dados'); return; }
    if (!cpfDvOk(form.cpf)) { setError('CPF é obrigatório e precisa ser válido'); setStep('dados'); return; }
    if (form.telefone.replace(/\D/g, '').length < 10) { setError('Informe um telefone com DDD'); setStep('dados'); return; }
    setSaving(true); setError('');
    onActivity();
    try {
      await kpisApi.batismos.create({
        ...form,
        origem: 'totem',
        ...(horarioSel ? { horario_culto: horarioSel.horario } : {}),
      });
      setStep('success');
    } catch (e: any) {
      setError(e.message || 'Não foi possível registrar. Tente novamente.');
    }
    setSaving(false);
  };

  const inputCls = 'w-full px-4 py-3 rounded-2xl border border-gray-700 bg-gray-800 text-white placeholder:text-gray-500 text-sm outline-none focus:border-[#6366F1] focus:ring-1 focus:ring-[#6366F1]/30 transition-colors';

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-6 p-8" onClick={onActivity}>
        <CheckCircle2 className="h-20 w-20 text-[#00B39D]" />
        <div className="text-center max-w-md">
          <h2 className="text-3xl font-bold">Inscrição confirmada!</h2>
          {agenda.data_batismo ? (
            <p className="text-white/70 mt-3 text-lg">
              Seu batismo será em <span className="text-[#6366F1] font-semibold">{fmtDateBR(agenda.data_batismo)}</span>
              {horarioSel ? <> · culto das <span className="text-[#6366F1] font-semibold">{horarioSel.label || horarioSel.horario}</span></> : null}
            </p>
          ) : (
            <p className="text-white/60 mt-2">Nossa equipe entrará em contato, {form.nome}!</p>
          )}
          <p className="text-white/50 mt-2 text-sm">Nossa equipe vai te chamar no WhatsApp com as orientações.</p>
        </div>
        {agenda.grupo_url && (
          <div className="text-center">
            <p className="text-white/60 text-sm mb-2">Entre agora no grupo de WhatsApp do batismo:</p>
            <div className="inline-block bg-white p-2.5 rounded-xl">
              <QRCodeSVG value={agenda.grupo_url} size={110} level="M" includeMargin={false} />
            </div>
          </div>
        )}
        <SuccessActions onDone={onDone} onEndSession={onEndSession} accent="#6366F1" />
      </div>
    );
  }

  if (step === 'info') {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col" onClick={onActivity}>
        <OptionHeader opt={opt} member={member} onBack={onBack} />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md text-center space-y-6">
            <div className="h-20 w-20 rounded-3xl bg-[#6366F1]/20 flex items-center justify-center mx-auto">
              <Droplets className="h-10 w-10 text-[#6366F1]" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Batismo</h2>
              <p className="text-white/50 mt-2 leading-relaxed">
                O batismo é um passo importante na jornada de fé. Se você aceitou Jesus e quer dar esse próximo passo, registre seu interesse aqui!
              </p>
            </div>
            {agenda.data_batismo && (
              <div className="rounded-2xl border border-[#6366F1]/30 bg-[#6366F1]/10 p-4">
                <p className="text-white/60 text-xs uppercase tracking-wider">Próximo batismo</p>
                <p className="text-xl font-bold text-[#6366F1] mt-1">{fmtDateBR(agenda.data_batismo)}</p>
              </div>
            )}
            <div className="space-y-3">
              <Button
                onClick={() => setStep('horario')}
                className="w-full bg-[#6366F1] hover:bg-[#6366F1]/90 text-white py-3 text-base rounded-2xl gap-2"
              >
                Quero me batizar <ChevronRight className="h-5 w-5" />
              </Button>
              <button onClick={onBack} className="w-full text-white/30 hover:text-white/60 text-sm transition-colors py-2">
                Voltar ao menu
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'horario') {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col" onClick={onActivity}>
        <OptionHeader opt={opt} member={member} onBack={() => setStep('info')} />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md space-y-5">
            <div className="text-center">
              <h2 className="text-xl font-bold">Escolha o horário</h2>
              {agenda.data_batismo && (
                <p className="text-white/50 text-sm mt-1">
                  Próximo batismo: <span className="text-[#6366F1] font-semibold">{fmtDateBR(agenda.data_batismo)}</span>
                </p>
              )}
            </div>
            {agendaLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-[#6366F1]" /></div>
            ) : agenda.horarios.length === 0 ? (
              <div className="text-center space-y-4 py-6">
                <p className="text-white/60">As vagas deste batismo se esgotaram.</p>
                <p className="text-white/40 text-sm">Procure nossa equipe no lounge para entrar na lista do próximo.</p>
                <Button onClick={onBack} variant="outline" className="border-white/20 text-white hover:bg-white/10">
                  Voltar ao menu
                </Button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3">
                  {agenda.horarios.map((h: any) => {
                    const sel = horarioSel?.horario === h.horario;
                    return (
                      <button
                        key={h.horario}
                        onClick={() => setHorarioSel(h)}
                        className={`flex items-center justify-between px-5 py-4 rounded-2xl border text-left transition-all ${
                          sel ? 'border-[#6366F1] bg-[#6366F1]/15' : 'border-white/15 bg-white/5 hover:bg-white/10'
                        }`}
                      >
                        <span className="text-lg font-semibold">{h.label || h.horario}</span>
                        {h.vagas_restantes != null && (
                          <span className={`text-xs ${sel ? 'text-[#6366F1]' : 'text-white/40'}`}>
                            {h.vagas_restantes} vaga{h.vagas_restantes === 1 ? '' : 's'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                <Button
                  onClick={() => { if (!horarioSel) return; if (dadosCompletos) handleSubmit(); else setStep('dados'); }}
                  disabled={!horarioSel || saving}
                  className="w-full bg-[#6366F1] hover:bg-[#6366F1]/90 text-white py-3 text-base rounded-2xl gap-2"
                >
                  {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Droplets className="h-5 w-5" />}
                  {saving ? 'Registrando...' : dadosCompletos ? 'Confirmar inscrição' : 'Continuar'}
                </Button>
                {dadosCompletos && (
                  <p className="text-center text-white/30 text-xs">
                    Vamos usar os dados do seu cadastro, {form.nome} — nada para digitar.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // step === 'dados' — só aparece quando falta algo (CPF/telefone) ou pra
  // convidado; quem tem cadastro completo confirma direto na tela de horário.
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col" onClick={onActivity}>
      <OptionHeader opt={opt} member={member} onBack={() => setStep('horario')} />
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4">
          <div className="text-center mb-2">
            <h2 className="text-xl font-bold">Complete seus dados</h2>
            <p className="text-white/40 text-sm mt-1">
              {agenda.data_batismo
                ? <>Batismo em <span className="text-[#6366F1]">{fmtDateBR(agenda.data_batismo)}</span>{horarioSel ? <> · {horarioSel.label || horarioSel.horario}</> : null}</>
                : 'Seus dados serão usados para registrar o batismo'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/40 mb-1">Nome *</label>
              <input value={form.nome} onChange={setField('nome')} className={inputCls} placeholder="Nome" />
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1">Sobrenome *</label>
              <input value={form.sobrenome} onChange={setField('sobrenome')} className={inputCls} placeholder="Sobrenome" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-white/40 mb-1">CPF *</label>
            <input value={form.cpf} onChange={setField('cpf')} className={inputCls} placeholder="000.000.000-00" inputMode="numeric" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/40 mb-1">Data de nascimento</label>
              <input type="date" value={form.data_nascimento} onChange={setField('data_nascimento')} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1">Telefone *</label>
              <input value={form.telefone} onChange={setField('telefone')} className={inputCls} placeholder="(21) 9..." inputMode="numeric" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-white/40 mb-1">E-mail</label>
            <input type="email" value={form.email} onChange={setField('email')} className={inputCls} placeholder="email@exemplo.com" />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <Button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full bg-[#6366F1] hover:bg-[#6366F1]/90 text-white py-3 text-base rounded-2xl gap-2 mt-2"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Droplets className="h-5 w-5" />}
            {saving ? 'Registrando...' : 'Confirmar inscrição'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Check-in de Batismo (quiosque · Fase 1) ─────────────────────────────────
// Fluxo assistido pela equipe no dia do batismo: lista os batizandos do dia →
// a pessoa se acha → CPF (dedup na origem) + selfie + consentimento → imprime a
// etiqueta (QR de acesso às fotos + código curto). docs/quiosque-lounge-identidade.md
type CheckinBatizando = { id: string; nome: string; sobrenome?: string; ja_checkin: boolean; tem_foto: boolean };

function CheckinBatismoFlow({ onExit }: { onExit: () => void }) {
  const [step, setStep] = useState<'lista' | 'dados' | 'sucesso' | 'impressora'>('lista');
  const [lista, setLista] = useState<CheckinBatizando[]>([]);
  const [loadingLista, setLoadingLista] = useState(true);
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<CheckinBatizando | null>(null);
  const [cpf, setCpf] = useState('');
  const [consentiu, setConsentiu] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [okNome, setOkNome] = useState('');
  const [dataLabel, setDataLabel] = useState('');
  const [printing, setPrinting] = useState(false);
  const [printMsg, setPrintMsg] = useState('');

  // Câmera (selfie de referência · opcional)
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camActive, setCamActive] = useState(false);
  const [camLoading, setCamLoading] = useState(false);
  const [camErr, setCamErr] = useState('');
  const [selfieBlob, setSelfieBlob] = useState<Blob | null>(null);
  const [selfiePreview, setSelfiePreview] = useState('');

  const carregar = useCallback(async () => {
    setLoadingLista(true);
    try {
      const r = await kpisApi.batismos.checkin.doDia();
      setLista(r.batizandos || []);
      if (r.data) {
        const [y, m, d] = String(r.data).split('-');
        setDataLabel(`${d}/${m}/${y}`);
      }
    } catch {
      setLista([]);
    }
    setLoadingLista(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCamActive(false);
  }, []);
  useEffect(() => () => stopCamera(), [stopCamera]);

  const startCamera = async () => {
    setCamErr('');
    setCamLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamActive(true);
      setSelfieBlob(null);
      setSelfiePreview('');
    } catch {
      setCamErr('Câmera não disponível ou sem permissão.');
    }
    setCamLoading(false);
  };

  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    c.toBlob(blob => {
      if (!blob) return;
      setSelfieBlob(blob);
      setSelfiePreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
      stopCamera();
    }, 'image/jpeg', 0.92);
  };

  const selecionar = (p: CheckinBatizando) => {
    setSel(p);
    setCpf(''); setConsentiu(false); setError('');
    setSelfieBlob(null); setSelfiePreview('');
    stopCamera();
    setStep('dados');
  };

  const voltarLista = () => {
    stopCamera();
    setSel(null);
    setStep('lista');
    carregar();
  };

  const finalizar = async () => {
    if (!sel) return;
    stopCamera();  // garante que a câmera pare mesmo se concluir sem capturar
    setSaving(true); setError('');
    try {
      const digits = cpf.replace(/\D/g, '');
      const r = await kpisApi.batismos.checkin.confirmar(sel.id, { cpf: digits || null, consentiu });
      if (selfieBlob && consentiu) {
        try { await kpisApi.batismos.checkin.fotoReferencia(sel.id, selfieBlob); }
        catch { /* selfie é opcional · não bloqueia o check-in */ }
      }
      const qrUrl = `${window.location.origin}/batismo/acesso?token=${r.codigo_acesso}`;
      await imprimirEtiquetaBatismo({
        nome: r.nome || `${sel.nome} ${sel.sobrenome || ''}`.trim(),
        codigoConferencia: r.codigo_conferencia,
        qrUrl,
        dataLabel,
      });
      setOkNome((r.nome || sel.nome || '').split(' ')[0]);
      setStep('sucesso');
    } catch (e: any) {
      setError(e?.message || 'Não foi possível concluir o check-in.');
    }
    setSaving(false);
  };

  // Teste da impressora · imprime/pré-visualiza uma etiqueta de exemplo pra a
  // equipe conferir a Brother (por cabo · definida como padrão do Windows).
  // O navegador não escolhe a impressora por código — a etiqueta de teste sai
  // na impressora padrão, confirmando o cabo + a configuração antes do culto.
  const testarImpressao = async (preview: boolean) => {
    setPrinting(true);
    setPrintMsg('');
    try {
      await imprimirEtiquetaBatismo({
        nome: 'TESTE DA IMPRESSORA',
        codigoConferencia: 'TESTE1',
        qrUrl: `${window.location.origin}/batismo/acesso?token=TESTE`,
        dataLabel: dataLabel || format(new Date(), 'dd/MM/yyyy'),
      }, preview);
      setPrintMsg(preview ? 'Pré-visualização aberta.' : 'Etiqueta de teste enviada à impressora.');
    } catch {
      setPrintMsg('Não foi possível imprimir. Confira se a Brother está conectada e definida como padrão.');
    }
    setPrinting(false);
  };

  const inputCls = 'w-full px-4 py-3 rounded-2xl border border-gray-700 bg-gray-800 text-white placeholder:text-gray-500 text-sm outline-none focus:border-[#6366F1] focus:ring-1 focus:ring-[#6366F1]/30 transition-colors';

  // ── Sucesso ──
  if (step === 'sucesso') return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-6 p-8">
      <CheckCircle2 className="h-20 w-20 text-[#00B39D]" />
      <div className="text-center">
        <h2 className="text-3xl font-bold">Check-in feito!</h2>
        <p className="text-white/60 mt-2">Etiqueta impressa{okNome ? `, ${okNome}` : ''} · aponte a câmera para ver suas fotos.</p>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={voltarLista} className="bg-[#6366F1] hover:bg-[#6366F1]/90 text-white px-6 py-3 rounded-2xl">
          Próxima pessoa
        </Button>
        <button onClick={onExit} className="text-white/40 hover:text-white/70 text-sm px-4">Sair</button>
      </div>
    </div>
  );

  // ── Dados (CPF + consentimento + selfie) ──
  if (step === 'dados' && sel) return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10">
        <button onClick={voltarLista} className="text-white/40 hover:text-white transition-colors p-1 -ml-1">
          <ChevronLeft className="h-6 w-6" />
        </button>
        <div>
          <h2 className="text-xl font-semibold">{`${sel.nome} ${sel.sobrenome || ''}`.trim()}</h2>
          <p className="text-white/40 text-xs">Complete os dados para receber sua foto</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="w-full max-w-md mx-auto space-y-5">
          {/* CPF */}
          <div>
            <label className="block text-xs text-white/40 mb-1">CPF (opcional)</label>
            <input
              value={cpf}
              onChange={(e) => setCpf(maskCpfInput(e.target.value))}
              className={inputCls}
              placeholder="000.000.000-00"
              inputMode="numeric"
            />
            <p className="text-[11px] text-white/30 mt-1">O CPF garante que suas fotos fiquem ligadas só a você.</p>
          </div>

          {/* Consentimento */}
          <label className="flex items-start gap-3 p-3 rounded-2xl border border-white/10 bg-white/5 cursor-pointer">
            <input type="checkbox" checked={consentiu} onChange={(e) => setConsentiu(e.target.checked)} className="mt-1 h-5 w-5 accent-[#6366F1]" />
            <span className="text-sm text-white/80">
              Autorizo o registro da minha foto para receber as fotos do batismo.
              <span className="block text-[11px] text-white/40 mt-1">
                Menores de 18 anos precisam de autorização do responsável — caso ele esteja, pode autorizar!
              </span>
            </span>
          </label>

          {/* Selfie */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 flex flex-col items-center gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/40">Foto (opcional)</p>
            {selfiePreview ? (
              <img src={selfiePreview} className="h-40 w-40 rounded-2xl object-cover ring-2 ring-[#6366F1]" alt="Selfie" />
            ) : (
              <div className="h-40 w-40 rounded-2xl bg-[#6366F1]/10 flex items-center justify-center">
                <Camera className="h-10 w-10 text-[#6366F1]/60" />
              </div>
            )}
            {camActive ? (
              <div className="w-full space-y-2">
                <video ref={videoRef} className="w-full rounded-xl object-cover" autoPlay muted playsInline style={{ maxHeight: 200 }} />
                <div className="flex gap-2">
                  <button onClick={capture} className="flex-1 py-2 rounded-xl bg-[#6366F1] text-white text-sm font-semibold flex items-center justify-center gap-2">
                    <Camera className="h-4 w-4" /> Capturar
                  </button>
                  <button onClick={stopCamera} className="p-2 rounded-xl border border-red-500/40 text-red-400">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={startCamera}
                disabled={!consentiu || camLoading}
                className="w-full py-2.5 rounded-xl border border-white/20 text-sm font-medium flex items-center justify-center gap-2 text-white/70 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {camLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                {selfiePreview ? 'Tirar outra foto' : 'Abrir câmera'}
              </button>
            )}
            {!consentiu && <p className="text-[11px] text-white/30 text-center">Marque o consentimento para tirar a foto.</p>}
            {camErr && <p className="text-xs text-red-400 text-center">{camErr}</p>}
          </div>
          <canvas ref={canvasRef} className="hidden" />

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <Button
            onClick={finalizar}
            disabled={saving}
            className="w-full bg-[#6366F1] hover:bg-[#6366F1]/90 text-white py-3 text-base rounded-2xl gap-2"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Printer className="h-5 w-5" />}
            {saving ? 'Processando...' : 'Concluir check-in e imprimir'}
          </Button>
        </div>
      </div>
    </div>
  );

  // ── Impressora (testar / confirmar) ──
  if (step === 'impressora') return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10">
        <button onClick={() => { setPrintMsg(''); setStep('lista'); }} className="text-white/40 hover:text-white transition-colors p-1 -ml-1">
          <ChevronLeft className="h-6 w-6" />
        </button>
        <div className="flex items-center gap-2">
          <Printer className="h-5 w-5 text-[#6366F1]" />
          <h2 className="text-xl font-semibold">Impressora de etiquetas</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="w-full max-w-md mx-auto space-y-5">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2 text-sm text-white/70">
            <p className="font-semibold text-white/90">Como conectar</p>
            <p>1. Ligue a impressora <span className="text-white">Brother</span> por cabo (USB) neste computador.</p>
            <p>2. No Windows, defina a Brother como <span className="text-white">impressora padrão</span>.</p>
            <p>3. Toque em <span className="text-white">"Imprimir etiqueta de teste"</span> abaixo — ela sai na impressora padrão. Se sair certa, o check-in vai imprimir igual.</p>
            <p className="text-[11px] text-white/40">Dica: para não aparecer a janela de impressão a cada etiqueta, ligue o modo "imprimir sem caixa de diálogo" no navegador do totem.</p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <Button
              onClick={() => testarImpressao(false)}
              disabled={printing}
              className="w-full bg-[#6366F1] hover:bg-[#6366F1]/90 text-white py-3 text-base rounded-2xl gap-2"
            >
              {printing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Printer className="h-5 w-5" />}
              Imprimir etiqueta de teste
            </Button>
            <button
              onClick={() => testarImpressao(true)}
              disabled={printing}
              className="w-full py-2.5 rounded-2xl border border-white/20 text-sm font-medium flex items-center justify-center gap-2 text-white/70 hover:bg-white/10 disabled:opacity-40 transition-colors"
            >
              <Eye className="h-4 w-4" /> Pré-visualizar (sem imprimir)
            </button>
          </div>

          {printMsg && <p className="text-sm text-center text-[#00B39D]">{printMsg}</p>}
        </div>
      </div>
    </div>
  );

  // ── Lista do dia ──
  const termo = busca.trim().toLowerCase();
  const filtrados = termo
    ? lista.filter(p => `${p.nome} ${p.sobrenome || ''}`.toLowerCase().includes(termo))
    : lista;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10">
        <button onClick={onExit} className="text-white/40 hover:text-white transition-colors p-1 -ml-1">
          <ChevronLeft className="h-6 w-6" />
        </button>
        <div className="flex items-center gap-2">
          <Droplets className="h-5 w-5 text-[#6366F1]" />
          <h2 className="text-xl font-semibold">Check-in de Batismo</h2>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {dataLabel && <span className="text-white/40 text-sm hidden sm:inline">{dataLabel}</span>}
          <button
            onClick={() => { setPrintMsg(''); setStep('impressora'); }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white/90 hover:bg-white/5 transition-colors"
            title="Testar / confirmar a impressora"
          >
            <Printer className="h-4 w-4" /> Impressora
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="w-full max-w-md mx-auto space-y-4">
          <div className="relative">
            <Search className="h-5 w-5 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-2xl border border-gray-700 bg-gray-800 text-white placeholder:text-gray-500 text-sm outline-none focus:border-[#6366F1]"
              placeholder="Buscar pelo nome..."
            />
          </div>

          {loadingLista ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-[#6366F1]" /></div>
          ) : filtrados.length === 0 ? (
            <div className="text-center py-16 text-white/40">
              {lista.length === 0 ? 'Nenhum batizando para hoje.' : 'Nenhum nome encontrado.'}
            </div>
          ) : (
            <div className="space-y-2">
              {filtrados.map(p => (
                <button
                  key={p.id}
                  onClick={() => selecionar(p)}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-left"
                >
                  <div className="h-10 w-10 rounded-full bg-[#6366F1]/20 flex items-center justify-center text-lg font-bold text-[#6366F1]">
                    {p.nome.charAt(0)}
                  </div>
                  <span className="flex-1 font-medium">{`${p.nome} ${p.sobrenome || ''}`.trim()}</span>
                  {p.ja_checkin && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#00B39D]/15 text-[#00B39D] flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> check-in
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDateBR(isoDate: string): string {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function maskCpfInput(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

function maskPhoneInput(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

// ── NEXT Flow ─────────────────────────────────────────────────────────────────

function NextFlow({ opt, member, onBack, onDone, onEndSession, onActivity }: {
  opt: (typeof MENU_OPTIONS)[number];
  member: MemberData;
  onBack: () => void;
  onDone: () => void;
  onEndSession: () => void;
  onActivity: () => void;
}) {
  const guest = !!member.guest;
  const [loading, setLoading] = useState(true);
  const [inscrito, setInscrito] = useState(false);
  const [inscricao, setInscricao] = useState<any>(null);
  const [proximoEvento, setProximoEvento] = useState<any>(null);
  const [proximasTurmas, setProximasTurmas] = useState<any[]>([]);
  const [turmaSel, setTurmaSel] = useState<any>(null);
  const [materialAtivo, setMaterialAtivo] = useState(false);
  const [infoEnviado, setInfoEnviado] = useState(false);
  const [enviandoInfo, setEnviandoInfo] = useState(false);
  const [step, setStep] = useState<'check' | 'form' | 'success'>('check');
  const [form, setForm] = useState({
    nome: guest ? '' : ((member.nome || '').split(' ')[0] || ''),
    sobrenome: guest ? '' : ((member.nome || '').split(' ').slice(1).join(' ') || ''),
    cpf: member.cpf || '',
    telefone: member.telefone ? maskPhoneInput(member.telefone) : '',
    email: member.email || '',
    data_nascimento: '',
    observacoes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const params: any = {};
    if (member.id) params.membro_id = member.id;
    if (member.email) params.email = member.email;
    if (member.cpf) params.cpf = member.cpf;
    membresia.totem.next.status(params)
      .then((r: any) => {
        setInscrito(!!r.inscrito);
        setInscricao(r.inscricao);
        setProximoEvento(r.proximo_evento);
        const turmas = r.proximas_turmas || (r.proximo_evento ? [r.proximo_evento] : []);
        setProximasTurmas(turmas);
        setTurmaSel(r.proximo_evento || turmas[0] || null);
        setMaterialAtivo(!!r.material_ativo);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [member.id, member.email, member.cpf]);

  const fmtHora = (t: any) => (t?.horario ? String(t.horario).slice(0, 5) : null);

  const enviarInfo = async () => {
    const tel = (form.telefone || member.telefone || '').replace(/\D/g, '');
    if (tel.length < 10) { setError('Informe um telefone com DDD para receber o material'); return; }
    setEnviandoInfo(true); setError(''); onActivity();
    try {
      await membresia.totem.next.informacoes({ telefone: tel, nome: form.nome || member.nome });
      setInfoEnviado(true);
    } catch (e: any) {
      setError(e?.message || 'Não foi possível enviar agora');
    }
    setEnviandoInfo(false);
  };

  const setField = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value;
    if (k === 'cpf') v = maskCpfInput(v);
    if (k === 'telefone') v = maskPhoneInput(v);
    setForm(f => ({ ...f, [k]: v }));
    onActivity();
  };

  const handleSubmit = async () => {
    if (!form.nome || form.nome.trim().length < 2) { setError('Nome obrigatório'); return; }
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { setError('E-mail inválido'); return; }
    if (form.telefone.replace(/\D/g, '').length < 10) { setError('Telefone inválido'); return; }
    setSaving(true); setError('');
    onActivity();
    try {
      const payload: any = {
        // Cadastro pendente ainda não tem linha em mem_membros — o matcher do
        // backend resolve/cria o vínculo na hora da inscrição.
        membro_id: member.pending || member.guest ? null : member.id || null,
        nome: form.nome.trim(),
        sobrenome: form.sobrenome.trim() || null,
        telefone: form.telefone.replace(/\D/g, ''),
        email: form.email.trim().toLowerCase(),
        cpf: form.cpf.replace(/\D/g, '') || null,
        data_nascimento: form.data_nascimento || null,
        observacoes: form.observacoes || null,
        turma_id: turmaSel?.id || null,   // turma escolhida no calendário
      };
      const r = await membresia.totem.next.inscrever(payload);
      if (r.evento) setProximoEvento(r.evento);
      setStep('success');
    } catch (e: any) {
      setError(e?.message || 'Erro ao inscrever. Tente novamente.');
    }
    setSaving(false);
  };

  const inputCls = 'w-full px-4 py-3 rounded-2xl border border-gray-700 bg-gray-800 text-white placeholder:text-gray-500 text-sm outline-none focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981]/30 transition-colors';

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col" onClick={onActivity}>
        <OptionHeader opt={opt} member={member} onBack={onBack} />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-[#10B981]" />
        </div>
      </div>
    );
  }

  // ── Success ──
  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-6 p-8" onClick={onActivity}>
        <CheckCircle2 className="h-20 w-20 text-[#00B39D]" />
        <div className="text-center max-w-md">
          <h2 className="text-3xl font-bold">Inscrição confirmada!</h2>
          {(turmaSel?.data || proximoEvento?.data) && (
            <p className="text-white/70 mt-3 text-lg">
              Te esperamos no NEXT em <span className="text-[#10B981] font-semibold">{fmtDateBR(turmaSel?.data || proximoEvento.data)}</span>
              {fmtHora(turmaSel || proximoEvento) ? <> às <span className="text-[#10B981] font-semibold">{fmtHora(turmaSel || proximoEvento)}</span></> : null}
            </p>
          )}
          <p className="text-white/50 mt-2 text-sm">Você receberá detalhes por e-mail e WhatsApp.</p>
        </div>
        <SuccessActions onDone={onDone} onEndSession={onEndSession} accent="#10B981" />
      </div>
    );
  }

  // ── Já inscrito ──
  if (step === 'check' && inscrito && inscricao?.evento) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col" onClick={onActivity}>
        <OptionHeader opt={opt} member={member} onBack={onBack} />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-md space-y-6 text-center">
            <div className="h-20 w-20 rounded-3xl bg-[#10B981]/15 border border-[#10B981]/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-10 w-10 text-[#10B981]" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Você já está inscrito!</h2>
              <p className="text-white/60 mt-2">
                Sua próxima participação no NEXT é em:
              </p>
            </div>
            <div className="rounded-2xl border border-[#10B981]/30 bg-[#10B981]/10 p-5">
              {inscricao.evento.data ? (
                <>
                  <p className="text-3xl font-bold text-[#10B981]">{fmtDateBR(inscricao.evento.data)}</p>
                  {fmtHora(inscricao.evento) && (
                    <p className="text-white/70 text-sm mt-1 flex items-center justify-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> às {fmtHora(inscricao.evento)}
                    </p>
                  )}
                  {inscricao.evento.titulo && (
                    <p className="text-white/70 text-sm mt-1">{inscricao.evento.titulo}</p>
                  )}
                </>
              ) : (
                <p className="text-2xl font-bold text-[#10B981]">{inscricao.evento.titulo || 'Turma do NEXT'}</p>
              )}
            </div>
            <p className="text-white/40 text-xs">Te esperamos lá!</p>
            <Button onClick={onBack} variant="outline" className="border-white/20 text-white hover:bg-white/10">
              Voltar ao menu
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Nenhum evento agendado ──
  if (step === 'check' && !proximoEvento) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col" onClick={onActivity}>
        <OptionHeader opt={opt} member={member} onBack={onBack} />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md text-center space-y-6">
            <div className="h-20 w-20 rounded-3xl bg-white/10 flex items-center justify-center mx-auto">
              <CalendarDays className="h-10 w-10 text-white/40" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Sem datas no momento</h2>
              <p className="text-white/50 mt-2">
                Nenhum evento NEXT está agendado agora. Volte em breve!
              </p>
            </div>
            <Button onClick={onBack} variant="outline" className="border-white/20 text-white hover:bg-white/10">
              Voltar ao menu
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Info ──
  if (step === 'check') {
    const multiplas = proximasTurmas.length > 1;
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col" onClick={onActivity}>
        <OptionHeader opt={opt} member={member} onBack={onBack} />
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-md mx-auto text-center space-y-6">
            <div className="h-20 w-20 rounded-3xl bg-[#10B981]/20 flex items-center justify-center mx-auto">
              <ArrowRight className="h-10 w-10 text-[#10B981]" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Inscreva-se no NEXT</h2>
              <p className="text-white/60 mt-2 leading-relaxed">
                O NEXT é a porta de entrada da CBRio · conheça nossa visão, valores e como dar os próximos passos.
              </p>
            </div>

            {/* Calendário de turmas: escolha quando várias abertas; senão card único */}
            {multiplas ? (
              <div className="space-y-2 text-left">
                <p className="text-white/60 text-xs uppercase tracking-wider text-center">Escolha a turma</p>
                {proximasTurmas.map((t) => {
                  const sel = turmaSel?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => { setTurmaSel(t); onActivity(); }}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition-all ${
                        sel ? 'border-[#10B981] bg-[#10B981]/15' : 'border-white/15 bg-white/5 hover:bg-white/10'
                      }`}
                    >
                      <span className="font-semibold">{t.data ? fmtDateBR(t.data) : (t.titulo || 'Turma')}</span>
                      {fmtHora(t) && <span className={`text-sm ${sel ? 'text-[#10B981]' : 'text-white/50'}`}>{fmtHora(t)}</span>}
                    </button>
                  );
                })}
              </div>
            ) : turmaSel && (turmaSel.data || fmtHora(turmaSel)) ? (
              <div className="rounded-2xl border border-[#10B981]/30 bg-[#10B981]/10 p-4">
                <p className="text-white/60 text-xs uppercase tracking-wider">Próximo encontro</p>
                {turmaSel.data && <p className="text-xl font-bold text-[#10B981] mt-1">{fmtDateBR(turmaSel.data)}</p>}
                {fmtHora(turmaSel) && (
                  <p className="text-white/70 text-sm mt-1 flex items-center justify-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> às {fmtHora(turmaSel)}
                  </p>
                )}
              </div>
            ) : null}

            <Button
              onClick={() => setStep('form')}
              className="w-full bg-[#10B981] hover:bg-[#10B981]/90 text-white py-3 text-base rounded-2xl gap-2"
            >
              Quero me inscrever <ChevronRight className="h-5 w-5" />
            </Button>

            {/* Receber material do NEXT no WhatsApp — só aparece quando o
                material (PDF) está ligado (opt-in do Marcos · validar c/ líderes) */}
            {materialAtivo && (infoEnviado ? (
              <p className="text-sm text-[#10B981] flex items-center justify-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Enviamos o material no seu WhatsApp!
              </p>
            ) : (
              <div className="space-y-2">
                {(guest || !member.telefone) && (
                  <input
                    value={form.telefone}
                    onChange={setField('telefone')}
                    placeholder="Seu WhatsApp com DDD"
                    inputMode="numeric"
                    className={inputCls}
                  />
                )}
                <button
                  onClick={enviarInfo}
                  disabled={enviandoInfo}
                  className="w-full text-[#10B981] hover:text-[#10B981]/80 text-sm font-medium py-2 disabled:opacity-50"
                >
                  {enviandoInfo ? 'Enviando...' : 'Quero saber mais — receber no WhatsApp'}
                </button>
              </div>
            ))}
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button onClick={onBack} className="w-full text-white/30 hover:text-white/60 text-sm transition-colors py-2">
              Voltar ao menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ──
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col" onClick={onActivity}>
      <OptionHeader opt={opt} member={member} onBack={() => setStep('check')} />
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4">
          <div className="text-center mb-2">
            <h2 className="text-xl font-bold">Confirme seus dados</h2>
            {proximoEvento?.data && (
              <p className="text-white/50 text-sm mt-1">NEXT em <span className="text-[#10B981]">{fmtDateBR(proximoEvento.data)}</span></p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/40 mb-1">Nome *</label>
              <input value={form.nome} onChange={setField('nome')} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1">Sobrenome</label>
              <input value={form.sobrenome} onChange={setField('sobrenome')} className={inputCls} />
            </div>
          </div>

          <div>
            <label className="block text-xs text-white/40 mb-1">E-mail *</label>
            <input type="email" value={form.email} onChange={setField('email')} className={inputCls} placeholder="email@exemplo.com" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/40 mb-1">Telefone *</label>
              <input value={form.telefone} onChange={setField('telefone')} className={inputCls} placeholder="(21) 9..." inputMode="numeric" />
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1">CPF</label>
              <input value={form.cpf} onChange={setField('cpf')} className={inputCls} placeholder="000.000.000-00" inputMode="numeric" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-white/40 mb-1">Data de nascimento</label>
            <input type="date" value={form.data_nascimento} onChange={setField('data_nascimento')} className={inputCls} />
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <Button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full bg-[#10B981] hover:bg-[#10B981]/90 text-white py-3 text-base rounded-2xl gap-2 mt-2"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
            {saving ? 'Inscrevendo...' : 'Confirmar inscrição'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Apresentação de Bebês Flow ────────────────────────────────────────────────

function ApresentacaoBebeFlow({ opt, member, onBack, onDone, onEndSession, onActivity }: {
  opt: (typeof MENU_OPTIONS)[number];
  member: MemberData;
  onBack: () => void;
  onDone: () => void;
  onEndSession: () => void;
  onActivity: () => void;
}) {
  const guest = !!member.guest;
  const [loading, setLoading] = useState(true);
  const [proximaData, setProximaData] = useState<string | null>(null);
  const [cultosDia, setCultosDia] = useState<any[]>([]);
  const [cultoSel, setCultoSel] = useState<any>(null);
  const [existente, setExistente] = useState<any>(null);
  const [step, setStep] = useState<'check' | 'form' | 'success'>('check');
  const [form, setForm] = useState({
    bebe_nome: '',
    bebe_data_nascimento: '',
    bebe_sexo: '',
    nome_pai: '',
    nome_mae: '',
    responsavel_nome: guest ? '' : member.nome || '',
    responsavel_telefone: member.telefone ? maskPhoneInput(member.telefone) : '',
    responsavel_email: member.email || '',
    observacoes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const params: any = {};
    if (member.id && !member.pending && !member.guest) params.membro_id = member.id;
    membresia.totem.apresentacaoBebe.status(params)
      .then((r: any) => {
        setProximaData(r.proxima_data);
        setExistente(r.apresentacao_existente);
        const ordenados = [...(r.cultos || [])].sort((a: any, b: any) =>
          String(a.service_type?.recurrence_time || '99:99').localeCompare(String(b.service_type?.recurrence_time || '99:99')));
        setCultosDia(ordenados);
        if (ordenados.length === 1) setCultoSel(ordenados[0]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [member.id, member.pending, member.guest]);

  const setField = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    let v = e.target.value;
    if (k === 'responsavel_telefone') v = maskPhoneInput(v);
    setForm(f => ({ ...f, [k]: v }));
    onActivity();
  };

  const handleSubmit = async () => {
    if (!form.bebe_nome.trim()) { setError('Nome do bebê obrigatório'); return; }
    if (!form.bebe_data_nascimento) { setError('Data de nascimento do bebê obrigatória'); return; }
    if (!form.responsavel_nome.trim()) { setError('Nome do responsável obrigatório'); return; }
    if (form.responsavel_telefone.replace(/\D/g, '').length < 10) { setError('Telefone inválido'); return; }
    if (cultosDia.length > 0 && !cultoSel) { setError('Escolha o horário do culto da cerimônia'); return; }
    setSaving(true); setError('');
    onActivity();
    try {
      await membresia.totem.apresentacaoBebe.create({
        responsavel_membro_id: member.pending || member.guest ? null : member.id || null,
        culto_id: cultoSel?.id || null,
        responsavel_nome: form.responsavel_nome.trim(),
        responsavel_telefone: form.responsavel_telefone.replace(/\D/g, ''),
        responsavel_email: form.responsavel_email.trim() || null,
        bebe_nome: form.bebe_nome.trim(),
        bebe_data_nascimento: form.bebe_data_nascimento,
        bebe_sexo: form.bebe_sexo || null,
        nome_pai: form.nome_pai.trim() || null,
        nome_mae: form.nome_mae.trim() || null,
        observacoes: form.observacoes.trim() || null,
      });
      setStep('success');
    } catch (e: any) {
      setError(e?.message || 'Erro ao agendar. Tente novamente.');
    }
    setSaving(false);
  };

  const horaCulto = (c: any) => String(c?.service_type?.recurrence_time || '').slice(0, 5);

  const inputCls = 'w-full px-4 py-3 rounded-2xl border border-gray-700 bg-gray-800 text-white placeholder:text-gray-500 text-sm outline-none focus:border-[#EC4899] focus:ring-1 focus:ring-[#EC4899]/30 transition-colors';

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col" onClick={onActivity}>
        <OptionHeader opt={opt} member={member} onBack={onBack} />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-[#EC4899]" />
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-6 p-8" onClick={onActivity}>
        <CheckCircle2 className="h-20 w-20 text-[#00B39D]" />
        <div className="text-center max-w-md">
          <h2 className="text-3xl font-bold">Apresentação agendada!</h2>
          {proximaData && (
            <p className="text-white/70 mt-3 text-lg">
              {fmtDateBR(proximaData).replace(/^(\w)/, c => c.toUpperCase())}
              {cultoSel && horaCulto(cultoSel) ? (
                <> · culto das <span className="text-[#EC4899] font-semibold">{horaCulto(cultoSel)}</span></>
              ) : null}
            </p>
          )}
          <p className="text-white/50 mt-2 text-sm">
            Nossa equipe entrará em contato para confirmar os detalhes da cerimônia.
          </p>
        </div>
        <SuccessActions onDone={onDone} onEndSession={onEndSession} accent="#EC4899" />
      </div>
    );
  }

  // Já existe apresentação agendada
  if (step === 'check' && existente) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col" onClick={onActivity}>
        <OptionHeader opt={opt} member={member} onBack={onBack} />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-md space-y-6 text-center">
            <div className="h-20 w-20 rounded-3xl bg-[#EC4899]/15 border border-[#EC4899]/30 flex items-center justify-center mx-auto">
              <Baby className="h-10 w-10 text-[#EC4899]" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Você já agendou!</h2>
              <p className="text-white/60 mt-2">A apresentação de <span className="text-white">{existente.bebe_nome}</span> está agendada para:</p>
            </div>
            <div className="rounded-2xl border border-[#EC4899]/30 bg-[#EC4899]/10 p-5">
              <p className="text-3xl font-bold text-[#EC4899]">{fmtDateBR(existente.data_apresentacao)}</p>
              <p className="text-white/60 text-xs mt-2">Domingo • CBRio Sede</p>
            </div>
            <Button onClick={onBack} variant="outline" className="border-white/20 text-white hover:bg-white/10">
              Voltar ao menu
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'check') {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col" onClick={onActivity}>
        <OptionHeader opt={opt} member={member} onBack={onBack} />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md text-center space-y-6">
            <div className="h-20 w-20 rounded-3xl bg-[#EC4899]/20 flex items-center justify-center mx-auto">
              <Baby className="h-10 w-10 text-[#EC4899]" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Apresentação de Bebê</h2>
              <p className="text-white/60 mt-2 leading-relaxed">
                Apresente seu bebê à comunidade da CBRio. As cerimônias acontecem sempre no <span className="text-white font-semibold">2º domingo</span> de cada mês.
              </p>
            </div>
            {proximaData && (
              <div className="rounded-2xl border border-[#EC4899]/30 bg-[#EC4899]/10 p-4">
                <p className="text-white/60 text-xs uppercase tracking-wider">Próxima cerimônia</p>
                <p className="text-xl font-bold text-[#EC4899] mt-1">{fmtDateBR(proximaData)}</p>
              </div>
            )}
            <Button
              onClick={() => setStep('form')}
              className="w-full bg-[#EC4899] hover:bg-[#EC4899]/90 text-white py-3 text-base rounded-2xl gap-2"
            >
              Quero agendar <ChevronRight className="h-5 w-5" />
            </Button>
            <button onClick={onBack} className="w-full text-white/30 hover:text-white/60 text-sm transition-colors py-2">
              Voltar ao menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col" onClick={onActivity}>
      <OptionHeader opt={opt} member={member} onBack={() => setStep('check')} />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="w-full max-w-md mx-auto space-y-4">
          <div className="text-center mb-2">
            <h2 className="text-xl font-bold">Dados da apresentação</h2>
            {proximaData && (
              <p className="text-white/50 text-sm mt-1">Cerimônia em <span className="text-[#EC4899]">{fmtDateBR(proximaData)}</span></p>
            )}
          </div>

          {cultosDia.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-2">
                Horário do culto {cultosDia.length > 1 ? '*' : ''}
              </p>
              <div className="flex flex-wrap gap-2">
                {cultosDia.map((c: any) => {
                  const sel = cultoSel?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCultoSel(c)}
                      className={`px-4 py-2.5 rounded-2xl border text-sm font-semibold transition-all ${
                        sel ? 'border-[#EC4899] bg-[#EC4899]/15 text-[#EC4899]' : 'border-white/15 bg-white/5 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      {horaCulto(c) || c.service_type?.name || 'Culto'}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <p className="text-xs font-semibold uppercase tracking-wider text-white/40">Bebê</p>

          <div>
            <label className="block text-xs text-white/40 mb-1">Nome do bebê *</label>
            <input value={form.bebe_nome} onChange={setField('bebe_nome')} className={inputCls} placeholder="Nome completo" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/40 mb-1">Nascimento *</label>
              <input type="date" value={form.bebe_data_nascimento} onChange={setField('bebe_data_nascimento')} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1">Sexo</label>
              <select value={form.bebe_sexo} onChange={setField('bebe_sexo')} className={inputCls}>
                <option value="">Selecionar</option>
                <option value="M">Menino</option>
                <option value="F">Menina</option>
                <option value="outro">Outro</option>
              </select>
            </div>
          </div>

          <p className="text-xs font-semibold uppercase tracking-wider text-white/40 pt-2">Pais</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/40 mb-1">Nome do pai</label>
              <input value={form.nome_pai} onChange={setField('nome_pai')} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1">Nome da mãe</label>
              <input value={form.nome_mae} onChange={setField('nome_mae')} className={inputCls} />
            </div>
          </div>

          <p className="text-xs font-semibold uppercase tracking-wider text-white/40 pt-2">Responsável (contato)</p>
          <div>
            <label className="block text-xs text-white/40 mb-1">Nome *</label>
            <input value={form.responsavel_nome} onChange={setField('responsavel_nome')} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/40 mb-1">Telefone *</label>
              <input value={form.responsavel_telefone} onChange={setField('responsavel_telefone')} className={inputCls} placeholder="(21) 9..." inputMode="numeric" />
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1">E-mail</label>
              <input type="email" value={form.responsavel_email} onChange={setField('responsavel_email')} className={inputCls} />
            </div>
          </div>

          <div>
            <label className="block text-xs text-white/40 mb-1">Observações</label>
            <input value={form.observacoes} onChange={setField('observacoes')} className={inputCls} placeholder="Padrinhos, alergias, etc." />
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <Button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full bg-[#EC4899] hover:bg-[#EC4899]/90 text-white py-3 text-base rounded-2xl gap-2 mt-2"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Baby className="h-5 w-5" />}
            {saving ? 'Agendando...' : 'Confirmar apresentação'}
          </Button>
        </div>
      </div>
    </div>
  );
}
