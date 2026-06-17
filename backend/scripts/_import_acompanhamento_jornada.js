/**
 * Script: _import_acompanhamento_jornada.js  (rodar UMA vez · não faz parte do runtime)
 *
 * Importa o acompanhamento do PRIMEIRO CONTATO da planilha "Acompanhamento de Jornada"
 * do Marcelo para `cui_convertidos`, alimentando o tático "% de novos convertidos com
 * primeiro contato feito" (Monitoramento OKR) e a aba "Próximos passos" do Cuidados.
 *
 * FONTE: o próprio Marcos colou as 7 colunas alinhadas por linha (Data · Nome · Contato ·
 * Status · Faixa-etária · Responsável · Next) no bloco RAW abaixo. Agora dá pra usar
 * Faixa (→ área) e Responsável também. O bloco duplicado/corrompido de abril/2026 some
 * sozinho: a dedup por (data|nome) mantém só a 1ª ocorrência de cada pessoa.
 *
 * REGRAS:
 *  - Área: Adulto→sede · Jovem→ami · Adolescente→bridge · On Line→online · Criança→KIDS.
 *  - Crianças (Faixa = Criança) NÃO entram (mesma regra do sistema: kids fora da jornada/NSM).
 *    Rode com IMPORTAR_KIDS=1 se quiser incluí-las assim mesmo.
 *  - Primeiro contato feito = Respondeu + Atendido + Atendido e respondido.
 *  - Matching idempotente: casa por nome+data ou telefone (atualiza) · senão insere.
 *
 * Uso (na pasta backend):
 *   DRY_RUN=1 node scripts/_import_acompanhamento_jornada.js   # simula/loga
 *   node scripts/_import_acompanhamento_jornada.js             # aplica
 *
 * Pré-requisito: migration 20260617150000 aplicada (coluna primeiro_contato_status).
 */
require('dotenv').config();
const { supabase } = require('../utils/supabase');

const DRY = !!process.env.DRY_RUN;
const IMPORTAR_KIDS = !!process.env.IMPORTAR_KIDS;

