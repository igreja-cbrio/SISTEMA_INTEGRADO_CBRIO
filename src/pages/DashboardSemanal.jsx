import { useState, useEffect, useRef } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Button } from '../components/ui/button';
import { Calendar, TrendingUp, Target, Sparkles, Maximize2, Minimize2, Banknote } from 'lucide-react';
import DashSemanalAba from '../components/dashboard-semanal/DashSemanalAba';
import DashMensalAba from '../components/dashboard-semanal/DashMensalAba';
import DashMetasAba from '../components/dashboard-semanal/DashMetasAba';
import DashIaAba from '../components/dashboard-semanal/DashIaAba';
import DashboardFinanceiroSemanal from './admin/financeiro/DashboardFinanceiroSemanal';

export const INDICADORES = [
  { key: 'frequencia',        label: 'Frequência',        usa_ocupacao: true },
  { key: 'frequencia_kids',   label: 'Frequência Kids',   usa_ocupacao: false },
  { key: 'aceitacoes',        label: 'Aceitações',        usa_ocupacao: false },
  { key: 'aceitacoes_online', label: 'Aceitações Online', usa_ocupacao: false },
  { key: 'ao_vivo',           label: 'Ao vivo',           usa_ocupacao: false },
  { key: 'online_ds',         label: 'Online DS',         usa_ocupacao: false },
  { key: 'online_ddus',       label: 'Online DDUS',       usa_ocupacao: false },
  { key: 'voluntariado',      label: 'Voluntariado',      usa_ocupacao: false },
];

export default function DashboardSemanal() {
  const [tab, setTab] = useState('semanal');
  const wrapperRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (wrapperRef.current?.requestFullscreen) {
        await wrapperRef.current.requestFullscreen();
      }
    } catch (e) {
      console.warn('Fullscreen falhou:', e.message);
    }
  };

  // ESC sai do fullscreen nativamente · mas também adicionamos atalho F11-like
  // (F = fullscreen toggle) quando dentro do dashboard
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'f' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={wrapperRef}
      className={`space-y-4 ${isFullscreen ? 'p-8 bg-background overflow-auto h-screen' : 'p-1'}`}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className={`font-bold tracking-tight ${isFullscreen ? 'text-3xl' : 'text-2xl'}`}>
            Dashboard Semanal
          </h1>
          <p className="text-sm text-muted-foreground">
            Painel da reunião de diretoria · dados consolidados por culto · histórico ano a ano · metas e indicadores customizados
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={toggleFullscreen}
          className="gap-1.5 shrink-0"
          title={isFullscreen ? 'Sair de tela cheia (ESC)' : 'Tela cheia (Cmd+Shift+F)'}
        >
          {isFullscreen ? (
            <><Minimize2 className="h-4 w-4" />Sair de tela cheia</>
          ) : (
            <><Maximize2 className="h-4 w-4" />Tela cheia</>
          )}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 max-w-[800px]">
          <TabsTrigger value="semanal"><Calendar className="h-4 w-4 mr-1.5" />Semanal</TabsTrigger>
          <TabsTrigger value="mensal"><TrendingUp className="h-4 w-4 mr-1.5" />Mensal</TabsTrigger>
          <TabsTrigger value="financeiro"><Banknote className="h-4 w-4 mr-1.5" />Financeiro</TabsTrigger>
          <TabsTrigger value="metas"><Target className="h-4 w-4 mr-1.5" />Metas</TabsTrigger>
          <TabsTrigger value="ia"><Sparkles className="h-4 w-4 mr-1.5" />Criar com IA</TabsTrigger>
        </TabsList>

        <TabsContent value="semanal" className="mt-4">
          <DashSemanalAba />
        </TabsContent>
        <TabsContent value="mensal" className="mt-4">
          <DashMensalAba />
        </TabsContent>
        <TabsContent value="financeiro" className="mt-4">
          <DashboardFinanceiroSemanal />
        </TabsContent>
        <TabsContent value="metas" className="mt-4">
          <DashMetasAba />
        </TabsContent>
        <TabsContent value="ia" className="mt-4">
          <DashIaAba />
        </TabsContent>
      </Tabs>
    </div>
  );
}
