// ============================================================================
// VinculosDuplicadosBloco · a MESMA pessoa com 2+ vínculos ativos no MESMO grupo
// ============================================================================
// Relatório de saneamento pra coordenação (pedido do Matheus, 13/08/2026,
// depois que a coluna Grupo apareceu repetindo o mesmo grupo 5× na mesma
// pessoa — linhas reais de `mem_grupo_membros`, não bug de render).
//
// ⚠️ Bloco RECOLHÍVEL dentro da aba Pessoas, não aba nova: a Caixa de entrada
// dos Grupos já provou que separar em aba faz ninguém achar. O cabeçalho carrega
// a contagem, então recolhido não esconde que existe trabalho.
//
// ⚠️ NÃO confundir com a aba "Duplicatas", que é sobre PESSOAS duplicadas (dois
// cadastros pra a mesma gente). Aqui a pessoa é UMA — o que sobra é linha de
// vínculo.
//
// ⚠️ Remover NÃO é "sair do grupo": o servidor faz soft-delete da linha, porque
// a pessoa não saiu de lugar nenhum — a linha é que não devia existir. Usar
// `saiu_em` fabricaria um evento "saiu do grupo" no histórico do grupo.
// ============================================================================

import { useState, useCallback } from 'react';
import { grupos as api } from '../../api';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, AlertTriangle, Layers } from 'lucide-react';

const C = {
  card: 'var(--cbrio-card)', text: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)',
  t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)', bg: 'var(--cbrio-bg)',
  primary: '#00B39D', amber: '#f59e0b', red: '#ef4444',
};

