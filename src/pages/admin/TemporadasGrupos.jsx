// ============================================================================
// /admin/grupos/temporadas — gerencia temporadas e abre/fecha inscrições.
//
// Quando inscricoes_abertas = false, o formulário público /inscricao-grupos
// retorna 403. O QR continua valido mas mostra mensagem "inscrições fechadas".
// ============================================================================

import { useEffect, useState } from 'react';
import { grupos as api } from '../../api';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import { Calendar, Lock, Unlock, CheckCircle2, Archive, UserMinus, ClipboardX } from 'lucide-react';

const fmtDT = (d) => { try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return ''; } };

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D', green: '#10b981', red: '#ef4444', amber: '#f59e0b',
};

export default function TemporadasGrupos() {
  const [temporadas, setTemporadas] = useState([]);
  const [consolidados, setConsolidados] = useState({}); // temporada -> linha congelada
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [consolidando, setConsolidando] = useState({});

  async function load() {
    setLoading(true);
    try {
      const [temps, comp] = await Promise.all([
        api.temporadas(),
        api.temporadasConsolidado().catch(() => ({ consolidados: [] })),
      ]);
      setTemporadas(temps || []);
      const map = {};
      for (const c of (comp?.consolidados || [])) map[c.temporada] = c;
      setConsolidados(map);
    } catch (e) { toast.error(e.message || 'Erro ao carregar temporadas'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function toggleInscricoes(t) {
    const novo = !t.inscricoes_abertas;
    // Aviso na virada: se está ABRINDO uma temporada e existe OUTRA temporada
    // (que já começou) ainda NÃO consolidada, lembra de fechar os livros antes —
    // senão os números dela se perdem quando os grupos virarem.
    if (novo) {
      const hoje = new Date().toISOString().slice(0, 10);
      const pendente = temporadas.find(o => o.id !== t.id && !consolidados[o.id]
        && o.data_inicio && o.data_inicio <= hoje);
      const aviso = pendente
        ? `\n\n⚠️ A temporada "${pendente.label}" ainda não foi consolidada. Consolide-a antes de virar, senão os números dela (grupos, frequência, líderes...) se perdem. Abrir mesmo assim?`
        : '';
      if (!confirm(`Abrir inscrições para ${t.label}? O formulário público vai aceitar novos pedidos.${aviso}`)) return;
    } else {
      if (!confirm(`Fechar inscrições para ${t.label}? O formulário público vai bloquear novos pedidos.`)) return;
    }
    setSaving(s => ({ ...s, [t.id]: true }));
    try {
      await api.atualizarTemporada(t.id, { inscricoes_abertas: novo });
      toast.success(novo ? 'Inscrições abertas' : 'Inscrições fechadas');
      load();
    } catch (e) { toast.error(e.message || 'Erro ao atualizar'); }
    finally { setSaving(s => ({ ...s, [t.id]: false })); }
  }

  async function consolidar(t) {
    const jaFeito = consolidados[t.id];
    const msg = jaFeito
      ? `Reconsolidar "${t.label}"? Isso RECALCULA os números com os dados de AGORA e sobrescreve o que foi congelado em ${fmtDT(jaFeito.consolidado_em)}. Só faça se ainda não virou pra próxima temporada (senão as contagens ficam erradas).`
      : `Consolidar "${t.label}"? Isso congela os números atuais (grupos, inscrições, líderes, líderes em treinamento, frequência, satisfação) no histórico do Comparativo. Faça isso ao final da temporada, antes de virar pra próxima.`;
    if (!confirm(msg)) return;
    setConsolidando(s => ({ ...s, [t.id]: true }));
    try {
      const r = await api.consolidarTemporada(t.id, !!jaFeito);
      toast.success(`Temporada consolidada · ${r?.num_grupos ?? 0} grupos, ${r?.num_membros ?? 0} membros`);
      load();
    } catch (e) { toast.error(e.message || 'Erro ao consolidar'); }
    finally { setConsolidando(s => ({ ...s, [t.id]: false })); }
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Calendar size={22} style={{ color: C.primary }} /> Temporadas de Grupos
        </h1>
        <p style={{ fontSize: 13, color: C.t3, marginTop: 6 }}>
          Controle quando o formulário público de inscrição em grupo aceita novos
          pedidos. Quando fechado, o QR code continua válido mas a pessoa vê
          mensagem "inscrições fechadas".
        </p>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Carregando...</div>
      ) : temporadas.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Nenhuma temporada cadastrada.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {temporadas.map(t => {
            const aberta = t.inscricoes_abertas;
            return (
              <div key={t.id} style={{
                background: C.card, borderRadius: 12, border: `1px solid ${aberta ? C.green : C.border}`,
                borderLeft: `4px solid ${aberta ? C.green : t.ativa ? C.primary : C.t3}`,
                padding: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{t.label}</span>
                    <code style={{ fontSize: 11, color: C.t3, fontFamily: 'monospace' }}>{t.id}</code>
                    {t.ativa && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: C.primary + '20', color: C.primary, fontWeight: 700, textTransform: 'uppercase' }}>Atual</span>}
                  </div>
                  <div style={{ fontSize: 12, color: C.t3 }}>
                    {t.data_inicio && <>De {new Date(t.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR')}</>}
                    {t.data_fim && <> até {new Date(t.data_fim + 'T12:00:00').toLocaleDateString('pt-BR')}</>}
                  </div>
                </div>

                <span style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 12, padding: '4px 12px', borderRadius: 99, fontWeight: 700,
                  background: aberta ? C.green + '20' : C.red + '15',
                  color: aberta ? C.green : C.red,
                }}>
                  {aberta ? <><Unlock size={13} /> Inscrições abertas</> : <><Lock size={13} /> Fechadas</>}
                </span>

                {/* Estado de consolidação (fechamento dos livros da temporada) */}
                {consolidados[t.id] ? (
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5,
                    padding: '4px 10px', borderRadius: 99, fontWeight: 600,
                    background: C.primary + '15', color: C.primary,
                  }} title={`Congelada em ${fmtDT(consolidados[t.id].consolidado_em)}`}>
                    <CheckCircle2 size={13} /> Consolidada
                  </span>
                ) : null}

                <Button
                  size="sm"
                  variant={aberta ? 'outline' : 'default'}
                  disabled={saving[t.id]}
                  onClick={() => toggleInscricoes(t)}
                >
                  {saving[t.id] ? 'Salvando...' : (aberta ? 'Fechar inscrições' : 'Abrir inscrições')}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  disabled={consolidando[t.id]}
                  onClick={() => consolidar(t)}
                  title="Congela os números desta temporada no histórico (Comparativo em Relatórios)"
                >
                  <Archive size={14} style={{ marginRight: 4 }} />
                  {consolidando[t.id] ? 'Consolidando...' : (consolidados[t.id] ? 'Reconsolidar' : 'Consolidar')}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{
        marginTop: 20, padding: 14, background: C.bg, borderRadius: 10,
        border: `1px solid ${C.border}`, fontSize: 12, color: C.t2, lineHeight: 1.6,
      }}>
        <strong style={{ color: C.text }}>Como funciona:</strong>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          <li><strong>Inscrições abertas</strong>: o QR code (<code>/inscricao-grupos</code>) e o clique no mapa permitem que a pessoa se inscreva em um grupo e o líder receba notificação.</li>
          <li><strong>Inscrições fechadas</strong>: o formulário retorna mensagem "inscrições fechadas no momento, aguarde a próxima abertura". Botão "Inscrever-se" no mapa fica desabilitado.</li>
          <li>Os pedidos pendentes que já existem <strong>não são afetados</strong> — só novos pedidos são bloqueados.</li>
          <li><strong>Consolidar</strong>: ao final de uma temporada, antes de virar pra próxima, aperte "Consolidar" pra congelar os números dela (grupos, inscrições, líderes, frequência, satisfação). Eles ficam salvos no <strong>Comparativo entre temporadas</strong> (aba Relatórios) pra sempre — mesmo depois que os grupos passarem pra temporada seguinte.</li>
        </ul>
      </div>

      {!loading && temporadas.length > 0 && <RevisaoFimTemporada temporadas={temporadas} />}
    </div>
  );
}

// Revisão de fim de temporada (Marcos · 18/07): lista quem nunca teve presença
// na temporada — candidatos a sair. ASSISTIDA (a equipe confirma a remoção) e só
// para grupos que registraram encontro (ausência de chamada ≠ ausência da pessoa).
function RevisaoFimTemporada({ temporadas }) {
  const [temporada, setTemporada] = useState(() => (temporadas.find(t => t.ativa)?.id || temporadas[0]?.id || ''));
  const [grupos, setGrupos] = useState(null);
  const [loading, setLoading] = useState(false);
  const [removendo, setRemovendo] = useState({});

  async function load(temp) {
    if (!temp) return;
    setLoading(true);
    try {
      const data = await api.semPresenca(temp);
      setGrupos(Array.isArray(data) ? data : []);
    } catch (e) { toast.error(e.message || 'Erro ao carregar a revisão'); setGrupos([]); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(temporada); /* eslint-disable-next-line */ }, [temporada]);

  async function remover(grupoId, m, grupoNome) {
    if (!confirm(`Remover ${m.nome} do grupo "${grupoNome}"? Ele sai do grupo (reversível). Faça só se confirmou que a pessoa realmente não participa mais.`)) return;
    setRemovendo(s => ({ ...s, [m.participacao_id]: true }));
    try {
      await api.sairMembro(m.participacao_id, { motivo_saida: 'Sem presença na temporada (revisão de fim de temporada)' });
      toast.success(`${m.nome} saiu do grupo`);
      setGrupos(gs => gs.map(g => g.grupo_id === grupoId
        ? { ...g, membros: g.membros.filter(x => x.participacao_id !== m.participacao_id) }
        : g).filter(g => g.membros.length > 0));
    } catch (e) { toast.error(e.message || 'Erro ao remover'); }
    finally { setRemovendo(s => ({ ...s, [m.participacao_id]: false })); }
  }

  const totalPessoas = (grupos || []).reduce((acc, g) => acc + (g.membros?.length || 0), 0);

  return (
    <div style={{ marginTop: 22, background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <ClipboardX size={17} style={{ color: C.amber }} /> Revisão de fim de temporada — sem presença
        </h2>
        <p style={{ fontSize: 12, color: C.t3, margin: '6px 0 0', lineHeight: 1.6 }}>
          Pessoas que nunca apareceram em nenhuma chamada da temporada — candidatas a sair. Só aparecem grupos que
          registraram encontro (se o líder não fez chamada, ninguém é listado). <strong>Nada sai sozinho</strong>:
          você confirma cada remoção. Líderes não entram na lista.
        </p>
        <select
          value={temporada}
          onChange={e => setTemporada(e.target.value)}
          style={{ marginTop: 10, padding: '7px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'var(--cbrio-input-bg)', color: C.text, fontSize: 13 }}
        >
          {temporadas.map(t => <option key={t.id} value={t.id}>{t.label}{t.ativa ? ' (atual)' : ''}</option>)}
        </select>
      </div>

      <div style={{ padding: 16 }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: C.t3, fontSize: 13 }}>Carregando...</div>
        ) : !grupos || grupos.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: C.t3, fontSize: 13, lineHeight: 1.6 }}>
            <CheckCircle2 size={26} style={{ margin: '0 auto 8px', display: 'block', color: C.green, opacity: 0.7 }} />
            Ninguém a revisar nesta temporada — ou todos os grupos com chamada têm todo mundo com presença,
            ou ainda não há encontros registrados.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: C.t2, marginBottom: 12 }}>
              <strong style={{ color: C.text }}>{totalPessoas}</strong> pessoa(s) sem presença em <strong style={{ color: C.text }}>{grupos.length}</strong> grupo(s) com chamada registrada.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {grupos.map(g => (
                <div key={g.grupo_id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '8px 12px', background: C.bg, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{g.grupo_nome}</span>
                    {g.grupo_codigo && <code style={{ fontSize: 10.5, color: C.t3 }}>{g.grupo_codigo}</code>}
                    <span style={{ fontSize: 11, color: C.t3, marginLeft: 'auto' }}>
                      {g.total_encontros} encontro(s) · {g.membros.length} sem presença
                    </span>
                  </div>
                  <div>
                    {g.membros.map(m => (
                      <div key={m.participacao_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: `1px solid ${C.border}` }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: m.foto_url ? `url(${m.foto_url}) center/cover` : `${C.primary}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 700, color: C.primary }}>
                          {!m.foto_url && (m.nome?.charAt(0) || '?')}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{m.nome}</div>
                          {m.telefone && <div style={{ fontSize: 11, color: C.t3 }}>{m.telefone}</div>}
                        </div>
                        {m.entrou_em && <span style={{ fontSize: 11, color: C.t3 }}>entrou {fmtDT(m.entrou_em)}</span>}
                        <Button size="sm" variant="outline" disabled={removendo[m.participacao_id]} onClick={() => remover(g.grupo_id, m, g.grupo_nome)}>
                          <UserMinus size={13} style={{ marginRight: 4 }} /> {removendo[m.participacao_id] ? 'Removendo...' : 'Remover'}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
