import { useEffect, useMemo, useRef, useState } from 'react';

// Fluxograma read-only do motor de fluxo de Solicitações · sem biblioteca.
// Nós = etapas (arrastáveis · só local), arestas = transições (bezier SVG),
// pan (arrastar o fundo) + zoom (scroll). Padrão portado do atlas.html.

const NODE_W = 216;
const NODE_H = 96;
const COL = 264;   // px por coluna (pos_x)
const ROW = 172;   // px por linha (pos_y)
const PAD = 48;

// Cor da etapa por tipo + área.
function corEtapa(e) {
  if (e.tipo === 'inicio') return '#64748b';
  if (e.tipo === 'fim' || e.tipo === 'entrega') return '#10b981';
  if (e.tipo === 'execucao') return e.area === 'financeiro' ? '#8b5cf6' : '#e08a1e';
  if (e.tipo === 'aprovacao') return e.area === 'financeiro' ? '#0d9488' : '#6366f1';
  return '#0891b2'; // etapa
}
const TIPO_LABEL = {
  inicio: 'Início', aprovacao: 'Aprovação', etapa: 'Etapa',
  execucao: 'Execução', entrega: 'Entrega', fim: 'Fim',
};
const TIPO_AJUDA = {
  inicio: 'Onde o pedido começa.',
  aprovacao: 'Alguém precisa aprovar antes do pedido seguir.',
  etapa: 'Uma etapa do processo.',
  execucao: 'Alguém executa a ação (comprar ou pagar).',
  entrega: 'Aguardando o item chegar e ser recebido.',
  fim: 'O pedido é encerrado.',
};

