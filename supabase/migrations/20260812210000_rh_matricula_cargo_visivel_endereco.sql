-- Modernização do cadastro de colaboradores (revisão comparada a padrões de
-- HRIS internacionais + Feedz, 2026-08-12). Aditiva — nenhuma coluna existente
-- é alterada.
--
-- Decisões do usuário: matrícula, cargo visível e endereço estruturado ENTRAM.
-- CPF fica como está (obrigatório — CLT/PJ exige). Sexo/etnia NÃO entram (dado
-- de categoria especial, exige consentimento documentado antes de coletar —
-- LGPD art. 11 — e não há processo de consentimento pronto pra isso no RH).
-- Nível hierárquico/salarial já são cobertos por `grau_id`+`gestor_id`.

-- Matrícula: identificador funcional (ex.: número de folha/convênio),
-- distinto do id interno. Nullable — só quem precisa integra com folha externa.
ALTER TABLE public.rh_funcionarios
  ADD COLUMN IF NOT EXISTS matricula text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_rh_funcionarios_matricula
  ON public.rh_funcionarios (matricula) WHERE matricula IS NOT NULL AND deleted_at IS NULL;

-- Cargo visível: como a pessoa é chamada no dia a dia (ex. "Diácono de
-- Louvor"), distinto do cargo oficial de CLT/PJ. Cosmético, não sensível.
ALTER TABLE public.rh_funcionarios
  ADD COLUMN IF NOT EXISTS cargo_visivel text;

-- Endereço estruturado — reaproveita o padrão que o módulo de censo acabou de
-- introduzir (src/lib/cepAutopreenche.ts): `endereco` já existe na tabela e
-- passa a significar LOGRADOURO (mesma convenção do ViaCEP/censo). Colunas
-- novas: cep, numero, complemento, bairro, cidade, uf.
ALTER TABLE public.rh_funcionarios
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS complemento text,
  ADD COLUMN IF NOT EXISTS bairro text,
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS uf text;

COMMENT ON COLUMN public.rh_funcionarios.matricula IS
  'Identificador funcional (ex.: nº de folha/convênio), distinto do id interno. Nullable.';
COMMENT ON COLUMN public.rh_funcionarios.cargo_visivel IS
  'Como a pessoa é chamada no dia a dia — distinto do cargo oficial de CLT/PJ.';
COMMENT ON COLUMN public.rh_funcionarios.endereco IS
  'Logradouro (rua/avenida) — mesma convenção do padrão de CEP do censo (src/lib/cepAutopreenche.ts). Colunas irmãs: cep, numero, complemento, bairro, cidade, uf.';
