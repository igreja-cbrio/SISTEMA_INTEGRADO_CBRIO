// ============================================================================
// Aba "Pessoas" do /grupos · quem é quem na hierarquia + promoção
//
// Marcos (2026-06-10): "criar uma aba de pessoas, filtrar quem são membros,
// visitantes, líderes, supervisores e coordenadores e ter uma análise simples
// de promover pessoas a líder, supervisor ou coordenador — por mais que
// existam essas nomenclaturas, é difícil ver quem é o quê."
//
// O papel vive em 3 lugares (funcao da participação · lider_id do grupo ·
// supervisor_id do grupo); GET /grupos/pessoas/papeis unifica em 1 linha por
// pessoa com o papel efetivo. Os cards de resumo são clicáveis e FILTRAM.
// (2026-06-10 · Marcos: o card "Candidatos a promoção" saiu — o destaque é
// "Líderes em treinamento"; a promoção fica no botão Promover.)
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { grupos as api } from '../../api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Select as ShadSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { toast } from 'sonner';
import { Search, Users, GraduationCap, Star, Crown, Eye, ArrowUpRight } from 'lucide-react';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)',
  green: '#10b981', red: '#ef4444', amber: '#f59e0b', blue: '#3b82f6', violet: '#8b5cf6',
};

// Papel efetivo → rótulo/cor/ícone (ordem = hierarquia, do topo pra base)
const PAPEIS = {
  coordenador: { label: 'Coordenador', plural: 'Coordenadores', cor: '#8b5cf6', Icon: Crown },
  supervisor: { label: 'Supervisor', plural: 'Supervisores', cor: '#3b82f6', Icon: Eye },
  lider: { label: 'Líder', plural: 'Líderes', cor: '#00B39D', Icon: Star },
  co_lider: { label: 'Co-líder', plural: 'Co-líderes', cor: '#0ea5e9', Icon: Star },
  lider_treinamento: { label: 'Em treinamento', plural: 'Em treinamento', cor: '#f59e0b', Icon: GraduationCap },
  frequentador: { label: 'Membro', plural: 'Membros', cor: '#10b981', Icon: Users },
  visitante: { label: 'Visitante', plural: 'Visitantes', cor: '#94a3b8', Icon: Users },
};

