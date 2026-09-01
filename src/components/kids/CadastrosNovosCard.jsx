// ════════════════════════════════════════════════════════════════════════════
//  "Quantas crianças novas?" — card do módulo Kids (31/08/2026)
//
//  Pedido do Matheus: ele perguntou quantos cadastros saíram no domingo e, com
//  o número na mão, pediu a funcionalidade dentro do módulo. Medido no dia:
//  **28 no domingo 30/08** (18 visitantes · 10 membros) contra 14 no anterior.
//
//  ⚠️ Quem conta é o servidor (`/totem-kids/cadastros-novos`), em BRT. Recontar
//  aqui daria uma segunda régua para o mesmo número — e a divergência
//  apareceria como "o card diz 28 e a lista mostra 27".
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { totemKids as api } from '../../api';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { Baby, Loader2, ArrowRight, AlertTriangle, CalendarRange, X } from 'lucide-react';
// ⚠️ LEI da casa: DatePicker do sistema, NUNCA <input type="date"> nativo.
import { DatePicker } from '../ui/date-picker';

const PERIODOS = [
  { dias: 7, rotulo: '7 dias' },
  { dias: 30, rotulo: '30 dias' },
  { dias: 90, rotulo: '90 dias' },
];

// O "hoje" do fuso da igreja — teto dos seletores. ⚠️ Em UTC, das 21h do Rio em
// diante o dia já virou, e o calendário bloquearia o domingo que acabou de
// acontecer (justamente o dia que a equipe quer consultar na segunda de manhã).
function hojeBrt() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function diaCurto(iso) {
  // ⚠️ Fatia a string: `new Date('2026-08-30')` é meia-noite UTC = 29/08 no Rio,
  // e o rótulo mostraria o dia anterior (a mesma armadilha do resto do sistema).
  const [, m, d] = String(iso || '').split('-');
  return m && d ? `${d}/${m}` : '';
}

function idade(nascimento) {
  if (!nascimento) return null;
  const [a, m, d] = String(nascimento).split('-').map(Number);
  if (!a) return null;
  const hoje = new Date();
  let anos = hoje.getFullYear() - a;
  const passou = hoje.getMonth() + 1 > m || (hoje.getMonth() + 1 === m && hoje.getDate() >= d);
  if (!passou) anos -= 1;
  return anos >= 0 ? anos : null;
}

