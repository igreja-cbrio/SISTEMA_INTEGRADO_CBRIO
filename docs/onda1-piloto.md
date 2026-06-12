# Plano de liberação em ondas · CBRio

> **Bússola do piloto.** Criado em 2026-06-09. O sistema está maduro no código
> (~32 de 43 módulos ligados de ponta a ponta). O que faltava não era feature —
> era **soltar pra gente real usar e escutar o que quebra**. Este doc define a
> ordem de liberação e os critérios, pra parar o loop de "achar bug → consertar →
> achar outro" e medir por **uso real**.

## A regra: duas barras, não uma

| | **Pronto pra TESTAR** (piloto) | **Pronto pra ABRIR pra igreja** (produção) |
|---|---|---|
| Barra | caminho principal funciona · 1 dono usa · dá pra capturar erro | + bloqueadores de segurança fechados · dado real · PII protegida |
| Quem usa | 1 dono por módulo (interno) | qualquer pessoa |
| Saída | — | dono usou ~1 semana sem bug crítico novo + usa sem suporte + blockers do módulo fechados |

A maioria dos módulos **já passa na barra de testar**. Os bloqueadores abaixo são
gate de *abrir pra igreja*, **não** do piloto interno.

## Loop de feedback (Onda 0 · ✅ no ar · 2026-06-09)

- [x] Botão **"Reportar"** em todo o app → `app_feedback`
- [x] Sink de **erros 500** do backend → `app_erros_servidor`
- [x] Tela **`/admin/feedback`** (feedback · erros · relatório do agente)
- [x] Agente **`piloto_triage_watcher`** (Haiku · 1x/dia 07h) → resume + **pinga no sino**
- [ ] **Operacional:** confirmar redeploy do worker no **Railway** (senão o agente não roda)
- [ ] **Operacional:** setar **Sentry DSN** no Vercel (`VITE_SENTRY_DSN` / `SENTRY_DSN`) — captura extra de graça
- [ ] **Operacional:** mirar destinatários em `/admin` → Notificações → módulo **"Piloto"** (default: admin/diretor)

---

## Onda 1 · piloto interno (sugerido: 2 semanas)

**Objetivo:** provar que cada módulo funciona na mão de quem vai usar — sem o Marcos do lado.

### Leva A — começar já (foco · os 5 mais maduros, dono ativo)

| Módulo | Dono testador | Fluxo do piloto | Status |
|---|---|---|---|
| Integração | Alda Lorena | Lançar cultos da semana (frequência · decisões · batismos) | [ ] |
| Cuidados | Marcelo Soares | Registrar encontro pastoral + encaminhar 1 convertido | [ ] |
| Marketing | Pedro Paiva + equipe | Triagem → Kanban → entregar 1 campanha real | [ ] |
| Solicitações | transversal (Amaury + Yago respondem) | Abrir 1 de cada tipo → diretor aprova → área atende → avaliar | [ ] |
| Grupos | Pr. Nélio + Natasha (acesso total) | Registrar encontro + presença + marcar líder em treino | [ ] |

### Leva B — semana 2 (ou Onda 1.5)

| Módulo | Dono | Por que segurar | Status |
|---|---|---|---|
| RH | Ju (RH) | Funciona, mas dado sensível → grupo pequeno | [ ] |
| Financeiro | Yago Torres | Sensível; inclui a fila do agente executor | [ ] |
| Painel/NSM + Dashboard Semanal | Marcos · Matheus · Juninho | Read-only → seguro de abrir pra diretoria | [ ] |
| Eventos / Projetos | PMO | Ciclo criativo de 1 evento real ponta a ponta | [ ] |
| Membresia | Matheus + Marcelo Soares | Cadastro + jornada + merge de duplicados · Marcelo confere dados (líder de jornada) | [ ] |

