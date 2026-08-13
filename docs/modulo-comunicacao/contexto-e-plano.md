# Módulo de Comunicação (WhatsApp central) — Contexto completo & Plano

**Para:** Matheus (dono do projeto) · **De:** Marcos + análise assistida (Claude) · **Data:** 2026-07-28
**Origem:** Bloco C da revisão estrutural (12 observações do Marcos, 27/07 — apresentação em `revisao-estrutural-cbrio.html` no Downloads do Marcos). Inventário levantado por varredura completa do código em `origin/main`.

## 0. A decisão do Marcos (o pedido, nas palavras dele)

> "Menu de conversas, Bot WhatsApp, Conversas — 3 endpoints, 3 módulos não claros e não integrados. Criamos muitos módulos que utilizam o WhatsApp e precisamos criar um **módulo central** que junte tudo; os módulos que têm disparo terão **visualizações espelhadas** desse módulo central, que deve ter: **gerência de números de envio, templates padrão de mensagem, recorrência, mensagens automáticas e programadas, chat ao vivo de conversa e relatórios de todas as mensagens e áreas**."
>
> Complemento (28/07): o módulo também gerencia **erros**, um **dashboard com custo, total de envios e respostas**, e é onde se gerenciam os **atendentes** e as **opções de mensagens** (mensagens prontas).

---

## 1. Estado atual — o inventário completo (verificado no código)

### 1.1 As três superfícies que confundem (e o que cada uma é)

| Superfície | Rota | O que é de verdade |
|---|---|---|
| **Conversas** | `/conversas` (`src/pages/Conversas.tsx` + `src/components/waInbox/ConversasInbox.tsx`) | O **chat ao vivo** — inbox WhatsApp com 3 abas (Conversas / Painel por área / Mensagens prontas), Supabase Realtime + polling, som, atribuição de atendente, transferência, perfil da pessoa (grupo/batismo/serve/NEXT), notas, anexos, protocolo, pesquisa de satisfação 0–5. Backend `waInbox.js` (`/api/wa-inbox/*`). **É maduro — NÃO reescrever.** |
| **Menu das Conversas** | `/admin/conversas-setores` (`ConversasSetores.jsx`) | Edita o **menu do bot de triagem** (rótulo → área, ordem, ativo) sem deploy. Tabela `conversas_setores`. |
| **Bot WhatsApp** | `/admin/whatsapp` (`Whatsapp.jsx`) | 4 abas: Coletas (relatos de culto dos líderes) / Líderes vinculados / Avisos (broadcast) / Configuração (IA on-off, institucional). Tabelas `whatsapp_coletas`, `whatsapp_lideres`, `whatsapp_config`. |

E a quarta escondida: **`/grupos` → aba Envios** (`GruposEnvios.jsx` + `services/gruposEnvios.js`) — o console de disparo do módulo Grupos. **É o protótipo mais maduro do que o módulo central deve ser** (§3.3), mas está preso ao filtro `contexto LIKE 'grupos.%'`.

### 1.2 O webhook (entrada) — `backend/routes/publicWhatsapp.js`

HMAC fail-closed em produção (`WHATSAPP_APP_SECRET`), cap de 20 msgs/evento, toggle `whatsapp_config.ia_ativa`. É um **roteador de intenções feito à mão**, nesta ordem de precedência:

1. Opt-out/opt-in (`whatsappOptout.js`) — prioridade máxima
2. Aprovação de solicitação por botão/1-2 (`solicitacaoWpp.js`) — diretor/pastor
3. **Nota fiscal por foto** → compra pendente (`whatsappNota.js`, OCR Sonnet)
4. Pesquisa de satisfação 0–5 (inline)
5. Inbox humano assumido (`waInbox.registrarInbound`)
6. **Bot de triagem** (menu de setores → área) — número desconhecido
7. FAQ institucional (palavra-chave → Haiku)
8. Relato de encontro de grupo (líder coordenador)
9. **Flow do culto** (formulário 3 telas) — coordenador escopo integração
10. Coleta conversacional multi-turno (Haiku)

⚠️ **Achado crítico:** o webhook itera só `value.messages` e **IGNORA `value.statuses`** — os retornos `sent/delivered/read/failed` da Meta **nunca chegam ao banco**. Hoje `whatsapp_envios.status='enviado'` significa "a Graph API aceitou o POST", **não** que foi entregue. **Qualquer relatório/dashboard depende de consertar isso primeiro (C0).**

### 1.3 A saída (envio) — 4 caminhos paralelos

