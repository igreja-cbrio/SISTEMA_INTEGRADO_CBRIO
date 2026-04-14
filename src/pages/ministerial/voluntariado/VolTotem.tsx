import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { voluntariado } from '@/api';
import { QrCode, Hand, Scan, CheckCircle2, XCircle, RefreshCw, Maximize } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type TotemMode = 'idle' | 'scanning' | 'success' | 'error';

interface CheckInResult {
  name: string;
  team?: string | null;
  position?: string | null;
  unscheduled?: boolean;
}

export default function VolTotem() {
  const [searchParams] = useSearchParams();
  const serviceIdParam = searchParams.get('serviceId');
  const [services, setServices] = useState<any[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState(serviceIdParam || '');
  const [mode, setMode] = useState<TotemMode>('idle');
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [clock, setClock] = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);
  const containerId = 'totem-qr-reader';

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

  // Auto-start scanner when service is selected
  useEffect(() => {
    if (selectedServiceId && mode === 'idle') {
      startScanning();
    }
    return () => { stopScanning(); };
  }, [selectedServiceId]);

  const startScanning = async () => {
    try {
      // Wait for DOM element
      await new Promise(r => setTimeout(r, 100));
      const el = document.getElementById(containerId);
      if (!el) return;
      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 300, height: 300 } },
        handleQrScan,
        () => {}
      );
      setMode('scanning');
    } catch {
      setMode('idle');
    }
  };

  const stopScanning = async () => {
    try {
      if (scannerRef.current?.isScanning) await scannerRef.current.stop();
      scannerRef.current = null;
    } catch {}
  };

  const handleQrScan = useCallback(async (qrCode: string) => {
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      await stopScanning();

      // Lookup QR code
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

      setMode('success');

      // Auto-reset after 4 seconds
      setTimeout(() => {
        setMode('idle');
        setResult(null);
        processingRef.current = false;
        startScanning();
      }, 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro no check-in');
      setMode('error');

      setTimeout(() => {
        setMode('idle');
        setErrorMsg('');
        processingRef.current = false;
        startScanning();
      }, 3000);
    }
  }, [selectedServiceId]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const selectedService = services.find(s => s.id === selectedServiceId);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-950 text-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <img src="/logo-cbrio-text.png" alt="CBRio" className="h-8 object-contain brightness-0 invert" />
          <span className="text-lg font-semibold opacity-70">Check-in</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm opacity-60">
            {format(clock, "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </span>
          <span className="text-2xl font-mono font-bold tabular-nums">
            {format(clock, 'HH:mm:ss')}
          </span>
          <Button variant="ghost" size="icon" className="text-white/50 hover:text-white" onClick={toggleFullscreen}>
            <Maximize className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Service selector (if no service selected) */}
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

      {/* Main content */}
      {selectedServiceId && mode !== 'success' && mode !== 'error' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-8 p-6">
          {/* Current service info */}
          {selectedService && (
            <div className="text-center">
              <p className="text-lg font-semibold opacity-70">{selectedService.name}</p>
              {selectedService.service_type_name && (
                <p className="text-sm opacity-40">{selectedService.service_type_name}</p>
              )}
            </div>
          )}

          {/* QR Scanner */}
          <div className="relative">
            <div
              id={containerId}
              className="w-80 h-80 rounded-2xl overflow-hidden bg-white/5 border-2 border-white/10"
            />
            {mode === 'idle' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl">
                <Button
                  onClick={startScanning}
                  className="bg-[#00B39D] hover:bg-[#00B39D]/80 text-white gap-2 text-lg px-8 py-6"
                >
                  <QrCode className="h-6 w-6" /> Iniciar Scanner
                </Button>
              </div>
            )}
          </div>

          <div className="text-center space-y-2">
            <p className="text-xl font-medium">Aproxime seu QR Code</p>
            <p className="text-sm text-white/40">Posicione o QR code em frente a camera</p>
          </div>

          {/* Change service */}
          <Button
            variant="ghost"
            className="text-white/30 hover:text-white/60"
            onClick={() => { stopScanning(); setSelectedServiceId(''); setMode('idle'); }}
          >
            <RefreshCw className="h-4 w-4 mr-2" /> Trocar culto
          </Button>
        </div>
      )}

      {/* Success screen */}
      {mode === 'success' && result && (
        <div className="flex-1 flex items-center justify-center animate-in fade-in zoom-in">
          <div className="text-center space-y-6">
            <CheckCircle2 className="h-32 w-32 mx-auto text-green-400" />
            <h2 className="text-4xl font-bold">Check-in realizado!</h2>
            <p className="text-3xl">{result.name}</p>
            {result.team && (
              <p className="text-xl text-white/60">
                {result.team}{result.position ? ` - ${result.position}` : ''}
              </p>
            )}
            {result.unscheduled && (
              <span className="inline-block px-4 py-2 bg-yellow-500/20 text-yellow-300 rounded-full text-lg">
                Sem escala
              </span>
            )}
          </div>
        </div>
      )}

      {/* Error screen */}
      {mode === 'error' && (
        <div className="flex-1 flex items-center justify-center animate-in fade-in">
          <div className="text-center space-y-6">
            <XCircle className="h-32 w-32 mx-auto text-red-400" />
            <h2 className="text-3xl font-bold">Erro</h2>
            <p className="text-xl text-white/60">{errorMsg}</p>
          </div>
        </div>
      )}
    </div>
  );
}