export default function FluxoCanvas({
  fluxo, andamento = {}, colaboradores = [], editable = false,
  onSaveResponsaveis, onEditEtapa, onDeleteEtapa, onMoveEtapa, onCreateTransicao, onDeleteTransicao,
}) {
  const wrapRef = useRef(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [pos, setPos] = useState({});
  const [sel, setSel] = useState(null);
  const [info, setInfo] = useState(null); // { etapa, x, y }
  const drag = useRef(null);      // { id, startX, startY, ox, oy } | { pan, startX, startY, vx, vy }
  const reduce = useRef(false);

  // Posições iniciais a partir de pos_x/pos_y (grid → px).
  useEffect(() => {
    reduce.current = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const p = {};
    (fluxo?.etapas || []).forEach((e, i) => {
      const gx = e.pos_x == null ? i : Number(e.pos_x);
      const gy = e.pos_y == null ? 0 : Number(e.pos_y);
      p[e.id] = { x: PAD + gx * COL, y: PAD + (gy + 1) * ROW };
    });
    setPos(p);
    // fit inicial
    const xs = Object.values(p);
    if (xs.length && wrapRef.current) {
      const maxX = Math.max(...xs.map(v => v.x)) + NODE_W + PAD;
      const w = wrapRef.current.clientWidth || 900;
      const scale = Math.min(1, w / maxX);
      setView({ x: 0, y: 0, scale: Math.max(0.5, scale) });
    }
  }, [fluxo?.id]);

  const etapaById = useMemo(() => {
    const m = {};
    (fluxo?.etapas || []).forEach(e => { m[e.id] = e; });
    return m;
  }, [fluxo]);

  // Âncoras: escolhe lado do nó conforme a direção pro alvo.
  function anchors(a, b) {
    const acx = a.x + NODE_W / 2, acy = a.y + NODE_H / 2;
    const bcx = b.x + NODE_W / 2, bcy = b.y + NODE_H / 2;
    const dx = bcx - acx, dy = bcy - acy;
    let s, t;
    if (Math.abs(dx) >= Math.abs(dy)) {
      s = { x: a.x + (dx >= 0 ? NODE_W : 0), y: acy };
      t = { x: b.x + (dx >= 0 ? 0 : NODE_W), y: bcy };
    } else {
      s = { x: acx, y: a.y + (dy >= 0 ? NODE_H : 0) };
      t = { x: bcx, y: b.y + (dy >= 0 ? 0 : NODE_H) };
    }
    return { s, t, horiz: Math.abs(dx) >= Math.abs(dy) };
  }
  function path(a, b) {
    const { s, t, horiz } = anchors(a, b);
    const k = horiz ? Math.max(40, Math.abs(t.x - s.x) * 0.45) : Math.max(30, Math.abs(t.y - s.y) * 0.5);
    const c1 = horiz ? { x: s.x + (t.x > s.x ? k : -k), y: s.y } : { x: s.x, y: s.y + (t.y > s.y ? k : -k) };
    const c2 = horiz ? { x: t.x + (t.x > s.x ? -k : k), y: t.y } : { x: t.x, y: t.y + (t.y > s.y ? -k : k) };
    return { d: `M${s.x},${s.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${t.x},${t.y}`, mid: { x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 } };
  }

  // ── pointer: pan (fundo) / drag de nó ──
  function onPointerDownBg(e) {
    if (e.target.closest('[data-info-pop]')) return;
    setInfo(null);
    if (e.target.closest('[data-node]')) return;
    setSel(null);
    drag.current = { pan: true, startX: e.clientX, startY: e.clientY, vx: view.x, vy: view.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function abrirInfo(etapa, ev) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setInfo({ etapa, x: ev.clientX - rect.left, y: ev.clientY - rect.top });
  }
  function onPointerDownNode(e, id) {
    e.stopPropagation();
    setSel(id);
    const p = pos[id] || { x: 0, y: 0 };
    drag.current = { id, startX: e.clientX, startY: e.clientY, ox: p.x, oy: p.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e) {
    const d = drag.current;
    if (!d) return;
    if (d.pan) {
      setView(v => ({ ...v, x: d.vx + (e.clientX - d.startX), y: d.vy + (e.clientY - d.startY) }));
    } else if (d.id) {
      const dx = (e.clientX - d.startX) / view.scale;
      const dy = (e.clientY - d.startY) / view.scale;
      setPos(p => ({ ...p, [d.id]: { x: d.ox + dx, y: d.oy + dy } }));
    }
  }
  function onPointerUp() {
    const d = drag.current;
    if (d?.id && onMoveEtapa) {
      const p = pos[d.id];
      if (p && (p.x !== d.ox || p.y !== d.oy)) {
        const gx = (p.x - PAD) / COL;
        const gy = (p.y - PAD) / ROW - 1;
        onMoveEtapa(d.id, Number(gx.toFixed(3)), Number(gy.toFixed(3)));
      }
    }
    drag.current = null;
  }

  function onWheel(e) {
    e.preventDefault();
    const rect = wrapRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    setView(v => {
      const ns = Math.min(1.6, Math.max(0.4, v.scale * (e.deltaY < 0 ? 1.1 : 0.9)));
      const k = ns / v.scale;
      return { scale: ns, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k };
    });
  }
  function fit() {
    const xs = Object.values(pos);
    if (!xs.length || !wrapRef.current) return;
    const maxX = Math.max(...xs.map(v => v.x)) + NODE_W + PAD;
    const w = wrapRef.current.clientWidth || 900;
    setView({ x: 0, y: 0, scale: Math.max(0.5, Math.min(1, w / maxX)) });
  }

  const etapas = fluxo?.etapas || [];
  const transicoes = fluxo?.transicoes || [];
  const selEtapa = sel ? etapaById[sel] : null;

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={wrapRef}
        onPointerDown={onPointerDownBg}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
        style={{
          position: 'relative', height: 'min(64vh, 620px)', overflow: 'hidden',
          background: 'var(--cbrio-bg)', border: '1px solid var(--cbrio-border)',
          borderRadius: 16, touchAction: 'none', cursor: 'grab',
          backgroundImage: 'radial-gradient(var(--cbrio-border) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      >
        <div style={{
          position: 'absolute', left: 0, top: 0, transformOrigin: '0 0',
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          transition: reduce.current ? 'none' : 'transform .05s linear',
        }}>
          <svg style={{ position: 'absolute', left: 0, top: 0, width: 4000, height: 2000, overflow: 'visible', pointerEvents: 'none' }}>
            <defs>
              <marker id="fx-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
                <path d="M0,0 L7,3 L0,6 Z" fill="var(--cbrio-text3, #94a3b8)" />
              </marker>
            </defs>
            {transicoes.map(t => {
              const a = pos[t.de_etapa_id], b = pos[t.para_etapa_id];
              if (!a || !b) return null;
              const cond = !!t.condicao_tipo;
              const { d, mid } = path(a, b);
              return (
                <g key={t.id}>
                  <path d={d} fill="none"
                    stroke={cond ? corEtapa(etapaById[t.para_etapa_id] || {}) : 'var(--cbrio-text3, #94a3b8)'}
                    strokeWidth={cond ? 2.2 : 1.8} strokeDasharray={cond ? '6 5' : 'none'}
                    markerEnd="url(#fx-arrow)" opacity={0.85} />
                  {t.label && (
                    <foreignObject x={mid.x - 70} y={mid.y - 13} width="140" height="26" style={{ overflow: 'visible' }}>
                      <div style={{
                        fontSize: 10.5, fontWeight: 600, textAlign: 'center', lineHeight: '16px',
                        color: 'var(--cbrio-text2)', background: 'var(--cbrio-bg)', padding: '1px 6px',
                        borderRadius: 6, border: '1px solid var(--cbrio-border)', display: 'inline-block',
                        whiteSpace: 'nowrap',
                      }}>{t.label}</div>
                    </foreignObject>
                  )}
                </g>
              );
            })}
          </svg>

          {etapas.map(e => {
            const p = pos[e.id] || { x: 0, y: 0 };
            const cor = corEtapa(e);
            const on = sel === e.id;
            return (
              <div key={e.id} data-node
                onPointerDown={ev => onPointerDownNode(ev, e.id)}
                style={{
                  position: 'absolute', left: p.x, top: p.y, width: NODE_W, minHeight: NODE_H,
                  background: 'var(--cbrio-card)', border: `1px solid ${on ? cor : 'var(--cbrio-border)'}`,
                  borderLeft: `4px solid ${cor}`, borderRadius: 12, padding: '10px 12px',
                  boxShadow: on ? `0 0 0 3px ${cor}33, 0 8px 24px rgba(0,0,0,.12)` : '0 2px 10px rgba(0,0,0,.08)',
                  cursor: 'grab', userSelect: 'none',
                }}>
                <button
                  onPointerDown={ev => ev.stopPropagation()}
                  onClick={ev => { ev.stopPropagation(); abrirInfo(e, ev); }}
                  title="O que é esta etapa?"
                  style={{
                    position: 'absolute', top: 7, right: 8, width: 19, height: 19, borderRadius: '50%',
                    border: `1.5px solid ${cor}`, background: 'var(--cbrio-card)', color: cor,
                    fontSize: 11, fontWeight: 800, fontStyle: 'italic', lineHeight: 1, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                  }}>i</button>
                <div style={{ fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 700, color: cor, paddingRight: 22 }}>
                  {TIPO_LABEL[e.tipo] || e.tipo}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--cbrio-text)', marginTop: 2, lineHeight: 1.2 }}>
                  {e.label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--cbrio-text2)', marginTop: 5 }}>
                  {e.responsaveis?.length
                    ? e.responsaveis.map(r => r.nome || 'sem nome').join(', ')
                    : (e.area ? `área: ${e.area}` : '—')}
                </div>
                {(andamento[e.status_map] || 0) > 0 && (
                  <div title="Solicitações em andamento nesta etapa" style={{
                    position: 'absolute', top: -9, left: -9, minWidth: 20, height: 20, padding: '0 6px',
                    borderRadius: 999, background: cor, color: '#fff', fontSize: 11, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 2px 6px rgba(0,0,0,.2)',
                  }}>{andamento[e.status_map]}</div>
                )}
              </div>
            );
          })}
        </div>

        {/* controles */}
        <div style={{ position: 'absolute', right: 12, bottom: 12, display: 'flex', gap: 6 }}>
          <button onClick={fit} title="Ajustar" style={ctrlBtn}>Ajustar</button>
          <button onClick={() => setView(v => ({ ...v, scale: Math.min(1.6, v.scale * 1.15) }))} style={ctrlBtn}>+</button>
          <button onClick={() => setView(v => ({ ...v, scale: Math.max(0.4, v.scale * 0.87) }))} style={ctrlBtn}>−</button>
        </div>

        {info && (
          <div data-info-pop
            onPointerDown={ev => ev.stopPropagation()}
            style={{
              position: 'absolute', zIndex: 6, width: 266,
              left: Math.max(8, Math.min(info.x - 133, (wrapRef.current?.clientWidth || 900) - 278)),
              top: Math.max(8, Math.min(info.y + 14, (wrapRef.current?.clientHeight || 500) - 160)),
              background: 'var(--cbrio-card)', border: '1px solid var(--cbrio-border)',
              borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,.24)', padding: '12px 14px',
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ fontWeight: 700, color: 'var(--cbrio-text)', fontSize: 14, lineHeight: 1.2 }}>{info.etapa.label}</div>
              <button onClick={() => setInfo(null)} title="Fechar"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--cbrio-text3)', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
            </div>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700, color: corEtapa(info.etapa), marginTop: 3 }}>
              {TIPO_LABEL[info.etapa.tipo] || info.etapa.tipo}
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.55, color: 'var(--cbrio-text2)' }}>
              {info.etapa.descricao || TIPO_AJUDA[info.etapa.tipo] || 'Sem explicação cadastrada para esta etapa.'}
            </p>
          </div>
        )}
      </div>

      {selEtapa && (
        <EtapaPainel
          key={selEtapa.id}
          etapa={selEtapa}
          etapas={etapas}
          transicoes={transicoes}
          editable={editable}
          colaboradores={colaboradores}
          onSaveResponsaveis={onSaveResponsaveis}
          onEditEtapa={onEditEtapa}
          onDeleteEtapa={(id) => { onDeleteEtapa?.(id); setSel(null); }}
          onCreateTransicao={onCreateTransicao}
          onDeleteTransicao={onDeleteTransicao}
        />
      )}
    </div>
  );
}

