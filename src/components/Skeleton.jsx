// ============================================================================
// Skeleton · placeholders animados durante loading
// Uso: <SkeletonLine width="60%" /> ou <SkeletonBlock height={120} />
// ============================================================================

import { useEffect } from 'react';

let _styleInjected = false;
function injectShimmerStyle() {
  if (_styleInjected || typeof document === 'undefined') return;
  _styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes cbrio-shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    .cbrio-skeleton {
      background: linear-gradient(90deg,
        var(--cbrio-input-bg) 0%,
        var(--cbrio-border) 50%,
        var(--cbrio-input-bg) 100%);
      background-size: 200% 100%;
      animation: cbrio-shimmer 1.4s infinite linear;
      border-radius: 4px;
    }
  `;
  document.head.appendChild(style);
}

export function SkeletonLine({ width = '100%', height = 12, style = {} }) {
  useEffect(() => { injectShimmerStyle(); }, []);
  return (
    <div className="cbrio-skeleton" style={{
      width, height,
      marginBottom: 6,
      ...style,
    }} />
  );
}

export function SkeletonBlock({ width = '100%', height = 80, style = {} }) {
  useEffect(() => { injectShimmerStyle(); }, []);
  return (
    <div className="cbrio-skeleton" style={{
      width, height,
      borderRadius: 8,
      ...style,
    }} />
  );
}

// Esqueleto de modal de KPI · header + body com seções
export function SkeletonKpiDetalhe() {
  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <SkeletonLine width={60} height={11} style={{ marginBottom: 8 }} />
        <SkeletonLine width="70%" height={20} />
      </div>
      {/* Body: 2 colunas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        <div>
          <SkeletonLine width={80} height={11} style={{ marginBottom: 10 }} />
          <SkeletonBlock height={90} />
        </div>
        <div>
          <SkeletonLine width={80} height={11} style={{ marginBottom: 10 }} />
          <SkeletonBlock height={90} />
        </div>
      </div>
    </div>
  );
}
