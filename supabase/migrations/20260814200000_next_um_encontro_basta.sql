-- ⚠️⚠️ MUDANÇA DE RÉGUA · "fez o Next" passa a ser UM encontro (2026-08-14)
--
-- Decisão do Matheus, olhando o funil da Integração: *"a pessoa é considerada
-- se fez next se ela for em apenas um encontro do next, isso já faz ela entrar
-- na categoria de quem já fez o next"*.
--
-- ⚠️ ISTO SUBSTITUI a régua de 30/06/2026 (migration `20260630160000`, decidida
-- com o Marcos + responsável do Next), que exigia presença na **aula 1 E na
-- aula 2** — o que aquela migration mudou foi permitir formar CRUZANDO TURMAS,
-- não reduzir para uma aula. Ele foi avisado da divergência antes de decidir e
-- confirmou a mudança. **Não reverter sem falar com os dois.**
--
-- ⚠️ Junto com a régua, o ramo de presença deixa de filtrar `numero IN (1,2)`:
-- se um encontro basta, um encontro sem número (medido: 47 matrículas com
-- presença assim) também conta. Filtrar continuaria escondendo gente que
-- esteve lá — que é exatamente o que esta mudança existe para corrigir.
--
-- ⚠️ `next_pessoa_aula_manual` (override do responsável) passa a `OR`. Hoje não
-- muda nada (0 linhas com só uma aula marcada), mas a semântica tem que ser a
-- mesma da presença, senão a marcação manual vira mais exigente que o fato.
--
-- ⚠️ LIMITAÇÃO PRESERVADA, não introduzida: presença de matrícula SEM
-- `membro_id` continua fora (não há chave para levá-la à pessoa). O ramo final
-- `UNION ALL` segue cobrindo essas por `status='formado'`.
--
-- Efeito medido em produção antes de aplicar:
--   formados hoje (aula 1 E aula 2 + manual + status) ......... 775
--   pessoas com presença em QUALQUER encontro ................. 878
-- Isto é lido por NSM, /painel, KPIs NEXT-*, Cuidados e os marcadores de
-- jornada — todos passam a contar pela régua nova de uma vez.

CREATE OR REPLACE VIEW public.vw_next_formado_pessoa AS
 WITH presenca AS (
         SELECT m.membro_id
           FROM next_presencas p
             JOIN next_encontros e ON e.id = p.encontro_id
             JOIN next_matriculas m ON m.id = p.matricula_id AND m.deleted_at IS NULL AND m.membro_id IS NOT NULL
          WHERE p.presente = true
          GROUP BY m.membro_id
        ), manual AS (
         SELECT next_pessoa_aula_manual.membro_id,
            next_pessoa_aula_manual.updated_at::date AS dt
           FROM next_pessoa_aula_manual
          WHERE next_pessoa_aula_manual.fez_aula1 OR next_pessoa_aula_manual.fez_aula2
        ), status_membro AS (
         SELECT DISTINCT next_matriculas.membro_id
           FROM next_matriculas
          WHERE next_matriculas.deleted_at IS NULL AND next_matriculas.status = 'formado'::text AND next_matriculas.membro_id IS NOT NULL
        ), formado_membros AS (
         SELECT presenca.membro_id FROM presenca
        UNION
         SELECT manual.membro_id FROM manual
        UNION
         SELECT status_membro.membro_id FROM status_membro
        ), mat_min AS (
         SELECT next_matriculas.membro_id,
            min(next_matriculas.created_at::date) AS dt
           FROM next_matriculas
          WHERE next_matriculas.deleted_at IS NULL AND next_matriculas.membro_id IS NOT NULL
          GROUP BY next_matriculas.membro_id
        )
 SELECT f.membro_id,
    mm.cpf,
    mm.nome,
    COALESCE(mat_min.dt, man.dt) AS formado_em
   FROM formado_membros f
     LEFT JOIN mat_min ON mat_min.membro_id = f.membro_id
     LEFT JOIN manual man ON man.membro_id = f.membro_id
     LEFT JOIN mem_membros mm ON mm.id = f.membro_id
UNION ALL
 SELECT NULL::uuid AS membro_id,
    m.cpf,
    m.nome,
    min(m.created_at::date) AS formado_em
   FROM next_matriculas m
  WHERE m.deleted_at IS NULL AND m.status = 'formado'::text AND m.membro_id IS NULL
  GROUP BY m.cpf, m.nome;

COMMENT ON VIEW public.vw_next_formado_pessoa IS
  'Fonte UNICA de "fez o Next" por PESSOA. Regua desde 14/08/2026 (decisao do Matheus): UM encontro basta. Substitui a regua de 30/06/2026, que exigia aula 1 E aula 2. Nao alterar sem falar com Matheus e Marcos.';
