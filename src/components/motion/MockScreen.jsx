import { useMockCursor } from '../../hooks/useMockCursor';

/* ── Cursor visual ──────────────────────────────────────────────────────────── */
function MockCursor({ x, y, clicking, color }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        transform: 'translate(-4px, -2px)',
        zIndex: 50,
        pointerEvents: 'none',
        transition: 'left 0.65s cubic-bezier(0.16,1,0.3,1), top 0.65s cubic-bezier(0.16,1,0.3,1)',
      }}
    >
      {/* Ripple de clique */}
      {clicking && (
        <span
          style={{
            position: 'absolute',
            left: -10, top: -10,
            width: 24, height: 24,
            borderRadius: '50%',
            background: `${color}55`,
            animation: 'cursor-ripple 0.35s ease-out forwards',
          }}
        />
      )}
      {/* Seta do cursor */}
      <svg width="18" height="22" viewBox="0 0 18 22" fill="none" style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.8))' }}>
        <path d="M1 1l6.5 16 3-5 5.5 1.5L1 1z" fill="white" stroke="rgba(0,0,0,0.5)" strokeWidth="1" />
      </svg>
    </div>
  );
}

/* ── Helpers para renderizar cada tipo de elemento mock ─────────────────────── */
function StatCard({ el }) {
  return (
    <div style={{
      position: 'absolute', left: `${el.x}%`, top: `${el.y}%`,
      width: `${el.w}%`, height: `${el.h}%`,
      background: `${el.color}18`, border: `1px solid ${el.color}30`,
      borderRadius: 8, padding: '6px 8px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    }}>
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>{el.label}</span>
      <span style={{ fontSize: 15, color: '#fff', fontWeight: 700, lineHeight: 1 }}>{el.value}</span>
    </div>
  );
}

function Row({ el, color }) {
  return (
    <div style={{
      position: 'absolute', left: `${el.x}%`, top: `${el.y}%`,
      width: `${el.w}%`, height: `${el.h}%`,
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 6, padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.75)', fontWeight: 500, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '70%' }}>{el.label}</span>
      {el.badge && (
        <span style={{ fontSize: 7, padding: '2px 5px', borderRadius: 4, background: `${color}22`, color, fontWeight: 600, flexShrink: 0 }}>{el.badge}</span>
      )}
    </div>
  );
}

function Btn({ el, color }) {
  return (
    <div style={{
      position: 'absolute', left: `${el.x}%`, top: `${el.y}%`,
      width: `${el.w}%`, height: `${el.h}%`,
      background: el.outline ? 'transparent' : color,
      border: `1px solid ${el.outline ? color + '60' : color}`,
      borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ fontSize: 9, color: el.outline ? color : '#000', fontWeight: 700 }}>{el.label}</span>
    </div>
  );
}

function MiniCard({ el, color }) {
  return (
    <div style={{
      position: 'absolute', left: `${el.x}%`, top: `${el.y}%`,
      width: `${el.w}%`, height: `${el.h}%`,
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 8, padding: '6px 8px',
    }}>
      <div style={{ width: '60%', height: 7, background: `${color}50`, borderRadius: 3, marginBottom: 5 }} />
      <div style={{ width: '90%', height: 5, background: 'rgba(255,255,255,0.1)', borderRadius: 3, marginBottom: 3 }} />
      <div style={{ width: '70%', height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3 }} />
    </div>
  );
}

function ProgressBar({ el, color }) {
  return (
    <div style={{
      position: 'absolute', left: `${el.x}%`, top: `${el.y}%`,
      width: `${el.w}%`, height: `${el.h}%`,
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)' }}>{el.label}</span>
        <span style={{ fontSize: 8, color }}>  {el.pct}%</span>
      </div>
      <div style={{ height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${el.pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
    </div>
  );
}

function InputField({ el }) {
  return (
    <div style={{
      position: 'absolute', left: `${el.x}%`, top: `${el.y}%`,
      width: `${el.w}%`, height: `${el.h}%`,
      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 6, padding: '0 8px', display: 'flex', alignItems: 'center',
    }}>
      <span style={{ fontSize: 9, color: el.value ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.25)' }}>
        {el.value || el.placeholder}
      </span>
    </div>
  );
}

/* ── MockScreen principal ───────────────────────────────────────────────────── */
export default function MockScreen({ slide, active }) {
  const { mockUI, color } = slide;
  const { pos, clicking } = useMockCursor(mockUI?.steps, active);

  if (!mockUI) return null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Injetar keyframe de ripple via style tag */}
      <style>{`
        @keyframes cursor-ripple {
          from { transform: scale(0.3); opacity: 1; }
          to   { transform: scale(2.2); opacity: 0; }
        }
      `}</style>

      {/* Barra de título do "app" */}
      <div style={{
        position: 'absolute', left: 0, top: 0, right: 0, height: '10%',
        background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', padding: '0 10px', gap: 6,
      }}>
        {['#ef4444','#f59e0b','#22c55e'].map((c) => (
          <div key={c} style={{ width: 7, height: 7, borderRadius: '50%', background: c, opacity: 0.6 }} />
        ))}
        <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 3, marginLeft: 6 }} />
      </div>

      {/* Área de conteúdo dos elementos mock */}
      <div style={{ position: 'absolute', left: 0, top: '10%', right: 0, bottom: 0 }}>
        {mockUI.elements.map((el, i) => {
          if (el.type === 'stat')     return <StatCard key={i} el={el} color={color} />;
          if (el.type === 'row')      return <Row key={i} el={el} color={color} />;
          if (el.type === 'btn')      return <Btn key={i} el={el} color={color} />;
          if (el.type === 'card')     return <MiniCard key={i} el={el} color={color} />;
          if (el.type === 'progress') return <ProgressBar key={i} el={el} color={color} />;
          if (el.type === 'input')    return <InputField key={i} el={el} />;
          return null;
        })}

        {/* Cursor animado */}
        <MockCursor x={pos.x} y={pos.y} clicking={clicking} color={color} />
      </div>
    </div>
  );
}
