

## Nova aba "Online" — métricas de YouTube/transmissão

### Onde adicionar
Nova aba **"Online"** dentro de `/kpis` (`src/pages/kpis/KPIs.tsx`), entre **Cultos** e **Batismos**. É lá que vivem hoje os dados de cultos, YouTube e a sync já configurada — assim a nova aba reusa a mesma fonte (`vw_culto_stats` / tabela `cultos`) sem duplicar nada.

> Obs: o "ministerial" hoje agrupa Voluntariado, Membresia e Grupos (não tem cultos). Mantenho a aba **dentro do módulo KPIs** porque é onde o dado vive. Se preferir mover toda a área de cultos para "Ministerial", me avise depois — é mudança maior.

### O que a aba mostra

**1. Cards de métricas agregadas (período selecionado no header)**
- Pico simultâneo (soma)
- Views D+1 (soma)
- Views D+7 (soma)
- Decisões Online (soma)
- Cultos com vídeo vinculado / pendentes de coleta

**2. Botão "Sincronizar agora"**
Reusa `kpisApi.youtubeSync()` (já implementado, roda também no cron do Vercel). Mostra toast com nº de vídeos atualizados.

**3. Gráfico de evolução**
Linha temporal por culto: pico, D+1 e D+7 ao longo do período. Reaproveita `recharts` + `vw_culto_stats`.

**4. Tabela "Cultos online"**
Colunas: Culto • Data • Vídeo (link YouTube) • Pico • D+1 • D+7 • Decisões Online • Status coleta • Ações.
Status coleta: `Pendente D+1` / `Pendente D+7` / `Coletado` / `Sem vídeo`.

**5. Formulário manual (modal)**
Para um culto existente, preencher / corrigir:
- ID do vídeo no YouTube
- Pico simultâneo
- Views D+1 (manual override)
- Views D+7 (manual override)
- Decisões online

Salva via `kpisApi.cultos.update(id, payload)` (endpoint já aceita esses campos — só precisa adicionar `online_ds` e `online_ddus` à allowlist do PUT).

### Sincronização automática (já existe — só documentar)
- Cron diário no Vercel chama `POST /api/kpis/youtube/sync` com `CRON_SECRET`.
- Coleta D+1 (cultos do dia anterior) e D+7 (cultos de 7 dias atrás).
- Requer `YOUTUBE_API_KEY` configurada na Vercel **e** `youtube_video_id` preenchido no culto.
- A nova aba mostrará um banner amarelo se `YOUTUBE_API_KEY` estiver ausente (verificado por uma flag retornada pelo backend).

### Detalhes técnicos

**Frontend (`src/pages/kpis/KPIs.tsx`)**
- Adicionar `{ id: 'online', label: 'Online' }` em `TABS`.
- Criar `TabOnline({ data, loading, serviceTypes, onSync })` com cards + gráfico + tabela + modal.
- Modal `ModalEditarOnline` permite escolher culto existente (combo) ou abrir direto a partir de uma linha da tabela.
- Bug atual a corrigir no mesmo PR: `meta_24m` no card "Meta 24 meses" (linha 917) quebra build — ajustar tipo do helper `getMeta` para aceitar `'meta_6m' | 'meta_12m' | 'meta_24m'`.

**Backend (`backend/routes/kpis.js`)**
- Adicionar `'online_ds'` e `'online_ddus'` ao array `allowed` no `PUT /cultos/:id` para permitir override manual.
- Novo `GET /kpis/youtube/status` retorna `{ apiKeyConfigured: boolean, lastSync: timestamp }` para o banner.

**Banco de dados**
Sem alteração de schema — colunas `youtube_video_id`, `online_pico`, `online_ds`, `online_ddus`, `ds_coletado_em`, `ddus_coletado_em` já existem na tabela `cultos`.

### Notificações
Notificação automática diária quando a sync rodar, listando cultos com `youtube_video_id` ainda pendentes >48h após o evento (chamada via `notificacaoGenerator.js`, módulo `kpis`).

### Entrega
Um único PR `claude/kpis-aba-online`:
1. Backend: allowlist `online_ds`/`online_ddus` no PUT + endpoint `youtube/status`.
2. Frontend: nova aba `Online` + correção do erro de build `meta_24m`.
3. Notificação periódica de cultos sem coleta.

Após merge: confirmo no chat a URL de produção e instruções para verificar a sync manual.

