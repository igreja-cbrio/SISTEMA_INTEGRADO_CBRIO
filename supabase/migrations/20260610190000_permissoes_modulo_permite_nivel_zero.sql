-- Permite nível 0 (sem acesso / bloqueio explícito) nos overrides por usuário.
--
-- A escala de permissão é 0–5 (0 = sem acesso) e a matriz por cargo
-- (cargo_modulo_permissao.nivel) já aceita 0. O override individual
-- (permissoes_modulo) só aceitava 1–5, o que impedia registrar um "deny"
-- explícito por usuário. Esse deny é o que permite esconder um módulo
-- específico de quem por padrão vê tudo (admin/diretor) — sem mexer no resto
-- do acesso da pessoa. Relaxa o CHECK para 0–5 (aditivo · não-destrutivo ·
-- nenhum dado existente é invalidado · default segue 1).

ALTER TABLE public.permissoes_modulo
  DROP CONSTRAINT IF EXISTS permissoes_modulo_nivel_leitura_check;
ALTER TABLE public.permissoes_modulo
  ADD CONSTRAINT permissoes_modulo_nivel_leitura_check
  CHECK (nivel_leitura >= 0 AND nivel_leitura <= 5);

ALTER TABLE public.permissoes_modulo
  DROP CONSTRAINT IF EXISTS permissoes_modulo_nivel_escrita_check;
ALTER TABLE public.permissoes_modulo
  ADD CONSTRAINT permissoes_modulo_nivel_escrita_check
  CHECK (nivel_escrita >= 0 AND nivel_escrita <= 5);
