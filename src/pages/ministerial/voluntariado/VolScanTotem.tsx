import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Camera, CameraOff, QrCode, AlertCircle } from 'lucide-react';

export default function VolScanTotem() {
  const navigate = useNavigate();
  const [isScanning, setIsScanning] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processedRef = useRef(false);
  const containerId = 'vol-scan-totem-reader';

  const handleScan = (text: string) => {
    if (processedRef.current) return;
    processedRef.current = true;

    // Scanned content is the totem URL: <origin>/voluntariado/self-checkin?serviceId=<uuid>
    let serviceId: string | null = null;
    try {
      const url = new URL(text);
      serviceId = url.searchParams.get('serviceId');
    } catch {
      // Not a URL — check if it's a raw service ID (UUID)
      const uuidRe = /^[0-9a-f-]{36}$/i;
      if (uuidRe.test(text.trim())) serviceId = text.trim();
    }

    if (!serviceId) {
      setErrorMsg('QR invalido. Escaneie o QR exibido no totem do culto.');
      processedRef.current = false;
      return;
    }

    stopScanning().finally(() => {
      navigate(`/voluntariado/self-checkin?serviceId=${serviceId}`, { replace: true });
    });
  };

  const startScanning = async () => {
    setErrorMsg('');
    processedRef.current = false;
    try {
      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        handleScan,
        () => {},
      );
      setIsScanning(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao iniciar camera');
    }
  };

  const stopScanning = async () => {
    try {
      if (scannerRef.current?.isScanning) {
        await scannerRef.current.stop();
      }
      scannerRef.current = null;
    } catch {}
    setIsScanning(false);
  };

  useEffect(() => {
    return () => { stopScanning(); };
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Fazer Check-in</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Escaneie o QR Code exibido no totem do culto para fazer seu check-in.
        </p>
      </div>

      <Card>
        <CardContent className="p-6 flex flex-col items-center gap-4">
          {!isScanning && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <div className="h-16 w-16 rounded-full bg-[#00B39D]/10 flex items-center justify-center">
                <QrCode className="h-8 w-8 text-[#00B39D]" />
              </div>
              <p className="text-base font-medium text-foreground">Pronto para escanear</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                Aponte a camera para o QR Code do totem na entrada do culto
              </p>
            </div>
          )}

          <div
            id={containerId}
            className="w-full max-w-sm rounded-lg overflow-hidden bg-black/10"
            style={{ minHeight: isScanning ? 300 : 0 }}
          />

          {errorMsg && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 text-sm text-red-700 dark:text-red-300 w-full max-w-sm">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <Button
            size="lg"
            variant={isScanning ? 'destructive' : 'default'}
            onClick={isScanning ? stopScanning : startScanning}
            className={`gap-2 min-h-[48px] w-full max-w-sm ${!isScanning ? 'bg-[#00B39D] hover:bg-[#00B39D]/90' : ''}`}
          >
            {isScanning ? (
              <><CameraOff className="h-5 w-5" /> Parar Scanner</>
            ) : (
              <><Camera className="h-5 w-5" /> Iniciar Scanner</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
