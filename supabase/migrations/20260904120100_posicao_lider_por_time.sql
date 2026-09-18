-- ============================================================================
-- Uma posição de LÍDER em cada time (2026-09-04)
--
-- Decisão do Marcos (03/09): *"vamos criar uma posição de líder para cada time,
-- aí fica no template, muitas vezes os líderes inclusive já ficam pré escalados
-- no template por serem recorrentes"*. Vem de confirmar que o time `Liderança`
-- (580 escalas) era guarda-chuva do que no Planning Center é uma POSIÇÃO dentro
-- de cada time — foi assim que o template `Padrão` deles apareceu: `Liderança`
-- com a pessoa fixa em CBRio Online, Cuidados, Integração, Marketing e
-- Voluntariado.
--
-- ⚠️⚠️ Medido em 04/09: **1 de 13 times ativos tem posição de líder** — e é o
-- próprio time `Liderança` (com `Líder` e `Supervisão`). Os outros 12 não têm.
--
-- ⚠️⚠️ O HISTÓRICO NÃO É MIGRÁVEL, e isto NÃO tenta migrar. As 580 escalas do
-- time `Liderança` têm `position_name` **NULL em 100%** e `team_name` com **8
-- variantes** (448x `Liderança`, 70x `Adultos | Líderes`, 24x `Jovens |
-- Líderes`, 17x `LIDERANÇA`, 14x `STAFF`, 4x `Liderança, Pós Culto`, 2x
-- `SUPERVISOR`, 1x `Liderança, Pós Culto 8:30`) — não há como derivar de qual
-- time era cada liderança. O time `Liderança` FICA com o passado; daqui pra
-- frente a liderança é posição dentro do time. Lei do legado × futuro.
--
-- ⚠️ `sort_order = -1` de propósito, e não 0: os times existentes já usam 0 ou 1
-- como primeiro valor (medido), então -1 põe o líder no topo **sem renumerar
-- nada**. Renumerar mexeria na ordem que a coordenação já enxerga nas telas.
--
-- ⚠️ `min_volunteers = 1`: é o "1 Needed" do Services. Sem isso a posição nasce
-- sem alvo e a cobertura nunca pede o líder.
--
-- ⚠️ IDEMPOTENTE e conservador: só cria onde NÃO existe posição cujo nome já
-- comece com "líder"/"lideranç" (case- e acento-insensível pelo `~*`). Não
-- renomeia, não mexe no time `Liderança`, e rodar de novo não duplica.
--
-- ⚠️⚠️ O QUE ESTA MIGRATION **NÃO** FAZ, e não pode fazer: pré-escalar o líder
-- no template. Medido: **`vol_teams.leader_profile_id` é NULL em TODOS os 13
-- times ativos**, então não existe no banco a informação de quem lidera cada
-- time. Pré-escalar exige alguém dizer os nomes — é passo de gente, na tela de
-- Templates de escala (`vol_escala_template_item_pessoas`, hoje com 0 linhas).
-- ============================================================================

INSERT INTO public.vol_positions (team_id, name, min_volunteers, is_active, sort_order)
SELECT t.id, 'Líder', 1, true, -1
  FROM public.vol_teams t
 WHERE t.is_active = true
   AND NOT EXISTS (
     SELECT 1 FROM public.vol_positions p
      WHERE p.team_id = t.id
        AND (p.name ~* '^\s*l[íi]der' OR p.name ~* '^\s*lideran[çc]')
   );

-- Conferência:
--   SELECT t.name, count(p.id) FILTER (WHERE p.name = 'Líder') AS lider
--     FROM vol_teams t LEFT JOIN vol_positions p ON p.team_id = t.id
--    WHERE t.is_active GROUP BY t.name ORDER BY t.name;
