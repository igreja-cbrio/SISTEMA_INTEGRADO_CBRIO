import { useState, useMemo, type ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { BirthDatePicker } from '@/components/ui/birth-date-picker';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { voluntariado } from '@/api';
import Paginacao from '@/components/Paginacao';
import { Checkbox } from '@/components/ui/checkbox';
import {
  imprimirRelatorioInscricoesVol, integradoEmTexto, STATUS_LABELS_INSCRICAO,
} from '@/lib/imprimirInscricoesVoluntariado';
import { Inbox, CheckCircle2, Percent, Search, Link2, Pencil, Save, Printer } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line,
} from 'recharts';

// Fonte única dos rótulos de status (compartilhada com o relatório impresso —
// duas cópias divergiriam na primeira mudança).
const STATUS_LABELS = STATUS_LABELS_INSCRICAO;

const STATUS_COLORS: Record<string, string> = {
  integrado: 'bg-green-500/10 text-green-700 border-green-500/20',
  enviado_ministerio: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
  inscrito: 'bg-gray-500/10 text-gray-700 border-gray-500/20',
  kids: 'bg-pink-500/10 text-pink-700 border-pink-500/20',
  nao_responde: 'bg-orange-500/10 text-orange-700 border-orange-500/20',
  nao_pode_ou_duplicata: 'bg-red-500/10 text-red-700 border-red-500/20',
  desistente: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
};

const ORIGEM_LABELS: Record<string, string> = {
  formulario_publico: 'Formulário público',
  form_google: 'Formulário Google',
  form_google_backfill: 'Importação (Google)',
  membresia: 'Membresia',
  manual: 'Manual',
};

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-foreground break-words">{value}</div>
    </div>
  );
}

