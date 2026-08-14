// Módulo central de Comunicação (C4) — central de WhatsApp da igreja.
// Abas: dashboard · conversas (chat existente) · envios · programadas ·
// templates · números · atendentes · bot · erros. Backend em /comunicacao/*.
// Reusa o chat (Conversas), o admin do bot (Whatsapp) e o menu (ConversasSetores)
// via import direto dos defaults — nunca reescrevendo o chat.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { comunicacao } from '../api';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Badge } from '../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { toast } from 'sonner';
import {
  Loader2, BarChart3, Inbox, Send, CalendarClock, FileText, Phone, Users,
  Bot, AlertTriangle, RefreshCw, Plus, Trash2, Pencil, Power, Save, X, MessageSquare, Repeat,
  Settings, Coins, BookUser,
} from 'lucide-react';
import Conversas from './Conversas';
import { WhatsappBotConfig } from './admin/Whatsapp';
import ConversasSetores from './admin/ConversasSetores';
import ContatosTab from '../components/comunicacao/ContatosTab';

const C = { primary: '#00B39D' };

// ── util ──────────────────────────────────────────────────────────────
function fmtData(iso?: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return String(iso); }
}
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

// ═══ DASHBOARD ═══════════════════════════════════════════════════════
type Resumo = { dias: number; total: number; enviados: number; pendentes: number; erros: number; entregues: number; lidos: number; falhos_meta: number; orfaos?: number; respostas?: number };

function StatCard({ label, value, cor }: { label: string; value: number | string; cor?: string }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums" style={cor ? { color: cor } : undefined}>{value}</div>
    </Card>
  );
}

