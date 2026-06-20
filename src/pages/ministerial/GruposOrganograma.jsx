// ============================================================================
// Aba "Organograma" do /grupos · árvore Supervisor → Grupos (+ líder), com os
// grupos SEM supervisor em destaque. Lê de GET /grupos/supervisao/me (admin e
// coordenador veem tudo; supervisor vê os seus). A fonte da verdade é o
// supervisor_id de cada grupo — trocar é no detalhe do grupo (card "Supervisão").
// ============================================================================
import { useState, useEffect } from 'react';
import { grupos as api } from '../../api';
import { Eye, Star, Users, AlertTriangle, ChevronRight } from 'lucide-react';

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
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Organograma dos grupos</h3>
        <p style={{ fontSize: 12, color: C.t3, margin: '4px 0 0' }}>
          Cada supervisor e os grupos que acompanha. Pra trocar o supervisor de um grupo, abra o grupo → card “Supervisão”.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Stat label="Supervisores" value={comSup.length} cor={C.blue} />
        <Stat label="Grupos" value={data?.total_grupos || 0} cor={C.primary} />
        <Stat label="Sem supervisor" value={semSup?.total_grupos || 0} cor={C.amber} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {comSup.map(s => <SupBloco key={s.supervisor_id} s={s} onOpenGrupo={onOpenGrupo} />)}
        {semSup && semSup.total_grupos > 0 && <SupBloco s={semSup} orfao onOpenGrupo={onOpenGrupo} />}
        {comSup.length === 0 && !semSup && (
          <div style={{ padding: 32, textAlign: 'center', color: C.t3, fontSize: 13 }}>Nenhum grupo com supervisor ainda.</div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, cor }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 16px', minWidth: 120 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: cor }}>{value}</div>
      <div style={{ fontSize: 12, color: C.t3 }}>{label}</div>
    </div>
  );
}

function SupBloco({ s, orfao, onOpenGrupo }) {
  const cor = orfao ? C.amber : C.blue;
  return (
    <div style={{ background: C.card, border: `1px solid ${orfao ? C.amber + '55' : C.border}`, borderLeft: `3px solid ${cor}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${C.border}`, background: orfao ? C.amber + '10' : 'transparent' }}>
        {orfao ? <AlertTriangle size={16} style={{ color: cor }} /> : <Eye size={16} style={{ color: cor }} />}
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{orfao ? 'Sem supervisor' : s.supervisor_nome}</span>
        <span style={{ fontSize: 12, color: C.t3 }}>· {s.total_grupos} grupo{s.total_grupos !== 1 ? 's' : ''}</span>
      </div>
      <div>
        {(s.grupos || []).map(g => (
          <button key={g.id} onClick={() => onOpenGrupo?.(g.id)} style={{
            width: '100%', textAlign: 'left', background: 'none', border: 'none',
            borderBottom: `1px solid ${C.border}`, padding: '10px 16px 10px 36px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{g.nome}</div>
              <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
                <Star size={10} style={{ color: C.primary, verticalAlign: '-1px' }} /> {g.lider_nome || 'sem líder'}
                {g.total_membros != null && <> · <Users size={10} style={{ verticalAlign: '-1px' }} /> {g.total_membros}</>}
                {g.bairro && <> · {g.bairro}</>}
              </div>
            </div>
            <ChevronRight size={15} style={{ color: C.t3, flexShrink: 0 }} />
          </button>
        ))}
      </div>
    </div>
  );
}
