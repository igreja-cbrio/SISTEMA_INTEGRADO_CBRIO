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
  ScanFace, Smartphone, Camera, Loader2, Hand, Search, Check,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { VolSchedule } from './types';

type CheckinMode = 'qr_scan' | 'facial' | 'qr_fixo' | 'manual';
type TotemState = 'idle' | 'scanning' | 'success' | 'error' | 'already';

interface CheckInResult {
  name: string;
  team?: string | null;
  position?: string | null;
  unscheduled?: boolean;
}

export default function VolTotem() {
  const navigate = useNavigate();
  const { isVoluntario } = useAuth();
  const [searchParams] = useSearchParams();
  const serviceIdParam = searchParams.get('serviceId');
  const backPath = isVoluntario ? '/voluntariado/checkin' : '/ministerial/voluntariado';

  const [services, setServices] = useState<any[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState(serviceIdParam || '');
  const [checkinMode, setCheckinMode] = useState<CheckinMode>('qr_scan');
  const [state, setState] = useState<TotemState>('idle');
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [clock, setClock] = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);

  // QR scan refs
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);
  const containerId = 'totem-qr-reader';

  // Fixed QR state
  const [fixedQrUrl, setFixedQrUrl] = useState('');
  const [fixedQrLoading, setFixedQrLoading] = useState(false);

  // Manual mode state
  const [schedules, setSchedules] = useState<VolSchedule[]>([]);
  const [manualSearch, setManualSearch] = useState('');
  const [manualLoading, setManualLoading] = useState(false);

  // Facial recognition
  const face = useFaceDetection();
  const faceMatch = useFaceMatch();
  const faceLoopRef = useRef(false);

  // Clock
  useEffect(() => {
    const interval = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Load today's services
  useEffect(() => {
    voluntariado.services.today().then((data: any) => {
      setServices(data || []);
      if (data?.length === 1 && !selectedServiceId) setSelectedServiceId(data[0].id);
    }).catch(() => {});
  }, []);

  // When service is selected, start the active mode
  useEffect(() => {
    if (!selectedServiceId) return;
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
        // Native BarcodeDetector quando disponivel (Chrome/Edge/Safari 17+) — ~10x mais rapido
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

    try {
      await stopQrScanning();
      const lookupResult = await voluntariado.qrLookup(qrCode);

      if (lookupResult.isUnscheduled) {
        await voluntariado.checkIns.create({
          volunteer_id: lookupResult.profile?.id || undefined,
          service_id: selectedServiceId,
          method: 'qr_code',
          is_unscheduled: true,
        });
        setResult({ name: lookupResult.volunteerName, unscheduled: true });
      } else if (lookupResult.schedule) {
        await voluntariado.checkIns.create({
          schedule_id: lookupResult.schedule.id,
          volunteer_id: lookupResult.profile?.id || undefined,
          service_id: selectedServiceId,
          method: 'qr_code',
        });
        setResult({
          name: lookupResult.volunteerName,
          team: lookupResult.schedule.team_name,
          position: lookupResult.schedule.position_name,
        });
      } else {
        throw new Error('QR code nao encontrado');
      }

      setState('success');
      autoReset(() => startQrScanning());
    } catch (err: any) {
      handleCheckinError(err, () => startQrScanning());
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
          const matchResult: any = await faceMatch.mutateAsync({
            descriptor: Array.from(descriptor),
            threshold: 0.5,
          });

          if (!matchResult?.match) {
            throw new Error('Rosto nao reconhecido. Cadastre seu rosto primeiro.');
          }

          const profileId = matchResult.profile_id || matchResult.volunteer_id;
          const volunteerName = matchResult.volunteer_name || matchResult.name || 'Voluntario';

          // Try to check in
          await voluntariado.checkIns.create({
            volunteer_id: profileId,
            service_id: selectedServiceId,
            method: 'facial',
            is_unscheduled: true,
          });

          setResult({ name: volunteerName, unscheduled: true });
          setState('success');
          autoReset(() => {
            processingRef.current = false;
            if (faceLoopRef.current) runFaceLoop();
          });
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

  // ── Shared helpers ──

  const autoReset = (afterReset: () => void) => {
    setTimeout(() => {
      setState('idle');
      setResult(null);
      setErrorMsg('');
      processingRef.current = false;
      afterReset();
    }, 4000);
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
    setTimeout(() => {
      setState('idle');
      setResult(null);
      setErrorMsg('');
      processingRef.current = false;
      afterReset();
    }, 3000);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const selectedService = services.find(s => s.id === selectedServiceId);

  const MODE_OPTIONS: { key: CheckinMode; label: string; icon: any; desc: string }[] = [
    { key: 'qr_scan', label: 'QR Code', icon: QrCode, desc: 'Escanear cracha' },
    { key: 'facial', label: 'Facial', icon: ScanFace, desc: 'Reconhecimento facial' },
    { key: 'qr_fixo', label: 'QR Fixo', icon: Smartphone, desc: 'Voluntario escaneia com celular' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-950 text-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4">
        <div className="flex items-center gap-2 md:gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-white/50 hover:text-white gap-1.5"
            onClick={() => { stopAllModes(); navigate(backPath); }}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Sair</span>
          </Button>
          <img src="/logo-cbrio-text.png" alt="CBRio" className="h-6 md:h-8 object-contain brightness-0 invert" />
          <span className="text-base md:text-lg font-semibold opacity-70">Check-in</span>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          <span className="text-xs md:text-sm opacity-60 hidden sm:inline">
            {format(clock, "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </span>
          <span className="text-xl md:text-2xl font-mono font-bold tabular-nums">
            {format(clock, 'HH:mm:ss')}
          </span>
          <Button variant="ghost" size="icon" className="text-white/50 hover:text-white" onClick={toggleFullscreen}>
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
              <p className="text-white/50">Nenhum culto agendado para hoje</p>
            ) : (
              <div className="space-y-3">
                {services.map(svc => (
                  <button
                    key={svc.id}
                    onClick={() => setSelectedServiceId(svc.id)}
                    className="w-full p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-left"
                  >
                    <p className="font-semibold">{svc.name}</p>
                    {svc.service_type_name && <p className="text-sm text-white/50">{svc.service_type_name}</p>}
                    <p className="text-sm text-white/40">{format(new Date(svc.scheduled_at), 'HH:mm', { locale: ptBR })}</p>
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
                      : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'
                  }`}
                >
                  <Icon className="h-4 w-4 md:h-5 md:w-5" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
          {selectedService && (
            <p className="text-center text-sm text-white/40 mt-2">
              {selectedService.name}
              {selectedService.service_type_name && ` — ${selectedService.service_type_name}`}
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
              className="w-full h-full rounded-2xl overflow-hidden bg-white/5 border-2 border-white/10"
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
            <p className="text-sm text-white/40">Posicione o QR code do cracha em frente a camera</p>
          </div>
          <Button
            variant="ghost"
            className="text-white/30 hover:text-white/60"
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
              className="w-full h-full rounded-2xl object-cover bg-white/5 border-2 border-white/10"
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
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-[#00B39D]/80 text-sm font-medium">
                Verificando...
              </div>
            )}
          </div>
          <div className="text-center space-y-2">
            <p className="text-lg md:text-xl font-medium">Olhe para a camera</p>
            <p className="text-sm text-white/40">O reconhecimento facial acontece automaticamente</p>
          </div>
          {face.error && (
            <p className="text-sm text-red-400">{face.error}</p>
          )}
          <Button
            variant="ghost"
            className="text-white/30 hover:text-white/60"
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
              <p className="text-sm text-white/60">Gerando QR Code...</p>
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
                <p className="text-sm text-white/40 max-w-xs">
                  Abra a camera do celular e aponte para o QR code acima para fazer seu check-in
                </p>
              </div>
            </>
          ) : (
            <div className="text-center space-y-3">
              <XCircle className="h-12 w-12 mx-auto text-red-400/60" />
              <p className="text-white/60">Erro ao gerar QR Code</p>
              <Button onClick={loadFixedQr} className="bg-[#00B39D] hover:bg-[#00B39D]/80">
                Tentar novamente
              </Button>
            </div>
          )}
          <Button
            variant="ghost"
            className="text-white/30 hover:text-white/60"
            onClick={() => { stopAllModes(); setSelectedServiceId(''); setState('idle'); }}
          >
            <RefreshCw className="h-4 w-4 mr-2" /> Trocar culto
          </Button>
        </div>
      )}

      {/* ═══ Success screen ═══ */}
      {state === 'success' && result && (
        <div className="flex-1 flex items-center justify-center animate-in fade-in zoom-in p-4">
          <div className="text-center space-y-4 md:space-y-6">
            <CheckCircle2 className="h-24 w-24 md:h-32 md:w-32 mx-auto text-green-400" />
            <h2 className="text-2xl md:text-4xl font-bold">Check-in realizado!</h2>
            <p className="text-xl md:text-3xl">{result.name}</p>
            {result.team && (
              <p className="text-base md:text-xl text-white/60">
                {result.team}{result.position ? ` — ${result.position}` : ''}
              </p>
            )}
            {result.unscheduled && (
              <span className="inline-block px-4 py-2 bg-yellow-500/20 text-yellow-300 rounded-full text-base md:text-lg">
                Sem escala
              </span>
            )}
          </div>
        </div>
      )}

      {/* ═══ Already checked in screen ═══ */}
      {state === 'already' && (
        <div className="flex-1 flex items-center justify-center animate-in fade-in p-4">
          <div className="text-center space-y-4 md:space-y-6">
            <CheckCircle2 className="h-24 w-24 md:h-32 md:w-32 mx-auto text-yellow-400" />
            <h2 className="text-2xl md:text-3xl font-bold">Ja fez check-in!</h2>
            <p className="text-base md:text-xl text-white/60">Check-in ja registrado anteriormente</p>
          </div>
        </div>
      )}

      {/* ═══ Error screen ═══ */}
      {state === 'error' && (
        <div className="flex-1 flex items-center justify-center animate-in fade-in p-4">
          <div className="text-center space-y-4 md:space-y-6">
            <XCircle className="h-24 w-24 md:h-32 md:w-32 mx-auto text-red-400" />
            <h2 className="text-2xl md:text-3xl font-bold">Erro</h2>
            <p className="text-base md:text-xl text-white/60">{errorMsg}</p>
          </div>
        </div>
      )}
    </div>
  );
}