// ── Dados colados pelo Marcos (planilha read-only). NÃO editar à mão · é a fonte. ──
const RAW = `
26/10/2025	Gian Filipo	(21) 965324803	Não respondeu	Adulto	Sebastião	Não
26/10/2025	Monique Cardoso	(21) 982252295	Atendido	Adulto	Lorena	Sim
26/10/2025	Andréa Freitas	(21) 992635155	Respondeu	Adulto	Wesley	Não
26/10/2025	Daniele Bastos	(21) 999011333	Atendido	Criança	Mari	Não
26/10/2025	Fernanda Drummond	(21) 966524040	Não respondeu	Adulto	Nélio	Não
26/10/2025	Maria dos Anjos	(21) 993536301	Respondeu	Adulto	Wesley	Não
02/11/2020	Lis Queiroz	(21) 967731012	Respondeu	Adulto	Natasha	Não
02/11/2025	Thais Nobre Barros	(21) 970355136	Não compareceu	Adulto	Wesley	Não
02/11/2025	Zulfo Epifanio P. Filho	(21) 975922101	Atendido	Adulto	Wesley	Não
02/11/2025	Carolina Venter	(21) 981354931	Respondeu	Adulto	Nélio	Não
02/11/2025	Daniel	(21) 974636176	Número errado	Jovem	Carmet	Não
02/11/2025	Leandro Silveira	(21) 997740869	Atendido	Adulto	Nélio	Sim
02/11/2025	Luis Alexandre	(21) 964588881	Respondeu	Adulto	Sebastião	Não
09/11/2025	Cristiana Ribeiro	(21) 982612915	Não respondeu	Adulto	Nélio	Sim
09/11/2025	Luiza Rodrigues	(21) 975021494	Número errado	Jovem	Carmet	Não
09/11/2025	Angela Marelli	(21) 999251351	Número errado	On Line	Renata	Não
09/11/2025	Maria Laura F. de Mendonça	(22) 992267777	Respondeu	Adulto	Natasha	Não
09/11/2025	Naldo Sarinho	(21) 993852270	Atendido	Adulto	Wesley	Não
09/11/2025	Débora Sarinho	(21) 987275510	Atendido	Adulto	Wesley	Não
09/11/2025	Danielle	(21) 974646723	Não respondeu	Adolescente	Lilian	Não
09/11/2025	Jorge Mendes	(21) 996518006	Respondeu	Adulto	Wesley	Não
12/11/2025	Lara Giacomazzi	(21) 990590996	Não respondeu	Jovem	Carmet	Não
12/11/2025	Rafaela Reis	(21) 999718225	Não respondeu	Jovem	Carmet	Não
16/11/2025	Raphaela Pereira	(21) 997164660	Respondeu	Adulto	Naná	Não
16/11/2025	Aniele	(21) 994558977	Atendido	Criança	Mari	Não
16/11/2025	Valdeci Barbieri	(21) 969923398	Atendido	Adulto	Wesley	Não
16/11/2025	Sergio Lara	(21) 964321619	Atendido	Adulto	Wesley	Não
16/11/2025	Leandro Silveira	(21) 997740869	Não respondeu	Adolescente	Lilian	Sim
23/11/2025	Silvia Regina Cordeiro	(21) 964638534	Atendido	Adulto	Sebastião	Não
23/11/2025	Bruno Fonseca	(21) 996022177	Respondeu	Adulto	Lorena	Não
23/11/2025	Letícia Almeida	(21) 969615097	Atendido	Adulto	Natasha	Não
23/11/2025	Christiane Boechat	(21) 994638170	Atendido	Adulto	Wesley	Não
23/11/2025	Thiago Carvalho	(21) 996601112	Atendido	Adulto	Nélio	Não
23/11/2025	Luciano Maquinavita	(21) 981089286	Respondeu	Adulto	Wesley	Não
23/11/2025	Daniel de Oliveira Cunha	(21) 974926306	Não respondeu	Adulto	Sebastião	Não
23/11/2025	Julio Cesar Vieira	(21) 920187053	Atendido	Adulto	Wesley	Não
23/11/2025	Bernardo Feitosa	(21) 982403870	Respondeu	Adolescente	Lilian	Não
23/11/2025	Marcus Vinicius Duarte	(21) 994666182	Atendido	Adulto	Wesley	Sim
23/11/2025	Marcos	(24) 992644193	Atendido	Adulto	Renata	Não
23/11/2025	Letícia Castro	(21) 984115631	Atendido	Adulto	Wesley	Não
26/11/2025	Carol Capra	(21) 993224155	Atendido	Adulto	Wesley	Não
30/11/2025	Jasilmo Paulino da Silva	(21) 959122974	Atendido	Adulto	Nélio	Não
30/11/2025	Shirlene Souza	(21) 998732324	Atendido	Adulto	Renata	Não
07/12/2025	Raphael Drumond Rebelo	(21) 979910022	Respondeu	Adulto	Wesley	Não
07/12/2025	Carolina Girão	(21) 981952210	Respondeu	Adulto	Natasha	Sim
07/12/2025	Fernanda Cruz	(21) 964130567	Respondeu	Adulto	Wesley	Não
07/12/2025	Sandro Cruz	(21) 964130565	Respondeu	Adulto	Wesley	Não
07/12/2025	Filipe Leão	(11) 996611276	Atendido	Adulto	Nélio	Sim
07/12/2025	João Vitor Muniz	(21) 966855335	Não respondeu	Jovem	Carmet	Não
07/12/2025	Charles Zucatti	(11) 988414051	Não compareceu	Adulto	Nélio	Não
07/12/2025	Carla Fernandes	(21) 979834442	Respondeu	Adulto	Natasha	Sim
07/12/2025	Alex Gomes	(21) 970794843	Não compareceu	Adulto	Nélio	Sim
14/12/2025	Rosane Souza	(21) 988862798	Não respondeu	Adulto	Nélio	Não
14/12/2025	Felipe Corrêa	(21) 982982405	Atendido	Adulto	Wesley	Não
14/12/2025	Nicolle Gemo	(27) 997781086	Atendida	Adulto	Renata	Não
14/12/2025	Rute Valani	(27) 996980303	Atendida	Adulto	Renata	Não
14/12/2025	Katia Regina Ribeiro	(21) 999915151	Respondeu	Adulto	Wesley	Não
14/12/2025	Mônica Viana de Souza	(21) 981288620	Não respondeu	Adulto	Natasha	Não
14/12/2025	Anderson Carlos Souza	(21) 983173633	Atendido	Adulto	Renata	Não
14/12/2025	Flavia Ferretti	(21) 982838144	Não respondeu	Adolescente	Lilian	Não
14/12/2025	Marcela Borges	(24) 988590787	Respondeu	Adulto	Wesley	Não
14/12/2025	Wellington Borges	(21) 991913719	Respondeu	Adulto	Wesley	Não
21/12/2025	Marcia Pinho	(21) 981620510	Respondeu	Adulto	Nélio	Não
21/12/2025	Márcia Amaral	(15) 991394084	Atendida	Adulto	Renata	Não
21/12/2025	Rubem José da Silva	(21) 986248745	Não respondeu	Adulto	Wesley	Não
21/12/2025	Juliano Safi	(24) 988328843	Não respondeu	Adulto	Nélio	Não
21/12/2025	Rosangela R. dos Santos	(21) 970466180	Não respondeu	Adulto	Sebastião	Não
21/12/2025	Paulo Guerra	(21) 972016948	Respondeu	Adulto	Wesley	Não
21/12/2025	Eliana Martinho	(21) 983644285	Não respondeu	Adulto	Wesley	Não
21/12/2025	Mateus Moraes	(21) 970293961	Respondeu	Adolescente	Lilian	Não
21/12/2025	José Manuel	(21) 980741011	Respondeu	Adulto	Wesley	Não
21/12/2025	Fátima Carmella	(21) 985148255	Não respondeu	Adulto	Sebastião	Não
21/12/2025	Fabiana Rodrigues	(21) 964464267	Respondeu	Adulto	Lorena	Não
21/12/2025	Leandro Oliveira	(21) 964248030	Não respondeu	Adulto	Nélio	Não
21/12/2025	Raphaela Dias	(21) 964121521	Respondeu	Adulto	Lorena	Não
21/12/2025	Viviane Bruno	(21) 994076461	Respondeu	Adulto	Lorena	Não
21/12/2025	Alice Mello	(21) 982842212	Não respondeu	Adulto	Natasha	Não
21/12/2025	Shirley	(21) 981233520	Respondeu	Adulto	Lorena	Não
21/12/2025	Daniela Drago	(21) 951015090	Não respondeu	Jovem	Carmet	Não
21/12/2025	Isis Petrungaro Pereira	(21) 997032828	Não respondeu	Adulto	Wesley	Não
21/12/2025	Kandice Duarte Marchetti	(21) 982280079	Não respondeu	Adulto	Natasha	Não
21/12/2025	Mariana Albano	(21) 993612965	Não respondeu	Criança	Mariane	Não
25/12/2025	Ericson Madeira da Costa	(21) 972288001	Não respondeu	Adulto	Sebastião	Não
25/12/2025	Davi D'Almeida	dadalmeida50	Atendido	Jovem	Carmet/Arthur	Não
28/12/2025	Cristiano Ramos	(21) 988683912	Respondeu	Criança	Mariane	Não
28/12/2025	Diego Moura	(21) 970390845	Não respondeu	Adulto	Wesley	Não
28/12/2025	Ruan R. Cardoso	ruan.rocha021	Atendido	Jovem	Carmet/Arthur	Não
28/12/2025	Antonio dos Reis Gomes	(21) 994608629	Respondeu	Adulto	Sebastião	Não
28/12/2025	Fernanda Ramos Esteves	(21) 988965159	Não respondeu	Adulto	Wesley	Não
28/12/2025	Georgina Scorza	(21) 982680133	Não respondeu	Adulto	Lorena	Não
28/12/2025	Eunice Figueredo Corrêa	(21) 988892218	Não respondeu	Adulto	Wesley	Não
28/12/2025	Fernanda Rainho	(21) 964378858	Respondeu	Adulto	Wesley	Não
04/01/2026	Emanuelle Barbosa	(21) 988629318	Não respondeu	Adulto	Nélio	Não
04/01/2026	Darrien Aka	(21) 988831442	Não respondeu	Adulto	Nélio	Não
04/01/2026	Cynthia Vieira	(21) 996277223	Sem retorno do responsável	Adulto	Nélio	Não
04/01/2026	Julia Boura	(21) 996431082	Atendido	Adulto	Renata	Não
04/01/2026	Fernanda Monteiro	(27) 999566030	Não respondeu	Adulto	Renata	Não
04/01/2026	Carla Guse	(21) 998007269	Respondeu	Adulto	Natasha	Sim
04/01/2026	Danniel Maher	(21) 998511240	Atendido	Adulto	Sebastião	Sim
04/01/2026	Eduardo Fialho	(21) 991906153	Atendido	Adulto	Nélio	Não
04/01/2026	Yuri Carvalho	(21) 999561300	Atendido	Adulto	Nélio	Não
04/01/2026	Manoel Máximo Filho	(21) 995986231	Atendido	Adulto	Nélio	Não
04/01/2026	Lauro Barillari	(21) 960201415	Sem retorno do responsável	Adulto	Sebastião	Não
04/01/2026	Ingrid Mello	(21) 969194008	Respondeu	Adulto	Natasha	Não
04/01/2026	Renata Fraga	(21) 993836336	Não respondeu	Adulto	Lorena	Não
04/01/2026	Luciane Gama	(21) 981628290	Sem retorno do responsável	Adulto	Carmet/Arthur	Não
04/01/2026	Paula D. Duarte	(21) 979227979	Não respondeu	Adulto	Nélio	Não
04/01/2026	Natasha Souza	(21) 999893700	Respondeu	Adulto	Lorena	Não
04/01/2026	Rafael	(21) 982034573	Respondeu	Adulto	Lorena	Não
04/01/2026	Tainá Berba	(21) 965122713	Respondeu	Adulto	Lorena	Não
04/01/2026	Kaique Soares	(21) 998596748	Sem retorno do responsável	Jovem	Carmet/Arthur	Não
11/01/2026	Tânia Costa	(21) 984555221	Número errado	Adulto	Nélio	Não
11/01/2026	Miguel da Conceição	(21) 975172788	Atendido	Jovem	Carmet/Arthur	Não
11/01/2026	Lara Silva	(21) 968551317	Sem retorno do responsável	Adulto	Lorena	Não
11/01/2026	Maria de Lourdes	(21) 971650074	Não respondeu	Adulto	Nélio	Não
11/01/2026	Marcus Aurelius Oliveira	(21) 999054725	Respondeu	Adulto	Nélio	Não
11/01/2026	Sabrina Oliveira	(21) 998458594	Não respondeu	Adulto	Wesley	Não
11/01/2026	Tatiane Macri	(21) 991220869	Respondeu	Adulto	Wesley	Não
11/01/2026	Andrea Lima	(32) 37157985	Sem retorno do responsável	Adulto	Nelio	Não
11/01/2026	Miriam Beltrão	(21) 971881767	Sem retorno do responsável	Adulto	Lorena	Não
11/01/2026	José Jenzo Silva	(31) 998009292	Atendido	Adulto	Renata	Não
11/01/2026	Roberta Brasil	(21) 983609142	Respondeu	Adulto	Wesley	Não
11/01/2026	Luiz Vieira	(21) 997006947	Não respondeu	Adulto	Wesley	Não
14/01/2026	Erik Zabotininsky	(21) 984457990	Respondeu	Jovem	Carmet/Arthur	Não
14/01/2026	Yuri Belem	(21) 979806490	Respondeu	Jovem	Carmet/Arthur	Não
18/01/2026	Sidiane Pires	(61) 91168906	Não respondeu	Adulto	Renata	Não
18/01/2026	Wagner Saback	(61) 91168906	Não respondeu	Adulto	Renata	Não
18/01/2026	Laryssa Mendes	(21) 960184818	Respondeu	Adulto	Wesley	Não
18/01/2026	Maria José Cabral	(21) 971028632	Não respondeu	Adulto	Wesley	Não
18/01/2026	Sonia Milk	(21) 984240053	Respondeu	Adulto	Wesley	Não
18/01/2026	Cristiane Azevedo	(21) 998391969	Respondeu	Adulto	Léia	Não
21/01/2026	Camila Freiper	(71) 993739057	Atendido	Adulto	Wesley	Não
25/01/2026	Bruno Queiroz	(21) 997448571	Atendido	Adulto	Wesley	Não
25/01/2026	Ana Paula C. Figueiredo	(21) 964754203	Não respondeu	Adulto	Léia	Não
25/01/2026	Ana Maria	(21) 970063594	Não respondeu	Adulto	Wesley	Sim
25/01/2026	Vivian Peduzzi	(21) 984442006	Sem retorno do responsável	Adulto	Lorena	Não
25/01/2026	Luigi Favraud	(21) 981956484	Não respondeu	Jovem	Carmet/Arthur	Não
25/01/2026	Dulce Maria	(21) 982164989	Sem retorno do responsável	Adulto	Lorena	Não
25/01/2026	Bruno Machado	(21) 998381058	Respondeu	Adulto	Sebastião	Não
25/01/2026	Nicole Bonder	(11) 993118008	Respondeu	Adulto	Wesley	Não
28/01/2026	Karla	(21) 991441949	Não respondeu	Criança	Mariane	Não
28/01/2026	Antônio José de Oliveira	(21) 997697610	Não respondeu	Adulto	Wesley	Não
01/02/2026	Victor Nantes Baldez	(21) 971871523	Atendido	Jovem	Kevin	Não
01/02/2026	André Teixeira	(21) 998370315	Atendido	Adulto	Wesley	Não
01/02/2026	Omyra Gomes de Freitas	(24) 992091627	Atendido	Adulto	Renata	Não
01/02/2026	Rosangela de Souza Coelho	(21) 993331549	Atendido	Adulto	Wesley	Não
01/02/2026	José Jorge Silva	(31) 998009292	Atendido	Criança	Mariane	Não
01/02/2026	Paulo César Mello	(21) 981010154	Atendido	Adulto	Wesley	Não
01/02/2026	Giulia Rodrigues Macharett	(21) 999561002	Respondeu	Adulto	Léia	Não
08/02/2026	Julia Vasconcellos	(21) 995255354	Atendido	Adulto	Wesley	Não
08/02/2026	Erick Telez Gomes	(21) 972544331	Atendido	Adulto	Wesley	Não
08/02/2026	Miguel de B. Contreiras	(21) 965591389	Atendido	Adolescente	Lilian	Não
08/02/2026	Caio e Tainá	(21) 997702173	Atendido	Adulto	Wesley	Não
08/02/2026	Eduardo Palhares	(21) 981641079	Atendido	Adulto	Wesley	Não
08/02/2026	Cláudia Jeane Oliveira	(21) 975393979	Não respondeu	Adulto	Léia	Não
18/02/2026	Celso Castro	(19) 992835192	Atendido	Adulto	Wesley	Não
18/02/2026	Adriam Freitas Ribeiro	(41) 996697993	Atendido	Adulto	Renata	Não
18/02/2026	Ana Clara Cardoso	(21) 979137739	Atendido	Adulto	Renata	Não
18/02/2026	Anirya Mello	(21) 998284241	Atendido	Adulto	Wesley	Não
18/02/2026	Eliane S. Fonseca	(21) 981690741	Respondeu	Adulto	Wesley	Não
18/02/2026	Gustavo Arruda	(21) 971276828	Respondeu	Adulto	Wesley	Não
18/02/2026	Thiago Ribeiro Lucas	(21) 999350237	Sem retorno do responsável	Jovem	Kevin/Arthur	Não
18/02/2026	Enzo B. Langa	(31) 971483226	Atendido	Jovem	Renata	Não
22/02/2026	Henrique Ariodante	(21) 969046593	Não respondeu	Adulto	Wesley	Não
22/02/2026	Michele Ariodante	(21) 997992395	Não respondeu	Adulto	Wesley	Não
22/02/2026	Franciane da Silva Alves	(21) 991746982	Atendido	Adulto	Wesley	Não
22/02/2026	Robson Mendonça	(21) 968440231	Atendido	Adulto	Wesley	Não
22/02/2026	Carlos Magno Coelho	(21) 999758719	Atendido	Adulto	Wesley	Não
22/02/2026	Marta	(21) 991604841	Não respondeu	Criança	Mariane	Não
22/02/2026	Carla Faedo	(21) 986959586	Não respondeu	Adulto	Wesley	Não
22/02/2026	Lara Roberta de Sá Rego	(21) 982790746	Atendido	Adulto	Wesley	Não
22/02/2026	Natália Furlanetto	(19) 971080083	Atendido	Adulto	Renata	Não
01/03/2026	Fabio Barcellos	(21) 991788689	Respondeu	Adulto	Wesley	Não
01/03/2026	Vítor Medeiros	(11) 963502303	Atendido	Adulto	Wesley	Não
01/03/2026	Marina Contin	(19) 999576615	Atendido	Adulto	Wesley	Não
01/03/2026	Marcelo Ottoni de Carvalho	(21) 964827434	Não respondeu	Adulto	Wesley	Não
01/03/2026	Maria Vitória Borges	(21) 966777862	Sem retorno do responsável	Adolescente	Lilian	Não
01/03/2026	Caroline Duarte	(21) 988478578	Atendido	Adulto	Wesley	Não
01/03/2026	Gabriel Queiroz Vaga	(21) 993506543	Não respondeu	Adulto	Wesley	Não
01/03/2026	Alessandro Peloso	(21) 990926565	Atendido	Adulto	Wesley	Não
01/03/2026	Maria Islem	(21) 977219009	Atendido	Adulto	Wesley	Não
01/03/2026	Tito Faedo Miranda	(21) 986959586	Atendido	Adulto	Wesley	Não
01/03/2026	Felipe Medeiros	(21) 970141470	Atendido	Adulto	Wesley	Não
01/03/2026	Pietro dos Santos Barbosa	(21) 993710460	Sem retorno do responsável	Jovem	Kevin/Arthur	Não
01/03/2026	Maria Luiza	(21) 979216462	Sem retorno do responsável	Adolescente	Lilian	Não
08/03/2026	Elton Araujo C. Regis	(21) 959335666	Atendido	Adulto	Wesley	Não
15/03/2026	Glacy Kelly Bisaggio	(21) 988879186	Atendido	Adulto	Wesley	Não
15/03/2026	Bráulio Fagundes	(21) 996172130	Respondeu	Adulto	Wesley	Não
15/03/2026	João Ulter	(21) 979776644	Não respondeu	Adulto	Wesley	Não
15/03/2026	Priscila Montello	(21) 966737244	Não respondeu	Adulto	Wesley	Não
15/03/2026	Fernando Montalvão	(21) 969903313	Atendido	Adulto	Wesley	Não
15/03/2026	Fernanda	(21) 981672332	Não respondeu	Criança	Mariane	Não
15/03/2026	Danielle Contrucci	(21) 999934793	Atendido	Adulto	Wesley	Sim
15/03/2026	Gisele Ozom	(21) 982934286	Atendido	Adulto	Wesley	Sim
15/03/2026	Amanda Gouvêa	(21) 965650634	Respondeu	Adulto	Wesley	Não
15/03/2026	Kátia Dantas	(21) 990696871	Atendido	Adulto	Wesley	Não
15/03/2026	Elizabeth Rosa	(21) 997711643	Não respondeu	Adulto	Wesley	Não
15/03/2026	Pedro Moreira Gonçalez	(21) 970079969	Respondeu	Adulto	Wesley	SIm
23/03/2026	Enio Gouveia Saback	(21) 997908168	Respondeu	Adulto	Wesley	Não
23/03/2026	Gabriel Torres	(21) 967415406	Não respondeu	Adulto	Wesley	Não
23/03/2026	Julia Loja	(21) 981099992	Atendido	Adulto	Wesley	Não
23/03/2026	Helio Muniz Cardoso	(21) 988491193	Respondeu	Adulto	Wesley	Não
23/03/2026	Jaqueline Farias	(21) 986932054	Não respondeu	Adulto	Wesley	Não
23/03/2026	Rodrigo Miranda	(21) 972349320	Não respondeu	Adulto	Wesley	Não
23/03/2026	Bianca Guimarães	(21) 983233797	Respondeu	Adulto	Wesley	Não
23/03/2026	Anderson Luciano	(21) 968986183	Respondeu	Adulto	Wesley	Não
23/03/2026	Marcia Siller	(21) 997603076	Não respondeu	Adulto	Wesley	Não
29/03/2026	Carolina Marie Vieira	(21) 982615418	Respondeu	Adulto	Wesley	Não
29/03/2026	Ricardo Barreira	(21) 975557287	Respondeu	Adulto	Wesley	Sim
29/03/2026	Gonzalo Caldas	(21) 997470707	Respondeu	Jovem	Arthur/Kevin	Não
29/03/2026	Mauro Cesar Ramos Nunes	(21) 964783044	Respondeu	Adulto	Wesley	Não
29/03/2026	Célia Maria de Assis	(31) 999531655	Sem retorno do responsável	Adulto	Renata	Não
29/03/2026	Alberto de Souza Magalhães	(21) 987672877	Atendido	Adulto	Wesley	Não
29/03/2026	Rafael Calderaro	(21) 972281710	Atendido	Adulto	Wesley	Não
29/03/2026	Suely Calderaro	(21) 999811956	Atendido	Adulto	Wesley	Não
29/03/2026	Calebe Mota de Araujo Lopes	(21) 993224581	Sem retorno do responsável	Adolescente	Lilian	Não
29/03/2026	Juliana Alzuguir	(21) 996413833	Não respondeu	Adulto	Wesley	Não
29/03/2026	Luciana Carvalho	(21) 996620605	Atendido	Criança	Mariane	Não
29/03/2026	Maria Paula Neves	(21) 975634114	Sem retorno do responsável	Jovem	Arthur/Kevin	Não
05/04/2026	Elaine Lucena	(21) 972910522	Não atendido	Adulto	Nélio	Não
05/04/2026	Vanusa Medeiros	(21) 979624776	Atendido e respondido	Criança	Mariane	Não
05/04/2026	Eleonora Lyra Gonçalves	(21) 972934550	Atendido e respondido	Adulto	Wesley	Não
05/04/2026	Maria Luiza de Freitas	(21) 982222832	Atendido e respondido	Adulto	Wesley	Não
05/04/2026	Andre Monteiro	(32) 988102024	Atendido e respondido	Adulto	Renata	Não
05/04/2026	Juliana Torres Moreira	(21) 997401817	Atendido e respondido	Adolescente	Lilian	Não
05/04/2026	Matheus Vicente	(21) 994720820	Atendido e respondido	Adolescente	Lilian	Não
05/04/2026	Ana Paula H. de Araujo	(21) 991378891	Atendido e respondido	Adulto	Wesley	Não
05/04/2026	Djalma Mello	(21) 974145376	Atendido e respondido	Adulto	Wesley	Não
05/04/2026	Lucas Saddy	(21) 995640677	Atendido e respondido	Jovem	Arthur	Não
05/04/2026	Gardênia	(21) 967096580	Não atendido	Adulto	Wesley	Não
05/04/2026	Solano Castro C. Pinto	(21) 996557316	Atendido e respondido	Adulto	Wesley	Sim
05/04/2026	Flávia Mesquita	(21) 984615678	Atendido e respondido	Criança	Mariane	Não
05/04/2026	Jane Carvalho	(21) 986195017	Não atendido	Adulto	Wesley	Não
12/04/2026	Patrick Machado	(21) 970117254	Atendido e respondido	Adulto	Wesley	Sim
12/04/2026	Roberta Grassano	(21) 996197744	Não atendido	Adulto	Nélio	Não
12/04/2026	Alexandre Lemos	(21) 993809226	Atendido e respondido	Adulto	Wesley	Não
12/04/2026	Caio Penoni	(21) 988983615	Atendido e respondido	Adulto	Wesley	Não
12/04/2026	Jeremias Voazem	(21) 987828851	Atendido e respondido	Criança	Mariane	Sim
12/04/2026	Carlos Cleber A. Barbosa	(61) 986192881	Não respondeu	Adulto	Nélio	Não
12/04/2026	Júlia Sarruf	(21) 975516005	Não respondeu	Adulto	Wesley	Não
12/04/2026	Patrícia Costa	(21) 968753064	Não respondeu	Adulto	Wesley	Não
05/04/2026+D239A221:D2A221:D249	Elaine Lucena	(21) 972910522	Não atendido	Adulto	Lorena	Não
05/04/2026	Vanusa Medeiros	(21) 979624776	Atendido e respondido	Jovem	Arthur	Não
05/04/2026	Eleonora Lyra Gonçalves	(21) 972934550	Atendido e respondido	Adulto	Nélio	Sim
05/04/2026	Maria Luiza de Freitas	(21) 982222832	Atendido e respondido	Jovem	Arthur	Não
05/04/2026	Andre Monteiro	(32) 988102025	Atendido e respondido	Adulto	Wesley	Não
05/04/2026	Juliana Torres Moreira	(21) 997401817	Atendido e respondido	Adulto	Wesley	Não
05/04/2026	Matheus Vicente	(21) 994720820	Atendido e respondido	Adolescente	Lilian	Não
05/04/2026	Ana Paula H. de Araujo	(21) 991378891	Atendido e respondido	Adulto	Wesley	Sim
05/04/2026	Djalma Mello	(21) 974145376	Atendido e respondido	Adulto	Nélio	Não
05/04/2026	Lucas Saddy	(21) 995640677	Atendido e respondido	Jovem	Arthur	Não
05/04/2026	Gardênia	(21) 967096580	Não atendido	Adulto	Wesley	Não
05/04/2026	Solano Castro C. Pinto	(21) 996557316	Atendido e respondido	Adulto	Wesley	Não
05/04/2026	Flávia Mesquita	(21) 984615678	Atendido e respondido	Adulto	Wesley	Sim
05/04/2026	Jane Carvalho	(21) 986195017	Não atendido	Adulto	Wesley	Não
12/04/2026	Patrick Machado	(21) 970117254	Atendido e respondido	Criança	Mariane	Sim
12/04/2026	Roberta Grassano	(21) 996197744	Não atendido	Adolescente	Lilian	Não
12/04/2026	Alexandre Lemos	(21) 993809226	Atendido e respondido	Adulto	Nélio	Sim
12/04/2026	Caio Penoni	(21) 988983615	Atendido e respondido	Adulto	Wesley	Sim
12/04/2026	Jeremias Voazem	(21) 987828851	Atendido e respondido	Jovem	Arthur	Não
12/04/2026	Carlos Cleber A. Barbosa	(61) 986192882	Não respondeu	Jovem	Arthur	Não
12/04/2026	Júlia Sarruf	(21) 961990123	Não respondeu	Adulto	Wesley	Sim
12/04/2026	Patrícia Costa	(21) 955227182	Não respondeu	Adulto	Nélio	Não
05/04/2026+D239A221:D2A221:D250	Elaine Lucena	(21) 972910522	Não atendido	Adulto	Wesley	Não
03/05/2026	Gilberto Carvalho Pereira	(21) 999887411	Atendido e respondido	Adulto	Wesley	Não
03/05/2026	Renato	(21) 988148910	Atendido e respondido	Adulto	Nélio	Não
03/05/2026	Ana Beatriz Martins	(21) 979929369	Atendido e respondido	Adolescente	Lilian	Não
03/05/2026	Luana Martins	(21) 976104192	Atendido e respondido	Adulto	Wesley	Sim
03/05/2026	Matheus Costa	(21) 986335733	Atendido e respondido	Jovem	Arthur Seconi	Não
03/05/2026	Luiz Carlos	(11) 971265050	Não atendido	Adulto	Renata	Não
03/05/2026	Jecia Fidelis	(21) 986454276	Atendido e respondido	Adulto	Wesley	Não
03/05/2026	Lucas Marçal	(21) 973639040	Atendido e respondido	Jovem	Arthur Seconi	Não
03/05/2026	Helio Souza	(19) 992395670	Atendido e respondido	Adulto	Wesley	Sim
03/05/2026	Alessandra	(21) 997631894	Não atendido	Adulto	Nélio
03/05/2026	Marcelo Dias	(21) 996740024	Atendido e respondido	Adulto	Wesley
03/05/2026	Maria Cristina da Silva	(21) 996099376	Atendido e respondido	Adulto	Wesley
10/05/2026	Lucas Abreu	(21) 971149723	Atendido e respondido	Jovem	Arthur Seconi	Sim
10/05/2026	Orestes Junior	(21) 966876687	Atendido e respondido	Adulto	Nélio	Não
10/05/2026	Junior José	(21) 966467534	Não respondeu	Adulto	Wesley	Não
10/05/2026	Maria Júlia Gomes	(21) 992491435	Não respondeu	Adulto	Wesley	Não
10/05/2026	Ana Carolina Pires	(21) 975730353	Não atendido	Adulto	Nélio	Não
10/05/2026	Nielson Abreu	(21) 984501015	Atendido e respondido	Adulto	Nélio	Não
10/05/2026	Ricardo Marconi Ferreira	(21) 964131266	Atendido e respondido	Adulto	Wesley	Não
10/05/2026	Felipe	(21) 987782793	Atendido e respondido	Adulto	Wesley	Não
10/05/2026	Valdnei Ferreira	(21) 965631601	Número errado	Adulto	Nélio	Não
17/05/2026	Bruno Rollin	(21) 997978023	Atendido e respondido	Adulto	Wesley	Não
17/05/2026	Thaisse Mendes	(21) 979303333	Atendido e respondido	Adulto	Wesley	Não
17/05/2026	Denise Neves	(21) 981559190	Não respondeu	Adulto	Wesley	Não
17/05/2026	Renata Ribeiro	(21) 965803200	Não respondeu	Adulto	Wesley	Não
17/05/2026	Guilherme Curi	(21) 976072237	Atendido e respondido	Jovem	Arthur Seconi	Não
17/05/2026	Marcelo Brandão	(21) 966022211	Atendido e respondido	Adulto	Wesley	Não
17/05/2026	Danniele Lima	(21) 971127228	Não respondeu	Adulto	Nélio	Não
17/05/2026	Luana Roizewblit	(21) 996843010	Atendido e respondido	Jovem	Arthur Seconi	Não
17/05/2026	Rebeca Castelo	(21) 998348236	Não respondeu	Adulto	Wesley	Não
20/05/2026	Alessandra Totti	(21) 988981654	Não respondeu	Adulto	Wesley	Não
20/05/2026	Rafael Escobar	(21) 969147309	Atendido e respondido	Adulto	Wesley	Não
20/05/2026	Alessandra	(21) 998011065	Atendido e respondido	Criança	Mariane	Não
20/05/2026	Joana Aguiar	(21) 983502790	Não atendido	Adulto	Nélio	Não
24/05/2026	Rosa Lisboa Carreira	(21) 999820001	Atendido e respondido	Adulto	Wesley	Não
24/05/2026	Jaqueline Brito	(21) 991039126	Atendido e respondido	Adulto	Wesley	Não
24/05/2026	Guilherme Alcoforado	(21) 982685366	Não atendido	Adulto	Nélio	Não
24/05/2026	Juliana Villa	(21) 981217111	Atendido e respondido	Adulto	Wesley	Não
24/05/2026	João Luis	(22) 999467247	Atendido e respondido	Jovem	Arthur Cecconi	Não
24/05/2026	Madalena Santos	(21) 972610021	Atendido e respondido	Adulto	Wesley	Não
24/05/2026	Joaquim Souza	(21) 965908228	Atendido e respondido	Adulto	Wesley	Não
24/05/2026	Roberta Gonçalves	(21) 986722009	Atendido e respondido	Adulto	Wesley	Não
24/05/2026	Carlos Eduardo França	(21) 993335000	Não atendido	Adulto	Nélio	Não
24/05/2026	Carlos Bezerra	(21) 979804025	Não respondeu	Adulto	Wesley	Não
31/05/2026	João Ricardo Pereira	(21) 980278000	Atendido e respondido	Adulto	Wesley
31/05/2026	Nicole Veronezi	(21) 980175258	Atendido e respondido	Adulto	Wesley
31/05/2026	Cristina Pimentel	(21) 982400313	Atendido e respondido	Adulto	Wesley
31/05/2026	Bruno Rosario Ramos	(21) 984692833	Atendido e respondido	Adulto	Wesley
31/05/2026	Joelma de Oliveira	(21) 991657511	Atendido e respondido	Adulto	Wesley
31/05/2026	Roberta Cavalliere	(21) 965325091	Atendido e respondido	Adulto	Wesley
31/05/2026	Fernanda Fragoso	(21) 964222237	Atendido e respondido	Jovem	Arthur Cecconi
31/05/2026	Athirson Mazoli	(21) 981419129	Atendido e respondido	Adulto	Wesley
31/05/2026	Mirian Dantas	(21) 998022081	Atendido e respondido	Adulto	Wesley
10/06/2026	Pedro Pontes	(21) 967799930	Atendido e respondido	Adulto	Wesley
07/06/2026	Paula Freitas	(21) 995484001	Atendido e respondido	Adulto	Wesley
07/06/2026	Guilherme Pereira	(21) 995001415	Atendido e respondido	Adulto	Wesley
07/06/2026	Tânia Cristina Gonçalves	(21) 979120515	Atendido é respondido	Adulto	Nélio
07/06/2026	Ana Luiza Vieira	(21) 997006926	Atendido e respondido	Jovem	Arthur Cecconi
07/06/2026	Suelen Duarte	(21) 991622913	Atendido e respondido	Adulto	Wesley
07/06/2026	Beatriz Elias	(21) 974396095	Adulto	Renata
07/06/2026	Flávio Cerus	(21) 964802987	Não respondeu	Adulto	Wesley
07/06/2026	Rafael de Souza Oliveira	(21) 983283516	Atendido e respondido	Jovem	Arthur Cecconi
14/06/2026	Luana Soares	(21) 999544403	Atendido e respondido	Adulto	Wesley
14/06/2026	Bruno Fernandes	(21) 999008844	Atendido e respondido	Adulto	Wesley
14/06/2026	Julia Fernandes	(21) 999916476	Atendido e respondido	Adulto	Wesley	Sim
`;

