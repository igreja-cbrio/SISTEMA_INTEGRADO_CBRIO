-- ============================================================================
-- REPARO · decisões de fé do Kids vindas da planilha CONVERSOES_CBKIDS 2026
-- APLICADO EM PRODUÇÃO em 02/09/2026. Pré-requisito: a migration
-- 20260902142943_kids_conversoes_import_fila_e_views.sql
--
-- ⚠️⚠️ `statement_timeout`: operação em lote sobre `cultos` custa 1–2,5 s POR
-- LINHA (dois triggers ROW de KPI/NSM). Rodar com folga:
--     SET statement_timeout = '10min';   -- statement SEPARADO, antes do DO
-- (na aplicação real o cliente estourou o timeout e o servidor COMMITOU —
-- timeout de cliente não é prova de que nada aconteceu.)
--
-- RÉGUA (deliberada em conselho · 4 lentes · 02/09):
--   faixa A = candidato ÚNICO + >=1 corroborador INDEPENDENTE
--             (check-in na data · idade exata · telefone do responsável)
--   faixa B = ambiguidade/contradição -> fila humana, NÃO grava
--   idade é VETO, nunca confirmador. Idade ausente NUNCA conta como compatível.
--   nada de Dice / nomesPodemSerMesmaPessoa como critério de ESCRITA.
-- Resultado medido: 58 gravadas · 8 na fila · 0 sem cadastro (fecha 66).
--
-- ROLLBACK:
--   update kids_criancas k set data_conversao = b.data_conversao_antes
--     from kids_conversoes_import b
--    where k.id = b.crianca_id and b.lote = 'planilha_cbkids_2026';
--   update kids_checkins set fez_decisao_jesus = false, decisao_jesus_em = null
--    where id in (<os 27 · ver decisao_jesus_em na data do culto>);
--   update cultos_decisoes_pessoas set deleted_at = now()
--    where fonte = 'importacao_planilha_kids';
--   -- ⚠️ o agregado `cultos.decisoes_kids` NÃO volta sozinho: ele foi elevado
--   -- com greatest(). Recalcular a partir de kids_checkins se precisar.
-- ============================================================================

SET statement_timeout = '10min';

-- ----------------------------------------------------------------------------
-- PARTE 1 · as 66 linhas da planilha entram na fila
-- ----------------------------------------------------------------------------
INSERT INTO public.kids_conversoes_import
  (lote, linha, nome_planilha, nome_norm_planilha, nome_base_pin, idade_planilha,
   tel_planilha, data_decisao, periodo, culto_txt, obs_planilha, faixa, motivo)
