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
import { Loader2, X, Database, CalendarClock, Target, AlertTriangle, Info } from 'lucide-react';

type Procedencia = {
  kpi_id: string; indicador: string | null; area: string | null;
  periodicidade: string | null; quando: string | null;
  meta: string | number | null; sentido_meta: string | null; automatico: boolean;
  como_calcula: string | null; tipo_calculo: string;
  dado_tipo: string | null; fonte: string | null; conta: string | null;
  ressalva: string | null; sem_implementacao: boolean;
  desde: string | null; ate: string | null; periodos_medidos: number; nunca_mediu: boolean;
};

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

            {d.meta !== null && d.meta !== undefined && (
              <Secao icone={Target} titulo="Meta">
                {String(d.meta)}
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