const fmtData = (d) => { if (!d) return null; try { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR'); } catch { return d; } };

// ============================================================================
// Modal · promover / mudar função
// ============================================================================
function PromoverModal({ pessoa, gruposOptions, onClose, onSaved }) {
  const [novaFuncao, setNovaFuncao] = useState('');
  const [participacaoId, setParticipacaoId] = useState(pessoa?.grupos?.[0]?.participacao_id || '');
  const [gruposSupervisao, setGruposSupervisao] = useState([]);
  const [saving, setSaving] = useState(false);

  const FUNCOES = [
    { value: 'lider_treinamento', label: 'Líder em treinamento', desc: 'Entra na formação pra liderar um grupo no futuro.' },
    { value: 'co_lider', label: 'Co-líder', desc: 'Lidera junto com o líder do grupo.' },
    { value: 'lider', label: 'Líder', desc: 'Marca a função de líder. Pra trocar o líder responsável de um grupo, edite o grupo.' },
    { value: 'supervisor', label: 'Supervisor', desc: 'Acompanha e visita grupos. Escolha abaixo quais grupos vai supervisionar.' },
    { value: 'coordenador', label: 'Coordenador', desc: 'Vê todos os supervisores e grupos na supervisão.' },
    { value: 'frequentador', label: 'Frequentador (papel base)', desc: 'Volta ao papel de membro comum do grupo.' },
  ];
  const funcaoSel = FUNCOES.find(f => f.value === novaFuncao);

  const submit = async () => {
    if (!novaFuncao) { toast.error('Escolha a nova função'); return; }
    const temParticipacao = (pessoa.grupos || []).length > 0;
    if (!temParticipacao && novaFuncao !== 'supervisor') {
      toast.error('Essa pessoa não participa de nenhum grupo — adicione-a a um grupo primeiro');
      return;
    }
    if (novaFuncao === 'supervisor' && !temParticipacao && gruposSupervisao.length === 0) {
      toast.error('Escolha pelo menos um grupo pra essa pessoa supervisionar');
      return;
    }
    setSaving(true);
    try {
      if (temParticipacao) {
        await api.setFuncaoMembro(participacaoId || pessoa.grupos[0].participacao_id, novaFuncao);
      }
      if (novaFuncao === 'supervisor' && gruposSupervisao.length) {
        for (const gid of gruposSupervisao) {
          await api.setSupervisor(gid, pessoa.membro_id);
        }
      }
      toast.success(`${pessoa.nome} agora é ${FUNCOES.find(f => f.value === novaFuncao)?.label || novaFuncao}`);
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.error || e?.message || 'Erro ao promover');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!pessoa} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Promover — {pessoa?.nome}</DialogTitle></DialogHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: C.t2 }}>
            Papel atual: <strong style={{ color: PAPEIS[pessoa?.papel]?.cor || C.text }}>{PAPEIS[pessoa?.papel]?.label || pessoa?.papel}</strong>
            {pessoa?.presencas_total > 0 && <> · {pessoa.presencas_total} presenças</>}
          </div>

          <div>
            <Label style={{ fontSize: 12 }}>Nova função *</Label>
            <ShadSelect value={novaFuncao} onValueChange={setNovaFuncao}>
              <SelectTrigger><SelectValue placeholder="Escolha a função" /></SelectTrigger>
              <SelectContent>
                {FUNCOES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </ShadSelect>
            {funcaoSel && <p style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>{funcaoSel.desc}</p>}
          </div>

          {(pessoa?.grupos?.length || 0) > 1 && (
            <div>
              <Label style={{ fontSize: 12 }}>Em qual grupo a função vale?</Label>
              <ShadSelect value={participacaoId} onValueChange={setParticipacaoId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {pessoa.grupos.map(g => (
                    <SelectItem key={g.participacao_id} value={g.participacao_id}>{g.grupo_nome || 'Grupo'}</SelectItem>
                  ))}
                </SelectContent>
              </ShadSelect>
            </div>
          )}

          {novaFuncao === 'supervisor' && (
            <div>
              <Label style={{ fontSize: 12 }}>Grupos que vai supervisionar</Label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, maxHeight: 180, overflowY: 'auto' }}>
                {gruposOptions.map(g => {
                  const ativo = gruposSupervisao.includes(g.id);
                  return (
                    <button key={g.id} type="button"
                      onClick={() => setGruposSupervisao(prev => ativo ? prev.filter(x => x !== g.id) : [...prev, g.id])}
                      style={{
                        padding: '4px 12px', borderRadius: 16, fontSize: 11, cursor: 'pointer',
                        border: ativo ? `2px solid ${C.blue}` : `1px solid ${C.border}`,
                        background: ativo ? '#3b82f618' : 'transparent',
                        color: ativo ? C.blue : C.t3, fontWeight: ativo ? 600 : 400,
                      }}>
                      {g.nome}
                    </button>
                  );
                })}
              </div>
              <p style={{ fontSize: 11, color: C.t3, marginTop: 6 }}>
                O supervisor passa a ver esses grupos na supervisão e a registrar visitas neles.
              </p>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button size="sm" onClick={submit} disabled={saving}>{saving ? 'Salvando...' : 'Confirmar'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Aba Pessoas
// ============================================================================
export default function GruposPessoas({ onOpenGrupo, podeEditar, gruposOptions = [] }) {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('todos'); // todos | <papel>
  const [busca, setBusca] = useState('');
  const [promover, setPromover] = useState(null);

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
    for (const p of pessoas) {
      c[p.papel] = (c[p.papel] || 0) + 1;
    }
    // Líderes + co-líderes num card só (visão do Marcos: líder é líder)
    c.lideres_total = (c.lider || 0) + (c.co_lider || 0);
    return c;
  }, [pessoas]);

  const filtradas = useMemo(() => {
    let lista = pessoas;
    if (busca) {
      const s = busca.toLowerCase();
      lista = lista.filter(p =>
        p.nome?.toLowerCase().includes(s) ||
        p.grupos.some(g => g.grupo_nome?.toLowerCase().includes(s)) ||
        p.lidera.some(g => g.nome?.toLowerCase().includes(s)) ||
        p.supervisiona.some(g => g.nome?.toLowerCase().includes(s)));
    }
    if (filtro === 'lideres') lista = lista.filter(p => p.papel === 'lider' || p.papel === 'co_lider');
    else if (filtro !== 'todos') lista = lista.filter(p => p.papel === filtro);
    return lista;
  }, [pessoas, busca, filtro]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Carregando pessoas...</div>;

  // Cards clicáveis = o próprio filtro
  const CARDS = [
    { key: 'todos', label: 'Todos', value: pessoas.length, cor: C.text },
    { key: 'coordenador', label: 'Coordenadores', value: contagens.coordenador || 0, cor: PAPEIS.coordenador.cor },
    { key: 'supervisor', label: 'Supervisores', value: contagens.supervisor || 0, cor: PAPEIS.supervisor.cor },
    { key: 'lideres', label: 'Líderes', value: contagens.lideres_total || 0, cor: PAPEIS.lider.cor },
    { key: 'lider_treinamento', label: 'Líderes em treinamento', value: contagens.lider_treinamento || 0, cor: PAPEIS.lider_treinamento.cor },
    { key: 'frequentador', label: 'Membros', value: contagens.frequentador || 0, cor: PAPEIS.frequentador.cor },
    { key: 'visitante', label: 'Visitantes', value: contagens.visitante || 0, cor: PAPEIS.visitante.cor },
  ];

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Pessoas dos grupos</h3>
        <p style={{ fontSize: 12, color: C.t3, margin: '4px 0 0' }}>
          Quem é quem na hierarquia (coordenador → supervisor → líder → em treinamento → membro → visitante).
          Clique num card pra filtrar. Visitante = menos de 3 presenças.
        </p>
      </div>

      {/* Cards-filtro */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: 10, marginBottom: 14 }}>
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

      {/* Busca */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.t3 }} />
        <Input placeholder="Buscar por nome ou grupo..." value={busca} onChange={e => setBusca(e.target.value)} style={{ paddingLeft: 34 }} />
      </div>

      {/* Lista */}
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        <div style={{ padding: '8px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 11, color: C.t3 }}>
          {filtradas.length} pessoa{filtradas.length !== 1 ? 's' : ''}
        </div>
        {filtradas.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.t3, fontSize: 13 }}>Ninguém nesse filtro.</div>
        ) : filtradas.map(p => {
          const pap = PAPEIS[p.papel] || PAPEIS.frequentador;
          return (
            <div key={p.membro_id} style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: p.foto_url ? `url(${p.foto_url}) center/cover` : `${pap.cor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 700, color: pap.cor }}>
                {!p.foto_url && (p.nome?.charAt(0) || '?')}
              </div>

              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{p.nome}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 9px', borderRadius: 99, background: `${pap.cor}18`, color: pap.cor, fontWeight: 700 }}>
                    <pap.Icon size={10} /> {pap.label}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: C.t3, marginTop: 3, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  {p.supervisiona.length > 0 && (
                    <span>Supervisiona: {p.supervisiona.map((g, i) => (
                      <span key={g.id}>
                        {i > 0 && ', '}
                        <button onClick={() => onOpenGrupo?.(g.id)} style={{ background: 'none', border: 'none', padding: 0, color: C.blue, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>{g.nome}</button>
                      </span>
                    ))}</span>
                  )}
                  {p.lidera.length > 0 && (
                    <span>{p.supervisiona.length > 0 ? ' · ' : ''}Lidera: {p.lidera.map((g, i) => (
                      <span key={g.id}>
                        {i > 0 && ', '}
                        <button onClick={() => onOpenGrupo?.(g.id)} style={{ background: 'none', border: 'none', padding: 0, color: C.primary, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>{g.nome}</button>
                      </span>
                    ))}</span>
                  )}
                  {p.lidera.length === 0 && p.supervisiona.length === 0 && p.grupos.length > 0 && (
                    <span>{p.grupos.map((g, i) => (
                      <span key={g.participacao_id}>
                        {i > 0 && ', '}
                        <button onClick={() => onOpenGrupo?.(g.grupo_id)} style={{ background: 'none', border: 'none', padding: 0, color: C.t2, cursor: 'pointer', fontSize: 11 }}>{g.grupo_nome || 'Grupo'}</button>
                      </span>
                    ))}</span>
                  )}
                  {p.entrou_em && <span> · desde {fmtData(p.entrou_em)}</span>}
                  {p.presencas_total > 0 && <span> · {p.presencas_total} presença{p.presencas_total !== 1 ? 's' : ''}</span>}
                </div>
              </div>

              {podeEditar && (
                <Button size="sm" variant="outline" onClick={() => setPromover(p)} style={{ flexShrink: 0 }}>
                  <ArrowUpRight size={13} style={{ marginRight: 4 }} /> Promover
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {promover && (
        <PromoverModal
          pessoa={promover}
          gruposOptions={gruposOptions}
          onClose={() => setPromover(null)}
          onSaved={carregar}
        />
      )}
    </div>
  );
}
