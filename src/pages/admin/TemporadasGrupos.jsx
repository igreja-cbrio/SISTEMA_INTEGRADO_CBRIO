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
import { Calendar, Lock, Unlock, CheckCircle2, Archive } from 'lucide-react';

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
    </div>
  );
}