const FAIXAS = { 'adulto': 'sede', 'jovem': 'ami', 'adolescente': 'bridge', 'on line': 'online', 'criança': 'kids', 'crianca': 'kids' };
const FAIXA_SET = new Set(Object.keys(FAIXAS));

// label de status (PT) → slug. Remove acentos pra casar "Atendido e/é respondido".
function statusSlug(s) {
  const t = String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!t) return null;
  if (t.startsWith('atendido e respondido') || t.startsWith('atendido respondido')) return 'atendido_respondido';
  if (t.startsWith('atendid')) return 'atendido';            // Atendido / Atendida
  if (t.startsWith('respondeu')) return 'respondeu';
  if (t.startsWith('nao respondeu')) return 'nao_respondeu';
  if (t.startsWith('nao compareceu')) return 'nao_compareceu';
  if (t.startsWith('nao atendido')) return 'nao_atendido';
  if (t.startsWith('sem retorno')) return 'sem_retorno';
  if (t.startsWith('numero errado')) return 'numero_errado';
  return null;
}

const ST_META = {
  respondeu: { atendido: false, contato: true },
  atendido: { atendido: true, contato: true },
  atendido_respondido: { atendido: true, contato: true },
  nao_respondeu: { atendido: false, contato: false },
  nao_compareceu: { atendido: false, contato: false },
  nao_atendido: { atendido: false, contato: false },
  sem_retorno: { atendido: false, contato: false },
  numero_errado: { atendido: false, contato: false },
};

