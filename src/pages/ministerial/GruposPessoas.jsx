// ============================================================================
// Aba "Pessoas" do /grupos · CENSO de quem está nos grupos
//
// Marcos (2026-06-22): a aba deixou de ser "quem-é-quem na hierarquia" (com a
// linha Lidera/Supervisiona + botão Promover — gestão de papel já vive no
// detalhe do grupo, na Supervisão e no Organograma) e virou um CENSO pra
// filtrar e achar gente: Função · Status de frequência · Última frequência ·
// Grupo. Filtros: busca + grupo + status (+ os cards-contador por função).
//
// Status de frequência = derivado da última presença em encontros de grupo
// (fn_grupos_ultima_frequencia): 🟢 Frequenta ≤30d · 🟡 Atenção 31-60d ·
// 🔴 Ausente >60d ou sem presença lançada. A função vem da `funcao` real (o
// trigger fn_grupo_auto_membro mantém visitante→membro no 4º check-in) — sem
// rebaixar por contagem de presenças.
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { grupos as api } from '../../api';
import { Input } from '../../components/ui/input';
import { Select as ShadSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { toast } from 'sonner';
import { Search, Users, GraduationCap, Star, Crown, Eye } from 'lucide-react';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)',
  green: '#10b981', red: '#ef4444', amber: '#f59e0b', blue: '#3b82f6', violet: '#8b5cf6',
};

// Função efetiva → rótulo/cor/ícone (ordem = hierarquia, do topo pra base)
const PAPEIS = {
  coordenador: { label: 'Coordenador', plural: 'Coordenadores', cor: '#8b5cf6', Icon: Crown },
  supervisor: { label: 'Supervisor', plural: 'Supervisores', cor: '#3b82f6', Icon: Eye },
  lider: { label: 'Líder', plural: 'Líderes', cor: '#00B39D', Icon: Star },
  co_lider: { label: 'Co-líder', plural: 'Co-líderes', cor: '#0ea5e9', Icon: Star },
  lider_treinamento: { label: 'Em treinamento', plural: 'Em treinamento', cor: '#f59e0b', Icon: GraduationCap },
  frequentador: { label: 'Membro', plural: 'Membros', cor: '#10b981', Icon: Users },
  visitante: { label: 'Visitante', plural: 'Visitantes', cor: '#94a3b8', Icon: Users },
};

// Status de frequência (derivado da última presença em grupo · bola colorida)
const STATUS = {
  frequenta: { label: 'Frequenta', cor: '#10b981' }, // 🟢 ≤30d
  atencao: { label: 'Atenção', cor: '#f59e0b' },      // 🟡 31-60d
  ausente: { label: 'Ausente', cor: '#ef4444' },      // 🔴 >60d ou sem presença lançada
};

