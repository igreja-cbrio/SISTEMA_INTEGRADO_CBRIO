-- ============================================================================
-- Kill-switch das RESPOSTAS automáticas do WhatsApp (12/08/2026)
--
-- Pedido do Matheus: *"preciso desativar a automação do bot, pois as pessoas
-- estão respondendo ao nosso disparo e tá abrindo o menu do bot. Vamos deixar
-- desativado por enquanto"* + *"mas os disparos automáticos continuam. E aí o
-- retorno, vamos fazer de forma humanizada mesmo."*
--
-- ⚠️⚠️ POR QUE UMA COLUNA NOVA E NÃO O `ia_ativa` QUE JÁ EXISTE: o `ia_ativa` é
-- checado no TOPO do webhook (`publicWhatsapp.js`) e faz `return` ANTES de
-- `waInbox.registrarInbound` — ou seja, desligá-lo **também para de registrar as
-- mensagens que chegam**, e a equipe deixaria de VER quem escreveu na aba
-- Conversas. Ele silenciaria o bot cegando o inbox, que é o oposto do pedido:
-- se o retorno passa a ser humano, o humano precisa receber.
--
-- O que esta coluna desliga (e SÓ isso):
--   · o menu de setores do bot de triagem (services/whatsappTriagem)
--   · a resposta institucional automática (LLM) a número desconhecido
--
-- O que continua funcionando, de propósito:
--   · TODOS os disparos de template (fila whatsapp_envios): grupos, censo,
--     inscrições, batismo, aniversário… — decisão explícita dele
--   · o registro do inbound no inbox (é o que a equipe atende)
--   · os statuses de entrega da Meta (delivered/read/failed)
--   · a coleta de números de culto dos coordenadores
--
-- ⚠️ Default TRUE: a coluna existe pra ser desligada por decisão, não pra mudar
-- o comportamento de quem nunca mexeu nela. O valor de HOJE é false, aplicado
-- logo abaixo por ordem dele, e religar é um clique em /admin/whatsapp.
--
-- APLICADA em produção em 12/08/2026 (via MCP) · conferido:
--   ia_ativa = true · respostas_automaticas = false.
-- ============================================================================
alter table public.whatsapp_config
  add column if not exists respostas_automaticas boolean not null default true;

comment on column public.whatsapp_config.respostas_automaticas is
  'Bot RESPONDE sozinho a quem escreve? Desliga só o menu de triagem e a resposta institucional; disparos de template, registro no inbox e statuses da Meta seguem funcionando. Diferente de ia_ativa, que corta o webhook inteiro (inclusive o inbox).';

-- Decisão do Matheus em 12/08/2026: desligado por enquanto.
update public.whatsapp_config
   set respostas_automaticas = false,
       updated_at = now()
 where id = 1;

-- ⚠️ O PostgREST precisa recarregar o schema pra enxergar a coluna nova:
--   notify pgrst, 'reload schema';

-- Conferência (rodar à parte):
--   select ia_ativa, respostas_automaticas from whatsapp_config where id = 1;
