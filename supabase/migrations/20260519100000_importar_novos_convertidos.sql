-- ============================================================================
-- Importacao de novos convertidos · planilha do Marcos (Out 2025 → Mai 2026)
--
-- 275 pessoas (nome + telefone + data da conversao) que tomaram decisao em
-- cultos entre 26/10/2025 e 17/05/2026. Sem CPF nem data de nascimento.
--
-- Por que NAO entram em cultos_decisoes_pessoas:
--   - Aquela tabela exige culto_id (FK NOT NULL) e nao temos como saber em
--     qual culto especifico (08:30/10:00/11:30/19:00) cada um decidiu. A
--     view vw_nsm_sem_dados ja exclui dados < 2026-05-18 (cutoff Marcos).
--
-- O que cria:
--   1. mem_membros (status='visitante', com nome + telefone)
--   2. mem_trilha_valores (etapa='conversao', concluida=true, data_conclusao)
--   3. nsm_eventos (valor_engajado='seguir', origem='importacao_planilha')
--
-- Idempotente: usa staging tmp + ON CONFLICT por (telefone_digits, primeiro_nome)
-- para nao duplicar caso a migration seja re-executada ou alguem ja esteja
-- cadastrado.
-- ============================================================================

BEGIN;

-- Staging temporaria com os dados da planilha
CREATE TEMP TABLE _import_converts (
  nome             text NOT NULL,
  telefone_fmt     text,
  telefone_digits  text,
  data_conversao   date NOT NULL,
  observacoes      text
) ON COMMIT DROP;

