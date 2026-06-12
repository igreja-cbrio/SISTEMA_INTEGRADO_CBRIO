-- ============================================================================
-- Seed: batismos realizados em 2026 (Janeiro a Abril)
--
-- Fonte: planilha "Batismo (respostas)" do formulario de inscricao, abas:
--   Bat_250126 -> data_batismo 2026-01-25 (4o domingo)
--   Bat 220226 -> data_batismo 2026-02-22
--   Bat_220326 -> data_batismo 2026-03-22
--   Bat_260426 -> data_batismo 2026-04-26
--
-- Regras aplicadas:
--   - Linhas vermelhas na planilha = inscritos que nao compareceram (status='cancelado')
--   - Linhas laranjas na planilha = criancas (status='realizado', tag em observacoes)
--   - Demais linhas = adultos batizados (status='realizado')
--
-- Totais por mes (excluindo cancelados):
--   Jan 25/01: 14 batizados (1 cancelado)
--   Fev 22/02: 14 batizados (12 adultos + 2 criancas, 0 cancelados)
--   Mar 22/03: 11 batizados (5 cancelados)
--   Abr 26/04: 13 batizados (8 adultos + 5 criancas, 0 cancelados)
--   ----
--   Total: 52 realizados + 6 cancelados = 58 inscricoes
--
-- Membro_id eh resolvido por CPF (LEFT JOIN com mem_membros).
-- Trigger trg_batismo_realizado dispara para realizados com membro_id != NULL,
-- criando mem_trilha_valores etapa='batismo' (alimenta Jornada/NSM).
--
-- Idempotente: WHERE NOT EXISTS verifica (lower(nome), lower(sobrenome),
-- data_batismo) antes de inserir.
-- ============================================================================

