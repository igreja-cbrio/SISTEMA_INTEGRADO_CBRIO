/**
 * Script: _import_acompanhamento_jornada.js  (rodar UMA vez · não faz parte do runtime)
 *
 * Importa o status do PRIMEIRO CONTATO da planilha "Acompanhamento de Jornada" do
 * Marcelo (OneDrive · somente leitura) para `cui_convertidos`, alimentando o tático
 * "% de novos convertidos com primeiro contato feito" do Monitoramento OKR e a aba
 * "Próximos passos" do Cuidados, onde o Marcelo passa a preencher nativo daqui pra frente.
 *
 * O QUE IMPORTA: Data (conversão) · Nome · Contato · Status. Faixa-etária / Responsável /
 * Next NÃO entram — a exportação da planilha duplicou o bloco de abril/2026 e desalinhou
 * essas 3 colunas (não dá pra confiar em quem é quem). Kids não são separáveis por isso,
 * então vão como estão (poucos · o Marcelo limpa no Cuidados se quiser).
 *
 * MATCHING (idempotente): casa cada linha com um cui_convertidos existente por
 * nome+data_culto (mesma chave do trigger) ou por telefone; se achar, ATUALIZA o status;
 * senão, INSERE um novo convertido. Rodar de novo só re-atualiza (sem duplicar).
 *
 * Uso:
 *   cd backend && node scripts/_import_acompanhamento_jornada.js          # aplica
 *   cd backend && DRY_RUN=1 node scripts/_import_acompanhamento_jornada.js # só simula/loga
 *
 * Pré-requisito: migration 20260617150000 aplicada (coluna primeiro_contato_status).
 */
require('dotenv').config();
const { supabase } = require('../utils/supabase');

const DRY = !!process.env.DRY_RUN;

// status canônico → { atendido_apos_culto, primeiro_contato (feito) }
const ST = {
  respondeu:           { atendido: false, contato: true },
  atendido:            { atendido: true,  contato: true },
  atendido_respondido: { atendido: true,  contato: true },
  nao_respondeu:       { atendido: false, contato: false },
  nao_compareceu:      { atendido: false, contato: false },
  nao_atendido:        { atendido: false, contato: false },
  sem_retorno:         { atendido: false, contato: false },
  numero_errado:       { atendido: false, contato: false },
};