```
CAMINHO A · FILA (só templates) — o único com retry/registro
  grupos.js, kpis.js, membresia.js, gruposEnvios.js, publicGrupos.js
    → whatsappFila.enfileirar()/enfileirarLote()
    → INSERT whatsapp_envios (pendente) → tentativa imediata
    → falha transitória: backoff 30m/2h/6h/12h/24h (máx 5)
    → falha PERMANENTE (códigos Meta, ex. invalid_phone): status=erro na 1ª
    → falha terminal → notificar() o módulo do contexto
  WORKER: cron horário /api/public/grupos/cron/whatsapp-fila (limite 200)

CAMINHO B · DIRETO via whatsappService.js (Graph v18!) — sem retry, sem registro
  waInbox (responder/nova/anexo) · nextConvite · membresia · totemKids ·
  solicitacoes · logistica · voluntariado · agenteVoluntariado · app.js ·
  devocionalSender · solicitacaoWpp (10 call sites)

CAMINHO C · DIRETO via whatsappSend.js (Graph v21) — sem retry, sem registro
  publicWhatsapp (respostas do bot) · whatsappTriagem · whatsappNota ·
  alertaCulto · whatsapp.js:372 (broadcast — resultado NEM é persistido)

CAMINHO D · TABLE-DRIVEN via whatsappAuto.js — o design certo, subutilizado
  whatsapp_auto_config (texto editável sem deploy) + log whatsapp_auto_envios
  Usado por só ~3 gatilhos de ~20 possíveis
```

**Duplicações a matar:** `whatsappSend.js` e `whatsappService.js` são duas camadas HTTP cruas fazendo a mesma coisa em **versões diferentes da Graph API (v21 × v18)**, com dois nomes de token (`WHATSAPP_ACCESS_TOKEN` vivo, `WHATSAPP_TOKEN` legado).

### 1.4 Número(s)

**Um número para tudo** — `WHATSAPP_PHONE_NUMBER_ID` + token lidos de env em **3 arquivos** (`whatsappSend.js`, `whatsappService.js`, `whatsappFlows.js`). Não existe "número" como entidade: sem tabela, sem escolha de remetente por área. (Número institucional: +55 21 99967-9031; WABA `2177907859655557`; `WHATSAPP_BUSINESS_ACCOUNT_ID` existe em env mas **nunca é usado** para consultar a Meta.)

### 1.5 Templates

- ~**24 variáveis de ambiente** `WHATSAPP_TEMPLATE_*` + constantes hardcoded (`whatsappService.js` TEMPLATES_APP, `gruposWhatsapp.js`, `solicitacaoWpp.js`, `waInbox.js`) → **mudar texto = deploy na Vercel**.
- `whatsapp_auto_config` (tabela, 2 chaves) e `wa_mensagens_prontas` (respostas rápidas do chat) são editáveis — o resto não.
- **Catálogo de templates da Meta nunca é sincronizado** (a API `/{WABA}/message_templates` nunca é chamada).

### 1.6 Agendamento/recorrência

Tudo é **cron fixo em `vercel.json`** (mudar = deploy): fila (horária), frequência mensal de grupos (28 do mês, com kill-switch), aniversários de voluntários, lembrete de batismo, devocional diário, alerta de culto (3 canais), e-mails de voluntariado. **Não há agendador em banco nem UI de recorrência.**

### 1.7 O que já é BOM e deve ser reaproveitado (não jogar fora)

