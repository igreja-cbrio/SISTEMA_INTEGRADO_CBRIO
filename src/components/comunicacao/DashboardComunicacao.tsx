// Dashboard do módulo Comunicação (F2 do redesenho · 09/09/2026).
//
// Pedido do Marcos (08/09): "o dashboard está muito cru" — pizza de mensagens
// por área, linha por dia, filtro por data e por ano, engajamento (quanto
// respondem os disparos), pessoas sem resposta há mais de 2 dias como número
// PRINCIPAL com a lista clicável, e tempo de resposta por atendente e por área
// (sempre com o n na frente — são poucas respostas humanas hoje).
//
// Toda CONTA é do servidor (GET /comunicacao/dashboard · a régua pura vive em
// backend/utils/comunicacaoDashboard.js). Aqui só se desenha. O custo continua
// vindo de GET /comunicacao/custo (janela própria de 6 meses, por módulo).
// Bloco que o servidor não conseguiu montar chega NULL + `avisos[]`: a tela
// declara em âmbar em vez de mostrar zero.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { RefreshCw, AlertTriangle, Loader2, Clock, MessageSquare, Send, Inbox } from 'lucide-react';
import { comunicacao } from '../../api';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { opcoesAno } from '@/lib/janelaPeriodo';
import { hrefConversa } from '@/lib/conversas';
import { rotuloIdade } from '@/lib/waConversaEstado';

const C = { primary: '#00B39D' };

type Janela = {
  inicio: string; fim: string; dias: number | null; ano: number | null; rotulo: string;
  gran: 'dia' | 'semana' | 'mes'; limite_sem_resposta_h: number;
};
type ConvEspera = {
  id: string; nome: string | null; telefone: string; area: string; atribuido_a: string | null;
  horas: number; vencida: boolean; last_inbound_at: string;
};
type TempoAtendente = { autor_id: string; nome: string | null; n: number; mediana_min: number | null; media_min: number | null };
type TempoArea = { area: string; n: number; mediana_min: number | null; media_min: number | null };
type Dash = {
  janela: Janela; agora: string;
  conversas: { abertas: number; sem_resposta: number; vencidas: number; novas: number | null; lista: ConvEspera[] } | null;
  por_area: { area: string; recebidas: number; enviadas: number; conversas: number }[] | null;
  serie: { chave: string; recebidas: number; enviadas: number }[] | null;
  tempo_resposta: { n: number; por_atendente: TempoAtendente[]; por_area: TempoArea[] };
  engajamento: {
    enviados: number; respondidos: number; taxa_pct: number | null; janela_dias: number;
    por_modulo: { modulo: string; enviados: number; respondidos: number; taxa_pct: number | null }[];
  } | null;
  fila: { total: number; enviados: number; pendentes: number; erros: number; entregues: number; lidos: number; falhos_meta: number } | null;
  avisos: string[];
};
type Custo = {
  meses: number; total: number; envios_considerados: number; nao_classificados: number;
  por_mes: { mes: string; custo: number }[];
  por_modulo: { modulo: string; custo: number }[];
  por_categoria: { categoria: string; envios: number; custo: number }[];
};