SELECT 'planilha_cbkids_2026', v.* FROM (VALUES
(4,'Valentina Costa','valentina costa',null,5,null,DATE '2026-01-04','noite','domingo N','visitante','A','nome_exato'),
(5,'Mariana Melo','mariana melo',null,4,'21999014066',DATE '2026-01-04','noite','domingo N','visitante','A','nome_exato'),
(6,'Liz de Oliveira','liz de oliveira',null,6,'21984980852',DATE '2026-01-14',null,'quarta',null,'A','nome_exato'),
(7,'Alice Moreira','alice moreira',null,5,'21997469903',DATE '2026-01-14',null,'quarta',null,'A','nome_exato'),
(8,'Benjamim Moreira Diniz','benjamim moreira diniz',null,6,'21964242499',DATE '2026-01-28',null,'quarta',null,'A','nome_exato'),
(9,'João Guilherme Lisboa Patricio','joao guilherme lisboa patricio',null,5,'21996108555',DATE '2026-01-28',null,'quarta',null,'A','nome_exato'),
(10,'Laura Dantas Moreira','laura dantas moreira',null,5,'21981238749',DATE '2026-02-04',null,'quarta',null,'A','nome_exato'),
(11,'Isabella Batista','isabella batista',null,null,null,DATE '2026-03-01','manha','domingo M','visitante','B','grafia_e_ficha_inativa_14anos'),
(12,'Gabriel Ferreira','gabriel ferreira',null,null,null,DATE '2026-03-01','manha','domingo M','visitante','B','sem_corroborador'),
(13,'Chloe Brucieri','chloe brucieri',null,11,null,DATE '2026-03-01','manha','domingo M',null,'A','nome_exato'),
(14,'Pedro Theodoro Litwinczuk','pedro theodoro litwinczuk',null,4,null,DATE '2026-03-04',null,'quarta',null,'A','nome_exato'),
(15,'Malu Pinheiro Mendes','malu pinheiro mendes',null,3,'21979148055',DATE '2026-03-11',null,'quarta',null,'A','nome_exato'),
(16,'Ana Júlia Albuquerque','ana julia albuquerque',null,4,'21972840312',DATE '2026-03-11',null,'quarta',null,'B','grafia_alburquerque'),
(17,'Jean Kunzel','jean kunzel',null,7,null,DATE '2026-03-15','manha','domingo M',null,'A','nome_exato'),
(18,'Vicente de souza','vicente de souza',null,4,'21981490779',DATE '2026-03-25',null,'quarta',null,'B','tel_contradiz'),
(19,'Gael Vanzella','gael vanzella',null,5,null,DATE '2026-04-01',null,'quarta','Culto de Páscoa','A','nome_exato'),
(20,'Abelardo Depado','abelardo depado',null,7,null,DATE '2026-04-01',null,'quarta','Culto de Páscoa','B','espaco_de_pado'),
(21,'Pietro Dias Cândido','pietro dias candido',null,null,null,DATE '2026-04-01',null,'quarta','Culto de Páscoa','B','duplicata_2_fichas_inativas'),
(22,'Lucca Reinoso','lucca reinoso',null,6,'21975246525',DATE '2026-04-15',null,'quarta',null,'A','nome_exato'),
(23,'Valter Aguillar','valter aguillar','valter aguillar magalhaes neto',7,'21998545154',DATE '2026-04-19','manha','domingo M',null,'A','nome_abreviado'),
(24,'Lara Brito','lara brito',null,8,'21987940339',DATE '2026-04-19','manha','domingo M',null,'A','nome_exato'),
(25,'Maria Eduarda Santos','maria eduarda santos',null,8,'21988259744',DATE '2026-04-22',null,'quarta',null,'A','nome_exato'),
(26,'Noah Ariodante','noah ariodante',null,5,'21971277169',DATE '2026-04-22',null,'quarta',null,'A','nome_exato'),
(27,'Téo de Oliveira Feitosa','teo de oliveira feitosa','Téo Lamanna de Oliveira Feitosa',7,'21969170900',DATE '2026-05-03','manha','domingo M',null,'A','nome_abreviado'),
(28,'Antonella de Almeida','antonella de almeida',null,7,'21998548904',DATE '2026-05-10','manha','domingo M',null,'A','nome_exato'),
(29,'Manuela Nogueira Saraiva','manuela nogueira saraiva',null,8,'21988749376',DATE '2026-05-10','manha','domingo M',null,'A','nome_exato'),
(30,'Romeu Reis','romeu reis',null,8,null,DATE '2026-05-10','manha','domingo M',null,'A','nome_exato'),
(31,'Mariah Martins Bandeira','mariah martins bandeira',null,6,'21969170900',DATE '2026-05-10','manha','domingo M',null,'A','nome_exato'),
(32,'Aiden Markovich','aiden markovich',null,null,null,DATE '2026-05-10','manha','domingo M','visitante','B','sem_corroborador'),
(33,'Valentin Mironti Vitelli','valentin mironti vitelli',null,4,null,DATE '2026-05-10','manha','domingo M',null,'A','nome_exato'),
(34,'Nicolas Mattos da Silva','nicolas mattos da silva',null,4,'21981135597',DATE '2026-05-10','manha','domingo M',null,'A','nome_exato'),
(35,'Eva Zuri Batista','eva zuri batista',null,4,'21992671078',DATE '2026-05-13',null,'quarta',null,'A','nome_exato'),
(36,'Betthina Stumbo','betthina stumbo',null,7,'21972221003',DATE '2026-05-24','manha','domingo M',null,'A','nome_exato'),
(37,'Bella Knak','bella knak',null,6,'21999441562',DATE '2026-05-27',null,'quarta',null,'A','nome_exato'),
(38,'Antony Cardoso Albuquerque','antony cardoso albuquerque',null,6,'21975273669',DATE '2026-05-27',null,'quarta',null,'A','nome_exato'),
(39,'Luiza Cabral do Nascimento','luiza cabral do nascimento',null,4,'21997420888',DATE '2026-05-27',null,'quarta',null,'A','nome_exato'),
(40,'Manuella Quintanilha','manuella quintanilha',null,7,'21983758300',DATE '2026-06-07','manha','domingo M',null,'A','nome_exato'),
(41,'Ravi Carneiro','ravi carneiro',null,4,'21969767999',DATE '2026-07-01',null,'quarta',null,'A','nome_exato'),
(42,'Lara Eufrasio','lara eufrasio',null,null,null,DATE '2026-07-26','manha','domingo M',null,'A','nome_exato'),
(43,'Maitê Correa','maite correa',null,null,null,DATE '2026-07-26','manha','domingo M',null,'A','nome_exato'),
(44,'Bento Bonomo','bento bonomo',null,null,null,DATE '2026-07-26','manha','domingo M',null,'A','nome_exato'),
(45,'Catarina Boing','catarina boing',null,6,null,DATE '2026-07-29',null,'quarta',null,'A','nome_exato'),
(46,'Miguel Duarte Pimentel','miguel duarte pimentel',null,7,null,DATE '2026-08-02','manha','domingo M',null,'A','nome_exato'),
(47,'Giuliana Gouvea','giuliana gouvea',null,8,null,DATE '2026-08-02','manha','domingo M',null,'A','nome_exato'),
(48,'Ravi Bahia','ravi bahia',null,4,null,DATE '2026-08-02','manha','domingo M',null,'A','nome_exato'),
(49,'Otto Lambone','otto lambone',null,5,null,DATE '2026-08-05',null,'quarta',null,'A','nome_exato'),
(50,'Olivia dos Santos','olivia dos santos',null,8,null,DATE '2026-08-19',null,'quarta',null,'A','nome_exato'),
(51,'Rute Jerônimo Vasques','rute jeronimo vasques','Rute Jerônimo Vasques da Silva',8,null,DATE '2026-08-19',null,'quarta',null,'A','nome_abreviado'),
(52,'Kayra Sanches Varão','kayra sanches varao','Kayra Xavier Sanches Varão',8,null,DATE '2026-08-19',null,'quarta',null,'A','nome_abreviado'),
(53,'Heitor Santos','heitor santos',null,6,null,DATE '2026-08-26',null,'quarta',null,'A','nome_exato'),
(54,'Enzo Roenick Guenka','enzo roenick guenka',null,10,null,DATE '2026-08-30','manha','domingo M',null,'A','nome_exato'),
(55,'Leonardo Halley','leonardo halley',null,9,null,DATE '2026-08-30','manha','domingo M',null,'A','nome_exato'),
(56,'Davi Caetano','davi caetano',null,7,null,DATE '2026-08-30','manha','domingo M',null,'A','nome_exato'),
(57,'Matheus Silva de Abreu','matheus silva de abreu',null,9,null,DATE '2026-08-30','manha','domingo M',null,'A','nome_exato'),
(58,'Valentina Silva Tadeu','valentina silva tadeu',null,6,null,DATE '2026-08-30','manha','domingo M',null,'A','nome_exato'),
(59,'Cecília Farias','cecilia farias',null,7,null,DATE '2026-08-30','manha','domingo M',null,'A','nome_exato'),
(60,'Benício da Mata Ribeiro','benicio da mata ribeiro',null,5,null,DATE '2026-08-30','manha','domingo M',null,'A','nome_exato'),
(61,'Josué Câmara','josue camara',null,5,null,DATE '2026-08-30','manha','domingo M',null,'A','nome_exato'),
(62,'Gabriel Batista','gabriel batista',null,4,null,DATE '2026-08-30','manha','domingo M',null,'A','nome_exato'),
(63,'Antonella Miranda Muniz','antonella miranda muniz',null,4,null,DATE '2026-08-30','manha','domingo M',null,'A','nome_exato'),
(64,'Esther Cunha','esther cunha',null,null,null,DATE '2026-08-30','manha','domingo M',null,'A','nome_exato'),
(65,'Manuella Luciano Silva','manuella luciano silva',null,5,null,DATE '2026-08-30','manha','domingo M',null,'A','nome_exato'),
(66,'Davi Vener Rangel','davi vener rangel',null,6,null,DATE '2026-08-30','manha','domingo M',null,'A','nome_exato'),
(67,'Bento Seibel','bento seibel',null,6,null,DATE '2026-08-30','manha','domingo M',null,'A','nome_exato'),
(68,'Bernardo Martins','bernardo martins',null,5,null,DATE '2026-08-30','manha','domingo M',null,'B','nome_colide_2_fichas'),
(69,'Bento Menezes','bento menezes',null,5,null,DATE '2026-08-30','manha','domingo M',null,'A','nome_exato')) AS v(linha, nome_planilha, nome_norm_planilha, nome_base_pin, idade_planilha,
       tel_planilha, data_decisao, periodo, culto_txt, obs_planilha, faixa, motivo)
