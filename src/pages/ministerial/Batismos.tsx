import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { kpis as kpisApi } from '../../api';
import useConfirmarSaida from '../../hooks/useConfirmarSaida';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { BirthDatePicker } from '../../components/ui/birth-date-picker';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { StatisticsCard } from '../../components/ui/statistics-card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Checkbox } from '../../components/ui/checkbox';
import {
  Droplets, Loader2, Search, Plus, Calendar, Phone, Mail, AlertCircle,
  CheckCircle2, Clock, XCircle, ChevronRight, ChevronDown, User, IdCard, FileText, BarChart3,
  Share2, Copy, Check, Hourglass, Printer, MapPin,
} from 'lucide-react';
import { imprimirListaPresencaBatismo } from '../../lib/imprimirListaPresencaBatismo';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { ChartGradients, gradFill } from '@/components/charts/ChartGradients';

const C = { primary: '#00B39D', info: '#3b82f6', warn: '#f59e0b', purple: '#8b5cf6', danger: '#ef4444' };

type Status = 'pendente' | 'confirmado' | 'realizado' | 'cancelado';

type CategoriaEtaria = 'crianca' | 'adolescente' | 'adulto';

type BatismoInscricao = {
  id: string;
  membro_id?: string | null;
  nome: string;
  sobrenome: string;
  data_nascimento?: string | null;
  cpf?: string | null;
  telefone?: string | null;
  email?: string | null;
  status: Status;
  data_batismo?: string | null;
  horario_culto?: string | null; // horário escolhido (casa com batismo_horarios.horario)
  cep?: string | null;
  origem: 'totem' | 'manual';
  observacoes?: string | null;
  created_at: string;
  updated_at: string;
  membro?: { id: string; nome: string; foto_url?: string | null; cpf?: string | null } | null;
  // Novos · PR batismos categoria/camisa/deficiencia
  tamanho_camisa?: string | null;
  eh_crianca?: boolean;
  categoria_etaria?: CategoriaEtaria | null;
  possui_deficiencia?: boolean;
  deficiencia_descricao?: string | null;
  endereco?: string | null;
  // Jornada · tempo de conversao até o batismo (vem enriquecido do backend)
  data_conversao?: string | null;       // etapa 'conversao' da trilha (data_conclusao)
  dias_conversao_batismo?: number | null; // data_batismo - data_conversao, em dias
};

const CATEGORIA_LABEL: Record<CategoriaEtaria, string> = {
  crianca: 'Criança',
  adolescente: 'Adolescente',
  adulto: 'Adulto',
};

const CATEGORIA_COLOR: Record<CategoriaEtaria, string> = {
  crianca: '#ec4899',      // pink
  adolescente: '#a855f7',  // purple
  adulto: '#0ea5e9',       // sky
};

// Calcula categoria etaria no client (espelha lógica do trigger SQL)
function categoriaDe(b: { data_nascimento?: string | null; eh_crianca?: boolean; categoria_etaria?: CategoriaEtaria | null }): CategoriaEtaria | null {
  if (b.categoria_etaria) return b.categoria_etaria;
  if (b.eh_crianca) return 'crianca';
  if (!b.data_nascimento) return null;
  const nasc = new Date(b.data_nascimento + 'T12:00:00');
  if (Number.isNaN(nasc.getTime())) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade -= 1;
  if (idade < 12) return 'crianca';
  if (idade <= 18) return 'adolescente';
  return 'adulto';
}

const STATUS_LABEL: Record<Status, string> = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  realizado: 'Realizado',
  cancelado: 'Cancelado',
};

const STATUS_COLOR: Record<Status, string> = {
  pendente: C.warn,
  confirmado: C.info,
  realizado: C.primary,
  cancelado: C.danger,
};

const STATUS_ICON: Record<Status, any> = {
  pendente: Clock,
  confirmado: CheckCircle2,
  realizado: Droplets,
  cancelado: XCircle,
};

