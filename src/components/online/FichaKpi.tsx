// "De onde sai esse número?" — a ficha de um KPI.
//
// Pedido do Matheus (23/09/2026): *"a renata ta tendo muitas duvidas, por
// exemplo, ela perguntou desde quando esse kpi ta medindo, qual a periodicidade
// dele, de onde sai os dados que alimenta ele e etc. Queria que tivesse uma
// funcionalidade para eu clicar nos cards de cada kpi e ter essas informacoes."*
//
// ⚠️⚠️ A ficha DIAGNOSTICA, não só descreve. Medido em 23/09: **22 KPIs ativos
// apontam para um tipo de dado que não tem cálculo implementado** — o ONL-18
// mostra "0 · Crítico" não porque ninguém treina, mas porque a conta não
// existe. Sem dizer isso, a área lê o zero como fracasso dela.
import { useEffect, useState } from 'react';
import { painelArea } from '../../api';
import { Badge } from '@/components/ui/badge';
import { Loader2, X, Database, CalendarClock, Target, AlertTriangle, Info, Table2 } from 'lucide-react';

type Procedencia = {
  kpi_id: string; indicador: string | null; area: string | null;
  periodicidade: string | null; quando: string | null;
  meta: string | number | null; sentido_meta: string | null; automatico: boolean;
  como_calcula: string | null; tipo_calculo: string;
  dado_tipo: string | null; fonte: string | null; conta: string | null;
  ressalva: string | null; sem_implementacao: boolean;
  desde: string | null; ate: string | null; periodos_medidos: number; nunca_mediu: boolean;
  rotulo_partes: { numerador: string; denominador: string } | null;
  fonte_auto: string | null; conta_generica: boolean;
  meta_efetiva: number | null; meta_periodo: number | null; meta_divergente: boolean;
  serie?: Serie;
};

type LinhaSerie = {
  periodo: string; numerador: number | null; denominador: number | null;
  valor: number | null; valor_gravado: number | null; divergente: boolean;
};
type Serie = { tem_partes: boolean; linhas: LinhaSerie[]; divergencias: number };

