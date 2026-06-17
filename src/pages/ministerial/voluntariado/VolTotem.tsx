import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { voluntariado } from '@/api';
import { useAuth } from '@/contexts/AuthContext';
import { useFaceDetection, useFaceMatch } from './hooks/useVolFace';
import {
  QrCode, Scan, CheckCircle2, XCircle, RefreshCw, Maximize, ArrowLeft,
  ScanFace, Smartphone, Camera, Loader2, Hand, Search, Check, UserPlus,
  Wifi, WifiOff, CloudUpload, Sun, Moon,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useHomeScreenMeta } from '@/hooks/useHomeScreenMeta';
import type { VolSchedule } from './types';
import {
  saveTodayServices, getTodayServices, saveProfiles, getProfiles,
  saveServiceSchedules, getServiceSchedules,
  enqueueCheckin, getQueueCount, buildLocalDoneSet, checkinKey,
  resolveQrOffline, isNetworkError, isDuplicateError, syncQueue,
  type CheckinPayload, type CheckinDisplay,
} from './services/offlineCheckin';

type CheckinMode = 'qr_scan' | 'facial' | 'qr_fixo' | 'manual';
type TotemState = 'idle' | 'scanning' | 'success' | 'error' | 'already';
type Theme = 'dark' | 'light';

const THEME_KEY = 'cbrio-totem-theme';

interface CheckInResult {
  name: string;
  team?: string | null;
  position?: string | null;
  unscheduled?: boolean;
  queued?: boolean; // salvo offline · aguardando sincronização
}

