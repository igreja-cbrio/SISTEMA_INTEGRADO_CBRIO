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
import { Calendar, Lock, Unlock, CheckCircle2, Archive, UserMinus, ClipboardX, ListChecks, AlertTriangle, ChevronDown, ChevronRight, Send, HeartHandshake } from 'lucide-react';

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

      {!loading && temporadas.length > 0 && <RenovacaoTemporada temporadas={temporadas} />}

      {!loading && temporadas.length > 0 && <ProntidaoTemporada temporadas={temporadas} />}

      {!loading && temporadas.length > 0 && <RevisaoFimTemporada temporadas={temporadas} />}
    </div>
  );
}

// Renovação de temporada (Marcos · 21/07): 1×/semestre, com a temporada
// fechada, a coordenação DISPARA daqui o WhatsApp pra cada líder de grupo
// ativo perguntando se continua (link /g/r/<token> · sem login). Disparo é
// SEMPRE manual (lei de 20/07 — nada automático pro líder). Re-executar o
// botão reenvia SÓ pra quem não respondeu (link antigo morre · nova geração).
// Os "não continuo" caem na Caixa de entrada pra triagem.
const REN_STATUS = {
  sem_envio: { label: 'Não enviada', cor: C.t3 },
  enviada: { label: 'Sem resposta', cor: C.amber },
  continua: { label: 'Continua', cor: C.green },
  nao_continua: { label: 'Não continua', cor: C.red },
  triada: { label: 'Triada', cor: C.primary },
};