export default function CadastrosNovosCard() {
  const navigate = useNavigate();
  const [dias, setDias] = useState(30);
  // Período LIVRE (pedido do Matheus · 31/08/2026). `null` nas duas pontas =
  // usando os chips de janela móvel.
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [abrirPeriodo, setAbrirPeriodo] = useState(false);
  // "Quais foram" — a lista nominal dos visitantes do período.
  const [verVisitantes, setVerVisitantes] = useState(false);
  const [d, setD] = useState(null);
  const [erro, setErro] = useState(null);
  const [loading, setLoading] = useState(true);

  // ⚠️ Declarado ANTES do useEffect: array de deps avalia NO RENDER, e const
  // usada ali tem de existir antes (lição TDZ do sweep dos formulários).
  const livre = Boolean(de && ate);

  useEffect(() => {
    let vivo = true;
    setLoading(true); setErro(null);
    // ⚠️ Só manda o período quando as DUAS pontas existem: uma ponta só faria o
    // servidor cair na janela móvel e a tela mostraria um recorte diferente do
    // que os campos dizem.
    api.cadastrosNovos(livre ? { inicio: de, fim: ate } : { dias })
      .then((r) => { if (vivo) setD(r); })
      // ⚠️ Erro NÃO vira zero: "ninguém foi cadastrado" e "a consulta falhou"
      // levam a decisões opostas.
      .catch((e) => { if (vivo) { setErro(e?.message || 'Não deu para carregar'); setD(null); } })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [dias, de, ate, livre]);

  const r = d?.resumo || {};
  const serie = d?.serie || [];
  const pico = Math.max(1, ...serie.map((p) => p.total));

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="font-semibold text-sm flex items-center gap-2">
          <Baby className="h-4 w-4 text-fuchsia-500" /> Cadastros de crianças
        </div>
        <div className="flex gap-1 items-center">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              onClick={() => { setDe(''); setAte(''); setAbrirPeriodo(false); setDias(p.dias); }}
              className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                !livre && dias === p.dias ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent/40'
              }`}
            >{p.rotulo}</button>
          ))}
          <button
            onClick={() => setAbrirPeriodo((v) => !v)}
            title="Escolher um período"
            className={`rounded-full px-2.5 py-1 text-[11px] transition-colors inline-flex items-center gap-1 ${
              livre ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent/40'
            }`}
          ><CalendarRange className="h-3 w-3" /> período</button>
        </div>
      </div>

      {abrirPeriodo && (
        <div className="mb-3 rounded-lg border border-border bg-foreground/[0.03] p-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">De</label>
            <DatePicker value={de} onChange={setDe} placeholder="Início" max={hojeBrt()} />
          </div>
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">Até</label>
            {/* ⚠️ `min={de}` impede o intervalo invertido na origem: o servidor
                recusa (cai na janela padrão), mas oferecer uma data que não vale
                é o que faz a pessoa achar que filtrou e ver outro número. */}
            <DatePicker value={ate} onChange={setAte} placeholder="Fim" min={de || undefined} max={hojeBrt()} />
          </div>
          {livre && (
            <button
              onClick={() => { setDe(''); setAte(''); }}
              className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 pb-2"
            ><X className="h-3 w-3" /> limpar</button>
          )}
          {/* ⚠️ Uma ponta só NÃO filtra — e a tela DIZ isso, senão a pessoa
              preenche "De", vê o número dos 30 dias e acha que filtrou. */}
          {(de || ate) && !livre && (
            <p className="text-[11px] text-amber-600 basis-full">
              Preencha as duas datas para filtrar — com uma só, o número continua sendo o do período selecionado acima.
            </p>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : erro ? (
        <p className="py-3 text-center text-sm text-amber-600 dark:text-amber-400">{erro}</p>
      ) : (
        <>
          {/* ⚠️ ONTEM em destaque: é o número que a equipe olha na segunda de
              manhã, depois do culto de domingo. */}
          <div className="flex items-end gap-6 flex-wrap">
            <div>
              <div className="text-3xl font-bold leading-none tabular-nums">{d?.ontem ?? 0}</div>
              <div className="text-[11px] text-muted-foreground mt-1">ontem</div>
            </div>
            <div>
              <div className="text-2xl font-semibold leading-none tabular-nums text-muted-foreground">{d?.hoje ?? 0}</div>
              <div className="text-[11px] text-muted-foreground mt-1">hoje</div>
            </div>
            <div className="border-l border-border pl-6">
              <div className="text-2xl font-semibold leading-none tabular-nums">{r.total ?? 0}</div>
              <div className="text-[11px] text-muted-foreground mt-1">em {d?.janela?.rotulo || `${dias} dias`}</div>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {/* ⚠️ O chip de visitantes é BOTÃO: "quantos visitantes tive E QUAIS
                  foram" é uma pergunta só, e o número sem o caminho para os nomes
                  obriga a pessoa a ir procurar noutra tela. */}
              {r.visitantes > 0 && (
                <button
                  onClick={() => setVerVisitantes((v) => !v)}
                  className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                    verVisitantes ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:border-primary/40'
                  }`}
                >{r.visitantes} visitante{r.visitantes === 1 ? '' : 's'} · {verVisitantes ? 'ocultar' : 'quais'}</button>
              )}
              {r.membros > 0 && <Badge variant="outline" className="text-[10px]">{r.membros} membro{r.membros === 1 ? '' : 's'}</Badge>}
              {/* ⚠️ `visitante` nulo é um TERCEIRO estado, não membro. */}
              {r.sem_marcacao > 0 && <Badge variant="outline" className="text-[10px] border-muted-foreground/40">{r.sem_marcacao} sem marcação</Badge>}
            </div>
          </div>

          {/* Série por dia — o padrão que ela mostra é que a entrada acontece no
              DOMINGO. Dia vazio aparece como barra zerada, de propósito. */}
          {serie.length > 1 && (
            <div className="mt-4 flex items-end gap-[3px] h-16" aria-hidden="true">
              {serie.map((p) => (
                <div key={p.dia} className="flex-1 min-w-[2px] rounded-t bg-primary/70"
                  style={{ height: `${Math.max(2, (p.total / pico) * 100)}%` }}
                  title={`${diaCurto(p.dia)} · ${p.total}`} />
              ))}
            </div>
          )}

          {/* ⚠️⚠️ IMPORT DECLARADO. Medido em 31/08/2026: o dia 30/06 tem 3.381
              cadastros num único dia (import do Planning Center), 3.169 deles
              marcados "visitante". Eles NÃO contam como visitante que apareceu
              na igreja — e sem esta linha a diferença entre este card e a lista
              de crianças fica inexplicável. */}
          {r.importadas > 0 && (
            <p className="mt-3 text-[11px] text-amber-600 dark:text-amber-400">
              + {r.importadas.toLocaleString('pt-BR')} do import do Planning Center neste período
              {r.importadas_visitante > 0 ? ` (${r.importadas_visitante.toLocaleString('pt-BR')} marcados como visitante)` : ''}
              {' '}— não contam acima, porque não foram cadastros feitos no culto.
            </p>
          )}

          {/* ⚠️ O fim pedido foi encurtado pra hoje: o número é de um período
              menor do que a pessoa digitou, e isso tem que estar dito. */}
          {d?.janela?.fim_ajustado && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              O período foi encurtado até hoje ({d.janela.rotulo}) — dia futuro não tem cadastro para contar.
            </p>
          )}

          {/* ── "Quais foram" · os visitantes do período, nominal ───────────── */}
          {verVisitantes && (
            <div className="mt-3 rounded-lg border border-border bg-foreground/[0.03] p-3">
              <div className="text-[11px] text-muted-foreground mb-2">
                Visitantes cadastrados em {d?.janela?.rotulo || `${dias} dias`}
              </div>
              {(d?.visitantes || []).length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Nenhum visitante neste período.</p>
              ) : (
                <>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {d.visitantes.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => navigate(`/ministerial/totem-kids/criancas?crianca=${c.id}`)}
                        className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1.5 text-left text-xs hover:border-primary/40 transition-colors"
                      >
                        <span className="truncate">
                          {c.nome}
                          {idade(c.data_nascimento) != null && (
                            <span className="text-muted-foreground"> · {idade(c.data_nascimento)}a</span>
                          )}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{diaCurto(c.dia)}</span>
                      </button>
                    ))}
                  </div>
                  {/* ⚠️ Teto DECLARADO: "100" não pode se ler como "foram só 100". */}
                  {d.visitantes_truncado && (
                    <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
                      Mostrando os 100 mais recentes de {d.visitantes_total?.toLocaleString('pt-BR')} visitantes do período.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* ⚠️ O que ficou INCOMPLETO é declarado: criança sem responsável não
              pode ser retirada por ninguém no domingo seguinte. */}
          {(r.sem_responsavel > 0 || r.apagadas > 0) && (
            <div className="mt-3 flex flex-wrap gap-3 text-[11px]">
              {r.sem_responsavel > 0 && (
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-3 w-3" /> {r.sem_responsavel} sem responsável
                </span>
              )}
              {r.apagadas > 0 && (
                <span className="text-muted-foreground">{r.apagadas} cadastro{r.apagadas === 1 ? '' : 's'} apagado{r.apagadas === 1 ? '' : 's'} no período</span>
              )}
            </div>
          )}

          {(d?.criancas || []).length > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Mais recentes</span>
                <button onClick={() => navigate('/ministerial/totem-kids/criancas')}
                  className="text-xs text-primary inline-flex items-center gap-1">
                  ver todas <ArrowRight className="h-3 w-3" />
                </button>
              </div>
              <div className="space-y-1.5">
                {d.criancas.slice(0, 6).map((c) => {
                  const anos = idade(c.data_nascimento);
                  return (
                    <div key={c.id} className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground tabular-nums w-10 shrink-0">{diaCurto(c.dia)}</span>
                      <span className="font-medium truncate flex-1">{c.nome}</span>
                      {anos != null && <span className="text-muted-foreground shrink-0">{anos}a</span>}
                      {c.visitante && <Badge variant="secondary" className="text-[10px] shrink-0">visitante</Badge>}
                      {!c.tem_responsavel && (
                        <Badge variant="outline" className="text-[10px] shrink-0 border-amber-500/40 text-amber-600 dark:text-amber-400">sem responsável</Badge>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* ⚠️ Truncamento DECLARADO: "6 de 28" nunca vira "foram 6". */}
              {d.criancas.length > 6 && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  mostrando 6 de {d.mostrando}{d.truncado ? '+' : ''} no período
                </p>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
