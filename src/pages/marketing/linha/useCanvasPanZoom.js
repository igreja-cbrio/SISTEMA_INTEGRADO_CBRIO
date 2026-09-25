import { useCallback, useEffect, useRef } from 'react';

// Pan (arrastar), zoom no scroll e pinça no touch · mesma mecânica do protótipo
// aprovado. O transform vai direto no DOM: passar por estado re-renderizaria o
// quadro inteiro a cada pixel de arrasto.
const Z_MIN = 0.2;
const Z_MAX = 2;
const clampZ = (z) => Math.max(Z_MIN, Math.min(Z_MAX, z));

// `ativo`: o viewport só existe depois do 1º carregamento; os ouvintes entram aí.
export function useCanvasPanZoom(ativo = true) {
  const viewportRef = useRef(null);
  const canvasRef = useRef(null);
  const labelRef = useRef(null);
  const t = useRef({ zoom: 1, x: 0, y: 0 });
  const moved = useRef(false);

  const apply = useCallback(() => {
    const { zoom, x, y } = t.current;
    if (canvasRef.current) canvasRef.current.style.transform = `translate(${x}px,${y}px) scale(${zoom})`;
    if (labelRef.current) labelRef.current.textContent = `${Math.round(zoom * 100)}%`;
  }, []);

  const zoomAt = useCallback((nz, cx, cy) => {
    const cur = t.current;
    const z = clampZ(nz);
    t.current = { zoom: z, x: cx - (cx - cur.x) * (z / cur.zoom), y: cy - (cy - cur.y) * (z / cur.zoom) };
    apply();
  }, [apply]);

  const setView = useCallback((v) => { t.current = { ...t.current, ...v, zoom: clampZ(v.zoom ?? t.current.zoom) }; apply(); }, [apply]);

  const fit = useCallback((cw, ch) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const zoom = clampZ(Math.min(1, (vp.clientWidth - 40) / cw, (vp.clientHeight - 40) / ch));
    setView({ zoom, x: 20, y: 20 });
  }, [setView]);

  // Centraliza um x do canvas na horizontal, mantendo o zoom.
  const centerX = useCallback((x) => {
    const vp = viewportRef.current;
    if (!vp) return;
    setView({ x: vp.clientWidth / 2 - x * t.current.zoom });
  }, [setView]);

  const zoomStep = useCallback((fator) => {
    const vp = viewportRef.current;
    if (!vp) return;
    zoomAt(t.current.zoom * fator, vp.clientWidth / 2, vp.clientHeight / 2);
  }, [zoomAt]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return undefined;
    const pts = new Map();
    let panStart = null;
    let pinch = null;

    const onWheel = (e) => {
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      zoomAt(t.current.zoom * (1 - e.deltaY * 0.0014), e.clientX - r.left, e.clientY - r.top);
    };
    const onDown = (e) => {
      if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
      if (e.target.closest('input, label, textarea, select, [data-no-pan]')) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved.current = false;
      if (pts.size === 1) {
        panStart = { x: e.clientX - t.current.x, y: e.clientY - t.current.y, ox: e.clientX, oy: e.clientY };
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const r = vp.getBoundingClientRect();
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: t.current.zoom, cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top };
        panStart = null;
      }
    };
    const onMove = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        zoomAt(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, pinch.cx, pinch.cy);
        moved.current = true;
      } else if (panStart) {
        if (!moved.current && Math.hypot(e.clientX - panStart.ox, e.clientY - panStart.oy) < 5) return;
        moved.current = true;
        vp.classList.add('panning');
        t.current = { ...t.current, x: e.clientX - panStart.x, y: e.clientY - panStart.y };
        apply();
      }
    };
    const onEnd = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (!pts.size) { panStart = null; vp.classList.remove('panning'); }
    };
    // Arrasto não pode virar clique no cartão onde o dedo soltou.
    const onClickCapture = (e) => {
      if (moved.current) { e.stopPropagation(); e.preventDefault(); moved.current = false; }
    };

    vp.addEventListener('wheel', onWheel, { passive: false });
    vp.addEventListener('pointerdown', onDown);
    vp.addEventListener('click', onClickCapture, true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    return () => {
      vp.removeEventListener('wheel', onWheel);
      vp.removeEventListener('pointerdown', onDown);
      vp.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    };
  }, [apply, zoomAt, ativo]);

  return { viewportRef, canvasRef, labelRef, apply, setView, fit, centerX, zoomStep, getView: () => t.current };
}
