-- Revisão periódica de patrimônio · intervalo e prazo VARIÁVEIS por
-- localização (pedido do usuário 2026-08-10). Até aqui todo ciclo era
-- trimestral fixo pra TODAS as localizações, com o prazo de cada convocação
-- distribuído proporcionalmente dentro do período do ciclo — não dava pra
-- dizer "esta sala é revisada 1x por ano" ou "aquele almoxarifado tem 3 dias
-- pra conferir, não 90 (proporcional ao ciclo inteiro)".
--
-- As 2 colunas ficam NULLABLE de propósito: enquanto a área não define os
-- números (reunião prevista pelo usuário), o sistema segue com o
-- comportamento LEGADO — localização entra em TODO ciclo criado, com prazo
-- distribuído proporcionalmente no período do ciclo (ver
-- backend/routes/patrimonio.js `POST /revisao/ciclos`). Deploy em 2 etapas:
-- nenhum ciclo já criado é afetado, e nada quebra se a migration ainda não
-- tiver sido aplicada quando o backend for atualizado (colunas ausentes só
-- fariam o PUT ignorar os 2 campos novos — não derruba a rota).
ALTER TABLE public.pat_localizacoes
  ADD COLUMN IF NOT EXISTS revisao_intervalo_dias integer
    CHECK (revisao_intervalo_dias IS NULL OR revisao_intervalo_dias > 0),
  ADD COLUMN IF NOT EXISTS revisao_prazo_dias integer
    CHECK (revisao_prazo_dias IS NULL OR revisao_prazo_dias > 0);

COMMENT ON COLUMN public.pat_localizacoes.revisao_intervalo_dias IS
  'Cada quantos dias esta localização precisa ser revisada de novo (intervalo até a próxima revisão). NULL = comportamento legado: entra em TODO ciclo de revisão criado.';
COMMENT ON COLUMN public.pat_localizacoes.revisao_prazo_dias IS
  'Quantos dias o responsável tem, a partir da abertura do ciclo, pra concluir a conferência física desta localização ("tempo de análise"). NULL = comportamento legado: prazo distribuído proporcionalmente dentro do período do ciclo.';