// [data ISO, nome, contato, status]. Transcrito da planilha (read-only). Datas
// vieram em M/D/YYYY → ISO. "Lis Queiroz" estava como 2020 (erro óbvio) → 2025-11-02.
const DADOS = [
  ['2025-10-26', 'Gian Filipo', '21965324803', 'nao_respondeu'],
  ['2025-10-26', 'Monique Cardoso', '21982252295', 'atendido'],
  ['2025-10-26', 'Andréa Freitas', '21992635155', 'respondeu'],
  ['2025-10-26', 'Daniele Bastos', '21999011333', 'atendido'],
  ['2025-10-26', 'Fernanda Drummond', '21966524040', 'nao_respondeu'],
  ['2025-10-26', 'Maria dos Anjos', '21993536301', 'respondeu'],
  ['2025-11-02', 'Lis Queiroz', '21967731012', 'respondeu'],
  ['2025-11-02', 'Thais Nobre Barros', '21970355136', 'nao_compareceu'],
  ['2025-11-02', 'Zulfo Epifanio P. Filho', '21975922101', 'atendido'],
  ['2025-11-02', 'Carolina Venter', '21981354931', 'respondeu'],
  ['2025-11-02', 'Daniel', '21974636176', 'numero_errado'],
  ['2025-11-02', 'Leandro Silveira', '21997740869', 'atendido'],
  ['2025-11-02', 'Luis Alexandre', '21964588881', 'respondeu'],
  ['2025-11-09', 'Cristiana Ribeiro', '21982612915', 'nao_respondeu'],
  ['2025-11-09', 'Luiza Rodrigues', '21975021494', 'numero_errado'],
  ['2025-11-09', 'Angela Marelli', '21999251351', 'numero_errado'],
  ['2025-11-09', 'Maria Laura F. de Mendonça', '22992267777', 'respondeu'],
  ['2025-11-09', 'Naldo Sarinho', '21993852270', 'atendido'],
  ['2025-11-09', 'Débora Sarinho', '21987275510', 'atendido'],
  ['2025-11-09', 'Danielle', '21974646723', 'nao_respondeu'],
  ['2025-11-09', 'Jorge Mendes', '21996518006', 'respondeu'],
  ['2025-11-12', 'Lara Giacomazzi', '21990590996', 'nao_respondeu'],
  ['2025-11-12', 'Rafaela Reis', '21999718225', 'nao_respondeu'],
  ['2025-11-16', 'Raphaela Pereira', '21997164660', 'respondeu'],
  ['2025-11-16', 'Aniele', '21994558977', 'atendido'],
  ['2025-11-16', 'Valdeci Barbieri', '21969923398', 'atendido'],
  ['2025-11-16', 'Sergio Lara', '21964321619', 'atendido'],
  ['2025-11-16', 'Leandro Silveira', '21997740869', 'nao_respondeu'],
  ['2025-11-23', 'Silvia Regina Cordeiro', '21964638534', 'atendido'],
  ['2025-11-23', 'Bruno Fonseca', '21996022177', 'respondeu'],
  ['2025-11-23', 'Letícia Almeida', '21969615097', 'atendido'],
  ['2025-11-23', 'Christiane Boechat', '21994638170', 'atendido'],
  ['2025-11-23', 'Thiago Carvalho', '21996601112', 'atendido'],
  ['2025-11-23', 'Luciano Maquinavita', '21981089286', 'respondeu'],
  ['2025-11-23', 'Daniel de Oliveira Cunha', '21974926306', 'nao_respondeu'],
  ['2025-11-23', 'Julio Cesar Vieira', '21920187053', 'atendido'],
  ['2025-11-23', 'Bernardo Feitosa', '21982403870', 'respondeu'],
  ['2025-11-23', 'Marcus Vinicius Duarte', '21994666182', 'atendido'],
  ['2025-11-23', 'Marcos', '24992644193', 'atendido'],
  ['2025-11-23', 'Letícia Castro', '21984115631', 'atendido'],
  ['2025-11-26', 'Carol Capra', '21993224155', 'atendido'],
  ['2025-11-30', 'Jasilmo Paulino da Silva', '21959122974', 'atendido'],
  ['2025-11-30', 'Shirlene Souza', '21998732324', 'atendido'],
  ['2025-12-07', 'Raphael Drumond Rebelo', '21979910022', 'respondeu'],
  ['2025-12-07', 'Carolina Girão', '21981952210', 'respondeu'],
  ['2025-12-07', 'Fernanda Cruz', '21964130567', 'respondeu'],
  ['2025-12-07', 'Sandro Cruz', '21964130565', 'respondeu'],
  ['2025-12-07', 'Filipe Leão', '11996611276', 'atendido'],
  ['2025-12-07', 'João Vitor Muniz', '21966855335', 'nao_respondeu'],
  ['2025-12-07', 'Charles Zucatti', '11988414051', 'nao_compareceu'],
  ['2025-12-07', 'Carla Fernandes', '21979834442', 'respondeu'],
  ['2025-12-07', 'Alex Gomes', '21970794843', 'nao_compareceu'],
  ['2025-12-14', 'Rosane Souza', '21988862798', 'nao_respondeu'],
  ['2025-12-14', 'Felipe Corrêa', '21982982405', 'atendido'],
  ['2025-12-14', 'Nicolle Gemo', '27997781086', 'atendido'],
  ['2025-12-14', 'Rute Valani', '27996980303', 'atendido'],
  ['2025-12-14', 'Katia Regina Ribeiro', '21999915151', 'respondeu'],
  ['2025-12-14', 'Mônica Viana de Souza', '21981288620', 'nao_respondeu'],
  ['2025-12-14', 'Anderson Carlos Souza', '21983173633', 'atendido'],
  ['2025-12-14', 'Flavia Ferretti', '21982838144', 'nao_respondeu'],
  ['2025-12-14', 'Marcela Borges', '24988590787', 'respondeu'],
  ['2025-12-14', 'Wellington Borges', '21991913719', 'respondeu'],
  ['2025-12-21', 'Marcia Pinho', '21981620510', 'respondeu'],
  ['2025-12-21', 'Márcia Amaral', '15991394084', 'atendido'],
  ['2025-12-21', 'Rubem José da Silva', '21986248745', 'nao_respondeu'],
  ['2025-12-21', 'Juliano Safi', '24988328843', 'nao_respondeu'],
  ['2025-12-21', 'Rosangela R. dos Santos', '21970466180', 'nao_respondeu'],
  ['2025-12-21', 'Paulo Guerra', '21972016948', 'respondeu'],
  ['2025-12-21', 'Eliana Martinho', '21983644285', 'nao_respondeu'],
  ['2025-12-21', 'Mateus Moraes', '21970293961', 'respondeu'],
  ['2025-12-21', 'José Manuel', '21980741011', 'respondeu'],
  ['2025-12-21', 'Fátima Carmella', '21985148255', 'nao_respondeu'],
  ['2025-12-21', 'Fabiana Rodrigues', '21964464267', 'respondeu'],
  ['2025-12-21', 'Leandro Oliveira', '21964248030', 'nao_respondeu'],
  ['2025-12-21', 'Raphaela Dias', '21964121521', 'respondeu'],
  ['2025-12-21', 'Viviane Bruno', '21994076461', 'respondeu'],
  ['2025-12-21', 'Alice Mello', '21982842212', 'nao_respondeu'],
  ['2025-12-21', 'Shirley', '21981233520', 'respondeu'],
  ['2025-12-21', 'Daniela Drago', '21951015090', 'nao_respondeu'],
  ['2025-12-21', 'Isis Petrungaro Pereira', '21997032828', 'nao_respondeu'],
  ['2025-12-21', 'Kandice Duarte Marchetti', '21982280079', 'nao_respondeu'],
  ['2025-12-21', 'Mariana Albano', '21993612965', 'nao_respondeu'],
  ['2025-12-25', 'Ericson Madeira da Costa', '21972288001', 'nao_respondeu'],
  ['2025-12-25', "Davi D'Almeida", 'dadalmeida50', 'atendido'],
  ['2025-12-28', 'Cristiano Ramos', '21988683912', 'respondeu'],
  ['2025-12-28', 'Diego Moura', '21970390845', 'nao_respondeu'],
  ['2025-12-28', 'Ruan R. Cardoso', 'ruan.rocha021', 'atendido'],
  ['2025-12-28', 'Antonio dos Reis Gomes', '21994608629', 'respondeu'],
  ['2025-12-28', 'Fernanda Ramos Esteves', '21988965159', 'nao_respondeu'],
  ['2025-12-28', 'Georgina Scorza', '21982680133', 'nao_respondeu'],
  ['2025-12-28', 'Eunice Figueredo Corrêa', '21988892218', 'nao_respondeu'],
  ['2025-12-28', 'Fernanda Rainho', '21964378858', 'respondeu'],
  ['2026-01-04', 'Emanuelle Barbosa', '21988629318', 'nao_respondeu'],
  ['2026-01-04', 'Darrien Aka', '21988831442', 'nao_respondeu'],
  ['2026-01-04', 'Cynthia Vieira', '21996277223', 'sem_retorno'],
  ['2026-01-04', 'Julia Boura', '21996431082', 'atendido'],
  ['2026-01-04', 'Fernanda Monteiro', '27999566030', 'nao_respondeu'],
  ['2026-01-04', 'Carla Guse', '21998007269', 'respondeu'],
  ['2026-01-04', 'Danniel Maher', '21998511240', 'atendido'],
  ['2026-01-04', 'Eduardo Fialho', '21991906153', 'atendido'],
  ['2026-01-04', 'Yuri Carvalho', '21999561300', 'atendido'],
  ['2026-01-04', 'Manoel Máximo Filho', '21995986231', 'atendido'],
  ['2026-01-04', 'Lauro Barillari', '21960201415', 'sem_retorno'],
  ['2026-01-04', 'Ingrid Mello', '21969194008', 'respondeu'],
  ['2026-01-04', 'Renata Fraga', '21993836336', 'nao_respondeu'],
  ['2026-01-04', 'Luciane Gama', '21981628290', 'sem_retorno'],
  ['2026-01-04', 'Paula D. Duarte', '21979227979', 'nao_respondeu'],
  ['2026-01-04', 'Natasha Souza', '21999893700', 'respondeu'],
  ['2026-01-04', 'Rafael', '21982034573', 'respondeu'],
  ['2026-01-04', 'Tainá Berba', '21965122713', 'respondeu'],
  ['2026-01-04', 'Kaique Soares', '21998596748', 'sem_retorno'],
  ['2026-01-11', 'Tânia Costa', '21984555221', 'numero_errado'],
  ['2026-01-11', 'Miguel da Conceição', '21975172788', 'atendido'],
  ['2026-01-11', 'Lara Silva', '21968551317', 'sem_retorno'],
  ['2026-01-11', 'Maria de Lourdes', '21971650074', 'nao_respondeu'],
  ['2026-01-11', 'Marcus Aurelius Oliveira', '21999054725', 'respondeu'],
  ['2026-01-11', 'Sabrina Oliveira', '21998458594', 'nao_respondeu'],
  ['2026-01-11', 'Tatiane Macri', '21991220869', 'respondeu'],
  ['2026-01-11', 'Andrea Lima', '3237157985', 'sem_retorno'],
  ['2026-01-11', 'Miriam Beltrão', '21971881767', 'sem_retorno'],
  ['2026-01-11', 'José Jenzo Silva', '31998009292', 'atendido'],
  ['2026-01-11', 'Roberta Brasil', '21983609142', 'respondeu'],
  ['2026-01-11', 'Luiz Vieira', '21997006947', 'nao_respondeu'],
  ['2026-01-14', 'Erik Zabotininsky', '21984457990', 'respondeu'],
  ['2026-01-14', 'Yuri Belem', '21979806490', 'respondeu'],
  ['2026-01-18', 'Sidiane Pires', '6191168906', 'nao_respondeu'],
  ['2026-01-18', 'Wagner Saback', '6191168906', 'nao_respondeu'],
  ['2026-01-18', 'Laryssa Mendes', '21960184818', 'respondeu'],
  ['2026-01-18', 'Maria José Cabral', '21971028632', 'nao_respondeu'],
  ['2026-01-18', 'Sonia Milk', '21984240053', 'respondeu'],
  ['2026-01-18', 'Cristiane Azevedo', '21998391969', 'respondeu'],
  ['2026-01-21', 'Camila Freiper', '71993739057', 'atendido'],
  ['2026-01-25', 'Bruno Queiroz', '21997448571', 'atendido'],
  ['2026-01-25', 'Ana Paula C. Figueiredo', '21964754203', 'nao_respondeu'],
  ['2026-01-25', 'Ana Maria', '21970063594', 'nao_respondeu'],
  ['2026-01-25', 'Vivian Peduzzi', '21984442006', 'sem_retorno'],
  ['2026-01-25', 'Luigi Favraud', '21981956484', 'nao_respondeu'],
  ['2026-01-25', 'Dulce Maria', '21982164989', 'sem_retorno'],
  ['2026-01-25', 'Bruno Machado', '21998381058', 'respondeu'],
  ['2026-01-25', 'Nicole Bonder', '11993118008', 'respondeu'],
  ['2026-01-28', 'Karla', '21991441949', 'nao_respondeu'],
  ['2026-01-28', 'Antônio José de Oliveira', '21997697610', 'nao_respondeu'],
  ['2026-02-01', 'Victor Nantes Baldez', '21971871523', 'atendido'],
  ['2026-02-01', 'André Teixeira', '21998370315', 'atendido'],
  ['2026-02-01', 'Omyra Gomes de Freitas', '24992091627', 'atendido'],
  ['2026-02-01', 'Rosangela de Souza Coelho', '21993331549', 'atendido'],
  ['2026-02-01', 'José Jorge Silva', '31998009292', 'atendido'],
  ['2026-02-01', 'Paulo César Mello', '21981010154', 'atendido'],
  ['2026-02-01', 'Giulia Rodrigues Macharett', '21999561002', 'respondeu'],
  ['2026-02-08', 'Julia Vasconcellos', '21995255354', 'atendido'],
  ['2026-02-08', 'Erick Telez Gomes', '21972544331', 'atendido'],
  ['2026-02-08', 'Miguel de B. Contreiras', '21965591389', 'atendido'],
  ['2026-02-08', 'Caio e Tainá', '21997702173', 'atendido'],
  ['2026-02-08', 'Eduardo Palhares', '21981641079', 'atendido'],
  ['2026-02-08', 'Cláudia Jeane Oliveira', '21975393979', 'nao_respondeu'],
  ['2026-02-18', 'Celso Castro', '19992835192', 'atendido'],
  ['2026-02-18', 'Adriam Freitas Ribeiro', '41996697993', 'atendido'],
  ['2026-02-18', 'Ana Clara Cardoso', '21979137739', 'atendido'],
  ['2026-02-18', 'Anirya Mello', '21998284241', 'atendido'],
  ['2026-02-18', 'Eliane S. Fonseca', '21981690741', 'respondeu'],
  ['2026-02-18', 'Gustavo Arruda', '21971276828', 'respondeu'],
  ['2026-02-18', 'Thiago Ribeiro Lucas', '21999350237', 'sem_retorno'],
  ['2026-02-18', 'Enzo B. Langa', '31971483226', 'atendido'],
  ['2026-02-22', 'Henrique Ariodante', '21969046593', 'nao_respondeu'],
  ['2026-02-22', 'Michele Ariodante', '21997992395', 'nao_respondeu'],
  ['2026-02-22', 'Franciane da Silva Alves', '21991746982', 'atendido'],
  ['2026-02-22', 'Robson Mendonça', '21968440231', 'atendido'],
  ['2026-02-22', 'Carlos Magno Coelho', '21999758719', 'atendido'],
  ['2026-02-22', 'Marta', '21991604841', 'nao_respondeu'],
  ['2026-02-22', 'Carla Faedo', '21986959586', 'nao_respondeu'],
  ['2026-02-22', 'Lara Roberta de Sá Rego', '21982790746', 'atendido'],
  ['2026-02-22', 'Natália Furlanetto', '19971080083', 'atendido'],
  ['2026-03-01', 'Fabio Barcellos', '21991788689', 'respondeu'],
  ['2026-03-01', 'Vítor Medeiros', '11963502303', 'atendido'],
  ['2026-03-01', 'Marina Contin', '19999576615', 'atendido'],
  ['2026-03-01', 'Marcelo Ottoni de Carvalho', '21964827434', 'nao_respondeu'],
  ['2026-03-01', 'Maria Vitória Borges', '21966777862', 'sem_retorno'],
  ['2026-03-01', 'Caroline Duarte', '21988478578', 'atendido'],
  ['2026-03-01', 'Gabriel Queiroz Vaga', '21993506543', 'nao_respondeu'],
  ['2026-03-01', 'Alessandro Peloso', '21990926565', 'atendido'],
  ['2026-03-01', 'Maria Islem', '21977219009', 'atendido'],
  ['2026-03-01', 'Tito Faedo Miranda', '21986959586', 'atendido'],
  ['2026-03-01', 'Felipe Medeiros', '21970141470', 'atendido'],
  ['2026-03-01', 'Pietro dos Santos Barbosa', '21993710460', 'sem_retorno'],
  ['2026-03-01', 'Maria Luiza', '21979216462', 'sem_retorno'],
  ['2026-03-08', 'Elton Araujo C. Regis', '21959335666', 'atendido'],
  ['2026-03-15', 'Glacy Kelly Bisaggio', '21988879186', 'atendido'],
  ['2026-03-15', 'Bráulio Fagundes', '21996172130', 'respondeu'],
  ['2026-03-15', 'João Ulter', '21979776644', 'nao_respondeu'],
  ['2026-03-15', 'Priscila Montello', '21966737244', 'nao_respondeu'],
  ['2026-03-15', 'Fernando Montalvão', '21969903313', 'atendido'],
  ['2026-03-15', 'Fernanda', '21981672332', 'nao_respondeu'],
  ['2026-03-15', 'Danielle Contrucci', '21999934793', 'atendido'],
  ['2026-03-15', 'Gisele Ozom', '21982934286', 'atendido'],
  ['2026-03-15', 'Amanda Gouvêa', '21965650634', 'respondeu'],
  ['2026-03-15', 'Kátia Dantas', '21990696871', 'atendido'],
  ['2026-03-15', 'Elizabeth Rosa', '21997711643', 'nao_respondeu'],
  ['2026-03-15', 'Pedro Moreira Gonçalez', '21970079969', 'respondeu'],
  ['2026-03-23', 'Enio Gouveia Saback', '21997908168', 'respondeu'],
  ['2026-03-23', 'Gabriel Torres', '21967415406', 'nao_respondeu'],
  ['2026-03-23', 'Julia Loja', '21981099992', 'atendido'],
  ['2026-03-23', 'Helio Muniz Cardoso', '21988491193', 'respondeu'],
  ['2026-03-23', 'Jaqueline Farias', '21986932054', 'nao_respondeu'],
  ['2026-03-23', 'Rodrigo Miranda', '21972349320', 'nao_respondeu'],
  ['2026-03-23', 'Bianca Guimarães', '21983233797', 'respondeu'],
  ['2026-03-23', 'Anderson Luciano', '21968986183', 'respondeu'],
  ['2026-03-23', 'Marcia Siller', '21997603076', 'nao_respondeu'],
  ['2026-03-29', 'Carolina Marie Vieira', '21982615418', 'respondeu'],
  ['2026-03-29', 'Ricardo Barreira', '21975557287', 'respondeu'],
  ['2026-03-29', 'Gonzalo Caldas', '21997470707', 'respondeu'],
  ['2026-03-29', 'Mauro Cesar Ramos Nunes', '21964783044', 'respondeu'],
  ['2026-03-29', 'Célia Maria de Assis', '31999531655', 'sem_retorno'],
  ['2026-03-29', 'Alberto de Souza Magalhães', '21987672877', 'atendido'],
  ['2026-03-29', 'Rafael Calderaro', '21972281710', 'atendido'],
  ['2026-03-29', 'Suely Calderaro', '21999811956', 'atendido'],
  ['2026-03-29', 'Calebe Mota de Araujo Lopes', '21993224581', 'sem_retorno'],
  ['2026-03-29', 'Juliana Alzuguir', '21996413833', 'nao_respondeu'],
  ['2026-03-29', 'Luciana Carvalho', '21996620605', 'atendido'],
  ['2026-03-29', 'Maria Paula Neves', '21975634114', 'sem_retorno'],
  ['2026-04-05', 'Elaine Lucena', '21972910522', 'nao_atendido'],
  ['2026-04-05', 'Vanusa Medeiros', '21979624776', 'atendido_respondido'],
  ['2026-04-05', 'Eleonora Lyra Gonçalves', '21972934550', 'atendido_respondido'],
  ['2026-04-05', 'Maria Luiza de Freitas', '21982222832', 'atendido_respondido'],
  ['2026-04-05', 'Andre Monteiro', '32988102024', 'atendido_respondido'],
  ['2026-04-05', 'Juliana Torres Moreira', '21997401817', 'atendido_respondido'],
  ['2026-04-05', 'Matheus Vicente', '21994720820', 'atendido_respondido'],
  ['2026-04-05', 'Ana Paula H. de Araujo', '21991378891', 'atendido_respondido'],
  ['2026-04-05', 'Djalma Mello', '21974145376', 'atendido_respondido'],
  ['2026-04-05', 'Lucas Saddy', '21995640677', 'atendido_respondido'],
  ['2026-04-05', 'Gardênia', '21967096580', 'nao_atendido'],
  ['2026-04-05', 'Solano Castro C. Pinto', '21996557316', 'atendido_respondido'],
  ['2026-04-05', 'Flávia Mesquita', '21984615678', 'atendido_respondido'],
  ['2026-04-05', 'Jane Carvalho', '21986195017', 'nao_atendido'],
  ['2026-04-12', 'Patrick Machado', '21970117254', 'atendido_respondido'],
  ['2026-04-12', 'Roberta Grassano', '21996197744', 'nao_atendido'],
  ['2026-04-12', 'Alexandre Lemos', '21993809226', 'atendido_respondido'],
  ['2026-04-12', 'Caio Penoni', '21988983615', 'atendido_respondido'],
  ['2026-04-12', 'Jeremias Voazem', '21987828851', 'atendido_respondido'],
  ['2026-04-12', 'Carlos Cleber A. Barbosa', '61986192881', 'nao_respondeu'],
  ['2026-04-12', 'Júlia Sarruf', '21975516005', 'nao_respondeu'],
  ['2026-04-12', 'Patrícia Costa', '21968753064', 'nao_respondeu'],
  ['2026-05-03', 'Gilberto Carvalho Pereira', '21999887411', 'atendido_respondido'],
  ['2026-05-03', 'Renato', '21988148910', 'atendido_respondido'],
  ['2026-05-03', 'Ana Beatriz Martins', '21979929369', 'atendido_respondido'],
  ['2026-05-03', 'Luana Martins', '21976104192', 'atendido_respondido'],
  ['2026-05-03', 'Matheus Costa', '21986335733', 'atendido_respondido'],
  ['2026-05-03', 'Luiz Carlos', '11971265050', 'nao_atendido'],
  ['2026-05-03', 'Jecia Fidelis', '21986454276', 'atendido_respondido'],
  ['2026-05-03', 'Lucas Marçal', '21973639040', 'atendido_respondido'],
  ['2026-05-03', 'Helio Souza', '19992395670', 'atendido_respondido'],
  ['2026-05-03', 'Alessandra', '21997631894', 'nao_atendido'],
  ['2026-05-03', 'Marcelo Dias', '21996740024', 'atendido_respondido'],
  ['2026-05-03', 'Maria Cristina da Silva', '21996099376', 'atendido_respondido'],
  ['2026-05-10', 'Lucas Abreu', '21971149723', 'atendido_respondido'],
  ['2026-05-10', 'Orestes Junior', '21966876687', 'atendido_respondido'],
  ['2026-05-10', 'Junior José', '21966467534', 'nao_respondeu'],
  ['2026-05-10', 'Maria Júlia Gomes', '21992491435', 'nao_respondeu'],
  ['2026-05-10', 'Ana Carolina Pires', '21975730353', 'nao_atendido'],
  ['2026-05-10', 'Nielson Abreu', '21984501015', 'atendido_respondido'],
  ['2026-05-10', 'Ricardo Marconi Ferreira', '21964131266', 'atendido_respondido'],
  ['2026-05-10', 'Felipe', '21987782793', 'atendido_respondido'],
  ['2026-05-10', 'Valdnei Ferreira', '21965631601', 'numero_errado'],
  ['2026-05-17', 'Bruno Rollin', '21997978023', 'atendido_respondido'],
  ['2026-05-17', 'Thaisse Mendes', '21979303333', 'atendido_respondido'],
  ['2026-05-17', 'Denise Neves', '21981559190', 'nao_respondeu'],
  ['2026-05-17', 'Renata Ribeiro', '21965803200', 'nao_respondeu'],
  ['2026-05-17', 'Guilherme Curi', '21976072237', 'atendido_respondido'],
  ['2026-05-17', 'Marcelo Brandão', '21966022211', 'atendido_respondido'],
  ['2026-05-17', 'Danniele Lima', '21971127228', 'nao_respondeu'],
  ['2026-05-17', 'Luana Roizewblit', '21996843010', 'atendido_respondido'],
  ['2026-05-17', 'Rebeca Castelo', '21998348236', 'nao_respondeu'],
  ['2026-05-20', 'Alessandra Totti', '21988981654', 'nao_respondeu'],
  ['2026-05-20', 'Rafael Escobar', '21969147309', 'atendido_respondido'],
  ['2026-05-20', 'Alessandra', '21998011065', 'atendido_respondido'],
  ['2026-05-20', 'Joana Aguiar', '21983502790', 'nao_atendido'],
  ['2026-05-24', 'Rosa Lisboa Carreira', '21999820001', 'atendido_respondido'],
  ['2026-05-24', 'Jaqueline Brito', '21991039126', 'atendido_respondido'],
  ['2026-05-24', 'Guilherme Alcoforado', '21982685366', 'nao_atendido'],
  ['2026-05-24', 'Juliana Villa', '21981217111', 'atendido_respondido'],
  ['2026-05-24', 'João Luis', '22999467247', 'atendido_respondido'],
  ['2026-05-24', 'Madalena Santos', '21972610021', 'atendido_respondido'],
  ['2026-05-24', 'Joaquim Souza', '21965908228', 'atendido_respondido'],
  ['2026-05-24', 'Roberta Gonçalves', '21986722009', 'atendido_respondido'],
  ['2026-05-24', 'Carlos Eduardo França', '21993335000', 'nao_atendido'],
  ['2026-05-24', 'Carlos Bezerra', '21979804025', 'nao_respondeu'],
  ['2026-05-31', 'João Ricardo Pereira', '21980278000', 'atendido_respondido'],
  ['2026-05-31', 'Nicole Veronezi', '21980175258', 'atendido_respondido'],
  ['2026-05-31', 'Cristina Pimentel', '21982400313', 'atendido_respondido'],
  ['2026-05-31', 'Bruno Rosario Ramos', '21984692833', 'atendido_respondido'],
  ['2026-05-31', 'Joelma de Oliveira', '21991657511', 'atendido_respondido'],
  ['2026-05-31', 'Roberta Cavalliere', '21965325091', 'atendido_respondido'],
  ['2026-05-31', 'Fernanda Fragoso', '21964222237', 'atendido_respondido'],
  ['2026-05-31', 'Athirson Mazoli', '21981419129', 'atendido_respondido'],
  ['2026-05-31', 'Mirian Dantas', '21998022081', 'atendido_respondido'],
  ['2026-06-10', 'Pedro Pontes', '21967799930', 'atendido_respondido'],
  ['2026-06-07', 'Paula Freitas', '21995484001', 'atendido_respondido'],
  ['2026-06-07', 'Guilherme Pereira', '21995001415', 'atendido_respondido'],
  ['2026-06-07', 'Tânia Cristina Gonçalves', '21979120515', 'atendido_respondido'],
  ['2026-06-07', 'Ana Luiza Vieira', '21997006926', 'atendido_respondido'],
  ['2026-06-07', 'Suelen Duarte', '21991622913', 'atendido_respondido'],
  ['2026-06-07', 'Beatriz Elias', '21974396095', null],
  ['2026-06-07', 'Flávio Cerus', '21964802987', 'nao_respondeu'],
  ['2026-06-07', 'Rafael de Souza Oliveira', '21983283516', 'atendido_respondido'],
  ['2026-06-14', 'Luana Soares', '21999544403', 'atendido_respondido'],
  ['2026-06-14', 'Bruno Fernandes', '21999008844', 'atendido_respondido'],
  ['2026-06-14', 'Julia Fernandes', '21999916476', 'atendido_respondido'],
];

