-- Seed do fluxo de COMPRAS (v1) no motor de fluxo · Fase 1 (inerte · nada lê ainda).
-- Espelha o fluxo vigente (régua de 2026-07-22 + roteamento cartão/pagamento):
-- pedido → [planejada≤1k: direto p/ cotação | senão aprovação de origem →
-- (mérito se valor exigir)] → cotação (Amaury) → no financeiro (Alberto) →
-- {cartão: Amaury compra | demais: Cristina paga} → comprado/pago → entrega →
-- concluído. Idempotente: só cria se compras v1 ainda não existir.
DO $$
DECLARE fid uuid;
BEGIN
  SELECT id INTO fid FROM public.solic_fluxos
    WHERE categoria='compras' AND versao=1 AND deleted_at IS NULL;
  IF fid IS NULL THEN
    INSERT INTO public.solic_fluxos (categoria, versao, is_ativa, nome, descricao)
    VALUES ('compras', 1, true, 'Compras · fluxo padrão',
            'Template inicial espelhando o fluxo vigente (régua 2026-07-22 + roteamento por forma de pagamento).')
    RETURNING id INTO fid;

    INSERT INTO public.solic_fluxo_etapas (fluxo_id, chave, label, tipo, ordem, area, modulo, status_map, pos_x, pos_y) VALUES
      (fid,'pedido','Pedido aberto','inicio',0,NULL,NULL,NULL,0,0),
      (fid,'aprovacao_origem','Aprovação de origem','aprovacao',1,NULL,NULL,'aguardando_aprovacao_origem',1,0),
      (fid,'merito','Julgamento de mérito (Pastor Presidente)','aprovacao',2,NULL,NULL,'aguardando_merito',2,-1),
      (fid,'cotacao','Cotação','etapa',3,'logistica_compras','logistica','em_cotacao',3,0),
      (fid,'no_financeiro','No financeiro','aprovacao',4,'financeiro','financeiro','aguardando_aprovacao_financeira',4,0),
      (fid,'compra_cartao','Amaury compra (cartão)','execucao',5,'logistica_compras','logistica','pendente',5,-1),
      (fid,'pagamento','Cristina paga','execucao',5,'financeiro','financeiro','em_atendimento',5,1),
      (fid,'entrega','Comprado/Pago · aguardando entrega','entrega',6,NULL,NULL,'aguardando_entrega',6,0),
      (fid,'concluido','Concluído','fim',7,NULL,NULL,'concluido',7,0);

    INSERT INTO public.solic_fluxo_transicoes (fluxo_id, de_etapa_id, para_etapa_id, verbo, condicao_tipo, condicao_valor, ordem, label)
    SELECT fid, d.id, p.id, v.verbo, v.ctipo, v.cval, v.ord, v.lbl
    FROM (VALUES
      ('pedido','cotacao','abrir','planejado_valor','{"planejado":true,"valor_max":1000}'::jsonb,1,'Planejada até R$ 1.000'),
      ('pedido','aprovacao_origem','abrir',NULL::text,NULL::jsonb,2,'Demais casos'),
      ('aprovacao_origem','merito','aprovar_origem','valor_limite','{"planejado_min":5000,"nao_planejado_min":1000}'::jsonb,1,'Valor exige Pastor Presidente'),
      ('aprovacao_origem','cotacao','aprovar_origem',NULL::text,NULL::jsonb,2,'Sem mérito'),
      ('merito','cotacao','aprovar_merito',NULL::text,NULL::jsonb,1,NULL::text),
      ('cotacao','no_financeiro','enviar_financeiro',NULL::text,NULL::jsonb,1,NULL::text),
      ('no_financeiro','compra_cartao','aprovar_financeiro','forma_pagamento','{"forma_pagamento":"cartao_credito"}'::jsonb,1,'Cartão de crédito'),
      ('no_financeiro','pagamento','aprovar_financeiro',NULL::text,NULL::jsonb,2,'Boleto / Pix / Transferência'),
      ('compra_cartao','entrega','marcar_comprado',NULL::text,NULL::jsonb,1,NULL::text),
      ('pagamento','entrega','marcar_pago',NULL::text,NULL::jsonb,1,NULL::text),
      ('entrega','concluido','confirmar_entrega',NULL::text,NULL::jsonb,1,NULL::text)
    ) AS v(de_chave,para_chave,verbo,ctipo,cval,ord,lbl)
    JOIN public.solic_fluxo_etapas d ON d.fluxo_id=fid AND d.chave=v.de_chave
    JOIN public.solic_fluxo_etapas p ON p.fluxo_id=fid AND p.chave=v.para_chave;
  END IF;
END $$;
