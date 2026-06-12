-- Classifica natureza + classe nos planos importados do balanço legado
-- pra alimentar a DRE (vw_fin_dre_mensal agrupa por natureza e classe).

-- 1. Receitas ordinarias · dizimos + ofertas (3.01)
UPDATE public.fin_plano_contas
SET natureza = 'ordinaria'
WHERE codigo LIKE '3.01%' AND natureza IS NULL;

-- 2. Receitas extraordinarias · campanhas, eventos (3.02 EXCETO 3.02.06)
UPDATE public.fin_plano_contas
SET natureza = 'extraordinaria'
WHERE codigo LIKE '3.02%' AND codigo NOT LIKE '3.02.06%' AND natureza IS NULL;

-- 3. Receitas financeiras · rendimento + emprestimo (3.02.06.*)
UPDATE public.fin_plano_contas
SET natureza = 'financeira'
WHERE codigo LIKE '3.02.06%' AND natureza IS NULL;

-- 4. Outras receitas · fallback
UPDATE public.fin_plano_contas
SET natureza = 'extraordinaria'
WHERE tipo = 'receita' AND natureza IS NULL;

-- 5. Despesas FIXAS · RH + prediais + bancarias (4.01, 4.02, 4.13, 4.14)
UPDATE public.fin_plano_contas
SET classe = 'fixa'
WHERE (codigo LIKE '4.01%' OR codigo LIKE '4.02%' OR codigo LIKE '4.13%' OR codigo LIKE '4.14%')
  AND classe IS NULL;

-- 6. Despesas VARIAVEIS · servicos, alimentos, marketing (4.03, 4.06, 4.08)
UPDATE public.fin_plano_contas
SET classe = 'variavel'
WHERE (codigo LIKE '4.03%' OR codigo LIKE '4.06%' OR codigo LIKE '4.08%')
  AND classe IS NULL;

-- 7. Despesas EVENTUAIS · repasses, viagens, imobilizado, emprestimos (4.04, 4.05, 4.07, 4.09, 4.15)
UPDATE public.fin_plano_contas
SET classe = 'eventual'
WHERE (codigo LIKE '4.04%' OR codigo LIKE '4.05%' OR codigo LIKE '4.07%'
       OR codigo LIKE '4.09%' OR codigo LIKE '4.15%')
  AND classe IS NULL;

-- 8. Despesas FINANCEIRAS (natureza) · juros, tarifas, IOF, emprestimos
UPDATE public.fin_plano_contas
SET natureza = 'financeira'
WHERE tipo = 'despesa'
  AND (codigo LIKE '4.13%' OR codigo LIKE '4.14%' OR codigo LIKE '4.15%')
  AND natureza IS NULL;

-- 9. Demais despesas sem classe · fallback 'variavel'
UPDATE public.fin_plano_contas
SET classe = 'variavel'
WHERE tipo = 'despesa' AND classe IS NULL;
