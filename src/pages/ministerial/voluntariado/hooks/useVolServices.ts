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
// quanto do que já passou.
//
// ⚠️⚠️ A ORDEM É POR DATA, COM O FUTURO NO FIM. Pedido do Matheus (23/09/2026):
// *"queria que fosse ordenado pela data. Pois a ariel ta fazendo o checkin
// retroativo dos voluntarios do online, eai ela precisa dessa organizacao"*.
//
// Antes era por PROXIMIDADE de hoje (`Math.abs(data - agora)`), o que produzia
// hoje → ontem → amanhã → anteontem: ótimo para achar o culto do momento e
// ilegível para trabalhar um mês inteiro em sequência.
//
// ⚠️ Mas data decrescente PURA quebraria o uso ao vivo: medido em 23/09, a
// janela tem **144 cultos — 29 futuros, 2 hoje e 113 passados**. Com os futuros
// no topo, o operador do totem rolaria 29 itens no domingo para achar o culto
// que está acontecendo. Por isso o futuro vai para o FIM: check-in é sempre de
// algo que já aconteceu, então hoje e o passado é que precisam estar à mão.
export function ordenarCultosCheckin<T extends { scheduled_at: string }>(
  cultos: T[],
  agora: Date = new Date(),
): T[] {
  // ⚠️ Corte por DIA e não por instante: um culto das 19h de hoje não pode
  // ser tratado como "futuro" às 14h e mudar de bloco no meio do domingo.
  const hoje = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const dia = (s: string) => {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  };
  const futuro = (s: string) => {
    const d = dia(s);
    // ⚠️ Data ilegível NÃO vira futuro: iria para o fim da lista e sumiria de
    // vista. Fica com o passado, onde alguém a vê e percebe o problema.
    return d !== '' && d > hoje;
  };
  return [...cultos].sort((a, b) => {
    const fa = futuro(a.scheduled_at);
    const fb = futuro(b.scheduled_at);
    if (fa !== fb) return fa ? 1 : -1;              // futuro sempre depois
    const ta = new Date(a.scheduled_at).getTime();
    const tb = new Date(b.scheduled_at).getTime();
    if (Number.isNaN(ta) || Number.isNaN(tb)) return 0;
    return fa ? ta - tb : tb - ta;                  // futuro: crescente · resto: do mais recente
  });
}
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
      return ordenarCultosCheckin(all);
    },
    staleTime: 60 * 1000,
  });
}