ON CONFLICT (lote, linha) DO NOTHING;

-- ----------------------------------------------------------------------------
-- PARTE 2 · resolve a CRIANÇA (só faixa A)
-- ⚠️ `kids_criancas.nome_norm` é coluna GERADA = lower(f_unaccent(nome)), SEM
-- trim e SEM colapsar espaço interno. Comparar sem normalizar os dois lados
-- erra em silêncio (foi o que fez "Abelardo De pado" não casar).
-- ----------------------------------------------------------------------------
UPDATE public.kids_conversoes_import b
   SET crianca_id = k.id, updated_at = now()
  FROM public.kids_criancas k
 WHERE b.lote = 'planilha_cbkids_2026' AND b.faixa = 'A' AND b.crianca_id IS NULL
   AND k.deleted_at IS NULL AND k.ativo
   AND regexp_replace(btrim(k.nome_norm), '\s+', ' ', 'g')
       = coalesce(lower(public.f_unaccent(regexp_replace(btrim(b.nome_base_pin), '\s+', ' ', 'g'))),
                  b.nome_norm_planilha);

-- ----------------------------------------------------------------------------
-- PARTE 3 · resolve o CULTO · (a) check-in da criança na data, (b) turno único, (c) NULL
-- ⚠️ Domingo manhã tem 2 a 3 cultos candidatos -> NULL de propósito.
-- ----------------------------------------------------------------------------
UPDATE public.kids_conversoes_import b
   SET culto_id = x.culto_id, culto_origem = 'checkin', updated_at = now()
  FROM (SELECT b2.id AS bid, (array_agg(DISTINCT s.culto_id))[1] AS culto_id
          FROM public.kids_conversoes_import b2
          JOIN public.kids_checkins ck ON ck.crianca_id = b2.crianca_id AND ck.deleted_at IS NULL
          JOIN public.kids_sessoes  s  ON s.id = ck.sessao_id AND s.deleted_at IS NULL
          JOIN public.cultos        cu ON cu.id = s.culto_id
         WHERE b2.lote = 'planilha_cbkids_2026' AND b2.crianca_id IS NOT NULL
           AND cu.data = b2.data_decisao
         GROUP BY b2.id HAVING count(DISTINCT s.culto_id) = 1) x
 WHERE b.id = x.bid AND b.culto_id IS NULL;

