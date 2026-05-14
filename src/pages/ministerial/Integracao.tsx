import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { integracao as intApi } from '../../api';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';

const Batismos = lazy(() => import('./Batismos'));
const VisualizacaoFrequencia = lazy(() => import('./VisualizacaoFrequencia'));
const VisualizacaoDecisoes   = lazy(() => import('./VisualizacaoDecisoes'));
import CalendarioCultos from '../../components/CalendarioCultos';
import { StatisticsCard } from '../../components/ui/statistics-card';
import { Calendar, CheckCircle2, Heart } from 'lucide-react';

const C = { primary: '#00B39D', info: '#3b82f6', warn: '#f59e0b', purple: '#8b5cf6', pink: '#ef476f', gray: '#737373' };

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
    if (t && ['batismos', 'frequencia', 'vis_frequencia', 'vis_decisoes'].includes(t)) setTab(t);
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
            title="Cultos · registrar"
            value="Abrir"
            icon={Calendar}
            iconColor={C.purple}
          />
        </button>
        <button onClick={() => setTab('frequencia')} className="text-left hover:scale-[1.02] transition-transform">
          <StatisticsCard
            title="Decisões · registrar"
            value={loadingDash ? '…' : String(dashboard?.total_decisoes ?? 0)}
            icon={Heart}
            iconColor={C.pink}
          />
        </button>
        <button onClick={() => setTab('batismos')} className="text-left hover:scale-[1.02] transition-transform">
          <StatisticsCard
            title="Batismos · registrar"
            value={loadingDash ? '…' : String(dashboard?.total_batismos ?? '—')}
            icon={CheckCircle2}
            iconColor={C.primary}
          />
        </button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="frequencia">Cultos</TabsTrigger>
          <TabsTrigger value="vis_frequencia">Frequência</TabsTrigger>
          <TabsTrigger value="vis_decisoes">Decisões</TabsTrigger>
          <TabsTrigger value="batismos">Batismos</TabsTrigger>
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
      </Tabs>
    </div>
  );
}

