import { useCallback, useEffect, useMemo, useState } from 'react';
import { marketing as api } from '../../api';
import MarketingNav from './MarketingNav';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Skeleton } from '../../components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  Building2,
  CalendarDays,
  Check,
  Clipboard,
  HeartHandshake,
  Info,
  RefreshCw,
  Target,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import { toast } from 'sonner';

const moeda = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percentual = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dataHora = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

function fmtMoeda(valor) {
  return moeda.format(Number(valor || 0));
}

function fmtPercentual(valor) {
  return `${percentual.format(Number(valor || 0))}%`;
}

function BarraGenerosidade({ titulo, subtitulo, valor, disponivel = true }) {
  const valorNumero = Number(valor || 0);
  const valorVisual = Math.max(0, Math.min(100, valorNumero));
  const texto = disponivel ? fmtPercentual(valorNumero) : '—';

  return (
    <div className="space-y-2.5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">Temos</p>
          <p className="mt-0.5 text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">{texto}</p>
        </div>
        {subtitulo && <p className="max-w-[250px] text-right text-xs leading-relaxed text-white/70">{subtitulo}</p>}
      </div>
      <div
        className="relative h-11 overflow-hidden rounded-full border border-white/55 bg-black/15"
        role="progressbar"
        aria-label={`${titulo}: ${disponivel ? texto : 'sem dados do balanço'}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={disponivel ? valorVisual : undefined}
        aria-valuetext={disponivel ? texto : 'Sem dados do balanço'}
      >
        <div
          className="h-full rounded-full bg-white/85 transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${disponivel ? valorVisual : 0}%` }}
        />
      </div>
      <p className="text-base font-semibold text-white sm:text-lg">{titulo}</p>
    </div>
  );
}