UPDATE public.kids_conversoes_import b
   SET culto_id = x.culto_id, culto_origem = 'turno_unico', updated_at = now()
  FROM (SELECT b2.id AS bid, (array_agg(cu.id))[1] AS culto_id
          FROM public.kids_conversoes_import b2
          JOIN public.cultos cu ON cu.data = b2.data_decisao
          LEFT JOIN public.vol_service_types st ON st.id = cu.service_type_id
         WHERE b2.lote = 'planilha_cbkids_2026' AND b2.culto_id IS NULL
           AND ( b2.periodo IS NULL
                 OR (b2.periodo = 'manha' AND coalesce(cu.hora, st.recurrence_time) <  TIME '12:00')
                 OR (b2.periodo = 'noite' AND coalesce(cu.hora, st.recurrence_time) >= TIME '12:00') )
         GROUP BY b2.id HAVING count(*) = 1) x
 WHERE b.id = x.bid AND b.culto_id IS NULL;

UPDATE public.kids_conversoes_import
   SET culto_origem = 'nao_resolvido', updated_at = now()
 WHERE lote = 'planilha_cbkids_2026' AND culto_id IS NULL AND culto_origem IS NULL;

-- PARTE 4 · BACKUP do valor anterior de data_conversao (é o undo)
UPDATE public.kids_conversoes_import b
   SET data_conversao_antes = k.data_conversao, updated_at = now()
  FROM public.kids_criancas k
 WHERE b.lote = 'planilha_cbkids_2026' AND k.id = b.crianca_id;

