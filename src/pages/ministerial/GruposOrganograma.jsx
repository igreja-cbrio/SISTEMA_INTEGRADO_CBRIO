// ============================================================================
// Aba "Organograma" do /grupos · estilo RH: cartões-nó que você ABRE/FECHA
// pra ver os grupos (desdobramento). Colapsado = visão geral numa tela só.
//
// Duas visualizações (Marcos · 2026-07-15):
//  · Por supervisor (original) — lê de /grupos/supervisao/me (admin/
//    coordenador veem tudo; supervisor vê os seus). Fonte da verdade =
//    supervisor_id de cada grupo · trocar é no detalhe do grupo.
//  · Por redes — rede (cor própria + supervisor da rede) → grupos dela;
//    grupos sem rede em destaque (âmbar). Fonte = mem_grupos.rede_id ·
//    trocar é no cadastro do grupo (campo Rede).
// ============================================================================
import { useState, useEffect } from 'react';
import { grupos as api } from '../../api';
import { Eye, Star, AlertTriangle, ChevronRight, ChevronDown, Users, Share2 } from 'lucide-react';

const C = {
  card: 'var(--cbrio-card)', text: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)',
  t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D', blue: '#3b82f6', amber: '#f59e0b',
};

function Pill({ ativo, onClick, children }) {
  return (
    <button onClick={onClick} type="button" style={{
      padding: '5px 13px', borderRadius: 999, cursor: 'pointer', fontSize: 12,
      fontWeight: ativo ? 700 : 500,
      border: `1px solid ${ativo ? C.primary : C.border}`,
      background: ativo ? '#00B39D18' : 'transparent',
      color: ativo ? C.primary : C.t2,
    }}>{children}</button>
  );
}