const fmtData = (d) => { if (!d) return null; try { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR'); } catch { return d; } };

function statusDe(p) {
  if (!p.ultima_frequencia) return 'ausente'; // sem presença registrada = ausente
  let dias;
  try { dias = Math.floor((Date.now() - new Date(p.ultima_frequencia + 'T12:00:00').getTime()) / 86400000); }
  catch { return 'ausente'; }
  if (dias <= 30) return 'frequenta';
  if (dias <= 60) return 'atencao';
  return 'ausente';
}

// Grupos da pessoa pra exibir/filtrar: participações; se não tiver, cai pros
// grupos que lidera/supervisiona (pra líder/supervisor não ficar sem grupo).
function gruposDe(p) {
  if (p.grupos?.length) return p.grupos.map(g => ({ id: g.grupo_id, nome: g.grupo_nome || 'Grupo' }));
  const fallback = [...(p.lidera || []), ...(p.supervisiona || [])];
  return fallback.map(g => ({ id: g.id, nome: g.nome || 'Grupo' }));
}

// ============================================================================
// Aba Pessoas
// ============================================================================
export default function GruposPessoas({ onOpenGrupo, gruposOptions = [] }) {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('todos');     // função: todos | <papel> | lideres
  const [filtroGrupo, setFiltroGrupo] = useState('todos');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [busca, setBusca] = useState('');

  const carregar = useCallback(async () => {
    try {
      const r = await api.pessoasPapeis();
      setDados(r);
    } catch {
      toast.error('Erro ao carregar pessoas');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const pessoas = dados?.pessoas || [];

  const contagens = useMemo(() => {
    const c = {};
    Object.keys(PAPEIS).forEach(k => { c[k] = 0; });
    for (const p of pessoas) c[p.papel] = (c[p.papel] || 0) + 1;
    c.lideres_total = (c.lider || 0) + (c.co_lider || 0);
    return c;
  }, [pessoas]);

  const filtradas = useMemo(() => {
    let lista = pessoas;
    if (busca) {
      const s = busca.toLowerCase();
      lista = lista.filter(p =>
        p.nome?.toLowerCase().includes(s) ||
        gruposDe(p).some(g => g.nome?.toLowerCase().includes(s)));
    }
    if (filtro === 'lideres') lista = lista.filter(p => p.papel === 'lider' || p.papel === 'co_lider');
    else if (filtro !== 'todos') lista = lista.filter(p => p.papel === filtro);
    if (filtroGrupo !== 'todos') lista = lista.filter(p => gruposDe(p).some(g => g.id === filtroGrupo));
    if (filtroStatus !== 'todos') lista = lista.filter(p => statusDe(p) === filtroStatus);
    return lista;
  }, [pessoas, busca, filtro, filtroGrupo, filtroStatus]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Carregando pessoas...</div>;

  // Cards-contador por função = também filtram
  const CARDS = [
    { key: 'todos', label: 'Todos', value: pessoas.length, cor: C.text },
    { key: 'coordenador', label: 'Coordenadores', value: contagens.coordenador || 0, cor: PAPEIS.coordenador.cor },
    { key: 'supervisor', label: 'Supervisores', value: contagens.supervisor || 0, cor: PAPEIS.supervisor.cor },
    { key: 'lideres', label: 'Líderes', value: contagens.lideres_total || 0, cor: PAPEIS.lider.cor },
    { key: 'lider_treinamento', label: 'Líderes em treinamento', value: contagens.lider_treinamento || 0, cor: PAPEIS.lider_treinamento.cor },
    { key: 'frequentador', label: 'Membros', value: contagens.frequentador || 0, cor: PAPEIS.frequentador.cor },
    { key: 'visitante', label: 'Visitantes', value: contagens.visitante || 0, cor: PAPEIS.visitante.cor },
  ];

  const opcoesGrupo = [...gruposOptions].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  const temFiltro = filtro !== 'todos' || filtroGrupo !== 'todos' || filtroStatus !== 'todos' || !!busca;

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Pessoas dos grupos</h3>
        <p style={{ fontSize: 12, color: C.t3, margin: '4px 0 0' }}>
          Censo de quem está nos grupos — função, status de frequência, última presença e grupo.
          O status vem das chamadas registradas (quem ainda não tem presença lançada fica "Ausente").
        </p>
      </div>

      {/* Cards-filtro por função */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: 10, marginBottom: 12 }}>
        {CARDS.map(k => {
          const ativo = filtro === k.key;
          return (
            <button key={k.key} onClick={() => setFiltro(k.key)} style={{
              background: ativo ? `${k.cor}12` : C.card, borderRadius: 12, padding: 12, textAlign: 'left', cursor: 'pointer',
              border: ativo ? `2px solid ${k.cor}` : `1px solid ${C.border}`, transition: 'border-color 0.12s',
            }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: k.cor }}>{k.value}</div>
              <div style={{ fontSize: 11, color: ativo ? k.cor : C.t3, fontWeight: ativo ? 600 : 400 }}>{k.label}</div>
            </button>
          );
        })}
      </div>

      {/* Controles: busca + grupo + status */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.t3 }} />
          <Input placeholder="Buscar por nome ou grupo..." value={busca} onChange={e => setBusca(e.target.value)} style={{ paddingLeft: 34 }} />
        </div>
        <ShadSelect value={filtroGrupo} onValueChange={setFiltroGrupo}>
          <SelectTrigger style={{ width: 200 }}><SelectValue placeholder="Grupo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os grupos</SelectItem>
            {opcoesGrupo.map(g => <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>)}
          </SelectContent>
        </ShadSelect>
        <ShadSelect value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger style={{ width: 170 }}><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {Object.entries(STATUS).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}
          </SelectContent>
        </ShadSelect>
      </div>

      {/* Lista */}
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        <div style={{ padding: '8px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 11, color: C.t3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{filtradas.length} pessoa{filtradas.length !== 1 ? 's' : ''}</span>
          {temFiltro && (
            <button onClick={() => { setFiltro('todos'); setFiltroGrupo('todos'); setFiltroStatus('todos'); setBusca(''); }}
              style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
              Limpar filtros
            </button>
          )}
        </div>
        {filtradas.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.t3, fontSize: 13 }}>Ninguém nesse filtro.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.bg }}>
                  {['Pessoa', 'Função', 'Status', 'Grupo', 'Última frequência', 'Presenças'].map((h, i) => (
                    <th key={h} style={{ textAlign: i === 5 ? 'right' : 'left', padding: '8px 16px', fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtradas.map(p => {
                  const pap = PAPEIS[p.papel] || PAPEIS.frequentador;
                  const st = STATUS[statusDe(p)];
                  const gs = gruposDe(p);
                  return (
                    <tr key={p.membro_id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: p.foto_url ? `url(${p.foto_url}) center/cover` : `${pap.cor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 700, color: pap.cor }}>
                            {!p.foto_url && (p.nome?.charAt(0) || '?')}
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.text, whiteSpace: 'nowrap' }}>{p.nome}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 9px', borderRadius: 99, background: `${pap.cor}18`, color: pap.cor, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          <pap.Icon size={10} /> {pap.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, padding: '2px 9px', borderRadius: 99, background: `${st.cor}18`, color: st.cor, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.cor }} /> {st.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: C.t2 }}>
                        {gs.length > 0 ? gs.map((g, i) => (
                          <span key={g.id || i}>
                            {i > 0 && ', '}
                            <button onClick={() => onOpenGrupo?.(g.id)} style={{ background: 'none', border: 'none', padding: 0, color: C.t2, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{g.nome}</button>
                          </span>
                        )) : <span style={{ color: C.t3 }}>Sem grupo</span>}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: p.ultima_frequencia ? C.t2 : C.t3, whiteSpace: 'nowrap' }}>
                        {p.ultima_frequencia ? fmtData(p.ultima_frequencia) : '—'}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: C.t2, textAlign: 'right' }}>
                        {p.presencas_total || 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
