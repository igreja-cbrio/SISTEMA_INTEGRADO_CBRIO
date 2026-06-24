-- Kids · jornada da criança: data de conversão e batismo na ficha (2026-06-24)
-- Bloco B · entram na ficha e são filtráveis. data_conversao pode ser
-- auto-preenchida pela 1ª decisão registrada (cultos_decisoes_pessoas), mas a
-- equipe pode ajustar manualmente; data_batismo é registrada pela equipe.
ALTER TABLE public.kids_criancas
  ADD COLUMN IF NOT EXISTS data_conversao date,
  ADD COLUMN IF NOT EXISTS data_batismo   date;