WITH novos_batismos (nome, sobrenome, data_nascimento, cpf, telefone, email,
                     endereco, status, data_batismo, observacoes) AS (
VALUES
  ('Rinaldo', 'Costa de Andrade e Silva', '1971-06-03'::date, '01200198760', '21974279596', 'Rinaldo1971@yahoo.com', 'Rua Prof Hermes de Lima 382/204 Recreio dos Bandeirantes', 'realizado', '2026-01-25'::date, NULL),
  ('Carla Cristina', 'Da Cunha Guse Pinto', '1980-05-02'::date, '08539011719', '21998007269', 'carlacristinaguse@yahoo.com.br', 'Rua Mário Agostinelli 155 Apto 606 bloco 2', 'cancelado', '2026-01-25'::date, 'Inscrito mas nao compareceu ao batismo'),
  ('Lívia', 'Batista Almeida Abreu', '1983-11-15'::date, '10486862720', '21983291851', 'liviabatistaalmeida@gmail.com', 'Avenida Lúcio Costa 3100/87', 'realizado', '2026-01-25'::date, NULL),
  ('Dérick da Costa', 'Da Costa', '1989-02-07'::date, '11154298760', '22988199656', 'Derickcostavidanova007@gmail.com', 'Rua fabio luz, 275', 'realizado', '2026-01-25'::date, NULL),
  ('Jasilmo Paulino da Silva', 'Silva', '1979-12-15'::date, '04670966600', '21959122974', 'Jasilmosilva@gmail.com', 'Rua Sílvia Possano', 'realizado', '2026-01-25'::date, NULL),
  ('Francyelle', 'Aguilar Franco', '1981-02-10'::date, '05058936658', '38992120702', 'francyelleaguilar@gmail.com', 'Av. Leão Bitencourt 145', 'realizado', '2026-01-25'::date, NULL),
  ('Thays Fernanda', 'Garcia', '1991-10-06'::date, '01022214217', '21997396489', 'thaysfernanda2348@gmail.com', 'Rua José Duarte 126', 'realizado', '2026-01-25'::date, NULL),
  ('Igor', 'Cabral Telles', '1980-08-18'::date, '08683388778', '21970121201', 'Igor.telles@rficlogistica.com.br', 'Rua Gomes Freire 558 907', 'realizado', '2026-01-25'::date, NULL),
  ('Patrícia', 'Costa', '1979-11-07'::date, '08912197738', '21982831044', 'patriciac_osta@outlook.com', 'Rua Galvani', 'realizado', '2026-01-25'::date, NULL),
  ('Vinicius', 'Mello Marinho', '2008-01-16'::date, '20787621722', '21999877139', 'viniciusmello2008@icloud.com', 'Rua General Renato Paquet 199', 'realizado', '2026-01-25'::date, NULL),
  ('Raphaela', 'Figueiredo Loureiro Dias', '2006-06-13'::date, '15138281771', '21964121521', 'raphafldias@gmail.com', 'Rua Mário Olinto, 250', 'realizado', '2026-01-25'::date, NULL),
  ('Daniele', 'Guimarães Palmeira Dib Porto', '1977-02-25'::date, '07699811780', '21992808377', 'danielepalmeira.adv@gmail.com', 'Av. Henfil n. 25, BL 1/1606', 'realizado', '2026-01-25'::date, NULL),
  ('Bruna', 'Gonçalves de Oliveira', '1982-03-11'::date, '09065554720', '21999360019', 'fotosbruna11@gmail.com', 'Praça Antônio Callado ,215 Mundo novo', 'realizado', '2026-01-25'::date, NULL),
  ('Alexandre', 'Dib Porto', '1976-01-01'::date, '04260273701', '21998196667', 'dibporto@gmail.com', 'Avenida Henfil, 25', 'realizado', '2026-01-25'::date, NULL),
  ('Jacqueline andreia santiago', 'Palmieri', '1974-09-04'::date, '03767447746', '21995575465', 'Jacpalmieri@yahoo.com.br', 'Av Djalma Ribeiro,  25 ap 703 bl 01', 'realizado', '2026-01-25'::date, NULL),
  ('Célia Regina', 'Vasquez Ferreira', '1956-12-31'::date, '83748601700', '21993588648', 'celiavferreira55@gmail.com', 'Av Sta Cruz 833 bl 6 apt 105', 'realizado', '2026-02-22'::date, 'Crianca. Responsavel: celia'),
  ('Ricardo', 'Paes Leme Pires Correa', '1980-12-27'::date, '08675688792', '21991120280', 'rcorrea.analise@gmail.com', 'Av Tim Lopes 255 bloco 6 ap 311', 'realizado', '2026-02-22'::date, NULL),
  ('Patrícia Campbell de Miranda', 'Campbell de Miranda', '1983-12-08'::date, '05621823737', '21987649089', 'patycampbellm@gmail.com', 'Av. Vice Presidente José Alencar 1515, 5/1005', 'realizado', '2026-02-22'::date, NULL),
  ('Luma', 'Monteir da Silva', '1986-04-21'::date, '11323509720', '21965691986', 'luma_nutricao@yahoo.com.br', 'Av Tim Lopes 255 bl6 apt 311', 'realizado', '2026-02-22'::date, NULL),
  ('Giovanna', 'Ariodante Thinnes', '2008-08-23'::date, '20388121793', '21982554890', 'giovannaariodante9@gmail.com', 'Rua joão marques cadengo, 22B, casa 6b', 'realizado', '2026-02-22'::date, 'Responsavel: Michele de Andrade Ariodante'),
  ('Sarah', 'Botelho Alves', '1993-02-25'::date, '01185023607', '31992295251', 'drasarahbotelho@gmail.com', 'Avenida Malibu 95 apto 1004 bloco 2', 'realizado', '2026-02-22'::date, NULL),
  ('Fernanda', 'Torres', '1993-03-05'::date, '14761014776', '21996499301', 'ft904417@gmail.com', 'Rua Hugo Panasco Alvim 330 apartamento 202', 'realizado', '2026-02-22'::date, NULL),
  ('Victor', 'Nantes Baldez', '2002-01-25'::date, '11885880790', '21971871523', 'victornanteslimaa2002@gmail.com', 'rua araguaia 1266', 'realizado', '2026-02-22'::date, NULL),
  ('Ruan', 'Ribeiro', '2000-03-04'::date, '17339666761', '21985704431', 'ruanns35@gmail.com', 'rua Lincoln Oest 110', 'realizado', '2026-02-22'::date, NULL),
  ('Marcus vinicius', 'Duarte ribeiro', '1983-10-08'::date, '09916089760', '21994666182', 'jeankunzelduarte@gmail.com', 'Rua 8W, Recreio dos Bandeirantes', 'realizado', '2026-02-22'::date, NULL),
  ('Dérick', 'Da costa', '1989-07-07'::date, '11154298760', '22988199656', 'Derickcostavidanova007@gmail.com', NULL, 'realizado', '2026-02-22'::date, NULL),
  ('Efraim', 'Lucca Monteiro de Andrade', NULL, NULL, '5521997898969', 'luma_nutricao@yahoo.com.br', NULL, 'realizado', '2026-02-22'::date, 'Crianca. Responsavel: Luma Monteir da Silva'),
  ('José Sergio', 'Martins', NULL, NULL, '21983620045', NULL, NULL, 'realizado', '2026-02-22'::date, NULL),
  ('Ronilza', 'Moreira Lima', NULL, NULL, '21996621974', NULL, NULL, 'realizado', '2026-02-22'::date, NULL),
  ('Flavia', 'Arriete Barcelos Moraes', '1979-11-21'::date, '05330883725', '21971342711', 'Flarriete@gmail.com', 'Av Jardins de santa Monica 100/903/5', 'realizado', '2026-03-22'::date, NULL),
  ('Lara Roberta', 'De Sá Rego', '1996-09-19'::date, '16080835789', '21982790946', 'laradesa96@gmail.com', 'Av Lucio Costa 9500', 'cancelado', '2026-03-22'::date, 'Inscrito mas nao compareceu ao batismo'),
  ('Flávia', 'Freire Dantas', '1979-03-07'::date, '08244815779', '21981238749', 'flaviadantasrj@gmail.com', 'Avenida Malibu, 143 bloco 1 apto 201', 'realizado', '2026-03-22'::date, NULL),
  ('Marcelo', 'Ottoni de Carvalho', '1966-06-21'::date, '83012869700', '021964827434', 'mareju.cariocas@yahoo.com.br', 'Rua Parecis, 264 - Heliópolis - Belford Roxo/RJ', 'cancelado', '2026-03-22'::date, 'Inscrito mas nao compareceu ao batismo'),
  ('Arthur', 'Pinelli', '1996-05-10'::date, '19041577777', '21965143565', 'Xxpinellixx@gmail.com', 'Rua gravata 267', 'realizado', '2026-03-22'::date, NULL),
  ('Renata', 'Nogueira Martins', '1994-03-24'::date, '10919675719', '21999898383', 'Renata.nogmar@gmail.com', 'Rua general roca', 'realizado', '2026-03-22'::date, NULL),
  ('Luciana', 'Knak', '1985-07-28'::date, '11211510786', '21999441562', 'lu-knak@hotmail.com', 'Travessa Bitencourt 24 casa 101 Quintino', 'cancelado', '2026-03-22'::date, 'Inscrito mas nao compareceu ao batismo'),
  ('alice', 'mello xavier ferreira', '2011-06-29'::date, '16362689780', '21982842212', 'alicemelloxavierferreira@gmail.com', 'estrada dos três rios 1030', 'realizado', '2026-03-22'::date, 'Responsavel: ingrid mello'),
  ('julia', 'alves amaral soares', '2011-12-17'::date, '17272989777', '21980048714', 'jujuliaalvesamaralsoares@gmail.com', 'rua retiro dos artistas 1931', 'realizado', '2026-03-22'::date, 'Responsavel: josy ribeiro'),
  ('Gisele', 'Feijó de Medeiros', '1975-01-15'::date, '07227395758', '21970268847', 'giselefmedeiros@ems.com.br', 'Estrada do Gabinal 352 BL 01 Apt 402', 'cancelado', '2026-03-22'::date, 'Inscrito mas nao compareceu ao batismo'),
  ('Matheus', 'Vicente Feijó Fernandes', '2011-09-09'::date, '20522731740', '21994720820', 'giselefmedeiros@gmail.com', 'Estrada do Gabinal 352 BL 01 Apt 402', 'cancelado', '2026-03-22'::date, 'Inscrito mas nao compareceu ao batismo. Responsavel: Gisele Feijó de Medeiros'),
  ('Carla Regina de Oliveira Azeredo', 'Azeredo', '1980-06-20'::date, '09347465755', '21979095795', 'Cr-azeredo@hotmail.com', 'Rua Beth lago 295 casa 36', 'realizado', '2026-03-22'::date, NULL),
  ('Matheus Oliveira Borges', 'Borges', '2012-10-02'::date, '09347465755', '21979095795', 'Cr-azeredo@hotmail.com', 'Rua Beth lago 295 casa 36', 'realizado', '2026-03-22'::date, 'Responsavel: Carla Regina de Oliveira Azeredo'),
  ('Manuella de Oliveira Borges', 'Borges', '2017-07-12'::date, '09347465755', '21979095795', 'Cr-azeredo@hotmail.com', 'Rua Beth Lago 295 casa 36', 'realizado', '2026-03-22'::date, 'Responsavel: Carla Regina de Oliveira Azeredo'),
  ('Theo', 'Rosas Galvão', '2016-12-22'::date, '19666239760', '21964129522', 'renatha2005@hotmail.com', 'Estrada do Bananal 981 - Freguesia', 'realizado', '2026-03-22'::date, 'Responsavel: Renata Rosas de Almeida'),
  ('Robson', 'Barroso Ribeiro', '1980-07-24'::date, '08935176745', '21999257799', 'Contato@robson-ribeiro.com', 'Av Lúcio Costa 3360', 'realizado', '2026-03-22'::date, NULL),
  ('Tainá', 'Dos Santos Berba Rodrigues', '1990-11-20'::date, '13655432771', '21965122713', NULL, 'Rua macembu 369 bloco 2 apt 506', 'realizado', '2026-04-26'::date, NULL),
  ('Caio Cesar', 'Costa dos Santos', '1988-11-11'::date, '13272841709', '21997702173', 'caiocguadagnosports@gmail.com', 'Rua macembu 369 bloco 2 apt 506', 'realizado', '2026-04-26'::date, NULL),
  ('Marcelo', 'Ottoni de Carvalho', '1966-06-21'::date, '83012869700', '21964827434', 'mareju.cariocas@yahoo.com.br', 'Rua Parecis,  264 - Heliópolis - Belford Roxo/RJ', 'realizado', '2026-04-26'::date, NULL),
  ('Maria', 'Rosa De Oliveira pessoa', '2015-04-15'::date, '21014106729', '5521988998185', 'rcastropessoa@gmail.com', 'Avenida Gilberto Amado 61', 'realizado', '2026-04-26'::date, 'Crianca. Responsavel: Raphael Pessoa'),
  ('Vitor', 'Alves de Souza Amaral', '2012-08-04'::date, '18282609757', '21988746660', 'vitoramaralfamilia@gmail.com', 'Estrada do bananal 360', 'realizado', '2026-04-26'::date, 'Crianca. Responsavel: Diogo Amaral'),
  ('Lara Roberta', 'De Sá Rego', '1996-09-19'::date, '16080835789', '21982790746', 'laradesa96@gmail.com', 'Av. Lúcio Costa, 9500 apt 420', 'realizado', '2026-04-26'::date, NULL),
  ('Roberta Ferreira lopes', 'Lopes', '1982-02-20'::date, '09523505726', '21999324537', 'Robertalopes469@gmail.com', 'Rua sucuri 130', 'realizado', '2026-04-26'::date, NULL),
  ('Beatriz', 'Siqueira Barroso', '1976-10-28'::date, '07273072745', '21969987825', 'beatrizbarroso2810@gmail.com', 'rua mario bhering 6', 'realizado', '2026-04-26'::date, NULL),
  ('Fernando', 'Roriz de Almeida', '1978-11-28'::date, '08197153795', '21980926559', 'feroriz@gmail.com', 'Rua Oscar Valdetaro, 94', 'realizado', '2026-04-26'::date, NULL),
  ('Gisele', 'Feijó de Medeiros', '1975-01-15'::date, '07227395758', '21970268847', 'giselefmedeiros@gmail.com', 'Estrada do Gabinal 352 Apt 402 BL 01 Freguesia Jacarepaguá', 'realizado', '2026-04-26'::date, NULL),
  ('MATHEUS', 'VICENTE', '2011-09-09'::date, '20522731740', '21994720820', 'matheusvicentefeijofernandes@gmail.com', 'bosque do gabinal 352', 'realizado', '2026-04-26'::date, 'Crianca. Responsavel: gisele feijo de medeiros'),
  ('Andreia', 'Palladino', NULL, NULL, NULL, NULL, NULL, 'realizado', '2026-04-26'::date, 'Crianca'),
  ('Fabiano', 'Pereira de Medeiros', NULL, NULL, '21970268847', NULL, NULL, 'realizado', '2026-04-26'::date, 'Crianca')
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

-- Conferencia (rodar manualmente apos aplicar):
-- SELECT data_batismo, status, count(*) AS qtd
--   FROM public.batismo_inscricoes
--  WHERE data_batismo BETWEEN '2026-01-01' AND '2026-04-30'
--  GROUP BY data_batismo, status
--  ORDER BY data_batismo, status;
--
-- Esperado:
--   2026-01-25 cancelado   1
--   2026-01-25 realizado  14
--   2026-02-22 realizado  14
--   2026-03-22 cancelado   5
--   2026-03-22 realizado  11
--   2026-04-26 realizado  13
--   ----
--   Total realizado: 52 | cancelado: 6
--
-- KPI batismos (depende do segmento de KPI mas a fonte canonica eh isto):
-- SELECT count(*) FROM batismo_inscricoes
--  WHERE status='realizado' AND data_batismo BETWEEN '2026-01-01' AND '2026-04-30';
-- Esperado: 52
-- ============================================================================
