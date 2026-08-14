-- ============================================================================
-- identidade_pendencias · pendência que aponta pra SI MESMA nasce resolvida
-- (2026-08-14 · 2ª tentativa · a 1ª foi ABORTADA pela própria guarda)
--
-- O QUE ACONTECIA
-- A tabela tem DUAS colunas com FK pra mem_membros (`membro_id` e
-- `membro_conflito_id`). O laço de repoint do `merge_membros` descobre os filhos
-- pelo CATÁLOGO (`pg_constraint`), então ele aponta as DUAS colunas pro cadastro
-- mantido — e a pendência passa a dizer "o CPF deste cadastro conflita com ele
-- mesmo". Indecidível, e VISÍVEL na fila de Conflitos de identidade das Entradas.
--
-- Medido em produção (14/08): **39 pendências com `membro_id =
-- membro_conflito_id`** — 37 já resolvidas na mesma ação humana que fundiu, 1
-- descartada, e **1 AINDA PENDENTE** (`cpf_conflito`, "CPF chegou pra um
-- cadastro sem CPF, mas já pertence a outro"). As outras duas tabelas de PAR já
-- estão protegidas: o `merge_membros` APAGA `mem_duplicados_ignorados` e
-- `mem_identidade_pares` antes do repoint, e as duas têm 0 self-pair.
--
-- ⚠️⚠️ POR QUE ISTO É UM GATILHO, E NÃO UM PATCH NO CORPO DO merge_membros
-- A 1ª versão desta migration injetava um UPDATE dentro da função, ancorado em
-- `DELETE FROM public.mem_membros WHERE id = ANY(p_merge_ids);`. Ela ABORTOU em
-- produção: *"a âncora aparece 0 vez(es) na definição viva"*. A guarda fez o que
-- devia — aquela linha existe em QUATRO migrations do repo (a última é a
-- 20260718190000) e **não existe na função viva**, ou seja o corpo em produção
-- divergiu do git (mesmo drift do `handle_new_user` e da régua de bloco do
-- voluntariado). Patchar por texto exigiria conhecer a forma viva, e ela pode
-- mudar de novo amanhã.
--
-- O gatilho é imune a isso: ele age sobre o ESTADO da linha, não sobre o texto
-- de quem a escreveu. E cobre mais que a fusão — qualquer escritor que produza
-- um self-pair (o `fn_wifi_processar_vinculos`, um backfill, uma correção
-- manual no SQL Editor) passa a cair na mesma regra. Self-pair não é caso de
-- negócio: é sempre lixo.
--
-- ⚠️ RESOLVE, não APAGA. A linha é trilha de trabalho humano (`resolvida_por`,
-- `resolvida_em`) e `entradas_resolucoes` a referencia por `origem_id` —
-- apagá-la sumiria com a prova de que o conflito existiu e foi tratado.
--
-- ⚠️ `resolvida_por` fica NULO de propósito. O gatilho não sabe quem agiu
-- (`auth.uid()` é NULL no caminho da API, que roda com service_role — lei do
-- projeto), e inventar um ator seria gravar autoria falsa numa trilha de
-- decisão. Quem explica o que aconteceu é o `detalhe`.
--
-- Idempotente: pode rodar quantas vezes quiser.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_identidade_pendencia_self_resolve()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_marca constant text := '[os dois lados são o mesmo cadastro]';
BEGIN
  IF NEW.membro_id IS NOT NULL
     AND NEW.membro_id = NEW.membro_conflito_id
     AND coalesce(NEW.status, '') NOT IN ('resolvida', 'descartada')
  THEN
    NEW.status := 'resolvida';
    NEW.resolvida_em := coalesce(NEW.resolvida_em, now());
    -- ⚠️ Só carimba se a marca ainda não estiver lá: sem isso, reabrir a linha
    -- pra 'pendente' com o self-pair intacto empilharia o texto a cada UPDATE.
    IF position(v_marca in coalesce(NEW.detalhe, '')) = 0 THEN
      NEW.detalhe := coalesce(nullif(NEW.detalhe, ''), 'Conflito de identidade')
                     || ' ' || v_marca;
    END IF;
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.fn_identidade_pendencia_self_resolve() IS
  'Fecha a pendência de identidade cujos DOIS lados são o mesmo cadastro (o caso que merge_membros cria ao repontar as 2 FKs). Gatilho em vez de patch no corpo do merge_membros porque a definição viva daquela função divergiu do repo — ver 20260814200000.';

DROP TRIGGER IF EXISTS tg_identidade_pendencia_self_resolve ON public.identidade_pendencias;

-- ⚠️ BEFORE INSERT **e** UPDATE. O UPDATE é o caso medido (o repoint da fusão);
-- o INSERT é defensivo e barato — self-pair inserido também é indecidível, e
-- deixá-lo entrar só pra ser resolvido depois criaria trabalho na fila humana
-- que ninguém pode fazer.
CREATE TRIGGER tg_identidade_pendencia_self_resolve
BEFORE INSERT OR UPDATE ON public.identidade_pendencias
FOR EACH ROW EXECUTE FUNCTION public.fn_identidade_pendencia_self_resolve();

-- ============================================================================
-- O passado. Só as que ficaram ABERTAS apontando pra si mesmas — as 37 já
-- resolvidas ficam intactas (reescrever histórico resolvido não acrescenta nada
-- e apagaria a data real da decisão).
--
-- ⚠️⚠️ ERRO DA 1ª APLICAÇÃO, CORRIGIDO AQUI. Este UPDATE dizia (no comentário)
-- que o gatilho acima faria o trabalho — e **não faz**: em `BEFORE UPDATE` o
-- `NEW` já chega com os valores do próprio UPDATE, então setar
-- `status = 'resolvida'` aqui torna a guarda `NOT IN ('resolvida','descartada')`
-- FALSA e o gatilho no-opa. Efeito medido em produção: a linha ficou resolvida
-- **sem `resolvida_em` e sem explicação no `detalhe`** — resolução sem data nem
-- motivo, que é o oposto de trilha auditável.
-- ⇒ O backfill NÃO delega ao gatilho: carimba os três campos ele mesmo. Régua
--   que fica: backfill que depende de gatilho pra completar o próprio efeito é
--   frágil por construção — o gatilho existe pro que vier DEPOIS.
--
-- O predicado pega os dois casos e é idempotente (a marca no `detalhe` é o
-- freio): self-pair ainda aberta, **e** self-pair que a 1ª aplicação resolveu
-- sem data. `resolvida_em IS NULL` distingue com precisão a linha do saneamento
-- das 37 resolvidas por gente — medido: 1 linha na tabela inteira.
-- ============================================================================
UPDATE public.identidade_pendencias
   SET status = 'resolvida',
       resolvida_em = coalesce(resolvida_em, now()),
       detalhe = coalesce(nullif(detalhe, ''), 'Conflito de identidade')
                 || ' [os dois lados são o mesmo cadastro]'
 WHERE membro_id IS NOT NULL
   AND membro_id = membro_conflito_id
   AND position('[os dois lados são o mesmo cadastro]' in coalesce(detalhe, '')) = 0
   AND (status NOT IN ('resolvida', 'descartada')
        OR (status = 'resolvida' AND resolvida_em IS NULL));

COMMENT ON TABLE public.identidade_pendencias IS
  'Fila humana de conflitos de identidade (Entradas). ⚠️ As DUAS colunas de membro têm FK pra mem_membros, então merge_membros as reponta e a linha pode virar "conflito consigo mesmo" — o gatilho tg_identidade_pendencia_self_resolve (2026-08-14) fecha esse caso na entrada. NÃO remover o gatilho sem substituir a proteção.';