const fmtData = (d) => {
  if (!d) return null;
  try { return new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR'); }
  catch { return d; }
};

const FUNCAO_LABEL = {
  coordenador: 'Coordenador', supervisor: 'Supervisor', lider: 'Líder',
  co_lider: 'Co-líder', lider_treinamento: 'Em treinamento',
  frequentador: 'Membro', membro: 'Membro', visitante: 'Visitante',
};

export default function VinculosDuplicadosBloco({ podeResolver = false, onResolvido }) {
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  // Linha escolhida por caso (default = a sugestão do servidor)
  const [escolha, setEscolha] = useState({});
  const [processando, setProcessando] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('');
    try {
      const r = await api.vinculosDuplicados.list();
      setDados(r);
      const inicial = {};
      (r?.casos || []).forEach(c => { inicial[`${c.membro_id}|${c.grupo_id}`] = c.sugestao_manter_id; });
      setEscolha(inicial);
    } catch (e) {
      // ⚠️ Erro tem estado PRÓPRIO: "nenhum vínculo duplicado" é a leitura errada
      // de uma consulta que falhou, e aqui ela levaria a coordenação a achar que
      // o saneamento acabou.
      setErro(e?.message || 'Não foi possível levantar os vínculos duplicados.');
      setDados(null);
    } finally { setCarregando(false); }
  }, []);

  const alternar = () => {
    const proximo = !aberto;
    setAberto(proximo);
    if (proximo && !dados && !carregando) carregar();
  };

  const resolver = async (caso) => {
    const chave = `${caso.membro_id}|${caso.grupo_id}`;
    const manterId = escolha[chave] || caso.sugestao_manter_id;
    const removerIds = caso.linhas.map(l => l.id).filter(id => id !== manterId);
    if (!removerIds.length) return;

    const nomes = caso.linhas.length;
    const ok = window.confirm(
      `Manter 1 vínculo de ${caso.membro_nome} em "${caso.grupo_nome}" e remover ${removerIds.length} de ${nomes}?\n\n`
      + 'A pessoa CONTINUA no grupo. O que sai são as linhas repetidas.',
    );
    if (!ok) return;

    setProcessando(chave);
    try {
      const r = await api.vinculosDuplicados.resolver(manterId, removerIds);
      if (r?.falhas?.length) {
        toast.warning(`${r.removidos.length} removidas, ${r.falhas.length} falharam. Recarregue o relatório.`);
      } else {
        toast.success(`${r.removidos.length} vínculo${r.removidos.length !== 1 ? 's' : ''} repetido${r.removidos.length !== 1 ? 's' : ''} removido${r.removidos.length !== 1 ? 's' : ''}.`);
      }
      // Tira o caso da lista sem refazer a varredura inteira (a régua da aba
      // Entradas: ação já confirmada pelo servidor não refaz a busca).
      setDados(d => d && ({
        ...d,
        casos: d.casos.filter(c => `${c.membro_id}|${c.grupo_id}` !== chave),
        total_casos: Math.max(0, (d.total_casos || 1) - 1),
      }));
      onResolvido?.();
    } catch (e) {
      toast.error(e?.message || 'Erro ao resolver o vínculo duplicado.');
    } finally { setProcessando(null); }
  };

  const total = dados?.total_casos ?? null;

  return (
    <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, marginBottom: 12, overflow: 'hidden' }}>
      <button
        onClick={alternar}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <Layers size={15} color={C.t3} />
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
          Vínculos duplicados
        </span>
        <span style={{ fontSize: 11.5, color: C.t3 }}>
          mesma pessoa, mais de uma vez no mesmo grupo
        </span>
        {total != null && total > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: `${C.amber}20`, color: '#92400e' }}>
            {total}
          </span>
        )}
        <span style={{ marginLeft: 'auto', color: C.t3, display: 'inline-flex' }}>
          {aberto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {aberto && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: 16 }}>
          {carregando && <div style={{ color: C.t3, fontSize: 13 }}>Levantando…</div>}

          {!carregando && erro && (
            <div style={{ padding: 12, borderRadius: 10, background: `${C.red}12`, border: `1px solid ${C.red}33`, color: C.text, fontSize: 12.5 }}>
              {erro}{' '}
              <button onClick={carregar} style={{ background: 'none', border: 'none', padding: 0, color: C.primary, cursor: 'pointer', fontWeight: 700 }}>
                Tentar de novo
              </button>
            </div>
          )}

          {!carregando && !erro && dados && dados.total_casos === 0 && (
            <div style={{ color: C.t3, fontSize: 13 }}>
              Nenhum vínculo duplicado. Cada pessoa aparece uma vez por grupo.
            </div>
          )}

          {!carregando && !erro && dados && dados.total_casos > 0 && (
            <>
              <div style={{ fontSize: 12.5, color: C.t2, marginBottom: 12, lineHeight: 1.5 }}>
                <strong>{dados.total_casos}</strong> caso{dados.total_casos !== 1 ? 's' : ''} ·{' '}
                <strong>{dados.total_linhas_extras}</strong> linha{dados.total_linhas_extras !== 1 ? 's' : ''} a mais do que deveria ·{' '}
                <strong>{dados.pessoas_afetadas}</strong> pessoa{dados.pessoas_afetadas !== 1 ? 's' : ''} em{' '}
                <strong>{dados.grupos_afetados}</strong> grupo{dados.grupos_afetados !== 1 ? 's' : ''}.
                <div style={{ color: C.t3, marginTop: 4 }}>
                  A pessoa <strong>continua no grupo</strong> — o que sai são as linhas repetidas.
                  A frequência dos encontros não muda (ela é contada por pessoa, não por linha);
                  o que muda é a coluna “Presenças” desta aba, que hoje soma as repetições.
                </div>
                {dados.truncado && (
                  <div style={{ marginTop: 6, color: '#92400e' }}>
                    Mostrando os {dados.exibidos} primeiros de {dados.total_casos}. Resolva estes e recarregue.
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {dados.casos.map(caso => {
                  const chave = `${caso.membro_id}|${caso.grupo_id}`;
                  const manterId = escolha[chave] || caso.sugestao_manter_id;
                  const ocupado = processando === chave;
                  return (
                    <div key={chave} style={{ border: `1px solid ${caso.exige_atencao ? `${C.amber}55` : C.border}`, borderRadius: 10, padding: 12, background: C.bg }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{caso.membro_nome}</span>
                        <span style={{ fontSize: 12, color: C.t3 }}>em</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.t2 }}>{caso.grupo_nome}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: `${C.primary}14`, color: C.primary }}>
                          {caso.linhas.length} linhas
                        </span>
                        {caso.exige_atencao && (
                          <span title="Mais de uma linha tem presença lançada — confira antes de escolher qual manter."
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: `${C.amber}20`, color: '#92400e' }}>
                            <AlertTriangle size={11} /> confira
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {caso.linhas.map(l => {
                          const marcada = l.id === manterId;
                          return (
                            <label key={l.id}
                              style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 8, cursor: podeResolver ? 'pointer' : 'default', background: marcada ? `${C.primary}10` : 'transparent', border: `1px solid ${marcada ? `${C.primary}44` : C.border}` }}>
                              <input
                                type="radio"
                                name={`manter-${chave}`}
                                checked={marcada}
                                disabled={!podeResolver || ocupado}
                                onChange={() => setEscolha(e => ({ ...e, [chave]: l.id }))}
                                style={{ accentColor: C.primary }}
                              />
                              <span style={{ fontSize: 12, color: C.text, fontWeight: marcada ? 700 : 500 }}>
                                {FUNCAO_LABEL[l.funcao] || l.funcao || 'Membro'}
                              </span>
                              <span style={{ fontSize: 11.5, color: C.t3 }}>
                                {l.entrou_em ? `desde ${fmtData(l.entrou_em)}` : 'sem data de entrada'}
                                {' · '}
                                {l.presencas || 0} presença{(l.presencas || 0) !== 1 ? 's' : ''}
                              </span>
                              {marcada && (
                                <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, color: C.primary }}>
                                  {l.id === caso.sugestao_manter_id ? 'MANTER · sugerido' : 'MANTER'}
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>

                      {podeResolver ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 9, flexWrap: 'wrap' }}>
                          <button
                            onClick={() => resolver(caso)}
                            disabled={ocupado}
                            style={{ background: C.primary, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: ocupado ? 'default' : 'pointer', opacity: ocupado ? 0.6 : 1 }}
                          >
                            {ocupado ? 'Removendo…' : `Remover as outras ${caso.linhas.length - 1}`}
                          </button>
                          <span style={{ fontSize: 11.5, color: C.t3 }}>
                            {caso.presencas_fora_da_sugestao > 0 && manterId === caso.sugestao_manter_id
                              ? `sai ${caso.presencas_fora_da_sugestao} do contador de presenças`
                              : 'a pessoa continua no grupo'}
                          </span>
                        </div>
                      ) : (
                        <div style={{ marginTop: 9, fontSize: 11.5, color: C.t3 }}>
                          Somente leitura — remover vínculo exige nível 4 no módulo Grupos.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <button onClick={carregar} style={{ marginTop: 12, background: 'none', border: 'none', padding: 0, color: C.primary, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                Recarregar relatório
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
