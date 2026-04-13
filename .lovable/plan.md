

## Plan: Redesign da TabFerias com Calendário Visual

### Objetivo
Substituir a aba de Férias/Licenças no módulo RH pelo novo layout baseado em calendário, mantendo a integração com a API existente (`rh.ferias.list`, `rh.ferias.create`, `rh.ferias.update`).

### O que muda

**1. Reescrever `FeriasTab` em `RH.jsx` (linhas 1189-1312)**
- Substituir a tabela simples por um calendário mensal interativo com visualização de férias por dia
- Adicionar cards de estatísticas (Pendentes, Aprovadas, Total de dias)
- Painel lateral direito mostrando detalhes do dia selecionado e lista de todas as solicitações
- Navegação entre meses (anterior/próximo/hoje)
- Cada dia do calendário mostra badges coloridos com os nomes dos colaboradores em férias
- Cores por tipo: Férias (azul), Licença Médica (vermelho), Pessoal (roxo), Outro (cinza)

**2. Reescrever `FeriasFormModal` em `RH.jsx` (linhas 1642-1667)**
- Usar Dialog do shadcn/ui no lugar do Modal customizado
- Manter os mesmos campos (Colaborador, Tipo, Datas, Observações)

**3. Adicionar Dialog de detalhes da solicitação**
- Modal para ver detalhes completos de uma solicitação selecionada
- Botões de Aprovar/Rejeitar dentro do dialog quando status é "pendente"

**4. Remover `TabFerias.jsx` standalone**
- O arquivo `src/pages/admin/rh/TabFerias.jsx` não é importado no RH.jsx (a lógica está inline como `FeriasTab`), mas pode ser removido para evitar confusão

### Detalhes técnicos
- Usar `date-fns` (já instalado) com locale `ptBR` para formatação e navegação do calendário
- Usar componentes shadcn existentes: Card, Badge, Button, Dialog, Separator
- Usar lucide-react icons: ChevronLeft, ChevronRight, CalendarIcon, etc.
- Manter chamadas à API via `rh.ferias.list()`, `rh.ferias.create()` e callback `onAprovar`
- Adaptar estilos ao tema dark do projeto (usando classes Tailwind com variáveis CSS existentes)
- Layout: grid com calendário à esquerda (~60%) e painel lateral à direita (~40%)

### Arquivos modificados
- `src/pages/admin/rh/RH.jsx` — reescrever `FeriasTab` e `FeriasFormModal`
- `src/pages/admin/rh/TabFerias.jsx` — remover (código duplicado não utilizado)

