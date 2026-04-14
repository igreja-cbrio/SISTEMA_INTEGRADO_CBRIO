import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { Camera, CameraOff } from 'lucide-react';

interface QrScannerProps {
  onScan: (result: string) => void;
  onError?: (error: string) => void;
}

export default function QrScanner({ onScan, onError }: QrScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = 'vol-qr-reader';

  const startScanning = async () => {
    try {
      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (text) => {
          onScan(text);
          stopScanning();
        },
        () => {}
      );
      setIsScanning(true);
    } catch (err: any) {
      onError?.(err.message || 'Erro ao iniciar camera');
    }
  };

  const stopScanning = async () => {
    try {
      if (scannerRef.current?.isScanning) {
        await scannerRef.current.stop();
      }
      scannerRef.current = null;
      setIsScanning(false);
    } catch {}
  };

  useEffect(() => {
    return () => { stopScanning(); };
  }, []);

  return (
    <div className="flex flex-col items-center gap-3">
      <div id={containerId} className="w-full max-w-sm rounded-lg overflow-hidden bg-black/10" style={{ minHeight: isScanning ? 300 : 0 }} />
      <Button variant={isScanning ? 'destructive' : 'default'} onClick={isScanning ? stopScanning : startScanning} className="gap-2">
        {isScanning ? <><CameraOff className="h-4 w-4" /> Parar Scanner</> : <><Camera className="h-4 w-4" /> Iniciar Scanner</>}
      </Button>
    </div>
  );
}