export default function GruposOrganograma({ onOpenGrupo }) {
  const [view, setView] = useState('sup'); // 'sup' | 'redes'
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  // Visão por redes (lazy · carrega na 1ª alternância)
  const [redesData, setRedesData] = useState(null); // { redes, gruposPorRede, semRede }
  const [redesLoading, setRedesLoading] = useState(false);
  const [open, setOpen] = useState({});       // override por nó: { key: bool }
  const [allOpen, setAllOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    api.supervisaoMe()
      .then(r => { if (alive) setData(r); })
      .catch(e => { if (alive) setErro(e?.response?.data?.error || e?.message || 'Erro ao carregar'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (view !== 'redes' || redesData || redesLoading) return;
    let alive = true;
    setRedesLoading(true);
    Promise.all([api.redes.list(), api.list()])
      .then(([redes, grupos]) => {
        if (!alive) return;
        const ativos = (grupos || []).filter(g => g.ativo !== false);
        const porRede = {};
        const semRede = [];
        for (const g of ativos) {
          const item = { id: g.id, nome: g.nome, lider_nome: g.lider_nome || null, total_membros: g.membros_count ?? null };
          if (g.rede_id) (porRede[g.rede_id] = porRede[g.rede_id] || []).push(item);
          else semRede.push(item);
        }
        const ordena = (l) => l.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
        Object.values(porRede).forEach(ordena);
        ordena(semRede);
        setRedesData({ redes: redes || [], porRede, semRede, totalGrupos: ativos.length });
      })
      .catch(() => { if (alive) setRedesData({ redes: [], porRede: {}, semRede: [], erro: true }); })
      .finally(() => { if (alive) setRedesLoading(false); });
    return () => { alive = false; };
  }, [view, redesData, redesLoading]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Carregando organograma...</div>;
  if (erro) return (
    <div style={{ padding: 28, textAlign: 'center', color: C.t3, fontSize: 13 }}>
      {erro}<br />
      <span style={{ fontSize: 12 }}>O organograma é visível para admin, coordenador ou supervisor.</span>
    </div>
  );

  const isOpen = (k) => (k in open ? open[k] : allOpen);
  const toggle = (k) => setOpen(p => ({ ...p, [k]: !isOpen(k) }));
  const toggleAll = () => { setAllOpen(v => !v); setOpen({}); };

  // ── Visão por supervisor (original) ──
  const sups = (data?.supervisores || []).slice().sort((a, b) => {
    if (!a.supervisor_id) return 1;   // "sem supervisor" por último
    if (!b.supervisor_id) return -1;
    return (a.supervisor_nome || '').localeCompare(b.supervisor_nome || '');
  });
  const comSup = sups.filter(s => s.supervisor_id);
  const semSup = sups.find(s => !s.supervisor_id);

  // ── Visão por redes ──
  const redesOrdenadas = (redesData?.redes || []).slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Organograma dos grupos</h3>
          {view === 'sup' ? (
            <span style={{ fontSize: 12, color: C.t3 }}>
              {comSup.length} supervisores · {data?.total_grupos || 0} grupos
              {semSup?.total_grupos ? <span style={{ color: C.amber, fontWeight: 600 }}> · {semSup.total_grupos} sem supervisor</span> : null}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: C.t3 }}>
              {redesOrdenadas.length} redes · {redesData?.totalGrupos ?? '…'} grupos
              {redesData?.semRede?.length ? <span style={{ color: C.amber, fontWeight: 600 }}> · {redesData.semRede.length} sem rede</span> : null}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', alignItems: 'center', flexWrap: 'wrap' }}>
          <Pill ativo={view === 'sup'} onClick={() => setView('sup')}><Eye size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: '-2px' }} />Por supervisor</Pill>
          <Pill ativo={view === 'redes'} onClick={() => setView('redes')}><Share2 size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: '-2px' }} />Por redes</Pill>
          <button onClick={toggleAll} style={{
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
            padding: '6px 12px', borderRadius: 99, border: `1px solid ${C.border}`,
            background: allOpen ? C.primary : 'transparent', color: allOpen ? '#fff' : C.t2,
          }}>{allOpen ? 'Recolher tudo' : 'Expandir tudo'}</button>
        </div>
      </div>

      {view === 'sup' ? (
        // nós em colunas (cabem lado a lado); abrir um expande os grupos dentro do nó
        <div style={{ columns: '320px', columnGap: 12 }}>
          {comSup.map(s => (
            <Node
              key={s.supervisor_id}
              titulo={s.supervisor_nome}
              subtitulo={`${s.total_grupos} grupo${s.total_grupos !== 1 ? 's' : ''}`}
              cor={C.blue}
              Icone={Eye}
              grupos={s.grupos || []}
              open={isOpen(s.supervisor_id)}
              onToggle={() => toggle(s.supervisor_id)}
              onOpenGrupo={onOpenGrupo}
            />
          ))}
          {semSup && semSup.total_grupos > 0 && (
            <Node
              titulo="Sem supervisor"
              subtitulo={`${semSup.total_grupos} grupo${semSup.total_grupos !== 1 ? 's' : ''}`}
              cor={C.amber}
              Icone={AlertTriangle}
              grupos={semSup.grupos || []}
              open={isOpen('sem_sup')}
              onToggle={() => toggle('sem_sup')}
              onOpenGrupo={onOpenGrupo}
            />
          )}
          {comSup.length === 0 && !semSup && (
            <div style={{ padding: 32, textAlign: 'center', color: C.t3, fontSize: 13 }}>Nenhum grupo com supervisor ainda.</div>
          )}
        </div>
      ) : redesLoading || !redesData ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Carregando redes...</div>
      ) : (
        <div style={{ columns: '320px', columnGap: 12 }}>
          {redesOrdenadas.map(r => {
            const grupos = redesData.porRede[r.id] || [];
            return (
              <Node
                key={r.id}
                titulo={r.nome}
                subtitulo={`${r.supervisor_nome ? `${r.supervisor_nome} · ` : ''}${grupos.length} grupo${grupos.length !== 1 ? 's' : ''}`}
                cor={r.cor || C.blue}
                Icone={Share2}
                grupos={grupos}
                open={isOpen(`rede_${r.id}`)}
                onToggle={() => toggle(`rede_${r.id}`)}
                onOpenGrupo={onOpenGrupo}
              />
            );
          })}
          {redesData.semRede.length > 0 && (
            <Node
              titulo="Sem rede"
              subtitulo={`${redesData.semRede.length} grupo${redesData.semRede.length !== 1 ? 's' : ''} — defina a rede no cadastro do grupo`}
              cor={C.amber}
              Icone={AlertTriangle}
              grupos={redesData.semRede}
              open={isOpen('sem_rede')}
              onToggle={() => toggle('sem_rede')}
              onOpenGrupo={onOpenGrupo}
            />
          )}
          {redesOrdenadas.length === 0 && redesData.semRede.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: C.t3, fontSize: 13 }}>Nenhuma rede cadastrada ainda.</div>
          )}
        </div>
      )}
    </div>
  );
}

// Cartão-nó genérico (supervisor ou rede) com desdobramento dos grupos
function Node({ titulo, subtitulo, cor, Icone, grupos, open, onToggle, onOpenGrupo }) {
  return (
    <div style={{ breakInside: 'avoid', WebkitColumnBreakInside: 'avoid', display: 'inline-block', width: '100%', verticalAlign: 'top', marginBottom: 12 }}>
      <button onClick={onToggle} style={{
        width: '100%', textAlign: 'left', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
        background: C.card, border: `1px solid ${cor === C.amber ? C.amber + '66' : C.border}`,
        borderLeft: `3px solid ${cor}`, borderRadius: 12,
      }}>
        {open ? <ChevronDown size={15} style={{ color: C.t3, flexShrink: 0 }} /> : <ChevronRight size={15} style={{ color: C.t3, flexShrink: 0 }} />}
        <div style={{ width: 30, height: 30, borderRadius: '50%', background: cor + '1e', color: cor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icone size={15} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {titulo}
          </div>
          <div style={{ fontSize: 11, color: C.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitulo}</div>
        </div>
      </button>

      {/* desdobramento: grupos do nó (1 linha cada, com conector à esquerda) */}
      {open && (
        <div style={{ marginLeft: 19, borderLeft: `2px solid ${C.border}`, paddingLeft: 10, marginTop: 4 }}>
          {(grupos || []).map(g => (
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
          {(grupos || []).length === 0 && (
            <div style={{ padding: '4px 8px', fontSize: 11.5, color: C.t3 }}>Nenhum grupo nesta rede.</div>
          )}
        </div>
      )}
    </div>
  );
}
