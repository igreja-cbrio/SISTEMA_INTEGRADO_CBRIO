/**
 * Linha do tempo da jornada do novo convertido.
 *
 * Pedido do Matheus (14/08/2026): a tabela de semáforo diz SE a pessoa bateu o
 * marco; esta visão diz QUANDO — quantos dias depois da decisão, e há quanto
 * tempo a pessoa não registra nada.
 *
 * ⚠️ Consome `tempo` + `itens[].marcos` de `GET /cuidados/jornada-convertidos`.
 * Toda conta de mediana/quartil vem PRONTA do servidor (utils/jornadaTempo) —
 * refazer aqui criaria dois números pra mesma pergunta.
 *
 * ⚠️ LEI HERDADA DO BACKEND, que a tela precisa honrar:
 *   · marco AUSENTE = sem registro, NUNCA "não fez";
 *   · marco APROXIMADO (data de importação / sem data) conta como alcançado,
 *     aparece VAZADO e fica fora da mediana — com a exclusão declarada.
 */
import { useMemo, useState } from 'react';
import { Clock, AlertTriangle, Users, TrendingUp, Info } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

const COR: Record<string, string> = {
  contato: '#3b82f6',
  next: '#f59e0b',
  batismo: '#8b5cf6',
  grupo: '#10b981',
  servir: '#ec4899',
  generosidade: '#06b6d4',
};
const COR_DECISAO = '#00B39D';

type Marco = { alcancado: boolean; data: string | null; dias: number | null; aproximada: boolean; motivo: string | null };
type Item = {
  id: string; nome: string; area?: string; data_culto: string;
  dias_desde_conversao: number; dias_parado?: number | null; total_marcos?: number;
  marcos?: Record<string, Marco>;
  registro?: { texto: string; porPessoa: boolean | null; atrasoDias: number | null } | null;
};
type EstatMarco = {
  chave: string; label: string; meta_dias: number | null;
  alcancaram: number; pct: number; com_data_confiavel: number; aproximados: number;
  mediana: number | null; q1: number | null; q3: number | null; min: number | null; max: number | null;
};

const fmtDia = (d?: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const fmtDias = (n?: number | null) => (n == null ? '—' : `${n} d`);

function Tile({ icon: Icon, titulo, valor, apoio, cor, alerta }: any) {
  return (
    <div className="rounded-[16px] border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{titulo}</p>
        {Icon && <Icon className="h-4 w-4 shrink-0" style={{ color: cor || 'var(--teal)' }} />}
      </div>
      <p
        className="text-[27px] font-extrabold tabular-nums leading-tight mt-1"
        style={alerta ? { color: '#f59e0b' } : undefined}
      >
        {valor}
      </p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{apoio}</p>
    </div>
  );
}

/** Barra de distribuição: faixa do 1º ao 3º quartil + traço na mediana. */
function BarraTempo({ e, maxDias }: { e: EstatMarco; maxDias: number }) {
  const cor = COR[e.chave] || COR_DECISAO;
  const pos = (v: number | null) => (v == null || maxDias <= 0 ? 0 : Math.min(100, (v / maxDias) * 100));

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-28 shrink-0">
        <p className="text-xs font-medium truncate">{e.label}</p>
        <p className="text-[10px] text-muted-foreground tabular-nums">
          {e.alcancaram} · {e.pct}%
        </p>
      </div>

      <div className="flex-1 min-w-0">
        <div className="relative h-3 rounded-full bg-muted/60">
          {e.mediana != null && (
            <>
              <div
                className="absolute top-0 bottom-0 rounded-full"
                style={{
                  left: `${pos(e.q1)}%`,
                  width: `${Math.max(1.5, pos(e.q3) - pos(e.q1))}%`,
                  background: cor + '55',
                }}
              />
              <div
                className="absolute top-[-2px] bottom-[-2px] w-[2px] rounded"
                style={{ left: `${pos(e.mediana)}%`, background: cor }}
              />
            </>
          )}
        </div>
        {e.aproximados > 0 && (
          <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-1">
            mediana sobre {e.com_data_confiavel} de {e.alcancaram} · {e.aproximados} com data aproximada
          </p>
        )}
      </div>

      <div className="w-16 shrink-0 text-right">
        <p className="text-sm font-bold tabular-nums" style={{ color: e.mediana != null ? cor : undefined }}>
          {fmtDias(e.mediana)}
        </p>
        <p className="text-[10px] text-muted-foreground">mediana</p>
      </div>
    </div>
  );
}