const brl = (v: number) => `R$ ${(Number(v) || 0).toFixed(2)}`;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesLabel = (m: string) => { const [a, mm] = m.split('-'); return `${MESES[Number(mm) - 1] || mm}/${String(a).slice(2)}`; };
/** Rótulo do balde da série: dia/semana → dd/mm · mês → mmm/aa. */
const chaveLabel = (k: string) => (k.length === 7 ? mesLabel(k) : `${k.slice(8, 10)}/${k.slice(5, 7)}`);
const dataBr = (iso: string) => (iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const telBonito = (t: string) => {
  const d = String(t || '').replace(/\D+/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t || '—';
};
/** Minutos → texto curto. null = sem amostra. */
const fmtMin = (min: number | null) => {
  if (min === null || !Number.isFinite(min)) return '—';
  if (min < 1) return '<1 min';
  if (min < 60) return `${Math.round(min)} min`;
  if (min < 24 * 60) { const h = Math.floor(min / 60); const m = Math.round(min % 60); return m ? `${h}h ${m}min` : `${h}h`; }
  return `${(min / (24 * 60)).toFixed(1).replace('.', ',')} d`;
};
const AVISO_LABEL: Record<string, string> = {
  conversas: 'as conversas', mensagens: 'as mensagens', disparos: 'os disparos', fila: 'a fila de envios', atendentes: 'os nomes dos atendentes',
  conversas_truncado: 'conversas (lista cortada em 20 mil)', mensagens_truncado: 'mensagens (lista cortada em 20 mil)', disparos_truncado: 'disparos (lista cortada em 20 mil)',
};
// Cores SÓLIDAS (pizza e linha ficam sem gradiente, como manda o tema). A
// Entrada (conversa sem área) é cinza de propósito: não é área, é fila.
const PALETA = ['#00B39D', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#10b981', '#06b6d4', '#ef4444', '#84cc16', '#a855f7', '#f97316'];
const CINZA = '#94a3b8';
const GRAN_LABEL: Record<Janela['gran'], string> = { dia: 'por dia', semana: 'por semana', mes: 'por mês' };

type Periodo = `d${number}` | `a${number}`;
const OPCOES_DIAS = [
  { v: 'd7' as Periodo, label: 'Últimos 7 dias' },
  { v: 'd30' as Periodo, label: 'Últimos 30 dias' },
  { v: 'd90' as Periodo, label: 'Últimos 90 dias' },
  { v: 'd365' as Periodo, label: 'Último ano' },
];

function Spinner() { return <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>; }
function ErroBox({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div style={{ margin: 16, padding: 16, background: '#FCEBEB', border: '1px dashed #F09595', borderRadius: 8, textAlign: 'center' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#501313', marginBottom: 4 }}>Não foi possível carregar</div>
      <div style={{ fontSize: 11, color: '#791F1F', marginBottom: 10 }}>{msg}</div>
      <button onClick={onRetry} style={{ background: '#E24B4A', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Tentar de novo</button>
    </div>
  );
}
function StatCard({ label, value, cor, sub }: { label: string; value: number | string; cor?: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums" style={cor ? { color: cor } : undefined}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </Card>
  );
}
function Titulo({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{children}</div>
      {sub && <div className="text-[11px] text-muted-foreground/80">{sub}</div>}
    </div>
  );
}
/** Bloco que o servidor não conseguiu montar: declara, nunca mostra zero. */
function Indisponivel({ oque }: { oque: string }) {
  return <p className="text-sm text-amber-700 flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> Não deu para carregar {oque} agora.</p>;
}

export default function DashboardComunicacao() {
  const navigate = useNavigate();
  const [periodo, setPeriodo] = useState<Periodo>('d30');
  const [dados, setDados] = useState<Dash | null>(null);
  const [custo, setCusto] = useState<Custo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [verTodas, setVerTodas] = useState(false);
  const anos = useMemo(() => opcoesAno() as { dias: string; label: string; ano: number }[], []);

  const carregar = useCallback(() => {
    setErro(null); setDados(null);
    const params = periodo.startsWith('a') ? { ano: Number(periodo.slice(1)) } : { dias: Number(periodo.slice(1)) };
    comunicacao.dashboard(params).then((r: Dash) => setDados(r)).catch((e: unknown) => setErro((e as Error)?.message || 'Falha ao consultar o dashboard.'));
    // Custo estimado real (janela fixa de 6 meses · só existe por MÓDULO, não por área)
    comunicacao.custo(6).then((r: Custo) => setCusto(r)).catch(() => setCusto(null));
  }, [periodo]);
  useEffect(() => { carregar(); }, [carregar]);

  const dias = dados?.janela.limite_sem_resposta_h ? Math.round(dados.janela.limite_sem_resposta_h / 24) : 2;
  const listaEspera = dados?.conversas?.lista || [];
  const listaVisivel = verTodas ? listaEspera : listaEspera.slice(0, 8);
  const totaisSerie = useMemo(() => {
    const s = dados?.serie || [];
    return { recebidas: s.reduce((a, b) => a + b.recebidas, 0), enviadas: s.reduce((a, b) => a + b.enviadas, 0) };
  }, [dados]);
  const pizza = useMemo(() => (dados?.por_area || []).filter(a => a.recebidas > 0).map((a, i) => ({
    name: a.area, value: a.recebidas, conversas: a.conversas, enviadas: a.enviadas,
    color: a.area === 'Entrada' ? CINZA : PALETA[i % PALETA.length],
  })), [dados]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Conversas e disparos de WhatsApp de todos os módulos
          {dados ? <> · <b>{dados.janela.rotulo}</b> ({dataBr(dados.janela.inicio)} a {dataBr(dados.janela.fim)})</> : null}.
        </p>
        <div className="flex items-center gap-2">
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {OPCOES_DIAS.map(o => <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>)}
              {anos.map(a => <SelectItem key={a.dias} value={`a${a.ano}`}>Ano {a.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={carregar} title="Recarregar"><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {erro ? <ErroBox msg={erro} onRetry={carregar} />
        : !dados ? <Spinner />
        : (
          <>
            {dados.avisos.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Parte do dashboard não carregou: {dados.avisos.map(a => AVISO_LABEL[a] || a).join(' · ')}. Os números desses blocos não aparecem — não são zero.</span>
              </div>
            )}

            {/* ── Linha 1 · quem espera (o número principal) + retrato de agora ── */}
            <div className="grid gap-3 lg:grid-cols-3">
              <Card className="p-4 lg:col-span-2">
                {!dados.conversas ? <Indisponivel oque="as conversas" /> : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <Titulo>Pessoas esperando resposta há mais de {dias} dias</Titulo>
                        <div className="flex items-baseline gap-3">
                          <span className="text-5xl font-bold tabular-nums" style={{ color: dados.conversas.vencidas > 0 ? '#dc2626' : '#059669' }}>
                            {dados.conversas.vencidas}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            de <b>{dados.conversas.sem_resposta}</b> esperando resposta · <b>{dados.conversas.abertas}</b> conversas abertas hoje
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Retrato de agora, não da janela: conversa aberta cuja última mensagem é da pessoa. A idade conta desde a última mensagem dela.
                        </p>
                      </div>
                      {dados.conversas.novas !== null && (
                        <div className="text-right">
                          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Conversas novas</div>
                          <div className="text-2xl font-bold tabular-nums">{dados.conversas.novas}</div>
                          <div className="text-[11px] text-muted-foreground">{dados.janela.rotulo}</div>
                        </div>
                      )}
                    </div>
                    {listaEspera.length === 0 ? (
                      <p className="mt-3 text-sm text-emerald-700">Ninguém esperando resposta agora.</p>
                    ) : (
                      <div className="mt-3">
                        <div className="text-[11px] text-muted-foreground mb-1">Da espera mais longa para a mais curta · clique para abrir a conversa</div>
                        <ul className="divide-y rounded-md border">
                          {listaVisivel.map(c => (
                            <li key={c.id}>
                              <button type="button" onClick={() => navigate(hrefConversa(c.telefone))}
                                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50">
                                <span className="min-w-0 flex items-center gap-2">
                                  <span className="truncate font-medium">{c.nome || telBonito(c.telefone)}</span>
                                  {c.nome && <span className="hidden sm:inline text-xs text-muted-foreground tabular-nums">{telBonito(c.telefone)}</span>}
                                  <Badge variant="secondary" className="shrink-0">{c.area}</Badge>
                                </span>
                                <span className={`shrink-0 text-xs font-semibold tabular-nums ${c.vencida ? 'text-red-600' : 'text-amber-600'}`}>
                                  {rotuloIdade(c.horas)}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                        {listaEspera.length > 8 && (
                          <button type="button" className="mt-2 text-xs text-primary underline" onClick={() => setVerTodas(v => !v)}>
                            {verTodas ? 'Mostrar menos' : `Mostrar todas (${listaEspera.length}${dados.conversas.sem_resposta > listaEspera.length ? ` das ${dados.conversas.sem_resposta}` : ''})`}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </Card>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                <Card className="p-4">
                  <Titulo>Engajamento dos disparos</Titulo>
                  {!dados.engajamento ? <Indisponivel oque="os disparos" /> : dados.engajamento.enviados === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum disparo saiu na janela.</p>
                  ) : (
                    <>
                      <div className="text-3xl font-bold tabular-nums" style={{ color: C.primary }}>
                        {dados.engajamento.taxa_pct === null ? '—' : `${String(dados.engajamento.taxa_pct).replace('.', ',')}%`}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {dados.engajamento.respondidos} de {dados.engajamento.enviados} disparos receberam mensagem da pessoa em até {dados.engajamento.janela_dias} dias.
                      </p>
                      <div className="mt-2 space-y-1">
                        {dados.engajamento.por_modulo.slice(0, 6).map(m => (
                          <div key={m.modulo} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{m.modulo}</span>
                            <span className="tabular-nums">{m.taxa_pct === null ? '—' : `${String(m.taxa_pct).replace('.', ',')}%`} <span className="text-muted-foreground">({m.respondidos}/{m.enviados})</span></span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </Card>
                <Card className="p-4">
                  <Titulo>Mensagens na janela</Titulo>
                  {!dados.serie ? <Indisponivel oque="as mensagens" /> : (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground"><Inbox className="h-3 w-3" /> Recebidas</div>
                        <div className="text-2xl font-bold tabular-nums" style={{ color: C.primary }}>{totaisSerie.recebidas}</div>
                      </div>
                      <div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground"><Send className="h-3 w-3" /> Enviadas</div>
                        <div className="text-2xl font-bold tabular-nums" style={{ color: '#3b82f6' }}>{totaisSerie.enviadas}</div>
                      </div>
                    </div>
                  )}
                  <p className="mt-1 text-[11px] text-muted-foreground">Só o chat (inbox). Templates da fila estão em Envios, abaixo.</p>
                </Card>
              </div>
            </div>

            {/* ── Linha 2 · pizza por área + linha no tempo ── */}
            <div className="grid gap-3 lg:grid-cols-5">
              <Card className="p-4 lg:col-span-2">
                <Titulo sub="Mensagens recebidas pela área da conversa · Entrada = ainda sem área">Por área</Titulo>
                {!dados.por_area ? <Indisponivel oque="as mensagens por área" /> : pizza.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma mensagem recebida na janela.</p>
                ) : (
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="h-[210px] w-full sm:w-[210px] shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={pizza} cx="50%" cy="50%" innerRadius={52} outerRadius={90} dataKey="value" paddingAngle={2} animationDuration={800}>
                            {pizza.map((d) => <Cell key={d.name} fill={d.color} />)}
                          </Pie>
                          <Tooltip formatter={(v: number, _n: string, item: { payload?: { conversas?: number } }) => [`${v} recebidas · ${item?.payload?.conversas ?? 0} conversas`, '']}
                            contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid var(--cbrio-border)' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <ul className="flex-1 w-full space-y-1 text-xs">
                      {pizza.map(d => (
                        <li key={d.name} className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 min-w-0"><span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.color }} /><span className="truncate">{d.name}</span></span>
                          <span className="tabular-nums shrink-0"><b>{d.value}</b> <span className="text-muted-foreground">· {d.conversas} conv.</span></span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
              <Card className="p-4 lg:col-span-3">
                <Titulo sub={`Recebidas × enviadas ${GRAN_LABEL[dados.janela.gran]} · dia da igreja (Brasília)`}>No tempo</Titulo>
                {!dados.serie ? <Indisponivel oque="a série de mensagens" /> : (
                  <div className="h-[210px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={dados.serie.map(p => ({ ...p, rotulo: chaveLabel(p.chave) }))}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={32} />
                        <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid var(--cbrio-border)' }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="recebidas" name="recebidas" stroke={C.primary} strokeWidth={2} dot={dados.serie.length <= 31} />
                        <Line type="monotone" dataKey="enviadas" name="enviadas" stroke="#3b82f6" strokeWidth={2} dot={dados.serie.length <= 31} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
            </div>

            {/* ── Linha 3 · tempo de resposta humana ── */}
            <Card className="p-4">
              <Titulo sub="Da primeira mensagem da pessoa até a resposta de GENTE (bot e template não contam). Mediana, com o n na frente — são poucas respostas humanas ainda.">
                Tempo de resposta · {dados.janela.rotulo}
              </Titulo>
              {dados.tempo_resposta.n === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma resposta humana registrada na janela.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-[11px] font-semibold text-muted-foreground mb-1">Por atendente</div>
                    <table className="w-full text-sm">
                      <tbody>
                        {dados.tempo_resposta.por_atendente.map(a => (
                          <tr key={a.autor_id} className="border-t">
                            <td className="py-1.5 pr-2 truncate max-w-[220px]">{a.nome || <span className="text-muted-foreground" title={a.autor_id}>atendente {a.autor_id.slice(0, 8)}</span>}</td>
                            <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">n = {a.n}</td>
                            <td className="py-1.5 text-right tabular-nums font-medium"><Clock className="inline h-3 w-3 mr-1 text-muted-foreground" />{fmtMin(a.mediana_min)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-muted-foreground mb-1">Por área</div>
                    <table className="w-full text-sm">
                      <tbody>
                        {dados.tempo_resposta.por_area.map(a => (
                          <tr key={a.area} className="border-t">
                            <td className="py-1.5 pr-2">{a.area}</td>
                            <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">n = {a.n}</td>
                            <td className="py-1.5 text-right tabular-nums font-medium">{fmtMin(a.mediana_min)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Card>

            {/* ── Linha 4 · a fila de templates (o resumo que a aba já tinha, na mesma janela) ── */}
            <div>
              <Titulo sub={`Templates da fila (todos os módulos) · ${dados.janela.rotulo}`}>Envios</Titulo>
              {!dados.fila ? <Indisponivel oque="a fila de envios" /> : (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
                  <StatCard label="Total" value={dados.fila.total} />
                  <StatCard label="Enviados" value={dados.fila.enviados} cor={C.primary} />
                  <StatCard label="Entregues" value={dados.fila.entregues} cor="#0ea5e9" />
                  <StatCard label="Lidos" value={dados.fila.lidos} cor="#7c3aed" />
                  <StatCard label="Pendentes" value={dados.fila.pendentes} cor="#d97706" />
                  <StatCard label="Erros" value={dados.fila.erros} cor="#dc2626" />
                  <StatCard label="Falhas Meta" value={dados.fila.falhos_meta} cor="#dc2626" />
                </div>
              )}
            </div>

            {/* ── Linha 5 · custo estimado (6 meses · por MÓDULO — a Meta cobra por conversa, não por área) ── */}
            {custo && (
              <div className="grid gap-3 lg:grid-cols-3">
                <Card className="p-4">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Custo estimado · {custo.meses} meses</div>
                  <div className="mt-1 text-3xl font-bold tabular-nums" style={{ color: C.primary }}>{brl(custo.total)}</div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {custo.envios_considerados} envios · texto (janela 24h) não custa. Estimativa, não a fatura da Meta.
                  </p>
                  {custo.nao_classificados > 0 && (
                    <p className="mt-2 text-[11px] text-amber-600">
                      ⚠️ {custo.nao_classificados} envio(s) de template <b>sem categoria</b> (custo não somado). Classifique na aba Templates para a estimativa fechar.
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {custo.por_categoria.map((c) => (
                      <Badge key={c.categoria} variant="secondary">{c.categoria}: {brl(c.custo)} ({c.envios})</Badge>
                    ))}
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Por mês</div>
                  <div className="mt-2 space-y-1.5">
                    {custo.por_mes.length === 0 ? <p className="text-sm text-muted-foreground">Sem envios no período.</p>
                      : custo.por_mes.map((m) => {
                        const max = Math.max(...custo.por_mes.map((x) => x.custo), 0.01);
                        return (
                          <div key={m.mes} className="flex items-center gap-2 text-xs">
                            <span className="w-12 text-muted-foreground">{mesLabel(m.mes)}</span>
                            <div className="h-2 flex-1 rounded bg-muted">
                              <div className="h-2 rounded" style={{ width: `${Math.max(3, (m.custo / max) * 100)}%`, background: C.primary }} />
                            </div>
                            <span className="w-16 text-right tabular-nums">{brl(m.custo)}</span>
                          </div>
                        );
                      })}
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Por módulo</div>
                  <div className="mt-2 space-y-1.5">
                    {custo.por_modulo.length === 0 ? <p className="text-sm text-muted-foreground">—</p>
                      : custo.por_modulo.slice(0, 8).map((m) => (
                        <div key={m.modulo} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{m.modulo}</span>
                          <span className="tabular-nums font-medium">{brl(m.custo)}</span>
                        </div>
                      ))}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Gasto por área não existe: a Meta cobra por conversa iniciada, e o que sabemos é o módulo que disparou.</p>
                </Card>
              </div>
            )}
          </>
        )}
    </div>
  );
}