INSERT INTO _import_converts (nome, telefone_fmt, telefone_digits, data_conversao, observacoes) VALUES
('Gian Filipo', '(21) 96532-4803', '21965324803', DATE '2025-10-26', NULL),
('Monique Cardoso', '(21) 98225-2295', '21982252295', DATE '2025-10-26', NULL),
('Andréa Freitas', '(21) 99263-5155', '21992635155', DATE '2025-10-26', NULL),
('Daniele Bastos', '(21) 99901-1333', '21999011333', DATE '2025-10-26', NULL),
('Fernanda Drummond', '(21) 96652-4040', '21966524040', DATE '2025-10-26', NULL),
('Maria dos Anjos', '(21) 99353-6301', '21993536301', DATE '2025-10-26', NULL),
('Lis Queiroz', '(21) 96773-1012', '21967731012', DATE '2025-11-02', NULL),
('Thais Nobre Barros', '(21) 97035-5136', '21970355136', DATE '2025-11-02', NULL),
('Zulfo Epifanio P. Filho', '(21) 97592-2101', '21975922101', DATE '2025-11-02', NULL),
('Carolina Venter', '(21) 98135-4931', '21981354931', DATE '2025-11-02', NULL),
('Daniel', '(21) 97463-6176', '21974636176', DATE '2025-11-02', NULL),
('Leandro Silveira', '(21) 99774-0869', '21997740869', DATE '2025-11-02', NULL),
('Luis Alexandre', '(21) 96458-8881', '21964588881', DATE '2025-11-02', NULL),
('Cristiana Ribeiro', '(21) 98261-2915', '21982612915', DATE '2025-11-09', NULL),
('Luiza Rodrigues', '(21) 97502-1494', '21975021494', DATE '2025-11-09', NULL),
('Angela Marelli', '(21) 99925-1351', '21999251351', DATE '2025-11-09', NULL),
('Maria Laura F. de Mendonça', '(22) 99226-7777', '22992267777', DATE '2025-11-09', NULL),
('Naldo Sarinho', '(21) 99385-2270', '21993852270', DATE '2025-11-09', NULL),
('Débora Sarinho', '(21) 98727-5510', '21987275510', DATE '2025-11-09', NULL),
('Danielle', '(21) 97464-6723', '21974646723', DATE '2025-11-09', NULL),
('Jorge Mendes', '(21) 99651-8006', '21996518006', DATE '2025-11-09', NULL),
('Lara Giacomazzi', '(21) 99059-0996', '21990590996', DATE '2025-11-12', NULL),
('Rafaela Reis', '(21) 99971-8225', '21999718225', DATE '2025-11-12', NULL),
('Raphaela Pereira', '(21) 99716-4660', '21997164660', DATE '2025-11-16', NULL),
('Aniele', '(21) 99455-8977', '21994558977', DATE '2025-11-16', NULL),
('Valdeci Barbieri', '(21) 96992-3398', '21969923398', DATE '2025-11-16', NULL),
('Sergio Lara', '(21) 96432-1619', '21964321619', DATE '2025-11-16', NULL),
('Leandro Silveira', '(21) 99774-0869', '21997740869', DATE '2025-11-16', NULL),
('Silvia Regina Cordeiro', '(21) 96463-8534', '21964638534', DATE '2025-11-23', NULL),
('Bruno Fonseca', '(21) 99602-2177', '21996022177', DATE '2025-11-23', NULL),
('Letícia Almeida', '(21) 96961-5097', '21969615097', DATE '2025-11-23', NULL),
('Christiane Boechat', '(21) 99463-8170', '21994638170', DATE '2025-11-23', NULL),
('Thiago Carvalho', '(21) 99660-1112', '21996601112', DATE '2025-11-23', NULL),
('Luciano Maquinavita', '(21) 98108-9286', '21981089286', DATE '2025-11-23', NULL),
('Daniel de Oliveira Cunha', '(21) 97492-6306', '21974926306', DATE '2025-11-23', NULL),
('Julio Cesar Vieira', '(21) 92018-7053', '21920187053', DATE '2025-11-23', NULL),
('Bernardo Feitosa', '(21) 98240-3870', '21982403870', DATE '2025-11-23', NULL),
('Marcus Vinicius Duarte', '(21) 99466-6182', '21994666182', DATE '2025-11-23', NULL),
('Marcos', '(24) 99264-4193', '24992644193', DATE '2025-11-23', NULL),
('Letícia Castro', '(21) 98411-5631', '21984115631', DATE '2025-11-23', NULL),
('Carol Capra', '(21) 99322-4155', '21993224155', DATE '2025-11-26', NULL),
('Jasilmo Paulino da Silva', '(21) 95912-2974', '21959122974', DATE '2025-11-30', NULL),
('Shirlene Souza', '(21) 99873-2324', '21998732324', DATE '2025-11-30', NULL),
('Raphael Drumond Rebelo', '(21) 97991-0022', '21979910022', DATE '2025-12-07', NULL),
('Carolina Girão', '(21) 98195-2210', '21981952210', DATE '2025-12-07', NULL),
('Fernanda Cruz', '(21) 96413-0567', '21964130567', DATE '2025-12-07', NULL),
('Sandro Cruz', '(21) 96413-0565', '21964130565', DATE '2025-12-07', NULL),
('Filipe Leão', '(11) 99661-1276', '11996611276', DATE '2025-12-07', NULL),
('João Vitor Muniz', '(21) 96685-5335', '21966855335', DATE '2025-12-07', NULL),
('Charles Zucatti', '(11) 98841-4051', '11988414051', DATE '2025-12-07', NULL),
('Carla Fernandes', '(21) 97983-4442', '21979834442', DATE '2025-12-07', NULL),
('Alex Gomes', '(21) 97079-4843', '21970794843', DATE '2025-12-07', NULL),
('Rosane Souza', '(21) 98886-2798', '21988862798', DATE '2025-12-14', NULL),
('Felipe Corrêa', '(21) 98298-2405', '21982982405', DATE '2025-12-14', NULL),
('Nicolle Gemo', '(27) 99778-1086', '27997781086', DATE '2025-12-14', NULL),
('Rute Valani', '(27) 99698-0303', '27996980303', DATE '2025-12-14', NULL),
('Katia Regina Ribeiro', '(21) 99991-5151', '21999915151', DATE '2025-12-14', NULL),
('Mônica Viana de Souza', '(21) 98128-8620', '21981288620', DATE '2025-12-14', NULL),
('Anderson Carlos Souza', '(21) 98317-3633', '21983173633', DATE '2025-12-14', NULL),
('Flavia Ferretti', '(21) 98283-8144', '21982838144', DATE '2025-12-14', NULL),
('Marcela Borges', '(24) 98859-0787', '24988590787', DATE '2025-12-14', NULL),
('Wellington Borges', '(21) 99191-3719', '21991913719', DATE '2025-12-14', NULL),
('Marcia Pinho', '(21) 98162-0510', '21981620510', DATE '2025-12-21', NULL),
('Márcia Amaral', '(15) 99139-4084', '15991394084', DATE '2025-12-21', NULL),
('Rubem José da Silva', '(21) 98624-8745', '21986248745', DATE '2025-12-21', NULL),
('Juliano Safi', '(24) 98832-8843', '24988328843', DATE '2025-12-21', NULL),
('Rosangela R. dos Santos', '(21) 97046-6180', '21970466180', DATE '2025-12-21', NULL),
('Paulo Guerra', '(21) 97201-6948', '21972016948', DATE '2025-12-21', NULL),
('Eliana Martinho', '(21) 98364-4285', '21983644285', DATE '2025-12-21', NULL),
('Mateus Moraes', '(21) 97029-3961', '21970293961', DATE '2025-12-21', NULL),
('José Manuel', '(21) 98074-1011', '21980741011', DATE '2025-12-21', NULL),
('Fátima Carmella', '(21) 98514-8255', '21985148255', DATE '2025-12-21', NULL),
('Fabiana Rodrigues', '(21) 96446-4267', '21964464267', DATE '2025-12-21', NULL),
('Leandro Oliveira', '(21) 96424-8030', '21964248030', DATE '2025-12-21', NULL),
('Raphaela Dias', '(21) 96412-1521', '21964121521', DATE '2025-12-21', NULL),
('Viviane Bruno', '(21) 99407-6461', '21994076461', DATE '2025-12-21', NULL),
('Alice Mello', '(21) 98284-2212', '21982842212', DATE '2025-12-21', NULL),
('Shirley', '(21) 98123-3520', '21981233520', DATE '2025-12-21', NULL),
('Daniela Drago', '(21) 95101-5090', '21951015090', DATE '2025-12-21', NULL),
('Isis Petrungaro Pereira', '(21) 99703-2828', '21997032828', DATE '2025-12-21', NULL),
('Kandice Duarte Marchetti', '(21) 98228-0079', '21982280079', DATE '2025-12-21', NULL),
('Mariana Albano', '(21) 99361-2965', '21993612965', DATE '2025-12-21', NULL),
('Ericson Madeira da Costa', '(21) 97228-8001', '21972288001', DATE '2025-12-25', NULL),
('Davi D''Almeida', NULL, NULL, DATE '2025-12-25', '@dadalmeida50'),
('Cristiano Ramos', '(21) 98868-3912', '21988683912', DATE '2025-12-28', NULL),
('Diego Moura', '(21) 97039-0845', '21970390845', DATE '2025-12-28', NULL),
('Ruan R. Cardoso', NULL, NULL, DATE '2025-12-28', '@ruan.rocha021'),
('Antonio dos Reis Gomes', '(21) 99460-8629', '21994608629', DATE '2025-12-28', NULL),
('Fernanda Ramos Esteves', '(21) 98896-5159', '21988965159', DATE '2025-12-28', NULL),
('Georgina Scorza', '(21) 98268-0133', '21982680133', DATE '2025-12-28', NULL),
('Eunice Figueredo Corrêa', '(21) 98889-2218', '21988892218', DATE '2025-12-28', NULL),
('Fernanda Rainho', '(21) 96437-8858', '21964378858', DATE '2025-12-28', NULL),
('Emanuelle Barbosa', '(21) 98862-9318', '21988629318', DATE '2026-01-04', NULL),
('Darrien Aka', '(21) 98883-1442', '21988831442', DATE '2026-01-04', NULL),
('Cynthia Vieira', '(21) 99627-7223', '21996277223', DATE '2026-01-04', NULL),
('Julia Boura', '(21) 99643-1082', '21996431082', DATE '2026-01-04', NULL),
('Fernanda Monteiro', '(27) 99956-6030', '27999566030', DATE '2026-01-04', NULL),
('Carla Guse', '(21) 99800-7269', '21998007269', DATE '2026-01-04', NULL),
('Danniel Maher', '(21) 99851-1240', '21998511240', DATE '2026-01-04', NULL),
('Eduardo Fialho', '(21) 99190-6153', '21991906153', DATE '2026-01-04', NULL),
('Yuri Carvalho', '(21) 99956-1300', '21999561300', DATE '2026-01-04', NULL),
('Manoel Máximo Filho', '(21) 99598-6231', '21995986231', DATE '2026-01-04', NULL),
('Lauro Barillari', '(21) 96020-1415', '21960201415', DATE '2026-01-04', NULL),
('Ingrid Mello', '(21) 96919-4008', '21969194008', DATE '2026-01-04', NULL),
('Renata Fraga', '(21) 99383-6336', '21993836336', DATE '2026-01-04', NULL),
('Luciane Gama', '(21) 98162-8290', '21981628290', DATE '2026-01-04', NULL),
('Paula D. Duarte', '(21) 97922-7979', '21979227979', DATE '2026-01-04', NULL),
('Natasha Souza', '(21) 99989-3700', '21999893700', DATE '2026-01-04', NULL),
('Rafael', '(21) 98203-4573', '21982034573', DATE '2026-01-04', NULL),
('Tainá Berba', '(21) 96512-2713', '21965122713', DATE '2026-01-04', NULL),
('Kaique Soares', '(21) 99859-6748', '21998596748', DATE '2026-01-04', NULL),
('Tânia Costa', '(21) 98455-5221', '21984555221', DATE '2026-01-11', NULL),
('Miguel da Conceição', '(21) 97517-2788', '21975172788', DATE '2026-01-11', NULL),
('Lara Silva', '(21) 96855-1317', '21968551317', DATE '2026-01-11', NULL),
('Maria de Lourdes', '(21) 97165-0074', '21971650074', DATE '2026-01-11', NULL),
('Marcus Aurelius Oliveira', '(21) 99905-4725', '21999054725', DATE '2026-01-11', NULL),
('Sabrina Oliveira', '(21) 99845-8594', '21998458594', DATE '2026-01-11', NULL),
('Tatiane Macri', '(21) 99122-0869', '21991220869', DATE '2026-01-11', NULL),
('Andrea Lima', '(32) 3715-7985', '3237157985', DATE '2026-01-11', NULL),
('Miriam Beltrão', '(21) 97188-1767', '21971881767', DATE '2026-01-11', NULL),
('José Jenzo Silva', '(31) 99800-9292', '31998009292', DATE '2026-01-11', NULL),
('Roberta Brasil', '(21) 98360-9142', '21983609142', DATE '2026-01-11', NULL),
('Luiz Vieira', '(21) 99700-6947', '21997006947', DATE '2026-01-11', NULL),
('Erik Zabotininsky', '(21) 98445-7990', '21984457990', DATE '2026-01-14', NULL),
('Yuri Belem', '(21) 97980-6490', '21979806490', DATE '2026-01-14', NULL),
('Sidiane Pires', '(61) 9116-8906', '6191168906', DATE '2026-01-18', NULL),
('Wagner Saback', '(61) 9116-8906', '6191168906', DATE '2026-01-18', NULL),
('Laryssa Mendes', '(21) 96018-4818', '21960184818', DATE '2026-01-18', NULL),
('Maria José Cabral', '(21) 97102-8632', '21971028632', DATE '2026-01-18', NULL),
('Sonia Milk', '(21) 98424-0053', '21984240053', DATE '2026-01-18', NULL),
('Cristiane Azevedo', '(21) 99839-1969', '21998391969', DATE '2026-01-18', NULL),
('Camila Freiper', '(71) 99373-9057', '71993739057', DATE '2026-01-21', NULL),
('Bruno Queiroz', '(21) 99744-8571', '21997448571', DATE '2026-01-25', NULL),
('Ana Paula C. Figueiredo', '(21) 96475-4203', '21964754203', DATE '2026-01-25', NULL),
('Ana Maria', '(21) 97006-3594', '21970063594', DATE '2026-01-25', NULL),
('Vivian Peduzzi', '(21) 98444-2006', '21984442006', DATE '2026-01-25', NULL),
('Luigi Favraud', '(21) 98195-6484', '21981956484', DATE '2026-01-25', NULL),
('Dulce Maria', '(21) 98216-4989', '21982164989', DATE '2026-01-25', NULL),
('Bruno Machado', '(21) 99838-1058', '21998381058', DATE '2026-01-25', NULL),
('Nicole Bonder', '(11) 99311-8008', '11993118008', DATE '2026-01-25', NULL),
('Karla', '(21) 99144-1949', '21991441949', DATE '2026-01-28', NULL),
('Antônio José de Oliveira', '(21) 99769-7610', '21997697610', DATE '2026-01-28', NULL),
('Victor Nantes Baldez', '(21) 97187-1523', '21971871523', DATE '2026-02-01', NULL),
('André Teixeira', '(21) 99837-0315', '21998370315', DATE '2026-02-01', NULL),
('Omyra Gomes de Freitas', '(24) 99209-1627', '24992091627', DATE '2026-02-01', NULL),
('Rosangela de Souza Coelho', '(21) 99333-1549', '21993331549', DATE '2026-02-01', NULL),
('José Jorge Silva', '(31) 99800-9292', '31998009292', DATE '2026-02-01', NULL),
('Paulo César Mello', '(21) 98101-0154', '21981010154', DATE '2026-02-01', NULL),
('Giulia Rodrigues Macharett', '(21) 99956-1002', '21999561002', DATE '2026-02-01', NULL),
('Julia Vasconcellos', '(21) 99525-5354', '21995255354', DATE '2026-02-08', NULL),
('Erick Telez Gomes', '(21) 97254-4331', '21972544331', DATE '2026-02-08', NULL),
('Miguel de B. Contreiras', '(21) 96559-1389', '21965591389', DATE '2026-02-08', NULL),
('Caio e Tainá', '(21) 99770-2173', '21997702173', DATE '2026-02-08', NULL),
('Eduardo Palhares', '(21) 98164-1079', '21981641079', DATE '2026-02-08', NULL),
('Cláudia Jeane Oliveira', '(21) 97539-3979', '21975393979', DATE '2026-02-08', NULL),
('Celso Castro', '(19) 99283-5192', '19992835192', DATE '2026-02-18', NULL),
('Adriam Freitas Ribeiro', '(41) 99669-7993', '41996697993', DATE '2026-02-18', NULL),
('Ana Clara Cardoso', '(21) 97913-7739', '21979137739', DATE '2026-02-18', NULL),
('Anirya Mello', '(21) 99828-4241', '21998284241', DATE '2026-02-18', NULL),
('Eliane S. Fonseca', '(21) 98169-0741', '21981690741', DATE '2026-02-18', NULL),
('Gustavo Arruda', '(21) 97127-6828', '21971276828', DATE '2026-02-18', NULL),
('Thiago Ribeiro Lucas', '(21) 99935-0237', '21999350237', DATE '2026-02-18', NULL),
('Enzo B. Langa', '(31) 97148-3226', '31971483226', DATE '2026-02-18', NULL),
('Henrique Ariodante', '(21) 96904-6593', '21969046593', DATE '2026-02-22', NULL),
('Michele Ariodante', '(21) 99799-2395', '21997992395', DATE '2026-02-22', NULL),
('Franciane da Silva Alves', '(21) 99174-6982', '21991746982', DATE '2026-02-22', NULL),
('Robson Mendonça', '(21) 96844-0231', '21968440231', DATE '2026-02-22', NULL),
('Carlos Magno Coelho', '(21) 99975-8719', '21999758719', DATE '2026-02-22', NULL),
('Marta', '(21) 99160-4841', '21991604841', DATE '2026-02-22', NULL),
('Carla Faedo', '(21) 98695-9586', '21986959586', DATE '2026-02-22', NULL),
('Lara Roberta de Sá Rego', '(21) 98279-0746', '21982790746', DATE '2026-02-22', NULL),
('Natália Furlanetto', '(19) 97108-0083', '19971080083', DATE '2026-02-22', NULL),
('Fabio Barcellos', '(21) 99178-8689', '21991788689', DATE '2026-03-01', NULL),
('Vítor Medeiros', '(11) 96350-2303', '11963502303', DATE '2026-03-01', NULL),
('Marina Contin', '(19) 99957-6615', '19999576615', DATE '2026-03-01', NULL),
('Marcelo Ottoni de Carvalho', '(21) 96482-7434', '21964827434', DATE '2026-03-01', NULL),
('Maria Vitória Borges', '(21) 96677-7862', '21966777862', DATE '2026-03-01', NULL),
('Caroline Duarte', '(21) 98847-8578', '21988478578', DATE '2026-03-01', NULL),
('Gabriel Queiroz Vaga', '(21) 99350-6543', '21993506543', DATE '2026-03-01', NULL),
('Alessandro Peloso', '(21) 99092-6565', '21990926565', DATE '2026-03-01', NULL),
('Maria Islem', '(21) 97721-9009', '21977219009', DATE '2026-03-01', NULL),
('Tito Faedo Miranda', '(21) 98695-9586', '21986959586', DATE '2026-03-01', NULL),
('Felipe Medeiros', '(21) 97014-1470', '21970141470', DATE '2026-03-01', NULL),
('Pietro dos Santos Barbosa', '(21) 99371-0460', '21993710460', DATE '2026-03-01', NULL),
('Maria Luiza', '(21) 97921-6462', '21979216462', DATE '2026-03-01', NULL),
('Elton Araujo C. Regis', '(21) 95933-5666', '21959335666', DATE '2026-03-08', NULL),
('Glacy Kelly Bisaggio', '(21) 98887-9186', '21988879186', DATE '2026-03-15', NULL),
('Bráulio Fagundes', '(21) 99617-2130', '21996172130', DATE '2026-03-15', NULL),
('João Ulter', '(21) 97977-6644', '21979776644', DATE '2026-03-15', NULL),
('Priscila Montello', '(21) 96673-7244', '21966737244', DATE '2026-03-15', NULL),
('Fernando Montalvão', '(21) 96990-3313', '21969903313', DATE '2026-03-15', NULL),
('Fernanda', '(21) 98167-2332', '21981672332', DATE '2026-03-15', NULL),
('Danielle Contrucci', '(21) 99993-4793', '21999934793', DATE '2026-03-15', NULL),
('Gisele Ozom', '(21) 98293-4286', '21982934286', DATE '2026-03-15', NULL),
('Amanda Gouvêa', '(21) 96565-0634', '21965650634', DATE '2026-03-15', NULL),
('Kátia Dantas', '(21) 99069-6871', '21990696871', DATE '2026-03-15', NULL),
('Elizabeth Rosa', '(21) 99771-1643', '21997711643', DATE '2026-03-15', NULL),
('Pedro Moreira Gonçalez', '(21) 97007-9969', '21970079969', DATE '2026-03-15', NULL),
('Enio Gouveia Saback', '(21) 99790-8168', '21997908168', DATE '2026-03-23', NULL),
('Gabriel Torres', '(21) 96741-5406', '21967415406', DATE '2026-03-23', NULL),
('Julia Loja', '(21) 98109-9992', '21981099992', DATE '2026-03-23', NULL),
('Helio Muniz Cardoso', '(21) 98849-1193', '21988491193', DATE '2026-03-23', NULL),
('Jaqueline Farias', '(21) 98693-2054', '21986932054', DATE '2026-03-23', NULL),
('Rodrigo Miranda', '(21) 97234-9320', '21972349320', DATE '2026-03-23', NULL),
('Bianca Guimarães', '(21) 98323-3797', '21983233797', DATE '2026-03-23', NULL),
('Anderson Luciano', '(21) 96898-6183', '21968986183', DATE '2026-03-23', NULL),
('Marcia Siller', '(21) 99760-3076', '21997603076', DATE '2026-03-23', NULL),
('Carolina Marie Vieira', '(21) 98261-5418', '21982615418', DATE '2026-03-29', NULL),
('Ricardo Barreira', '(21) 97555-7287', '21975557287', DATE '2026-03-29', NULL),
('Gonzalo Caldas', '(21) 99747-0707', '21997470707', DATE '2026-03-29', NULL),
('Mauro Cesar Ramos Nunes', '(21) 96478-3044', '21964783044', DATE '2026-03-29', NULL),
('Célia Maria de Assis', '(31) 99953-1655', '31999531655', DATE '2026-03-29', NULL),
('Alberto de Souza Magalhães', '(21) 98767-2877', '21987672877', DATE '2026-03-29', NULL),
('Rafael Calderaro', '(21) 97228-1710', '21972281710', DATE '2026-03-29', NULL),
('Suely Calderaro', '(21) 99981-1956', '21999811956', DATE '2026-03-29', NULL),
('Calebe Mota de Araujo Lopes', '(21) 99322-4581', '21993224581', DATE '2026-03-29', NULL),
('Juliana Alzuguir', '(21) 99641-3833', '21996413833', DATE '2026-03-29', NULL),
('Luciana Carvalho', '(21) 99662-0605', '21996620605', DATE '2026-03-29', NULL),
('Maria Paula Neves', '(21) 97563-4114', '21975634114', DATE '2026-03-29', NULL),
('Elaine Lucena', '(21) 97291-0522', '21972910522', DATE '2026-04-05', NULL),
('Vanusa Medeiros', '(21) 97962-4776', '21979624776', DATE '2026-04-05', NULL),
('Eleonora Lyra Gonçalves', '(21) 97293-4550', '21972934550', DATE '2026-04-05', NULL),
('Maria Luiza de Freitas', '(21) 98222-2832', '21982222832', DATE '2026-04-05', NULL),
('Andre Monteiro', '(32) 98810-2024', '32988102024', DATE '2026-04-05', NULL),
('Juliana Torres Moreira', '(21) 99740-1817', '21997401817', DATE '2026-04-05', NULL),
('Matheus Vicente', '(21) 99472-0820', '21994720820', DATE '2026-04-05', NULL),
('Ana Paula H. de Araujo', '(21) 99137-8891', '21991378891', DATE '2026-04-05', NULL),
('Djalma Mello', '(21) 97414-5376', '21974145376', DATE '2026-04-05', NULL),
('Lucas Saddy', '(21) 99564-0677', '21995640677', DATE '2026-04-05', NULL),
('Gardênia', '(21) 96709-6580', '21967096580', DATE '2026-04-05', NULL),
('Solano Castro C. Pinto', '(21) 99655-7316', '21996557316', DATE '2026-04-05', NULL),
('Flávia Mesquita', '(21) 98461-5678', '21984615678', DATE '2026-04-05', NULL),
('Jane Carvalho', '(21) 98619-5017', '21986195017', DATE '2026-04-05', NULL),
('Patrick Machado', '(21) 97011-7254', '21970117254', DATE '2026-04-12', NULL),
('Roberta Grassano', '(21) 99619-7744', '21996197744', DATE '2026-04-12', NULL),
('Alexandre Lemos', '(21) 99380-9226', '21993809226', DATE '2026-04-12', NULL),
('Caio Penoni', '(21) 98898-3615', '21988983615', DATE '2026-04-12', NULL),
('Jeremias Voazem', '(21) 98782-8851', '21987828851', DATE '2026-04-12', NULL),
('Carlos Cleber A. Barbosa', '(61) 98619-2881', '61986192881', DATE '2026-04-12', NULL),
('Júlia Sarruf', '(21) 97551-6005', '21975516005', DATE '2026-04-12', NULL),
('Patrícia Costa', '(21) 96875-3064', '21968753064', DATE '2026-04-12', NULL),
('Andre Monteiro', '(32) 98810-2025', '32988102025', DATE '2026-04-05', NULL),
('Carlos Cleber A. Barbosa', '(61) 98619-2882', '61986192882', DATE '2026-04-12', NULL),
('Júlia Sarruf', '(21) 96199-0123', '21961990123', DATE '2026-04-12', NULL),
('Patrícia Costa', '(21) 95522-7182', '21955227182', DATE '2026-04-12', NULL),
('Gilberto Carvalho Pereira', '(21) 99988-7411', '21999887411', DATE '2026-05-03', NULL),
('Renato', '(21) 98814-8910', '21988148910', DATE '2026-05-03', NULL),
('Ana Beatriz Martins', '(21) 97992-9369', '21979929369', DATE '2026-05-03', NULL),
('Luana Martins', '(21) 97610-4192', '21976104192', DATE '2026-05-03', NULL),
('Matheus Costa', '(21) 98633-5733', '21986335733', DATE '2026-05-03', NULL),
('Luiz Carlos', '(11) 97126-5050', '11971265050', DATE '2026-05-03', NULL),
('Jecia Fidelis', '(21) 98645-4276', '21986454276', DATE '2026-05-03', NULL),
('Lucas Marçal', '(21) 97363-9040', '21973639040', DATE '2026-05-03', NULL),
('Helio Souza', '(19) 99239-5670', '19992395670', DATE '2026-05-03', NULL),
('Alessandra', '(21) 99763-1894', '21997631894', DATE '2026-05-03', NULL),
('Marcelo Dias', '(21) 99674-0024', '21996740024', DATE '2026-05-03', NULL),
('Maria Cristina da Silva', '(21) 99609-9376', '21996099376', DATE '2026-05-03', NULL),
('Lucas Abreu', '(21) 97114-9723', '21971149723', DATE '2026-05-10', NULL),
('Orestes Junior', '(21) 96687-6687', '21966876687', DATE '2026-05-10', NULL),
('Junior José', '(21) 96646-7534', '21966467534', DATE '2026-05-10', NULL),
('Maria Júlia Gomes', '(21) 99249-1435', '21992491435', DATE '2026-05-10', NULL),
('Ana Carolina Pires', '(21) 97573-0353', '21975730353', DATE '2026-05-10', NULL),
('Nielson Abreu', '(21) 98450-1015', '21984501015', DATE '2026-05-10', NULL),
('Ricardo Marconi Ferreira', '(21) 96413-1266', '21964131266', DATE '2026-05-10', NULL),
('Felipe', '(21) 98778-2793', '21987782793', DATE '2026-05-10', NULL),
('Valdnei Ferreira', '(21) 96563-1601', '21965631601', DATE '2026-05-10', NULL),
('Bruno Rollin', '(21) 99797-8023', '21997978023', DATE '2026-05-17', NULL),
('Thaisse Mendes', '(21) 97930-3333', '21979303333', DATE '2026-05-17', NULL),
('Denise Neves', '(21) 98155-9190', '21981559190', DATE '2026-05-17', NULL),
('Renata Ribeiro', '(21) 96580-3200', '21965803200', DATE '2026-05-17', NULL),
('Guilherme Curi', '(21) 97607-2237', '21976072237', DATE '2026-05-17', NULL),
('Marcelo Brandão', '(21) 96602-2211', '21966022211', DATE '2026-05-17', NULL),
('Danniele Lima', '(21) 97112-7228', '21971127228', DATE '2026-05-17', NULL),
('Luana Roizewblit', '(21) 99684-3010', '21996843010', DATE '2026-05-17', NULL),
('Rebeca Castelo', '(21) 99834-8236', '21998348236', DATE '2026-05-17', NULL);

