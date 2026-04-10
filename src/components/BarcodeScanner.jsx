import { useEffect, useRef, useState } from 'react';

/**
 * Scanner de código de barras universal com zoom, lanterna e foco contínuo.
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
  const trackRef = useRef(null);
  const zxingControlsRef = useRef(null);
  const rafRef = useRef(null);
  const detectedRef = useRef(false);
  const [engine, setEngine] = useState(null); // 'native' | 'zxing'
  const [zoomCaps, setZoomCaps] = useState(null); // { min, max, step }
  const [zoom, setZoom] = useState(1);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [status, setStatus] = useState('Iniciando câmera...');

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

  // Tenta descobrir capabilities e aplica foco contínuo
  async function initTrackCapabilities(stream) {
    const track = stream?.getVideoTracks?.()[0];
    if (!track) return;
    trackRef.current = track;
    try {
      const caps = track.getCapabilities?.() || {};
      console.log('[BarcodeScanner] Track capabilities:', caps);

      const advanced = [];

      // Foco contínuo (macro quando possível)
      if (caps.focusMode && caps.focusMode.includes('continuous')) {
        advanced.push({ focusMode: 'continuous' });
      }
      // Exposição automática
      if (caps.exposureMode && caps.exposureMode.includes('continuous')) {
        advanced.push({ exposureMode: 'continuous' });
      }
      // White balance automático
      if (caps.whiteBalanceMode && caps.whiteBalanceMode.includes('continuous')) {
        advanced.push({ whiteBalanceMode: 'continuous' });
      }

      if (advanced.length) {
        try { await track.applyConstraints({ advanced }); } catch (e) { console.warn('[BarcodeScanner] focus constraints:', e?.message); }
      }

      if (caps.zoom) {
        const min = caps.zoom.min ?? 1;
        const max = caps.zoom.max ?? 1;
        const step = caps.zoom.step ?? 0.1;
        if (max > min) {
          setZoomCaps({ min, max, step });
          const current = track.getSettings?.().zoom ?? min;
          setZoom(current);
        }
      }

      if (caps.torch) setTorchSupported(true);
    } catch (e) {
      console.warn('[BarcodeScanner] capabilities não disponíveis:', e?.message);
    }
  }

  async function applyZoom(value) {
    setZoom(value);
    const track = trackRef.current;
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ zoom: value }] });
    } catch (e) {
      console.warn('[BarcodeScanner] applyConstraints zoom falhou:', e?.message);
    }
  }

  async function toggleTorch() {
    const track = trackRef.current;
    if (!track || !torchSupported) return;
    const newState = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: newState }] });
      setTorchOn(newState);
    } catch (e) {
      console.warn('[BarcodeScanner] torch falhou:', e?.message);
    }
  }

  async function startScanner() {
    try {
      // Abre câmera com constraints ideais para scan
      setStatus('Abrindo câmera...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('muted', 'true');
        videoRef.current.setAttribute('autoplay', 'true');
        try { await videoRef.current.play(); } catch (e) { console.warn('[BarcodeScanner] video.play():', e?.message); }
      }

      await initTrackCapabilities(stream);
      setStatus('Aponte para o código');

      // 1) Tentar BarcodeDetector nativo (Chrome/Edge Android)
      if ('BarcodeDetector' in window) {
        setEngine('native');
        console.log('[BarcodeScanner] Usando BarcodeDetector nativo');
        const detector = new window.BarcodeDetector({
          formats: formats || ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e', 'codabar', 'itf'],
        });
        const loop = async () => {
          if (detectedRef.current || !videoRef.current || !streamRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              console.log('[BarcodeScanner] Detectado (nativo):', barcodes[0].rawValue);
              detectedRef.current = true;
              onDetect?.(barcodes[0].rawValue);
              return;
            }
          } catch (e) { /* ignora falhas de frame */ }
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      // 2) Fallback: @zxing/library direto (mais controle)
      setEngine('zxing');
      console.log('[BarcodeScanner] Usando ZXing (fallback)');
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const { DecodeHintType, BarcodeFormat } = await import('@zxing/library');

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.QR_CODE,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODABAR,
        BarcodeFormat.ITF,
        BarcodeFormat.DATA_MATRIX,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100 });

      // Usa o video element que já está com o stream da câmera
      const controls = await reader.decodeFromVideoElement(videoRef.current, (result, err) => {
        if (detectedRef.current) return;
        if (result) {
          console.log('[BarcodeScanner] Detectado (zxing):', result.getText());
          detectedRef.current = true;
          try { controls.stop(); } catch { /* noop */ }
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
    trackRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setZoomCaps(null);
    setZoom(1);
    setTorchSupported(false);
    setTorchOn(false);
    setStatus('');
  }

  // Click-to-focus: ao tocar na tela, aplica foco manual no ponto (quando suportado)
  async function handleTap(e) {
    const track = trackRef.current;
    if (!track) return;
    const caps = track.getCapabilities?.();
    if (!caps?.pointsOfInterest || !caps?.focusMode?.includes('single-shot')) return;
    try {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      await track.applyConstraints({
        advanced: [{ focusMode: 'single-shot', pointsOfInterest: [{ x, y }] }],
      });
    } catch { /* ignore */ }
  }

  if (!active) return null;

  return (
    <div style={{ position: 'relative', width: '100%', background: '#000', borderRadius: 12, overflow: 'hidden' }}>
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        onClick={handleTap}
        style={{ width: '100%', maxHeight: 400, objectFit: 'cover', display: 'block' }}
      />

      {/* Overlay com frame guia */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '80%', maxWidth: 320, height: 120, border: '2px solid #00B39D',
        borderRadius: 8, boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
        pointerEvents: 'none',
      }} />

      {/* Status */}
      {status && (
        <div style={{
          position: 'absolute', top: 12, left: 12,
          background: 'rgba(0,0,0,0.6)', color: '#fff',
          fontSize: 11, padding: '4px 10px', borderRadius: 12,
          backdropFilter: 'blur(4px)',
        }}>
          {status}
        </div>
      )}

      {/* Botão de lanterna (flash) */}
      {torchSupported && (
        <button
          onClick={toggleTorch}
          type="button"
          style={{
            position: 'absolute', top: 12, right: 12,
            background: torchOn ? '#fbbf24' : 'rgba(0,0,0,0.5)',
            color: '#fff', border: 'none', borderRadius: '50%',
            width: 40, height: 40, fontSize: 18, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(4px)',
          }}
          title={torchOn ? 'Desligar lanterna' : 'Ligar lanterna'}
        >
          {torchOn ? '🔦' : '💡'}
        </button>
      )}

      {/* Controle de zoom (quando suportado pelo hardware) */}
      {zoomCaps && zoomCaps.max > zoomCaps.min && (
        <div style={{
          position: 'absolute', left: 12, right: 12, bottom: 36,
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(0,0,0,0.55)', borderRadius: 24, padding: '8px 14px',
          backdropFilter: 'blur(4px)',
        }}>
          <button
            type="button"
            onClick={() => applyZoom(Math.max(zoomCaps.min, zoom - (zoomCaps.step || 0.5)))}
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: '50%', width: 28, height: 28, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
            aria-label="Diminuir zoom"
          >−</button>
          <input
            type="range"
            min={zoomCaps.min}
            max={zoomCaps.max}
            step={zoomCaps.step || 0.1}
            value={zoom}
            onChange={(e) => applyZoom(Number(e.target.value))}
            style={{ flex: 1, accentColor: '#00B39D' }}
          />
          <button
            type="button"
            onClick={() => applyZoom(Math.min(zoomCaps.max, zoom + (zoomCaps.step || 0.5)))}
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: '50%', width: 28, height: 28, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
            aria-label="Aumentar zoom"
          >+</button>
          <span style={{ color: '#fff', fontSize: 11, fontWeight: 600, minWidth: 36, textAlign: 'right' }}>
            {Number(zoom).toFixed(1)}x
          </span>
        </div>
      )}

      {/* Legenda inferior */}
      <div style={{
        position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center',
        fontSize: 11, color: 'rgba(255,255,255,0.8)', pointerEvents: 'none',
      }}>
        {engine === 'zxing' ? '📷 ZXing' : engine === 'native' ? '📷 Nativo' : ''}
      </div>
    </div>
  );
}
