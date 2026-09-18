// Rota /visitantes · FORA DO MENU, de propósito.
//
// ⚠️⚠️ O "módulo de visitantes" foi DESFEITO em 11/09/2026 a pedido do Marcos
// ("não queria isso"): o item saiu do menu lateral e da busca ⌘K, e o visitante
// passou a viver em **Cuidados → Próximos passos**, etiquetado, com a nota da
// pesquisa na ficha.
//
// ⚠️ Esta rota CONTINUA existindo por um motivo operacional, não por sobra:
// quem fica no balcão da CAFETERIA precisa resgatar o voucher e NÃO pode ter o
// módulo `cuidados` (é lá que mora a fila pastoral). Então a cafeteria abre
// este endereço direto, com o módulo `visitantes` nível 2. A equipe de cuidado
// usa a aba dentro do Cuidados — mesmo componente, mesmos dados.
//
// Não recriar item de menu aqui sem falar com o Marcos.
import PainelVisitantes from '../components/visitantes/PainelVisitantes';

export default function VisitantesPage() {
  return <PainelVisitantes />;
}
