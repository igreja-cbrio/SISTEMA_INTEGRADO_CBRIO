import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { integracao as intApi } from '../../api';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';

const Batismos = lazy(() => import('./Batismos'));
const VisualizacaoFrequencia = lazy(() => import('./VisualizacaoFrequencia'));
const VisualizacaoDecisoes   = lazy(() => import('./VisualizacaoDecisoes'));
const HistoricoCultos        = lazy(() => import('./HistoricoCultos'));
const DecisoesPessoas        = lazy(() => import('./DecisoesPessoas'));
import CalendarioCultos from '../../components/CalendarioCultos';
import { StatisticsCard } from '../../components/ui/statistics-card';
import { Calendar, CheckCircle2, Heart } from 'lucide-react';

const C = { primary: '#00B39D', info: '#3b82f6', warn: '#f59e0b', purple: '#8b5cf6', pink: '#ef476f', gray: '#737373' };

// "2026-05-25" → "25/mai"
function formatDataCurta(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${String(d).padStart(2, '0')}/${meses[m - 1]}`;
}

export default function Integracao() {
  const [tab, setTab] = useState('frequencia');
  const [dashboard, setDashboard] = useState<any>(null);
  const [loadingDash, setLoadingDash] = useState(true);

  const reloadDashboard = useCallback(async () => {
    setLoadingDash(true);
    try { setDashboard(await intApi.dashboard()); } catch { /* noop */ } finally { setLoadingDash(false); }
  }, []);

  useEffect(() => { reloadDashboard(); }, [reloadDashboard]);

  // Permitir abrir aba via querystring (?tab=batismos)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tab');
    if (t && ['batismos', 'frequencia', 'pessoas', 'vis_frequencia', 'vis_decisoes', 'historico'].includes(t)) setTab(t);
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Integração</h1>
          <p className="text-sm text-muted-foreground">Acompanhamento de cultos, decisões e batismos</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button onClick={() => setTab('frequencia')} className="text-left hover:scale-[1.02] transition-transform">
          <StatisticsCard
            title={dashboard?.cultos_pendentes > 0 ? 'Cultos pendentes' : 'Cultos · em dia'}
            value={loadingDash ? '…' : String(dashboard?.cultos_pendentes ?? 0)}
            icon={Calendar}
            iconColor={dashboard?.cultos_pendentes > 0 ? C.warn : C.primary}
          />
        </button>
        <button onClick={() => setTab('vis_decisoes')} className="text-left hover:scale-[1.02] transition-transform">
          <StatisticsCard
            title="Decisões neste mês"
            value={loadingDash ? '…' : String(dashboard?.decisoes_mes ?? 0)}
            icon={Heart}
            iconColor={C.pink}
          />
        </button>
        <button onClick={() => setTab('batismos')} className="text-left hover:scale-[1.02] transition-transform">
          <StatisticsCard
            title={dashboard?.proximo_batismo ? `Próximo batismo · ${formatDataCurta(dashboard.proximo_batismo)}` : 'Batismos aguardando'}
            value={loadingDash ? '…' : String(dashboard?.batismos_aguardando ?? 0)}
            icon={CheckCircle2}
            iconColor={C.primary}
          />
        </button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="frequencia">Cultos</TabsTrigger>
          <TabsTrigger value="pessoas">Pessoas decididas</TabsTrigger>
          <TabsTrigger value="vis_frequencia">Frequência</TabsTrigger>
          <TabsTrigger value="vis_decisoes">Decisões</TabsTrigger>
          <TabsTrigger value="batismos">Batismos</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="frequencia" className="mt-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Clique num culto pra preencher os dados daquele culto: presencial (adultos/kids),
              decisões e transmissão online. Cada culto é vinculado ao seu tipo (Domingo 08:30 /
              10:00 / 11:30 / 19:00 · AMI · Bridge · Quarta com Deus) · relatórios saem por culto
              automaticamente.
            </p>
            <CalendarioCultos />
          </div>
        </TabsContent>
        <TabsContent value="pessoas" className="mt-4">
          <Suspense fallback={<div className="flex items-center justify-center py-12 text-sm text-muted-foreground">Carregando…</div>}>
            <DecisoesPessoas />
          </Suspense>
        </TabsContent>
        <TabsContent value="vis_frequencia" className="mt-4">
          <Suspense fallback={<div className="flex items-center justify-center py-12 text-sm text-muted-foreground">Carregando…</div>}>
            <VisualizacaoFrequencia />
          </Suspense>
        </TabsContent>
        <TabsContent value="vis_decisoes" className="mt-4">
          <Suspense fallback={<div className="flex items-center justify-center py-12 text-sm text-muted-foreground">Carregando…</div>}>
            <VisualizacaoDecisoes />
          </Suspense>
        </TabsContent>
        <TabsContent value="batismos" className="mt-4">
          <Suspense fallback={<div className="flex items-center justify-center py-12 text-sm text-muted-foreground">Carregando…</div>}>
            <Batismos />
          </Suspense>
        </TabsContent>
        <TabsContent value="historico" className="mt-4">
          <Suspense fallback={<div className="flex items-center justify-center py-12 text-sm text-muted-foreground">Carregando…</div>}>
            <HistoricoCultos />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

