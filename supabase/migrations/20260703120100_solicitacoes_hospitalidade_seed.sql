-- ============================================================================
-- Hospitalidade · categoria + SLA + responsável (2026-07-03)
-- Decisão do gestor: quem atende Hospitalidade é o Amaury.
-- Depende da 20260703120000 (valor 'hospitalidade' no enum) já aplicada.
-- ============================================================================
BEGIN;

-- 1 · Categoria no CHECK (lista completa vigente da 20260602160000 + hospitalidade)
ALTER TABLE public.solicitacoes DROP CONSTRAINT IF EXISTS solicitacoes_categoria_check;
ALTER TABLE public.solicitacoes ADD CONSTRAINT solicitacoes_categoria_check
  CHECK (categoria IN (
    'ti', 'compras', 'reembolso', 'espaco', 'reserva_espaco', 'infraestrutura',
    'hospitalidade', 'ferias', 'licenca', 'marketing', 'pagamento', 'servico',
    'producao', 'outro'
  ));

-- 2 · SLA (mesmos prazos da manutenção · ajustável depois em sla_definicoes)
INSERT INTO public.sla_definicoes (area_responsavel, subcategoria, eh_urgente, sla_resposta_horas, sla_resolucao_horas, descricao)
SELECT 'hospitalidade', 'default', false, 168, 336, 'Planejado · recepção, café e hospedagem de convidados'
WHERE NOT EXISTS (
  SELECT 1 FROM public.sla_definicoes
  WHERE area_responsavel = 'hospitalidade' AND subcategoria = 'default' AND eh_urgente = false
);
INSERT INTO public.sla_definicoes (area_responsavel, subcategoria, eh_urgente, sla_resposta_horas, sla_resolucao_horas, descricao)
SELECT 'hospitalidade', 'default', true, 24, 48, 'Urgente · demanda de hospitalidade de última hora'
WHERE NOT EXISTS (
  SELECT 1 FROM public.sla_definicoes
  WHERE area_responsavel = 'hospitalidade' AND subcategoria = 'default' AND eh_urgente = true
);

-- 3 · Responsável: Amaury (match por nome · conferir em /admin/solicitacoes-responsaveis)
INSERT INTO public.area_solicitacoes_responsaveis (area, profile_id, criado_por)
SELECT 'hospitalidade', p.id, NULL
FROM public.profiles p
WHERE p.name ILIKE 'amaury%'
ON CONFLICT (area, profile_id) DO NOTHING;

COMMIT;
