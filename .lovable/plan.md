

## Auto-criação semanal de cultos + coleta D+1 garantida

### Problema
Os cultos de 19/04 não aparecem porque **ninguém os cadastrou manualmente**. Sem linha na tabela `cultos`, o cron das 10h não tem o que sincronizar com o YouTube. Resultado: D+1 do culto de ontem está vazio porque o culto sequer existe no sistema.

### Solução em 3 partes

**1. Auto-criar cultos da semana (novo cron — domingo 00:05 BRT)**

Novo endpoint `POST /api/kpis/cultos/auto-create` que:
- Lê todos `vol_service_types` ativos (já têm `recurrence_day` 0-6 e `recurrence_time`).
- Para cada tipo, calcula a data da próxima ocorrência na semana corrente.
- Faz `INSERT ... ON CONFLICT (service_type_id, data, hora) DO NOTHING` na tabela `cultos`, preenchendo `nome`, `data`, `hora`, `service_type_id`. Demais campos ficam zerados/null para preenchimento posterior.
- Idempotente: pode rodar várias vezes sem duplicar.

Adicionar no `vercel.json`:
```json
{ "path": "/api/kpis/cultos/auto-create", "schedule": "5 3 * * 0" }
```
(domingo 03:05 UTC = 00:05 BRT — cria os cultos da semana logo após a virada de domingo).

**Backfill imediato**: o mesmo endpoint aceita `?weeks=2` para criar retroativamente as últimas 2 semanas, cobrindo o culto de ontem (19/04).

**2. Garantir coleta D+1 mesmo sem `youtube_video_id`**

Hoje a sync filtra `not('youtube_video_id', 'is', null)` — então culto sem vídeo nunca dispara nada. Mudar para:
- Se `youtube_video_id` estiver presente → busca views normalmente.
- Se ausente e culto > 24h → criar notificação "Culto X sem vídeo do YouTube vinculado" com link direto para edição.

**3. Banner na aba Online**

Quando houver cultos das últimas 48h sem `youtube_video_id`, mostrar banner amarelo na aba Online com botão "Vincular vídeo agora" abrindo o modal de edição já existente.

### Schema
**Sem mudanças.** Tabela `cultos` já tem todas as colunas necessárias. Vai precisar apenas garantir um índice/constraint único `(service_type_id, data, hora)` — script SQL no PR para você rodar manualmente no SQL Editor (conforme sua preferência salva).

### Arquivos tocados
- `backend/routes/kpis.js` — novo endpoint `auto-create`, ajuste no `youtube/sync` para alertar cultos sem vídeo.
- `backend/services/notificacaoGenerator.js` — nova checagem "culto sem vídeo > 24h".
- `vercel.json` — novo cron semanal.
- `src/pages/kpis/KPIs.tsx` — banner na aba Online + botão "Criar cultos da semana" (manual, para forçar sem esperar cron).
- `supabase/migrations/<timestamp>_cultos_unique.sql` — constraint única (você roda no SQL Editor).

### Entrega
Único PR `claude/kpis-auto-criar-cultos`. Após merge:
1. Você roda o SQL da constraint no Supabase.
2. Eu chamo `POST /api/kpis/cultos/auto-create?weeks=2` manualmente para criar os cultos retroativos (incluindo os de 19/04).
3. Você abre /kpis → aba Online → vincula `youtube_video_id` ao culto de ontem.
4. Clica "Sincronizar agora" → D+1 aparece.
5. A partir de domingo que vem, cron cria automaticamente.