-- 1) mem_membros · so insere quem ainda nao existe (match por primeiro nome + telefone)
WITH alvos AS (
  SELECT i.*,
         lower(split_part(trim(i.nome), ' ', 1)) AS primeiro_nome
    FROM _import_converts i
),
ja_existem AS (
  SELECT DISTINCT m.id AS membro_id, a.primeiro_nome, a.telefone_digits, a.data_conversao, a.nome
    FROM alvos a
    JOIN public.mem_membros m
      ON m.active = true
     AND a.telefone_digits IS NOT NULL
     AND regexp_replace(coalesce(m.telefone,''), '\D', '', 'g') = a.telefone_digits
     AND lower(split_part(trim(m.nome), ' ', 1)) = a.primeiro_nome
),
novos AS (
  INSERT INTO public.mem_membros (nome, telefone, status, observacoes, active)
  SELECT a.nome, a.telefone_fmt, 'visitante',
         coalesce(a.observacoes || ' · ', '') || 'Convertido(a) em ' || to_char(a.data_conversao, 'DD/MM/YYYY') || ' · importacao planilha',
         true
    FROM alvos a
   WHERE NOT EXISTS (
     SELECT 1 FROM ja_existem je
      WHERE je.primeiro_nome = a.primeiro_nome
        AND je.telefone_digits = a.telefone_digits
   )
  RETURNING id, nome, telefone
),
mapa AS (
  SELECT n.id AS membro_id, a.primeiro_nome, a.telefone_digits, a.data_conversao, a.nome
    FROM novos n
    JOIN alvos a
      ON lower(split_part(trim(n.nome), ' ', 1)) = a.primeiro_nome
     AND regexp_replace(coalesce(n.telefone,''), '\D', '', 'g') = coalesce(a.telefone_digits, '')
),
todos_membros AS (
  SELECT * FROM ja_existem
  UNION ALL
  SELECT * FROM mapa
),
-- 2) Trilha de conversao · idempotente (so cria se nao existe etapa 'conversao')
trilhas_inseridas AS (
  INSERT INTO public.mem_trilha_valores (membro_id, etapa, concluida, data_conclusao, observacoes)
  SELECT tm.membro_id, 'conversao', true, tm.data_conversao,
         'Importacao planilha · novos convertidos'
    FROM todos_membros tm
   WHERE NOT EXISTS (
     SELECT 1 FROM public.mem_trilha_valores t
      WHERE t.membro_id = tm.membro_id AND t.etapa = 'conversao'
   )
  RETURNING membro_id
)
-- 3) NSM evento de seguir · idempotente (origem='importacao_planilha', dedup por membro_id)
INSERT INTO public.nsm_eventos (
  membro_id, nome, data_decisao, valor_engajado, data_engajamento, origem, observacao
)
SELECT tm.membro_id, tm.nome, tm.data_conversao, 'seguir', tm.data_conversao,
       'importacao_planilha', 'Importacao planilha Marcos · novos convertidos'
  FROM todos_membros tm
 WHERE NOT EXISTS (
   SELECT 1 FROM public.nsm_eventos e
    WHERE e.membro_id = tm.membro_id
      AND e.valor_engajado = 'seguir'
 )
ON CONFLICT DO NOTHING;

-- Refresh do agregado NSM (recalcula segmentos)
DO $$ BEGIN
  PERFORM public.recalcular_nsm();
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'recalcular_nsm() nao existe nesta base · pulando';
END $$;

COMMIT;