1. **`whatsappFila.js`** — backoff, classificação transitória×permanente, aviso de falha terminal. Maduro (endureceu no incidente do telefone corrompido, PR #2048).
2. **`gruposEnvios.js` + `GruposEnvios.jsx`** — o padrão de UX do console: resolução de audiência → **prévia com total + exemplo renderizado + exclusões auditadas** (sem_lider/sem_telefone/opt_out/sem_roster) → **confirmação digitando o número** → histórico. Kill-switches: bloqueio geral + automáticos por tipo (`gruposEnviosConfig.js`).
3. **`whatsappOptout.js`** — compliance resolvido (mem_membros.whatsapp_optin + whatsapp_lideres.recebe_lembretes). Desde o Contrato de Inscrição (F3.1), TODA porta grava opt-in explícito + ato auditável em `inscricao_consentimentos`.
4. **`waInbox`/`ConversasInbox`** — chat ao vivo completo.
5. **`whatsappAuto.js`** — o mecanismo table-driven certo para mensagens automáticas.

### 1.8 O canal paralelo que NÃO entra na fusão (mas precisa conversar)

`notificar()` (`services/notificar.js`) = notificações INTERNAS de staff (sino in-app + WebPush + push do app + e-mail) com regras em `notificacao_regras` — **nunca sai por WhatsApp**. `notificacaoGenerator.js` (1.423 linhas, ~20 geradores). Decisão da revisão estrutural: continua separado (público staff), mas o módulo central deve, no futuro, oferecer WhatsApp como 5º canal opcional do `notificar()` — hoje as regras de "quem recebe o quê" vivem em dois universos sem interseção.

---

## 2. Os problemas, numerados (por que o módulo central)

1. **"Enviado" não significa entregue** — statuses da Meta ignorados (C0).
2. **3 de 4 caminhos de envio não registram nada** — impossível relatório/custo/auditoria.
3. Duas camadas HTTP duplicadas (v18×v21) e 1 número em env espalhado.
4. Templates em env → deploy pra mudar uma vírgula; catálogo Meta nunca consultado (status de aprovação de template é invisível).
5. Recorrência = vercel.json (deploy) — sem UI, sem visibilidade.
6. Sem relatório: melhor histórico existente = 80 linhas, só de grupos. Broadcast nem persiste resultado. NPS de conversa (`wa_conversas.satisfacao`) é coletado e não tem tela.
7. Sem gestão de custo: a Meta cobra por conversa/categoria (marketing ≈ R$0,35 · utility ≈ R$0,04 · service/janela 24h = grátis; conferir tarifa vigente) e ninguém sabe quanto se gasta.
8. Três telas de admin desconexas confundem (a observação original do Marcos).
9. Atendentes: a atribuição existe no chat, mas não há gestão de QUEM atende (cadastro, áreas, horários) — hoje é ad-hoc.

---

## 3. O módulo central — visão e requisitos

**Nome sugerido:** módulo **Comunicação** (slug `comunicacao`), rota `/comunicacao`. As telas atuais viram ABAS dele; módulos finais (grupos, next, batismo…) mantêm espelhos/disparos que passam TODOS pelo motor central.

### Abas/funções (requisitos do Marcos → onde encaixam)

| Requisito | Aba/função | Base existente |
|---|---|---|
| Chat ao vivo | **Conversas** (move `/conversas` pra cá; redirect antigo) | waInbox pronto ✓ |
| Atendentes | **Atendentes**: cadastro (profile_id, áreas que atende, ativo, horário), fila de atribuição, transferência; painel por atendente (conversas ativas, tempo de resposta) | `wa_conversas.atribuido_a` existe; falta a entidade `wa_atendentes` |
| Opções de mensagens | **Mensagens prontas** (já existe como aba do chat — promove) | `wa_mensagens_prontas` ✓ |
| Templates padrão | **Templates**: tabela `wa_templates` (nome Meta, categoria, idioma, params, módulo dono, texto de exemplo, ativo) + **sync com o catálogo da Meta** (status aprovado/rejeitado) via `WHATSAPP_BUSINESS_ACCOUNT_ID/message_templates` | hoje ~24 envs → migrar pra tabela |
| Números de envio | **Números**: tabela `wa_numeros` (phone_number_id, rótulo, WABA, token ref, default, ativo). V1 = 1 número cadastrado; camada de envio já recebe o remetente por parâmetro (pronto pra multi) | não existe |
| Mensagens automáticas | **Automáticas**: generalizar `whatsapp_auto_config` — todo gatilho de evento (inscrição confirmada, batismo amanhã, pedido aprovado…) vira uma CHAVE editável (texto/template, on/off) | `whatsappAuto.js` ✓ (2 de ~20 gatilhos) |
| Programadas/recorrência | **Programadas**: tabela `wa_agendamentos` (template/chave, audiência salva, data única OU expressão de recorrência, ativo, último disparo) + 1 cron genérico varredor; os crons fixos migram pra cá um a um | fila já tem `proxima_tentativa_em` (a mecânica serve) |
| Erros | **Erros**: fila com `status=erro` (falha permanente), falhas terminais, webhooks `failed` (pós-C0), números inválidos — com ação (corrigir telefone → reenviar) | fila classifica ✓; falta a tela |
| Dashboard custo/envios/respostas | **Dashboard**: total de envios por dia/módulo/template; entregues/lidos/falhos (pós-C0); respostas recebidas (inbound de `wa_mensagens`); conversas por área; satisfação média; **custo estimado** = Σ conversas iniciadas × tarifa da categoria do template (tarifas numa tabelinha `wa_tarifas` editável) | nada — construir sobre a fila unificada |
| Menu do bot | **Bot**: absorve `/admin/conversas-setores` (menu de triagem) + `/admin/whatsapp` (coletas, líderes, institucional, IA on/off) | telas prontas, viram abas |

### O que os módulos finais mantêm (espelhos)

O console do Grupos (prévia+confirmação) **continua no /grupos** — mas passa a ser um componente genérico do módulo central instanciado com `contexto='grupos.*'`. Novos módulos ganham o mesmo componente. Histórico/relatório completo mora no central.

---

## 4. Arquitetura — fases de implementação

### C0 · Capturar statuses (PRIMEIRO, pequeno, aditivo — sem isso não há dashboard)
- `publicWhatsapp.js`: processar `value.statuses[]` → UPDATE `whatsapp_envios` por `message_id` (`delivered_at`, `read_at`, `failed_at` + erro) · staging p/ statuses órfãos (message_id que não achou envio — ex.: mensagens do chat) correlacionando também com `wa_mensagens`.
- Migration: colunas `delivered_at/read_at/failed_at/erro_status` em `whatsapp_envios` (+ índice por message_id).
- **Zero mudança de comportamento de envio.** Dá pra fazer em 1 PR curta.

### C1 · Uma camada de envio
- Novo `services/waSender.js` (ou promover `whatsappSend.js`): Graph **v21** única, token único, **remetente por parâmetro** (default = número da tabela `wa_numeros`). `whatsappService.js` vira wrapper deprecado que delega (não quebrar os 15+ call sites de uma vez — migrar por arquivo).

### C2 · Tudo pela fila
- `enfileirar()` ganha modo `imediato:true` (tenta na hora, registra sempre) — os Caminhos B/C migram chamada a chamada para a fila. Meta: **nenhum fetch direto pra Graph fora do waSender, nenhum envio fora da fila.** (Exceção justificada: respostas síncronas do bot dentro da janela — registrar em `wa_mensagens` como já faz o inbox.)

### C3 · Console central + tabelas novas
- `wa_numeros`, `wa_templates` (+sync Meta), `wa_agendamentos`, `wa_atendentes`, `wa_tarifas`.
- Generalizar `GruposEnvios` (remover filtro fixo, kill-switches por módulo).
- Migrar os ~24 env-templates pra `wa_templates` (script de seed lendo os envs atuais).

### C4 · Módulo `/comunicacao` (UI)
- Abas: Dashboard · Conversas (move) · Envios/Histórico · Programadas · Automáticas · Templates · Números · Atendentes · Mensagens prontas · Bot · Erros.
- Catálogo `modulos` + matriz (copiar de `conversas`); redirects das rotas antigas.

### C5 · Dashboard de custo
- Registrar em cada envio a categoria do template; visão custo = por mês/módulo/categoria; comparar com fatura da Meta.

**Regras de segurança que NÃO regridem:** HMAC fail-closed do webhook; kill-switches (bloqueio geral continua funcionando e passa a valer globalmente); opt-out prioridade máxima; confirmação-pelo-número em disparos em massa; NUNCA disparo em massa sem prévia com exclusões auditadas (lição do incidente Leandra, 26/07).

**O que NÃO fazer** (da revisão estrutural): não reescrever o chat; multi-número só quando o dashboard provar gargalo/qualidade de número; não mexer no canal `notificar()` interno nesta fase; nada de envio proativo novo sem template aprovado + opt-in.

---

## 5. Decisões em aberto (pro Matheus levar ao Marcos)

1. Nome/rota do módulo (`/comunicacao`?) e o destino das rotas antigas (redirects).
2. Atendentes: escala/horário entra na V1 ou só cadastro+áreas?
3. Tarifas Meta: manuais numa tabela (recomendado, simples) × integração com a API de billing.
4. Broadcast de Avisos (do /admin/whatsapp) permanece ou é substituído pelo console central com audiência salva? (Recomendação: substituir — broadcast atual não persiste resultado.)
5. Quais dos ~20 gatilhos hardcoded viram chaves de `whatsapp_auto_config` primeiro.
6. WhatsApp como 5º canal do `notificar()` interno: fase futura ou entra no escopo?

## 6. Referências no repo

- Fila: `backend/services/whatsappFila.js` · worker no cron de grupos
- Console-protótipo: `src/pages/ministerial/GruposEnvios.jsx` + `backend/services/gruposEnvios.js` + `gruposEnviosConfig.js`
- Chat: `src/components/waInbox/ConversasInbox.tsx` + `backend/services/waInbox.js`
- Webhook: `backend/routes/publicWhatsapp.js` (ordem de interceptadores no §1.2)
- Camadas a fundir: `backend/services/whatsappSend.js` × `whatsappService.js`
- Automáticas: `backend/services/whatsappAuto.js` + tabelas `whatsapp_auto_*`
- Tabelas: `wa_conversas`, `wa_mensagens`, `wa_mensagens_prontas`, `conversas_setores`, `whatsapp_envios`, `whatsapp_coletas`, `whatsapp_lideres`, `whatsapp_config`, `whatsapp_auto_config/envios`
- Contexto maior: revisão estrutural (bloco C) — deck em `~/Downloads/revisao-estrutural-cbrio.html` do Marcos; Contrato de Inscrição (opt-ins auditáveis): `docs/modulo-inscricoes/`

*Gerado em 2026-07-28 a partir da varredura completa do código + decisões do Marcos. Qualquer divergência com o código atual: o código vence — confira antes de implementar.*