function ResumoStat({ icon: Icon, label, valor, detalhe, destaque = false }) {
  return (
    <Card className="glass-solid">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`rounded-xl p-2.5 ${destaque ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{valor}</p>
            {detalhe && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detalhe}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Carregando() {
  return (
    <div className="space-y-4" aria-label="Carregando generosidade">
      <Skeleton className="h-[360px] w-full rounded-2xl" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-32 rounded-2xl" />)}
      </div>
      <Skeleton className="h-80 w-full rounded-2xl" />
    </div>
  );
}

export default function MarketingGenerosidade() {
  const hoje = useMemo(() => new Date(), []);
  const anoAtual = hoje.getFullYear();
  const mesAtual = `${anoAtual}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

  const [ano, setAno] = useState(String(anoAtual));
  const [mesSelecionado, setMesSelecionado] = useState(mesAtual);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState('');
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(async ({ silencioso = false } = {}) => {
    if (silencioso) setAtualizando(true);
    else setCarregando(true);
    setErro('');
    try {
      const resposta = await api.generosidade(Number(ano));
      setDados(resposta);
    } catch (e) {
      setErro(e?.message || 'Não foi possível carregar os dados de generosidade.');
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, [ano]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    const atualizarAoVoltar = () => carregar({ silencioso: true });
    window.addEventListener('focus', atualizarAoVoltar);
    return () => window.removeEventListener('focus', atualizarAoVoltar);
  }, [carregar]);

  const mesesDisponiveis = useMemo(
    () => (dados?.meses || []).filter((item) => !item.futuro),
    [dados],
  );

  useEffect(() => {
    if (!mesesDisponiveis.length) return;
    const existe = mesesDisponiveis.some((item) => item.mes === mesSelecionado);
    if (!existe) setMesSelecionado(mesesDisponiveis[mesesDisponiveis.length - 1].mes);
  }, [mesSelecionado, mesesDisponiveis]);

  const mes = useMemo(
    () => mesesDisponiveis.find((item) => item.mes === mesSelecionado) || mesesDisponiveis.at(-1),
    [mesSelecionado, mesesDisponiveis],
  );

  const anosDisponiveis = useMemo(() => {
    const inicio = Number(dados?.configuracao?.campanha_inicio?.slice(0, 4) || 2026);
    return Array.from({ length: Math.max(1, anoAtual - inicio + 1) }, (_, index) => String(anoAtual - index));
  }, [anoAtual, dados]);

  const atualizadoEm = dados?.atualizado_em ? new Date(dados.atualizado_em) : null;
  const atualizadoTexto = atualizadoEm && !Number.isNaN(atualizadoEm.getTime())
    ? dataHora.format(atualizadoEm)
    : 'Nenhum balanço concluído';

  const resumoMensal = !mes?.tem_dados
    ? 'Sem dados do balanço para este mês'
    : `${fmtMoeda(mes.arrecadado)} de ${fmtMoeda(dados?.configuracao?.meta_mensal)}`;

  const copiarResumo = async () => {
    if (!mes || !dados) return;
    const texto = [
      `Generosidade — ${mes.mes_label}/${dados.ano}`,
      `Cobertura mensal: ${mes.tem_dados ? fmtPercentual(mes.percentual_mensal) : 'sem dados'} (${resumoMensal}).`,
      `Expansão do novo campus: ${fmtPercentual(mes.percentual_campus)} (${fmtMoeda(mes.campus_acumulado)} de ${fmtMoeda(dados.configuracao.meta_campus)}).`,
      `Dados do balanço atualizados em ${atualizadoTexto}.`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      toast.success('Resumo copiado');
      window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      toast.error('Não foi possível copiar o resumo');
    }
  };

  const inicioCampanha = dados?.configuracao?.campanha_inicio
    ? `${dados.configuracao.campanha_inicio.slice(5, 7)}/${dados.configuracao.campanha_inicio.slice(0, 4)}`
    : '01/2026';

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <HeartHandshake className="h-6 w-6 text-primary" aria-hidden="true" />
              Marketing · Generosidade
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Percentuais oficiais para as telas do culto, atualizados pelo balanço financeiro.
            </p>
          </div>
          <MarketingNav />
        </div>

        <Card className="glass-solid">
          <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-wrap gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="generosidade-ano">Ano</label>
                <Select value={ano} onValueChange={setAno}>
                  <SelectTrigger id="generosidade-ano" className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {anosDisponiveis.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="generosidade-mes">Mês de referência</label>
                <Select value={mes?.mes || mesSelecionado} onValueChange={setMesSelecionado}>
                  <SelectTrigger id="generosidade-mes" className="w-[180px]">
                    <SelectValue placeholder="Selecione o mês" />
                  </SelectTrigger>
                  <SelectContent>
                    {mesesDisponiveis.map((item) => (
                      <SelectItem key={item.mes} value={item.mes}>{item.mes_label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="mr-1 text-xs text-muted-foreground">
                <p>Último balanço concluído</p>
                <p className="font-medium tabular-nums text-foreground">{atualizadoTexto}</p>
              </div>
              <Button variant="outline" onClick={() => carregar({ silencioso: true })} disabled={atualizando}>
                <RefreshCw className={`mr-2 h-4 w-4 ${atualizando ? 'animate-spin' : ''}`} aria-hidden="true" />
                Atualizar
              </Button>
              <Button onClick={copiarResumo} disabled={!mes || carregando}>
                {copiado ? <Check className="mr-2 h-4 w-4" aria-hidden="true" /> : <Clipboard className="mr-2 h-4 w-4" aria-hidden="true" />}
                {copiado ? 'Copiado' : 'Copiar resumo'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {carregando ? (
          <Carregando />
        ) : erro ? (
          <Card className="glass-solid border-destructive/40">
            <CardContent className="flex flex-col items-center px-6 py-12 text-center">
              <Info className="h-8 w-8 text-destructive" aria-hidden="true" />
              <h2 className="mt-3 text-lg font-semibold">Dados indisponíveis</h2>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">{erro}</p>
              <Button className="mt-5" onClick={() => carregar()}>Tentar novamente</Button>
            </CardContent>
          </Card>
        ) : mes ? (
          <>
            <Card className="glass-solid relative overflow-hidden !border-white/15 !bg-[#006f6b] text-white shadow-xl">
              <div
                className="pointer-events-none absolute inset-0 opacity-50"
                aria-hidden="true"
                style={{
                  backgroundImage: 'radial-gradient(circle at 82% 10%, rgba(0,179,157,.48), transparent 42%), radial-gradient(circle at 8% 100%, rgba(16,110,135,.55), transparent 46%)',
                }}
              />
              <CardContent className="relative p-6 sm:p-9 lg:p-12">
                <div className="mb-9 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-lg font-medium text-white/80">Generosidade que</p>
                    <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
                      alcança vidas para Jesus
                    </h2>
                  </div>
                  <div className="flex gap-2">
                    {mes.parcial && <Badge className="border-white/25 bg-white/15 text-white hover:bg-white/15">Mês parcial</Badge>}
                    <Badge className="border-white/25 bg-black/15 text-white hover:bg-black/15">
                      {mes.mes_label} de {dados.ano}
                    </Badge>
                  </div>
                </div>

                <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
                  <BarraGenerosidade
                    titulo={`Arrecadação — ${mes.mes_label}`}
                    subtitulo={resumoMensal}
                    valor={mes.percentual_mensal}
                    disponivel={mes.tem_dados}
                  />
                  <BarraGenerosidade
                    titulo="Investimento para expansão em mais um campus"
                    subtitulo={`${fmtMoeda(mes.campus_acumulado)} de ${fmtMoeda(dados.configuracao.meta_campus)}`}
                    valor={mes.percentual_campus}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <ResumoStat
                icon={WalletCards}
                label={`Arrecadado em ${mes.mes_label}`}
                valor={mes.tem_dados ? fmtMoeda(mes.arrecadado) : '—'}
                detalhe={mes.tem_dados ? `${fmtPercentual(mes.percentual_mensal)} da meta mensal` : 'Sem dados do balanço neste mês'}
              />
              <ResumoStat
                icon={Target}
                label={mes.excedente_campus > 0 ? 'Acima da meta mensal' : 'Para alcançar a meta mensal'}
                valor={fmtMoeda(mes.excedente_campus > 0 ? mes.excedente_campus : mes.falta_meta_mensal)}
                detalhe={`Meta de ${fmtMoeda(dados.configuracao.meta_mensal)} por mês`}
                destaque={mes.excedente_campus > 0}
              />
              <ResumoStat
                icon={TrendingUp}
                label="Destinado ao campus neste mês"
                valor={fmtMoeda(mes.excedente_campus)}
                detalhe="Somente o valor que ultrapassa a meta mensal"
                destaque={mes.excedente_campus > 0}
              />
              <ResumoStat
                icon={Building2}
                label="Acumulado para o novo campus"
                valor={fmtMoeda(mes.campus_acumulado)}
                detalhe={`Faltam ${fmtMoeda(mes.falta_meta_campus)} para os ${fmtMoeda(dados.configuracao.meta_campus)}`}
                destaque
              />
            </div>

            <Card className="glass-solid">
              <CardContent className="p-0">
                <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="flex items-center gap-2 font-semibold text-foreground">
                      <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
                      Histórico mensal de {dados.ano}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">Selecione um mês para atualizar a prévia acima.</p>
                  </div>
                  <Badge variant="outline">Campanha do campus desde {inicioCampanha}</Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mês</TableHead>
                      <TableHead className="text-right">Arrecadado</TableHead>
                      <TableHead className="text-right">Meta mensal</TableHead>
                      <TableHead className="text-right">Excedente do mês</TableHead>
                      <TableHead className="text-right">Campus acumulado</TableHead>
                      <TableHead>Situação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...mesesDisponiveis].reverse().map((item) => {
                      const selecionado = item.mes === mes.mes;
                      return (
                        <TableRow key={item.mes} data-state={selecionado ? 'selected' : undefined}>
                          <TableCell>
                            <button
                              type="button"
                              className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={() => setMesSelecionado(item.mes)}
                              aria-label={`Ver ${item.mes_label} de ${dados.ano}`}
                            >
                              {item.mes_label}
                            </button>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {item.tem_dados ? fmtMoeda(item.arrecadado) : '—'}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {item.tem_dados ? fmtPercentual(item.percentual_mensal) : '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {item.tem_dados ? fmtMoeda(item.excedente_campus) : '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtMoeda(item.campus_acumulado)}
                          </TableCell>
                          <TableCell>
                            {item.parcial ? (
                              <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300">Parcial</Badge>
                            ) : item.tem_dados ? (
                              <Badge className="bg-primary/15 text-primary hover:bg-primary/15">Com dados</Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">Sem balanço</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="flex gap-2 rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <p>
                Regra do campus: ao fim de cada mês, somente o valor arrecadado acima de {fmtMoeda(dados.configuracao.meta_mensal)}
                {' '}é acrescentado ao acumulado. Meses abaixo da meta não retiram valores já destinados ao campus.
              </p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
