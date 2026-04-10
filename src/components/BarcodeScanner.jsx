import { useEffect, useRef, useState } from 'react';

/**
 * Scanner de código de barras universal.
 * - Usa BarcodeDetector nativo quando disponível (Chrome/Edge Android, mais rápido)
 * - Fallback para @zxing/browser (funciona no Safari iOS, Firefox, etc)
 *
 * Props:
 * - active: boolean — se true, inicia o scanner
 * - onDetect: (code: string) => void — chamado quando detecta um código
 * - onError: (message: string) => void — chamado em caso de erro
 * - formats: array de formatos aceitos (opcional)
 */
export default function BarcodeScanner({ active, onDetect, onError, formats }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const zxingControlsRef = useRef(null);
  const rafRef = useRef(null);
  const detectedRef = useRef(false);
  const [engine, setEngine] = useState(null); // 'native' | 'zxing'

  useEffect(() => {
    if (!active) {
      stopScanner();
      return;
    }

    detectedRef.current = false;
    startScanner();
    return () => stopScanner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  async function startScanner() {
    try {
      // 1) Tentar BarcodeDetector nativo (Chrome/Edge Android)
      if ('BarcodeDetector' in window) {
        setEngine('native');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play();
        }
        const detector = new window.BarcodeDetector({
          formats: formats || ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e', 'codabar', 'itf'],
        });
        const loop = async () => {
          if (detectedRef.current || !videoRef.current || !streamRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              detectedRef.current = true;
              onDetect?.(barcodes[0].rawValue);
              return;
            }
          } catch { /* ignora falhas de frame */ }
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      // 2) Fallback: @zxing/browser (iOS Safari, Firefox, etc)
      setEngine('zxing');
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      // Lista câmeras e escolhe a traseira (se possível)
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      const backCam = devices.find(d => /back|rear|environment|traseira/i.test(d.label)) || devices[devices.length - 1];
      const deviceId = backCam?.deviceId;

      const controls = await reader.decodeFromVideoDevice(deviceId, videoRef.current, (result, err, ctrls) => {
        if (detectedRef.current) return;
        if (result) {
          detectedRef.current = true;
          ctrls.stop();
          onDetect?.(result.getText());
        }
        // Ignora erros de frames sem código (NotFoundException)
      });
      zxingControlsRef.current = controls;
    } catch (e) {
      console.error('[BarcodeScanner] Erro:', e);
      const msg = e?.name === 'NotAllowedError'
        ? 'Permissão da câmera negada. Libere nas configurações do navegador.'
        : e?.name === 'NotFoundError'
        ? 'Nenhuma câmera encontrada no dispositivo.'
        : 'Não foi possível iniciar a câmera: ' + (e?.message || e);
      onError?.(msg);
    }
  }

  function stopScanner() {
    detectedRef.current = true;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (zxingControlsRef.current) {
      try { zxingControlsRef.current.stop(); } catch { /* noop */ }
      zxingControlsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  if (!active) return null;

  return (
    <div style={{ position: 'relative', width: '100%', background: '#000', borderRadius: 12, overflow: 'hidden' }}>
      <video
        ref={videoRef}
        playsInline
        muted
        style={{ width: '100%', maxHeight: 400, objectFit: 'cover', display: 'block' }}
      />
      {/* Overlay guia */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '80%', maxWidth: 320, height: 120, border: '2px solid #00B39D',
        borderRadius: 8, boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center',
        fontSize: 11, color: 'rgba(255,255,255,0.8)', pointerEvents: 'none',
      }}>
        {engine === 'zxing' ? '📷 Scanner ZXing — aponte para o código' : '📷 Aponte para o código de barras'}
      </div>
    </div>
  );
}