function ymdLocal(d: string | null | undefined): string {
  if (!d) return '';
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ymdHoje(): string {
  return new Date().toISOString().slice(0, 10);
}

// Calcula o 4o domingo de um mês (year + 0-indexed month)
function quartoDomingo(year: number, month: number): Date {
  const primeiro = new Date(year, month, 1);
  const offset = (7 - primeiro.getDay()) % 7;
  return new Date(year, month, 1 + offset + 21);
}

// Próximo batismo: 4o domingo deste mês (se ainda não passou) ou do próximo
function proximoQuartoDomingo(): string {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  let year = hoje.getFullYear();
  let month = hoje.getMonth();
  let q = quartoDomingo(year, month);
  if (q < hoje) {
    month += 1;
    if (month > 11) { year += 1; month = 0; }
    q = quartoDomingo(year, month);
  }
  return q.toISOString().slice(0, 10);
}

const MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const labelMes = (ym: string) => {
  const [y, m] = ym.split('-');
  return `${MESES_PT[parseInt(m, 10) - 1]}/${y.slice(2)}`;
};

// Gestão dos horários do batismo · abrir/fechar (controla o que aparece no
// formulário público) + limite de vagas por horário (fecha sozinho ao lotar).
function BatismoHorarios() {
  const [info, setInfo] = useState<{ data_batismo?: string; horarios: any[] }>({ horarios: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [grupoUrl, setGrupoUrl] = useState('');
  const [savingGrupo, setSavingGrupo] = useState(false);
  const [aberto, setAberto] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await kpisApi.batismos.horarios.list(); setInfo(r || { horarios: [] }); const c: any = await kpisApi.batismos.config(); setGrupoUrl(c?.grupo_url || ''); }
    catch { toast.error('Erro ao carregar horários'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Atualização OTIMISTA: a UI muda na hora; persiste em background e reverte se
  // falhar. Sem re-fetch bloqueante (era o que deixava o painel "atrasado").
  const patchLocal = (id: string, patch: any) =>
    setInfo(prev => ({ ...prev, horarios: prev.horarios.map(h => h.id === id ? { ...h, ...patch } : h) }));

  const aplicar = async (h: any, body: any, anterior: any) => {
    setBusy(h.id);
    patchLocal(h.id, body);
    try { await kpisApi.batismos.horarios.update(h.id, body); }
    catch (e: any) { patchLocal(h.id, anterior); toast.error(e?.message || 'Não foi possível atualizar'); }
    finally { setBusy(null); }
  };

  const toggleAberto = (h: any) => aplicar(h, { aberto: !h.aberto }, { aberto: h.aberto });
  const salvarLimite = (h: any, raw: string) => {
    const v = String(raw).trim();
    const novo = v === '' ? null : Math.max(0, parseInt(v, 10) || 0);
    if (novo === (h.limite ?? null)) return;
    aplicar(h, { limite: novo }, { limite: h.limite });
  };
  const salvarGrupo = async () => {
    setSavingGrupo(true);
    try { await kpisApi.batismos.salvarConfig({ grupo_url: grupoUrl.trim() || null }); toast.success('Link do grupo salvo'); }
    catch (e: any) { toast.error(e?.message || 'Erro ao salvar o link'); } finally { setSavingGrupo(false); }
  };

  const dataFmt = info.data_batismo
    ? new Date(info.data_batismo + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })
    : '';

  return (
    <Card>
      <CardHeader className="cursor-pointer select-none" onClick={() => setAberto(v => !v)}>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-primary" /> Horários do batismo
            <span className="text-xs font-normal text-muted-foreground">· próximo: {dataFmt || '—'}</span>
          </CardTitle>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${aberto ? 'rotate-180' : ''}`} />
        </div>
        {aberto && (
          <p className="text-xs text-muted-foreground">
            Abra/feche os horários que aparecem no formulário público e defina o limite de vagas de cada um (vazio = sem limite). Ao lotar, o horário some do formulário sozinho.
          </p>
        )}
      </CardHeader>
      {aberto && (
      <CardContent className="space-y-2">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : info.horarios.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">Nenhum horário cadastrado.</p>
        ) : info.horarios.map((h) => {
          const lotado = h.limite != null && h.inscritos >= h.limite;
          return (
            <div key={h.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
              <div className="flex-1 min-w-[180px]">
                <p className="font-medium text-sm">{h.label}</p>
                <p className="text-xs text-muted-foreground">
                  {h.inscritos} inscrito{h.inscritos === 1 ? '' : 's'}
                  {h.limite != null ? ` / ${h.limite}` : ' · sem limite'}
                  {lotado && <span className="ml-1 font-medium text-red-600">· lotado</span>}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground">Limite</Label>
                <Input
                  type="number" min="0" className="w-20 h-8"
                  defaultValue={h.limite ?? ''}
                  placeholder="—"
                  onBlur={(e) => salvarLimite(h, e.target.value)}
                />
              </div>
              <Badge variant={h.aberto ? 'default' : 'secondary'}>{h.aberto ? 'Aberto' : 'Fechado'}</Badge>
              <Button
                size="sm" variant={h.aberto ? 'outline' : 'default'} disabled={busy === h.id}
                onClick={() => toggleAberto(h)}
              >
                {busy === h.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (h.aberto ? 'Fechar' : 'Abrir')}
              </Button>
            </div>
          );
        })}
        <div className="rounded-lg border border-border p-3 space-y-2 mt-1">
          <Label className="text-sm font-medium flex items-center gap-1.5">💬 Link do grupo do WhatsApp do batismo</Label>
          <p className="text-xs text-muted-foreground">Quem se inscrever (link externo ou app) vê este link no fim pra entrar no grupo. Atualize a cada mês com o grupo novo.</p>
          <div className="flex gap-2">
            <Input value={grupoUrl} onChange={(e) => setGrupoUrl(e.target.value)} placeholder="https://chat.whatsapp.com/..." className="flex-1" />
            <Button size="sm" onClick={salvarGrupo} disabled={savingGrupo}>{savingGrupo ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}</Button>
          </div>
        </div>
      </CardContent>
      )}
    </Card>
  );
}

// (deep-link via useSearchParams)
export default function Batismos() {
  const [list, setList] = useState<BatismoInscricao[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<Status | 'todos'>('todos');
  const [mesFiltro, setMesFiltro] = useState<string>('todos');
  const [horarioFiltro, setHorarioFiltro] = useState<string>('todos');
  const [horariosMap, setHorariosMap] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState<CategoriaEtaria | 'todos'>('todos');
  const [selected, setSelected] = useState<BatismoInscricao | null>(null);
  const [novaOpen, setNovaOpen] = useState(false);
  const [cobertura, setCobertura] = useState<any>(null);
  const [showPendentes, setShowPendentes] = useState(false);
  // PR1 · alterna entre ver os batismos por pessoa (lista atual) ou por turma (a data É a turma)
  const [viewMode, setViewMode] = useState<'pessoa' | 'turma'>('pessoa');
  const [turmaAberta, setTurmaAberta] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await kpisApi.batismos.list();
      setList(Array.isArray(data) ? data : []);
      kpisApi.batismos.coberturaConvertidos().then(setCobertura).catch(() => {});
      kpisApi.batismos.horarios.list().then((r: any) => {
        const m: Record<string, string> = {};
        (r?.horarios || []).forEach((h: any) => { if (h.horario) m[h.horario] = h.label || h.horario; });
        setHorariosMap(m);
      }).catch(() => {});
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao carregar batismos');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Marca presença direto na lista (= status 'realizado' = compareceu/batizou).
  const marcarPresenca = async (b: BatismoInscricao, presente: boolean) => {
    const novo: Status = presente ? 'realizado' : 'confirmado';
    setList(prev => prev.map(x => x.id === b.id ? { ...x, status: novo } : x));
    try {
      await kpisApi.batismos.update(b.id, { status: novo });
      toast.success(presente ? `${b.nome}: presente ✓` : `${b.nome}: presença desmarcada`);
    } catch (e: any) { toast.error('Erro ao marcar presença'); load(); }
  };

  // Deep-link: ?inscricao=<id> (vindo da notificação) abre a ficha direto.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const insId = searchParams.get('inscricao');
    if (insId && list.length) {
      const found = list.find((i) => i.id === insId);
      if (found) {
        setSelected(found);
        const next = new URLSearchParams(searchParams); next.delete('inscricao');
        setSearchParams(next, { replace: true });
      }
    }
  }, [list, searchParams, setSearchParams]);

  // Meses disponíveis para o filtro · ordenados desc (mais recente primeiro)
  const mesesDisponiveis = useMemo(() => {
    const set = new Set<string>();
    list.forEach(b => {
      if (b.data_batismo) set.add(b.data_batismo.slice(0, 7));
    });
    return Array.from(set).sort().reverse();
  }, [list]);

  const filtrada = list.filter(b => {
    if (statusFilter !== 'todos' && b.status !== statusFilter) return false;
    if (mesFiltro !== 'todos') {
      if (!b.data_batismo || b.data_batismo.slice(0, 7) !== mesFiltro) return false;
    }
    if (categoriaFiltro !== 'todos') {
      if (categoriaDe(b) !== categoriaFiltro) return false;
    }
    if (horarioFiltro !== 'todos' && (b.horario_culto || '') !== horarioFiltro) return false;
    if (busca) {
      const q = busca.toLowerCase();
      const hay = `${b.nome} ${b.sobrenome} ${b.cpf || ''} ${b.telefone || ''} ${b.email || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const labelHorario = (hc?: string | null) => (hc ? (horariosMap[hc] || hc) : '—');
  // Horários presentes nas inscrições (pro filtro clicável "ver quem se batiza
  // naquele horário"), com contagem. Ordena pelo label.
  const horariosPresentes = useMemo(() => {
    const m: Record<string, number> = {};
    list.forEach(b => { const k = b.horario_culto || ''; if (k) m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) =>
      (horariosMap[a[0]] || a[0]).localeCompare(horariosMap[b[0]] || b[0]));
  }, [list, horariosMap]);

  // "Por turma" = agrupado pela data do batismo (a data É a turma). Respeita os
  // filtros ativos; inscrições sem data caem num grupo "Sem data definida".
  const turmasMap: Record<string, BatismoInscricao[]> = {};
  filtrada.forEach(b => { const k = b.data_batismo || 'sem-data'; (turmasMap[k] ||= []).push(b); });
  const turmas = Object.keys(turmasMap)
    .sort((a, b) => (a === 'sem-data' ? 1 : b === 'sem-data' ? -1 : (a < b ? 1 : -1)))
    .map(data => ({ data, pessoas: turmasMap[data] }));

  // KPIs
  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
  const ymdInicioMes = inicioMes.toISOString().slice(0, 10);
  const realizadosMes = list.filter(b => b.status === 'realizado' && (b.data_batismo || '') >= ymdInicioMes).length;
  const pendentes = list.filter(b => b.status === 'pendente').length;
  const confirmados = list.filter(b => b.status === 'confirmado').length;

  // Próximo batismo: pega data agendada futura mais próxima, ou cai pro 4o
  // domingo automático se não houver agendamento futuro registrado.
  const proximaDataBatismo = useMemo(() => {
    const agendadas = list
      .filter(b => (b.status === 'pendente' || b.status === 'confirmado') && b.data_batismo && b.data_batismo >= ymdHoje())
      .map(b => b.data_batismo as string)
      .sort();
    return agendadas[0] || proximoQuartoDomingo();
  }, [list]);

  // Realizados por mês nos últimos 12 meses (para o gráfico)
  const realizadosPorMes = useMemo(() => {
    const buckets: Record<string, number> = {};
    const hoje = new Date();
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      buckets[ym] = 0;
    }
    list.forEach(b => {
      if (b.status !== 'realizado' || !b.data_batismo) return;
      const ym = b.data_batismo.slice(0, 7);
      if (buckets[ym] !== undefined) buckets[ym] += 1;
    });
    return Object.entries(buckets).map(([ym, count]) => ({
      mes: labelMes(ym),
      ym,
      batizados: count,
    }));
  }, [list]);

  // Tempo de conversao até o batismo · visão geral (media em dias entre os
  // batismos JÁ realizados que tem data de conversao registrada na jornada).
  // Ignora valores negativos (conversao posterior ao batismo = inconsistencia).
  const tempoConversao = useMemo(() => {
    const dias = list
      .filter(b => b.status === 'realizado' && b.dias_conversao_batismo != null && (b.dias_conversao_batismo as number) >= 0)
      .map(b => b.dias_conversao_batismo as number);
    if (dias.length === 0) return { media: null as number | null, n: 0, min: null as number | null, max: null as number | null };
    const soma = dias.reduce((s, d) => s + d, 0);
    return {
      media: Math.round(soma / dias.length),
      n: dias.length,
      min: Math.min(...dias),
      max: Math.max(...dias),
    };
  }, [list]);

  const linkPublico = typeof window !== 'undefined'
    ? `${window.location.origin}/inscricao-batismo`
    : '/inscricao-batismo';
  const [linkCopiado, setLinkCopiado] = useState(false);
  const copiarLink = () => {
    navigator.clipboard.writeText(linkPublico).then(() => {
      setLinkCopiado(true);
      toast.success('Link copiado!');
      setTimeout(() => setLinkCopiado(false), 2500);
    }).catch(() => toast.error('Não foi possível copiar'));
  };
  const compartilharWhatsApp = () => {
    const msg = encodeURIComponent(`Inscreva-se para o batismo na CBRio: ${linkPublico}`);
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/30 text-xs max-w-[420px]">
          <Share2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <code className="truncate text-muted-foreground">{linkPublico}</code>
          <button
            onClick={copiarLink}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-background border border-transparent hover:border-border shrink-0"
            title="Copiar link"
          >
            {linkCopiado ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
            {linkCopiado ? 'Copiado' : 'Copiar'}
          </button>
          <button
            onClick={compartilharWhatsApp}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600/20 shrink-0"
            title="Compartilhar no WhatsApp"
          >
            WhatsApp
          </button>
        </div>
        <Button onClick={() => setNovaOpen(true)} className="gap-2 bg-[#00B39D] hover:bg-[#00B39D]/90 text-white">
          <Plus className="h-4 w-4" /> Cadastrar inscricao
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatisticsCard
          title="Pendentes"
          value={String(pendentes)}
          icon={Clock}
          iconColor={C.warn}
        />
        <StatisticsCard
          title="Confirmados"
          value={String(confirmados)}
          icon={CheckCircle2}
          iconColor={C.info}
        />
        <StatisticsCard
          title="Realizados (mes)"
          value={String(realizadosMes)}
          icon={Droplets}
          iconColor={C.primary}
        />
        <StatisticsCard
          title="Proximo batismo"
          value={proximaDataBatismo ? ymdLocal(proximaDataBatismo) : '—'}
          icon={Calendar}
          iconColor={C.purple}
        />
      </div>

      {/* Tempo medio de conversao até o batismo · visão geral (todos os membros) */}
      <Card>
        <CardContent className="py-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="rounded-lg p-2.5 shrink-0" style={{ background: `${C.info}18` }}>
            <Hourglass className="h-6 w-6" style={{ color: C.info }} />
          </div>
          <div className="flex-1 min-w-[200px]">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Tempo médio de conversão até o batismo
            </p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-3xl font-bold text-foreground">
                {tempoConversao.media != null ? tempoConversao.media : '—'}
              </span>
              <span className="text-sm text-muted-foreground">
                {tempoConversao.media != null ? 'dias' : 'sem dados'}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Da decisão (conversão) até o batismo realizado · base na jornada de cada membro
            </p>
          </div>
          {tempoConversao.n > 0 && (
            <div className="flex gap-5 text-center shrink-0">
              <div>
                <p className="text-lg font-semibold text-foreground">{tempoConversao.n}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">membros</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">{tempoConversao.min}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">mín (dias)</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">{tempoConversao.max}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">máx (dias)</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cobertura de batismo dos convertidos · trilho universal (todo convertido chamado) */}
      {cobertura && cobertura.total > 0 && (
        <Card>
          <CardContent className="py-4 space-y-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="rounded-lg p-2.5 shrink-0" style={{ background: `${C.primary}18` }}>
                <Droplets className="h-6 w-6" style={{ color: C.primary }} />
              </div>
              <div className="flex-1 min-w-[220px]">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Convertidos chamados pro batismo
                </p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-3xl font-bold text-foreground">{cobertura.pct_batizados}%</span>
                  <span className="text-sm text-muted-foreground">batizados ({cobertura.batizados}/{cobertura.total})</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Todo convertido deve ser chamado · acompanhe quem ainda falta, independente do cuidado pastoral
                </p>
              </div>
              <div className="flex gap-5 text-center shrink-0">
                <div>
                  <p className="text-lg font-semibold text-foreground">{cobertura.inscritos}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">inscritos</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-foreground">{cobertura.nao_inscritos}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">não inscritos</p>
                </div>
              </div>
              {cobertura.pendentes?.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setShowPendentes(v => !v)}>
                  {showPendentes ? 'Ocultar' : `Ver quem falta (${cobertura.pendentes.length})`}
                </Button>
              )}
            </div>
            {showPendentes && cobertura.pendentes?.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Data culto</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cobertura.pendentes.slice(0, 100).map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.nome}</TableCell>
                        <TableCell>{p.telefone || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">{p.data_culto ? ymdLocal(p.data_culto) : '—'}</TableCell>
                        <TableCell>
                          <Badge variant={p.status_batismo === 'inscrito' ? 'default' : 'secondary'}>
                            {p.status_batismo === 'inscrito' ? 'Inscrito' : 'Não inscrito'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {cobertura.pendentes.length > 100 && (
                  <p className="text-xs text-muted-foreground p-2">Mostrando 100 de {cobertura.pendentes.length}.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Gráfico de barras · batismos realizados por mês (últimos 12 meses) */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            Batismos realizados por mes
            <span className="text-xs text-muted-foreground font-normal">(últimos 12 meses)</span>
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            Total: {realizadosPorMes.reduce((s, m) => s + m.batizados, 0)}
          </span>
        </CardHeader>
        <CardContent>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={realizadosPorMes} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
                <ChartGradients colors={[C.primary]} />
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(0,179,157,0.08)' }}
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any) => [`${v} batizado(s)`, '']}
                />
                <Bar dataKey="batizados" fill={gradFill(C.primary)} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <BatismoHorarios />

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-border p-0.5 bg-muted/30">
          {(['pessoa', 'turma'] as const).map(v => (
            <button
              key={v}
              onClick={() => setViewMode(v)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap ${viewMode === v ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {v === 'pessoa' ? 'Por pessoa' : 'Por turma'}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-xl border border-border p-0.5 bg-muted/30 overflow-x-auto">
          {(['todos', 'pendente', 'confirmado', 'realizado', 'cancelado'] as const).map(f => {
            const count = f === 'todos' ? list.length : list.filter(b => b.status === f).length;
            return (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap ${statusFilter === f ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {f === 'todos' ? `Todos (${count})` : `${STATUS_LABEL[f]} (${count})`}
              </button>
            );
          })}
        </div>
        <Select value={mesFiltro} onValueChange={setMesFiltro}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Filtrar mes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os meses</SelectItem>
            {mesesDisponiveis.map(ym => (
              <SelectItem key={ym} value={ym}>{labelMes(ym)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="inline-flex rounded-xl border border-border p-0.5 bg-muted/30 overflow-x-auto">
          {(['todos', 'crianca', 'adolescente', 'adulto'] as const).map(c => {
            const count = c === 'todos'
              ? list.length
              : list.filter(b => categoriaDe(b) === c).length;
            const label = c === 'todos' ? 'Todas idades' : CATEGORIA_LABEL[c];
            return (
              <button
                key={c}
                onClick={() => setCategoriaFiltro(c)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap ${categoriaFiltro === c ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {label} ({count})
              </button>
            );
          })}
        </div>
        {horariosPresentes.length > 0 && (
          <div className="inline-flex rounded-xl border border-border p-0.5 bg-muted/30 overflow-x-auto max-w-full">
            <button
              onClick={() => setHorarioFiltro('todos')}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap inline-flex items-center gap-1 ${horarioFiltro === 'todos' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Clock className="h-3 w-3" /> Todos horários
            </button>
            {horariosPresentes.map(([h, n]) => (
              <button
                key={h}
                onClick={() => setHorarioFiltro(horarioFiltro === h ? 'todos' : h)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap ${horarioFiltro === h ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {horariosMap[h] || h} ({n})
              </button>
            ))}
          </div>
        )}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome, CPF, telefone ou email" className="pl-9" />
        </div>
      </div>

      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto my-12" />
      ) : filtrada.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          {list.length === 0 ? 'Nenhuma inscrição de batismo.' : 'Nenhum registro corresponde aos filtros.'}
        </div>
      ) : viewMode === 'turma' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {turmas.map(t => {
            const counts = t.pessoas.reduce((acc, p) => { acc[p.status] = (acc[p.status] || 0) + 1; return acc; }, {} as Record<Status, number>);
            return (
              <button
                key={t.data}
                onClick={() => setTurmaAberta(t.data)}
                className="text-left rounded-xl border border-border bg-card hover:bg-muted/40 hover:shadow-sm transition-all p-3 flex flex-col gap-2 min-h-[112px]"
              >
                <div className="flex items-center gap-2">
                  <div className="rounded-lg p-2 shrink-0" style={{ background: `${C.primary}18` }}>
                    <Droplets className="h-4 w-4" style={{ color: C.primary }} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground text-sm leading-tight">
                      {t.data === 'sem-data' ? 'Sem data' : ymdLocal(t.data)}
                    </p>
                    <p className="text-xs text-muted-foreground">{t.pessoas.length} pessoa(s)</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {(['realizado', 'confirmado', 'pendente', 'cancelado'] as Status[]).map(s => (
                    counts[s] ? (
                      <Badge key={s} variant="outline" className="text-[10px] px-1.5" style={{ color: STATUS_COLOR[s], borderColor: STATUS_COLOR[s] + '60' }}>
                        {counts[s]} {STATUS_LABEL[s].toLowerCase()}
                      </Badge>
                    ) : null
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="hidden md:table-cell">Contato</TableHead>
                <TableHead className="text-center hidden sm:table-cell">Categoria</TableHead>
                <TableHead className="text-center hidden md:table-cell">Camisa</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">Presença</TableHead>
                <TableHead className="text-center hidden sm:table-cell">Data batismo</TableHead>
                <TableHead className="text-center hidden sm:table-cell">Horário</TableHead>
                <TableHead className="text-center hidden lg:table-cell">Origem</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrada.map(b => {
                const Icon = STATUS_ICON[b.status];
                const cat = categoriaDe(b);
                const hasDef = !!b.possui_deficiencia;
                return (
                  <TableRow
                    key={b.id}
                    className="cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => setSelected(b)}
                  >
                    <TableCell>
                      <p className="font-medium flex items-center gap-2">
                        <span style={hasDef ? { color: '#dc2626' } : undefined}>
                          {b.nome} {b.sobrenome}
                        </span>
                        {hasDef && (
                          <span
                            title={b.deficiencia_descricao || 'Possui deficiencia'}
                            className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400 inline-flex items-center gap-1"
                          >
                            <AlertCircle className="h-3 w-3" /> deficiência
                          </span>
                        )}
                      </p>
                      {b.cpf && <p className="text-xs text-muted-foreground">{b.cpf}</p>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                        {b.telefone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{b.telefone}</span>}
                        {b.email && <span className="flex items-center gap-1 truncate max-w-[200px]"><Mail className="h-3 w-3" />{b.email}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-center hidden sm:table-cell">
                      {cat ? (
                        <Badge
                          variant="outline"
                          className="text-[10px]"
                          style={{ color: CATEGORIA_COLOR[cat], borderColor: CATEGORIA_COLOR[cat] + '60' }}
                        >
                          {CATEGORIA_LABEL[cat]}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center hidden md:table-cell text-sm text-muted-foreground">
                      {b.tamanho_camisa || '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="outline"
                        className="gap-1"
                        style={{ color: STATUS_COLOR[b.status], borderColor: STATUS_COLOR[b.status] + '60' }}
                      >
                        <Icon className="h-3 w-3" />
                        {STATUS_LABEL[b.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={b.status === 'realizado'}
                        onCheckedChange={(v) => marcarPresenca(b, !!v)}
                        title="Marcar presença (compareceu/batizou)"
                        aria-label="Marcar presença"
                      />
                    </TableCell>
                    <TableCell className="text-center hidden sm:table-cell text-sm text-muted-foreground">
                      {b.data_batismo ? ymdLocal(b.data_batismo) : '—'}
                    </TableCell>
                    <TableCell className="text-center hidden sm:table-cell">
                      {b.horario_culto ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); setHorarioFiltro(b.horario_culto!); }}
                          className="text-xs text-primary underline-offset-2 hover:underline inline-flex items-center gap-1"
                          title="Ver quem se batiza neste horário"
                        >
                          <Clock className="h-3 w-3" />{labelHorario(b.horario_culto)}
                        </button>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-center hidden lg:table-cell">
                      <Badge variant="outline" className="text-[9px] uppercase">{b.origem}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      <ChevronRight className="h-4 w-4 inline-block" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {turmaAberta && (
        <ModalTurmaBatismo
          data={turmaAberta}
          pessoas={turmas.find(t => t.data === turmaAberta)?.pessoas || []}
          labelHorario={labelHorario}
          onClose={() => setTurmaAberta(null)}
          onSelectPessoa={(b) => { setTurmaAberta(null); setSelected(b); }}
          onChanged={load}
        />
      )}

      {selected && (
        <ModalDetalheBatismo
          batismo={selected}
          labelHorario={labelHorario}
          onClose={() => setSelected(null)}
          onSaved={() => { load(); setSelected(null); }}
        />
      )}

      {novaOpen && (
        <ModalNovaInscricao
          onClose={() => setNovaOpen(false)}
          onCreated={() => { load(); setNovaOpen(false); }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// MODAL · TURMA (batismos de uma data) — lista quem batizou/vai batizar naquele dia
// ──────────────────────────────────────────────────────────────────────────
// Monta um culto pra impressão (filtra cancelados, ordena por nome).
function montarCultoImpressao(
  data: string, hc: string, lista: BatismoInscricao[], labelHorario: (hc?: string | null) => string,
) {
  const dataFmt = data && data !== 'sem-data'
    ? new Date(data + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    : 'Sem data definida';
  return {
    titulo: [dataFmt, hc ? labelHorario(hc) : ''].filter(Boolean).join(' · '),
    batizandos: lista.filter(b => b.status !== 'cancelado').slice()
      .sort((x, y) => `${x.nome} ${x.sobrenome}`.localeCompare(`${y.nome} ${y.sobrenome}`))
      .map(b => ({ nome: `${b.nome} ${b.sobrenome || ''}`.trim(), categoria: b.categoria_etaria ? CATEGORIA_LABEL[b.categoria_etaria] : '', camisa: b.tamanho_camisa || '' })),
  };
}

// Imprime a turma INTEIRA (todos os cultos do dia, numa folha só).
function imprimirPresencaDeTurma(
  data: string, pessoas: BatismoInscricao[], labelHorario: (hc?: string | null) => string,
) {
  const grupos = new Map<string, BatismoInscricao[]>();
  pessoas.filter(b => b.status !== 'cancelado').forEach(b => { const k = b.horario_culto || ''; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k)!.push(b); });
  const cultos = [...grupos.entries()]
    .sort(([a], [b]) => (!a ? 1 : !b ? -1 : labelHorario(a).localeCompare(labelHorario(b))))
    .map(([hc, arr]) => montarCultoImpressao(data, hc, arr, labelHorario))
    .filter(c => c.batizandos.length);
  if (cultos.length === 0) { toast.error('Nenhum batizando para imprimir nesta turma.'); return; }
  imprimirListaPresencaBatismo(cultos);
}

// Imprime SÓ um culto (horário) da turma.
function imprimirUmCulto(
  data: string, hc: string, lista: BatismoInscricao[], labelHorario: (hc?: string | null) => string,
) {
  const culto = montarCultoImpressao(data, hc, lista, labelHorario);
  if (culto.batizandos.length === 0) { toast.error('Nenhum batizando neste culto.'); return; }
  imprimirListaPresencaBatismo([culto]);
}

function ModalTurmaBatismo({
  data, pessoas, labelHorario, onClose, onSelectPessoa, onChanged,
}: {
  data: string;
  pessoas: BatismoInscricao[];
  labelHorario: (hc?: string | null) => string;
  onClose: () => void;
  onSelectPessoa: (b: BatismoInscricao) => void;
  onChanged: () => void;
}) {
  const titulo = data === 'sem-data' ? 'Sem data definida' : ymdLocal(data);
  // Agrupa por culto (horário) dentro da turma · "Sem horário" no fim.
  const porCulto = new Map<string, BatismoInscricao[]>();
  pessoas.forEach(b => { const k = b.horario_culto || ''; if (!porCulto.has(k)) porCulto.set(k, []); porCulto.get(k)!.push(b); });
  const cultos = [...porCulto.entries()].sort(([a], [b]) => (!a ? 1 : !b ? -1 : labelHorario(a).localeCompare(labelHorario(b))));

  // Seleção múltipla · marcar status em massa (ex.: os que vieram → Realizado).
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState<Status | null>(null);
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleCulto = (lista: BatismoInscricao[], marcar: boolean) => setSel(s => {
    const n = new Set(s); lista.forEach(b => (marcar ? n.add(b.id) : n.delete(b.id))); return n;
  });
  async function aplicar(status: Status) {
    if (!sel.size) return;
    setSalvando(status);
    try {
      const r = await kpisApi.batismos.updateEmMassa([...sel], status);
      toast.success(`${r?.atualizados ?? sel.size} pessoa(s) → ${STATUS_LABEL[status]}`);
      setSel(new Set());
      onChanged();
    } catch (e: any) { toast.error(e?.message || 'Erro ao atualizar em massa'); }
    finally { setSalvando(null); }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <Droplets className="h-5 w-5" style={{ color: C.primary }} />
            Batismos · {titulo}
            <span className="text-sm font-normal text-muted-foreground">({pessoas.length})</span>
            <Button variant="outline" size="sm" className="ml-auto gap-1.5" onClick={() => imprimirPresencaDeTurma(data, pessoas, labelHorario)} title="Imprime a lista de todos os cultos deste dia">
              <Printer className="h-3.5 w-3.5" /> Imprimir tudo
            </Button>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 flex-1 overflow-y-auto min-h-0">
          {cultos.map(([hc, lista]) => (
            <div key={hc || 'sem-horario'}>
              <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground mb-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                {hc ? labelHorario(hc) : 'Sem horário definido'}
                <span className="text-xs font-normal text-muted-foreground">({lista.length})</span>
                <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1 text-xs" onClick={() => imprimirUmCulto(data, hc, lista, labelHorario)} title="Imprimir só este culto">
                  <Printer className="h-3 w-3" /> Imprimir
                </Button>
              </div>
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={lista.length > 0 && lista.every(b => sel.has(b.id))}
                          onCheckedChange={(v) => toggleCulto(lista, !!v)}
                          aria-label="Selecionar todos deste culto"
                        />
                      </TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead className="text-center hidden sm:table-cell">Categoria</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lista.map(b => {
                      const Icon = STATUS_ICON[b.status];
                      const cat = categoriaDe(b);
                      return (
                        <TableRow
                          key={b.id}
                          className={`cursor-pointer hover:bg-muted/40 transition-colors ${sel.has(b.id) ? 'bg-primary/5' : ''}`}
                          onClick={() => onSelectPessoa(b)}
                        >
                          <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                            <Checkbox checked={sel.has(b.id)} onCheckedChange={() => toggle(b.id)} aria-label={`Selecionar ${b.nome}`} />
                          </TableCell>
                          <TableCell>
                            <p className="font-medium">{b.nome} {b.sobrenome}</p>
                            {b.telefone && <p className="text-xs text-muted-foreground">{b.telefone}</p>}
                          </TableCell>
                          <TableCell className="text-center hidden sm:table-cell">
                            {cat ? (
                              <Badge variant="outline" className="text-[10px]" style={{ color: CATEGORIA_COLOR[cat], borderColor: CATEGORIA_COLOR[cat] + '60' }}>
                                {CATEGORIA_LABEL[cat]}
                              </Badge>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="gap-1" style={{ color: STATUS_COLOR[b.status], borderColor: STATUS_COLOR[b.status] + '60' }}>
                              <Icon className="h-3 w-3" />
                              {STATUS_LABEL[b.status]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            <ChevronRight className="h-4 w-4 inline-block" />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </div>
        {sel.size > 0 && (
          <div className="border-t border-border pt-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{sel.size} selecionada(s) · marcar como:</span>
            {(['realizado', 'confirmado', 'pendente', 'cancelado'] as Status[]).map(st => (
              <Button key={st} size="sm" variant={st === 'realizado' ? 'default' : 'outline'} disabled={!!salvando}
                onClick={() => aplicar(st)} className="gap-1.5">
                {salvando === st ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {STATUS_LABEL[st]}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setSel(new Set())} className="ml-auto">Limpar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// MODAL DE DETALHE / EDIÇÃO
// ──────────────────────────────────────────────────────────────────────────
function ModalDetalheBatismo({ batismo, labelHorario, onClose, onSaved }: {
  batismo: BatismoInscricao;
  labelHorario: (hc?: string | null) => string;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Auto-confirm: quando admin abre uma inscrição 'pendente', já vem
  // pre-selecionado como 'confirmado'. So persiste no save · se fechar
  // sem salvar, fica pendente.
  const [status, setStatus] = useState<Status>(batismo.status === 'pendente' ? 'confirmado' : batismo.status);
  const [dataBatismo, setDataBatismo] = useState(batismo.data_batismo || '');
  const [observacoes, setObservacoes] = useState(batismo.observacoes || '');
  const [endereco, setEndereco] = useState(batismo.endereco || '');
  const [tamanhoCamisa, setTamanhoCamisa] = useState(batismo.tamanho_camisa || '');
  const [ehCrianca, setEhCrianca] = useState(!!batismo.eh_crianca);
  const [possuiDeficiencia, setPossuiDeficiencia] = useState(!!batismo.possui_deficiencia);
  const [deficienciaDescricao, setDeficienciaDescricao] = useState(batismo.deficiencia_descricao || '');
  const [saving, setSaving] = useState(false);

  // Confirmação de saída · snapshot do estado inicial (1º render, logo após a
  // inicialização a partir da inscrição) vs estado atual. Abrir e fechar sem
  // mexer em nada não pergunta (snapshot === atual).
  const snapshotAtual = JSON.stringify({
    status, dataBatismo, observacoes, endereco, tamanhoCamisa,
    ehCrianca, possuiDeficiencia, deficienciaDescricao,
  });
  const snapshotInicialRef = useRef(snapshotAtual);
  const { tentarFechar } = useConfirmarSaida(snapshotAtual !== snapshotInicialRef.current, onClose);

  // Tempo de conversao até o batismo deste membro · recalcula ao vivo conforme
  // a data do batismo e editada. data_conversao vem da jornada (trilha).
  const diasConversao = useMemo(() => {
    if (!batismo.data_conversao || !dataBatismo) return null;
    return Math.round(
      (new Date(`${dataBatismo}T12:00:00`).getTime()
        - new Date(`${batismo.data_conversao}T12:00:00`).getTime()) / 86400000,
    );
  }, [batismo.data_conversao, dataBatismo]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await kpisApi.batismos.update(batismo.id, {
        status,
        data_batismo: dataBatismo || null,
        observacoes: observacoes || null,
        endereco: endereco || null,
        tamanho_camisa: tamanhoCamisa || null,
        eh_crianca: ehCrianca,
        possui_deficiencia: possuiDeficiencia,
        deficiencia_descricao: possuiDeficiencia ? (deficienciaDescricao || null) : null,
      });
      toast.success('Inscricao atualizada');
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao atualizar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) tentarFechar(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Droplets className="h-5 w-5" style={{ color: C.primary }} />
            {batismo.nome} {batismo.sobrenome}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-2 flex-1 overflow-y-auto min-h-0">
          <div className="rounded-xl border border-border p-4 space-y-2 text-sm bg-muted/20">
            {batismo.cpf && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <IdCard className="h-4 w-4" />
                <span>{batismo.cpf}</span>
              </div>
            )}
            {batismo.telefone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4" />
                <span>{batismo.telefone}</span>
              </div>
            )}
            {batismo.email && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-4 w-4" />
                <span>{batismo.email}</span>
              </div>
            )}
            {batismo.data_nascimento && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Nascimento: {ymdLocal(batismo.data_nascimento)}</span>
              </div>
            )}
            {batismo.horario_culto && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Horário: {labelHorario(batismo.horario_culto)}</span>
              </div>
            )}
            {batismo.cep && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>CEP: {batismo.cep}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground text-xs pt-1 border-t border-border/50">
              <span>Inscrito em {new Date(batismo.created_at).toLocaleString('pt-BR')}</span>
              <Badge variant="outline" className="text-[9px] uppercase ml-auto">{batismo.origem}</Badge>
            </div>
            {batismo.membro_id && batismo.membro && (
              <div className="flex items-center gap-2 text-xs pt-1 border-t border-border/50" style={{ color: C.primary }}>
                <User className="h-3 w-3" />
                <span>Vinculado ao membro: {batismo.membro.nome}</span>
              </div>
            )}
          </div>

          {/* Tempo de conversao até o batismo · especifico deste membro */}
          {batismo.membro_id && (
            <div className="rounded-xl border border-sky-200 bg-sky-50/50 dark:bg-sky-950/20 dark:border-sky-900/40 p-3 text-xs text-sky-900 dark:text-sky-200">
              <div className="flex items-center gap-2 font-medium">
                <Hourglass className="h-4 w-4" />
                Tempo de conversão até o batismo
              </div>
              {batismo.data_conversao ? (
                diasConversao != null ? (
                  <p className="mt-1">
                    <strong className="text-base">{diasConversao} dia{diasConversao === 1 ? '' : 's'}</strong>
                    {' — conversão em '}{ymdLocal(batismo.data_conversao)}
                    {dataBatismo ? ` · batismo em ${ymdLocal(dataBatismo)}` : ''}
                    {diasConversao < 0 ? ' · verificar datas (conversão posterior ao batismo)' : ''}
                  </p>
                ) : (
                  <p className="mt-1 text-sky-800/80 dark:text-sky-300/80">
                    Conversão em {ymdLocal(batismo.data_conversao)} · defina a data do batismo abaixo para calcular o tempo.
                  </p>
                )
              ) : (
                <p className="mt-1 text-sky-800/80 dark:text-sky-300/80">
                  Sem data de conversão registrada na jornada deste membro.
                </p>
              )}
            </div>
          )}

          {batismo.status === 'pendente' && status === 'confirmado' && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-900/40 p-3 flex gap-2 text-xs text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                Status pre-selecionado como <strong>confirmado</strong> ao abrir esta inscricao. Clique salvar para aplicar.
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Status</Label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as Status)}
                className="w-full mt-1 px-3 py-2 rounded-xl border border-border bg-background text-sm"
              >
                {(['pendente', 'confirmado', 'realizado', 'cancelado'] as const).map(s => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="data-bat" className="text-xs">Data do batismo</Label>
              <Input
                id="data-bat"
                type="date"
                value={dataBatismo}
                onChange={e => setDataBatismo(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="camisa" className="text-xs">Tamanho da camisa</Label>
              <select
                id="camisa"
                value={tamanhoCamisa}
                onChange={e => setTamanhoCamisa(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-xl border border-border bg-background text-sm"
              >
                <option value="">—</option>
                {['PP','P','M','G','GG','XG','XGG','2','4','6','8','10','12','14'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={ehCrianca}
                  onChange={e => setEhCrianca(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: '#00B39D' }}
                />
                <span>É criança (categoria forçada)</span>
              </label>
            </div>
          </div>

          <div>
            <Label htmlFor="end" className="text-xs">Endereço</Label>
            <Input id="end" value={endereco} onChange={e => setEndereco(e.target.value)} />
          </div>

          <div className="rounded-xl border border-border p-3 space-y-2 bg-muted/10">
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={possuiDeficiencia}
                onChange={e => setPossuiDeficiencia(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: '#dc2626' }}
              />
              <AlertCircle className="h-4 w-4 text-red-600" />
              <span>Possui deficiência</span>
            </label>
            {possuiDeficiencia && (
              <div>
                <Label htmlFor="def-desc" className="text-xs">Qual? (para o time de integração saber)</Label>
                <Textarea
                  id="def-desc"
                  value={deficienciaDescricao}
                  onChange={e => setDeficienciaDescricao(e.target.value)}
                  rows={2}
                  placeholder="Ex.: cadeirante, deficiência auditiva, autismo..."
                />
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="obs" className="text-xs">Observações</Label>
            <Textarea
              id="obs"
              value={observacoes}
              onChange={e => setObservacoes(e.target.value)}
              rows={3}
            />
          </div>

          {batismo.status !== 'realizado' && status === 'realizado' && batismo.membro_id && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-900/40 p-3 flex gap-2 text-xs text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                Ao marcar como "Realizado", o sistema vai criar automaticamente
                a etapa "batismo" na trilha de valores deste membro (Jornada/NSM).
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-3">
          <Button variant="outline" onClick={tentarFechar} disabled={saving}>Cancelar</Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="gap-2 bg-[#00B39D] hover:bg-[#00B39D]/90 text-white"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// MODAL DE CADASTRO MANUAL
// ──────────────────────────────────────────────────────────────────────────
function ModalNovaInscricao({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const soDigitos = (v: string) => (v || '').replace(/\D+/g, '');
  const mascaraCpf = (v: string) => {
    const d = soDigitos(v).slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  };
  const mascaraTel = (v: string) => {
    const d = soDigitos(v).slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };
  const cpfValido = (v: string) => {
    const d = soDigitos(v);
    if (d.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(d)) return false;
    const calc = (base: string, fator: number) => {
      let s = 0;
      for (let i = 0; i < base.length; i += 1) s += parseInt(base[i], 10) * (fator - i);
      const r = (s * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return calc(d.slice(0, 9), 10) === parseInt(d[9], 10)
      && calc(d.slice(0, 10), 11) === parseInt(d[10], 10);
  };

  const [form, setForm] = useState({
    nome: '', sobrenome: '',
    cpf: '', telefone: '', email: '',
    data_nascimento: '',
    observacoes: '',
    area_kpi: 'sede',
    endereco: '',
    tamanho_camisa: '',
    eh_crianca: false,
    possui_deficiencia: false,
    deficiencia_descricao: '',
  });
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Confirmação de saída · snapshot do form vazio na montagem vs estado atual.
  // Abrir e fechar sem digitar nada não pergunta (snapshot === atual).
  const snapshotAtual = JSON.stringify(form);
  const snapshotInicialRef = useRef(snapshotAtual);
  const { tentarFechar } = useConfirmarSaida(snapshotAtual !== snapshotInicialRef.current, onClose);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    let v = e.target.value;
    if (k === 'cpf') v = mascaraCpf(v);
    if (k === 'telefone') v = mascaraTel(v);
    setForm(f => ({ ...f, [k]: v }));
    setErro(null);
  };

  const handleSubmit = async () => {
    if (!form.nome.trim() || form.nome.trim().length < 2) return setErro('Informe o nome');
    if (!form.sobrenome.trim()) return setErro('Informe o sobrenome');
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setErro('Email invalido');
    if (form.telefone && soDigitos(form.telefone).length < 10) return setErro('Telefone invalido');
    if (form.cpf && !cpfValido(form.cpf)) return setErro('CPF invalido');

    setSaving(true);
    try {
      await kpisApi.batismos.create({
        nome: form.nome.trim(),
        sobrenome: form.sobrenome.trim(),
        cpf: form.cpf || null,
        telefone: form.telefone || null,
        email: form.email.toLowerCase().trim() || null,
        data_nascimento: form.data_nascimento || null,
        observacoes: form.observacoes.trim() || null,
        origem: 'manual',
        area_kpi: form.area_kpi || 'sede',
        endereco: form.endereco.trim() || null,
        tamanho_camisa: form.tamanho_camisa || null,
        eh_crianca: form.eh_crianca,
        possui_deficiencia: form.possui_deficiencia,
        deficiencia_descricao: form.possui_deficiencia ? (form.deficiencia_descricao.trim() || null) : null,
      });
      toast.success('Inscrição cadastrada!');
      onCreated();
    } catch (e: any) {
      setErro(e?.message || 'Erro ao cadastrar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) tentarFechar(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" style={{ color: C.primary }} />
            Cadastrar inscricao de batismo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-2 flex-1 overflow-y-auto min-h-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="bn-nome" className="text-xs">Nome *</Label>
              <Input id="bn-nome" value={form.nome} onChange={set('nome')} autoComplete="given-name" />
            </div>
            <div>
              <Label htmlFor="bn-sobrenome" className="text-xs">Sobrenome *</Label>
              <Input id="bn-sobrenome" value={form.sobrenome} onChange={set('sobrenome')} autoComplete="family-name" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="bn-cpf" className="text-xs">CPF (opcional · linka com membro existente)</Label>
              <Input id="bn-cpf" value={form.cpf} onChange={set('cpf')} placeholder="000.000.000-00" inputMode="numeric" />
            </div>
            <div>
              <Label htmlFor="bn-nasc" className="text-xs">Data de nascimento</Label>
              <BirthDatePicker value={form.data_nascimento} onChange={v => setForm(f => ({ ...f, data_nascimento: v }))} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="bn-tel" className="text-xs">Telefone</Label>
              <Input id="bn-tel" value={form.telefone} onChange={set('telefone')} placeholder="(00) 00000-0000" inputMode="tel" autoComplete="tel" />
            </div>
            <div>
              <Label htmlFor="bn-email" className="text-xs">Email</Label>
              <Input id="bn-email" type="email" value={form.email} onChange={set('email')} autoComplete="email" inputMode="email" />
            </div>
          </div>

          <div>
            <Label htmlFor="bn-campus" className="text-xs">Campus (alimenta KPI por área)</Label>
            <select
              id="bn-campus"
              value={form.area_kpi}
              onChange={e => setForm(f => ({ ...f, area_kpi: e.target.value }))}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
            >
              <option value="sede">CBRio Domingo (Sede)</option>
              <option value="ami">AMI</option>
              <option value="bridge">Bridge</option>
              <option value="online">Online</option>
            </select>
          </div>

          <div>
            <Label htmlFor="bn-end" className="text-xs">Endereço</Label>
            <Input id="bn-end" value={form.endereco} onChange={set('endereco')} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="bn-camisa" className="text-xs">Tamanho da camisa</Label>
              <select
                id="bn-camisa"
                value={form.tamanho_camisa}
                onChange={e => setForm(f => ({ ...f, tamanho_camisa: e.target.value }))}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
              >
                <option value="">—</option>
                {['PP','P','M','G','GG','XG','XGG','2','4','6','8','10','12','14'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.eh_crianca}
                  onChange={e => setForm(f => ({ ...f, eh_crianca: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: '#00B39D' }}
                />
                <span>É criança</span>
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-border p-3 space-y-2 bg-muted/10">
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.possui_deficiencia}
                onChange={e => setForm(f => ({ ...f, possui_deficiencia: e.target.checked }))}
                style={{ width: 16, height: 16, accentColor: '#dc2626' }}
              />
              <AlertCircle className="h-4 w-4 text-red-600" />
              <span>Possui deficiência</span>
            </label>
            {form.possui_deficiencia && (
              <div>
                <Label htmlFor="bn-def-desc" className="text-xs">Qual? (para o time de integração saber)</Label>
                <Textarea
                  id="bn-def-desc"
                  value={form.deficiencia_descricao}
                  onChange={e => setForm(f => ({ ...f, deficiencia_descricao: e.target.value }))}
                  rows={2}
                  placeholder="Ex.: cadeirante, deficiência auditiva, autismo..."
                />
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="bn-obs" className="text-xs">Observações</Label>
            <Textarea id="bn-obs" value={form.observacoes} onChange={set('observacoes')} rows={2} />
          </div>

          {erro && (
            <div className="rounded-xl border border-red-200 bg-red-50/40 dark:bg-red-950/20 dark:border-red-900/40 p-3 flex gap-2 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{erro}</span>
            </div>
          )}

          <div className="rounded-xl border border-amber-200 bg-amber-50/40 dark:bg-amber-950/20 dark:border-amber-900/40 p-3 flex gap-2 text-xs text-amber-800 dark:text-amber-200">
            <FileText className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              Status inicial: <strong>pendente</strong>. Voce define a data e marca como
              "confirmado"/"realizado" no detalhe depois do cadastro.
            </div>
          </div>
        </div>

        <DialogFooter className="pt-3">
          <Button variant="outline" onClick={tentarFechar} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving} className="gap-2 bg-[#00B39D] hover:bg-[#00B39D]/90 text-white">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Cadastrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
