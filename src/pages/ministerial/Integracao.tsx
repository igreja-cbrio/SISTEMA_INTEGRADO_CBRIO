import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { integracao as intApi } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';

const Batismos = lazy(() => import('./Batismos'));
const VisualizacaoFrequencia = lazy(() => import('./VisualizacaoFrequencia'));
const VisualizacaoDecisoes   = lazy(() => import('./VisualizacaoDecisoes'));
const HistoricoCultos        = lazy(() => import('./HistoricoCultos'));
const ColetaPendentes        = lazy(() => import('./coleta/ColetaPendentes'));
import CalendarioCultos from '../../components/CalendarioCultos';
import { StatisticsCard } from '../../components/ui/statistics-card';
import { Calendar, CheckCircle2, Heart, Smartphone, ClipboardCheck } from 'lucide-react';
import { Button } from '../../components/ui/button';

const C = { primary: '#00B39D', info: '#3b82f6', warn: '#f59e0b', purple: '#8b5cf6', pink: '#ef476f', gray: '#737373' };

// "2026-05-25" → "25/mai"
function formatDataCurta(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${String(d).padStart(2, '0')}/${meses[m - 1]}`;
}

export default function Integracao() {
  const navigate = useNavigate();
  const { getAccessLevel } = useAuth();
  const podeAprovar = getAccessLevel(['integracao']) >= 3;
  const [tab, setTab] = useState('frequencia');
  const [dashboard, setDashboard] = useState<any>(null);
  const [loadingDash, setLoadingDash] = useState(true);
  const [pendentesCount, setPendentesCount] = useState<number>(0);

  const reloadDashboard = useCallback(async () => {
    setLoadingDash(true);
    try { setDashboard(await intApi.dashboard()); } catch { /* noop */ } finally { setLoadingDash(false); }
  }, []);

  const reloadPendentes = useCallback(async () => {
    if (!podeAprovar) return;
    try {
      const items = await intApi.coleta.pendentes();
      setPendentesCount((items || []).length);
    } catch { /* noop */ }
  }, [podeAprovar]);

  useEffect(() => { reloadDashboard(); }, [reloadDashboard]);
  useEffect(() => { reloadPendentes(); }, [reloadPendentes]);

  // Permitir abrir aba via querystring (?tab=batismos)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tab');
    if (t && ['batismos', 'frequencia', 'vis_frequencia', 'vis_decisoes', 'historico', 'pendentes'].includes(t)) setTab(t);
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Integração</h1>
          <p className="text-sm text-muted-foreground">Acompanhamento de cultos, decisões e batismos</p>
        </div>
        <Button onClick={() => navigate('/integracao/coleta')} className="gap-2">
          <Smartphone className="h-4 w-4" /> Coleta mobile
        </Button>
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
        <TabsList className="flex-wrap h-auto" data-tour="integracao-tabs">
          <TabsTrigger value="frequencia">Cultos</TabsTrigger>
          <TabsTrigger value="vis_frequencia">Frequência</TabsTrigger>
          <TabsTrigger value="vis_decisoes">Decisões</TabsTrigger>
          <TabsTrigger value="batismos">Batismos</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          {podeAprovar && (
            <TabsTrigger value="pendentes" className="gap-1.5">
              <ClipboardCheck className="h-3.5 w-3.5" />
              Pendentes
              {pendentesCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-semibold rounded-full bg-amber-500 text-white">
                  {pendentesCount}
                </span>
              )}
            </TabsTrigger>
          )}
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
        <TabsContent value="historico" className="mt-4">
          <Suspense fallback={<div className="flex items-center justify-center py-12 text-sm text-muted-foreground">Carregando…</div>}>
            <HistoricoCultos />
          </Suspense>
        </TabsContent>
        {podeAprovar && (
          <TabsContent value="pendentes" className="mt-4">
            <Suspense fallback={<div className="flex items-center justify-center py-12 text-sm text-muted-foreground">Carregando…</div>}>
              <ColetaPendentes onChange={reloadPendentes} />
            </Suspense>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

