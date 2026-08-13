import { useMemo } from 'react';
import { feriadosPorData } from '../../lib/feriadosBrasil';
import { C, cardStyle, hint, MESES_LONGOS, fmtBRL } from './comum';

// Calendário consolidado do ANO do ciclo · 12 meses em grade.
// Existe mesmo com zero propostas: mostra os feriados nacionais (fixos e
// móveis) desde o primeiro dia do planejamento, que é o pano de fundo pra
// decidir QUANDO marcar cada coisa. Itens do ciclo entram por cima.
//
// Precisão importa: proposta com precisão 'mes' NÃO pinta dia nenhum — ela
// aparece na faixa do mês (o spec chama isso de concentração, não colisão).

const DIAS_CABECALHO = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function diasDoMes(ano, mes) {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}
function diaDaSemana(ano, mes, dia) {
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}
const isoDe = (ano, mes, dia) =>
  `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

const CORES_NATUREZA = { evento: C.blue, projeto: C.purple, rotina: C.primary };

export default function CalendarioAno({ ano, itens = [] }) {
  const feriados = useMemo(() => feriadosPorData(ano), [ano]);

  // Índices: dia exato (precisão 'dia') e faixa do mês (precisão 'mes')
  const { porDia, porMes } = useMemo(() => {
    const porDia = {};
    const porMes = {};
    for (const p of itens) {
      if (!p?.data_inicio) continue;
      const mes = parseInt(String(p.data_inicio).slice(5, 7), 10);
      const mesFim = p.multi_dia && p.data_fim
        ? parseInt(String(p.data_fim).slice(5, 7), 10) : mes;
      for (let m = mes; m <= mesFim && m <= 12; m += 1) {
        (porMes[m] = porMes[m] || []).push(p);
      }
      if (p.precisao_inicio === 'dia') {
        (porDia[String(p.data_inicio).slice(0, 10)] = porDia[String(p.data_inicio).slice(0, 10)] || []).push(p);
      }
    }
    return { porDia, porMes };
  }, [itens]);

  const totalLiquido = itens.reduce(
    (s, p) => s + Math.max(Number(p.custo || 0) - (p.tem_arrecadacao ? Number(p.arrecadacao_prevista || 0) : 0), 0), 0);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: C.t2 }}>
        <strong style={{ fontSize: 14, color: C.text }}>Ano {ano}</strong>
        <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: C.red, marginRight: 5 }} />feriado nacional</span>
        <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: C.blue, marginRight: 5 }} />evento</span>
        <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: C.purple, marginRight: 5 }} />projeto</span>
        <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: C.primary, marginRight: 5 }} />rotina</span>
        <span style={{ marginLeft: 'auto', color: C.t3 }}>
          {itens.length} item(ns) no calendário · líquido {fmtBRL(totalLiquido)}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
        {MESES_LONGOS.map((nomeMes, i) => {
          const mes = i + 1;
          const total = diasDoMes(ano, mes);
          const offset = diaDaSemana(ano, mes, 1);
          const doMes = porMes[mes] || [];
          const mensais = doMes.filter((p) => p.precisao_inicio !== 'dia'
            || parseInt(String(p.data_inicio).slice(5, 7), 10) !== mes);

          return (
            <div key={nomeMes} style={{ ...cardStyle, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <strong style={{ fontSize: 13, color: C.text }}>{nomeMes}</strong>
                {doMes.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.primary }}>{doMes.length}</span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                {DIAS_CABECALHO.map((d, j) => (
                  <div key={j} style={{ fontSize: 9.5, color: C.t3, textAlign: 'center', fontWeight: 700 }}>{d}</div>
                ))}
                {Array.from({ length: offset }).map((_, j) => <div key={`v${j}`} />)}
                {Array.from({ length: total }).map((_, j) => {
                  const dia = j + 1;
                  const data = isoDe(ano, mes, dia);
                  const fer = feriados[data];
                  const eventosDoDia = porDia[data] || [];
                  const dow = diaDaSemana(ano, mes, dia);
                  const domingo = dow === 0;
                  const titulo = [
                    ...(fer || []).map((f) => f.nome),
                    ...eventosDoDia.map((p) => p.nome),
                  ].join(' · ');

                  return (
                    <div
                      key={dia}
                      title={titulo || undefined}
                      style={{
                        position: 'relative', textAlign: 'center', fontSize: 10.5, lineHeight: '20px',
                        height: 20, borderRadius: 4, cursor: titulo ? 'help' : 'default',
                        color: fer ? C.red : domingo ? C.t3 : C.text,
                        fontWeight: fer || eventosDoDia.length ? 700 : 400,
                        background: fer ? '#ef444418' : eventosDoDia.length ? `${C.primary}14` : 'transparent',
                      }}
                    >
                      {dia}
                      {eventosDoDia.length > 0 && (
                        <span style={{
                          position: 'absolute', bottom: 1, left: '50%', transform: 'translateX(-50%)',
                          display: 'flex', gap: 1,
                        }}>
                          {eventosDoDia.slice(0, 3).map((p, k) => (
                            <span key={k} style={{
                              width: 4, height: 4, borderRadius: '50%',
                              background: CORES_NATUREZA[p.natureza] || C.primary,
                            }} />
                          ))}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {(fer0(feriados, ano, mes).length > 0 || mensais.length > 0) && (
                <div style={{ marginTop: 7, borderTop: '1px solid var(--hairline)', paddingTop: 6, display: 'grid', gap: 3 }}>
                  {fer0(feriados, ano, mes).map((f) => (
                    <div key={f.data} style={{ fontSize: 10.5, color: C.red }}>
                      {String(f.data).slice(8, 10)} · {f.nome}
                    </div>
                  ))}
                  {mensais.map((p) => (
                    <div key={p.id + '-' + mes} style={{ fontSize: 10.5, color: C.t2 }}>
                      <span style={{
                        display: 'inline-block', width: 6, height: 6, borderRadius: '50%', marginRight: 5,
                        background: CORES_NATUREZA[p.natureza] || C.primary,
                      }} />
                      {p.nome} <span style={{ color: C.t3 }}>(mês)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!itens.length && (
        <p style={{ ...hint, margin: 0 }}>
          Nenhuma proposta no calendário ainda — a grade acima já mostra os feriados nacionais de {ano}
          (incluindo os móveis, calculados a partir da Páscoa) como pano de fundo do planejamento.
          Propostas aprovadas aparecem aqui: com dia definido viram marcador no dia; só com o mês,
          entram na lista do rodapé do mês.
        </p>
      )}
    </div>
  );
}

// Feriados de um mês específico, ordenados (helper local · evita recomputar o índice)
function fer0(indice, ano, mes) {
  const prefixo = `${ano}-${String(mes).padStart(2, '0')}-`;
  return Object.keys(indice)
    .filter((d) => d.startsWith(prefixo))
    .sort()
    .map((d) => indice[d][0]);
}