-- ----------------------------------------------------------------------------
-- PARTE 5 · as escritas, num bloco atômico com invariantes que ABORTAM
-- (o corpo aplicado em produção está descrito aqui; ver o CLAUDE.md da leva)
-- ----------------------------------------------------------------------------
-- 5.1 registro nominal das 58 (INSERT direto, com fonte e decidiu_em sob controle)
--     ⚠️ NÃO deixar o trigger criar: ele nasceria fonte='manual' (proveniência
--     lavada) e decidiu_em NULO (data errada nas views).
--     ⚠️ tipo_decisao='kids' é a ÚNICA barreira que mantém a criança fora da
--     membresia. Valor errado criaria 58 mem_membros de menores + trilha + NSM.
-- 5.2 liga decisao_id de volta na fila
-- 5.3 marca fez_decisao_jesus nos 27 check-ins com copresença comprovada,
--     com decisao_jesus_em EXPLÍCITO no meio-dia BRT (sem isso o trigger crava
--     now() e a decisão de janeiro fica datada em 02/09)
-- 5.4 data_conversao SÓ ONDE VAZIA (idempotente · nunca sobrescreve humano)
-- 5.5 faixa A vira 'aplicada'; faixa B segue 'pendente' (fila da tela)
-- 5.6 agregado do culto com GREATEST, nunca "=" — 30/08 tem 20 contados na SALA
--     contra 15 nomes; sobrescrever apagaria 5 decisões reais
-- 5.7 invariantes: 58 nominais · 0 sem tipo kids/crianca/decidiu_em · 0 com
--     membro_id (LGPD) · 0 faixa A fora de 'aplicada' · o lote fecha em 66

-- ============================================================================
-- CONFERÊNCIA (o que foi medido depois de aplicar, em 02/09/2026)
-- ============================================================================
-- nominais importadas ............ 58   (era 0)
-- kids_criancas.data_conversao ... 58   (era 0 de 4.386)
-- fez_decisao_jesus em check-ins .. 27   (era 0 de 1.740)
-- cultos.decisoes_kids em 2026 ... 60   (era 21)
-- menores vazados pra membresia ... 0
-- culto resolvido: 27 por check-in · 18 por turno único · 13 sem culto (declarado)
-- ⚠️ KIDS-02 sobe no cron das 07:00 (coletor JS `cultos.kids_conv`) — não
-- escrever kpi_registros na mão: valor escrito à mão ali não é durável.
-- ============================================================================