### Acessos a configurar (antes de soltar)
- **Grupos · Pr. Nélio + Natasha → acesso total (nível 5).** Em `/admin/permissoes` → aba Usuários → cada um → atribuir a **área "Grupos"** (o boost por área dá admin do módulo automático). Se ainda não têm login, criar a conta antes. Depois: logout/login pra renovar o acesso.
- **Membresia · Matheus + Marcelo Soares.** Matheus (admin) já vê tudo; Marcelo (supervisor-jornada) já tem membresia nível 3 → confere dados de pessoas. Provável que nada precise mudar — confirmar em prod.

### Cadência
- **Dia 0:** dar o link + 1 frase a cada dono — *"Usa normal. Quando travar ou confundir, clica em Reportar."*
- **Diário (07h):** o agente manda o digest; você conserta o que importa.
- **2×/semana · 30 min:** revisar o digest com os donos.
- **Critério de saída** (piloto → fila de abrir pra igreja): dono usou ~1 semana sem bug crítico novo + usa sem te chamar + blockers do módulo fechados.

### Menor passo pra amanhã
Escolher **2-3 donos** (Alda · Marcelo · Pedro Paiva) e olhar o **primeiro digest**. Não precisa soltar os 5 de uma vez.

---

## Onda 2 · destravar pequeno ("ligar o que já existe")

| Item | O que falta (não é código novo) | Status |
|---|---|---|
| Totem Kids | Comprar 6 Fire TV Sticks + configurar Brother no Windows do totem | [ ] |
| Pagers (LRS) | Confirmar com a LRS a porta TCP/NetPage + setar `PAGER_BRIDGE_TOKEN` | [ ] |
| WhatsApp Flows | Setar `WHATSAPP_FLOW_CULTO_ID`/`PESSOA_ID` (+ app Meta Live) no Vercel | [ ] |
| Online (YouTube) | Confirmar OAuth conectado + envs Google no Vercel | [ ] |
| Produção de Culto | Atribuir a área "Produção" ao Pedro Fernandes + cache bust | [ ] |

---

## Onda 3 · dado nascente (soltar quando a fonte existir)

| Item | O que falta | Status |
|---|---|---|
| Voluntariado | Dado/escala real começar a popular | [ ] |
| NPS | Rodar 1ª pesquisa (o coletor já espera o dado) | [ ] |
| Devocionais | Frente do Matheus (em andamento) | [ ] |
| Monitoramento OKR | Coletores das fontes operacionais ainda nascentes | [ ] |

---

## Gate pra ABRIR pra igreja (não trava o piloto)

> Da auditoria 2026-06-08. São o que separa "piloto interno" de "qualquer um usa".

- [ ] **RLS `mem_cadastros_pendentes`** (form público com insert anônimo de PII) → mover form pro backend `/api/public/*` + migration de lockdown. ⚠️ mexe em RLS/auth → decisão do Marcos antes.
- [ ] **Soft-deletes agregados em KPI** (`cultos`, `kpi_indicadores_taticos`, `cultos_decisoes_pessoas`, `mem_grupo_encontros`, `mem_devocionais`, `mem_familias`) → varredura de filtro `deleted_at IS NULL` em todos os read-sites + funções SQL. ⚠️ tarefa deliberada, não swap mecânico.
- [ ] **Pool-pg → REST** em `projects.js` (`/views`, `/workload`) e `patrimonio.js` (fallback) → mesmo padrão do PR #920 (agents/meetings). Baixo risco; pode precisar de RPC se o SQL for complexo.
- [ ] **`_kpi_agregar_dado` ignora área** no baseline de `batismos`/`novos_convertidos_atend` (médio · investigar).
- [ ] **Baixos:** `MEM_QR_SALT` fallback literal; cron de `voluntariado-sync` não timing-safe.

---

## Estado dos módulos (resumo do inventário · 2026-06-09)

- **~32 de 43 completos** (página + backend + menu + permissão).
- **Descontinuados/redirects:** `/processos` → `/eventos`; `/admin/usuarios` → `/admin/permissoes`; rotas KPI legadas → `/painel`.
- **Backend-only (sem UI própria):** Cérebro (SharePoint↔Obsidian).

> Atualizar este doc conforme as ondas avançam. Marcar `[x]` quando um módulo
> sair do piloto pra "aberto", e mover os bloqueadores pra cá quando fechados.
