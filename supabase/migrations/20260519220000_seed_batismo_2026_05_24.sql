-- ============================================================================
-- Seed: inscricoes de batismo · 4o domingo de Maio 2026 (24/05/2026)
--
-- Fonte: planilha "Bat_240526" do formulario antigo de inscricao de batismo
-- (passada pelo Marcos em 19/05/2026 · pessoas que se inscreveram pelo form
-- antigo · NAO entraram pelo /batismo do sistema).
--
-- Total recebido na planilha: 20 linhas brutas
-- Apos deduplicacao:
--   - Bernardo Maximo Mauro veio 5x (mesma pessoa, submissao repetida) -> 1
--   - Julia Guimaraes Lima veio 2x (emails diferentes do responsavel) -> 1
--   - Total final: 15 inscricoes unicas
--
-- Criancas (≤12 anos em 24/05/2026):
--   - Calebe Maia de Araujo Lopes (12)
--   - Maria Eduarda Maximo Mauro (12)
-- Adolescentes com responsavel (13-17):
--   - Julia Guimaraes Lima (16)
--   - Bernardo Maximo Mauro (14)
-- Adultos: os 11 demais.
--
-- status = 'pendente' (batismo e' futuro · acontece em 24/05/2026)
-- area_kpi default 'sede' (todos escolheram cultos de Domingo na sede)
-- origem = 'manual' (importado pelo admin, nao via /batismo novo)
--
-- Idempotente: WHERE NOT EXISTS verifica (lower(nome), lower(sobrenome),
-- data_batismo) antes de inserir · rodar a migration de novo nao duplica.
-- ============================================================================

WITH novos_batismos (nome, sobrenome, data_nascimento, cpf, telefone, email,
                     endereco, status, data_batismo, observacoes) AS (
VALUES
  ('Julia', 'Faroni de Oliveira', '1993-03-16'::date, '14776023725', '21992751112', 'juliafaroni@hotmail.com', 'Rua Professor Andrade Muricy, 123 Casa. CEP 22750-635. Camisa: P. Culto: 8:30', 'pendente', '2026-05-24'::date, 'Motivo: Ja sou convertido ha um tempo, mas agora tomei a decisao. Comentario: Matheus da Conceicao Almeida (noivo)'),
  ('Matheus', 'Da Conceicao Almeida', '1994-08-02'::date, '15201768725', '21972087211', 'malmeida_94@hotmail.com', 'Coronel Paulo Malta Rezende, 35 apto 2107. CEP 22631-005. Camisa: G. Culto: 8:30', 'pendente', '2026-05-24'::date, 'Motivo: Outro'),
  ('Julia', 'Guimaraes Lima', '2009-12-24'::date, '15142278780', '21972281599', 'miriantonyju@gmail.com', 'Rua honorina Gertrudes. CEP 23065-060. Camisa: P. Culto: 8:30', 'pendente', '2026-05-24'::date, 'Responsavel: Mirian Ribeiro Guimaraes Santos. Motivo: Ja sou convertido ha um tempo, mas agora tomei a decisao'),
  ('Mariana', 'Oliveira Moreira', '1999-06-17'::date, '15388353710', '21999724590', 'marimoreira9@hotmail.com', 'Av. das Americas, no 13.033, Cond. Villaggio Felicita, Casa 140. CEP 22790-701. Camisa: M. Culto: 8:30', 'pendente', '2026-05-24'::date, 'Motivo: Outro'),
  ('Debora', 'Rezende maia siqueira', '1978-04-09'::date, '07895564722', '21981875747', 'debora.siqueira@pro.escolaparque.g12.br', 'Avenida genaro de Carvalho 1201. CEP 22795-077. Camisa: G. Culto: 8:30', 'pendente', '2026-05-24'::date, 'Motivo: Ja sou convertido ha um tempo, mas agora tomei a decisao. Comentario: Esposo - Rodrigo siqueira'),
  ('Juliana', 'Moorby Deslandes Siqueira Villa', '1977-09-29'::date, '07798025782', '21981217111', 'juliasiq.rlk@terra.com.br', 'Rua Arroio fundo 225 casa 1 Anil Jacarepagua. CEP 22765-260. Camisa: G. Culto: 8:30', 'pendente', '2026-05-24'::date, 'Motivo: Ja sou convertido ha um tempo, mas agora tomei a decisao'),
  ('Victoria', 'Delfino', '2000-06-07'::date, '17644582738', '21979637953', 'victoria@tamtec.com.br', 'Av Lucio Costa 3602 bl 1 1801. CEP 22630-010. Camisa: P. Culto: 8:30', 'pendente', '2026-05-24'::date, 'Motivo: Ja sou convertido ha um tempo, mas agora tomei a decisao. Comentario: Adriana Delfino silva pitombeira'),
  ('Graziela', 'L. Simoes', '1980-08-17'::date, '21925980847', '21974277988', 'grazisimoes1@gmail.com', 'Av. Prefeito Dulcidio Cardoso, 2800/1110. CEP 22631-052. Camisa: M. Culto: 10:00', 'pendente', '2026-05-24'::date, 'Motivo: Aceitei Jesus recentemente'),
  ('Jacqueline', 'Silva', '1976-01-04'::date, '07292728774', '21996131410', 'jackpietro0116@gmail.com', 'Av Marechal Henrique Lott 270. CEP 22631-370. Camisa: M. Culto: 10:00', 'pendente', '2026-05-24'::date, 'Motivo: Ja sou convertido ha um tempo, mas agora tomei a decisao. Participa de grupo: Sim'),
  ('Danielle', 'Rodrigues de Figueiredo Cruz', '1978-10-08'::date, '07757294770', '21982655724', 'danitalo699@gmail.com', 'Estrada Benvindo de Novaes, 2800, BL 08 AP 107, Recreio dos Bandeirantes. CEP 22790-382. Camisa: P. Culto: 10:00', 'pendente', '2026-05-24'::date, 'Motivo: Outro. Participou do Next: Sim'),
  ('Calebe', 'Maia de Araujo Lopes', '2013-07-03'::date, '20608269778', '21993224581', 'calebemaiadearaujo@gmail.com', 'Rua Hugo Panasco Alvim, 275, Apt 101, Recreio dos Bandeirantes. CEP 22795-306. Camisa: P. Culto: 10:00', 'pendente', '2026-05-24'::date, 'Crianca. Responsavel: Karlo Rodrigo e Morgana maia. Motivo: Aceitei Jesus recentemente'),
  ('Bernardo', 'Maximo Mauro', '2012-02-05'::date, '03845944765', '21981600242', 'adeboramaximo@gmail.com', 'Rua Jerson Pompeu pinheiro 144. CEP 22793-317. Camisa: M. Culto: 10:00', 'pendente', '2026-05-24'::date, 'Responsavel: Debora Maximo Cuquejo Mauro. Motivo: Ja sou convertido ha um tempo, mas agora tomei a decisao. Comentario: Maria Eduarda Maximo Mauro'),
  ('Joao Pedro', 'Fraguito dos Santos', '2003-09-04'::date, '16030925793', '21970070813', 'jp.fraguito123@gmail.com', 'Rua Teixeira Heizer 1965. CEP 22790-883. Camisa: M. Culto: 8:30', 'pendente', '2026-05-24'::date, 'Motivo: Outro. Participou do Next: Sim. Participa de grupo: Sim'),
  ('Maria Eduarda', 'Maximo Mauro', '2014-05-04'::date, '03845794771', '21981600242', 'adeboramaximo@gmail.com', 'Rua Jerson Pompeu Pinheiro, 144. CEP 22793-317. Camisa: P. Culto: 10:00', 'pendente', '2026-05-24'::date, 'Crianca. Responsavel: Debora Maximo Cuquejo Mauro. Motivo: Aceitei Jesus recentemente. Comentario: Bernardo Maximo Mauro'),
  ('Debora', 'de Carvalho Gallo', '1994-05-27'::date, '15434894782', '21983916666', 'deb-gallo@hotmail.com', 'Rua Desenhista Luiz Guimaraes 305. CEP 22793-261. Camisa: G. Culto: 10:00', 'pendente', '2026-05-24'::date, 'Motivo: Aceitei Jesus recentemente')
)
INSERT INTO public.batismo_inscricoes
  (nome, sobrenome, data_nascimento, cpf, telefone, email, observacoes,
   status, data_batismo, origem, membro_id)
SELECT
  nb.nome,
  nb.sobrenome,
  nb.data_nascimento,
  nb.cpf,
  nb.telefone,
  nb.email,
  -- concatena endereco + observacoes em "observacoes" pra preservar tudo
  CASE
    WHEN nb.observacoes IS NULL AND nb.endereco IS NULL THEN NULL
    WHEN nb.observacoes IS NULL THEN 'Endereco: ' || nb.endereco
    WHEN nb.endereco IS NULL THEN nb.observacoes
    ELSE nb.observacoes || '. Endereco: ' || nb.endereco
  END,
  nb.status,
  nb.data_batismo,
  'manual',
  m.id  -- membro_id resolvido por CPF (NULL se nao bater)
FROM novos_batismos nb
LEFT JOIN public.mem_membros m
  ON m.cpf IS NOT NULL
 AND regexp_replace(m.cpf, '\D', '', 'g') = nb.cpf
WHERE NOT EXISTS (
  SELECT 1 FROM public.batismo_inscricoes b
  WHERE lower(trim(b.nome)) = lower(trim(nb.nome))
    AND lower(trim(b.sobrenome)) = lower(trim(nb.sobrenome))
    AND b.data_batismo = nb.data_batismo
);

-- ============================================================================
-- Conferencia (rodar manualmente apos aplicar):
--   SELECT count(*) FROM batismo_inscricoes WHERE data_batismo = '2026-05-24';
--     Espera: 15 (ou mais se ja havia inscricoes pelo /batismo novo)
--
--   SELECT nome, sobrenome, cpf, membro_id IS NOT NULL AS vinculado
--     FROM batismo_inscricoes
--    WHERE data_batismo = '2026-05-24'
--    ORDER BY sobrenome;
-- ============================================================================
