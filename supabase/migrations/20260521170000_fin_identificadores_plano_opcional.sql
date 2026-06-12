-- Identificador de centavo: plano_contas_id vira OPCIONAL
-- O centavo so marca a campanha/destino (ex: ,25 = Campanha templo central)
-- A conta do plano de contas eh escolhida na hora da classificacao
-- Idempotente

ALTER TABLE fin_identificadores_centavo
  ALTER COLUMN plano_contas_id DROP NOT NULL;

COMMIT;