type Custo = {
  meses: number; total: number; envios_considerados: number; nao_classificados: number;
  por_mes: { mes: string; custo: number }[];
  por_modulo: { modulo: string; custo: number }[];
  por_categoria: { categoria: string; envios: number; custo: number }[];
};
const brl = (v: number) => `R$ ${(Number(v) || 0).toFixed(2)}`;
const mesLabel = (m: string) => {
  const [a, mm] = m.split('-'); const M = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${M[Number(mm) - 1] || mm}/${String(a).slice(2)}`;
};

function Dashboard() {
  const [dias, setDias] = useState(30);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [custo, setCusto] = useState<Custo | null>(null);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(() => {
    setErro(false); setResumo(null); setCusto(null);
    comunicacao.envios.resumo(dias).then((r: Resumo) => setResumo(r)).catch(() => setErro(true));
    // Custo real por mês/módulo/categoria (janela fixa de 6 meses · independe do seletor de dias)
    comunicacao.custo(6).then((r: Custo) => setCusto(r)).catch(() => setCusto(null));
  }, [dias]);
  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Resumo dos envios de WhatsApp de todos os módulos.</p>
        <div className="flex items-center gap-2">
          <Select value={String(dias)} onValueChange={(v) => setDias(Number(v))}>
            <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={carregar}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>
      {erro ? <ErroBox msg="Falha ao consultar o resumo de envios." onRetry={carregar} />
        : !resumo ? <Spinner />
        : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
              <StatCard label="Total" value={resumo.total} />
              <StatCard label="Enviados" value={resumo.enviados} cor={C.primary} />
              <StatCard label="Entregues" value={resumo.entregues} cor="#0ea5e9" />
              <StatCard label="Lidos" value={resumo.lidos} cor="#7c3aed" />
              <StatCard label="Respostas recebidas" value={resumo.respostas ?? 0} cor="#059669" />
              <StatCard label="Pendentes" value={resumo.pendentes} cor="#d97706" />
              <StatCard label="Erros" value={resumo.erros} cor="#dc2626" />
              <StatCard label="Falhas Meta" value={resumo.falhos_meta} cor="#dc2626" />
            </div>
            {/* Custo estimado real (últimos 6 meses · Σ envios × tarifa da categoria do template) */}
            {custo && (
              <div className="grid gap-3 lg:grid-cols-3">
                <Card className="p-4">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Custo estimado · {custo.meses} meses</div>
                  <div className="mt-1 text-3xl font-bold tabular-nums" style={{ color: C.primary }}>{brl(custo.total)}</div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {custo.envios_considerados} envios · texto (janela 24h) não custa.
                  </p>
                  {custo.nao_classificados > 0 && (
                    <p className="mt-2 text-[11px] text-amber-600">
                      ⚠️ {custo.nao_classificados} envio(s) de template <b>sem categoria</b> (custo não somado). Classifique na aba Templates pra estimativa fechar.
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
                </Card>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Estimativa (não é a fatura da Meta): custo = envios de template × tarifa da categoria. Conversa de serviço/janela 24h não custa.
            </p>
          </>
        )}
    </div>
  );
}

// ═══ ENVIOS (absorveu a aba Erros · decisão do Marcos 13/08) ═════════
// Um histórico só: o status diz se foi ou se deu errado, o filtro recorta,
// e a falha terminal tem o Reenviar na própria linha.
type Envio = {
  id: string; telefone: string; tipo?: string; template?: string; texto?: string;
  contexto?: string; status: string; tentativas?: number; delivered_at?: string;
  read_at?: string; failed_at?: string; criado_em?: string;
  erro?: string | null; erro_status?: string | null;
};
const LIMIT = 100;
function SeloStatus({ e }: { e: Envio }) {
  const selos: React.ReactNode[] = [];
  if (e.failed_at) selos.push(<Badge key="f" variant="destructive">falhou</Badge>);
  if (e.read_at) selos.push(<Badge key="r" style={{ background: '#7c3aed', color: '#fff' }}>lido</Badge>);
  else if (e.delivered_at) selos.push(<Badge key="d" style={{ background: '#0ea5e9', color: '#fff' }}>entregue</Badge>);
  const cor = e.status === 'enviado' ? { background: C.primary, color: '#fff' }
    : e.status === 'erro' ? undefined
    : e.status === 'pendente' ? { background: '#d97706', color: '#fff' } : undefined;
  selos.unshift(<Badge key="s" variant={e.status === 'erro' ? 'destructive' : 'secondary'} style={cor}>{e.status}</Badge>);
  return <div className="flex flex-wrap gap-1">{selos}</div>;
}
function Envios({ podeReenviar }: { podeReenviar: boolean }) {
  const [filtros, setFiltros] = useState({ status: '', contexto: '', telefone: '', de: '', ate: '' });
  const [aplicados, setAplicados] = useState(filtros);
  const [offset, setOffset] = useState(0);
  const [dados, setDados] = useState<{ envios: Envio[]; total: number } | null>(null);
  const [erro, setErro] = useState(false);
  const [orfaos, setOrfaos] = useState(0);
  const [reenvId, setReenvId] = useState<string | null>(null);
  const [telCorrigido, setTelCorrigido] = useState('');

  const carregar = useCallback(() => {
    setErro(false); setDados(null);
    const params: Record<string, unknown> = { limit: LIMIT, offset };
    Object.entries(aplicados).forEach(([k, v]) => { if (v) params[k] = k === 'status' && v === '_all' ? '' : v; });
    comunicacao.envios.list(params).then((r) => setDados(r)).catch(() => setErro(true));
    comunicacao.envios.resumo(30).then((r: Resumo & { orfaos?: number }) => setOrfaos(r?.orfaos || 0)).catch(() => {});
  }, [aplicados, offset]);
  useEffect(() => { carregar(); }, [carregar]);

  function aplicar() { setOffset(0); setAplicados(filtros); }

  async function reenviar(id: string) {
    try {
      await comunicacao.erros.reenviar(id, telCorrigido.replace(/\D/g, '') || undefined);
      toast.success('Reenfileirado — o cron reprocessa em breve.');
      setReenvId(null); setTelCorrigido(''); carregar();
    } catch (e: unknown) { toast.error((e as Error)?.message || 'Erro ao reenviar'); }
  }
  const total = dados?.total || 0;
  const pagina = Math.floor(offset / LIMIT) + 1;
  const totalPaginas = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          <Select value={filtros.status || '_all'} onValueChange={(v) => setFiltros((f) => ({ ...f, status: v === '_all' ? '' : v }))}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todos status</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="enviado">Enviado</SelectItem>
              <SelectItem value="erro">Erro (fila desistiu)</SelectItem>
              <SelectItem value="falha_meta">Falha Meta (não entregue)</SelectItem>
            </SelectContent>
          </Select>
          <Input className="h-9" placeholder="Contexto" value={filtros.contexto} onChange={(e) => setFiltros((f) => ({ ...f, contexto: e.target.value }))} />
          <Input className="h-9" placeholder="Telefone" value={filtros.telefone} onChange={(e) => setFiltros((f) => ({ ...f, telefone: e.target.value }))} />
          <DatePicker className="h-9" value={filtros.de} onChange={(v) => setFiltros((f) => ({ ...f, de: v }))} />
          <DatePicker className="h-9" value={filtros.ate} onChange={(v) => setFiltros((f) => ({ ...f, ate: v }))} />
          <Button className="h-9" onClick={aplicar}>Filtrar</Button>
        </div>
      </Card>
      {orfaos > 0 && (
        <Card className="flex items-center gap-2 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span className="font-medium">{orfaos}</span>
          <span className="text-muted-foreground">recibos da Meta sem envio correspondente (órfãos · 30 dias)</span>
        </Card>
      )}
      {erro ? <ErroBox msg="Falha ao listar os envios." onRetry={carregar} />
        : !dados ? <Spinner />
        : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5 text-left font-medium">Data</th>
                    <th className="px-3 py-2.5 text-left font-medium">Telefone</th>
                    <th className="px-3 py-2.5 text-left font-medium">Tipo</th>
                    <th className="px-3 py-2.5 text-left font-medium">Template / texto</th>
                    <th className="px-3 py-2.5 text-left font-medium">Contexto</th>
                    <th className="px-3 py-2.5 text-left font-medium">Status</th>
                    <th className="px-3 py-2.5 text-center font-medium">Tent.</th>
                    <th className="px-3 py-2.5 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {dados.envios.length === 0 ? (
                    <tr><td colSpan={8} className="py-10 text-center text-sm text-muted-foreground">Nenhum envio encontrado.</td></tr>
                  ) : dados.envios.map((e) => (
                    <tr key={e.id} className="border-b border-border/60 hover:bg-muted/40">
                      <td className="whitespace-nowrap px-3 py-2 text-xs">{fmtData(e.criado_em)}</td>
                      <td className="px-3 py-2 tabular-nums">{e.telefone}</td>
                      <td className="px-3 py-2 text-xs">{e.tipo || '—'}</td>
                      <td className="max-w-[280px] truncate px-3 py-2" title={e.template || e.texto}>{e.template || e.texto || '—'}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{e.contexto || '—'}</td>
                      {/* o hover conta O QUE deu errado (erro da fila ou motivo do failed da Meta) */}
                      <td className="px-3 py-2" title={e.erro || e.erro_status || undefined}><SeloStatus e={e} /></td>
                      <td className="px-3 py-2 text-center tabular-nums">{e.tentativas ?? 0}</td>
                      <td className="px-3 py-2 text-right">
                        {e.status === 'erro' && (reenvId === e.id ? (
                          <div className="flex items-center justify-end gap-1">
                            <Input className="h-8 w-36" placeholder="telefone (opcional)" value={telCorrigido} onChange={(ev) => setTelCorrigido(ev.target.value)} />
                            <Button size="sm" onClick={() => reenviar(e.id)}>Enviar</Button>
                            <button onClick={() => { setReenvId(null); setTelCorrigido(''); }} className="p-1 text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" disabled={!podeReenviar} onClick={() => { setReenvId(e.id); setTelCorrigido(''); }} className="gap-1">
                            <Send className="h-3.5 w-3.5" />Reenviar
                          </Button>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
              <span>{total} envios · página {pagina}/{totalPaginas}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - LIMIT))}>Anterior</Button>
                <Button variant="outline" size="sm" disabled={offset + LIMIT >= total} onClick={() => setOffset((o) => o + LIMIT)}>Próxima</Button>
              </div>
            </div>
          </Card>
        )}
    </div>
  );
}

// ═══ PROGRAMADAS (agendamentos) ══════════════════════════════════════
type Agendamento = {
  id: string; nome: string; template_nome?: string | null; texto?: string | null;
  params?: string[]; audiencia?: { tipo: string; telefones?: string[] };
  quando?: string | null; recorrencia?: string | null; dia_semana?: number | null;
  dia_mes?: number | null; hora?: string | null; ativo?: boolean; ultimo_disparo?: string | null;
};
const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const AGEND_VAZIO = { nome: '', template_nome: '', texto: '', params: '', recorrencia: 'unica', dia_semana: '1', dia_mes: '1', hora: '09:00', quando: '', telefones: '' };

function Programadas({ podeEscrever, podeExcluir }: { podeEscrever: boolean; podeExcluir: boolean }) {
  const [lista, setLista] = useState<Agendamento[] | null>(null);
  const [erro, setErro] = useState(false);
  const [form, setForm] = useState({ ...AGEND_VAZIO });
  const [editId, setEditId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    setErro(false);
    comunicacao.agendamentos.list().then((r: Agendamento[]) => setLista(r || [])).catch(() => { setLista([]); setErro(true); });
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  function resetar() { setForm({ ...AGEND_VAZIO }); setEditId(null); }
  function editar(a: Agendamento) {
    setEditId(a.id);
    setForm({
      nome: a.nome || '', template_nome: a.template_nome || '', texto: a.texto || '',
      params: (a.params || []).join(', '),
      recorrencia: a.quando ? 'unica' : (a.recorrencia || 'unica'),
      dia_semana: String(a.dia_semana ?? 1), dia_mes: String(a.dia_mes ?? 1),
      hora: a.hora ? String(a.hora).slice(0, 5) : '09:00',
      quando: a.quando ? String(a.quando).slice(0, 16) : '',
      telefones: (a.audiencia?.telefones || []).join('\n'),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function salvar() {
    const telefones = form.telefones.split('\n').map((t) => t.replace(/\D/g, '')).filter(Boolean);
    if (!form.nome.trim()) { toast.error('Informe o nome.'); return; }
    if (!form.template_nome.trim() && !form.texto.trim()) { toast.error('Informe o template ou o texto.'); return; }
    if (telefones.length === 0) { toast.error('Informe ao menos um telefone na audiência.'); return; }
    const body: Record<string, unknown> = {
      nome: form.nome.trim(),
      template_nome: form.template_nome.trim() || null,
      texto: form.texto.trim() || null,
      params: form.params.split(',').map((p) => p.trim()).filter(Boolean),
      audiencia: { tipo: 'telefones', telefones },
    };
    if (form.recorrencia === 'unica') {
      if (!form.quando) { toast.error('Informe a data/hora do disparo único.'); return; }
      body.quando = new Date(form.quando).toISOString();
      body.recorrencia = null;
    } else {
      body.recorrencia = form.recorrencia;
      body.hora = form.hora;
      body.quando = null;
      if (form.recorrencia === 'semanal') body.dia_semana = Number(form.dia_semana);
      if (form.recorrencia === 'mensal') body.dia_mes = Number(form.dia_mes);
    }
    setSalvando(true);
    try {
      if (editId) { await comunicacao.agendamentos.atualizar(editId, body); toast.success('Programada atualizada'); }
      else { await comunicacao.agendamentos.criar(body); toast.success('Programada criada'); }
      resetar(); carregar();
    } catch (e: unknown) { toast.error((e as Error)?.message || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  }
  async function toggleAtivo(a: Agendamento) {
    try { await comunicacao.agendamentos.atualizar(a.id, { ativo: !a.ativo }); carregar(); }
    catch (e: unknown) { toast.error((e as Error)?.message || 'Erro'); }
  }
  async function remover(id: string) {
    if (!window.confirm('Excluir esta programada?')) return;
    try { await comunicacao.agendamentos.remover(id); if (editId === id) resetar(); carregar(); }
    catch (e: unknown) { toast.error((e as Error)?.message || 'Erro ao excluir'); }
  }
  function descrRecorrencia(a: Agendamento) {
    if (a.quando) return `Única · ${fmtData(a.quando)}`;
    if (a.recorrencia === 'diaria') return `Diária · ${a.hora || '09:00'}`;
    if (a.recorrencia === 'semanal') return `Semanal · ${DIAS_SEMANA[a.dia_semana ?? 0]} ${a.hora || ''}`;
    if (a.recorrencia === 'mensal') return `Mensal · dia ${a.dia_mes} ${a.hora || ''}`;
    return '—';
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="space-y-3">
        {erro ? <ErroBox msg="Falha ao listar programadas." onRetry={carregar} />
          : lista === null ? <Spinner />
          : lista.length === 0 ? <Card className="p-8 text-center text-sm text-muted-foreground">Nenhuma programada. {podeEscrever ? 'Crie ao lado. →' : ''}</Card>
          : lista.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{a.nome}</span>
                    <Badge variant={a.ativo ? 'default' : 'secondary'}>{a.ativo ? 'ativa' : 'pausada'}</Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{descrRecorrencia(a)} · {a.audiencia?.telefones?.length || 0} destinatários</div>
                  <div className="mt-1 text-xs">{a.template_nome ? <Badge variant="outline">template: {a.template_nome}</Badge> : <span className="line-clamp-2 text-muted-foreground">{a.texto}</span>}</div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button title={a.ativo ? 'Pausar' : 'Ativar'} disabled={!podeEscrever} onClick={() => toggleAtivo(a)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"><Power className="h-4 w-4" /></button>
                  <button title="Editar" disabled={!podeEscrever} onClick={() => editar(a)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-primary disabled:opacity-40"><Pencil className="h-4 w-4" /></button>
                  <button title="Excluir" disabled={!podeExcluir} onClick={() => remover(a.id)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </Card>
          ))}
      </div>
      <Card className="space-y-3 self-start p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-primary" />{editId ? 'Editar programada' : 'Nova programada'}</p>
        <Input placeholder="Nome" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} disabled={!podeEscrever} />
        <Input placeholder="Template (nome exato · opcional)" value={form.template_nome} onChange={(e) => setForm((f) => ({ ...f, template_nome: e.target.value }))} disabled={!podeEscrever} />
        <textarea placeholder="Texto (se não usar template)" rows={3} value={form.texto} onChange={(e) => setForm((f) => ({ ...f, texto: e.target.value }))} disabled={!podeEscrever}
          className="w-full resize-none rounded-lg border border-border bg-background p-2 text-sm outline-none focus:border-primary disabled:opacity-50" />
        <Input placeholder="Params do template (separados por vírgula)" value={form.params} onChange={(e) => setForm((f) => ({ ...f, params: e.target.value }))} disabled={!podeEscrever} />
        <div className="grid grid-cols-2 gap-2">
          <Select value={form.recorrencia} onValueChange={(v) => setForm((f) => ({ ...f, recorrencia: v }))} >
            <SelectTrigger className="h-9" disabled={!podeEscrever}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unica">Única</SelectItem>
              <SelectItem value="diaria">Diária</SelectItem>
              <SelectItem value="semanal">Semanal</SelectItem>
              <SelectItem value="mensal">Mensal</SelectItem>
            </SelectContent>
          </Select>
          {form.recorrencia === 'unica' ? (
            <Input type="datetime-local" value={form.quando} onChange={(e) => setForm((f) => ({ ...f, quando: e.target.value }))} disabled={!podeEscrever} className="h-9" />
          ) : (
            <Input type="time" value={form.hora} onChange={(e) => setForm((f) => ({ ...f, hora: e.target.value }))} disabled={!podeEscrever} className="h-9" />
          )}
        </div>
        {form.recorrencia === 'semanal' && (
          <Select value={form.dia_semana} onValueChange={(v) => setForm((f) => ({ ...f, dia_semana: v }))}>
            <SelectTrigger className="h-9" disabled={!podeEscrever}><SelectValue /></SelectTrigger>
            <SelectContent>{DIAS_SEMANA.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {form.recorrencia === 'mensal' && (
          <Input type="number" min={1} max={31} placeholder="Dia do mês" value={form.dia_mes} onChange={(e) => setForm((f) => ({ ...f, dia_mes: e.target.value }))} disabled={!podeEscrever} className="h-9" />
        )}
        <textarea placeholder="Audiência — um telefone por linha" rows={5} value={form.telefones} onChange={(e) => setForm((f) => ({ ...f, telefones: e.target.value }))} disabled={!podeEscrever}
          className="w-full resize-none rounded-lg border border-border bg-background p-2 font-mono text-xs outline-none focus:border-primary disabled:opacity-50" />
        <div className="flex gap-2">
          {editId && <Button variant="outline" className="flex-1" onClick={resetar}>Cancelar</Button>}
          <Button className="flex-1 gap-1.5" disabled={!podeEscrever || salvando} onClick={salvar}>{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{editId ? 'Salvar' : 'Criar'}</Button>
        </div>
      </Card>
    </div>
  );
}

// ═══ TEMPLATES ═══════════════════════════════════════════════════════
type Template = { id: string; nome: string; idioma?: string; categoria?: string; status_meta?: string; params_body?: number; modulo?: string | null; ativo?: boolean };
function SeloMeta({ s }: { s?: string }) {
  const st = (s || '').toUpperCase();
  const map: Record<string, { cls: string }> = {
    APPROVED: { cls: 'bg-emerald-500/15 text-emerald-600' },
    REJECTED: { cls: 'bg-rose-500/15 text-rose-600' },
    PENDING: { cls: 'bg-amber-500/15 text-amber-600' },
  };
  const m = map[st] || { cls: 'bg-slate-500/15 text-slate-600' };
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${m.cls}`}>{st || '—'}</span>;
}
function Templates({ podeSync, podeEditar }: { podeSync: boolean; podeEditar: boolean }) {
  const [lista, setLista] = useState<Template[] | null>(null);
  const [erro, setErro] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ modulo: '', ativo: true, categoria: '' });

  const carregar = useCallback(() => {
    setErro(false);
    comunicacao.templates.list().then((r: Template[]) => setLista(r || [])).catch(() => { setLista([]); setErro(true); });
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function sincronizar() {
    setSincronizando(true);
    try {
      const r: Record<string, unknown> = await comunicacao.templates.sync();
      const qtd = Number(r?.sincronizados ?? r?.total ?? r?.count ?? 0);
      if (r?.erro) {
        // A Meta recusou a leitura do catálogo (token sem whatsapp_business_management,
        // WABA não atribuída ao System User, ou WHATSAPP_BUSINESS_ACCOUNT_ID errado).
        // Mostra a mensagem crua da Meta pra dar pra diagnosticar sem abrir os logs.
        toast.error(`Meta recusou o catálogo: ${String(r.erro)}`, { duration: 12000 });
      } else if (qtd === 0) {
        toast.warning('Sincronizou, mas a Meta não retornou nenhum template. Confira o WHATSAPP_BUSINESS_ACCOUNT_ID.', { duration: 10000 });
      } else {
        toast.success(`Sincronizado com a Meta · ${qtd} templates com status/categoria`);
      }
      carregar();
    } catch (e: unknown) { toast.error((e as Error)?.message || 'Erro ao sincronizar'); }
    finally { setSincronizando(false); }
  }
  function editar(t: Template) { setEditId(t.id); setEditForm({ modulo: t.modulo || '', ativo: t.ativo !== false, categoria: t.categoria || '' }); }
  async function salvarEdit(id: string) {
    try { await comunicacao.templates.atualizar(id, { modulo: editForm.modulo || null, ativo: editForm.ativo, categoria: editForm.categoria || null }); toast.success('Template atualizado'); setEditId(null); carregar(); }
    catch (e: unknown) { toast.error((e as Error)?.message || 'Erro'); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Catálogo espelhado da Meta. O status é definido pela Meta na aprovação.</p>
        <Button size="sm" className="gap-1.5" disabled={!podeSync || sincronizando} onClick={sincronizar}>
          {sincronizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Sincronizar com a Meta
        </Button>
      </div>
      {erro ? <ErroBox msg="Falha ao listar templates." onRetry={carregar} />
        : lista === null ? <Spinner />
        : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5 text-left font-medium">Nome</th>
                    <th className="px-3 py-2.5 text-left font-medium">Idioma</th>
                    <th className="px-3 py-2.5 text-left font-medium">Categoria</th>
                    <th className="px-3 py-2.5 text-left font-medium">Status Meta</th>
                    <th className="px-3 py-2.5 text-center font-medium">Params</th>
                    <th className="px-3 py-2.5 text-left font-medium">Módulo dono</th>
                    <th className="px-3 py-2.5 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {lista.length === 0 ? (
                    <tr><td colSpan={7} className="py-10 text-center text-sm text-muted-foreground">Nenhum template. Sincronize com a Meta.</td></tr>
                  ) : lista.map((t) => (
                    <tr key={t.id} className="border-b border-border/60 hover:bg-muted/40">
                      <td className="px-3 py-2 font-medium">{t.nome}</td>
                      <td className="px-3 py-2 text-xs">{t.idioma || '—'}</td>
                      <td className="px-3 py-2 text-xs">
                        {editId === t.id ? (
                          <select className="h-8 rounded border border-input bg-background px-1 text-xs"
                            value={editForm.categoria}
                            onChange={(e) => setEditForm((f) => ({ ...f, categoria: e.target.value }))}>
                            <option value="">— categoria —</option>
                            <option value="utility">utility</option>
                            <option value="marketing">marketing</option>
                            <option value="authentication">authentication</option>
                            <option value="service">service</option>
                          </select>
                        ) : (t.categoria || '—')}
                      </td>
                      <td className="px-3 py-2"><SeloMeta s={t.status_meta} /></td>
                      <td className="px-3 py-2 text-center tabular-nums">{t.params_body ?? 0}</td>
                      <td className="px-3 py-2">
                        {editId === t.id ? (
                          <div className="flex items-center gap-1">
                            <Input className="h-8 w-28" value={editForm.modulo} onChange={(e) => setEditForm((f) => ({ ...f, modulo: e.target.value }))} placeholder="slug" />
                            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={editForm.ativo} onChange={(e) => setEditForm((f) => ({ ...f, ativo: e.target.checked }))} />ativo</label>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {t.modulo ? <Badge variant="outline">{t.modulo}</Badge> : <span className="text-xs text-muted-foreground">—</span>}
                            {t.ativo === false && <Badge variant="secondary">inativo</Badge>}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {editId === t.id ? (
                          <div className="flex justify-end gap-1">
                            <button onClick={() => salvarEdit(t.id)} className="rounded p-1.5 text-muted-foreground hover:text-primary" title="Salvar"><Save className="h-4 w-4" /></button>
                            <button onClick={() => setEditId(null)} className="rounded p-1.5 text-muted-foreground hover:text-destructive" title="Cancelar"><X className="h-4 w-4" /></button>
                          </div>
                        ) : (
                          <button disabled={!podeEditar} onClick={() => editar(t)} className="rounded p-1.5 text-muted-foreground hover:text-primary disabled:opacity-40" title="Editar"><Pencil className="h-4 w-4" /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
    </div>
  );
}

// ═══ NÚMEROS ═════════════════════════════════════════════════════════
type Numero = { id: string; phone_number_id: string; rotulo?: string | null; waba_id?: string | null; is_default?: boolean; ativo?: boolean };
function Numeros({ podeEscrever }: { podeEscrever: boolean }) {
  const [dados, setDados] = useState<{ numeros: Numero[]; env_phone_number_id: string | null } | null>(null);
  const [erro, setErro] = useState(false);
  const [form, setForm] = useState({ phone_number_id: '', rotulo: '', waba_id: '', is_default: true });
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    setErro(false);
    comunicacao.numeros.list().then((r) => setDados(r)).catch(() => setErro(true));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function salvar() {
    if (!form.phone_number_id.trim()) { toast.error('Informe o phone_number_id.'); return; }
    setSalvando(true);
    try {
      await comunicacao.numeros.criar({ phone_number_id: form.phone_number_id.trim(), rotulo: form.rotulo.trim() || null, waba_id: form.waba_id.trim() || null, is_default: form.is_default });
      toast.success('Número cadastrado');
      setForm({ phone_number_id: '', rotulo: '', waba_id: '', is_default: true }); carregar();
    } catch (e: unknown) { toast.error((e as Error)?.message || 'Erro ao cadastrar'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        {erro ? <ErroBox msg="Falha ao listar números." onRetry={carregar} />
          : !dados ? <Spinner />
          : (
            <>
              {(!dados.numeros || dados.numeros.length === 0) && dados.env_phone_number_id && (
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-sm font-medium"><Phone className="h-4 w-4 text-primary" />Número em uso (env)</div>
                  <div className="mt-1 text-xs text-muted-foreground">Ainda não há número cadastrado. O envio usa o da variável de ambiente:</div>
                  <div className="mt-1 font-mono text-sm">{dados.env_phone_number_id}</div>
                </Card>
              )}
              {(dados.numeros || []).map((n) => (
                <Card key={n.id} className="flex items-center justify-between p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{n.rotulo || 'Sem rótulo'}</span>
                      {n.is_default && <Badge variant="default">padrão</Badge>}
                      {n.ativo === false && <Badge variant="secondary">inativo</Badge>}
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-muted-foreground">phone_number_id: {n.phone_number_id}</div>
                    {n.waba_id && <div className="font-mono text-xs text-muted-foreground">waba_id: {n.waba_id}</div>}
                  </div>
                </Card>
              ))}
              {dados.numeros && dados.numeros.length === 0 && !dados.env_phone_number_id && (
                <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum número.</Card>
              )}
            </>
          )}
      </div>
      <Card className="space-y-3 self-start p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold"><Phone className="h-4 w-4 text-primary" />Cadastrar número</p>
        <Input placeholder="phone_number_id" value={form.phone_number_id} onChange={(e) => setForm((f) => ({ ...f, phone_number_id: e.target.value }))} disabled={!podeEscrever} />
        <Input placeholder="Rótulo (ex.: Número principal)" value={form.rotulo} onChange={(e) => setForm((f) => ({ ...f, rotulo: e.target.value }))} disabled={!podeEscrever} />
        <Input placeholder="waba_id (opcional)" value={form.waba_id} onChange={(e) => setForm((f) => ({ ...f, waba_id: e.target.value }))} disabled={!podeEscrever} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_default} onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))} disabled={!podeEscrever} />Número padrão</label>
        <Button className="w-full gap-1.5" disabled={!podeEscrever || salvando} onClick={salvar}>{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Cadastrar</Button>
      </Card>
    </div>
  );
}

// ═══ ATENDENTES ══════════════════════════════════════════════════════
type Atendente = { id: string; profile_id: string; areas?: string[]; horarios?: { dia: number; inicio: string; fim: string }[]; ativo?: boolean; profile?: { id: string; name?: string; email?: string } };
type Perfil = { id: string; name?: string; email?: string };
const HORARIO_VAZIO = { dia: 1, inicio: '09:00', fim: '18:00' };

function Atendentes({ podeEscrever }: { podeEscrever: boolean }) {
  const [lista, setLista] = useState<Atendente[] | null>(null);
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [erro, setErro] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<{ profile_id: string; areas: string; horarios: { dia: number; inicio: string; fim: string }[] }>({ profile_id: '', areas: '', horarios: [{ ...HORARIO_VAZIO }] });
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    setErro(false);
    comunicacao.atendentes.list().then((r: Atendente[]) => setLista(r || [])).catch(() => { setLista([]); setErro(true); });
  }, []);
  useEffect(() => {
    carregar();
    // Reusa o seletor de usuários do sistema (/auth/users) pra escolher o profile.
    import('../api').then(({ users }) => users.list().then((r: Perfil[] | { users?: Perfil[] }) => {
      setPerfis(Array.isArray(r) ? r : (r?.users || []));
    }).catch(() => setPerfis([])));
  }, [carregar]);

  function resetar() { setForm({ profile_id: '', areas: '', horarios: [{ ...HORARIO_VAZIO }] }); setEditId(null); }
  function editar(a: Atendente) {
    setEditId(a.id);
    setForm({ profile_id: a.profile_id, areas: (a.areas || []).join(', '), horarios: (a.horarios && a.horarios.length ? a.horarios : [{ ...HORARIO_VAZIO }]) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function setHorario(i: number, patch: Partial<{ dia: number; inicio: string; fim: string }>) {
    setForm((f) => ({ ...f, horarios: f.horarios.map((h, idx) => idx === i ? { ...h, ...patch } : h) }));
  }
  async function salvar() {
    if (!form.profile_id) { toast.error('Selecione o colaborador.'); return; }
    const body = {
      profile_id: form.profile_id,
      areas: form.areas.split(',').map((a) => a.trim()).filter(Boolean),
      horarios: form.horarios.filter((h) => h.inicio && h.fim),
    };
    setSalvando(true);
    try {
      if (editId) { await comunicacao.atendentes.atualizar(editId, { areas: body.areas, horarios: body.horarios }); toast.success('Atendente atualizado'); }
      else { await comunicacao.atendentes.criar(body); toast.success('Atendente adicionado'); }
      resetar(); carregar();
    } catch (e: unknown) { toast.error((e as Error)?.message || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  }
  async function toggleAtivo(a: Atendente) {
    try { await comunicacao.atendentes.atualizar(a.id, { ativo: !a.ativo }); carregar(); }
    catch (e: unknown) { toast.error((e as Error)?.message || 'Erro'); }
  }
  const nomePerfil = (a: Atendente) => a.profile?.name || a.profile?.email || perfis.find((p) => p.id === a.profile_id)?.name || a.profile_id;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="space-y-3">
        {erro ? <ErroBox msg="Falha ao listar atendentes." onRetry={carregar} />
          : lista === null ? <Spinner />
          : lista.length === 0 ? <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum atendente. {podeEscrever ? 'Adicione ao lado. →' : ''}</Card>
          : lista.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{nomePerfil(a)}</span>
                    {a.ativo === false && <Badge variant="secondary">inativo</Badge>}
                  </div>
                  {a.areas && a.areas.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">{a.areas.map((ar) => <Badge key={ar} variant="outline">{ar}</Badge>)}</div>
                  )}
                  {a.horarios && a.horarios.length > 0 && (
                    <div className="mt-1.5 text-xs text-muted-foreground">{a.horarios.map((h, i) => <span key={i} className="mr-2">{DIAS_SEMANA[h.dia]?.slice(0, 3)} {h.inicio}–{h.fim}</span>)}</div>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button title={a.ativo === false ? 'Ativar' : 'Desativar'} disabled={!podeEscrever} onClick={() => toggleAtivo(a)} className="rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-40"><Power className="h-4 w-4" /></button>
                  <button title="Editar" disabled={!podeEscrever} onClick={() => editar(a)} className="rounded p-1.5 text-muted-foreground hover:text-primary disabled:opacity-40"><Pencil className="h-4 w-4" /></button>
                </div>
              </div>
            </Card>
          ))}
      </div>
      <Card className="space-y-3 self-start p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold"><Users className="h-4 w-4 text-primary" />{editId ? 'Editar atendente' : 'Novo atendente'}</p>
        {editId ? (
          <div className="rounded-lg border border-border bg-muted/40 p-2 text-sm">{nomePerfil(lista?.find((x) => x.id === editId) as Atendente)}</div>
        ) : perfis.length > 0 ? (
          <Select value={form.profile_id} onValueChange={(v) => setForm((f) => ({ ...f, profile_id: v }))}>
            <SelectTrigger className="h-9" disabled={!podeEscrever}><SelectValue placeholder="Selecione o colaborador" /></SelectTrigger>
            <SelectContent>{perfis.map((p) => <SelectItem key={p.id} value={p.id}>{p.name || p.email}</SelectItem>)}</SelectContent>
          </Select>
        ) : (
          <Input placeholder="profile_id" value={form.profile_id} onChange={(e) => setForm((f) => ({ ...f, profile_id: e.target.value }))} disabled={!podeEscrever} />
        )}
        <Input placeholder="Áreas (separadas por vírgula)" value={form.areas} onChange={(e) => setForm((f) => ({ ...f, areas: e.target.value }))} disabled={!podeEscrever} />
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Escala / horários</div>
          {form.horarios.map((h, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Select value={String(h.dia)} onValueChange={(v) => setHorario(i, { dia: Number(v) })}>
                <SelectTrigger className="h-8 w-[110px]" disabled={!podeEscrever}><SelectValue /></SelectTrigger>
                <SelectContent>{DIAS_SEMANA.map((d, idx) => <SelectItem key={idx} value={String(idx)}>{d}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="time" className="h-8" value={h.inicio} onChange={(e) => setHorario(i, { inicio: e.target.value })} disabled={!podeEscrever} />
              <Input type="time" className="h-8" value={h.fim} onChange={(e) => setHorario(i, { fim: e.target.value })} disabled={!podeEscrever} />
              <button disabled={!podeEscrever} onClick={() => setForm((f) => ({ ...f, horarios: f.horarios.filter((_, idx) => idx !== i) }))} className="text-muted-foreground hover:text-destructive disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <Button variant="outline" size="sm" disabled={!podeEscrever} onClick={() => setForm((f) => ({ ...f, horarios: [...f.horarios, { ...HORARIO_VAZIO }] }))} className="gap-1"><Plus className="h-3.5 w-3.5" />Horário</Button>
        </div>
        <div className="flex gap-2">
          {editId && <Button variant="outline" className="flex-1" onClick={resetar}>Cancelar</Button>}
          <Button className="flex-1 gap-1.5" disabled={!podeEscrever || salvando} onClick={salvar}>{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{editId ? 'Salvar' : 'Adicionar'}</Button>
        </div>
      </Card>
    </div>
  );
}

// ═══ BOT (absorve as telas admin) ════════════════════════════════════
// Aba Bot enxuta (13/08 · decisão do Marcos): sobraram o MENU (que na F3 vira
// fluxos por opção) e a CONFIGURAÇÃO do bot. Coletas foi APOSENTADA (os
// líderes de integração não compraram a ideia) e Avisos idem (substituído
// pelas Programadas com audiência — o broadcast antigo nem persistia o
// resultado). A tela antiga segue no repo (admin/Whatsapp.jsx · dormante).
function BotAdmin() {
  return (
    <Tabs defaultValue="menu" className="space-y-4">
      <TabsList>
        <TabsTrigger value="menu"><Bot className="mr-1.5 h-3.5 w-3.5" />Menu do bot</TabsTrigger>
        <TabsTrigger value="config"><MessageSquare className="mr-1.5 h-3.5 w-3.5" />Configuração</TabsTrigger>
      </TabsList>
      <TabsContent value="menu"><ConversasSetores /></TabsContent>
      <TabsContent value="config"><WhatsappBotConfig /></TabsContent>
    </Tabs>
  );
}

// ═══ AUTOMÁTICAS ═════════════════════════════════════════════════════
// "Quem recebe as mensagens que o sistema manda sozinho?" (pedido do Matheus ·
// 05/08). Somente leitura: descreve o que os crons disparam. Não liga/desliga
// nada — cada disparo é operado no módulo dono.
type PessoaAuto = { nome: string; telefone: string | null; quando: string; hoje?: boolean; optin?: boolean };
type ItemAuto = {
  id: string; nome: string; quando: string; regra: string; fonte: string;
  contexto: string | null; template_configurado: boolean | null; env_template: string | null;
  total: number | null; universo?: { rotulo: string; qtd: number };
  bloqueios?: string[];
  fora?: { motivo: string; qtd: number }[];
  pessoas?: PessoaAuto[]; pessoas_truncadas?: boolean;
  enviados?: number | null; nao_entregues?: number | null;
  fora_do_historico?: boolean; motivo_falha?: string | null; erro?: string;
};

function CardAutomatica({ item }: { item: ItemAuto }) {
  const [abrir, setAbrir] = useState(false);
  // "Encaixa na regra" × "saiu de fato" medem coisas diferentes. Divergir muito
  // é sinal de envio quebrado — foi assim que o devocional ficou 187 dias
  // falhando sem ninguém notar.
  const quebrado = (item.total || 0) > 0 && item.enviados === 0 && (item.nao_entregues || 0) > 0;
  const travado = !!item.bloqueios?.length;

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{item.nome}</span>
            {travado && <Badge variant="outline" className="border-amber-500 text-amber-600">não está enviando</Badge>}
            {quebrado && <Badge variant="destructive">não está entregando</Badge>}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{item.quando}</div>
          <p className="mt-2 max-w-2xl text-[13px] leading-snug">{item.regra}</p>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {travado ? 'Se encaixam na regra' : 'Recebem hoje'}
          </div>
          {/* ⚠️ Com trava ativa o número fica CINZA e o rótulo muda: ele deixa de
              ser "quem recebe" e passa a ser "quem receberia" — pintar de verde
              faria ler como envio acontecendo. */}
          <div
            className="text-3xl font-bold tabular-nums"
            style={{ color: travado ? undefined : C.primary, opacity: travado ? 0.55 : 1 }}
          >
            {item.total ?? '—'}
          </div>
          {item.universo && (
            <div className="text-[11px] text-muted-foreground">de {item.universo.qtd} {item.universo.rotulo}</div>
          )}
        </div>
      </div>

      {travado && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
          <div className="text-xs font-semibold text-amber-700 dark:text-amber-500">
            Por que nada está saindo:
          </div>
          <ul className="mt-1 space-y-0.5">
            {item.bloqueios!.map((b) => (
              <li key={b} className="text-xs text-amber-700 dark:text-amber-500">• {b}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-2.5 text-xs">
        <span className="text-muted-foreground">
          Enviadas (30d): <b className="tabular-nums text-foreground">{item.enviados ?? '—'}</b>
        </span>
        <span className="text-muted-foreground">
          Não entregues: <b className={`tabular-nums ${(item.nao_entregues || 0) > 0 ? 'text-red-600' : 'text-foreground'}`}>{item.nao_entregues ?? '—'}</b>
        </span>
        {item.fora_do_historico && (
          <span className="text-amber-600">⚠️ não passa pela fila — fica fora do histórico de envios</span>
        )}
        {item.motivo_falha && <span className="text-red-600">erro: {item.motivo_falha}</span>}
      </div>

      {!!item.fora?.length && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2.5">
          {item.fora.map((f) => (
            <Badge key={f.motivo} variant="secondary" className="font-normal">
              {f.qtd} — {f.motivo}
            </Badge>
          ))}
        </div>
      )}

      {item.erro && (
        <div className="px-4 pb-3 text-xs text-red-600">Não foi possível calcular o público: {item.erro}</div>
      )}

      {!!item.pessoas?.length && (
        <div className="border-t border-border">
          <button
            onClick={() => setAbrir((v) => !v)}
            className="w-full px-4 py-2.5 text-left text-xs font-medium text-muted-foreground hover:bg-muted/40"
          >
            {abrir ? 'Esconder' : 'Ver'} quem recebe ({item.pessoas.length}{item.pessoas_truncadas ? ' primeiras' : ''})
          </button>
          {abrir && (
            <div className="max-h-72 overflow-y-auto border-t border-border">
              <table className="w-full text-sm">
                <tbody>
                  {item.pessoas.map((p, i) => (
                    <tr key={`${p.nome}-${i}`} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-1.5">{p.nome}</td>
                      <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{p.telefone || '—'}</td>
                      <td className="px-3 py-1.5 text-right text-xs text-muted-foreground">
                        {p.hoje && p.quando !== 'todo dia' ? <b className="text-foreground">{p.quando}</b> : p.quando}
                        {p.optin === false && <span className="ml-2 text-amber-600">sem opt-in</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {item.pessoas_truncadas && (
                <div className="px-4 py-2 text-[11px] text-muted-foreground">
                  Lista cortada pra não pesar a tela — a contagem acima é o total real.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="border-t border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
        Quem dispara: <code>{item.fonte}</code>
      </div>
    </Card>
  );
}

function Automaticas() {
  const [dados, setDados] = useState<{ itens: ItemAuto[]; pessoas_ocultas?: boolean } | null>(null);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(() => {
    setErro(false); setDados(null);
    comunicacao.automaticas({ pessoas: true, dias: 30 })
      .then((r: { itens: ItemAuto[] }) => setDados(r)).catch(() => setErro(true));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  if (erro) return <ErroBox msg="Falha ao carregar os disparos automáticos." onRetry={carregar} />;
  if (!dados) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Mensagens que o sistema manda <b>sozinho</b>, sem ninguém apertar nada. Cada card mostra a regra
          de quem entra, quantas pessoas se encaixam hoje e o que saiu de fato nos últimos 30 dias.
          Esta tela é só de leitura — cada disparo é operado no módulo dono.
        </p>
        <Button variant="outline" size="sm" onClick={carregar}><RefreshCw className="h-4 w-4" /></Button>
      </div>
      {dados.pessoas_ocultas && (
        <Card className="p-3 text-xs text-amber-600">
          Você vê as contagens, mas a lista de nomes e telefones exige nível 2 no módulo.
        </Card>
      )}
      <div className="space-y-3">
        {dados.itens.map((i) => <CardAutomatica key={i.id} item={i} />)}
      </div>
    </div>
  );
}

// ═══ PÁGINA ══════════════════════════════════════════════════════════
// Reorganização de 13/08 (pedido do Marcos): 10 abas viraram 6.
// Disparos = Programadas ∪ Automáticas (um filtro) · Erros entrou em Envios
// (coluna de status + reenviar na linha) · Templates/Números/Atendentes/
// Tarifas viraram sub-abas de Configurações.
const TABS = ['dashboard', 'conversas', 'envios', 'disparos', 'contatos', 'bot', 'config'];
// Deep-links antigos (?tab=programadas etc.) caem na aba nova certa.
const TAB_LEGADO: Record<string, string> = {
  programadas: 'disparos', automaticas: 'disparos', erros: 'envios',
  templates: 'config', numeros: 'config', atendentes: 'config',
};

export default function Comunicacao() {
  const { getAccessLevel } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') || 'dashboard';
  const tabUrl = TAB_LEGADO[tabParam] || tabParam;

  const nivel = getAccessLevel(['comunicacao']);
  const podeNvl3 = nivel >= 3;
  const podeNvl4 = nivel >= 4;
  const podeNvl5 = nivel >= 5;
  // ⚠️ A aba Bot embute telas cujo backend exige 'whatsapp-admin' = integracao
  // OU grupos ≥3 (middleware/auth.js) — NÃO o módulo comunicacao. Sem esse
  // nível, a aba inteira responderia 403; então ela só aparece pra quem pode
  // (mudar o mapa de permissão do backend é decisão do Marcos, não daqui).
  const podeBot = getAccessLevel(['integracao', 'grupos']) >= 3;
  const tabsVisiveis = podeBot ? TABS : TABS.filter(t => t !== 'bot');
  const tab = tabsVisiveis.includes(tabUrl) ? tabUrl : 'dashboard';

  function setTab(v: string) {
    const p = new URLSearchParams(searchParams);
    p.set('tab', v);
    setSearchParams(p, { replace: true });
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-bold">Comunicação</h1>
        <p className="text-sm text-muted-foreground">Central de WhatsApp da igreja — chat, envios, disparos e configurações.</p>
      </div>
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="dashboard"><BarChart3 className="mr-1.5 h-3.5 w-3.5" />Dashboard</TabsTrigger>
          <TabsTrigger value="conversas"><Inbox className="mr-1.5 h-3.5 w-3.5" />Conversas</TabsTrigger>
          <TabsTrigger value="envios"><Send className="mr-1.5 h-3.5 w-3.5" />Envios</TabsTrigger>
          <TabsTrigger value="disparos"><CalendarClock className="mr-1.5 h-3.5 w-3.5" />Disparos</TabsTrigger>
          <TabsTrigger value="contatos"><BookUser className="mr-1.5 h-3.5 w-3.5" />Contatos</TabsTrigger>
          {podeBot && <TabsTrigger value="bot"><Bot className="mr-1.5 h-3.5 w-3.5" />Bot</TabsTrigger>}
          <TabsTrigger value="config"><Settings className="mr-1.5 h-3.5 w-3.5" />Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard"><Dashboard /></TabsContent>
        {/* Chat: renderiza o default de Conversas.tsx (já tem sub-abas Conversas/Painel/Mensagens prontas). */}
        <TabsContent value="conversas"><Conversas /></TabsContent>
        <TabsContent value="envios"><Envios podeReenviar={podeNvl3} /></TabsContent>
        <TabsContent value="disparos"><Disparos podeEscrever={podeNvl3} podeExcluir={podeNvl4} /></TabsContent>
        <TabsContent value="contatos"><ContatosTab podeGerirLideres={podeBot} /></TabsContent>
        {podeBot && <TabsContent value="bot"><BotAdmin /></TabsContent>}
        <TabsContent value="config">
          <Configuracoes podeNvl3={podeNvl3} podeNvl5={podeNvl5} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══ DISPAROS (Programadas ∪ Automáticas · decisão do Marcos 13/08) ═══
// Uma aba só, com um filtro: "Agendadas" (as programadas de sempre, editáveis)
// × "Automáticas" (o inventário read-only do que o sistema manda por gatilho).
function Disparos({ podeEscrever, podeExcluir }: { podeEscrever: boolean; podeExcluir: boolean }) {
  const [tipo, setTipo] = useState<'agendadas' | 'automaticas'>('agendadas');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={tipo === 'agendadas' ? 'default' : 'outline'} className="gap-1.5" onClick={() => setTipo('agendadas')}>
          <CalendarClock className="h-3.5 w-3.5" />Agendadas
        </Button>
        <Button size="sm" variant={tipo === 'automaticas' ? 'default' : 'outline'} className="gap-1.5" onClick={() => setTipo('automaticas')}>
          <Repeat className="h-3.5 w-3.5" />Automáticas
        </Button>
        <span className="text-xs text-muted-foreground">
          {tipo === 'agendadas'
            ? 'Disparos com data/recorrência que VOCÊ cria e edita.'
            : 'O que o sistema manda sozinho por gatilho — leitura; cada um é operado no módulo dono.'}
        </span>
      </div>
      {tipo === 'agendadas'
        ? <Programadas podeEscrever={podeEscrever} podeExcluir={podeExcluir} />
        : <Automaticas />}
    </div>
  );
}

// ═══ CONFIGURAÇÕES (Templates · Números · Atendentes · Tarifas) ═══
function Configuracoes({ podeNvl3, podeNvl5 }: { podeNvl3: boolean; podeNvl5: boolean }) {
  return (
    <Tabs defaultValue="templates" className="space-y-4">
      <TabsList>
        <TabsTrigger value="templates"><FileText className="mr-1.5 h-3.5 w-3.5" />Templates</TabsTrigger>
        <TabsTrigger value="numeros"><Phone className="mr-1.5 h-3.5 w-3.5" />Números</TabsTrigger>
        <TabsTrigger value="atendentes"><Users className="mr-1.5 h-3.5 w-3.5" />Atendentes</TabsTrigger>
        <TabsTrigger value="tarifas"><Coins className="mr-1.5 h-3.5 w-3.5" />Tarifas</TabsTrigger>
      </TabsList>
      <TabsContent value="templates"><Templates podeSync={podeNvl3} podeEditar={podeNvl3} /></TabsContent>
      <TabsContent value="numeros"><Numeros podeEscrever={podeNvl5} /></TabsContent>
      <TabsContent value="atendentes"><Atendentes podeEscrever={podeNvl3} /></TabsContent>
      <TabsContent value="tarifas"><Tarifas podeEditar={podeNvl5} /></TabsContent>
    </Tabs>
  );
}

// ═══ TARIFAS (o backend existia desde julho SEM tela — o custo do Dashboard
// lê daqui; era editável só por SQL) ═══
type Tarifa = { categoria: string; tarifa: number; atualizado_em?: string };
function Tarifas({ podeEditar }: { podeEditar: boolean }) {
  const [lista, setLista] = useState<Tarifa[] | null>(null);
  const [erro, setErro] = useState(false);
  const [editCat, setEditCat] = useState<string | null>(null);
  const [valor, setValor] = useState('');

  const carregar = useCallback(() => {
    setErro(false);
    comunicacao.tarifas.list().then((r: Tarifa[]) => setLista(r || [])).catch(() => { setLista([]); setErro(true); });
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function salvar(categoria: string) {
    const t = Number(String(valor).replace(',', '.'));
    if (!Number.isFinite(t) || t < 0) { toast.error('Valor inválido.'); return; }
    try {
      await comunicacao.tarifas.atualizar(categoria, t);
      toast.success('Tarifa atualizada — o custo do Dashboard usa este valor.');
      setEditCat(null); carregar();
    } catch (e: unknown) { toast.error((e as Error)?.message || 'Erro ao salvar'); }
  }

  if (erro) return <ErroBox msg="Falha ao listar as tarifas." onRetry={carregar} />;
  if (!lista) return <Spinner />;
  return (
    <div className="max-w-xl space-y-3">
      <p className="text-sm text-muted-foreground">
        Tarifa por conversa iniciada, por categoria de template (é a base do custo <b>estimado</b> do
        Dashboard — não é a fatura da Meta). Conferir contra a tarifa vigente de vez em quando.
      </p>
      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2.5 text-left font-medium">Categoria</th>
              <th className="px-3 py-2.5 text-left font-medium">R$ por conversa</th>
              <th className="px-3 py-2.5 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((t) => (
              <tr key={t.categoria} className="border-b border-border/60">
                <td className="px-3 py-2 font-medium">{t.categoria}</td>
                <td className="px-3 py-2 tabular-nums">
                  {editCat === t.categoria
                    ? <Input className="h-8 w-28" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
                    : brl(t.tarifa)}
                </td>
                <td className="px-3 py-2 text-right">
                  {editCat === t.categoria ? (
                    <div className="flex justify-end gap-1">
                      <button onClick={() => salvar(t.categoria)} className="rounded p-1.5 text-muted-foreground hover:text-primary" title="Salvar"><Save className="h-4 w-4" /></button>
                      <button onClick={() => setEditCat(null)} className="rounded p-1.5 text-muted-foreground hover:text-destructive" title="Cancelar"><X className="h-4 w-4" /></button>
                    </div>
                  ) : (
                    <button disabled={!podeEditar} onClick={() => { setEditCat(t.categoria); setValor(String(t.tarifa)); }}
                      className="rounded p-1.5 text-muted-foreground hover:text-primary disabled:opacity-40" title="Editar"><Pencil className="h-4 w-4" /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
