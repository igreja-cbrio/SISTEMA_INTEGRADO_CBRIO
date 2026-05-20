import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardSemanal as api } from '../api';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Button } from '../components/ui/button';
import { Loader2, Calendar, TrendingUp, Target, Sparkles } from 'lucide-react';
import DashSemanalAba from '../components/dashboard-semanal/DashSemanalAba';
import DashMensalAba from '../components/dashboard-semanal/DashMensalAba';
import DashMetasAba from '../components/dashboard-semanal/DashMetasAba';
import DashIaAba from '../components/dashboard-semanal/DashIaAba';

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

  return (
    <div className="space-y-4 p-1">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard Semanal</h1>
          <p className="text-sm text-muted-foreground">
            Painel da reunião de diretoria · dados consolidados por culto · histórico ano a ano · metas e indicadores customizados
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 max-w-[640px]">
          <TabsTrigger value="semanal"><Calendar className="h-4 w-4 mr-1.5" />Semanal</TabsTrigger>
          <TabsTrigger value="mensal"><TrendingUp className="h-4 w-4 mr-1.5" />Mensal</TabsTrigger>
          <TabsTrigger value="metas"><Target className="h-4 w-4 mr-1.5" />Metas</TabsTrigger>
          <TabsTrigger value="ia"><Sparkles className="h-4 w-4 mr-1.5" />Criar com IA</TabsTrigger>
        </TabsList>

        <TabsContent value="semanal" className="mt-4">
          <DashSemanalAba />
        </TabsContent>
        <TabsContent value="mensal" className="mt-4">
          <DashMensalAba />
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