export default function FichaKpi({ kpiId, onClose }: { kpiId: string; onClose: () => void }) {
  const [d, setD] = useState<Procedencia | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    painelArea.procedenciaKpi(kpiId)
      .then((r: Procedencia) => { if (vivo) setD(r); })
      .catch((e: unknown) => { if (vivo) setErro(e instanceof Error ? e.message : 'Não foi possível carregar'); });
    return () => { vivo = false; };
  }, [kpiId]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={onClose}>
      <div className="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto rounded-t-xl sm:rounded-xl bg-card border border-border shadow-xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 p-4 border-b border-border sticky top-0 bg-card">
          <div className="min-w-0">
            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{kpiId}</div>
            <h3 className="text-sm font-semibold leading-tight mt-0.5">{d?.indicador || 'Carregando…'}</h3>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        {!d && !erro && (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground justify-center">
            <Loader2 className="size-4 animate-spin" /> Lendo a ficha…
          </div>
        )}
        {erro && <p className="p-4 text-sm text-destructive">{erro}</p>}

        {d && (
          <div className="p-4 space-y-4 text-sm">
            {/* ⚠️ O diagnóstico vem PRIMEIRO: se o cálculo não existe, todo o
                resto da ficha é contexto de um número que nunca vai mudar. */}
            {d.sem_implementacao && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3">
                <AlertTriangle className="size-4 text-destructive mt-0.5 shrink-0" />
                <span>
                  <strong>Este indicador não está sendo calculado.</strong> Ele está configurado como
                  automático, mas o tipo de dado <code className="text-xs">{d.dado_tipo}</code> não tem
                  cálculo implementado no sistema. O valor que aparece no card não vai mudar sozinho —
                  não é um retrato da área.
                </span>
              </div>
            )}

            <Secao icone={Info} titulo="O que este número conta">
              {d.conta || (d.automatico
                ? 'Sem descrição cadastrada para este tipo de dado.'
                : 'Preenchido à mão pela área — o sistema não calcula.')}
            </Secao>

            <Secao icone={Database} titulo="De onde sai">
              {d.fonte
                ? <code className="text-xs break-all">{d.fonte}</code>
                : d.automatico
                  ? <span className="text-muted-foreground">Fonte não cadastrada.</span>
                  : <span className="text-muted-foreground">Nenhuma — é preenchimento manual.</span>}
              {d.como_calcula && <p className="text-xs text-muted-foreground mt-1">{d.como_calcula}</p>}
            </Secao>

            <Secao icone={CalendarClock} titulo="Desde quando e com que frequência">
              {/* ⚠️ "desde" é o primeiro PERÍODO com valor, não a data de
                  cadastro do indicador — confundir os dois é o erro que já fez
                  um agente acusar 42 voluntários ativos. */}
              {d.nunca_mediu
                ? <span className="text-amber-700 dark:text-amber-500">Nunca teve valor registrado.</span>
                : <>Mede desde <strong>{d.desde}</strong>{d.ate ? <> até <strong>{d.ate}</strong></> : null}
                   {' · '}{d.periodos_medidos} período(s) com valor</>}
              {d.quando && <p className="text-xs text-muted-foreground mt-1">Apurado {d.quando}.</p>}
            </Secao>

            {/* ⚠️⚠️ A TABELA MÊS A MÊS — pedido do Matheus (23/09/2026): ver o
                número INTEIRO, não só o resultado. "37,7%" não diz nada; "23 de
                61 escalas" diz tudo. */}
            {d.serie && d.serie.linhas.length > 0 && (
              <Secao icone={Table2} titulo="Mês a mês">
                <TabelaSerie serie={d.serie} rotulos={d.rotulo_partes} />
              </Secao>
            )}

            {d.meta !== null && d.meta !== undefined && (
              <Secao icone={Target} titulo="Meta">
                {/* ⚠️⚠️ Quando a meta efetiva diverge da nominal, quem manda é a
                    efetiva — é ela que pinta o card. Mostrar só a nominal fazia
                    o ONL-11 exibir "Meta 30" ao lado de um valor de 1.032. */}
                {d.meta_divergente && d.meta_efetiva !== null ? (
                  <>
                    <strong>{fmt(d.meta_periodo)}</strong> por período
                    <p className="text-xs text-muted-foreground mt-1">
                      Meta do ciclo: {fmt(d.meta_efetiva)} · dividida pelos períodos.
                      O valor cadastrado no indicador ({String(d.meta)}) não é o que o farol usa.
                    </p>
                  </>
                ) : String(d.meta)}
                {d.sentido_meta === 'maior_melhor' && <span className="text-muted-foreground"> · quanto maior, melhor</span>}
                {d.sentido_meta === 'menor_melhor' && <span className="text-muted-foreground"> · quanto menor, melhor</span>}
              </Secao>
            )}

            {/* ⚠️ A ressalva fica no fim mas em destaque: é o que explica um
                número baixo sem que a área conclua que está indo mal. */}
            {d.ressalva && (
              <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3">
                <AlertTriangle className="size-4 mt-0.5 shrink-0 text-amber-600" />
                <span className="text-xs">{d.ressalva}</span>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5 pt-1">
              <Badge variant="outline" className="text-[10px]">{d.automatico ? 'automático' : 'manual'}</Badge>
              {d.periodicidade && <Badge variant="outline" className="text-[10px]">{d.periodicidade}</Badge>}
              {d.area && <Badge variant="outline" className="text-[10px]">{d.area}</Badge>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ⚠️⚠️ A tabela mostra o valor RECALCULADO AGORA, e marca onde o card ficou
// para trás. Medido em 23/09/2026 no ONL-17: agosto está gravado como 24,14% e
// ao vivo é 60,66% (37 de 61), porque a Ariel lançou check-in retroativo DEPOIS
// da apuração das 07:01. Sem essa marca, a tabela contradiz o card na cara da
// pessoa e ninguém sabe qual dos dois acreditar.
function fmt(n: number | null): string {
  return n === null || n === undefined ? '—' : n.toLocaleString('pt-BR');
}

function TabelaSerie({ serie, rotulos }: {
  serie: Serie; rotulos: { numerador: string; denominador: string } | null;
}) {
  const comPartes = serie.tem_partes && !!rotulos;
  return (
    <div>
      {/* Tabela rola sozinha — a página nunca rola de lado. */}
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-muted-foreground border-b border-border">
              <th className="text-left font-medium py-1 pr-2">mês</th>
              {comPartes && <th className="text-right font-medium py-1 px-2">{rotulos!.denominador}</th>}
              {comPartes && <th className="text-right font-medium py-1 px-2">{rotulos!.numerador}</th>}
              {/* ⚠️ cabeçalho e célula seguem a MESMA ordem (denominador, depois
                  numerador) — no check-in isso é "escalas · com check-in", no DS
                  é "semana anterior · DS da semana". Trocar um sem o outro
                  inverteria a tabela em silêncio. */}
              <th className="text-right font-medium py-1 pl-2">%</th>
            </tr>
          </thead>
          <tbody>
            {serie.linhas.map((l) => (
              <tr key={l.periodo} className="border-b border-border/40 last:border-0">
                <td className="py-1 pr-2">{l.periodo}</td>
                {comPartes && <td className="text-right py-1 px-2">{fmt(l.denominador)}</td>}
                {comPartes && <td className="text-right py-1 px-2">{fmt(l.numerador)}</td>}
                <td className="text-right py-1 pl-2 font-medium">
                  {l.valor === null ? '—' : `${l.valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
                  {l.divergente && (
                    <span
                      className="ml-1 text-amber-600"
                      title={`O card mostra ${l.valor_gravado?.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% — a última apuração automática é anterior a estes lançamentos.`}
                    >*</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ⚠️ O aviso só aparece quando há divergência de verdade. Aviso que
          aparece sempre é aviso que ninguém lê. */}
      {serie.divergencias > 0 && (
        <p className="text-[11px] text-amber-700 dark:text-amber-500 mt-2 leading-snug">
          <strong>*</strong> {serie.divergencias === 1 ? 'Este mês foi recalculado agora' : `${serie.divergencias} meses foram recalculados agora`} e
          {' '}não bate com o card: a última apuração automática é anterior a lançamentos
          feitos depois (check-in retroativo, por exemplo). O card acerta sozinho na
          próxima apuração.
        </p>
      )}
      {!comPartes && (
        <p className="text-[11px] text-muted-foreground mt-2">
          Histórico apurado. Este tipo de dado ainda não abre o número em partes.
        </p>
      )}
    </div>
  );
}

function Secao({ icone: Icone, titulo, children }: {
  icone: typeof Info; titulo: string; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
        <Icone className="size-3.5" /> {titulo}
      </div>
      <div>{children}</div>
    </div>
  );
}
