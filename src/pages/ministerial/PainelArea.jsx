// ============================================================================
// PainelArea v3 · drill-down de KPIs + CULTOS + DADOS BRUTOS + saude por area
// ============================================================================
// Mudancas v3 (2026-05-21 · varredura fina):
//   - Nova aba "Cultos" (default) · puxa cultos recentes da area direto da
//     vw_culto_stats · resolve o problema "aba Dados sempre vazia"
//   - Filtro de periodo (30d/90d/180d/365d) no header · backend respeita
//   - Score com label maior + diagnostico em destaque
//   - Botao "Voltar ao painel mestre" no header
//   - Variacao % nos KPIs (mesma logica dos dados)
//   - Sparkline com hover tooltip
//   - Filtro "Sem valor" so aparece quando > 0
// ============================================================================

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { painelArea as api } from '../../api';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { ArrowLeft, ChevronRight, Plus } from 'lucide-react';
import { toast } from 'sonner';

const AREA_META = {
  kids: {
    nome: 'Kids',
    descricao: 'Indicadores do ministério infantil',
    accent: '#EC4899',
    accentSoft: 'rgba(236, 72, 153, 0.08)',
    accentBorder: 'rgba(236, 72, 153, 0.30)',
  },
  ami: {
    nome: 'AMI',
    descricao: 'Indicadores do culto AMI (adolescentes e jovens)',
    accent: '#8B5CF6',
    accentSoft: 'rgba(139, 92, 246, 0.08)',
    accentBorder: 'rgba(139, 92, 246, 0.30)',
  },
  bridge: {
    nome: 'Bridge',
    descricao: 'Indicadores do culto Bridge (transição entre AMI e Sede)',
    accent: '#3B82F6',
    accentSoft: 'rgba(59, 130, 246, 0.08)',
    accentBorder: 'rgba(59, 130, 246, 0.30)',
  },
  online: {
    nome: 'Online',
    descricao: 'Indicadores do culto Online (YouTube)',
    accent: '#EF4444',
    accentSoft: 'rgba(239, 68, 68, 0.08)',
    accentBorder: 'rgba(239, 68, 68, 0.30)',
  },
};

const VALOR_LABELS = {
  seguir: 'Seguir a Jesus',
  conectar: 'Conectar com Pessoas',
  investir: 'Investir Tempo com Deus',
  servir: 'Servir em Comunidade',
  generosidade: 'Viver Generosamente',
};

const VALOR_CORES = {
  seguir: '#8B5CF6',
  conectar: '#3B82F6',
  investir: '#F59E0B',
  servir: '#10B981',
  generosidade: '#EC4899',
};

