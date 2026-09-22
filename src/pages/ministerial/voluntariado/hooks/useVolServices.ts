import { useQuery } from '@tanstack/react-query';
import { voluntariado } from '@/api';
import type { VolService } from '../types';

export function useVolServices() {
  return useQuery<VolService[]>({
    queryKey: ['vol', 'services'],
    queryFn: () => voluntariado.services.list(),
  });
}

export function useUpcomingServices() {
  return useQuery<VolService[]>({
    queryKey: ['vol', 'services', 'upcoming'],
    queryFn: () => voluntariado.services.upcoming(),
  });
}

export function useTodaysServices() {
  return useQuery<VolService[]>({
    queryKey: ['vol', 'services', 'today'],
    queryFn: () => voluntariado.services.today(),
  });
}

// Serviços numa JANELA em torno de agora (passado recente + próximos) pro
// check-in poder ser feito fora da janela do culto — tanto do culto que vem
// quanto do que já passou. Ordenado por data (mais próximo de hoje no topo).
export function useCheckinServices() {
  return useQuery<VolService[]>({
    queryKey: ['vol', 'services', 'checkin-window'],
    queryFn: async () => {
      // Janela vem do backend (bounded · a rota capa em 120 dias), ordenada por
      // proximidade de hoje pra o culto mais relevante ficar no topo.
      //
      // ⚠️⚠️ ERAM 21 DIAS PARA TRÁS, E ERA O GARGALO REAL DO RETROATIVO. Pedido
      // do Matheus (22/09/2026): *"a ariel deve conseguir fazer o checkin
      // retroativo"* — os voluntários do Online servem mas não passam pelo
      // check-in do lanche, e o MÊS ANTERIOR precisa ser corrigido. Com 21 dias
      // o culto de agosto nem aparecia no seletor: não havia o que marcar.
      //
      // ⚠️ E a janela da API (`checked_in_at`) NÃO era o gargalo — o KPI ONL-17
      // conta por `vol_services.scheduled_at` (a data do CULTO) e casa o check-in
      // pelo `schedule_id`, não pela hora em que alguém clicou. Marcar hoje um
      // culto de agosto já credita agosto.
      const all = (await voluntariado.services.checkinWindow(75, 35)) as VolService[];
      const now = Date.now();
      return [...all].sort((a, b) => Math.abs(new Date(a.scheduled_at).getTime() - now) - Math.abs(new Date(b.scheduled_at).getTime() - now));
    },
    staleTime: 60 * 1000,
  });
}
