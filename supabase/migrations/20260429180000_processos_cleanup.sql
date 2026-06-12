-- Arquivar processos com KPIs removidos da planilha
UPDATE processos SET status = 'arquivado'
WHERE indicador_ids && ARRAY['CUID-02','CUID-03','CUID-04','CUID-08','CUID-09','CUID-11','CUID-13','INTG-03','GEN-01'];

-- Atualizar nomes/descricoes de CUID-05 e CUID-06
UPDATE processos SET
  nome = 'Engajamento novos convertidos em valores',
  descricao = 'Medir novos convertidos engajados em ao menos um dos 5 valores'
WHERE indicador_ids = '{"CUID-05"}';

UPDATE processos SET
  nome = 'Membros envolvidos em 2+ valores',
  descricao = 'Medir percentual de membros envolvidos em 2 ou mais valores'
WHERE indicador_ids = '{"CUID-06"}';