const STATUS_META = {
  no_alvo:   { label: 'No alvo',  className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  atrasado:  { label: 'Atrasado', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  critico:   { label: 'Crítico',  className: 'bg-red-500/15 text-red-700 dark:text-red-400' },
  sem_dado:  { label: 'Sem dado', className: 'bg-muted text-muted-foreground' },
};

const SAUDE_META = {
  saudavel: { label: 'Saudável', color: '#10b981', bg: '#10b98115' },
  atencao:  { label: 'Atenção',  color: '#f59e0b', bg: '#f59e0b15' },
  risco:    { label: 'Em risco', color: '#ef4444', bg: '#ef444415' },
  critico:  { label: 'Crítico',  color: '#dc2626', bg: '#dc262615' },
};

const PERIODOS = [
  { id: '30d',  label: '30 dias' },
  { id: '90d',  label: '90 dias' },
  { id: '180d', label: '6 meses' },
  { id: '365d', label: '1 ano' },
];

function statusKey(traj) {
  if (!traj || traj.ultimo_valor == null) return 'sem_dado';
  return traj.status_trajetoria || 'sem_dado';
}

function formatNum(v) {
  if (v == null) return '—';
  return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function formatData(d) {
  if (!d) return '';
  try {
    const parts = d.split('-');
    return `${parts[2]}/${parts[1]}`;
  } catch { return d; }
}

function formatDataCompleta(d) {
  if (!d) return '';
  try {
    const [a, m, dia] = d.split('-');
    return `${dia}/${m}/${a}`;
  } catch { return d; }
}

export default function PainelArea({ area }) {
  const navigate = useNavigate();
  const { isAdmin, getAccessLevel } = useAuth();
  const meta = AREA_META[area] || AREA_META.online;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState('90d');

  const podePreencher = isAdmin || (getAccessLevel?.([area]) ?? 0) >= 3;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get(area, { periodo })
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) toast.error(e.message || 'Erro ao carregar área'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [area, periodo]);

  const npsDestaque = useMemo(() => {
    if (!data?.kpis) return [];
    return data.kpis.filter(k => /^CULTO-NPS-/i.test(k.id));
  }, [data]);

  const kpisRegulares = useMemo(() => {
    if (!data?.kpis) return [];
    return data.kpis.filter(k => !/^CULTO-NPS-/i.test(k.id));
  }, [data]);

  if (loading && !data) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center text-muted-foreground">
          Não foi possível carregar os dados.
        </Card>
      </div>
    );
  }

  const saude = data.saude || {};
  const saudeMeta = SAUDE_META[saude.diagnostico] || SAUDE_META.atencao;
  const cultos = data.cultos_recentes || [];
  const totaisCultos = data.totais_cultos;
  const temCultos = cultos.length > 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* ─────────────────────────── BREADCRUMB ─────────────────────────── */}
      <button
        onClick={() => navigate('/painel')}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Painel CBRio
        <ChevronRight className="h-3 w-3 opacity-50" />
        <span className="text-foreground font-medium">{meta.nome}</span>
      </button>

      {/* ─────────────────────────── HEADER ─────────────────────────── */}
      <div
        className="rounded-xl p-6 border-l-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-center"
        style={{
          background: meta.accentSoft,
          borderColor: meta.accentBorder,
          borderLeftColor: meta.accent,
        }}
      >
        <div>
          <h1 className="text-3xl font-bold text-foreground">{meta.nome}</h1>
          <p className="text-sm text-muted-foreground mt-1">{meta.descricao}</p>
          <div className="flex items-center gap-2 mt-3 text-xs flex-wrap">
            <Badge variant="outline">Somente leitura</Badge>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              Preenchimento via <span className="font-mono">/integracao</span>
            </span>
            {podePreencher && (
              <>
                <span className="text-muted-foreground">·</span>
                <button
                  onClick={() => navigate('/ministerial/integracao?aba=cultos')}
                  className="font-semibold hover:underline"
                  style={{ color: meta.accent }}
                >
                  Preencher dados →
                </button>
              </>
            )}
          </div>
        </div>

        {/* Score de saúde · agora com diagnostico em destaque */}
        <div className="flex items-center gap-4">
          <div
            className="w-32 h-32 rounded-full flex flex-col items-center justify-center border-4"
            style={{
              borderColor: saudeMeta.color,
              background: saudeMeta.bg,
            }}
          >
            <span className="text-3xl font-bold leading-none" style={{ color: saudeMeta.color }}>
              {saude.score ?? 0}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
              Score
            </span>
          </div>
          <div>
            <div className="text-lg font-bold leading-tight" style={{ color: saudeMeta.color }}>
              {saudeMeta.label}
            </div>
            <div className="text-xs text-muted-foreground mt-1 max-w-[160px]">
              {saude.pct_no_alvo ?? 0}% dos indicadores no alvo · {saude.kpis_total ?? 0} KPIs
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────── FILTRO DE PERIODO ─────────────────── */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Periodo:</span>
        {PERIODOS.map(p => (
          <button
            key={p.id}
            onClick={() => setPeriodo(p.id)}
            disabled={loading}
            className="px-2.5 py-1 rounded-md border transition-colors disabled:opacity-50"
            style={
              periodo === p.id
                ? { background: meta.accent, color: '#fff', borderColor: meta.accent }
                : { background: 'transparent', borderColor: 'rgb(226, 232, 240)' }
            }
          >
            {p.label}
          </button>
        ))}
        {data.periodo && (
          <span className="text-muted-foreground ml-auto">
            {formatDataCompleta(data.periodo.desde)} → {formatDataCompleta(data.periodo.ate)}
          </span>
        )}
      </div>

      {/* ─────────────────────── NPS DESTACADO ─────────────────────── */}
      {npsDestaque.length > 0 && (
        <Card
          className="overflow-hidden"
          style={{ borderColor: meta.accentBorder, borderWidth: 2 }}
        >
          <div className="p-4 border-b border-border flex items-center justify-between" style={{ background: meta.accentSoft }}>
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: meta.accent }}>
              NPS do culto · avaliação dos participantes
            </h2>
            {podePreencher && (
              <NpsRegistrarButton
                area={area}
                accent={meta.accent}
                onSaved={() => api.get(area, { periodo }).then(setData)}
              />
            )}
          </div>
          <div className="divide-y divide-border">
            {npsDestaque.map(k => (
              <KpiRow key={k.id} kpi={k} onClick={() => navigate(`/painel/kpi/${k.id}`)} />
            ))}
          </div>
        </Card>
      )}

      {/* ─────────────────────── TABS PRINCIPAIS ─────────────────────── */}
      <Tabs defaultValue={temCultos ? 'cultos' : 'indicadores'}>
        <TabsList className={`grid w-full max-w-2xl ${temCultos ? 'grid-cols-4' : 'grid-cols-3'}`}>
          {temCultos && (
            <TabsTrigger value="cultos">
              Cultos <span className="ml-1 opacity-60">({cultos.length})</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="indicadores">
            Indicadores {kpisRegulares.length > 0 && <span className="ml-1 opacity-60">({kpisRegulares.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="dados">
            Dados {data.dados?.length > 0 && <span className="ml-1 opacity-60">({data.dados.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="saude">Saúde</TabsTrigger>
        </TabsList>

        {/* ──────── ABA CULTOS ──────── */}
        {temCultos && (
          <TabsContent value="cultos" className="mt-6 space-y-4">
            {totaisCultos && (
              <TotaisCultoCards totais={totaisCultos} area={area} accent={meta.accent} />
            )}
            <CultosLista cultos={cultos} area={area} accent={meta.accent} />
          </TabsContent>
        )}

        {/* ──────── ABA INDICADORES ──────── */}
        <TabsContent value="indicadores" className="mt-6">
          {kpisRegulares.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Nenhum indicador cadastrado pra esta área ainda.
            </Card>
          ) : (
            <IndicadoresPorValor kpis={kpisRegulares} porValor={data.por_valor} semValor={data.sem_valor} navigate={navigate} accent={meta.accent} />
          )}
        </TabsContent>

        {/* ──────── ABA DADOS ──────── */}
        <TabsContent value="dados" className="mt-6">
          {data.dados?.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Nenhum tipo de dado bruto esperado nesta área ainda. KPIs simples
              usam só os números dos cultos (aba "Cultos").
            </Card>
          ) : (
            <DadosPorValor dados={data.dados || []} accent={meta.accent} />
          )}
          <p className="text-xs text-muted-foreground mt-3">
            <strong>Dados brutos</strong> são números preenchidos por área em <span className="font-mono">/dados-brutos</span>
            {' '}(voluntários, grupos, devocionais etc). Os <strong>cultos</strong> (frequência, decisões, batismos)
            vivem em tabela própria e aparecem na aba ao lado.
          </p>
        </TabsContent>

        {/* ──────── ABA SAÚDE ──────── */}
        <TabsContent value="saude" className="mt-6 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="Indicadores totais"
              value={saude.kpis_total ?? 0}
              hint="cadastrados pra essa área"
            />
            <StatCard
              label="No alvo"
              value={saude.kpis_no_alvo ?? 0}
              color="text-emerald-600 dark:text-emerald-400"
              hint={`de ${saude.kpis_total ?? 0} (${saude.pct_no_alvo ?? 0}%)`}
            />
            <StatCard
              label="Atrasados"
              value={saude.kpis_atrasado ?? 0}
              color="text-amber-600 dark:text-amber-400"
              hint="precisam de atenção"
            />
            <StatCard
              label="Críticos"
              value={saude.kpis_critico ?? 0}
              color="text-red-600 dark:text-red-400"
              hint="abaixo do limite"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Cobertura de KPIs</p>
              <p className="text-2xl font-bold text-foreground mt-1">{saude.pct_cobertos ?? 0}%</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {(saude.kpis_total ?? 0) - (saude.kpis_sem_dado ?? 0)} de {saude.kpis_total ?? 0} têm dado preenchido
              </p>
              <Progress pct={saude.pct_cobertos ?? 0} color={meta.accent} />
            </Card>

            <Card className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Dados recentes</p>
              <p className="text-2xl font-bold text-foreground mt-1">{saude.pct_dados_recentes ?? 0}%</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {saude.dados_recentes_30d ?? 0} de {saude.tipos_dado ?? 0} tipos com registro nos últimos 30 dias
              </p>
              <Progress pct={saude.pct_dados_recentes ?? 0} color={meta.accent} />
            </Card>

            <Card className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Indicadores no alvo</p>
              <p className="text-2xl font-bold text-foreground mt-1">{saude.pct_no_alvo ?? 0}%</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {saude.kpis_no_alvo ?? 0} de {saude.kpis_total ?? 0} acima da meta
              </p>
              <Progress pct={saude.pct_no_alvo ?? 0} color={meta.accent} />
            </Card>
          </div>

          <Card className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-2">Como o score é calculado</h3>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>· 50% · % de indicadores no alvo</li>
              <li>· 30% · % de KPIs com dado preenchido (cobertura)</li>
              <li>· 20% · % de tipos de dado com registro nos últimos 30 dias</li>
            </ul>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────── COMPONENTES ───────────────────────────

function NpsRegistrarButton({ area, accent, onSaved }) {
  const [open, setOpen] = useState(false);
  const [nota, setNota] = useState('');
  const [qtd, setQtd] = useState('');
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [obs, setObs] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const notaNum = Number(nota);
    if (!Number.isFinite(notaNum) || notaNum < 0 || notaNum > 10) {
      toast.error('Nota deve ser entre 0 e 10');
      return;
    }
    setSaving(true);
    try {
      await api.registrarNps(area, {
        nota: notaNum,
        mes,
        qtd_respostas: qtd ? Number(qtd) : null,
        observacao: obs.trim() || null,
      });
      toast.success(`NPS de ${mes} registrado · trigger recalculou o KPI`);
      setOpen(false);
      setNota(''); setQtd(''); setObs('');
      onSaved?.();
    } catch (e) {
      toast.error(e.message || 'Erro ao registrar NPS');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="text-xs font-semibold flex items-center gap-1 hover:underline"
          style={{ color: accent }}
        >
          <Plus className="h-3.5 w-3.5" /> Registrar nota
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar NPS · {area}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-xs text-muted-foreground">
            Nota média (0-10) das avaliações pos-culto do mes selecionado.
            Substitui registro existente · idempotente.
          </p>
          <div>
            <Label htmlFor="nps-mes">Mês de referência</Label>
            <Input id="nps-mes" type="month" value={mes} onChange={e => setMes(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="nps-nota">Nota média (0-10) *</Label>
              <Input
                id="nps-nota"
                type="number"
                min="0"
                max="10"
                step="0.1"
                value={nota}
                onChange={e => setNota(e.target.value)}
                placeholder="ex: 8.7"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="nps-qtd">Qtd avaliações</Label>
              <Input
                id="nps-qtd"
                type="number"
                min="0"
                value={qtd}
                onChange={e => setQtd(e.target.value)}
                placeholder="ex: 24"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="nps-obs">Observação (opcional)</Label>
            <Input
              id="nps-obs"
              value={obs}
              onChange={e => setObs(e.target.value)}
              placeholder="contexto da avaliação"
              maxLength={500}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !nota} style={{ background: accent }}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TotaisCultoCards({ totais, area, accent }) {
  const cards = [
    { label: 'Cultos no período', value: totais.total_cultos, full: true },
    { label: 'Frequência total', value: totais.presencial_adulto + totais.presencial_kids },
    { label: 'Decisões total', value: totais.decisoes_total },
  ];
  // Cards extras especificos por area
  if (area === 'online') {
    cards.push({ label: 'Pico online (soma)', value: totais.online_pico_total });
    cards.push({ label: 'Views D+7 (DDUS)', value: totais.online_ddus_total });
  } else if (area === 'kids') {
    cards.push({ label: 'Frequência Kids', value: totais.presencial_kids });
    cards.push({ label: 'Decisões Kids', value: totais.decisoes_kids });
  } else {
    cards.push({ label: 'Decisões presenciais', value: totais.decisoes_presenciais });
    cards.push({ label: 'Decisões online', value: totais.decisoes_online });
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {cards.map((c, i) => (
        <Card
          key={i}
          className={`p-4 ${c.full ? 'md:col-span-1' : ''}`}
          style={i === 0 ? { borderLeft: `3px solid ${accent}` } : undefined}
        >
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">{c.label}</p>
          <p className="text-2xl font-bold text-foreground mt-1">{formatNum(c.value)}</p>
        </Card>
      ))}
    </div>
  );
}

function CultosLista({ cultos, area, accent }) {
  return (
    <Card>
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Cultos do período</h3>
        <span className="text-xs text-muted-foreground">mais recentes primeiro</span>
      </div>
      <div className="divide-y divide-border">
        {cultos.map(c => (
          <CultoRow key={c.id} culto={c} area={area} accent={accent} />
        ))}
      </div>
    </Card>
  );
}

function CultoRow({ culto, area, accent }) {
  const items = [];
  if (area === 'online') {
    items.push({ label: 'Pico', v: culto.online_pico });
    items.push({ label: 'D+1', v: culto.online_ds });
    items.push({ label: 'D+7', v: culto.online_ddus });
    items.push({ label: 'Dec.', v: culto.decisoes_online });
  } else if (area === 'kids') {
    items.push({ label: 'Kids', v: culto.presencial_kids });
    items.push({ label: 'Dec. kids', v: culto.decisoes_kids });
  } else {
    items.push({ label: 'Presencial', v: culto.presencial_adulto });
    items.push({ label: 'Dec. pres.', v: culto.decisoes_presenciais });
    items.push({ label: 'Dec. onl.', v: culto.decisoes_online });
  }
  return (
    <div className="p-4 flex items-center gap-4 flex-wrap">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{culto.nome}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatDataCompleta(culto.data)}{culto.hora ? ` · ${culto.hora.slice(0, 5)}` : ''}
        </p>
        {culto.observacoes && (
          <p className="text-[11px] text-muted-foreground italic mt-1 line-clamp-2">{culto.observacoes}</p>
        )}
      </div>
      <div className="flex items-center gap-4">
        {items.map((it, i) => (
          <div key={i} className="text-right min-w-[60px]">
            <p className="text-lg font-bold" style={{ color: it.v > 0 ? accent : 'rgb(148, 163, 184)' }}>
              {it.v == null ? '—' : formatNum(it.v)}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{it.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, color = '', hint }) {
  return (
    <Card className="p-4">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color || 'text-foreground'}`}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </Card>
  );
}

function Progress({ pct, color }) {
  return (
    <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
      <div
        className="h-full transition-all"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }}
      />
    </div>
  );
}

function Sparkline({ historico, accent }) {
  const [hover, setHover] = useState(null);
  if (!historico || historico.length < 2) {
    return (
      <div className="w-[100px] h-[36px] shrink-0 rounded bg-muted/40 flex items-center justify-center">
        <span className="text-[9px] text-muted-foreground">sem histórico</span>
      </div>
    );
  }
  const valoresHist = historico.map(h => h.valor);
  const maxV = Math.max(...valoresHist, 1);
  const minV = Math.min(...valoresHist, 0);
  const range = maxV - minV || 1;
  const W = 100, H = 36;
  const pts = valoresHist.map((v, i) => {
    const x = (i / (valoresHist.length - 1)) * (W - 4) + 2;
    const y = (H - 4) - ((v - minV) / range) * (H - 8);
    return { x, y, v, data: historico[i].data };
  });
  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <svg width={W} height={H} className="shrink-0">
        <polyline
          fill="none"
          stroke={accent}
          strokeWidth="2"
          points={pts.map(p => `${p.x},${p.y}`).join(' ')}
        />
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="6"
            fill="transparent"
            onMouseEnter={() => setHover(p)}
            style={{ cursor: 'crosshair' }}
          />
        ))}
        {hover && (
          <circle cx={hover.x} cy={hover.y} r="3" fill={accent} stroke="#fff" strokeWidth="1.5" />
        )}
      </svg>
      {hover && (
        <div
          className="absolute z-10 px-2 py-1 rounded-md text-[10px] bg-popover border border-border shadow-md pointer-events-none whitespace-nowrap"
          style={{ left: Math.min(hover.x, W - 70), top: -28 }}
        >
          <strong>{formatNum(hover.v)}</strong> · {formatData(hover.data)}
        </div>
      )}
    </div>
  );
}

function DadoRow({ dado, accent }) {
  const vazio = dado.vazio || dado.total_registros === 0;

  const variacao = dado.variacao_mes_pct;
  const variacaoTexto = variacao == null
    ? null
    : `${variacao >= 0 ? '+' : ''}${Math.round(variacao)}% vs mês anterior`;
  const variacaoColor = variacao == null
    ? 'text-muted-foreground'
    : variacao >= 10 ? 'text-emerald-600 dark:text-emerald-400'
    : variacao <= -10 ? 'text-red-600 dark:text-red-400'
    : 'text-muted-foreground';

  const valoresJornada = dado.valores_jornada || [];

  return (
    <div className={`p-4 flex items-start gap-4 flex-wrap ${vazio ? 'opacity-75' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">{dado.tipo_nome}</p>
          {vazio && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-muted text-muted-foreground border border-border">
              aguardando dado
            </span>
          )}
        </div>
        {dado.descricao && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{dado.descricao}</p>
        )}
        <div className="flex items-center gap-2 mt-2 text-xs flex-wrap">
          <span className="text-muted-foreground">
            {dado.granularidade} · {dado.agregacao}
          </span>
          {dado.ultima_data && (
            <span className="text-muted-foreground">
              · último em {formatData(dado.ultima_data)}
            </span>
          )}
          {dado.total_registros > 0 && (
            <span className="text-muted-foreground">
              · {dado.total_registros} registros
            </span>
          )}
        </div>
        {valoresJornada.length > 0 && (
          <div className="flex items-center gap-1 mt-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Alimenta:</span>
            {valoresJornada.map(v => (
              <span
                key={v}
                className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{
                  background: (VALOR_CORES[v] || '#94a3b8') + '20',
                  color: VALOR_CORES[v] || '#475569',
                }}
              >
                {VALOR_LABELS[v]?.split(' ')[0] || v}
              </span>
            ))}
          </div>
        )}
      </div>

      <Sparkline historico={dado.historico_6} accent={accent} />

      <div className="text-right shrink-0 min-w-[100px]">
        {vazio ? (
          <p className="text-sm text-muted-foreground italic">sem dado</p>
        ) : (
          <>
            <p className="text-2xl font-bold text-foreground">{formatNum(dado.ultimo_valor)}</p>
            <p className="text-[10px] text-muted-foreground">{dado.unidade}</p>
            {variacaoTexto && (
              <p className={`text-[11px] mt-1 ${variacaoColor}`}>{variacaoTexto}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DadosPorValor({ dados, accent }) {
  const [filtro, setFiltro] = useState('todos');

  const contagem = useMemo(() => {
    const c = { todos: dados.length, sem_valor: 0 };
    for (const d of dados) {
      const vals = d.valores_jornada || [];
      if (vals.length === 0) c.sem_valor++;
      for (const v of vals) c[v] = (c[v] || 0) + 1;
    }
    return c;
  }, [dados]);

  const ordemValores = ['seguir', 'conectar', 'investir', 'servir', 'generosidade'];
  const valoresDisp = useMemo(
    () => ordemValores.filter(v => contagem[v] > 0),
    [contagem]
  );

  const dadosFiltrados = useMemo(() => {
    if (filtro === 'todos') return dados;
    if (filtro === 'sem-valor') return dados.filter(d => !d.valores_jornada || d.valores_jornada.length === 0);
    return dados.filter(d => (d.valores_jornada || []).includes(filtro));
  }, [filtro, dados]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <FilterPill active={filtro === 'todos'} onClick={() => setFiltro('todos')} accent={accent}>
          Todos ({contagem.todos})
        </FilterPill>
        {valoresDisp.map(v => (
          <FilterPill key={v} active={filtro === v} onClick={() => setFiltro(v)} accent={VALOR_CORES[v] || accent}>
            {VALOR_LABELS[v] || v} ({contagem[v]})
          </FilterPill>
        ))}
        {/* So mostra "Sem valor" quando ha tipos sem valor */}
        {contagem.sem_valor > 0 && (
          <FilterPill active={filtro === 'sem-valor'} onClick={() => setFiltro('sem-valor')} accent={accent}>
            Sem valor ({contagem.sem_valor})
          </FilterPill>
        )}
      </div>

      <Card className="divide-y divide-border">
        {dadosFiltrados.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Nenhum dado neste filtro.
          </div>
        ) : (
          dadosFiltrados.map(d => (
            <DadoRow key={d.tipo_id} dado={d} accent={accent} />
          ))
        )}
      </Card>
    </div>
  );
}

function IndicadoresPorValor({ kpis, porValor, semValor, navigate, accent }) {
  const [filtro, setFiltro] = useState('todos');

  const semValorFiltered = (semValor || []).filter(k => !/^CULTO-NPS-/i.test(k.id));

  const kpisFiltrados = useMemo(() => {
    if (filtro === 'todos') return kpis;
    if (filtro === 'sem-valor') return semValorFiltered;
    return (porValor?.[filtro] || []).filter(k => !/^CULTO-NPS-/i.test(k.id));
  }, [filtro, kpis, porValor, semValor, semValorFiltered]);

  const ordemValores = ['seguir', 'conectar', 'investir', 'servir', 'generosidade'];
  const valoresDisp = porValor
    ? ordemValores.filter(v => (porValor[v] || []).some(k => !/^CULTO-NPS-/i.test(k.id)))
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <FilterPill active={filtro === 'todos'} onClick={() => setFiltro('todos')} accent={accent}>
          Todos ({kpis.length})
        </FilterPill>
        {valoresDisp.map(v => {
          const count = (porValor[v] || []).filter(k => !/^CULTO-NPS-/i.test(k.id)).length;
          return (
            <FilterPill key={v} active={filtro === v} onClick={() => setFiltro(v)} accent={VALOR_CORES[v] || accent}>
              {VALOR_LABELS[v] || v} ({count})
            </FilterPill>
          );
        })}
        {/* So mostra "Sem valor" quando ha KPIs sem valor */}
        {semValorFiltered.length > 0 && (
          <FilterPill active={filtro === 'sem-valor'} onClick={() => setFiltro('sem-valor')} accent={accent}>
            Sem valor ({semValorFiltered.length})
          </FilterPill>
        )}
      </div>

      <Card className="divide-y divide-border">
        {kpisFiltrados.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Nenhum indicador neste filtro.
          </div>
        ) : (
          kpisFiltrados.map(k => (
            <KpiRow key={k.id} kpi={k} onClick={() => navigate(`/painel/kpi/${k.id}`)} />
          ))
        )}
      </Card>
    </div>
  );
}

function FilterPill({ active, onClick, accent, children }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
      style={
        active
          ? { background: accent, color: '#fff', borderColor: accent }
          : { background: 'transparent', color: 'inherit', borderColor: 'rgb(226, 232, 240)' }
      }
    >
      {children}
    </button>
  );
}

function KpiRow({ kpi, onClick }) {
  const sKey = statusKey(kpi.trajetoria);
  const sMeta = STATUS_META[sKey];
  const traj = kpi.trajetoria || {};
  const valor = traj.ultimo_valor;
  const meta = traj.checkpoint_meta;
  const pct = traj.percentual_meta;

  return (
    <div
      className="p-4 hover:bg-accent/30 transition-colors cursor-pointer flex items-start justify-between gap-3"
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-muted-foreground">{kpi.id}</span>
          {kpi.is_okr && <Badge variant="secondary" className="text-[10px]">OKR</Badge>}
          <Badge className={`text-[10px] ${sMeta.className}`}>{sMeta.label}</Badge>
          {kpi.periodicidade && (
            <span className="text-[10px] text-muted-foreground">{kpi.periodicidade}</span>
          )}
        </div>
        <p className="text-sm font-medium text-foreground mt-1">{kpi.indicador}</p>
        {kpi.descricao && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{kpi.descricao}</p>
        )}
        {kpi.lider?.nome && (
          <p className="text-[11px] text-muted-foreground mt-1">
            <span className="opacity-70">Líder:</span> {kpi.lider.nome}
          </p>
        )}
      </div>
      <div className="text-right shrink-0">
        {valor != null ? (
          <>
            <p className="text-lg font-bold">
              {formatNum(valor)}
              {kpi.unidade && kpi.unidade !== 'unidade' ? ` ${kpi.unidade}` : ''}
            </p>
            {meta != null && (
              <p className="text-[11px] text-muted-foreground">
                meta {formatNum(meta)}
                {pct != null && (
                  <span className={pct >= 100 ? 'text-emerald-600 ml-1' : pct >= 70 ? 'text-amber-600 ml-1' : 'text-red-600 ml-1'}>
                    ({Math.round(pct)}%)
                  </span>
                )}
              </p>
            )}
          </>
        ) : (
          <span className="text-xs text-muted-foreground italic">sem dado</span>
        )}
      </div>
    </div>
  );
}
