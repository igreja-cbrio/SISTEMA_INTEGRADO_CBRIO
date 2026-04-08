

## Plano: Completar Frontend + Conectar GitHub

### Situação Atual
- **Copiado**: Dashboard, Login, Perfil, AppShell, UI components, contexts, api.js
- **Faltando**: ~25 arquivos de páginas (módulos Admin, Eventos, Projetos, etc.)
- **Backend**: Permanece no Vercel -- o Lovable só gerencia o frontend

### O que NÃO é possível
O Lovable **não pode rodar o backend Express**. O backend continuará no Vercel e o frontend fará chamadas HTTP via `api.js` (já configurado com `VITE_API_URL`).

### Arquivos restantes a copiar (por tamanho)

**Arquivos grandes (>40KB cada -- precisam de múltiplas mensagens):**
- `Eventos.jsx` (147KB) + 5 componentes (BudgetPanel, CycleView, EventFormModal, MeetingFormModal, TaskFormModal)
- `Projetos.jsx` (139KB)
- `RH.jsx` (138KB) + 6 tabs (TabAdmissao, TabAvaliacoes, TabExtras, TabFerias, TabFolha, TabTreinamentos) + ModalFuncionario
- `Logistica.jsx` (93KB)
- `Expansao.jsx` (90KB)
- `Planejamento.jsx` (84KB)
- `Patrimonio.jsx` (70KB)
- `Financeiro.jsx` (46KB)

**Arquivos médios/pequenos:**
- `EventDetail.jsx` (19KB)
- `Membresia.jsx` (20KB)
- `AssistenteIA.jsx` (20KB)
- `CompletionSection.jsx` (20KB)
- `AttachmentButton.jsx` (9KB)
- `SolicitarCompra.jsx` (7KB)
- `NotificacaoRegras.jsx` (5KB)

### Execução (estimativa: 4-6 mensagens)

**Msg 1**: Páginas pequenas/médias -- SolicitarCompra, NotificacaoRegras, Membresia, AssistenteIA, AttachmentButton, CompletionSection, EventDetail
**Msg 2**: Financeiro + Patrimonio + Expansao
**Msg 3**: RH completo (RH.jsx + 7 sub-componentes)
**Msg 4**: Logistica + Planejamento
**Msg 5**: Eventos completo (Eventos.jsx + 5 componentes)
**Msg 6**: Projetos + App.tsx (rotas finais) + testes

### GitHub

Após completar a cópia:
1. Vá em **Project Settings > GitHub > Connect project**
2. Autorize o Lovable no GitHub
3. Crie um novo repositório (ex: `crmcbrio-frontend`)
4. O Lovable sincroniza automaticamente todas as mudanças

**Sobre o repo existente** (`igreja-cbrio/crmcbrio`): O Lovable não consegue importar repos existentes diretamente. As opções são:
- Criar um **novo repo** só para o frontend via Lovable (recomendado)
- Ou após conectar, clonar localmente e fazer force push do código do Lovable para o repo existente (manual)

### Limitações importantes
- Arquivos muito grandes (>100KB) podem precisar ser simplificados ou divididos
- Adaptações de Tailwind v4 para v3 serão feitas em cada arquivo durante a cópia
- O backend (Express/Vercel) precisa ser editado separadamente (VS Code, GitHub, etc.)

