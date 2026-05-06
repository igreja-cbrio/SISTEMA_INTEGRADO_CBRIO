-- Seed dos 128 grupos da Primeira Temporada 2026 (T1-2026).
--
-- IDEMPOTENCIA: a migration apaga os grupos com temporada='T1-2026' e
-- reinsere. Para nao perder dados de membros ja vinculados a esses
-- grupos (mem_grupo_membros tem ON DELETE CASCADE), so executar uma vez.
-- Se reexecutar, mem_grupo_encontros e mem_grupo_documentos vinculados
-- aos grupos antigos tambem serao removidos.
--
-- Lider, supervisor e lider em treinamento NAO sao preenchidos —
-- esperamos que sejam vinculados via lider_id quando os membros forem
-- cadastrados em mem_membros.

BEGIN;

-- Limpa grupos existentes desta temporada (idempotencia)
DELETE FROM public.mem_grupos WHERE temporada = 'T1-2026';

INSERT INTO public.mem_grupos
  (nome, categoria, dia_semana, horario, recorrencia, local, descricao, observacoes, bairro, status_temporada, temporada, ativo)
VALUES
  -- ── (Sem bairro definido) ──
  ('Ação Social', 'Misto', 5, NULL, 'mensal', 'Instituições Sociais', 'Instituições Sociais', NULL, NULL, 'ativo', 'T1-2026', true),
  ('BARRA', 'Mulheres', 2, '17:00', 'quinzenal', 'Av Lúcio Costa 4.000 bloco 07 apt 104', 'Oração', NULL, NULL, 'a_confirmar', 'T1-2026', true),
  ('BARRA - Blue', 'Mulheres', 5, '20:00', 'quinzenal', 'Rua Cesar Lattes, 260, bloco 1, ap 404 - Condomínio Blue Vision', 'Roteiro da mensagem de domingo', 'Telefone líder: 21966545775', NULL, 'a_confirmar', 'T1-2026', true),
  ('Encontro em Restaurantes', 'Misto', 5, '20:30', 'quinzenal', 'Restaurantes pré combinados', 'Roteiro da mensagem de domingo', NULL, NULL, 'a_confirmar', 'T1-2026', true),
  ('Igreja CBRIO - Misto Sex', 'Misto', 5, '20:00', 'mensal', 'Igreja CBRio', 'Roteiro da mensagem de domingo', NULL, NULL, 'a_confirmar', 'T1-2026', true),
  ('Igreja CBRIO - Divorciadas e Solteiras 40+', 'Mulheres', 1, '15:00', 'quinzenal', 'Igreja CBRio', 'Divorciadas e Solteiras 40+', NULL, NULL, 'a_confirmar', 'T1-2026', true),
  ('Igreja CBRIO - Atmosfera (Peninsula)', 'Misto', 4, '19:30', 'quinzenal', 'Av das Acácias 540 Bloco 1 - 201 Peninsula - Atmosfera', 'Roteiro da Mensagem de domingo', NULL, NULL, 'a_confirmar', 'T1-2026', true),
  ('Igreja CBRIO - Grupo de Inclusão', 'Misto', 3, '19:00', 'semanal', 'Igreja CBRio', 'Grupo de Inclusão: família que acolhe, amor que inclui', NULL, NULL, 'a_confirmar', 'T1-2026', true),
  ('Itanhangá', 'Misto', NULL, '20:00', 'quinzenal', 'Travessa União 25 Ap 302 - Itanhangá (Tijuquinha)', 'Roteiro da mensagem de domingo', NULL, NULL, 'a_confirmar', 'T1-2026', true),
  ('ONLINE - Estudo João', 'Misto', 4, '19:00', NULL, NULL, 'Estudo do Evangelho de João', NULL, 'Online', 'a_confirmar', 'T1-2026', true),
  ('REALENGO', 'Misto', 4, '20:00', 'quinzenal', 'Rua Duarte Vasqueanes 133 Fundos', 'Roteiro da mensagem de domingo', NULL, NULL, 'a_confirmar', 'T1-2026', true),
  ('Recreio (Fontenelle)', 'Misto', 2, '19:30', 'quinzenal', 'Rua Jorge Emílio Fontenelle, 810, apt 302 - Recreio dos Bandeirantes', 'Roteiro da mensagem de domingo', NULL, 'Recreio', 'a_confirmar', 'T1-2026', true),

  -- ── Anil ──
  ('Anil 01', 'Adulto Misto', 6, '19:00', 'quinzenal', 'Rua Cruz de Malta 45 casa 2, Anil', 'Nesse grupo misto, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Vai continuar tudo igual. Não tem líder em treinamento e ninguém do grupo quer.', 'Anil', 'ativo', 'T1-2026', true),

  -- ── Barra ──
  ('Barra - Motoclube', 'Motoclube', NULL, '09:00', 'mensal', 'Igreja CBRio', 'Motoclube', NULL, 'Barra', 'ativo', 'T1-2026', true),
  ('Barra - Mulher Única', 'Mulheres', 4, '15:00', 'semanal', 'Igreja CBRio', 'Um grupo para mulheres que aborda autoestima, valor e feminilidade, ajudando-as a viver sua plenitude e causar impacto na família e sociedade com originalidade e singularidade.', NULL, 'Barra', 'a_confirmar', 'T1-2026', true),
  ('Barra - Casais com filhos até 10 anos', 'Casais com filhos até 10 anos', 6, '10:00', 'quinzenal', 'Avenida Prefeito Dulcídio Cardoso 424, bloco 3000, apto 602 - Condomínio Paradiso - Barra da Tijuca', 'Roteiro da mensagem de domingo', NULL, 'Barra', 'a_confirmar', 'T1-2026', true),
  ('Barra 01', 'Casais - Curso Aliança Casais', 1, '20:00', 'semanal', 'Igreja CBRio', 'Uma jornada prática para casais e noivos que desejam fortalecer sua união, aprofundar a intimidade e viver o propósito divino para o casamento.', 'Tudo igual.', 'Barra', 'ativo', 'T1-2026', true),
  ('Barra 02 (grupo fechado)', 'Casais', 6, '16:00', 'quinzenal', 'Barra Bali', 'Nesse grupo, formado por casais, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Alpha para receber novos convertidos e recém-chegados na CBRio. Não vai abrir para inscrição — divulgado somente no NEXT.', 'Barra', 'ativo', 'T1-2026', true),
  ('Barra 03', 'Casais', 4, '20:00', 'quinzenal', 'Rua Paulo Moura 385, bloco 3', 'Nesse grupo, formado por casais, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Não vai ter grupo nesta nova temporada.', 'Barra', 'encerrado', 'T1-2026', false),
  ('Barra 05 - Jornada 180', 'Misto - Curso Jornada 180°', 2, '20:00', 'semanal', 'Igreja CBRio', 'A "Jornada 180°" é um programa cristão baseado nos 12 Passos, que auxilia pessoas em recuperação de dependências e seus entes queridos. Ele celebra o poder de cura de Deus, promovendo crescimento pessoal e espiritual.', 'Tudo igual.', 'Barra', 'ativo', 'T1-2026', true),
  ('Barra 07 (grupo fechado)', 'Misto', 2, '19:30', 'semanal', 'Rua César Lattes, 1000 - Condomínio Blue - Barra da Tijuca, RJ, 22793329', 'Nesse grupo misto, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Tudo igual. Não tem líder em treinamento.', 'Barra', 'ativo', 'T1-2026', true),
  ('Barra 08 (grupo fechado) - Mutualidade', 'Misto - Mutualidade', 4, '20:00', 'quinzenal', 'Av. Djalma Ribeiro 25 - Barra da Tijuca', 'O Curso Alpha é uma série de encontros interativos que exploram questões sobre a fé cristã e o significado da vida. Em um ambiente acolhedor, com palestras e discussões em grupo, é ideal para quem tem dúvidas ou curiosidade sobre o cristianismo, oferecendo espaço para diálogo livre e respeitoso.', 'Tudo igual.', 'Barra', 'ativo', 'T1-2026', true),
  ('Barra 08 (grupo fechado) - Curso Alpha', 'Misto - Curso Alpha', 2, '20:00', 'quinzenal', 'CBRio', 'O Curso Alpha é uma série de encontros interativos que exploram questões sobre a fé cristã e o significado da vida.', 'Tudo igual.', 'Barra', 'ativo', 'T1-2026', true),
  ('Barra 08 (grupo fechado) - Casais Alpha', 'Misto - Curso Casais Alpha', 2, '20:00', 'quinzenal', 'CBRio', 'Curso para Casais Alpha.', 'Tudo igual.', 'Barra', 'ativo', 'T1-2026', true),
  ('Barra 08 (grupo fechado) - Cuidados', 'Misto', 0, '10:00', 'mensal', 'CBRio', 'Grupo de Cuidados', 'Tudo igual.', 'Barra', 'ativo', 'T1-2026', true),
  ('Barra 10', 'Misto', 4, '20:00', 'quinzenal', 'Rua Fala Amendoeira, 454 - Edifício Lucca Della Robbia - Barra da Tijuca, RJ, 22793910', 'Nesse grupo misto, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Tudo igual.', 'Barra', 'ativo', 'T1-2026', true),
  ('Barra 11 - Esportes Remo', 'Misto - Esportes Remo', 4, '06:00', 'quinzenal', 'Clube Oficiais Bombeiros - Rua Dulcídio Cardoso 406', 'Esporte – grupo voltado para remo, combinando exercício com momentos de oração.', 'Perguntar pessoalmente.', 'Barra', 'aguardando', 'T1-2026', true),
  ('Barra 12', 'Misto', 4, '19:30', 'semanal', 'Av. Evando Lins e Silva 440 - Condomínio San Filippo', 'Nesse grupo misto, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Tudo igual.', 'Barra', 'ativo', 'T1-2026', true),
  ('Barra 13 (grupo fechado)', 'Misto', 5, '20:00', 'quinzenal', 'Rua Dina Staff 75 - Casa 1 - Condomínio Blue - Barra da Tijuca, RJ, 22793081', 'Nesse grupo misto, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Tudo igual. Não é para abrir vaga.', 'Barra', 'ativo', 'T1-2026', true),
  ('Barra 14', 'Misto', 5, '20:00', 'semanal', 'Avenida Embaixador Abelardo Bueno, 3100 - Apto 704 - Barra da Tijuca, RJ, 22775040', 'Nesse grupo misto, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Tudo igual, mas muda para misto.', 'Barra', 'ativo', 'T1-2026', true),
  ('Barra 15', 'Misto', 5, '20:00', 'quinzenal', 'Rua João Geraldo Kulhmann casa 2 nº 494 - Condomínio Santa Mônica Residências', 'Nesse grupo misto, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Aguardando resposta.', 'Barra', 'ativo', 'T1-2026', true),
  ('Barra 16', 'Misto', 5, '20:00', 'quinzenal', 'Avenida dos Flamboyants da Península, 1259 - Bl 2 - Apto 604 - Barra da Tijuca, RJ, 22776070', 'Nesse grupo misto, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Aguardando resposta.', 'Barra', 'ativo', 'T1-2026', true),
  ('Barra 17 (grupo fechado)', 'Misto', 5, '20:00', 'quinzenal', 'Rua Eduardo Tarquínio 105 casa - Condomínio Village Marapendi (Blue 2)', 'Nesse grupo misto, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Tudo igual.', 'Barra', 'ativo', 'T1-2026', true),
  ('Barra 18 - EBD', 'Misto', 5, '20:30', 'mensal', 'Avenida Prefeito Dulcídio Cardoso, 424 - Apto 601 - Barra da Tijuca, RJ, 22620311', 'EBD', 'Tudo igual.', 'Barra', 'ativo', 'T1-2026', true),
  ('Barra 20 (grupo fechado)', 'Mulheres', 1, '18:30', 'quinzenal', 'Rua César Lattes, 700 - Blue Land Bloco 2 - Apto 803 - Barra da Tijuca, RJ, 22793329', 'Nesse grupo, formado exclusivamente por mulheres, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Tudo igual.', 'Barra', 'ativo', 'T1-2026', true),
  ('Barra 21 - Poder do Potencial', 'Mulheres - Livro Poder do Potencial', 2, '15:00', 'semanal', 'Igreja CBRio', 'Livro: Poder do Potencial', NULL, 'Barra', 'ativo', 'T1-2026', true),
  ('Barra 22 - Uma Vida com Propósito', 'Mulheres - Livro Uma Vida com Propósito', 2, '18:00', 'semanal', 'Igreja CBRio', 'Livro: Uma Vida com Propósito', NULL, 'Barra', 'a_confirmar', 'T1-2026', true),
  ('Barra 23 (grupo fechado)', 'Mulheres', 4, '20:00', 'quinzenal', 'Avenida Jornalista Tim Lopes, 105 - Bloco 3 - Apto 105 - Barra da Tijuca, RJ, 22640908 - Le Park', 'Nesse grupo, formado exclusivamente por mulheres, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Vai continuar mas não quer abrir vagas.', 'Barra', 'ativo', 'T1-2026', true),
  ('Barra 25 - Mulheres 65+', 'Mulheres 65+', 4, '18:00', 'semanal', 'Rua Lúcio Costa 360 bl 3, apt 308', 'Nesse grupo misto, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Precisa de outro líder. O filho Renan disse que ela é nova na fé e não tem muito preparo, precisando de um líder para ajudá-la.', 'Barra', 'ativo', 'T1-2026', true),
  ('Barra 26 - Esportes Futebol', 'Homens - Esportes Futebol de Grama', 6, '08:00', NULL, 'Clube Arouca', 'Esporte – grupo voltado para futebol, combinando exercício com momentos de oração.', 'Tudo igual.', 'Barra', 'ativo', 'T1-2026', true),
  ('Barra 27 - AMI', 'Jovens 18-30 - AMI', 2, '20:00', 'semanal', 'Avenida Flamboyants da Península, 1259 - Apto 604 - Barra da Tijuca, RJ, 22776070', 'Nesse grupo misto, são exploradas as mensagens do culto de Sábado, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Aguardando resposta.', 'Barra', 'aguardando', 'T1-2026', true),
  ('Barra 28 - AMI', 'Jovens 18-30 - AMI', 2, '20:00', 'semanal', 'Avenida das Américas 7837 - Bloco 2 - Apto 601 - Barra da Tijuca', 'Nesse grupo misto, são exploradas as mensagens do culto de Sábado, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Aguardando resposta.', 'Barra', 'aguardando', 'T1-2026', true),
  ('Barra 29 - Adolescentes AMI', 'Adolescentes - AMI', 6, '17:00', 'semanal', 'Avenida das Américas, 7907 - Barra da Tijuca, RJ, 22793081', 'Nesse grupo, são exploradas as mensagens do culto de Sábado, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Tudo igual.', 'Barra', 'ativo', 'T1-2026', true),
  ('Barra 30 - Pais de Adolescentes AMI', 'Misto - Pais de Adolescentes AMI', 6, '17:00', 'semanal', 'Igreja CBRio', 'Aprofundar no grupo os ensinamentos dos cultos "Quarta com Deus".', 'Aguardando resposta do Serpa.', 'Barra', 'ativo', 'T1-2026', true),
  ('Barra 31', 'Misto', 5, '20:00', 'quinzenal', 'Condomínio Blue Vision', 'Nesse grupo, formado exclusivamente por adultos 30+, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', NULL, 'Barra', 'a_confirmar', 'T1-2026', true),
  ('Barra 32 - Solteiros 30+', 'Misto - Solteiros 30+', 2, '19:30', 'semanal', 'Escritório CBRio', 'Solteiros 30+', NULL, 'Barra', 'novo', 'T1-2026', true),
  ('Barra Olímpica 01', 'Casais', 2, '20:00', 'quinzenal', 'Avenida Vice-Presidente José Alencar, 1500 - Jacarepaguá, RJ, 22775033', 'Nesse grupo, formado por casais, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Tudo igual.', 'Barra Olímpica', 'ativo', 'T1-2026', true),
  ('Barra Olímpica 03', 'Jovens Casais sem filhos', 4, '20:00', 'quinzenal', 'Rua Amilcar de Castro 150 - Barra Olímpica', 'Nesse grupo, formado por casais, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Tudo igual.', 'Barra Olímpica', 'ativo', 'T1-2026', true),
  ('Igreja CBRio - Intercessão', 'Misto - Grupo de Intercessão', 5, '10:00', 'mensal', 'Igreja CBRio', 'Grupo de Intercessão', 'Tudo igual.', 'Barra', 'ativo', 'T1-2026', true),
  ('Igreja CBRio - Mulher Única (Qui)', 'Mulheres - Mulher Única', 4, '19:00', 'mensal', 'Igreja CBRio', 'Mulher Única', 'Tudo igual.', 'Barra', 'ativo', 'T1-2026', true),
  ('Online 01 - Casais Alpha', 'Casais - Curso Casais Alpha', 4, '20:00', 'quinzenal', 'Igreja CBRio', 'Curso Casais Alpha', 'Mudou para grupo de casais.', 'Barra', 'ativo', 'T1-2026', true),

  -- ── Barra Olímpica ──
  ('Barra 04', 'Casal', 5, '20:00', 'quinzenal', 'Rua Franco Zampari, 111 bloco 6, ap. 504 - Barra Olímpica', 'Nesse grupo, formado por casais, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Não vai abrir para novas inscrições.', 'Barra Olímpica', 'ativo', 'T1-2026', true),
  ('Barra Olímpica 02 (grupo fechado)', 'Casais', 5, '20:00', 'quinzenal', 'Rua General Sílvio Pereira da Silva, 53 - Casa 102 - Curicica, RJ, 22780510', 'Nesse grupo, formado por casais, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Tudo igual.', 'Barra Olímpica', 'ativo', 'T1-2026', true),
  ('Barra Olímpica 04', 'Misto - Curso Alpha', 2, '20:00', 'quinzenal', 'Av. Vice-Presidente José Alencar 1400 bl 2 - Jacarepaguá', 'O Curso Alpha é uma série de encontros interativos que exploram questões sobre a fé cristã e o significado da vida.', 'Não vai dar tempo de terminar — ainda faltam 6 encontros por ser quinzenal. Pediu ajuda do Pr. Nélio. Não abrir vagas porque não terminou ainda.', 'Barra Olímpica', 'encerrado', 'T1-2026', false),
  ('Barra Olímpica 06 - AMI', 'Jovens 18-30 - AMI', 2, '20:00', 'semanal', 'Avenida Vice-Presidente José Alencar, 1500 - Bl. 6 - Apto 602 - Jacarepaguá, RJ, 22775033 (Cidade Jardim)', 'Nesse grupo misto, são exploradas as mensagens do culto de Sábado, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Aguardando resposta.', 'Barra Olímpica', 'aguardando', 'T1-2026', true),
  ('Barra Olímpica 07', 'Misto', 5, '19:30', 'semanal', 'Av. Abraham Medinda, 355, Ilha Pura. CEP 22783-123', NULL, NULL, 'Barra Olímpica', 'novo', 'T1-2026', true),

  -- ── Cidade Jardim ──
  ('Barra Olímpica 05 - Estudo Bíblico Mulheres', 'Mulheres', 4, '18:30', 'quinzenal', 'Av. Vice-Presidente José Alencar 1500 bl 8 apt 1503', 'Estudo Bíblico para Mulheres', 'Grupo novo.', 'Cidade Jardim', 'novo', 'T1-2026', true),

  -- ── Florianópolis ──
  ('Florianópolis 01', 'Misto', 5, '20:00', 'semanal', 'Rua Vereador Osni Ortiga, 416 - Lagoa da Conceição - Florianópolis', 'Nesse grupo misto, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Disse que está tudo indo bem.', 'Florianópolis', 'ativo', 'T1-2026', true),

  -- ── Freguesia ──
  ('Freguesia 01', 'Misto', 2, '20:00', 'quinzenal', 'Rua Santa Taís, 61 - Freguesia (Jacarepaguá), RJ, 22745230', 'Grupo de oração.', 'Mudou para grupo de oração.', 'Freguesia', 'ativo', 'T1-2026', true),
  ('Freguesia 02 - AMI', 'Jovens 18-30 - AMI', 4, '20:00', 'semanal', 'Rua Retiro dos Artistas', 'Nesse grupo misto, são exploradas as mensagens do culto de Sábado, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Vai continuar tudo igual.', 'Freguesia', 'ativo', 'T1-2026', true),

  -- ── Jacarepaguá ──
  ('Jacarepaguá 06 - AMI', 'Jovens 18-30 - AMI', 4, '20:00', 'semanal', 'Rua Marques de Jacarepaguá', 'Nesse grupo misto, são exploradas as mensagens do culto de Sábado, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Aguardando resposta.', 'Jacarepaguá', 'aguardando', 'T1-2026', true),

  -- ── Nova Iguaçu ──
  ('Nova Iguaçu 01', 'Misto', 4, '19:30', 'quinzenal', 'Rua Maciel Soares 32', 'Nesse grupo misto, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Tudo igual.', 'Nova Iguaçu', 'ativo', 'T1-2026', true),
  ('Nova Iguaçu 02 - AMI', 'Jovens 18-30 - AMI', 2, '20:00', 'semanal', 'Caminho do Iguaçu, 200 - Vila São Luís, RJ, 26012466', 'Nesse grupo misto, são exploradas as mensagens do culto de Sábado, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Mensagem enviada.', 'Nova Iguaçu', 'aguardando', 'T1-2026', true),

  -- ── Online ──
  ('Online - Estudo de João (Quinta)', 'Misto', 4, '19:00', 'semanal', 'Online', 'A definir', NULL, 'Online', 'a_confirmar', 'T1-2026', true),
  ('Online - Mulheres Enraizadas', 'Mulheres', NULL, '07:00', 'semanal', 'Online', 'Mulheres Enraizadas', 'Vai fazer um estudo focado nos evangelhos.', 'Online', 'ativo', 'T1-2026', true),
  ('Online - Crown (Finanças)', 'Misto - Curso Crown', 1, '19:30', 'semanal', 'Online', 'Grupo de Finanças - CROWN', 'Vai fazer um estudo focado nos evangelhos.', 'Online', 'ativo', 'T1-2026', true),
  ('Online - Leitura da Bíblia (Diário 5h)', 'Mulheres', NULL, '05:00', 'diario', 'Online', 'Leitura da Bíblia', 'Vai fazer um estudo focado nos evangelhos.', 'Online', 'ativo', 'T1-2026', true),
  ('Online - Novos Convertidos', 'Misto - Novos Convertidos', 2, '20:00', 'semanal', 'Online', 'Grupo de Novos Convertidos', NULL, 'Online', 'ativo', 'T1-2026', true),
  ('Online - Homem ao Máximo', 'Misto - Homem ao Máximo', 2, '20:00', 'semanal', 'Online', 'Homem ao Máximo', NULL, 'Online', 'novo', 'T1-2026', true),
  ('Online - AMI Mulheres', 'Jovens 18-30 - AMI Mulheres', 6, '10:00', 'semanal', 'Online (Avenida Flamboyants da Península)', 'Nesse grupo misto, são exploradas as mensagens do culto de Sábado, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Aguardando resposta.', 'Online', 'aguardando', 'T1-2026', true),
  ('Online - AMI Sex 20h', 'Jovens 18-30 - AMI', 5, '20:00', 'semanal', 'Online', 'Nesse grupo misto, são exploradas as mensagens do culto de Sábado, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Aguardando resposta.', 'Online', 'aguardando', 'T1-2026', true),
  ('Online - Mulheres com Propósito (Diário 5h)', 'Mulheres - Mulher Única', NULL, '05:00', 'diario', 'Online (Mulheres com Propósito - diariamente 5h da manhã)', 'Mulher Única', 'Tudo igual.', 'Online', 'ativo', 'T1-2026', true),
  ('Online 01 - Mulher Única', 'Mulheres - Mulher Única', 2, '20:00', 'quinzenal', 'Online', 'Mulher Única', 'Mudou para grupo de casais.', 'Online', 'ativo', 'T1-2026', true),
  ('Online 02', 'Misto', 1, '20:00', 'semanal', 'Online', 'Nesse grupo misto, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Aguardando resposta.', 'Online', 'aguardando', 'T1-2026', true),
  ('Online 04 - Conhecendo Deus', 'Misto - Curso Conhecendo Deus', 1, '20:00', 'semanal', 'Online', 'Um treinamento em discipulado para aprender a ouvir a voz de Deus, identificar sua ação e se unir a Ele, experimentando o impossível através de sua obra em sua vida.', 'Tudo igual.', 'Online', 'ativo', 'T1-2026', true),
  ('Online 05 - Mente de Cristo', 'Misto - Mente de Cristo', 2, '20:00', 'semanal', 'Online', 'Mente de Cristo - Um treinamento em discipulado para aprender a ouvir a voz de Deus, identificar sua ação e se unir a Ele.', 'Tudo igual.', 'Online', 'ativo', 'T1-2026', true),
  ('Online 06 - Crown Seu Dinheiro', 'Misto - Curso Crown', 1, '20:00', 'semanal', 'Online', 'Curso que ensina princípios financeiros bíblicos, ajudando a gerir recursos com sabedoria e alcançar liberdade financeira alinhada aos propósitos de Deus.', 'Tudo igual.', 'Online', 'ativo', 'T1-2026', true),
  ('Online 07', 'Misto', 2, '20:00', 'semanal', 'Online', 'Nesse grupo misto, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Vai continuar tudo igual.', 'Online', 'ativo', 'T1-2026', true),
  ('Online 08', 'Misto', 2, '20:00', 'semanal', 'Online', 'Nesse grupo misto, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Tudo igual, mas não tem mais vaga. Não abrir.', 'Online', 'ativo', 'T1-2026', true),
  ('Online 09 - Estudo da Bíblia', 'Estudo da Bíblia', 1, '20:00', 'semanal', 'Online', 'Estudo da Bíblia', 'Tudo igual.', 'Online', 'ativo', 'T1-2026', true),
  ('Online 10 - Conhecendo Deus', 'Misto - Curso Conhecendo Deus', 2, '20:00', 'semanal', 'Online', 'Um treinamento em discipulado para aprender a ouvir a voz de Deus, identificar sua ação e se unir a Ele.', 'Tudo igual.', 'Online', 'ativo', 'T1-2026', true),
  ('Online 11 - Conhecendo Deus', 'A definir', 2, '20:00', 'semanal', 'Online', 'Conhecendo Deus', 'Vai continuar tudo igual.', 'Online', 'ativo', 'T1-2026', true),
  ('Online 12 - Sala de Oração', 'Misto - Sala de Oração', 3, '18:00', 'semanal', 'Online', 'Nesse grupo misto, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Vai continuar com sala de oração, mudou para quarta-feira às 18h.', 'Online', 'ativo', 'T1-2026', true),
  ('Online 13', 'Misto', 4, '20:00', 'semanal', 'Online', 'Nesse grupo misto, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Vai para quinta-feira 20h às 22h, misto.', 'Online', 'ativo', 'T1-2026', true),
  ('Online 14', 'Misto', 4, '20:00', 'quinzenal', 'Online', 'Nesse grupo misto, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Vai continuar tudo igual.', 'Online', 'ativo', 'T1-2026', true),
  ('Online 15', 'Misto', 6, '09:00', 'quinzenal', 'Online', 'Nesse grupo misto, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Vai continuar tudo igual.', 'Online', 'ativo', 'T1-2026', true),
  ('Online 16', 'Mulheres', 1, '21:00', 'semanal', 'Online', 'Nesse grupo, lemos e refletimos sobre a Bíblia. É um espaço para aprender mais sobre Deus, compartilhar experiências, orar juntas e nos fortalecer como mulheres cristãs.', 'Tudo igual.', 'Online', 'ativo', 'T1-2026', true),
  ('Online 17 - Conectados a Jesus', 'Mulheres', 1, '20:00', 'semanal', 'Online', 'Conectados a Jesus - Nesse grupo, formado exclusivamente por mulheres, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Vai tentar mudar o dia do grupo, mas a princípio vai ser igual.', 'Online', 'ativo', 'T1-2026', true),
  ('Online 18 - Mentes Tranquilas Almas Felizes', 'Mulheres', 2, '19:30', 'semanal', 'Online', 'Mudou o material para o livro "Mentes Tranquilas Almas Felizes".', 'Pelo visto não avisou da troca de material.', 'Online', 'ativo', 'T1-2026', true),
  ('Online 19', 'Mulheres', 2, '20:00', 'semanal', 'Online', 'Nesse grupo, formado exclusivamente por mulheres, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Quer mudar para semanal.', 'Online', 'ativo', 'T1-2026', true),
  ('Online 20 - Mulheres do Secreto', 'Mulheres - Livro Mulheres do Secreto', 2, '20:00', 'semanal', 'Online', 'O livro "Mulheres do Secreto" é um guia para aprofundar a intimidade com Deus, ensinando como viver uma vida fundamentada no secreto, com motivações corretas e coração alinhado ao Céu.', 'Tudo igual.', 'Online', 'ativo', 'T1-2026', true),
  ('Online 22 - Brasil x Europa', 'Mulheres', 4, '16:30', 'semanal', 'Online', 'Conexão Brasil x Europa', 'Vai fazer um estudo focado nos evangelhos.', 'Online', 'ativo', 'T1-2026', true),
  ('Online 23 - Homens', 'Homens', 2, '19:30', 'semanal', 'Online', 'Nesse grupo, formado por homens, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Tudo igual.', 'Online', 'ativo', 'T1-2026', true),
  ('Online 24 - Comunicação Sexo Dinheiro', 'Homens', 6, '08:00', 'semanal', 'Online', 'Comunicação, Sexo e Dinheiro: um tema que desafia o homem a viver seu potencial em Cristo, desenvolvendo sua masculinidade e conformando seu comportamento à Palavra de Deus.', 'Vai continuar tudo igual.', 'Online', 'ativo', 'T1-2026', true),
  ('Online 24 - Oração Diária', 'Misto - Oração Diária', NULL, '07:30', 'diario', 'Online', 'Oração Diária', 'Vai continuar tudo igual.', 'Online', 'ativo', 'T1-2026', true),
  ('Online 25', 'Misto', 1, '20:00', 'semanal', 'Online', 'Nesse grupo misto, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', NULL, 'Online', 'novo', 'T1-2026', true),
  ('Online 27 - Impacto da Santidade', 'Mulheres - Livro Impacto da Santidade', 4, '20:00', 'semanal', 'Online', 'Livro: Impacto da Santidade', NULL, 'Online', 'novo', 'T1-2026', true),
  ('Online 28 - Inteligência Espiritual', 'Misto - Inteligência Espiritual de Cristo', 1, '20:30', 'semanal', 'Online', 'Inteligência Espiritual de Cristo. Discernimento Espiritual para quem quer viver a recompensa de uma amizade pessoal e profunda com o criador.', 'Tudo igual.', 'Online', 'ativo', 'T1-2026', true),
  ('Online 28 - Mulher Única (Sex)', 'Mulheres - Mulher Única', 5, '15:30', 'semanal', 'Online', 'Mulher Única - Um grupo para mulheres que aborda autoestima, valor e feminilidade.', NULL, 'Online', 'novo', 'T1-2026', true),
  ('Online 29 - Mulheres da Bíblia', 'Mulheres', 4, '20:00', 'semanal', 'Online', 'Estudo das Mulheres da Bíblia', NULL, 'Online', 'novo', 'T1-2026', true),
  ('Online 30 - Homens com Propósito', 'Homens - Livro Homens com Propósito', 2, '20:30', 'semanal', 'Online', 'Livro: Homens com Propósito', NULL, 'Online', 'novo', 'T1-2026', true),
  ('Online 03', 'Misto', 1, '20:00', 'semanal', 'Online', 'Nesse grupo misto, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Vai continuar tudo igual.', 'Online', 'ativo', 'T1-2026', true),

  -- ── Pechincha ──
  ('Pechincha 01', 'Misto', 2, '20:00', 'quinzenal', 'Estrada Capenha, 907 - Casa 3 - Condomínio Eldorado Green - Pechincha, RJ, 22743041', 'Nesse grupo misto, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Tudo igual.', 'Pechincha', 'ativo', 'T1-2026', true),

  -- ── Presencial ──
  ('Presencial - Homem ao Máximo (Ter)', 'Homens - Homem ao Máximo', 2, '20:00', 'semanal', 'Igreja CBRio', 'Homem ao Máximo', 'Vai fazer um estudo focado nos evangelhos.', 'Presencial', 'ativo', 'T1-2026', true),
  ('Presencial - Vencedores Nunca Desistem (Qui)', 'Homens - Vencedores Nunca Desistem', 4, '20:00', 'semanal', 'Igreja CBRio', 'Vencedores Nunca Desistem', 'Vai fazer um estudo focado nos evangelhos.', 'Presencial', 'ativo', 'T1-2026', true),
  ('Presencial - Mulher que Prospera', 'Mulheres - Mulher que Prospera', 2, '19:00', 'semanal', 'Igreja CBRio', 'Mulher que Prospera', 'Vai fazer um estudo focado nos evangelhos.', 'Presencial', 'ativo', 'T1-2026', true),
  ('Presencial - Mulher Única (Qui)', 'Mulheres - Mulher Única', 4, '19:00', 'semanal', 'Igreja CBRio', 'Mulher Única', 'Vai fazer um estudo focado nos evangelhos.', 'Presencial', 'ativo', 'T1-2026', true),
  ('Presencial - Roteiro (Sáb 16h)', 'Misto', 6, '16:00', 'semanal', 'Av. General Olyntho Pilar 355', 'Roteiro da mensagem de domingo', NULL, 'Presencial', 'a_confirmar', 'T1-2026', true),
  ('Cabo Frio', 'Misto', 2, '19:30', 'semanal', 'Avenida Assunção 301', 'Roteiro', NULL, 'Presencial', 'a_confirmar', 'T1-2026', true),
  ('Igreja CBRIO - Ferido pelo Processo (Ter 15h)', 'Mulheres - Livro Ferido pelo Processo', 2, '15:00', 'semanal', 'Igreja CBRio', 'Livro Ferido pelo Processo, Curado pelo Propósito', NULL, 'Presencial', 'a_confirmar', 'T1-2026', true),
  ('Igreja CBRIO - Ferido pelo Processo (Ter 18h)', 'Mulheres - Livro Ferido pelo Processo', 2, '18:00', 'semanal', 'Igreja CBRio', 'Livro Ferido pelo Processo, Curado pelo Propósito', NULL, 'Presencial', 'a_confirmar', 'T1-2026', true),
  ('Igreja CBRIO - Mulher Única (Seg 15h)', 'Mulheres - Mulher Única', 1, '15:00', 'semanal', 'Igreja CBRio', 'Mulher Única', NULL, 'Presencial', 'a_confirmar', 'T1-2026', true),
  ('Igreja CBRIO - Jornada Bíblica 1', 'Misto - Jornada Bíblica 1', 1, '19:30', 'semanal', 'Igreja CBRio', 'Jornada Bíblica 1', NULL, 'Presencial', 'a_confirmar', 'T1-2026', true),
  ('Igreja CBRIO - Jornada Bíblica 2', 'Misto - Jornada Bíblica 2', 4, '19:30', 'semanal', 'Igreja CBRio', 'Jornada Bíblica 2', NULL, 'Presencial', 'a_confirmar', 'T1-2026', true),
  ('Igreja CBRIO - Coragem (Jovens 17-25)', 'Homens - Jovens 17 a 25', 6, '10:30', 'semanal', 'Igreja CBRio', 'Jovens 17 a 25 - Coragem', NULL, 'Presencial', 'a_confirmar', 'T1-2026', true),
  ('Igreja CBRIO - Conhecendo Deus (Ter)', 'Misto - Curso Conhecendo Deus', 2, '19:30', 'semanal', 'Igreja CBRio', 'Conhecendo Deus', NULL, 'Presencial', 'a_confirmar', 'T1-2026', true),
  ('Recreio - Escola Bambini', 'Misto', 2, '19:30', 'semanal', 'Escola Bambini - Recreio', 'Roteiro', NULL, 'Presencial', 'a_confirmar', 'T1-2026', true),
  ('Tijuca - São Francisco Xavier', 'Misto', 1, '20:30', 'semanal', 'Rua São Francisco Xavier, 124 - Tijuca', 'Roteiro', NULL, 'Presencial', 'a_confirmar', 'T1-2026', true),

  -- ── Recreio ──
  ('Recreio 01', 'Casais', 2, '20:00', 'semanal', 'Avenida Gilka Machado, 304 - Recreio dos Bandeirantes, RJ, 22790570', 'Nesse grupo, formado por casais, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Tudo igual.', 'Recreio', 'ativo', 'T1-2026', true),
  ('Recreio 02', 'Misto', 2, '20:30', 'semanal', 'Rua Gustavo Corsão 29, apt 301 - Recreio', 'Nesse grupo misto, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Não vai continuar porque o nenê da líder vai nascer.', 'Recreio', 'ativo', 'T1-2026', true),
  ('Recreio 04', 'Misto', 4, '20:00', 'quinzenal', 'Rua Alberto Cavalcanti, 15 - Apto 302 - Recreio dos Bandeirantes, RJ, 22790850', 'Nesse grupo misto, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', NULL, 'Recreio', 'ativo', 'T1-2026', true),
  ('Recreio 05', 'Misto', 5, '20:00', 'quinzenal', 'Rua Walmor Chagas, 155 - Casa 2 - Recreio', 'Nesse grupo misto, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Tudo igual.', 'Recreio', 'ativo', 'T1-2026', true),
  ('Recreio 06 - AMI', 'Jovens 18-30 - AMI', 1, '19:00', 'semanal', 'Blue House', 'Nesse grupo misto, são exploradas as mensagens do culto de Sábado, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Tudo igual.', 'Recreio', 'ativo', 'T1-2026', true),
  ('Recreio 07', 'Misto', 4, '19:00', 'quinzenal', 'Rua Nicette Bruno, 75 Bl: 07/110 - Recreio', 'Nesse grupo misto, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'NÃO VAI ABRIR O GRUPO nesta temporada.', 'Recreio', 'encerrado', 'T1-2026', false),

  -- ── Tijuca ──
  ('Tijuca 01', 'Misto', 2, '20:00', 'semanal', 'Rua Rocha Miranda, 228 - Usina (Tijuca), RJ, 20530450', 'Nesse grupo misto, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Tudo igual.', 'Tijuca', 'ativo', 'T1-2026', true),
  ('Tijuca 02 - AMI', 'Jovens 18-30 - AMI', 4, '20:00', 'semanal', 'Rua Antônio Basílio, 150 - Tijuca, RJ, 20511190', 'Nesse grupo misto, são exploradas as mensagens do culto de Sábado, com discussões práticas e um roteiro semanal para aprofundar o tema.', 'Tudo igual.', 'Tijuca', 'ativo', 'T1-2026', true),

  -- ── Vargem Grande ──
  ('Vargem Grande', 'Casais', 2, '20:00', 'quinzenal', 'Rua Otto Stupakoff, 427, casa 9 - Vargem Grande', 'Roteiro da mensagem de domingo', NULL, 'Vargem Grande', 'a_confirmar', 'T1-2026', true),

  -- ── Vargem Pequena ──
  ('Vargem Pequena 01', 'Misto', 4, '19:30', 'quinzenal', 'Condomínio Veredas de Vargem', 'Nesse grupo misto, são exploradas as mensagens do culto de domingo, com discussões práticas e um roteiro semanal para aprofundar o tema.', NULL, 'Vargem Pequena', 'a_confirmar', 'T1-2026', true);

COMMIT;