/** Uma pessoa = uma linha do tempo. Eixo X = dias desde a decisão DELA. */
function LinhaPessoa({ item, escala, hoje }: { item: Item; escala: number; hoje: number }) {
  const marcos = item.marcos || {};
  const comData = Object.entries(marcos).filter(([, m]) => m?.alcancado && typeof m.dias === 'number' && m.dias >= 0);
  const semData = Object.entries(marcos).filter(([, m]) => m?.alcancado && (m.dias == null || m.dias < 0));
  const ultimo = comData.length ? Math.max(...comData.map(([, m]) => m.dias as number)) : 0;
  const pct = (d: number) => Math.min(100, Math.max(0, (d / escala) * 100));
  const fimHoje = pct(Math.min(item.dias_desde_conversao, escala));
  const parado = item.dias_parado ?? item.dias_desde_conversao;

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/60 last:border-0">
      <div className="w-[190px] shrink-0">
        <p className="text-sm font-medium truncate" title={item.nome}>{item.nome}</p>
        <p className="text-[11px] text-muted-foreground tabular-nums">
          decidiu {fmtDia(item.data_culto)}
        </p>
        {/* ⚠️⚠️ Quando o registro entrou — e por QUEM. O rótulo muda com a
            fonte porque `registrado_em` é o instante em que a LINHA nasceu:
            no formulário público é a pessoa preenchendo; no lançamento manual
            é a EQUIPE digitando, às vezes dias depois. Escrever "preencheu"
            nos dois casos afirmaria autoria que não existe E esconderia o
            atraso do lançamento — que é o que faz o SLA de contato nascer
            vencido (atraso médio de 3 dias, medido em 14/08). */}
        {item.registro && (
          <p
            className="text-[11px] text-muted-foreground/80 tabular-nums truncate"
            title={item.registro.texto}
          >
            {item.registro.texto}
          </p>
        )}
      </div>

      <div className="flex-1 min-w-0 relative h-8">
        {/* trilho */}
        <div className="absolute top-1/2 left-0 right-0 h-[2px] -translate-y-1/2 bg-border" />
        {/* percurso vivo */}
        {ultimo > 0 && (
          <div
            className="absolute top-1/2 left-0 h-[2px] -translate-y-1/2 rounded"
            style={{ width: `${pct(ultimo)}%`, background: COR_DECISAO, opacity: 0.5 }}
          />
        )}
        {/* parado desde o último marco */}
        <div
          className="absolute top-1/2 h-0 -translate-y-1/2 border-t border-dashed border-muted-foreground/50"
          style={{ left: `${pct(ultimo)}%`, width: `${Math.max(0, fimHoje - pct(ultimo))}%` }}
        />
        {/* referência de 90 dias */}
        {escala > 90 && (
          <div
            className="absolute top-0 bottom-0 w-px border-l border-dashed border-muted-foreground/40"
            style={{ left: `${pct(90)}%` }}
          />
        )}

        {/* decisão (dia 0) */}
        <span
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full"
          style={{ left: 0, background: COR_DECISAO }}
          title={`Decisão · ${fmtDia(item.data_culto)}`}
        />

        {comData.map(([chave, m]) => (
          <TooltipProvider key={chave} delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`${chave}: ${m.dias} dias após a decisão`}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full ring-2 ring-card focus:outline-none focus:ring-primary"
                  style={{
                    left: `${pct(m.dias as number)}%`,
                    background: m.aproximada ? 'transparent' : COR[chave] || COR_DECISAO,
                    border: m.aproximada ? `2px solid ${COR[chave] || COR_DECISAO}` : undefined,
                  }}
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <p className="font-medium capitalize">{chave}</p>
                <p>{fmtDia(m.data)} · {m.dias} dias após a decisão</p>
                {m.aproximada && (
                  <p className="text-amber-500 mt-0.5">
                    data aproximada — {m.motivo === 'data_de_importacao' ? 'veio de importação' : 'anterior à decisão'}
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>

      <div className="w-[132px] shrink-0 text-right flex flex-col items-end gap-0.5">
        {semData.length > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
            {semData.length} sem data
          </span>
        )}
        {(item.total_marcos ?? 0) === 0 ? (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-500 tabular-nums whitespace-nowrap">
            parado há {parado} d
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
            {item.total_marcos} {item.total_marcos === 1 ? 'marco' : 'marcos'} · {parado} d parado
          </span>
        )}
      </div>
    </div>
  );
}

export default function JornadaTimeline({ data }: { data: any }) {
  const [ordem, setOrdem] = useState<'recentes' | 'parados' | 'rapidos' | 'marcos'>('recentes');
  const [limiar, setLimiar] = useState(90);
  const [soTravados, setSoTravados] = useState(false);
  const [pagina, setPagina] = useState(1);

  const itens: Item[] = data?.itens || [];
  const tempo = data?.tempo;
  const estat: EstatMarco[] = tempo?.marcos || [];
  const hoje = Date.now();

  const lista = useMemo(() => {
    let arr = itens.slice();
    if (soTravados) arr = arr.filter((i) => (i.total_marcos ?? 0) === 0 && (i.dias_parado ?? 0) > limiar);
    const parado = (i: Item) => i.dias_parado ?? i.dias_desde_conversao;
    const primeiro = (i: Item) => {
      const ds = Object.values(i.marcos || {})
        .filter((m) => m?.alcancado && typeof m.dias === 'number' && m.dias >= 0)
        .map((m) => m.dias as number);
      return ds.length ? Math.min(...ds) : Number.POSITIVE_INFINITY;
    };
    if (ordem === 'parados') arr.sort((a, b) => parado(b) - parado(a));
    else if (ordem === 'rapidos') arr.sort((a, b) => primeiro(a) - primeiro(b));
    else if (ordem === 'marcos') arr.sort((a, b) => (b.total_marcos ?? 0) - (a.total_marcos ?? 0));
    else arr.sort((a, b) => (a.data_culto < b.data_culto ? 1 : -1));
    return arr;
  }, [itens, ordem, soTravados, limiar]);

  const escala = useMemo(() => {
    const max = Math.max(30, ...lista.slice(0, 400).map((i) => i.dias_desde_conversao || 0));
    return Math.ceil(max / 30) * 30;
  }, [lista]);

  const maxDiasBarra = useMemo(
    () => Math.max(30, ...estat.map((e) => e.q3 ?? e.mediana ?? 0)) * 1.15,
    [estat],
  );

  const travados = useMemo(
    () => itens.filter((i) => (i.total_marcos ?? 0) === 0 && (i.dias_parado ?? 0) > limiar).length,
    [itens, limiar],
  );

  const medianaPrimeiro = useMemo(() => {
    const ds = itens
      .map((i) =>
        Object.values(i.marcos || {})
          .filter((m) => m?.alcancado && !m.aproximada && typeof m.dias === 'number' && m.dias >= 0)
          .map((m) => m.dias as number),
      )
      .filter((a) => a.length)
      .map((a) => Math.min(...a))
      .sort((a, b) => a - b);
    if (!ds.length) return null;
    const meio = Math.floor(ds.length / 2);
    return ds.length % 2 ? ds[meio] : Math.round((ds[meio - 1] + ds[meio]) / 2);
  }, [itens]);

  if (!tempo) {
    return (
      <div className="rounded-[16px] border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Esta visão precisa de dados de tempo que o servidor ainda não enviou. Recarregue a página.
      </div>
    );
  }

  const visiveis = lista.slice(0, pagina * 40);
  const total = itens.length;
  const engajaram = tempo.engajaram ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile icon={Users} titulo="Convertidos" valor={total.toLocaleString('pt-BR')}
          apoio="no recorte atual" />
        <Tile icon={TrendingUp} titulo="Engajaram" valor={engajaram.toLocaleString('pt-BR')}
          apoio={`${total ? Math.round((engajaram / total) * 100) : 0}% têm ao menos 1 marco`} cor="#10b981" />
        <Tile icon={AlertTriangle} titulo={`Sem marco há +${limiar}d`} valor={travados.toLocaleString('pt-BR')}
          apoio="nenhum registro além da decisão" alerta={travados > 0} />
        <Tile icon={Clock} titulo="Até o 1º marco" valor={fmtDias(medianaPrimeiro)}
          apoio="mediana · só datas confiáveis" />
      </div>

      <div className="rounded-[16px] border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="text-sm font-semibold">Tempo até cada marco</h4>
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label="Como esta barra é lida">
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[260px] text-xs">
                A faixa colorida vai do 1º ao 3º quartil (metade do meio das pessoas) e o traço
                marca a mediana. Usamos mediana, não média — quem engaja em 300 dias distorceria a média.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="divide-y divide-border/50">
          {estat.map((e) => <BarraTempo key={e.chave} e={e} maxDias={maxDiasBarra} />)}
        </div>
        {tempo.sensiveis_ocultos && (
          <p className="text-[11px] text-muted-foreground mt-3 border-t border-border pt-2">
            O marco de generosidade não aparece para o seu nível de acesso — esta lista está incompleta.
          </p>
        )}
        {tempo.datas_de_importacao?.length > 0 && (
          <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-2">
            {tempo.datas_de_importacao.length} data(s) de importação em massa detectada(s)
            ({tempo.datas_de_importacao.map((d: string) => fmtDia(d)).join(' · ')}) — vínculos de grupo
            nesses dias entram como data aproximada e ficam fora da mediana.
          </p>
        )}
      </div>

      <div className="rounded-[16px] border border-border bg-card">
        <div className="flex items-center justify-between gap-3 flex-wrap p-4 pb-2">
          <div>
            <h4 className="text-sm font-semibold">Linha do tempo por pessoa</h4>
            <p className="text-[11px] text-muted-foreground">
              {lista.length.toLocaleString('pt-BR')} de {total.toLocaleString('pt-BR')} · eixo em dias desde a decisão
              {escala > 90 && ' · linha tracejada = 90 dias'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" className="accent-primary" checked={soTravados}
                onChange={(e) => { setSoTravados(e.target.checked); setPagina(1); }} />
              só quem está parado há mais de
            </label>
            <Select value={String(limiar)} onValueChange={(v) => { setLimiar(Number(v)); setPagina(1); }}>
              <SelectTrigger className="w-[92px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[30, 60, 90, 180, 365].map((d) => (
                  <SelectItem key={d} value={String(d)}>{d} dias</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={ordem} onValueChange={(v: any) => { setOrdem(v); setPagina(1); }}>
              <SelectTrigger className="w-[176px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="recentes">Decisão mais recente</SelectItem>
                <SelectItem value="parados">Mais tempo parado</SelectItem>
                <SelectItem value="rapidos">Engajou mais rápido</SelectItem>
                <SelectItem value="marcos">Mais marcos alcançados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="px-4 pb-4 overflow-x-auto">
          <div className="min-w-[640px]">
            {visiveis.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {soTravados
                  ? `Ninguém está sem nenhum marco há mais de ${limiar} dias neste recorte.`
                  : 'Nenhum convertido no acompanhamento.'}
              </p>
            ) : (
              visiveis.map((i) => <LinhaPessoa key={i.id} item={i} escala={escala} hoje={hoje} />)
            )}
          </div>
        </div>

        {visiveis.length < lista.length && (
          <div className="px-4 pb-4">
            <button
              type="button"
              onClick={() => setPagina((p) => p + 1)}
              className="w-full text-xs text-primary hover:underline py-2"
            >
              Carregar mais ({lista.length - visiveis.length} restantes)
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: COR_DECISAO }} /> Decisão
        </span>
        {estat.map((e) => (
          <span key={e.chave} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: COR[e.chave] }} /> {e.label}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: '#94a3b8' }} /> data aproximada
        </span>
      </div>
    </div>
  );
}