const norm = (s) => String(s || '').trim().toLowerCase();
const onlyDigits = (s) => String(s || '').replace(/\D/g, '');

async function fetchAllConvertidos() {
  const all = [];
  let offset = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from('cui_convertidos')
      .select('id, nome, data_culto, telefone, primeiro_contato_status, primeiro_contato_em, atendido_apos_culto')
      .is('deleted_at', null)
      .range(offset, offset + page - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < page) break;
    offset += page;
  }
  return all;
}

async function main() {
  console.log(`\n=== Import Acompanhamento de Jornada → cui_convertidos ${DRY ? '(DRY RUN)' : ''} ===`);
  console.log(`Linhas na planilha: ${DADOS.length}`);

  const existentes = await fetchAllConvertidos();
  console.log(`cui_convertidos existentes (ativos): ${existentes.length}`);

  const porNomeData = new Map();   // "nome|data" -> row
  const porTelefone = new Map();   // telefone(digits) -> row
  for (const r of existentes) {
    porNomeData.set(`${norm(r.nome)}|${r.data_culto}`, r);
    const t = onlyDigits(r.telefone);
    if (t.length >= 10 && !porTelefone.has(t)) porTelefone.set(t, r);
  }

  const updates = [];
  const inserts = [];
  const tally = {};

  for (const [d, nome, contato, st] of DADOS) {
    tally[st || 'sem_status'] = (tally[st || 'sem_status'] || 0) + 1;
    const meta = st ? ST[st] : null;
    const patchBase = {
      primeiro_contato_status: st || null,
      ...(meta && meta.atendido ? { atendido_apos_culto: true } : {}),
      ...(meta && meta.contato ? { primeiro_contato_em: `${d}T12:00:00.000Z` } : {}),
    };

    const tel = onlyDigits(contato);
    const existente =
      porNomeData.get(`${norm(nome)}|${d}`) ||
      (tel.length >= 10 ? porTelefone.get(tel) : null);

    if (existente) {
      const patch = { ...patchBase };
      // não sobrescreve primeiro_contato_em já preenchido (preserva o real do fluxo)
      if (existente.primeiro_contato_em) delete patch.primeiro_contato_em;
      updates.push({ id: existente.id, nome, patch });
    } else {
      inserts.push({
        data_culto: d,
        nome: nome.trim(),
        telefone: contato || null,
        area: null,                 // faixa-etária da planilha desalinhada → área desconhecida
        cadastrado: false,
        atendido_apos_culto: !!(meta && meta.atendido),
        primeiro_contato_status: st || null,
        ...(meta && meta.contato ? { primeiro_contato_em: `${d}T12:00:00.000Z` } : {}),
        observacoes: 'Importado da planilha Acompanhamento de Jornada (Marcelo)',
      });
    }
  }

  console.log(`\nDistribuição de status na planilha:`);
  Object.entries(tally).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k.padEnd(22)} ${v}`));
  console.log(`\nVai ATUALIZAR (casou existente): ${updates.length}`);
  console.log(`Vai INSERIR (novo): ${inserts.length}`);

  if (DRY) {
    console.log('\n[DRY RUN] nada gravado. Exemplos de insert:');
    inserts.slice(0, 5).forEach(i => console.log('  +', i.data_culto, i.nome, i.primeiro_contato_status));
    console.log('Exemplos de update:');
    updates.slice(0, 5).forEach(u => console.log('  ~', u.nome, JSON.stringify(u.patch)));
    return;
  }

  let okU = 0, errU = 0;
  for (const u of updates) {
    const { error } = await supabase.from('cui_convertidos').update(u.patch).eq('id', u.id);
    if (error) { errU++; console.error('  update erro', u.nome, error.message); } else okU++;
  }

  let okI = 0, errI = 0;
  for (let i = 0; i < inserts.length; i += 100) {
    const chunk = inserts.slice(i, i + 100);
    const { error, data } = await supabase.from('cui_convertidos').insert(chunk).select('id');
    if (error) { errI += chunk.length; console.error('  insert erro no chunk', i, error.message); }
    else okI += (data ? data.length : chunk.length);
  }

  console.log(`\nAtualizados: ${okU} (erros: ${errU})`);
  console.log(`Inseridos:   ${okI} (erros: ${errI})`);
  console.log('=== fim ===\n');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
