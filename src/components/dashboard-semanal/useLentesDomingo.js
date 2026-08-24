// Query ÚNICA das lentes de domingo (GET /dashboard-semanal/lentes-domingo).
//
// ⚠️⚠️ A ABA "Domingo" e o CARD dentro dela precisam da MESMA resposta, por
// motivos diferentes: a aba para saber se deve existir (o backend responde
// `{visivel:false}` e mais nada pra quem está atrás do véu — e aba que abre
// vazia é pior que aba ausente) e o card para desenhar. O React Query dedupe
// pela `queryKey`, então os dois chamadores custam UMA requisição.
//
// ⚠️ NÃO duplicar esta query nos dois lugares: no primeiro erro de rede uma
// resolveria e a outra não, e a aba apareceria sem conteúdo dentro.
import { useQuery } from '@tanstack/react-query';
import { dashboardSemanal as api } from '../../api';

export default function useLentesDomingo() {
  return useQuery({
    queryKey: ['dash-sem', 'lentes-domingo'],
    queryFn: () => api.lentesDomingo({ semanas: 16 }),
    staleTime: 60_000,
    retry: 1,
  });
}
