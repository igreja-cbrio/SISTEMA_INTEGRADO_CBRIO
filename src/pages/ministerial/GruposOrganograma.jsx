// ============================================================================
// Aba "Organograma" do /grupos · Supervisor → Grupos (+ líder), lado a lado em
// colunas pra caber numa tela só. Grupos SEM supervisor em destaque. Lê de
// GET /grupos/supervisao/me (admin/coordenador veem tudo; supervisor vê os seus).
// Fonte da verdade = supervisor_id de cada grupo · trocar é no detalhe do grupo.
// ============================================================================
import { useState, useEffect } from 'react';
import { grupos as api } from '../../api';
import { Eye, Star, AlertTriangle } from 'lucide-react';

const C = {
  card: 'var(--cbrio-card)', text: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)',
  t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D', blue: '#3b82f6', amber: '#f59e0b',
};

export default function GruposOrganograma({ onOpenGrupo }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

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

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Organograma dos grupos</h3>
        <span style={{ fontSize: 12, color: C.t3 }}>
          {comSup.length} supervisores · {data?.total_grupos || 0} grupos
          {semSup?.total_grupos ? <span style={{ color: C.amber, fontWeight: 600 }}> · {semSup.total_grupos} sem supervisor</span> : null}
        </span>
        <span style={{ fontSize: 11, color: C.t3, marginLeft: 'auto' }}>Clique num grupo pra abrir e trocar o supervisor.</span>
      </div>

      {/* Colunas (multi-column): supervisores lado a lado, preenchendo a largura */}
      <div style={{ columns: '300px', columnGap: 12 }}>
        {comSup.map(s => <SupBloco key={s.supervisor_id} s={s} onOpenGrupo={onOpenGrupo} />)}
        {semSup && semSup.total_grupos > 0 && <SupBloco s={semSup} orfao onOpenGrupo={onOpenGrupo} />}
        {comSup.length === 0 && !semSup && (
          <div style={{ padding: 32, textAlign: 'center', color: C.t3, fontSize: 13 }}>Nenhum grupo com supervisor ainda.</div>
        )}
      </div>
    </div>
  );
}

function SupBloco({ s, orfao, onOpenGrupo }) {
  const cor = orfao ? C.amber : C.blue;
  return (
    <div style={{
      breakInside: 'avoid', WebkitColumnBreakInside: 'avoid', display: 'inline-block', width: '100%',
      verticalAlign: 'top', marginBottom: 12,
      background: C.card, border: `1px solid ${orfao ? C.amber + '55' : C.border}`,
      borderLeft: `3px solid ${cor}`, borderRadius: 10, overflow: 'hidden',
    }}>
      <div style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: `1px solid ${C.border}`, background: orfao ? C.amber + '12' : 'transparent' }}>
        {orfao ? <AlertTriangle size={13} style={{ color: cor, flexShrink: 0 }} /> : <Eye size={13} style={{ color: cor, flexShrink: 0 }} />}
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{orfao ? 'Sem supervisor' : s.supervisor_nome}</span>
        <span style={{ fontSize: 11, color: C.t3, marginLeft: 'auto', flexShrink: 0 }}>{s.total_grupos}</span>
      </div>
      <div>
        {(s.grupos || []).map(g => (
          <button key={g.id} onClick={() => onOpenGrupo?.(g.id)} title={`${g.nome}${g.lider_nome ? ' · ' + g.lider_nome : ''}`} style={{
            width: '100%', textAlign: 'left', background: 'none', border: 'none',
            borderTop: `1px solid ${C.border}`, padding: '4px 10px 4px 22px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{g.nome}</span>
              {g.lider_nome && <span style={{ fontSize: 11, color: C.t3 }}> · <Star size={9} style={{ verticalAlign: '-1px', color: C.primary }} /> {g.lider_nome}</span>}
            </span>
            {g.total_membros != null && (
              <span style={{ fontSize: 10, color: C.t3, flexShrink: 0, minWidth: 16, textAlign: 'right' }}>{g.total_membros}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
