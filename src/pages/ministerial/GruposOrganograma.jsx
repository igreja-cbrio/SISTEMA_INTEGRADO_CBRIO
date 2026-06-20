// ============================================================================
// Aba "Organograma" do /grupos · estilo RH: cartões-nó de Supervisor que você
// ABRE/FECHA pra ver os grupos (desdobramento). Colapsado = visão geral numa
// tela só. Grupos SEM supervisor em destaque (âmbar). Lê de /grupos/supervisao/me
// (admin/coordenador veem tudo; supervisor vê os seus). Fonte da verdade =
// supervisor_id de cada grupo · trocar é no detalhe do grupo (card "Supervisão").
// ============================================================================
import { useState, useEffect } from 'react';
import { grupos as api } from '../../api';
import { Eye, Star, AlertTriangle, ChevronRight, ChevronDown, Users } from 'lucide-react';

const C = {
  card: 'var(--cbrio-card)', text: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)',
  t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D', blue: '#3b82f6', amber: '#f59e0b',
};

export default function GruposOrganograma({ onOpenGrupo }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [open, setOpen] = useState({});       // override por supervisor: { id: bool }
  const [allOpen, setAllOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    api.supervisaoMe()
      .then(r => { if (alive) setData(r); })
      .catch(e => { if (alive) setErro(e?.response?.data?.error || e?.message || 'Erro ao carregar'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Carregando organograma...</div>;
  if (erro) return (
    <div style={{ padding: 28, textAlign: 'center', color: C.t3, fontSize: 13 }}>
      {erro}<br />
      <span style={{ fontSize: 12 }}>O organograma é visível para admin, coordenador ou supervisor.</span>
    </div>
  );

  const sups = (data?.supervisores || []).slice().sort((a, b) => {
    if (!a.supervisor_id) return 1;   // "sem supervisor" por último
    if (!b.supervisor_id) return -1;
    return (a.supervisor_nome || '').localeCompare(b.supervisor_nome || '');
  });
  const comSup = sups.filter(s => s.supervisor_id);
  const semSup = sups.find(s => !s.supervisor_id);

  const keyOf = (s) => s.supervisor_id || 'sem';
  const isOpen = (s) => { const k = keyOf(s); return k in open ? open[k] : allOpen; };
  const toggle = (s) => { const k = keyOf(s); setOpen(p => ({ ...p, [k]: !isOpen(s) })); };
  const toggleAll = () => { setAllOpen(v => !v); setOpen({}); };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Organograma dos grupos</h3>
          <span style={{ fontSize: 12, color: C.t3 }}>
            {comSup.length} supervisores · {data?.total_grupos || 0} grupos
            {semSup?.total_grupos ? <span style={{ color: C.amber, fontWeight: 600 }}> · {semSup.total_grupos} sem supervisor</span> : null}
          </span>
        </div>
        <button onClick={toggleAll} style={{
          marginLeft: 'auto', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          padding: '6px 12px', borderRadius: 99, border: `1px solid ${C.border}`,
          background: allOpen ? C.primary : 'transparent', color: allOpen ? '#fff' : C.t2,
        }}>{allOpen ? 'Recolher tudo' : 'Expandir tudo'}</button>
      </div>

      {/* nós em colunas (cabem lado a lado); abrir um expande os grupos dentro do nó */}
      <div style={{ columns: '320px', columnGap: 12 }}>
        {comSup.map(s => <SupNode key={s.supervisor_id} s={s} open={isOpen(s)} onToggle={() => toggle(s)} onOpenGrupo={onOpenGrupo} />)}
        {semSup && semSup.total_grupos > 0 && <SupNode s={semSup} orfao open={isOpen(semSup)} onToggle={() => toggle(semSup)} onOpenGrupo={onOpenGrupo} />}
        {comSup.length === 0 && !semSup && (
          <div style={{ padding: 32, textAlign: 'center', color: C.t3, fontSize: 13 }}>Nenhum grupo com supervisor ainda.</div>
        )}
      </div>
    </div>
  );
}

function SupNode({ s, orfao, open, onToggle, onOpenGrupo }) {
  const cor = orfao ? C.amber : C.blue;
  return (
    <div style={{ breakInside: 'avoid', WebkitColumnBreakInside: 'avoid', display: 'inline-block', width: '100%', verticalAlign: 'top', marginBottom: 12 }}>
      {/* cartão-nó do supervisor (clicável p/ abrir/fechar) */}
      <button onClick={onToggle} style={{
        width: '100%', textAlign: 'left', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
        background: C.card, border: `1px solid ${orfao ? C.amber + '66' : C.border}`,
        borderLeft: `3px solid ${cor}`, borderRadius: 12,
      }}>
        {open ? <ChevronDown size={15} style={{ color: C.t3, flexShrink: 0 }} /> : <ChevronRight size={15} style={{ color: C.t3, flexShrink: 0 }} />}
        <div style={{ width: 30, height: 30, borderRadius: '50%', background: cor + '1e', color: cor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {orfao ? <AlertTriangle size={15} /> : <Eye size={15} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {orfao ? 'Sem supervisor' : s.supervisor_nome}
          </div>
          <div style={{ fontSize: 11, color: C.t3 }}>{s.total_grupos} grupo{s.total_grupos !== 1 ? 's' : ''}</div>
        </div>
      </button>

      {/* desdobramento: grupos do supervisor (1 linha cada, com conector à esquerda) */}
      {open && (
        <div style={{ marginLeft: 19, borderLeft: `2px solid ${C.border}`, paddingLeft: 10, marginTop: 4 }}>
          {(s.grupos || []).map(g => (
            <button key={g.id} onClick={() => onOpenGrupo?.(g.id)} title={`${g.nome}${g.lider_nome ? ' · ' + g.lider_nome : ''}`} style={{
              width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
              padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6, borderRadius: 6,
            }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{g.nome}</span>
                {g.lider_nome && <span style={{ fontSize: 11, color: C.t3 }}> · <Star size={9} style={{ verticalAlign: '-1px', color: C.primary }} /> {g.lider_nome}</span>}
              </span>
              {g.total_membros != null && (
                <span style={{ fontSize: 10, color: C.t3, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 2 }}><Users size={9} /> {g.total_membros}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
