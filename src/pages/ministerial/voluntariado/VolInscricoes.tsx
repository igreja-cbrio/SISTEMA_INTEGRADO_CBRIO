import { useState, useMemo, type ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { voluntariado } from '@/api';
import Paginacao from '@/components/Paginacao';
import { Inbox, CheckCircle2, Percent, Search, Link2, Pencil, Save } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line,
} from 'recharts';

const STATUS_LABELS: Record<string, string> = {
  integrado: 'Integrado',
  enviado_ministerio: 'Enviado ao ministério',
  inscrito: 'Inscrito (triagem)',
  kids: 'Kids',
  nao_responde: 'Não responde',
  nao_pode_ou_duplicata: 'Não pode / duplicata',
};

const STATUS_COLORS: Record<string, string> = {
  integrado: 'bg-green-500/10 text-green-700 border-green-500/20',
  enviado_ministerio: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
  inscrito: 'bg-gray-500/10 text-gray-700 border-gray-500/20',
  kids: 'bg-pink-500/10 text-pink-700 border-pink-500/20',
  nao_responde: 'bg-orange-500/10 text-orange-700 border-orange-500/20',
  nao_pode_ou_duplicata: 'bg-red-500/10 text-red-700 border-red-500/20',
};

const ORIGEM_LABELS: Record<string, string> = {
  formulario_publico: 'Formulario publico',
  form_google: 'Formulario Google',
  form_google_backfill: 'Importacao (Google)',
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
  const [page, setPage] = useState(0);
  const [copied, setCopied] = useState(false);
  const [selected, setSelected] = useState<InscricaoRow | null>(null);
  const [obs, setObs] = useState('');
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<{ cpf: string; data_nascimento: string; nome_mae: string; ministerios_interesse: string; area_direcionada: string[]; feedback: string }>({
    cpf: '', data_nascimento: '', nome_mae: '', ministerios_interesse: '', area_direcionada: [], feedback: '',
  });
  const pageSize = 50;
  const queryClient = useQueryClient();

  const mudarStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => voluntariado.atualizarInscricao(id, status),
    onSuccess: (_data, vars) => {
      setSelected((prev) => (prev ? { ...prev, status: vars.status } : prev));
      queryClient.invalidateQueries({ queryKey: ['vol', 'inscricoes-list'] });
      queryClient.invalidateQueries({ queryKey: ['vol', 'inscricoes-summary'] });
      toast.success('Status atualizado.');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao atualizar status.'),
  });

  // Triagem de antecedentes (só Kids/Bridge)
  const selKidsBridge = selected ? ehKidsBridge(selected.area) : false;
  const { data: bg } = useQuery<{ check: BgCheck | null; autoConfigurado: boolean }>({
    queryKey: ['vol', 'antecedentes', selected?.id],
    queryFn: () => voluntariado.antecedentes(selected!.id),
    enabled: !!selected && selKidsBridge,
  });
  const check = bg?.check || null;
  const integracaoBloqueada = selKidsBridge && (!check || !BG_LIBERADO.has(check.status));
  // Integrar exige a área direcionada definida (onde a pessoa vai servir).
  const semDirecionada = !!selected && !(selected.area_direcionada && selected.area_direcionada.length);

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

  const { data, isLoading } = useQuery<InscricoesSummary>({
    queryKey: ['vol', 'inscricoes-summary', ano, area],
    queryFn: () => voluntariado.inscricoesSummary({
      ano,
      area: area === 'todas' ? undefined : area,
    }),
  });

  const { data: lista, isLoading: loadingList } = useQuery<InscricoesListResponse>({
    queryKey: ['vol', 'inscricoes-list', ano, area, statusFilter, search, page],
    queryFn: () => voluntariado.inscricoesList({
      ano,
      area: area === 'todas' ? undefined : area,
      status: statusFilter === 'todos' ? undefined : statusFilter,
      search: search || undefined,
      limit: pageSize,
      offset: page * pageSize,
    }),
  });

  const { data: distDir } = useQuery<{ rows: Array<{ ministerio: string; total: number }>; pessoas: number }>({
    queryKey: ['vol', 'por-direcionada', ano],
    queryFn: () => voluntariado.distribuicaoDirecionada({ ano }),
  });

  // Áreas do direcionamento = as MESMAS opções do formulário público de inscrição
  // (vol_form_opcoes). Fallback pra lista fixa se a consulta falhar/vazia.
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
          <Select value={ano} onValueChange={setAno}>
            <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ANOS.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={area} onValueChange={setArea}>
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
                Link do formulario publico
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
              <div className="text-xs text-muted-foreground">Inscritos no ano</div>
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
              Sem dados no periodo.
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
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <CardTitle className="text-base">
              Pessoas inscritas {lista?.total != null && (
                <span className="text-muted-foreground text-sm font-normal">({lista.total})</span>
              )}
            </CardTitle>
            <div className="flex gap-2 flex-wrap">
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
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Nome</th>
                  <th className="text-left px-4 py-2 font-medium">Inscrição</th>
                  <th className="text-left px-4 py-2 font-medium">Área</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">Ministério</th>
                  <th className="text-left px-4 py-2 font-medium">Contato</th>
                  <th className="text-center px-4 py-2 font-medium">Membro</th>
                </tr>
              </thead>
              <tbody>
                {loadingList && (
                  <tr><td colSpan={7} className="text-center text-muted-foreground py-6">Carregando...</td></tr>
                )}
                {!loadingList && lista?.rows?.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-muted-foreground py-6">Nenhuma inscrição com esses filtros</td></tr>
                )}
                {lista?.rows?.map(p => (
                  <tr
                    key={p.id}
                    onClick={() => { setSelected(p); setObs(''); }}
                    className="border-b last:border-b-0 hover:bg-accent/30 cursor-pointer"
                  >
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
                    <td className="px-4 py-2 text-xs max-w-[200px] truncate" title={p.ministerios_interesse || ''}>
                      {p.ministerios_interesse || p.integrado_em || '-'}
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
                      <Info label="Inscricao" value={new Date(selected.data_inscricao).toLocaleDateString('pt-BR')} />
                      <Info label="Telefone" value={fmtTel(selected.telefone)} />
                      <Info label="E-mail" value={selected.email || '-'} />
                      <Info label="CPF" value={fmtCpf(selected.cpf)} />
                      <Info label="Data de nascimento" value={fmtDataNasc(selected.data_nascimento)} />
                      <Info label="Nome da mae" value={selected.nome_mae || '-'} />
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
                        label="Vinculo de membro"
                        value={selected.membro_id
                          ? <span className="text-green-600 font-medium">Vinculado</span>
                          : 'Não vinculado'}
                      />
                      {selected.integrado_em && <Info label="Integrado em" value={selected.integrado_em} />}
                      {selected.feedback && (
                        <div className="sm:col-span-2">
                          <Info label="Observacoes" value={selected.feedback} />
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
                        <Input type="date" value={form.data_nascimento} onChange={(e) => setForm((f) => ({ ...f, data_nascimento: e.target.value }))} />
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

                {/* Aviso: integrar exige a área direcionada */}
                {semDirecionada && (selected.status === 'inscrito' || selected.status === 'enviado_ministerio') && (
                  <p className="text-xs text-amber-600 pt-3">
                    Para integrar, defina a <b>Área direcionada</b> (onde a pessoa vai servir) em{' '}
                    <button type="button" className="underline font-medium" onClick={abrirEdicao}>Editar dados</button>.
                  </p>
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
                      disabled={mudarStatus.isPending || integracaoBloqueada || semDirecionada}
                      title={integracaoBloqueada
                        ? 'Triagem de antecedentes pendente — libere a verificação antes de integrar'
                        : semDirecionada
                          ? 'Defina a Área direcionada (em "Editar dados") antes de integrar'
                          : undefined}
                      onClick={() => mudarStatus.mutate({ id: selected.id, status: 'integrado' })}>
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
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
