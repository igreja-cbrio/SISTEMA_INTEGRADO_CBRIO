import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { dashboardSemanal as api } from '../../api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Loader2, Plus, Trash2, Target, Edit2, Sparkles, BarChart2, Activity, Archive, LineChart, AreaChart, PieChart, Radar } from 'lucide-react';
import { INDICADORES } from '../../pages/DashboardSemanal';
import MetaGauge from './MetaGauge';

const PERIODICIDADES = [
  { value: 'semanal', label: 'Semanal' },
  { value: 'mensal',  label: 'Mensal' },
  { value: 'anual',   label: 'Anual' },
];

const TIPOS_GRAFICO = [
  { value: 'barra', label: 'Barra de progresso',  icon: BarChart2 },
  { value: 'gauge', label: 'Gauge (meia-lua)',    icon: Activity },
];

const BASES_SUGESTAO = [
  { value: 'mes_anterior',           label: 'Média do mês anterior' },
  { value: 'mesmo_mes_ano_anterior', label: 'Mesmo mês do ano passado' },
  { value: 'trimestre_anterior',     label: 'Últimos 3 meses' },
  { value: 'ano_anterior',           label: 'Ano anterior inteiro' },
];

export default function DashMetasAba() {
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  // Chave que muda toda vez que a aba é "entrada" · força re-animação dos cards
  const [mountKey, setMountKey] = useState(0);
  useEffect(() => {
    setMountKey(k => k + 1);
  }, []);

  const { data: metas, isLoading } = useQuery({
    queryKey: ['dash-sem', 'metas'],
    queryFn: () => api.metasList(),
    staleTime: 60_000,
  });

  // Indicadores customizados ativos (criados via aba Criar com IA) aparecem
  // junto com as metas pra centralizar o painel de acompanhamento
  const { data: indicadoresCustom } = useQuery({
    queryKey: ['dash-sem', 'indic-custom', 'ativo'],
    queryFn: () => api.indicadoresCustomList('ativo'),
    staleTime: 60_000,
  });

  const arquivarIndicador = useMutation({
    mutationFn: (id) => api.indicadorCustomPatch(id, { status: 'arquivado' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dash-sem', 'indic-custom'] }),
  });

  const hoje = new Date();
  const anoAtual = hoje.getUTCFullYear();
  const semanaAnterior = Math.max(1, isoWeekOf(hoje).semana - 1);

  const createOrUpdate = useMutation({
    mutationFn: async (payload) => {
      if (payload.id) return api.metaUpdate(payload.id, payload);
      return api.metaCreate(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dash-sem', 'metas'] });
      setEditOpen(false);
      setEditing(null);
    },
  });

  const remover = useMutation({
    mutationFn: (id) => api.metaRemove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dash-sem', 'metas'] }),
  });

  const abrirNovo = () => {
    setEditing({
      indicador: 'frequencia',
      rotulo: 'Frequência (semanal)',
      meta_valor: 1200,
      periodicidade: 'semanal',
      tipo_grafico: 'gauge',
      ativa: true,
    });
    setEditOpen(true);
  };

  const abrirEdit = (m) => {
    setEditing({ ...m, tipo_grafico: m.tipo_grafico || 'barra' });
    setEditOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Metas configuráveis</h3>
          <p className="text-xs text-muted-foreground">
            Defina alvos numéricos por indicador. Use o botão <span className="font-semibold text-[#00B39D]">Sugerir baseado em…</span> pra calcular automaticamente a partir do histórico. Escolha entre barra de progresso ou gauge semicircular.
          </p>
        </div>
        <Button onClick={abrirNovo} size="sm">
          <Plus className="h-4 w-4 mr-1.5" />Nova meta
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !metas?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Target className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Ainda não há metas configuradas.</p>
            <Button onClick={abrirNovo} size="sm" className="mt-3">
              <Plus className="h-4 w-4 mr-1.5" />Criar a primeira
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {metas.map((m, idx) => (
            <motion.div
              key={`${m.id}-${mountKey}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: idx * 0.05, ease: 'easeOut' }}
            >
              <MetaCard
                meta={m}
                mountKey={mountKey}
                onEdit={() => abrirEdit(m)}
                onDelete={() => remover.mutate(m.id)}
              />
            </motion.div>
          ))}
        </div>
      )}

      {/* Indicadores criados via IA · promovidos a ativo */}
      {indicadoresCustom?.length > 0 && (
        <div className="space-y-3 pt-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#00B39D]" />
            <h3 className="text-sm font-semibold">Indicadores criados com IA</h3>
            <span className="text-[11px] text-muted-foreground">
              · {indicadoresCustom.length} ativo{indicadoresCustom.length === 1 ? '' : 's'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground -mt-1">
            Estes indicadores foram criados na aba <span className="font-medium">Criar com IA</span> e promovidos a ativos. Use a sugestão (fórmula, gráfico, tabelas) como base pra implementação no banco.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {indicadoresCustom.map((ind, idx) => (
              <motion.div
                key={`ind-${ind.id}-${mountKey}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: idx * 0.05, ease: 'easeOut' }}
              >
                <IndicadorCustomCard
                  ind={ind}
                  onArchive={() => arquivarIndicador.mutate(ind.id)}
                />
              </motion.div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Editar meta' : 'Nova meta'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <MetaForm
              editing={editing}
              setEditing={setEditing}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => createOrUpdate.mutate(editing)}
              disabled={createOrUpdate.isPending}
            >
              {createOrUpdate.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetaForm({ editing, setEditing }) {
  const [baseSugestao, setBaseSugestao] = useState('mes_anterior');
  const [sugestaoLoading, setSugestaoLoading] = useState(false);
  const [sugestaoResult, setSugestaoResult] = useState(null);

  const sugerir = async () => {
    setSugestaoLoading(true);
    setSugestaoResult(null);
    try {
      const r = await api.metaSugerir({
        indicador: editing.indicador,
        base: baseSugestao,
        periodicidade: editing.periodicidade,
      });
      setSugestaoResult(r);
      if (r.sugestao > 0) {
        setEditing({ ...editing, meta_valor: r.sugestao });
      }
    } catch (e) {
      setSugestaoResult({ erro: e.message });
    } finally {
      setSugestaoLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Indicador</label>
        <Select
          value={editing.indicador}
          onValueChange={v => {
            const ind = INDICADORES.find(i => i.key === v);
            const rotuloAuto = `${ind?.label} (${editing.periodicidade})`;
            setEditing({
              ...editing,
              indicador: v,
              rotulo: editing.id ? editing.rotulo : rotuloAuto,
            });
          }}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {INDICADORES.map(i => (
              <SelectItem key={i.key} value={i.key}>{i.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Rótulo</label>
        <Input
          value={editing.rotulo}
          onChange={e => setEditing({ ...editing, rotulo: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Meta (valor)</label>
          <Input
            type="number"
            min={1}
            value={editing.meta_valor}
            onChange={e => setEditing({ ...editing, meta_valor: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Periodicidade</label>
          <Select
            value={editing.periodicidade}
            onValueChange={v => setEditing({ ...editing, periodicidade: v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODICIDADES.map(p => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Sugerir via histórico */}
      <div className="rounded-lg border border-dashed border-[#00B39D]/40 p-3 bg-[#00B39D]/5 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#00B39D]">
          <Sparkles className="h-3.5 w-3.5" />
          Sugerir meta baseado em histórico
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Select value={baseSugestao} onValueChange={setBaseSugestao}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BASES_SUGESTAO.map(b => (
                <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={sugerir} disabled={sugestaoLoading} size="sm" variant="outline">
            {sugestaoLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Calcular'}
          </Button>
        </div>
        {sugestaoResult && (
          <div className="text-xs">
            {sugestaoResult.erro ? (
              <p className="text-red-500">{sugestaoResult.erro}</p>
            ) : sugestaoResult.sugestao === 0 ? (
              <p className="text-amber-600">{sugestaoResult.aviso || 'Sem dados no período.'}</p>
            ) : (
              <p className="text-foreground">
                Média {editing.periodicidade} no {sugestaoResult.base_label}:{' '}
                <span className="font-bold text-[#00B39D]">{sugestaoResult.sugestao.toLocaleString('pt-BR')}</span>
                {' '}<span className="text-muted-foreground">
                  ({sugestaoResult.amostra} {editing.periodicidade === 'semanal' ? 'semana(s) completa(s) · domingo dentro do mês' : 'período(s)'})
                </span>
                {' · '}
                <span className="text-muted-foreground">preenchido no campo</span>
              </p>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Visualização</label>
        <div className="grid grid-cols-2 gap-2">
          {TIPOS_GRAFICO.map(t => {
            const ativo = editing.tipo_grafico === t.value;
            const Icone = t.icon;
            return (
              <button
                key={t.value}
                onClick={() => setEditing({ ...editing, tipo_grafico: t.value })}
                className={`p-2 rounded-lg border text-xs font-medium transition-all flex items-center gap-2 ${
                  ativo
                    ? 'bg-[#00B39D]/10 border-[#00B39D] text-[#00B39D]'
                    : 'border-border text-muted-foreground hover:border-foreground/30'
                }`}
              >
                <Icone className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <label className="text-xs font-medium">Ativa</label>
        <Switch
          checked={editing.ativa}
          onCheckedChange={v => setEditing({ ...editing, ativa: v })}
        />
      </div>
    </div>
  );
}

function MetaCard({ meta, mountKey, onEdit, onDelete }) {
  // Busca valor atual respeitando a periodicidade da meta (semanal/mensal/anual)
  const { data } = useQuery({
    queryKey: ['dash-sem', 'meta-valor', meta.indicador, meta.periodicidade],
    queryFn: () => api.metaValorAtual({ indicador: meta.indicador, periodicidade: meta.periodicidade }),
    enabled: meta.ativa,
    staleTime: 60_000,
  });

  const atual = data?.total || 0;
  const periodoLabel = data?.label || meta.periodicidade;
  const metaValor = Number(meta.meta_valor);
  const pct = Math.min(200, Math.round((atual / metaValor) * 100));
  const cor = pct >= 100 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#ef4444';
  const tipoGrafico = meta.tipo_grafico || 'gauge';

  return (
    <Card className={!meta.ativa ? 'opacity-60' : ''}>
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-sm font-medium">{meta.rotulo}</CardTitle>
          <p className="text-[11px] text-muted-foreground capitalize mt-0.5">
            {meta.periodicidade} · <span className="lowercase normal-case">{periodoLabel}</span>
          </p>
        </div>
        <div className="flex gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Editar"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => {
              if (confirm('Remover esta meta?')) onDelete();
            }}
            className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
            title="Remover"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {tipoGrafico === 'gauge' ? (
          <div>
            <MetaGauge
              atual={atual}
              meta={metaValor}
              anim={`${mountKey}-${atual}`}
              size={240}
              label={`${pct}% atingido`}
            />
          </div>
        ) : (
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <motion.div
                key={`val-${mountKey}-${atual}`}
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4 }}
                className="text-3xl font-bold tabular-nums"
                style={{ color: cor }}
              >
                {atual.toLocaleString('pt-BR')}
              </motion.div>
              <div className="text-sm text-muted-foreground tabular-nums">
                / {metaValor.toLocaleString('pt-BR')}
              </div>
            </div>
            <div className="h-3 rounded-full bg-muted overflow-hidden">
              <motion.div
                key={`bar-${mountKey}-${pct}`}
                className="h-full rounded-full"
                style={{ background: cor }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, pct)}%` }}
                transition={{ duration: 1.0, ease: 'easeOut' }}
              />
            </div>
            <div className="flex items-baseline justify-between mt-1 text-xs">
              <span className="font-semibold" style={{ color: cor }}>{pct}%</span>
              <span className="text-muted-foreground">{periodoLabel}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const ICONES_GRAFICO_IA = {
  barra: BarChart2,
  linha: LineChart,
  area:  AreaChart,
  pizza: PieChart,
  gauge: Activity,
  radar: Radar,
};

function IndicadorCustomCard({ ind, onArchive }) {
  const Icone = ICONES_GRAFICO_IA[ind.sugestao_ia?.tipo_grafico] || BarChart2;
  const sug = ind.sugestao_ia || {};

  return (
    <Card className="border-[#00B39D]/30 bg-[#00B39D]/[0.02]">
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#00B39D] bg-[#00B39D]/10 px-1.5 py-0.5 rounded">
              IA
            </span>
            <span className="text-[10px] text-muted-foreground capitalize">
              {sug.tipo_grafico || 'grafico'} · {sug.periodicidade_sugerida || ind.periodicidade || '—'}
            </span>
          </div>
          <CardTitle className="text-sm font-medium leading-tight">{ind.nome}</CardTitle>
        </div>
        <div className="flex gap-1 items-start">
          <div className="rounded-lg p-1.5 bg-[#00B39D]/10">
            <Icone className="h-4 w-4 text-[#00B39D]" />
          </div>
          <button
            onClick={() => { if (confirm('Arquivar este indicador?')) onArchive(); }}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Arquivar"
          >
            <Archive className="h-3.5 w-3.5" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {ind.descricao && (
          <p className="text-xs text-muted-foreground">
            {ind.descricao.length > 160 ? ind.descricao.slice(0, 157) + '…' : ind.descricao}
          </p>
        )}
        {sug.formula && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Fórmula</p>
            <code className="text-[11px] block bg-muted/50 px-2 py-1 rounded font-mono whitespace-pre-wrap">
              {sug.formula.length > 180 ? sug.formula.slice(0, 177) + '…' : sug.formula}
            </code>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          {sug.eixo_x && (
            <div>
              <p className="uppercase tracking-wider text-muted-foreground">Eixo X</p>
              <p className="text-foreground mt-0.5 capitalize line-clamp-2">{sug.eixo_x}</p>
            </div>
          )}
          {sug.eixo_y && (
            <div>
              <p className="uppercase tracking-wider text-muted-foreground">Eixo Y</p>
              <p className="text-foreground mt-0.5 capitalize line-clamp-2">{sug.eixo_y}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function isoWeekOf(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { ano: d.getUTCFullYear(), semana: week };
}
