import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Scan, Camera, SwitchCamera, Loader2 } from 'lucide-react';
import { useFaceDetection, useFaceMatch } from '../../hooks';

interface FaceScannerProps {
  onMatch: (result: { volunteer_id: string; volunteer_name: string; planning_center_id: string; source: string }) => void;
  onNoMatch?: () => void;
}

export default function FaceScanner({ onMatch, onNoMatch }: FaceScannerProps) {
  const { videoRef, canvasRef, isLoading, isDetecting, startCamera, stopCamera, detectFace, switchCamera } = useFaceDetection();
  const faceMatch = useFaceMatch();
  const [cameraActive, setCameraActive] = useState(false);
  const [status, setStatus] = useState<string>('');

  const handleStartCamera = async () => {
    await startCamera();
    setCameraActive(true);
    setStatus('Camera pronta. Clique em Escanear.');
  };

  const handleScan = useCallback(async () => {
    setStatus('Detectando rosto...');
    const descriptor = await detectFace();
    if (!descriptor) {
      setStatus('Nenhum rosto detectado. Tente novamente.');
      return;
    }
    setStatus('Buscando correspondencia...');
    try {
      const results = await faceMatch.mutateAsync({ descriptor: Array.from(descriptor) });
      if (results && results.length > 0) {
        const match = results[0];
        setStatus(`Encontrado: ${match.volunteer_name}`);
        onMatch(match);
      } else {
        setStatus('Nenhuma correspondencia encontrada.');
        onNoMatch?.();
      }
    } catch {
      setStatus('Erro ao buscar correspondencia.');
    }
  }, [detectFace, faceMatch, onMatch, onNoMatch]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-full max-w-sm aspect-[4/3] bg-black/10 rounded-lg overflow-hidden">
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          </div>
        )}
      </div>

      {status && <p className="text-sm text-muted-foreground text-center">{status}</p>}

      <div className="flex gap-2">
        {!cameraActive ? (
          <Button onClick={handleStartCamera} className="gap-2"><Camera className="h-4 w-4" /> Iniciar Camera</Button>
        ) : (
          <>
            <Button onClick={handleScan} disabled={isDetecting || faceMatch.isPending} className="gap-2">
              {isDetecting || faceMatch.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scan className="h-4 w-4" />}
              Escanear
            </Button>
            <Button variant="outline" onClick={switchCamera} size="icon"><SwitchCamera className="h-4 w-4" /></Button>
            <Button variant="destructive" onClick={() => { stopCamera(); setCameraActive(false); setStatus(''); }}>Parar</Button>
          </>
        )}
      </div>
    </div>
  );
}