export default function VolTotem() {
  const navigate = useNavigate();
  const { isVoluntario } = useAuth();
  const [searchParams] = useSearchParams();
  const serviceIdParam = searchParams.get('serviceId');
  const backPath = isVoluntario ? '/voluntariado/checkin' : '/ministerial/voluntariado';

  // "Adicionar à tela inicial" no tablet aponta o atalho pro TOTEM
  // (start_url /voluntariado/totem) — antes caía no manifest de check-in e
  // abria a tela de voluntário pedindo cadastro.
  useHomeScreenMeta('totem');

  const [services, setServices] = useState<any[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState(serviceIdParam || '');
  const [checkinMode, setCheckinMode] = useState<CheckinMode>('qr_scan');
  const [state, setState] = useState<TotemState>('idle');
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [clock, setClock] = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => {
    try { return (localStorage.getItem(THEME_KEY) as Theme) || 'dark'; } catch { return 'dark'; }
  });

  // Estado de rede / fila offline
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // QR scan refs
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);
  const containerId = 'totem-qr-reader';

  // Fixed QR state
  const [fixedQrUrl, setFixedQrUrl] = useState('');
  const [fixedQrLoading, setFixedQrLoading] = useState(false);

  // Manual mode state
  const [schedules, setSchedules] = useState<VolSchedule[]>([]);
  const [allProfiles, setAllProfiles] = useState<any[]>([]);
  const [manualSearch, setManualSearch] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [localDone, setLocalDone] = useState<Set<string>>(new Set());

  // Facial recognition
  const face = useFaceDetection();
  const faceMatch = useFaceMatch();
  const faceLoopRef = useRef(false);

  // ── Tema (claro/escuro) ──
  const dark = theme === 'dark';
  useEffect(() => { try { localStorage.setItem(THEME_KEY, theme); } catch {} }, [theme]);
  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  // Tokens de cor por tema (o acento #00B39D é o mesmo nos dois)
  const c = {
    page: dark ? 'from-gray-900 to-gray-950 text-white' : 'from-gray-50 to-gray-100 text-gray-900',
    heading: dark ? 'text-white' : 'text-gray-900',
    m70: dark ? 'text-white/70' : 'text-gray-600',
    m60: dark ? 'text-white/60' : 'text-gray-500',
    m50: dark ? 'text-white/50' : 'text-gray-500',
    m40: dark ? 'text-white/40' : 'text-gray-400',
    m30: dark ? 'text-white/30' : 'text-gray-400',
    ghost: dark ? 'text-white/50 hover:text-white' : 'text-gray-500 hover:text-gray-900',
    ghostFaint: dark ? 'text-white/30 hover:text-white/60' : 'text-gray-400 hover:text-gray-700',
    card: dark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white border-gray-200 hover:bg-gray-50 shadow-sm',
    cardStatic: dark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200',
    scanBox: dark ? 'bg-white/5 border-white/10' : 'bg-gray-200/70 border-gray-300',
    tabInactive: dark ? 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70' : 'bg-gray-200/70 text-gray-600 hover:bg-gray-300 hover:text-gray-900',
    input: dark ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:bg-white/10' : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus:bg-gray-50',
    amber: dark ? 'text-amber-300/80' : 'text-amber-600',
    pill: {
      online: dark ? 'bg-green-500/15 text-green-300 border-green-500/30' : 'bg-green-100 text-green-700 border-green-300',
      offline: dark ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-amber-100 text-amber-700 border-amber-300',
      pending: dark ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' : 'bg-blue-100 text-blue-700 border-blue-300',
    },
  };

  // Clock
  useEffect(() => {
    const interval = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Acompanha entradas/saídas de tela cheia (ex.: usuário aperta ESC)
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // ── Rede + sincronização da fila offline ──
  const refreshPending = useCallback(() => setPending(getQueueCount()), []);
  const refreshLocalDone = useCallback(() => {
    if (selectedServiceId) setLocalDone(buildLocalDoneSet(selectedServiceId));
  }, [selectedServiceId]);

  const runSync = useCallback(async () => {
    if (!navigator.onLine || getQueueCount() === 0) { refreshPending(); return; }
    setSyncing(true);
    try { await syncQueue(); } finally { setSyncing(false); refreshPending(); refreshLocalDone(); }
  }, [refreshPending, refreshLocalDone]);

  useEffect(() => {
    refreshPending();
    const onOnline = () => { setIsOnline(true); runSync(); };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    // tenta esvaziar a fila ao abrir e periodicamente enquanto houver pendência
    runSync();
    const iv = setInterval(() => {
      if (navigator.onLine && getQueueCount() > 0) runSync();
      else refreshPending();
    }, 15000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(iv);
    };
  }, [runSync, refreshPending]);

  // Load today's services (rede → cache fallback offline)
  useEffect(() => {
    voluntariado.services.today()
      .then((data: any) => {
        const list = data || [];
        setServices(list);
        saveTodayServices(list);
        if (list.length === 1 && !selectedServiceId) setSelectedServiceId(list[0].id);
      })
      .catch(() => {
        const cached = getTodayServices();
        setServices(cached);
        if (cached.length === 1 && !selectedServiceId) setSelectedServiceId(cached[0].id);
      });
  }, []);

  // Pré-carrega escalas + perfis no cache quando um culto é selecionado (e há
  // rede). É o "modo só na sessão": baixa tudo enquanto está online pra aguentar
  // quedas de rede com a aba aberta — QR e Manual passam a resolver pelo cache.
  useEffect(() => {
    if (!selectedServiceId || !navigator.onLine) return;
    Promise.all([
      voluntariado.schedules.list({ service_id: selectedServiceId }).catch(() => null),
      voluntariado.profiles.list().catch(() => null),
    ]).then(([sched, profs]: any[]) => {
      if (Array.isArray(sched)) saveServiceSchedules(selectedServiceId, sched);
      if (Array.isArray(profs)) saveProfiles(profs);
      refreshLocalDone();
    }).catch(() => {});
  }, [selectedServiceId, refreshLocalDone]);

  // When service is selected, start the active mode
  useEffect(() => {
    if (!selectedServiceId) return;
    refreshLocalDone();
    startMode(checkinMode);
    return () => { stopAllModes(); };
  }, [selectedServiceId, checkinMode]);

  // ── Mode management ──

  const stopAllModes = () => {
    stopQrScanning();
    stopFacial();
  };

  const startMode = (mode: CheckinMode) => {
    stopAllModes();
    setState('idle');
    setResult(null);
    processingRef.current = false;

    if (mode === 'qr_scan') {
      startQrScanning();
    } else if (mode === 'facial') {
      startFacial();
    } else if (mode === 'qr_fixo') {
      loadFixedQr();
    } else if (mode === 'manual') {
      loadSchedules();
    }
  };

  const switchMode = (mode: CheckinMode) => {
    setCheckinMode(mode);
  };

  // ── Reset / finalização compartilhada ──

  const autoReset = (afterReset: () => void) => {
    setTimeout(() => {
      setState('idle');
      setResult(null);
      setErrorMsg('');
      processingRef.current = false;
      afterReset();
    }, 4000);
  };

  const resetAfter = (ms: number, afterReset: () => void) => {
    setTimeout(() => {
      setState('idle');
      setResult(null);
      setErrorMsg('');
      processingRef.current = false;
      afterReset();
    }, ms);
  };

  const handleCheckinError = (err: any, afterReset: () => void) => {
    const msg = err.message || 'Erro no check-in';
    const isDuplicate = err.alreadyCheckedIn || err.status === 409
      || msg.includes('ja') || msg.includes('already') || msg.includes('realizado');
    if (isDuplicate) {
      setResult({ name: err.volunteerName || result?.name || '' });
      setState('already');
    } else {
      setErrorMsg(msg);
      setState('error');
    }
    resetAfter(3000, afterReset);
  };

  // ── Check-in unificado (online com fallback offline) ──
  //
  // Tenta o servidor quando online; se a rede cair (ou já estiver offline),
  // grava na FILA local e mostra sucesso "salvo offline". 409 = já fez.
  const submitCheckin = async (payload: CheckinPayload, display: CheckinDisplay, afterReset: () => void) => {
    // Duplicata local (servidor cacheado + fila) — barra re-scan offline.
    const key = checkinKey(payload);
    if (key && buildLocalDoneSet(payload.service_id).has(key)) {
      setResult({ name: display.name });
      setState('already');
      resetAfter(3000, afterReset);
      return;
    }

    const queueIt = () => {
      enqueueCheckin(payload, display);
      refreshPending();
      refreshLocalDone();
      setResult({ ...display, queued: true });
      setState('success');
      autoReset(afterReset);
    };

    if (!navigator.onLine) { queueIt(); return; }

    try {
      await voluntariado.checkIns.create(payload as any);
      refreshLocalDone();
      setResult(display);
      setState('success');
      autoReset(afterReset);
      runSync(); // aproveita pra esvaziar backlog de uma queda anterior
    } catch (err: any) {
      if (isDuplicateError(err)) {
        setResult({ name: err.volunteerName || display.name });
        setState('already');
        resetAfter(3000, afterReset);
        return;
      }
      if (isNetworkError(err)) { queueIt(); return; }
      setErrorMsg(err.message || 'Erro no check-in');
      setState('error');
      resetAfter(3000, afterReset);
    }
  };

  // ── QR Scan Mode ──

  const startQrScanning = async () => {
    try {
      await new Promise(r => setTimeout(r, 150));
      const el = document.getElementById(containerId);
      if (!el) return;
      const scanner = new Html5Qrcode(containerId, {
        verbose: false,
        // So QR — evita tentar outros formatos e acelera a decodificacao
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        // Native BarcodeDetector quando disponível (Chrome/Edge/Safari 17+) — ~10x mais rapido
        useBarCodeDetectorIfSupported: true,
      });
      scannerRef.current = scanner;
      await scanner.start(
        {
          facingMode: 'environment',
          // Resolucao maior = QR menor detectado de mais longe
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        {
          fps: 30,
          qrbox: { width: 300, height: 300 },
          aspectRatio: 1,
          disableFlip: true,
        },
        handleQrScan,
        () => {}
      );
      setState('scanning');
    } catch {
      setState('idle');
    }
  };

  const stopQrScanning = async () => {
    try {
      if (scannerRef.current?.isScanning) await scannerRef.current.stop();
      scannerRef.current = null;
    } catch {}
  };

  const handleQrScan = useCallback(async (qrCode: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    const afterReset = () => startQrScanning();

    try {
      await stopQrScanning();

      // OFFLINE: resolve o QR pelo cache (vol_profiles.qr_code).
      if (!navigator.onLine) {
        const r = resolveQrOffline(qrCode, selectedServiceId);
        if (!r) {
          setErrorMsg('Sem internet · QR não reconhecido offline. Use a busca manual.');
          setState('error');
          resetAfter(3000, afterReset);
          return;
        }
        await submitCheckin(r.payload, r.display, afterReset);
        return;
      }

      // ONLINE: resolve no servidor (cobre QR legado e cartão de membro).
      const lookupResult = await voluntariado.qrLookup(qrCode);

      if (lookupResult.isUnscheduled) {
        await submitCheckin(
          { volunteer_id: lookupResult.profile?.id || undefined, service_id: selectedServiceId, method: 'qr_code', is_unscheduled: true },
          { name: lookupResult.volunteerName, unscheduled: true },
          afterReset
        );
      } else if (lookupResult.schedule) {
        await submitCheckin(
          { schedule_id: lookupResult.schedule.id, volunteer_id: lookupResult.profile?.id || undefined, service_id: selectedServiceId, method: 'qr_code' },
          { name: lookupResult.volunteerName, team: lookupResult.schedule.team_name, position: lookupResult.schedule.position_name },
          afterReset
        );
      } else {
        throw new Error('QR code não encontrado');
      }
    } catch (err: any) {
      // Rede caiu durante a consulta → tenta resolver pelo cache.
      if (isNetworkError(err)) {
        const r = resolveQrOffline(qrCode, selectedServiceId);
        if (r) { await submitCheckin(r.payload, r.display, afterReset); return; }
        setErrorMsg('Sem internet · QR não reconhecido offline. Use a busca manual.');
        setState('error');
        resetAfter(3000, afterReset);
        return;
      }
      handleCheckinError(err, afterReset);
    }
  }, [selectedServiceId]);

  // ── Facial Recognition Mode ──

  const startFacial = async () => {
    setState('idle');
    await face.startCamera();
    faceLoopRef.current = true;
    runFaceLoop();
  };

  const stopFacial = () => {
    faceLoopRef.current = false;
    face.stopCamera();
  };

  const runFaceLoop = async () => {
    // Continuous detection loop
    while (faceLoopRef.current) {
      if (processingRef.current) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      const descriptor = await face.detectFace();
      if (descriptor && faceLoopRef.current) {
        processingRef.current = true;
        setState('scanning');

        try {
          // O reconhecimento facial roda no servidor (pgvector) — exige internet.
          if (!navigator.onLine) {
            throw new Error('Reconhecimento facial precisa de internet. Use QR ou a busca manual.');
          }

          const matchResult: any = await faceMatch.mutateAsync({
            descriptor: Array.from(descriptor),
            threshold: 0.5,
          });

          if (!matchResult?.match) {
            throw new Error('Rosto não reconhecido. Cadastre seu rosto primeiro.');
          }

          const profileId = matchResult.profile_id || matchResult.volunteer_id;
          const volunteerName = matchResult.volunteer_name || matchResult.name || 'Voluntario';

          await submitCheckin(
            { volunteer_id: profileId, service_id: selectedServiceId, method: 'facial', is_unscheduled: true },
            { name: volunteerName, unscheduled: true },
            () => { processingRef.current = false; if (faceLoopRef.current) runFaceLoop(); }
          );
        } catch (err: any) {
          handleCheckinError(err, () => {
            processingRef.current = false;
            if (faceLoopRef.current) runFaceLoop();
          });
        }
        return; // Exit loop — autoReset will restart it
      }

      await new Promise(r => setTimeout(r, 800));
    }
  };

  // ── Fixed QR Mode ──

  const loadFixedQr = async () => {
    if (!selectedServiceId) return;
    setFixedQrLoading(true);
    try {
      const data = await voluntariado.selfCheckinQr(selectedServiceId);
      setFixedQrUrl(data.url);
    } catch {
      setFixedQrUrl('');
    } finally {
      setFixedQrLoading(false);
    }
  };

  // ── Manual Mode ──

  const loadSchedules = async () => {
    if (!selectedServiceId) return;
    setManualLoading(true);
    try {
      const [schedData, profData] = await Promise.all([
        voluntariado.schedules.list({ service_id: selectedServiceId }).catch(() => null),
        voluntariado.profiles.list().catch(() => null),
      ]);
      // Online: usa a rede e atualiza o cache. Offline (null): cai no cache.
      const sched = Array.isArray(schedData) ? schedData : getServiceSchedules(selectedServiceId);
      const profs = Array.isArray(profData) ? profData : getProfiles();
      setSchedules(sched);
      setAllProfiles(profs);
      if (Array.isArray(schedData)) saveServiceSchedules(selectedServiceId, schedData);
      if (Array.isArray(profData)) saveProfiles(profData);
      refreshLocalDone();
    } finally {
      setManualLoading(false);
    }
  };

  const handleManualCheckin = async (sch: VolSchedule) => {
    if (processingRef.current) return;
    processingRef.current = true;
    await submitCheckin(
      { schedule_id: sch.id, volunteer_id: sch.volunteer_id || undefined, service_id: selectedServiceId, method: 'manual' },
      { name: sch.volunteer_name, team: sch.team_name, position: sch.position_name },
      () => loadSchedules()
    );
  };

  const handleUnscheduledCheckin = async (profile: any) => {
    if (processingRef.current) return;
    processingRef.current = true;
    await submitCheckin(
      { volunteer_id: profile.id, service_id: selectedServiceId, method: 'manual', is_unscheduled: true },
      { name: profile.full_name, unscheduled: true },
      () => loadSchedules()
    );
  };

  // ── Shared helpers ──

  const enterFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Selecionar o culto também entra em tela cheia (gesto do usuário — exigido
  // pela Fullscreen API). Deixa o tablet em modo kiosk de uma vez.
  const selectService = (id: string) => {
    enterFullscreen();
    setSelectedServiceId(id);
  };

  const selectedService = services.find(s => s.id === selectedServiceId);

  const MODE_OPTIONS: { key: CheckinMode; label: string; icon: any; desc: string }[] = [
    { key: 'qr_scan', label: 'QR Code', icon: QrCode, desc: 'Escanear cracha' },
    { key: 'facial', label: 'Facial', icon: ScanFace, desc: 'Reconhecimento facial' },
    { key: 'qr_fixo', label: 'QR Fixo', icon: Smartphone, desc: 'Voluntário escaneia com celular' },
    { key: 'manual', label: 'Manual', icon: Hand, desc: 'Buscar na lista' },
  ];

  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const filteredSchedules = schedules.filter(s => {
    if (!manualSearch.trim()) return true;
    const q = normalize(manualSearch);
    return (
      normalize(s.volunteer_name || '').includes(q) ||
      normalize(s.team_name || '').includes(q) ||
      normalize(s.position_name || '').includes(q)
    );
  });

  const scheduledIds = new Set(
    schedules.map(s => s.volunteer_id).filter(Boolean) as string[]
  );
  const unscheduledMatches = manualSearch.trim()
    ? allProfiles
        .filter(p =>
          p?.id &&
          !scheduledIds.has(p.id) &&
          normalize(p.full_name || '').includes(normalize(manualSearch))
        )
        .slice(0, 20)
    : [];

  // "Presente" = check-in no servidor OU já registrado localmente (fila offline)
  const isDone = (sch: VolSchedule) => !!(sch as any).check_in || localDone.has(`sch:${sch.id}`);

  const statusBadge = (s: VolSchedule) => {
    if (isDone(s)) return { label: 'Presente', cls: dark ? 'bg-green-500/20 text-green-300 border-green-500/30' : 'bg-green-100 text-green-700 border-green-300' };
    if (s.confirmation_status === 'declined') return { label: 'Recusou', cls: dark ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-red-100 text-red-700 border-red-300' };
    if (s.confirmation_status === 'pending') return { label: 'Pendente', cls: dark ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' : 'bg-yellow-100 text-yellow-700 border-yellow-300' };
    return { label: 'Escalado', cls: dark ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : 'bg-blue-100 text-blue-700 border-blue-300' };
  };

  return (
    <div className={`min-h-[100dvh] bg-gradient-to-b ${c.page} flex flex-col`}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4">
        <div className="flex items-center gap-2 md:gap-3">
          <Button
            variant="ghost"
            size="sm"
            className={`${c.ghost} gap-1.5`}
            onClick={() => { stopAllModes(); navigate(backPath); }}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Sair</span>
          </Button>
          <img src="/logo-cbrio-text.png" alt="CBRio" className={`h-6 md:h-8 object-contain ${dark ? 'brightness-0 invert' : ''}`} />
          <span className={`text-base md:text-lg font-semibold ${dark ? 'opacity-70' : 'text-gray-500'}`}>Check-in</span>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          {/* Status de rede + fila offline */}
          <div className="flex items-center gap-2">
            <span
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${isOnline ? c.pill.online : c.pill.offline}`}
              title={isOnline ? 'Conectado' : 'Sem internet · check-ins ficam salvos e sincronizam quando a rede voltar'}
            >
              {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
            </span>
            {pending > 0 && (
              <span
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${c.pill.pending}`}
                title="Check-ins aguardando sincronização"
              >
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
                <span>{pending}</span>
                <span className="hidden md:inline">{pending === 1 ? 'pendente' : 'pendentes'}</span>
              </span>
            )}
          </div>
          <span className={`text-xs md:text-sm ${c.m60} hidden sm:inline`}>
            {format(clock, "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </span>
          <span className="text-xl md:text-2xl font-mono font-bold tabular-nums">
            {format(clock, 'HH:mm:ss')}
          </span>
          <Button variant="ghost" size="icon" className={c.ghost} onClick={toggleTheme} title={dark ? 'Tema claro' : 'Tema escuro'}>
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
          <Button variant="ghost" size="icon" className={c.ghost} onClick={toggleFullscreen} title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}>
            <Maximize className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Service selector */}
      {!selectedServiceId && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-6 max-w-md">
            <QrCode className="h-20 w-20 mx-auto opacity-30" />
            <h2 className="text-2xl font-bold">Selecione o culto</h2>
            {services.length === 0 ? (
              <p className={c.m50}>Nenhum culto agendado para hoje</p>
            ) : (
              <div className="space-y-3">
                {services.map(svc => (
                  <button
                    key={svc.id}
                    onClick={() => selectService(svc.id)}
                    className={`w-full p-4 rounded-xl border transition-colors text-left ${c.card}`}
                  >
                    <p className="font-semibold">{svc.name}</p>
                    {svc.service_type_name && <p className={`text-sm ${c.m50}`}>{svc.service_type_name}</p>}
                    <p className={`text-sm ${c.m40}`}>{format(new Date(svc.scheduled_at), 'HH:mm', { locale: ptBR })}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Mode selector tabs ═══ */}
      {selectedServiceId && state !== 'success' && state !== 'error' && state !== 'already' && (
        <div className="px-4 md:px-6 pt-2">
          <div className="flex justify-center gap-2 md:gap-3">
            {MODE_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const active = checkinMode === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => switchMode(opt.key)}
                  className={`flex items-center gap-2 px-4 py-2.5 md:px-6 md:py-3 rounded-xl text-sm md:text-base font-medium transition-all ${
                    active
                      ? 'bg-[#00B39D] text-white shadow-lg shadow-[#00B39D]/20'
                      : c.tabInactive
                  }`}
                >
                  <Icon className="h-4 w-4 md:h-5 md:w-5" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
          {selectedService && (
            <p className={`text-center text-sm ${c.m40} mt-2`}>
              {selectedService.name}
              {selectedService.service_type_name && ` — ${selectedService.service_type_name}`}
            </p>
          )}
          {!isOnline && (checkinMode === 'facial' || checkinMode === 'qr_fixo') && (
            <p className={`text-center text-sm ${c.amber} mt-2`}>
              Sem internet · {checkinMode === 'facial' ? 'o reconhecimento facial' : 'o QR fixo'} precisa de conexão. Use QR Code ou Manual.
            </p>
          )}
        </div>
      )}

      {/* ═══ QR Scan Mode ═══ */}
      {selectedServiceId && checkinMode === 'qr_scan' && state !== 'success' && state !== 'error' && state !== 'already' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 md:gap-8 p-4 md:p-6">
          <div className="relative w-64 h-64 sm:w-72 sm:h-72 md:w-80 md:h-80">
            <div
              id={containerId}
              className={`w-full h-full rounded-2xl overflow-hidden border-2 ${c.scanBox}`}
            />
            {state === 'idle' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl">
                <Button
                  onClick={startQrScanning}
                  className="bg-[#00B39D] hover:bg-[#00B39D]/80 text-white gap-2 text-base md:text-lg px-6 py-5 md:px-8 md:py-6"
                >
                  <QrCode className="h-5 w-5 md:h-6 md:w-6" /> Iniciar Scanner
                </Button>
              </div>
            )}
          </div>
          <div className="text-center space-y-2">
            <p className="text-lg md:text-xl font-medium">Aproxime seu QR Code</p>
            <p className={`text-sm ${c.m40}`}>Posicione o QR code do cracha em frente a camera</p>
            {!isOnline && (
              <p className={`text-sm ${c.amber}`}>Offline · resolvendo crachás pelo cache local</p>
            )}
          </div>
          <Button
            variant="ghost"
            className={c.ghostFaint}
            onClick={() => { stopAllModes(); setSelectedServiceId(''); setState('idle'); }}
          >
            <RefreshCw className="h-4 w-4 mr-2" /> Trocar culto
          </Button>
        </div>
      )}

      {/* ═══ Facial Recognition Mode ═══ */}
      {selectedServiceId && checkinMode === 'facial' && state !== 'success' && state !== 'error' && state !== 'already' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 md:gap-8 p-4 md:p-6">
          <div className="relative w-64 h-64 sm:w-72 sm:h-72 md:w-80 md:h-80">
            <video
              ref={face.videoRef}
              className={`w-full h-full rounded-2xl object-cover border-2 ${c.scanBox}`}
              playsInline
              muted
            />
            <canvas
              ref={face.canvasRef}
              className="absolute inset-0 w-full h-full rounded-2xl"
            />
            {face.isLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-2xl gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-[#00B39D]" />
                <p className="text-sm text-white/60">Carregando modelos...</p>
              </div>
            )}
            {state === 'scanning' && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-[#00B39D]/80 text-white text-sm font-medium">
                Verificando...
              </div>
            )}
          </div>
          <div className="text-center space-y-2">
            <p className="text-lg md:text-xl font-medium">Olhe para a camera</p>
            <p className={`text-sm ${c.m40}`}>O reconhecimento facial acontece automaticamente</p>
          </div>
          {face.error && (
            <p className="text-sm text-red-400">{face.error}</p>
          )}
          <Button
            variant="ghost"
            className={c.ghostFaint}
            onClick={() => { stopAllModes(); setSelectedServiceId(''); setState('idle'); }}
          >
            <RefreshCw className="h-4 w-4 mr-2" /> Trocar culto
          </Button>
        </div>
      )}

      {/* ═══ Fixed QR Code Mode ═══ */}
      {selectedServiceId && checkinMode === 'qr_fixo' && state !== 'success' && state !== 'error' && state !== 'already' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 md:gap-8 p-4 md:p-6">
          {fixedQrLoading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-[#00B39D]" />
              <p className={`text-sm ${c.m60}`}>Gerando QR Code...</p>
            </div>
          ) : fixedQrUrl ? (
            <>
              <div className="bg-white p-6 md:p-8 rounded-3xl shadow-2xl shadow-[#00B39D]/10">
                <QRCodeSVG
                  value={fixedQrUrl}
                  size={280}
                  level="H"
                  bgColor="#ffffff"
                  fgColor="#000000"
                />
              </div>
              <div className="text-center space-y-2">
                <p className="text-lg md:text-xl font-medium">Escaneie com seu celular</p>
                <p className={`text-sm ${c.m40} max-w-xs`}>
                  Abra a camera do celular e aponte para o QR code acima para fazer seu check-in
                </p>
              </div>
            </>
          ) : (
            <div className="text-center space-y-3">
              <XCircle className="h-12 w-12 mx-auto text-red-400/60" />
              <p className={c.m60}>Erro ao gerar QR Code</p>
              <Button onClick={loadFixedQr} className="bg-[#00B39D] hover:bg-[#00B39D]/80 text-white">
                Tentar novamente
              </Button>
            </div>
          )}
          <Button
            variant="ghost"
            className={c.ghostFaint}
            onClick={() => { stopAllModes(); setSelectedServiceId(''); setState('idle'); }}
          >
            <RefreshCw className="h-4 w-4 mr-2" /> Trocar culto
          </Button>
        </div>
      )}

      {/* ═══ Manual Mode ═══ */}
      {selectedServiceId && checkinMode === 'manual' && state !== 'success' && state !== 'error' && state !== 'already' && (
        <div className="flex-1 flex flex-col gap-4 p-4 md:p-6 max-w-3xl w-full mx-auto">
          <div className="relative">
            <Search className={`absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 ${c.m40} pointer-events-none`} />
            <input
              autoFocus
              type="text"
              value={manualSearch}
              onChange={(e) => setManualSearch(e.target.value)}
              placeholder="Digite seu nome..."
              className={`w-full h-14 pl-12 pr-4 rounded-2xl border-2 text-lg focus:outline-none focus:border-[#00B39D] transition-colors ${c.input}`}
            />
          </div>

          <div className="flex-1 max-h-[60vh] overflow-y-auto space-y-2 pr-1">
            {manualLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[#00B39D]" />
              </div>
            ) : filteredSchedules.length === 0 && unscheduledMatches.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <p className={`${c.m60} text-lg`}>
                  {schedules.length === 0 && !manualSearch.trim()
                    ? 'Nenhum voluntário escalado para este culto'
                    : manualSearch.trim()
                      ? 'Voluntário não encontrado. Procure um líder.'
                      : 'Nenhum voluntario encontrado'}
                </p>
                {manualSearch && (
                  <p className={`text-sm ${c.m30}`}>Tente buscar com outro termo</p>
                )}
              </div>
            ) : (
              <>
                {filteredSchedules.length > 0 && (
                  <>
                    {manualSearch.trim() && (
                      <p className={`text-xs uppercase tracking-wider ${c.m40} px-1 pt-1 pb-0.5`}>
                        Escalados
                      </p>
                    )}
                    {filteredSchedules.map((sch) => {
                      const badge = statusBadge(sch);
                      const done = isDone(sch);
                      return (
                        <div
                          key={sch.id}
                          className={`min-h-[64px] flex items-center gap-3 p-3 rounded-xl border transition-colors ${c.card}`}
                        >
                          <div className="w-11 h-11 rounded-full bg-[#00B39D]/20 text-[#00B39D] flex items-center justify-center font-bold text-lg shrink-0">
                            {(sch.volunteer_name || '?').trim().charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold truncate">{sch.volunteer_name}</p>
                            {(sch.team_name || sch.position_name) && (
                              <p className={`text-sm ${c.m50} truncate`}>
                                {sch.team_name}
                                {sch.team_name && sch.position_name ? ' — ' : ''}
                                {sch.position_name}
                              </p>
                            )}
                          </div>
                          <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border ${badge.cls}`}>
                            {badge.label}
                          </span>
                          {!done && (
                            <Button
                              onClick={() => handleManualCheckin(sch)}
                              className="shrink-0 bg-[#00B39D] hover:bg-[#00B39D]/80 text-white h-11 px-4 gap-1.5"
                            >
                              <Check className="h-5 w-5" />
                              <span className="hidden sm:inline">Check-in</span>
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}

                {unscheduledMatches.length > 0 && (
                  <>
                    <p className={`text-xs uppercase tracking-wider ${c.m40} px-1 pt-3 pb-0.5`}>
                      Nao escalado neste culto
                    </p>
                    {unscheduledMatches.map((p) => (
                      <div
                        key={p.id}
                        className={`min-h-[64px] flex items-center gap-3 p-3 rounded-xl border transition-colors ${c.card}`}
                      >
                        <div className="w-11 h-11 rounded-full bg-yellow-500/15 text-yellow-600 flex items-center justify-center font-bold text-lg shrink-0">
                          {(p.full_name || '?').trim().charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{p.full_name}</p>
                        </div>
                        <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border ${dark ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' : 'bg-yellow-100 text-yellow-700 border-yellow-300'}`}>
                          Sem escala
                        </span>
                        <Button
                          onClick={() => handleUnscheduledCheckin(p)}
                          className="shrink-0 bg-[#00B39D] hover:bg-[#00B39D]/80 text-white h-11 px-4 gap-1.5"
                        >
                          <UserPlus className="h-5 w-5" />
                          <span className="hidden sm:inline">Check-in sem escala</span>
                        </Button>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>

          <div className="flex justify-center pt-2">
            <Button
              variant="ghost"
              className={c.ghostFaint}
              onClick={() => { stopAllModes(); setSelectedServiceId(''); setState('idle'); }}
            >
              <RefreshCw className="h-4 w-4 mr-2" /> Trocar culto
            </Button>
          </div>
        </div>
      )}

      {state === 'success' && result && (
        <div className="flex-1 flex items-center justify-center animate-in fade-in zoom-in p-4">
          <div className="text-center space-y-4 md:space-y-6">
            <CheckCircle2 className="h-24 w-24 md:h-32 md:w-32 mx-auto text-green-400" />
            <h2 className="text-2xl md:text-4xl font-bold">Check-in realizado!</h2>
            <p className="text-xl md:text-3xl">{result.name}</p>
            {result.team && (
              <p className={`text-base md:text-xl ${c.m60}`}>
                {result.team}{result.position ? ` — ${result.position}` : ''}
              </p>
            )}
            {result.unscheduled && (
              <span className={`inline-block px-4 py-2 rounded-full text-base md:text-lg ${dark ? 'bg-yellow-500/20 text-yellow-300' : 'bg-yellow-100 text-yellow-700'}`}>
                Sem escala
              </span>
            )}
            {result.queued && (
              <div className={`flex items-center justify-center gap-2 ${dark ? 'text-amber-300' : 'text-amber-600'}`}>
                <CloudUpload className="h-5 w-5" />
                <span className="text-base md:text-lg">Salvo offline · sincroniza quando a internet voltar</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Already checked in screen ═══ */}
      {state === 'already' && (
        <div className="flex-1 flex items-center justify-center animate-in fade-in p-4">
          <div className="text-center space-y-4 md:space-y-6">
            <CheckCircle2 className="h-24 w-24 md:h-32 md:w-32 mx-auto text-yellow-400" />
            <h2 className="text-2xl md:text-3xl font-bold">Já fez check-in!</h2>
            <p className={`text-base md:text-xl ${c.m60}`}>Check-in já registrado anteriormente</p>
          </div>
        </div>
      )}

      {/* ═══ Error screen ═══ */}
      {state === 'error' && (
        <div className="flex-1 flex items-center justify-center animate-in fade-in p-4">
          <div className="text-center space-y-4 md:space-y-6">
            <XCircle className="h-24 w-24 md:h-32 md:w-32 mx-auto text-red-400" />
            <h2 className="text-2xl md:text-3xl font-bold">Erro</h2>
            <p className={`text-base md:text-xl ${c.m60}`}>{errorMsg}</p>
          </div>
        </div>
      )}
    </div>
  );
}