const norm = (s) => String(s || '').trim().toLowerCase();
const onlyDigits = (s) => String(s || '').replace(/\D/g, '');

function parseData(campo) {
  const m = String(campo || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  let [, dd, mm, yyyy] = m;
  if (yyyy === '2020') yyyy = '2025'; // erro óbvio (planilha começa em out/2025)
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function parseRaw() {
  const linhas = RAW.split('\n').map(l => l.trim()).filter(Boolean);
  const seen = new Set();
  const rows = [];
  const ignoradas = [];
  for (const linha of linhas) {
    const campos = linha.split(/\t|\s{2,}/).map(c => c.trim()).filter(c => c !== '');
    if (campos.length < 4) { ignoradas.push(linha); continue; }
    const data = parseData(campos[0]);
    if (!data) { ignoradas.push(linha); continue; }
    const nome = campos[1];
    const contato = campos[2];
    let statusRaw, faixa, responsavel;
    if (FAIXA_SET.has(norm(campos[3]))) {   // status em branco → campos[3] já é a faixa
      statusRaw = ''; faixa = campos[3]; responsavel = campos[4] || '';
    } else {
      statusRaw = campos[3]; faixa = campos[4] || ''; responsavel = campos[5] || '';
    }
    const chave = `${data}|${norm(nome)}`;
    if (seen.has(chave)) continue;   // dedup → derruba o bloco duplicado de abril
    seen.add(chave);
    rows.push({ data, nome, contato, status: statusSlug(statusRaw), faixa: norm(faixa), responsavel });
  }
  return { rows, ignoradas };
}

async function fetchAllConvertidos() {
  const all = [];
  let offset = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from('cui_convertidos')
      .select('id, nome, data_culto, telefone, area, primeiro_contato_status, primeiro_contato_em, atendido_apos_culto')
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
  const { rows, ignoradas } = parseRaw();
  console.log(`Linhas parseadas (após dedup): ${rows.length} · ignoradas: ${ignoradas.length}`);

  const kids = rows.filter(r => FAIXAS[r.faixa] === 'kids');
  const semFaixa = rows.filter(r => !FAIXAS[r.faixa]);
  const aImportar = IMPORTAR_KIDS
    ? rows.filter(r => FAIXAS[r.faixa])
    : rows.filter(r => FAIXAS[r.faixa] && FAIXAS[r.faixa] !== 'kids');

  console.log(`Crianças (Faixa = Criança): ${kids.length} ${IMPORTAR_KIDS ? '(serão importadas · IMPORTAR_KIDS=1)' : '(EXCLUÍDAS · use IMPORTAR_KIDS=1 pra incluir)'}`);
  if (kids.length) console.log('  ' + kids.map(k => k.nome).join(', '));
  if (semFaixa.length) console.log(`Faixa desconhecida (não importados): ${semFaixa.length} → ${semFaixa.map(r => `${r.nome}[${r.faixa}]`).join(', ')}`);
  console.log(`A processar: ${aImportar.length}`);

  const tally = {};
  aImportar.forEach(r => { tally[r.status || 'sem_status'] = (tally[r.status || 'sem_status'] || 0) + 1; });
  console.log('Distribuição de status:');
  Object.entries(tally).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k.padEnd(22)} ${v}`));
  const pos = aImportar.filter(r => ['respondeu', 'atendido', 'atendido_respondido'].includes(r.status)).length;
  const den = aImportar.filter(r => r.status !== 'numero_errado').length;
  console.log(`Primeiro contato: ${pos}/${den} = ${den ? Math.round(pos / den * 1000) / 10 : 0}%`);

  const existentes = await fetchAllConvertidos();
  console.log(`\ncui_convertidos existentes (ativos): ${existentes.length}`);
  const porNomeData = new Map();
  const porTelefone = new Map();
  for (const r of existentes) {
    porNomeData.set(`${norm(r.nome)}|${r.data_culto}`, r);
    const t = onlyDigits(r.telefone);
    if (t.length >= 10 && !porTelefone.has(t)) porTelefone.set(t, r);
  }

  const updates = [], inserts = [];
  for (const r of aImportar) {
    const area = FAIXAS[r.faixa];
    const meta = r.status ? ST_META[r.status] : null;
    const tel = onlyDigits(r.contato);
    const existente = porNomeData.get(`${norm(r.nome)}|${r.data}`) || (tel.length >= 10 ? porTelefone.get(tel) : null);

    if (existente) {
      const patch = { primeiro_contato_status: r.status || null };
      if (meta && meta.atendido) patch.atendido_apos_culto = true;
      if (meta && meta.contato && !existente.primeiro_contato_em) patch.primeiro_contato_em = `${r.data}T12:00:00.000Z`;
      if (area && !existente.area) patch.area = area;
      updates.push({ id: existente.id, nome: r.nome, patch });
    } else {
      inserts.push({
        data_culto: r.data,
        nome: r.nome.trim(),
        telefone: r.contato || null,
        area,
        cadastrado: false,
        atendido_apos_culto: !!(meta && meta.atendido),
        primeiro_contato_status: r.status || null,
        ...(meta && meta.contato ? { primeiro_contato_em: `${r.data}T12:00:00.000Z` } : {}),
        observacoes: `Importado da planilha Acompanhamento de Jornada (Marcelo)${r.responsavel ? ` · Responsável: ${r.responsavel}` : ''}`,
      });
    }
  }

  console.log(`\nVai ATUALIZAR (casou existente): ${updates.length}`);
  console.log(`Vai INSERIR (novo): ${inserts.length}`);

  if (DRY) {
    console.log('\n[DRY RUN] nada gravado. Exemplos de insert:');
    inserts.slice(0, 6).forEach(i => console.log('  +', i.data_culto, i.nome, `[${i.area}]`, i.primeiro_contato_status));
    console.log('Exemplos de update:');
    updates.slice(0, 6).forEach(u => console.log('  ~', u.nome, JSON.stringify(u.patch)));
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

if (require.main === module) {
  main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { parseRaw, FAIXAS, FAIXA_SET, statusSlug };
