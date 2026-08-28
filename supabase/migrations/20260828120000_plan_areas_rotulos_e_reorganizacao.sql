-- Planejamento Anual · rótulos de área + reorganização das áreas (2026-08-28)
--
-- Pedido do Diego: a coluna ÁREA da tela de avaliação (e do formulário de
-- proposta) mostrava o slug cru (marketing, producao, adm...) porque
-- `plan_areas_diretoria` nunca teve rótulo de exibição — só a chave técnica
-- (`area`), que é FK de `plan_propostas.area` e não pode levar acento.
--
-- Ao revisar a lista, o Diego também identificou inconsistência: 'ministerial'
-- e 'adm' repetiam o nome da própria DIRETORIA em vez de descrever uma área
-- específica (nenhuma outra diretoria tinha essa entrada genérica). Reorganizou
-- a lista: Criativo ganhou Online · Operações consolidou 7 áreas em 5 (com
-- Gestão Estratégica substituindo 'adm' e Hospitalidade/Infraestrutura
-- substituindo cozinha+limpeza / manutencao+compras) · Ministerial trocou o
-- genérico 'ministerial' por AMI, Grupos, CBA e Next.

-- 1 · Rótulo de exibição (aditivo · não mexe na chave `area`)
ALTER TABLE public.plan_areas_diretoria ADD COLUMN IF NOT EXISTS rotulo text;

UPDATE public.plan_areas_diretoria SET rotulo = CASE area
  WHEN 'marketing'    THEN 'Marketing'
  WHEN 'producao'     THEN 'Produção'
  WHEN 'adoracao'     THEN 'Adoração'
  WHEN 'cozinha'      THEN 'Cozinha'
  WHEN 'limpeza'      THEN 'Limpeza'
  WHEN 'manutencao'   THEN 'Manutenção'
  WHEN 'compras'      THEN 'Compras'
  WHEN 'logistica'    THEN 'Logística'
  WHEN 'adm'          THEN 'Administrativo'
  WHEN 'rh'           THEN 'RH'
  WHEN 'financeiro'   THEN 'Financeiro'
  WHEN 'ministerial'  THEN 'Ministerial'
  WHEN 'integracao'   THEN 'Integração'
  WHEN 'cuidados'     THEN 'Cuidados'
  WHEN 'voluntariado' THEN 'Voluntariado'
  WHEN 'kids'         THEN 'Kids'
  ELSE rotulo
END
WHERE rotulo IS NULL;

-- 2 · Áreas novas (decisão do Diego · 2026-08-28)
INSERT INTO public.plan_areas_diretoria (area, diretoria, rotulo) VALUES
  ('online',             'criativo',    'Online'),
  ('gestao_estrategica', 'operacoes',   'Gestão Estratégica'),
  ('hospitalidade',      'operacoes',   'Hospitalidade'),
  ('infraestrutura',     'operacoes',   'Infraestrutura'),
  ('ami',                'ministerial', 'AMI'),
  ('grupos',             'ministerial', 'Grupos'),
  ('cba',                'ministerial', 'CBA'),
  ('next',               'ministerial', 'Next')
ON CONFLICT (area) DO NOTHING;

-- 3 · Áreas aposentadas — DESATIVADAS, nunca apagadas.
-- `plan_propostas.area` é FK de `area`, e havia proposta viva usando 'adm' no
-- momento desta migration — apagar a linha quebraria a constraint (e apagaria
-- histórico legítimo). `GET /aux/areas` já filtra `ativo <> false`, então isto
-- tira as áreas do formulário sem tocar em proposta nenhuma; o rótulo (passo 1)
-- continua servindo pra exibir corretamente propostas antigas que usam essas
-- chaves.
UPDATE public.plan_areas_diretoria
   SET ativo = false
 WHERE area IN ('ministerial', 'adm', 'cozinha', 'limpeza', 'manutencao', 'compras');