const fmtCpf = (v?: string | null) => {
  const d = (v || '').replace(/\D+/g, '');
  if (d.length !== 11) return v || '-';
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};
const fmtTel = (v?: string | null) => {
  const d = (v || '').replace(/\D+/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v || '-';
};
const fmtDataNasc = (v?: string | null) => {
  if (!v) return '-';
  const s = String(v).slice(0, 10);
  const [y, m, d] = s.split('-');
  return d && m && y ? `${d}/${m}/${y}` : s;
};
const origemLabel = (o?: string | null) => (o ? (ORIGEM_LABELS[o] || o) : '-');

const ANO_ATUAL = new Date().getFullYear();
const ANOS = [ANO_ATUAL, ANO_ATUAL - 1, ANO_ATUAL - 2];
// ⚠️ "Todos os anos" existe porque a maior parte da base é ANTERIOR ao uso do
// sistema: das 829 inscrições vivas (medido em 17/08/2026), 604 são de
// 2024/2025 e vieram da planilha do Google. Sem esta opção o seletor cobria só
// 3 anos fixos — dado mais antigo que isso ficava inalcançável, e o relatório,
// que herda o filtro da tela, nunca conseguia sair completo.
const ANO_TODOS = 'todos';

const MES_LABEL = (ym: string) => {
  const [y, m] = ym.split('-');
  return `${m}/${y.slice(2)}`;
};

interface InscricoesSummary {
  filtros: { ano: string | null; area: string | null };
  total: { recebidas: number; alocadas: number; taxa: number | null };
  por_area: {
    kids: { recebidas: number; alocadas: number };
    sede: { recebidas: number; alocadas: number };
  };
  meses: Array<{
    mes: string;
    recebidas: number;
    alocadas: number;
    kids_rec: number;
    kids_aloc: number;
    sede_rec: number;
    sede_aloc: number;
    taxa: number | null;
  }>;
}

interface InscricaoRow {
  id: string;
  nome: string;
  sobrenome: string;
  nome_completo: string;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  data_nascimento: string | null;
  data_inscricao: string;
  area: string;
  status: string;
  dom_predominante: string | null;
  ministerios_interesse: string | null;
  participou_next: string | null;
  feedback: string | null;
  integrado_em: string | null;
  membro_id: string | null;
  nome_mae: string | null;
  origem: string | null;
  area_direcionada: string[] | null;
}

interface InscricoesListResponse {
  total: number;
  limit: number;
  offset: number;
  rows: InscricaoRow[];
}

interface BgCheck {
  id: string;
  status: string;
  resultado: string | null;
  certidao_url: string | null;
  consulta_erro: string | null;
  consentimento: boolean;
  consulta_em: string | null;
  revisado_por_nome: string | null;
  revisado_em: string | null;
  observacoes: string | null;
}

const BG_STATUS: Record<string, { label: string; cls: string }> = {
  pendente: { label: 'Pendente', cls: 'bg-gray-500/10 text-gray-700 border-gray-500/20' },
  consultando: { label: 'Consultando...', cls: 'bg-blue-500/10 text-blue-700 border-blue-500/20' },
  nada_consta: { label: 'Nada consta ✓', cls: 'bg-green-500/10 text-green-700 border-green-500/20' },
  possivel_registro: { label: 'Possível registro — conferir', cls: 'bg-red-500/10 text-red-700 border-red-500/20' },
  erro: { label: 'Erro na consulta', cls: 'bg-orange-500/10 text-orange-700 border-orange-500/20' },
  aprovado_manual: { label: 'Aprovado (manual) ✓', cls: 'bg-green-500/10 text-green-700 border-green-500/20' },
  reprovado: { label: 'Reprovado', cls: 'bg-red-600/10 text-red-700 border-red-600/30' },
  dispensado: { label: 'Dispensado', cls: 'bg-purple-500/10 text-purple-700 border-purple-500/20' },
};
const BG_LIBERADO = new Set(['nada_consta', 'aprovado_manual', 'dispensado']);
const ehKidsBridge = (area?: string | null) => ['kids', 'bridge'].includes(String(area || '').toLowerCase());

// Lista de ministérios pra marcar onde a pessoa foi DE FATO direcionada a
// servir (multi-seleção). Pode ajustar/expandir conforme os ministérios da CBRio.
const MINISTERIOS_DIRECIONAMENTO = [
  'Louvor', 'Kids', 'Bridge', 'AMI', 'Online', 'Integração', 'Recepção',
  'Estacionamento', 'Ofertório', 'Produção', 'Cuidados', 'Diaconia',
  'Intercessão', 'Comunicação', 'Boas-vindas', 'Grupos', 'Next',
];

export default function VolInscricoes() {
  const [ano, setAno] = useState<string>(String(ANO_ATUAL));
  const [area, setArea] = useState<string>('todas');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [search, setSearch] = useState<string>('');
  const [searchInput, setSearchInput] = useState<string>('');
  // Período por data de inscrição (de/até · inclusivo). Quando ativo, a LISTA
  // ignora o seletor de ano (um período pode cruzar anos) — o resumo/gráficos
  // lá de cima continuam no recorte do ano.
  // ⚠️ O que a pessoa DIGITA e o que vira FILTRO são coisas diferentes: ao
  // digitar o ano pelo teclado o navegador emite valores intermediários
  // válidos no formato ('0002-08-10', '0202-08-10'), e cada um dispararia um
  // fetch com filtro absurdo. O input mostra o valor cru; a query só usa data
  // plausível.
  const [de, setDe] = useState<string>('');
  const [ate, setAte] = useState<string>('');
  const [relatorioOpen, setRelatorioOpen] = useState(false);
  const [incluirContato, setIncluirContato] = useState(false);
  const [page, setPage] = useState(0);
  const [copied, setCopied] = useState(false);
  const [selected, setSelected] = useState<InscricaoRow | null>(null);
  const [obs, setObs] = useState('');
  const [editando, setEditando] = useState(false);
  const [integrarOpen, setIntegrarOpen] = useState(false);
  const [areasIntegrar, setAreasIntegrar] = useState<string[]>([]);
  const [desistirOpen, setDesistirOpen] = useState(false);
  const [motivoDesistir, setMotivoDesistir] = useState('');
  const [form, setForm] = useState<{ cpf: string; data_nascimento: string; nome_mae: string; ministerios_interesse: string; area_direcionada: string[]; feedback: string }>({
    cpf: '', data_nascimento: '', nome_mae: '', ministerios_interesse: '', area_direcionada: [], feedback: '',
  });
  const pageSize = 50;
  const queryClient = useQueryClient();
  // Inscrições marcadas pra excluir (pedido do Matheus · 17/08: as de teste
  // inflam o funil de quem quer servir).
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [excluindo, setExcluindo] = useState(false);

  const mudarStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => voluntariado.atualizarInscricao(id, status),
    onSuccess: (data: any, vars) => {
      // Merge da linha devolvida pelo servidor: é ela que traz o carimbo de
      // integrado_em (gravado ao integrar, limpo ao reverter) sem refetch.
      setSelected((prev) => (prev
        ? { ...prev, ...(data && typeof data === 'object' ? data : {}), status: vars.status }
        : prev));
      queryClient.invalidateQueries({ queryKey: ['vol', 'inscricoes-list'] });
      queryClient.invalidateQueries({ queryKey: ['vol', 'inscricoes-summary'] });
      toast.success('Status atualizado.');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao atualizar status.'),
  });

  function alternarSelecao(id: string) {
    setSelecionadas(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  async function excluirSelecionadas(linhas: any[]) {
    if (!selecionadas.size || excluindo) return;
    const ids = [...selecionadas];
    const marcadas = linhas.filter((p: any) => selecionadas.has(p.id));
    const nomes = marcadas.map((p: any) => p.nome_completo).slice(0, 8);
    const resto = ids.length > nomes.length ? `\n… e mais ${ids.length - nomes.length}` : '';
    // ⚠️ Integrada/enviada ao ministério sai do KPI de solicitações alocadas —
    // quem decide é quem está olhando, então o aviso vai na confirmação em vez
    // de virar bloqueio.
    const integradas = marcadas.filter((p: any) => ['integrado', 'enviado_ministerio'].includes(p.status)).length;
    const aviso = integradas
      ? `\n\n⚠️ ${integradas} ${integradas === 1 ? 'já foi integrada/enviada ao ministério e sairá' : 'já foram integradas/enviadas ao ministério e sairão'} do funil e dos indicadores.`
      : '';
    const ok = window.confirm(
      `Excluir ${ids.length === 1 ? 'esta inscrição' : `estas ${ids.length} inscrições`}?\n\n· ${nomes.join('\n· ')}${resto}${aviso}\n\n`
      + 'Some da lista, do funil e do relatório (reversível por super-admin). '
      + 'Para quem desistiu de verdade, use "Registrar desistência" — o histórico fica.',
    );
    if (!ok) return;
    setExcluindo(true);
    try {
      const r: any = await voluntariado.excluirInscricoesVolLote(ids);
      setSelecionadas(new Set());
      queryClient.invalidateQueries({ queryKey: ['vol', 'inscricoes-list'] });
      queryClient.invalidateQueries({ queryKey: ['vol', 'inscricoes-summary'] });
      const motivo = (r?.falhas_motivo || []).join(' · ');
      if (r?.falhas?.length) toast.warning([r?.resumo || 'Exclusão parcial', motivo].filter(Boolean).join(' — '));
      else toast.success(r?.resumo || 'Inscrições excluídas.');
    } catch (e: any) {
      toast.error([e?.message, e?.detalhe].filter(Boolean).join(' · ') || 'Erro ao excluir as inscrições.');
    } finally {
      setExcluindo(false);
    }
  }

  // Triagem de antecedentes (só Kids/Bridge)
  const selKidsBridge = selected ? ehKidsBridge(selected.area) : false;
  const { data: bg } = useQuery<{ check: BgCheck | null; autoConfigurado: boolean }>({
    queryKey: ['vol', 'antecedentes', selected?.id],
    queryFn: () => voluntariado.antecedentes(selected!.id),
    enabled: !!selected && selKidsBridge,
  });
  const check = bg?.check || null;
  const integracaoBloqueada = selKidsBridge && (!check || !BG_LIBERADO.has(check.status));

  const consultarBg = useMutation({
    mutationFn: () => voluntariado.consultarAntecedentes(selected!.id),
    onSuccess: (r: any) => {
      queryClient.invalidateQueries({ queryKey: ['vol', 'antecedentes', selected?.id] });
      if (r?.status === 'nada_consta') toast.success('Nada consta — voluntário liberado.');
      else if (r?.status === 'possivel_registro') toast.warning('Não emitiu certidão negativa — confira manualmente.');
      else if (r?.erro) toast.error(r.erro);
      else toast.success('Consulta executada.');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao consultar antecedentes.'),
  });

  const revisarBg = useMutation({
    mutationFn: ({ acao }: { acao: string }) =>
      voluntariado.revisarAntecedentes(check!.id, { acao, observacoes: obs || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vol', 'antecedentes', selected?.id] });
      setObs('');
      toast.success('Triagem atualizada.');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao atualizar triagem.'),
  });

  // Falta dado obrigatório pra consulta automática de antecedentes?
  const faltaDadosAntecedentes = selKidsBridge && !!selected && (
    String(selected.cpf || '').replace(/\D+/g, '').length !== 11 ||
    !selected.data_nascimento ||
    !selected.nome_mae
  );

  const abrirEdicao = () => {
    if (!selected) return;
    setForm({
      cpf: selected.cpf || '',
      data_nascimento: selected.data_nascimento ? String(selected.data_nascimento).slice(0, 10) : '',
      nome_mae: selected.nome_mae || '',
      ministerios_interesse: selected.ministerios_interesse || '',
      area_direcionada: Array.isArray(selected.area_direcionada) ? selected.area_direcionada : [],
      feedback: selected.feedback || '',
    });
    setEditando(true);
  };
  const toggleMinisterio = (m: string) =>
    setForm((f) => ({
      ...f,
      area_direcionada: f.area_direcionada.includes(m)
        ? f.area_direcionada.filter((x) => x !== m)
        : [...f.area_direcionada, m],
    }));

  // Áreas do direcionamento = as MESMAS opções do formulário público de inscrição
  // (vol_form_opcoes). Fallback pra lista fixa se a consulta falhar/vazia.
  // ⚠️ Declarado ANTES de interessesPessoa, que o referencia — declarar depois
  // é TDZ no render ("Cannot access 'X' before initialization" · bug do Ariel).
  const { data: opcoesForm } = useQuery({
    queryKey: ['vol', 'form-opcoes'],
    queryFn: () => voluntariado.formOpcoes.list(),
  });
  const areasDirecionamento = useMemo(() => {
    const raw: any = opcoesForm;
    const arr: any[] = Array.isArray(raw) ? raw : (raw?.opcoes || []);
    const labels = arr.filter((o) => o?.ativo !== false).map((o) => o?.label).filter(Boolean);
    return labels.length ? Array.from(new Set(labels)) : MINISTERIOS_DIRECIONAMENTO;
  }, [opcoesForm]);

  // Áreas que a PESSOA escolheu na inscrição (ministerios_interesse é a string
  // "Louvor, Kids, ..."). É a base do seletor ao integrar. Fallback: lista geral.
  const interessesPessoa = useMemo(() => {
    const raw = String(selected?.ministerios_interesse || '')
      .split(/[,;/]+/).map((s) => s.trim()).filter(Boolean);
    const uniq = Array.from(new Set(raw));
    return uniq.length ? uniq : areasDirecionamento;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.ministerios_interesse, areasDirecionamento]);

  // Opções do seletor de integração = interesses da pessoa ∪ o que já foi direcionado.
  const opcoesIntegrar = useMemo(
    () => Array.from(new Set([...interessesPessoa, ...(selected?.area_direcionada || [])])),
    [interessesPessoa, selected?.area_direcionada],
  );

  const abrirIntegrar = () => {
    if (!selected) return;
    const pre = (selected.area_direcionada && selected.area_direcionada.length)
      ? selected.area_direcionada
      : (interessesPessoa.length === 1 ? [...interessesPessoa] : []);
    setAreasIntegrar(pre);
    setIntegrarOpen(true);
  };
  const toggleAreaIntegrar = (m: string) =>
    setAreasIntegrar((a) => (a.includes(m) ? a.filter((x) => x !== m) : [...a, m]));

  // Grava a área direcionada escolhida E integra, num passo só.
  const integrarComAreas = useMutation({
    mutationFn: async (areas: string[]) => {
      await voluntariado.editarInscricao(selected!.id, { area_direcionada: areas });
      return voluntariado.atualizarInscricao(selected!.id, 'integrado');
    },
    onSuccess: (row: any) => {
      setSelected((prev) => (prev
        ? { ...prev, ...(row && typeof row === 'object' ? row : {}), status: 'integrado', area_direcionada: areasIntegrar }
        : prev));
      queryClient.invalidateQueries({ queryKey: ['vol', 'inscricoes-list'] });
      queryClient.invalidateQueries({ queryKey: ['vol', 'inscricoes-summary'] });
      setIntegrarOpen(false);
      toast.success('Pessoa integrada.');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao integrar.'),
  });

  // Desistiu de servir (antes de virar voluntário) · status terminal + motivo opcional.
  const desistir = useMutation({
    mutationFn: (motivo: string) => voluntariado.desistirInscricao(selected!.id, motivo),
    onSuccess: (row: any) => {
      setSelected((prev) => (prev ? { ...prev, ...row } : prev));
      queryClient.invalidateQueries({ queryKey: ['vol', 'inscricoes-list'] });
      queryClient.invalidateQueries({ queryKey: ['vol', 'inscricoes-summary'] });
      setDesistirOpen(false);
      setMotivoDesistir('');
      toast.success('Marcado como desistente.');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao registrar desistência.'),
  });

  const salvarDados = useMutation({
    mutationFn: () => voluntariado.editarInscricao(selected!.id, {
      cpf: form.cpf,
      data_nascimento: form.data_nascimento || null,
      nome_mae: form.nome_mae,
      ministerios_interesse: form.ministerios_interesse,
      area_direcionada: form.area_direcionada,
      feedback: form.feedback,
    }),
    onSuccess: (row: any) => {
      setSelected((prev) => (prev ? { ...prev, ...row } : prev));
      queryClient.invalidateQueries({ queryKey: ['vol', 'inscricoes-list'] });
      setEditando(false);
      toast.success('Dados atualizados.');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao salvar dados.'),
  });

  // `undefined` = sem recorte de ano no servidor (o endpoint trata como "tudo").
  const anoParam = ano === ANO_TODOS ? undefined : ano;
  const todosOsAnos = ano === ANO_TODOS;

  const { data, isLoading } = useQuery<InscricoesSummary>({
    queryKey: ['vol', 'inscricoes-summary', ano, area],
    queryFn: () => voluntariado.inscricoesSummary({
      ano: anoParam,
      area: area === 'todas' ? undefined : area,
    }),
  });

  // Data plausível = digitada por completo (o ano parcial "0202" passa em
  // qualquer regex de formato, mas não é uma data que alguém quis filtrar).
  const dataPlausivel = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number(s.slice(0, 4)) >= 2000;
  const deAplicado = dataPlausivel(de) ? de : '';
  const ateAplicado = dataPlausivel(ate) ? ate : '';
  const temPeriodo = !!(deAplicado || ateAplicado);
  // O servidor recusa (400) quando a inicial vem depois da final — a tela diz
  // isso antes de gastar a requisição.
  const periodoInvertido = !!(deAplicado && ateAplicado && deAplicado > ateAplicado);

  const { data: lista, isLoading: loadingList, error: listaErro } = useQuery<InscricoesListResponse>({
    queryKey: ['vol', 'inscricoes-list', ano, area, statusFilter, search, deAplicado, ateAplicado, page],
    enabled: !periodoInvertido,
    queryFn: () => voluntariado.inscricoesList({
      ano: temPeriodo ? undefined : anoParam,
      area: area === 'todas' ? undefined : area,
      status: statusFilter === 'todos' ? undefined : statusFilter,
      de: deAplicado || undefined,
      ate: ateAplicado || undefined,
      search: search || undefined,
      limit: pageSize,
      offset: page * pageSize,
    }),
  });

  // Rótulo humano da janela do filtro — vai colado no número da lista e no
  // cabeçalho do relatório (número sem a janela ao lado é número que mente).
  const periodoLabel = useMemo(() => {
    const f = (s: string) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
    if (deAplicado && ateAplicado) return `${f(deAplicado)} a ${f(ateAplicado)}`;
    if (deAplicado) return `a partir de ${f(deAplicado)}`;
    if (ateAplicado) return `até ${f(ateAplicado)}`;
    if (todosOsAnos) return 'todas as inscrições do sistema';
    return `Ano ${ano}`;
  }, [deAplicado, ateAplicado, ano, todosOsAnos]);

  // Gera o relatório impresso com o MESMO filtro da lista, paginando até o
  // total do servidor (o endpoint capa em 500 por página). A janela do popup
  // abre no CLIQUE (gesto do usuário) e é passada adiante — abrir depois do
  // fetch cai no bloqueador de popup.
  const gerarRelatorio = useMutation({
    mutationFn: async (win: Window) => {
      const base = {
        ano: temPeriodo ? undefined : anoParam,
        area: area === 'todas' ? undefined : area,
        status: statusFilter === 'todos' ? undefined : statusFilter,
        de: deAplicado || undefined,
        ate: ateAplicado || undefined,
        search: search || undefined,
        limit: 500,
      };
      const porId = new Map<string, InscricaoRow>();
      let total = 0;
      // Teto duro de 20 páginas (10 mil linhas) só como freio — a base viva
      // tem ~830 inscrições. Quando o teto morde, o relatório DECLARA.
      let i = 0;
      for (; i < 20; i++) {
        const r: InscricoesListResponse = await voluntariado.inscricoesList({ ...base, offset: i * 500 });
        total = r.total || 0;
        // Dedup por id: defesa em profundidade sobre o desempate de ordenação
        // do servidor — linha repetida na fronteira da página inflaria o total
        // impresso e os contadores por status.
        for (const row of r.rows || []) porId.set(row.id, row);
        if (!r.rows?.length || porId.size >= total) break;
      }
      return { rows: [...porId.values()], total, win };
    },
    onSuccess: ({ rows, total, win }) => {
      const ok = imprimirRelatorioInscricoesVol(rows, {
        periodoLabel,
        areaLabel: area === 'todas' ? null : (area === 'kids' ? 'Kids' : 'Sede'),
        statusLabel: statusFilter === 'todos' ? null : (STATUS_LABELS[statusFilter] || statusFilter),
        busca: search || null,
        totalNoFiltro: total,
      }, { incluirContato, win });
      if (!ok) {
        toast.error('Não foi possível abrir a janela de impressão — libere os popups deste site e tente de novo.');
        return;
      }
      setRelatorioOpen(false);
    },
    onError: (e: any, win) => {
      try { win?.close(); } catch { /* janela já fechada */ }
      toast.error(e?.message || 'Erro ao gerar o relatório.');
    },
  });

  const abrirRelatorio = () => {
    // Abre a janela DENTRO do gesto do clique e mostra um aguarde enquanto o
    // fetch pagina — window.open pós-await é bloqueado pelo navegador.
    const win = window.open('', '_blank', 'width=900,height=1100,scrollbars=yes');
    // ⚠️ Popup bloqueado avisa AQUI, antes de paginar 830 linhas à toa: sem
    // isso o diálogo fechava como se tivesse dado certo e nada abria.
    if (!win) {
      toast.error('O navegador bloqueou a janela do relatório — libere os popups deste site e tente de novo.');
      return;
    }
    win.document.write('<p style="font-family:system-ui,sans-serif;color:#555;padding:24px">Gerando relatório…</p>');
    gerarRelatorio.mutate(win);
  };

  const { data: distDir } = useQuery<{ rows: Array<{ ministerio: string; total: number }>; pessoas: number }>({
    queryKey: ['vol', 'por-direcionada', ano],
    // ⚠️ Sem a chave quando é "todos os anos": `URLSearchParams({ano: undefined})`
    // serializa a string "undefined", que o backend usaria como ano.
    queryFn: () => voluntariado.distribuicaoDirecionada(todosOsAnos ? {} : { ano }),
  });

  const chartData = useMemo(() => {
    if (!data?.meses) return [];
    return data.meses.map(m => ({
      mes: MES_LABEL(m.mes),
      Inscritos: m.recebidas,
      Alocados: m.alocadas,
      Taxa: m.taxa,
    }));
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
      </div>
    );
  }

  const total = data?.total || { recebidas: 0, alocadas: 0, taxa: null };
  const porArea = data?.por_area || { kids: { recebidas: 0, alocadas: 0 }, sede: { recebidas: 0, alocadas: 0 } };

  const formUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/inscricao-voluntariado`
    : '/inscricao-voluntariado';
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(formUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Inscrições de Voluntariado</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Compara quem se inscreveu (formulario) vs quem foi efetivamente integrado.
          </p>
        </div>
        <div className="flex gap-2">
          {/* Trocar o recorte volta pra página 1: sem isso o offset antigo
              sobrevive e um recorte menor devolve lista vazia — a tela diria
              "nenhuma inscrição" com dados existindo. */}
          <Select value={ano} onValueChange={(v) => { setAno(v); setPage(0); }}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANO_TODOS}>Todos os anos</SelectItem>
              {ANOS.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={area} onValueChange={(v) => { setArea(v); setPage(0); }}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas áreas</SelectItem>
              <SelectItem value="kids">Kids</SelectItem>
              <SelectItem value="sede">Sede</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Link do formulário público · compartilhar por WhatsApp/bio/QR */}
      <Card className="border-[#00B39D]/30 bg-[#00B39D]/5">
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Link2 className="h-4 w-4 text-[#00B39D] shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#00B39D]">
                Link do formulário público
              </p>
              <p className="text-sm font-mono truncate text-foreground">{formUrl}</p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              size="sm" variant="outline"
              onClick={handleCopyLink}
              className="border-[#00B39D]/40 hover:bg-[#00B39D]/10"
            >
              {copied ? 'Copiado!' : 'Copiar link'}
            </Button>
            <Button
              size="sm"
              className="bg-[#00B39D] hover:bg-[#00B39D]/90 text-white"
              onClick={() => window.open(formUrl, '_blank', 'noopener')}
            >
              Abrir
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 3 cards de resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="rounded-lg bg-blue-500/10 p-3">
              <Inbox className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl md:text-3xl font-bold">{total.recebidas}</div>
              <div className="text-xs text-muted-foreground">
                {todosOsAnos ? 'Inscritos (todos os anos)' : 'Inscritos no ano'}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="rounded-lg bg-green-500/10 p-3">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <div className="text-2xl md:text-3xl font-bold">{total.alocadas}</div>
              <div className="text-xs text-muted-foreground">Voluntários integrados</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="rounded-lg bg-orange-500/10 p-3">
              <Percent className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <div className="text-2xl md:text-3xl font-bold">
                {total.taxa !== null ? `${total.taxa}%` : '-'}
              </div>
              <div className="text-xs text-muted-foreground">Taxa de integração</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown por área */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Por segmento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Kids</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold">{porArea.kids.recebidas}</span>
                <span className="text-sm text-muted-foreground">inscritos</span>
              </div>
              <div className="text-sm">
                {porArea.kids.alocadas} integrados
                {porArea.kids.recebidas > 0 && (
                  <Badge variant="outline" className="ml-2">
                    {Math.round((porArea.kids.alocadas / porArea.kids.recebidas) * 100)}%
                  </Badge>
                )}
              </div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Sede</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold">{porArea.sede.recebidas}</span>
                <span className="text-sm text-muted-foreground">inscritos</span>
              </div>
              <div className="text-sm">
                {porArea.sede.alocadas} integrados
                {porArea.sede.recebidas > 0 && (
                  <Badge variant="outline" className="ml-2">
                    {Math.round((porArea.sede.alocadas / porArea.sede.recebidas) * 100)}%
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Onde estão · distribuição por área direcionada (o que a coordenação registrou) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Onde estão · por área direcionada</CardTitle>
        </CardHeader>
        <CardContent>
          {!distDir?.rows?.length ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma pessoa direcionada ainda. A "Área direcionada" é definida na ficha e passa a ser exigida ao integrar.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {distDir.pessoas} pessoa(s) direcionada(s) · quem foi para mais de um ministério conta em cada.
              </p>
              {(() => {
                const max = Math.max(...distDir.rows.map((r) => r.total), 1);
                return distDir.rows.map((r) => (
                  <div key={r.ministerio} className="flex items-center gap-3">
                    <div className="w-32 shrink-0 text-sm truncate" title={r.ministerio}>{r.ministerio}</div>
                    <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
                      <div className="h-full bg-[#00B39D]" style={{ width: `${Math.round((r.total / max) * 100)}%` }} />
                    </div>
                    <div className="w-8 shrink-0 text-sm font-semibold text-right">{r.total}</div>
                  </div>
                ));
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gráfico de barras comparativo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Inscritos vs Integrados por mês</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Sem dados no período.
            </div>
          ) : (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Inscritos" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Alocados" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gráfico de linha taxa */}
      {chartData.length > 0 && chartData.some(d => d.Taxa !== null) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Taxa de integração mensal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                  <Tooltip formatter={(v: any) => v === null ? '-' : `${v}%`} />
                  <Line type="monotone" dataKey="Taxa" stroke="#F97316" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resumo mensal */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Resumo mensal</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Mês</th>
                  <th className="text-right px-4 py-2 font-medium">Inscritos</th>
                  <th className="text-right px-4 py-2 font-medium">Integrados</th>
                  <th className="text-right px-4 py-2 font-medium">Taxa</th>
                </tr>
              </thead>
              <tbody>
                {data?.meses?.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-muted-foreground py-6">Sem dados</td></tr>
                )}
                {data?.meses?.map(m => (
                  <tr key={m.mes} className="border-b last:border-b-0">
                    <td className="px-4 py-2 font-medium">{MES_LABEL(m.mes)}</td>
                    <td className="px-4 py-2 text-right">{m.recebidas}</td>
                    <td className="px-4 py-2 text-right">{m.alocadas}</td>
                    <td className="px-4 py-2 text-right">
                      {m.taxa !== null ? `${m.taxa}%` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Lista de pessoas (drill-down) */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <CardTitle className="text-base">
              Pessoas inscritas {lista?.total != null && (
                <span className="text-muted-foreground text-sm font-normal">({lista.total})</span>
              )}
              {temPeriodo && (
                <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                  Período: {periodoLabel} · neste recorte o seletor de ano lá de cima não se aplica
                </span>
              )}
            </CardTitle>
            <div className="flex gap-2 flex-wrap items-center">
              {/* Filtro por data da inscrição (de/até · inclusivo) */}
              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  value={de}
                  max={ate || undefined}
                  onChange={(e) => { setDe(e.target.value); setPage(0); }}
                  aria-label="Inscrições a partir de"
                  title="Inscrições a partir de"
                  className="h-9 w-[140px]"
                />
                <span className="text-xs text-muted-foreground">a</span>
                <Input
                  type="date"
                  value={ate}
                  min={de || undefined}
                  onChange={(e) => { setAte(e.target.value); setPage(0); }}
                  aria-label="Inscrições até"
                  title="Inscrições até"
                  className="h-9 w-[140px]"
                />
                {temPeriodo && (
                  <Button size="sm" variant="ghost" className="h-9 px-2 text-xs"
                    onClick={() => { setDe(''); setAte(''); setPage(0); }}>
                    Limpar
                  </Button>
                )}
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos status</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <form onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); setPage(0); }} className="flex gap-1">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Buscar nome..."
                    className="pl-7 h-9 w-[160px]"
                  />
                </div>
                <Button type="submit" size="sm" variant="outline">Buscar</Button>
              </form>
              <Button size="sm" variant="outline" disabled={periodoInvertido}
                title={periodoInvertido ? 'Ajuste o período antes de gerar' : 'Gera a folha com o filtro atual'}
                onClick={() => { setIncluirContato(false); setRelatorioOpen(true); }}>
                <Printer className="h-3.5 w-3.5 mr-1" /> Gerar relatório
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {/* Barra da seleção: a ação pertence à seleção e fica à vista sem
              rolar. Só aparece com algo marcado — a coluna de caixas já diz que
              dá pra selecionar. */}
          {selecionadas.size > 0 && (
            <div className="flex items-center gap-3 flex-wrap px-4 pb-2 text-xs">
              <span className="text-muted-foreground">
                {selecionadas.size} selecionada{selecionadas.size > 1 ? 's' : ''}
              </span>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                onClick={() => setSelecionadas(new Set())}>
                Limpar seleção
              </Button>
              <Button size="sm" variant="ghost" disabled={excluindo}
                onClick={() => excluirSelecionadas(lista?.rows || [])}
                className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-500/10">
                {excluindo ? 'Excluindo…' : 'Excluir selecionadas'}
              </Button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  {/* SELEÇÃO PRA EXCLUIR (17/08/2026). Marca/desmarca a PÁGINA
                      visível — não a base inteira: o cabeçalho fica sobre as 50
                      linhas à vista, e "todos" ali significaria as 829 do
                      filtro, que é o caminho curto pra um estrago em massa. */}
                  <th className="px-3 py-2 w-8">
                    <Checkbox
                      checked={!!lista?.rows?.length && lista.rows.every((p: any) => selecionadas.has(p.id))}
                      onCheckedChange={(v) => setSelecionadas(prev => {
                        const s = new Set(prev);
                        (lista?.rows || []).forEach((p: any) => { if (v) s.add(p.id); else s.delete(p.id); });
                        return s;
                      })}
                      aria-label="Selecionar as inscrições desta página"
                    />
                  </th>
                  <th className="text-left px-4 py-2 font-medium">Nome</th>
                  <th className="text-left px-4 py-2 font-medium">Inscrição</th>
                  <th className="text-left px-4 py-2 font-medium">Área</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">Integrado em</th>
                  <th className="text-left px-4 py-2 font-medium">Ministério</th>
                  <th className="text-left px-4 py-2 font-medium">Contato</th>
                  <th className="text-center px-4 py-2 font-medium">Membro</th>
                </tr>
              </thead>
              <tbody>
                {periodoInvertido && (
                  <tr><td colSpan={9} className="text-center text-amber-600 py-6">
                    A data inicial vem depois da final — ajuste o período.
                  </td></tr>
                )}
                {!periodoInvertido && loadingList && (
                  <tr><td colSpan={9} className="text-center text-muted-foreground py-6">Carregando...</td></tr>
                )}
                {/* Erro vem ANTES do vazio — erro disfarçado de "nenhuma inscrição"
                    leva a decisão errada (lei do projeto). */}
                {!periodoInvertido && !loadingList && !!listaErro && (
                  <tr><td colSpan={9} className="text-center text-red-600 py-6">
                    {(listaErro as any)?.message || 'Erro ao carregar as inscrições — tente ajustar o filtro.'}
                  </td></tr>
                )}
                {!periodoInvertido && !loadingList && !listaErro && lista?.rows?.length === 0 && (
                  <tr><td colSpan={9} className="text-center text-muted-foreground py-6">Nenhuma inscrição com esses filtros</td></tr>
                )}
                {lista?.rows?.map(p => (
                  <tr
                    key={p.id}
                    onClick={() => { setSelected(p); setObs(''); }}
                    className={`border-b last:border-b-0 cursor-pointer ${
                      selecionadas.has(p.id) ? 'bg-primary/10' : 'hover:bg-accent/30'}`}
                  >
                    {/* stopPropagation: sem ele, marcar a caixa abriria a ficha
                        por cima da própria seleção. */}
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={selecionadas.has(p.id)}
                        onCheckedChange={() => alternarSelecao(p.id)}
                        aria-label={`Selecionar ${p.nome_completo}`}
                      />
                    </td>
                    <td className="px-4 py-2 font-medium">
                      {p.nome_completo}
                      {p.email && <div className="text-xs text-muted-foreground">{p.email}</div>}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                      {new Date(p.data_inscricao).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-2 capitalize">{p.area}</td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className={STATUS_COLORS[p.status] || ''}>
                        {STATUS_LABELS[p.status] || p.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs whitespace-nowrap text-muted-foreground">
                      {integradoEmTexto(p.integrado_em) || '-'}
                    </td>
                    <td className="px-4 py-2 text-xs max-w-[200px] truncate" title={p.ministerios_interesse || ''}>
                      {p.ministerios_interesse || '-'}
                    </td>
                    <td className="px-4 py-2 text-xs whitespace-nowrap">
                      {p.telefone || '-'}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {p.membro_id ? (
                        <Link2 className="h-4 w-4 text-green-600 mx-auto" />
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lista && (
            <div className="px-4 pb-3">
              <Paginacao
                page={page + 1}
                pageSize={pageSize}
                total={lista.total}
                onPageChange={(p) => setPage(p - 1)}
                itemLabel="inscritos"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detalhe da inscrição · clique numa linha pra abrir */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setEditando(false); } }}>
        <DialogContent className="max-w-lg max-h-[88vh] flex flex-col">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  {selected.nome_completo}
                  <Badge variant="outline" className={STATUS_COLORS[selected.status] || ''}>
                    {STATUS_LABELS[selected.status] || selected.status}
                  </Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
                {!editando ? (
                  <>
                    <div className="flex justify-end -mb-2 mt-1">
                      <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={abrirEdicao}>
                        <Pencil className="h-3.5 w-3.5" /> Editar dados
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
                      <Info label="Inscrição" value={new Date(selected.data_inscricao).toLocaleDateString('pt-BR')} />
                      <Info label="Telefone" value={fmtTel(selected.telefone)} />
                      <Info label="E-mail" value={selected.email || '-'} />
                      <Info label="CPF" value={fmtCpf(selected.cpf)} />
                      <Info label="Data de nascimento" value={fmtDataNasc(selected.data_nascimento)} />
                      <Info label="Nome da mãe" value={selected.nome_mae || '-'} />
                      <Info label="Participou do NEXT" value={selected.participou_next || '-'} />
                      <Info label="Dom predominante" value={selected.dom_predominante || '-'} />
                      <Info label="Origem" value={origemLabel(selected.origem)} />
                      <div className="sm:col-span-2">
                        <Info label="Áreas de interesse (o que pediu)" value={selected.ministerios_interesse || '-'} />
                      </div>
                      <div className="sm:col-span-2">
                        <Info
                          label="Área direcionada (onde foi de fato)"
                          value={selected.area_direcionada && selected.area_direcionada.length ? (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {selected.area_direcionada.map((m) => (
                                <Badge key={m} variant="outline" className="bg-[#00B39D]/10 text-[#00837a] border-[#00B39D]/20">{m}</Badge>
                              ))}
                            </div>
                          ) : <span className="text-muted-foreground">— ainda não direcionada</span>}
                        />
                      </div>
                      <Info
                        label="Vínculo de membro"
                        value={selected.membro_id
                          ? <span className="text-green-600 font-medium">Vinculado</span>
                          : 'Não vinculado'}
                      />
                      {/* integrado_em é TEXT com 3 gerações de dado (data ISO ·
                          boolean da planilha · texto livre) — o helper filtra o
                          boolean e formata a data; sem ele a ficha mostrava
                          "True"/"False" cru. */}
                      {integradoEmTexto(selected.integrado_em) && (
                        <Info label="Integrado em" value={integradoEmTexto(selected.integrado_em)} />
                      )}
                      {selected.feedback && (
                        <div className="sm:col-span-2">
                          <Info label="Observações" value={selected.feedback} />
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="space-y-3 mt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] uppercase tracking-wide text-muted-foreground">CPF</label>
                        <Input value={form.cpf} onChange={(e) => setForm((f) => ({ ...f, cpf: e.target.value }))} placeholder="Só números (11 dígitos)" />
                      </div>
                      <div>
                        <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Data de nascimento</label>
                        <BirthDatePicker value={form.data_nascimento} onChange={(v) => setForm((f) => ({ ...f, data_nascimento: v }))} />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Nome da mãe</label>
                      <Input value={form.nome_mae} onChange={(e) => setForm((f) => ({ ...f, nome_mae: e.target.value }))} placeholder="Necessário pra antecedentes (Kids/Bridge)" />
                    </div>
                    <div>
                      <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Áreas de interesse (o que pediu)</label>
                      <Input value={form.ministerios_interesse} onChange={(e) => setForm((f) => ({ ...f, ministerios_interesse: e.target.value }))} placeholder="Ex.: Louvor, Kids, Recepção" />
                    </div>
                    <div>
                      <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Área direcionada (onde foi de fato · pode marcar mais de uma)</label>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {Array.from(new Set([...areasDirecionamento, ...form.area_direcionada])).map((m) => {
                          const on = form.area_direcionada.includes(m);
                          return (
                            <button key={m} type="button" onClick={() => toggleMinisterio(m)}
                              className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${on ? 'bg-[#00B39D] text-white border-[#00B39D]' : 'bg-background text-muted-foreground border-border hover:border-[#00B39D]/50'}`}>
                              {m}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Observações / feedback</label>
                      <Textarea
                        rows={3}
                        value={form.feedback}
                        onChange={(e) => setForm((f) => ({ ...f, feedback: e.target.value }))}
                        placeholder="Ex.: feedback dia 07/05 · disse que tem se sentido bem servindo..."
                        className="mt-1 resize-y"
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" disabled={salvarDados.isPending} onClick={() => salvarDados.mutate()}>
                        <Save className="h-3.5 w-3.5 mr-1" /> {salvarDados.isPending ? 'Salvando...' : 'Salvar'}
                      </Button>
                      <Button size="sm" variant="outline" disabled={salvarDados.isPending} onClick={() => setEditando(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}

                {/* Triagem de antecedentes criminais · obrigatória pra Kids/Bridge */}
                {selKidsBridge && (
                  <div className="pt-4 mt-2 border-t space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">Antecedentes criminais</span>
                        <Badge variant="outline" className={check ? (BG_STATUS[check.status]?.cls || '') : 'bg-gray-500/10 text-gray-700'}>
                          {check ? (BG_STATUS[check.status]?.label || check.status) : 'Sem triagem'}
                        </Badge>
                      </div>
                      {bg?.autoConfigurado && (
                        <Button size="sm" variant="outline" disabled={consultarBg.isPending}
                          onClick={() => consultarBg.mutate()}>
                          {consultarBg.isPending ? 'Consultando...' : (check && check.status !== 'pendente' ? 'Refazer consulta' : 'Consultar agora')}
                        </Button>
                      )}
                    </div>

                    {!bg?.autoConfigurado && (
                      <p className="text-xs text-muted-foreground">
                        Consulta automática não configurada — faça a triagem manual: confira a certidão e aprove.
                      </p>
                    )}
                    {bg?.autoConfigurado && faltaDadosAntecedentes && !editando && (
                      <p className="text-xs text-amber-600">
                        Faltam dados pra consulta automática (CPF, data de nascimento e/ou nome da mãe).{' '}
                        <button type="button" className="underline font-medium" onClick={abrirEdicao}>Completar agora</button>
                      </p>
                    )}
                    {check?.status === 'erro' && check?.consulta_erro && (
                      <p className="text-xs text-orange-600">Erro na consulta: {check.consulta_erro}</p>
                    )}
                    {check?.certidao_url && (
                      <a href={check.certidao_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-[#00B39D] underline inline-block">
                        Ver certidão emitida
                      </a>
                    )}
                    {check?.revisado_por_nome && (
                      <p className="text-xs text-muted-foreground">
                        Revisado por {check.revisado_por_nome}
                        {check.observacoes ? ` — ${check.observacoes}` : ''}
                      </p>
                    )}

                    {check && (
                      <div className="space-y-2 pt-1">
                        <textarea
                          value={obs}
                          onChange={(e) => setObs(e.target.value)}
                          placeholder="Observação da conferência (opcional)"
                          className="w-full text-sm rounded-md border bg-background p-2 min-h-[52px]"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" className="text-green-700 border-green-500/40 hover:bg-green-500/10"
                            disabled={revisarBg.isPending}
                            onClick={() => revisarBg.mutate({ acao: 'aprovar' })}>
                            Aprovar manualmente
                          </Button>
                          <Button size="sm" variant="outline" className="text-purple-700 border-purple-500/40 hover:bg-purple-500/10"
                            disabled={revisarBg.isPending}
                            onClick={() => revisarBg.mutate({ acao: 'dispensar' })}>
                            Dispensar triagem
                          </Button>
                          <Button size="sm" variant="outline" className="text-red-700 border-red-500/40 hover:bg-red-500/10"
                            disabled={revisarBg.isPending}
                            onClick={() => revisarBg.mutate({ acao: 'reprovar' })}>
                            Reprovar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Ações de triagem · inscrito → enviado ao ministério → integrado */}
                <div className="flex flex-wrap gap-2 pt-4 mt-2 border-t">
                  {selected.status === 'inscrito' && (
                    <Button size="sm" disabled={mudarStatus.isPending}
                      onClick={() => mudarStatus.mutate({ id: selected.id, status: 'enviado_ministerio' })}>
                      Enviar ao ministério
                    </Button>
                  )}
                  {(selected.status === 'inscrito' || selected.status === 'enviado_ministerio') && (
                    <Button size="sm" variant="default"
                      disabled={mudarStatus.isPending || integracaoBloqueada}
                      title={integracaoBloqueada
                        ? 'Triagem de antecedentes pendente — libere a verificação antes de integrar'
                        : 'Escolher a(s) área(s) e integrar'}
                      onClick={abrirIntegrar}>
                      Integrar
                    </Button>
                  )}
                  {selected.status === 'enviado_ministerio' && (
                    <Button size="sm" variant="outline" disabled={mudarStatus.isPending}
                      onClick={() => mudarStatus.mutate({ id: selected.id, status: 'inscrito' })}>
                      Voltar pra triagem
                    </Button>
                  )}
                  {selected.status === 'integrado' && (
                    <Button size="sm" variant="outline" disabled={mudarStatus.isPending}
                      onClick={() => mudarStatus.mutate({ id: selected.id, status: 'enviado_ministerio' })}>
                      Reverter integração
                    </Button>
                  )}
                  {/* Desistiu de servir (nunca chegou a servir) · não vira voluntário, não conta como inativo */}
                  {(selected.status === 'inscrito' || selected.status === 'enviado_ministerio') && (
                    <Button size="sm" variant="ghost"
                      className="text-slate-600 hover:text-slate-700"
                      disabled={mudarStatus.isPending}
                      onClick={() => { setMotivoDesistir(''); setDesistirOpen(true); }}>
                      Desistiu de servir
                    </Button>
                  )}
                  {selected.status === 'desistente' && (
                    <Button size="sm" variant="outline" disabled={mudarStatus.isPending}
                      onClick={() => mudarStatus.mutate({ id: selected.id, status: 'inscrito' })}>
                      Reverter (voltar pra triagem)
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Desistiu de servir · motivo opcional */}
      <Dialog open={desistirOpen} onOpenChange={(v) => { if (!v) setDesistirOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Desistiu de servir</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Marca <b>{selected.nome_completo || selected.nome}</b> como <b>desistente</b> — a pessoa
                não chegou a servir. Ela <b>não</b> entra no cadastro de voluntários nem na conta de
                inativos. Dá pra reverter depois.
              </p>
              <div>
                <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Motivo (opcional)</label>
                <Textarea rows={3} className="mt-1 resize-y"
                  value={motivoDesistir}
                  onChange={(e) => setMotivoDesistir(e.target.value)}
                  placeholder="Ex.: conversou com o líder e preferiu não seguir agora." />
              </div>
              <div className="flex gap-2 pt-1 justify-end">
                <Button size="sm" variant="ghost" disabled={desistir.isPending}
                  onClick={() => setDesistirOpen(false)}>
                  Cancelar
                </Button>
                <Button size="sm" disabled={desistir.isPending}
                  onClick={() => desistir.mutate(motivoDesistir)}>
                  {desistir.isPending ? 'Salvando...' : 'Confirmar desistência'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Integrar · escolher a(s) área(s) — todas ou só uma */}
      <Dialog open={integrarOpen} onOpenChange={(v) => { if (!v) setIntegrarOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Integrar — escolher a(s) área(s)</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {interessesPessoa.length > 1
                  ? <>A pessoa se inscreveu em <b>mais de uma área</b>. Escolha onde integrá-la — marque todas ou só uma.</>
                  : <>Confirme a área onde a pessoa vai servir.</>}
              </p>
              {String(selected.ministerios_interesse || '').trim() && (
                <p className="text-[11px] text-muted-foreground">
                  Áreas de interesse: <span className="text-foreground">{selected.ministerios_interesse}</span>
                </p>
              )}

              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => setAreasIntegrar([...opcoesIntegrar])}>
                  Marcar todas
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs"
                  onClick={() => setAreasIntegrar([])}>
                  Limpar
                </Button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {opcoesIntegrar.map((m) => {
                  const on = areasIntegrar.includes(m);
                  return (
                    <button key={m} type="button" onClick={() => toggleAreaIntegrar(m)}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${on ? 'bg-[#00B39D] text-white border-[#00B39D]' : 'bg-background text-muted-foreground border-border hover:border-[#00B39D]/50'}`}>
                      {m}
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-2 pt-2 justify-end">
                <Button size="sm" variant="ghost" disabled={integrarComAreas.isPending}
                  onClick={() => setIntegrarOpen(false)}>
                  Cancelar
                </Button>
                <Button size="sm" disabled={integrarComAreas.isPending || areasIntegrar.length === 0}
                  onClick={() => integrarComAreas.mutate(areasIntegrar)}>
                  {integrarComAreas.isPending
                    ? 'Integrando...'
                    : `Integrar${areasIntegrar.length ? ` em ${areasIntegrar.length} área${areasIntegrar.length > 1 ? 's' : ''}` : ''}`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Gerar relatório · sai em A4 com o MESMO filtro aplicado na lista */}
      <Dialog open={relatorioOpen} onOpenChange={(v) => { if (!v) setRelatorioOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar relatório</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              O relatório sai em folha A4 com o <b>mesmo filtro aplicado na lista</b> — período,
              área, status e busca ficam declarados no cabeçalho da folha.
            </p>
            <div className="rounded-md border p-3 text-sm space-y-1">
              <div><span className="text-muted-foreground">Período:</span> {periodoLabel}</div>
              <div><span className="text-muted-foreground">Área:</span> {area === 'todas' ? 'Todas' : (area === 'kids' ? 'Kids' : 'Sede')}</div>
              <div><span className="text-muted-foreground">Status:</span> {statusFilter === 'todos' ? 'Todos' : (STATUS_LABELS[statusFilter] || statusFilter)}</div>
              {search && <div><span className="text-muted-foreground">Busca:</span> “{search}”</div>}
              <div><span className="text-muted-foreground">Inscrições no filtro:</span> {lista?.total ?? '—'}</div>
            </div>

            {/* ⚠️ A maior parte da base é anterior ao uso do sistema (veio da
                planilha). Com um recorte temporal ativo, dizer isso aqui evita
                a folha sair parcial sem quem gerou perceber. */}
            {(!todosOsAnos || temPeriodo) && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs space-y-2">
                <p>
                  Este relatório cobre <b>apenas o recorte acima</b>. As inscrições anteriores
                  (inclusive as que vieram da planilha) ficam de fora.
                </p>
                <Button
                  size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => { setAno(ANO_TODOS); setDe(''); setAte(''); setPage(0); }}
                >
                  Usar todas as inscrições do sistema
                </Button>
              </div>
            )}
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={incluirContato}
                onCheckedChange={(v) => setIncluirContato(!!v)}
                className="mt-0.5"
              />
              <span>
                Incluir contato (telefone/e-mail)
                <span className="block text-xs text-muted-foreground">
                  É dado pessoal em papel — marque só se a folha for pra quem vai falar com as pessoas.
                </span>
              </span>
            </label>
            <div className="flex gap-2 pt-1 justify-end">
              <Button size="sm" variant="ghost" disabled={gerarRelatorio.isPending}
                onClick={() => setRelatorioOpen(false)}>
                Cancelar
              </Button>
              <Button size="sm" disabled={gerarRelatorio.isPending} onClick={abrirRelatorio}>
                <Printer className="h-3.5 w-3.5 mr-1" />
                {gerarRelatorio.isPending ? 'Gerando...' : 'Gerar e imprimir'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