const ctrlBtn = {
  height: 30, minWidth: 30, padding: '0 10px', fontSize: 12, fontWeight: 600,
  background: 'var(--cbrio-card)', color: 'var(--cbrio-text)',
  border: '1px solid var(--cbrio-border)', borderRadius: 8, cursor: 'pointer',
};

const STATUS_OPCOES = [
  'aguardando_aprovacao_origem', 'aguardando_merito', 'em_cotacao', 'aguardando_aprovacao_financeira',
  'pendente', 'em_analise', 'aprovado', 'em_atendimento', 'aguardando_entrega', 'concluido',
  'aguardando_ajuste', 'sobrestada', 'rejeitado', 'cancelado', 'avaliado',
];

// Painel da etapa selecionada · read-only ou editor completo (editable).
function EtapaPainel({ etapa, etapas, transicoes, editable, colaboradores,
  onSaveResponsaveis, onEditEtapa, onDeleteEtapa, onCreateTransicao, onDeleteTransicao }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [savingResp, setSavingResp] = useState(false);
  const [addPick, setAddPick] = useState('');
  const [ligarA, setLigarA] = useState('');
  const [ligarLabel, setLigarLabel] = useState('');

  useEffect(() => {
    setForm({
      label: etapa.label || '', tipo: etapa.tipo || 'etapa', area: etapa.area || '',
      status_map: etapa.status_map || '', sla_horas: etapa.sla_horas ?? '', descricao: etapa.descricao || '',
    });
    setAddPick(''); setLigarA(''); setLigarLabel('');
  }, [etapa.id]);

  const respIds = (etapa.responsaveis || []).map(r => r.profile_id);
  const disponiveis = (colaboradores || []).filter(c => !respIds.includes(c.id));
  const saidas = (transicoes || []).filter(t => t.de_etapa_id === etapa.id);
  const etapaNome = (id) => (etapas || []).find(e => e.id === id)?.label || '—';
  const outras = (etapas || []).filter(e => e.id !== etapa.id && !saidas.some(t => t.para_etapa_id === e.id));

  const mudarResp = async (ids) => {
    if (!onSaveResponsaveis) return;
    setSavingResp(true);
    try { await onSaveResponsaveis(etapa.id, ids); setAddPick(''); } finally { setSavingResp(false); }
  };
  const salvar = async () => {
    if (!form.label?.trim()) return;
    setSaving(true);
    try {
      await onEditEtapa?.(etapa.id, {
        label: form.label.trim(), tipo: form.tipo, area: form.area || '',
        status_map: form.status_map || '', sla_horas: form.sla_horas === '' ? null : Number(form.sla_horas),
        descricao: form.descricao || '',
      });
    } finally { setSaving(false); }
  };
  const excluir = async () => {
    if (!window.confirm(`Remover a etapa "${etapa.label}"? As transições ligadas a ela também saem.`)) return;
    await onDeleteEtapa?.(etapa.id);
  };
  const ligar = async () => {
    if (!ligarA) return;
    await onCreateTransicao?.({ de_etapa_id: etapa.id, para_etapa_id: ligarA, label: ligarLabel.trim() || null });
    setLigarA(''); setLigarLabel('');
  };

  const box = { marginTop: 12, padding: '14px 16px', background: 'var(--cbrio-card)', border: '1px solid var(--cbrio-border)', borderRadius: 12, fontSize: 13 };
  const inp = { width: '100%', padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--cbrio-border)', background: 'var(--cbrio-input-bg, var(--cbrio-bg))', color: 'var(--cbrio-text)', boxSizing: 'border-box' };
  const lbl = { fontSize: 11, fontWeight: 650, color: 'var(--cbrio-text2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3, display: 'block' };
  const sec = { marginTop: 14, fontSize: 12, fontWeight: 700, color: 'var(--cbrio-text2)', textTransform: 'uppercase', letterSpacing: '.05em' };

  if (!editable) {
    return (
      <div style={box}>
        <div style={{ fontWeight: 700, color: 'var(--cbrio-text)' }}>{etapa.label}
          <span style={{ fontWeight: 500, color: 'var(--cbrio-text2)' }}> · {TIPO_LABEL[etapa.tipo] || etapa.tipo}</span></div>
        <div style={{ color: 'var(--cbrio-text2)', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: '2px 16px' }}>
          {etapa.area && <span>Área: <b style={{ color: 'var(--cbrio-text)' }}>{etapa.area}</b></span>}
          {etapa.status_map && <span>Status: <b style={{ color: 'var(--cbrio-text)' }}>{etapa.status_map}</b></span>}
          {etapa.sla_horas != null && <span>SLA: <b style={{ color: 'var(--cbrio-text)' }}>{etapa.sla_horas}h</b></span>}
        </div>
        <div style={{ marginTop: 8, color: 'var(--cbrio-text2)' }}>
          Responsáveis: {etapa.responsaveis?.length
            ? <b style={{ color: 'var(--cbrio-text)' }}>{etapa.responsaveis.map(r => r.nome || r.email).join(', ')}</b>
            : <i>nenhum</i>}
        </div>
      </div>
    );
  }

  return (
    <div style={box}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lbl}>Nome da etapa</label>
          <input style={inp} value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
        </div>
        <div><label style={lbl}>Tipo</label>
          <select style={inp} value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
            {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        <div><label style={lbl}>Área (fila)</label>
          <input style={inp} value={form.area} placeholder="ex.: financeiro" onChange={e => setForm(f => ({ ...f, area: e.target.value }))} /></div>
        <div><label style={lbl}>Status do sistema</label>
          <select style={inp} value={form.status_map} onChange={e => setForm(f => ({ ...f, status_map: e.target.value }))}>
            <option value="">—</option>
            {STATUS_OPCOES.map(s => <option key={s} value={s}>{s}</option>)}
          </select></div>
        <div><label style={lbl}>SLA (horas)</label>
          <input style={inp} type="number" min="0" value={form.sla_horas} onChange={e => setForm(f => ({ ...f, sla_horas: e.target.value }))} /></div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lbl}>Explicação (o “i”)</label>
          <textarea style={{ ...inp, resize: 'vertical' }} rows={2} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} /></div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={salvar} disabled={saving || !form.label?.trim()}
          style={{ padding: '7px 16px', fontSize: 13, fontWeight: 650, borderRadius: 8, border: 'none', background: '#00B39D', color: '#fff', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Salvando…' : 'Salvar etapa'}</button>
        <button onClick={excluir}
          style={{ padding: '7px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}>Excluir</button>
      </div>

      <div style={sec}>Vai para</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
        {saidas.length ? saidas.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', background: 'var(--cbrio-bg)', border: '1px solid var(--cbrio-border)', borderRadius: 8, padding: '5px 10px' }}>
            <span style={{ color: 'var(--cbrio-text)' }}>→ <b>{etapaNome(t.para_etapa_id)}</b>{t.label ? <span style={{ color: 'var(--cbrio-text2)' }}> · {t.label}</span> : null}</span>
            <button title="Remover ligação" onClick={() => onDeleteTransicao?.(t.id)}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--cbrio-text3)', fontSize: 15, lineHeight: 1, padding: 0 }}>×</button>
          </div>
        )) : <i style={{ color: 'var(--cbrio-text2)' }}>não liga a nenhuma etapa ainda</i>}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <select style={{ ...inp, flex: '1 1 160px' }} value={ligarA} onChange={e => setLigarA(e.target.value)}>
          <option value="">Ligar a…</option>
          {outras.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
        <input style={{ ...inp, flex: '1 1 120px' }} placeholder="rótulo (opcional)" value={ligarLabel} onChange={e => setLigarLabel(e.target.value)} />
        <button onClick={ligar} disabled={!ligarA}
          style={{ padding: '7px 14px', fontSize: 13, fontWeight: 650, borderRadius: 8, border: 'none', background: ligarA ? '#00B39D' : 'var(--cbrio-border)', color: '#fff', cursor: ligarA ? 'pointer' : 'default' }}>Ligar</button>
      </div>

      <div style={sec}>Responsáveis desta etapa</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
        {etapa.responsaveis?.length ? etapa.responsaveis.map(r => (
          <span key={r.profile_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, padding: '4px 8px 4px 10px', borderRadius: 999, background: 'var(--cbrio-bg)', border: '1px solid var(--cbrio-border)', color: 'var(--cbrio-text)' }}>
            {r.nome || r.email}
            <button title="Remover" disabled={savingResp} onClick={() => mudarResp(respIds.filter(id => id !== r.profile_id))}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--cbrio-text3)', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
          </span>
        )) : <i style={{ color: 'var(--cbrio-text2)' }}>nenhum atribuído</i>}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <select value={addPick} onChange={e => setAddPick(e.target.value)} disabled={savingResp} style={{ ...inp, flex: '1 1 200px' }}>
          <option value="">+ Adicionar responsável…</option>
          {disponiveis.map(c => <option key={c.id} value={c.id}>{c.name || c.email}</option>)}
        </select>
        <button disabled={!addPick || savingResp} onClick={() => addPick && mudarResp([...respIds, addPick])}
          style={{ padding: '7px 14px', fontSize: 13, fontWeight: 650, borderRadius: 8, border: 'none', background: addPick ? '#00B39D' : 'var(--cbrio-border)', color: '#fff', cursor: addPick ? 'pointer' : 'default' }}>{savingResp ? 'Salvando…' : 'Adicionar'}</button>
      </div>
      {etapa.area && <div style={{ fontSize: 11.5, color: 'var(--cbrio-text3)', marginTop: 8 }}>Quem for adicionado aqui também passa a ver a fila da área <b>{etapa.area}</b> e recebe notificações.</div>}
    </div>
  );
}