function RenovacaoTemporada({ temporadas }) {
  const [temporada, setTemporada] = useState(() => (temporadas.find(t => t.ativa)?.id || temporadas[0]?.id || ''));
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(false);
  const [disparando, setDisparando] = useState(false);
  const [mostrarGrupos, setMostrarGrupos] = useState(false);

  async function load(temp) {
    if (!temp) return;
    setLoading(true);
    try { setDados(await api.renovacao.painel({ temporada: temp })); }
    catch (e) { toast.error(e.message || 'Erro ao carregar a renovação'); setDados(null); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(temporada); /* eslint-disable-next-line */ }, [temporada]);

  const resumo = dados?.resumo || null;
  const jaDisparou = (resumo?.enviadas || 0) > 0;

  async function disparar() {
    if (!dados) return;
    if (dados.temporada?.inscricoes_abertas) {
      toast.error('As inscrições desta temporada já estão abertas — a renovação é feita antes da abertura.');
      return;
    }
    const alvo = jaDisparou ? resumo.sem_resposta : resumo.podem_receber;
    const msg = jaDisparou
      ? `Reenviar a renovação pros ${resumo.sem_resposta} líder(es) que ainda não responderam? O link antigo deles deixa de valer (quem já respondeu NÃO recebe de novo).`
      : `Enviar a pergunta de renovação pros líderes de ${resumo.podem_receber} grupo(s) de ${dados.temporada?.label}? Cada líder recebe um WhatsApp com o link pra responder (sem login).`;
    if (!alvo) { toast.info('Ninguém pra enviar agora.'); return; }
    if (!confirm(msg)) return;
    setDisparando(true);
    try {
      const r = await api.renovacao.disparar(temporada);
      const p = r?.pulados || {};
      const detalhes = [
        p.sem_lider ? `${p.sem_lider} sem líder` : null,
        p.sem_telefone ? `${p.sem_telefone} líder(es) sem telefone` : null,
        p.ja_respondida ? `${p.ja_respondida} já respondida(s)` : null,
        p.enviada_ha_pouco ? `${p.enviada_ha_pouco} enviada(s) há pouco` : null,
      ].filter(Boolean).join(' · ');
      toast.success(`${r?.enfileirados ?? 0} mensagem(ns) na fila de envio${detalhes ? ` · puladas: ${detalhes}` : ''}`);
      load(temporada);
    } catch (e) { toast.error(e.message || 'Erro ao disparar a renovação'); }
    finally { setDisparando(false); }
  }

  const rows = dados?.rows || [];
  // Sinal de anomalia (conferir com o líder): confirmou ≤20% de um grupo com 5+
  const anomala = (r) => r.renovacao?.status === 'continua' && (r.renovacao.roster_total || 0) >= 5
    && (r.renovacao.confirmados_count || 0) <= 0.2 * r.renovacao.roster_total;

  return (
    <div style={{ marginTop: 22, background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <HeartHandshake size={17} style={{ color: C.primary }} /> Renovação de temporada — líderes confirmam
        </h2>
        <p style={{ fontSize: 12, color: C.t3, margin: '6px 0 0', lineHeight: 1.6 }}>
          1× por semestre, <strong>antes de abrir as inscrições</strong>, cada líder recebe no WhatsApp a
          pergunta "você continua com o grupo?". Quem continua confirma no link quem deve seguir no grupo
          (estimativa); quem não continua cai na <strong>Caixa de entrada</strong> pra triagem. Sem resposta,
          nada muda no grupo. O disparo é sempre manual — reenviar cobre só quem não respondeu.
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
        ) : !dados ? (
          <div style={{ padding: 24, textAlign: 'center', color: C.t3, fontSize: 13 }}>Não foi possível carregar.</div>
        ) : (
          <>
            {!dados.whatsapp_ligado && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, marginBottom: 12, background: C.red + '15', border: `1px solid ${C.red}55`, fontSize: 12.5, color: C.text }}>
                <AlertTriangle size={15} style={{ color: C.red, flexShrink: 0 }} />
                O envio de WhatsApp não está configurado no servidor — o disparo não vai funcionar.
              </div>
            )}
            {dados.temporada?.inscricoes_abertas && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, marginBottom: 12, background: C.amber + '15', border: `1px solid ${C.amber}55`, fontSize: 12.5, color: C.text }}>
                <AlertTriangle size={15} style={{ color: C.amber, flexShrink: 0 }} />
                As inscrições desta temporada já estão abertas — a janela da renovação passou (respostas pendentes foram bloqueadas).
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              {[
                { rotulo: 'Grupos ativos', valor: resumo.grupos, cor: C.text },
                { rotulo: 'Líderes alcançáveis', valor: resumo.podem_receber, cor: C.primary },
                { rotulo: 'Sem líder / sem telefone', valor: resumo.sem_lider + resumo.lider_sem_telefone, cor: (resumo.sem_lider + resumo.lider_sem_telefone) ? C.amber : C.t3 },
                { rotulo: 'Enviadas', valor: resumo.enviadas, cor: C.text },
                { rotulo: 'Sem resposta', valor: resumo.sem_resposta, cor: resumo.sem_resposta ? C.amber : C.t3 },
                { rotulo: 'Continuam', valor: resumo.continuam, cor: C.green },
                { rotulo: 'Não continuam', valor: resumo.nao_continuam, cor: resumo.nao_continuam ? C.red : C.t3 },
                { rotulo: 'Triadas', valor: resumo.triadas, cor: C.t3 },
              ].map(c => (
                <div key={c.rotulo} style={{ padding: '8px 12px', borderRadius: 10, border: `1px solid ${C.border}`, minWidth: 110 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: c.cor }}>{c.valor}</div>
                  <div style={{ fontSize: 10.5, color: C.t3 }}>{c.rotulo}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <Button onClick={disparar} disabled={disparando || !dados.whatsapp_ligado || dados.temporada?.inscricoes_abertas}>
                <Send size={14} style={{ marginRight: 6 }} />
                {disparando ? 'Enviando...' : jaDisparou
                  ? `Reenviar aos sem resposta (${resumo.sem_resposta})`
                  : `Enviar renovação aos líderes (${resumo.podem_receber})`}
              </Button>
              <button
                type="button"
                onClick={() => setMostrarGrupos(m => !m)}
                style={{ background: 'none', border: 'none', color: C.t2, fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                {mostrarGrupos ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {mostrarGrupos ? 'Esconder grupos' : `Ver grupo a grupo (${rows.length})`}
              </button>
            </div>

            {mostrarGrupos && (
              <div style={{ marginTop: 12, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
                {rows.map((r, i) => {
                  const st = REN_STATUS[r.renovacao?.status || 'sem_envio'] || REN_STATUS.sem_envio;
                  return (
                    <div key={r.grupo_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: i ? `1px solid ${C.border}` : 'none', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                          {r.grupo_nome}
                          {r.grupo_codigo && <code style={{ fontSize: 10, color: C.t3, marginLeft: 6 }}>{r.grupo_codigo}</code>}
                        </div>
                        <div style={{ fontSize: 11, color: C.t3 }}>
                          {r.lider_nome || 'Sem líder'} · {r.membros_ativos} pessoa(s)
                          {!r.pode_receber && <span style={{ color: C.amber }}> · sem WhatsApp</span>}
                        </div>
                      </div>
                      {anomala(r) && (
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: C.amber + '18', color: C.amber }}
                          title="Poucas pessoas confirmadas em relação ao tamanho do grupo — vale conferir com o líder">
                          Conferir · {r.renovacao.confirmados_count}/{r.renovacao.roster_total}
                        </span>
                      )}
                      {r.renovacao?.status === 'continua' && !anomala(r) && (
                        <span style={{ fontSize: 11, color: C.t3 }}>
                          {r.renovacao.confirmados_count} confirmadas{r.renovacao.removidos_count ? ` · ${r.renovacao.removidos_count} saíram` : ''}
                        </span>
                      )}
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: st.cor + '18', color: st.cor, whiteSpace: 'nowrap' }}>
                        {st.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Prontidão da temporada (Marcos · 20/07): checklist do que falta arrumar antes de
// ABRIR as inscrições — grupos sem líder, líder sem WhatsApp, grupos sem supervisor,
// modo de inscrição a revisar. É a ferramenta pra Naná fechar as lacunas antes de 2/8.
// Read-only: só aponta o que resolver (a correção é feita na tela de Grupos/ficha).
const SEV = {
  alta: { cor: C.red, label: 'Crítico' },
  media: { cor: C.amber, label: 'Atenção' },
  baixa: { cor: C.t3, label: 'Revisar' },
};

function ProntidaoTemporada({ temporadas }) {
  const [temporada, setTemporada] = useState(() => (temporadas.find(t => t.ativa)?.id || temporadas[0]?.id || ''));
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aberto, setAberto] = useState({});

  async function load(temp) {
    if (!temp) return;
    setLoading(true);
    try { setDados(await api.prontidaoTemporada(temp)); }
    catch (e) { toast.error(e.message || 'Erro ao carregar a prontidão'); setDados(null); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(temporada); /* eslint-disable-next-line */ }, [temporada]);

  const checks = dados?.checks || [];
  const altas = checks.filter(c => c.severidade === 'alta' && c.count > 0);
  const medias = checks.filter(c => c.severidade === 'media' && c.count > 0);
  const prontoPraAbrir = checks.length > 0 && altas.length === 0;

  return (
    <div style={{ marginTop: 22, background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <ListChecks size={17} style={{ color: C.primary }} /> Prontidão da temporada
        </h2>
        <p style={{ fontSize: 12, color: C.t3, margin: '6px 0 0', lineHeight: 1.6 }}>
          O que falta arrumar antes de <strong>abrir as inscrições</strong>. Corrija cada ponto na tela de Grupos
          (líder, supervisor, modo de inscrição) ou na ficha do líder (telefone), e recarregue pra conferir.
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
        ) : !dados ? (
          <div style={{ padding: 24, textAlign: 'center', color: C.t3, fontSize: 13 }}>Não foi possível carregar a prontidão.</div>
        ) : (
          <>
            {/* Faixa de resumo */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, marginBottom: 14,
              background: (prontoPraAbrir ? C.green : C.red) + '15',
              border: `1px solid ${(prontoPraAbrir ? C.green : C.red)}55`,
            }}>
              {prontoPraAbrir
                ? <CheckCircle2 size={18} style={{ color: C.green, flexShrink: 0 }} />
                : <AlertTriangle size={18} style={{ color: C.red, flexShrink: 0 }} />}
              <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>
                {prontoPraAbrir
                  ? <>Pronto pra abrir {dados.total_grupos} grupo(s){medias.length ? ` · ${medias.reduce((a, c) => a + c.count, 0)} ponto(s) de atenção (não bloqueiam)` : ''}.</>
                  : <>{altas.reduce((a, c) => a + c.count, 0)} ponto(s) crítico(s) a resolver antes de abrir as inscrições.</>}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {checks.map(c => {
                const sev = SEV[c.severidade] || SEV.baixa;
                const ok = c.count === 0;
                const temLista = (c.itens || []).length > 0;
                const exp = !!aberto[c.key];
                return (
                  <div key={c.key} style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
                    <button
                      type="button"
                      onClick={() => temLista && setAberto(a => ({ ...a, [c.key]: !a[c.key] }))}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                        background: 'none', border: 'none', cursor: temLista ? 'pointer' : 'default', textAlign: 'left',
                      }}
                    >
                      {ok
                        ? <CheckCircle2 size={16} style={{ color: C.green, flexShrink: 0 }} />
                        : <span style={{ width: 9, height: 9, borderRadius: '50%', background: sev.cor, flexShrink: 0 }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{c.label}</div>
                        {!ok && c.hint && <div style={{ fontSize: 11.5, color: C.t3, marginTop: 2, lineHeight: 1.5 }}>{c.hint}</div>}
                      </div>
                      <span style={{
                        fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 99, whiteSpace: 'nowrap',
                        background: ok ? C.green + '18' : sev.cor + '18', color: ok ? C.green : sev.cor,
                      }}>
                        {ok ? 'OK' : `${c.count} · ${sev.label}`}
                      </span>
                      {temLista && (exp ? <ChevronDown size={16} style={{ color: C.t3 }} /> : <ChevronRight size={16} style={{ color: C.t3 }} />)}
                    </button>
                    {temLista && exp && (
                      <div style={{ borderTop: `1px solid ${C.border}`, background: C.bg }}>
                        {c.itens.map((it, i) => (
                          <div key={it.grupo_id || i} style={{ padding: '7px 12px 7px 38px', fontSize: 12.5, color: C.t2, borderTop: i ? `1px solid ${C.border}` : 'none' }}>
                            {it.grupo_nome}{it.lider_nome ? <span style={{ color: C.t3 }}> · líder: {it.lider_nome}</span> : ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
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
  const [erroLoad, setErroLoad] = useState(false);
  const [removendo, setRemovendo] = useState({});

  async function load(temp) {
    if (!temp) return;
    setLoading(true);
    setErroLoad(false);
    try {
      const data = await api.semPresenca(temp);
      setGrupos(Array.isArray(data) ? data : []);
    } catch (e) { toast.error(e.message || 'Erro ao carregar a revisão'); setGrupos([]); setErroLoad(true); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(temporada); /* eslint-disable-next-line */ }, [temporada]);

  async function remover(grupoId, m, grupoNome) {
    if (!confirm(`Remover ${m.nome} do grupo "${grupoNome}"? Ele sai do grupo (reversível). Faça só se confirmou que a pessoa realmente não participa mais.`)) return;
    setRemovendo(s => ({ ...s, [m.participacao_id]: true }));
    try {
      await api.sairMembro(m.participacao_id, { motivo: 'Sem presença na temporada (revisão de fim de temporada)' });
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
        ) : erroLoad ? (
          <div style={{ padding: 24, background: '#FCEBEB', border: '1px dashed #F09595', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#501313', marginBottom: 4 }}>Não foi possível carregar a revisão</div>
            <div style={{ fontSize: 12, color: '#791F1F', marginBottom: 12 }}>Pode haver pessoas a revisar — a lista falhou ao carregar. NÃO trate como "está tudo em dia".</div>
            <button onClick={() => load(temporada)} style={{ background: '#E24B4A', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Tentar de novo</button>
          </div>
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
