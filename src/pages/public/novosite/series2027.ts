/**
 * CONTEÚDO da aba de Séries do site (cbrio.com.br/series).
 *
 * É o ÚNICO arquivo a editar para preencher/atualizar as séries do ano.
 * Nada aqui é "publicado" à mão: cada mensagem libera vídeo e PDF sozinha
 * quando a DATA dela chega (dia BRT · regra em src/lib/seriesSite.ts).
 *
 * Como preencher uma série:
 *   - titulo: null  → o card do mês aparece como "Série em breve".
 *   - slug: vira o endereço (/series/<slug>) · minúsculas, hífen, sem acento.
 *     ⚠️ NÃO trocar o slug depois de divulgado: link compartilhado quebra.
 *   - imagem: arte da série em /public/series/2027/<arquivo>.webp (opcional ·
 *     sem imagem o card usa o degradê de `cor`).
 *   - pdf / devocional.pdf / mensagem.pdf: arquivos em /public/series/2027/.
 *     Caminho começando com "/" (ex.: '/series/2027/fevereiro-guia.pdf').
 *   - youtube: o ID ou a URL do vídeo da pregação (entra depois do culto).
 *
 * ⚠️ Arquivo PÚBLICO: nada de nome de membro, telefone ou dado pessoal aqui.
 */

export type Mensagem = {
  /** 'YYYY-MM-DD' · dia do culto. Antes disso, a mensagem aparece como "em breve". */
  data: string;
  titulo: string;
  /** Texto bíblico abordado, ex.: 'João 3:1-21' (ausente = ainda não definido). */
  texto?: string;
  pregador?: string;
  resumo?: string;
  /** ID ou URL do YouTube. */
  youtube?: string;
  /** PDF da mensagem (esboço/anotações). */
  pdf?: string;
};

export type Devocional = {
  titulo: string;
  descricao?: string;
  /** PDF do devocional da série. */
  pdf?: string;
  /** Link externo (ex.: plano no app). */
  url?: string;
};

export type Serie = {
  slug: string;
  mes: number; // 1..12
  titulo: string | null;
  subtitulo?: string;
  /** Objetivo da série (o "por quê" que os pastores definiram). */
  objetivo?: string;
  /** Textos bíblicos-base da série. */
  textos?: string[];
  /** Duas cores do degradê do card quando não há imagem. */
  cor: [string, string];
  imagem?: string;
  /** PDF geral da série (guia de estudo, material para grupos). */
  pdf?: string;
  devocional?: Devocional;
  mensagens: Mensagem[];
};

export const ANO_SERIES = 2027;

/** Tema anual (vem dos pastores). `titulo: null` esconde o bloco. */
export const TEMA_ANUAL: { titulo: string | null; descricao?: string; versiculo?: string; referencia?: string } = {
  titulo: 'Coragem',
  versiculo: 'Porque Deus não nos deu espírito de covardia, mas de poder, de amor e de moderação.',
  referencia: '2 Timóteo 1:7',
};

/** Uma série por mês · fonte: planilha "Séries de Pregação 2027" (pastores, set/2026). */
export const SERIES: Serie[] = [
  {
    slug: "eis-que-faco-uma-coisa-nova-2027",
    mes: 1,
    titulo: "Eis que faço uma coisa nova",
    objetivo: "Coragem para o novo. Coragem para enxergar o futuro. Coragem para transformações. Coragem para uma nova profundidade. Coragem para enfrentar as incertezas.",
    cor: ['#00839D', '#00ACB3'],
    mensagens: [
      { data: "2027-01-03", titulo: "Diga ao povo que marche", texto: "Exôdo 14:15", resumo: "Chamado ao avanço para o plano de Deus. Pregação em torno de coragem." },
      { data: "2027-01-10", titulo: "Os Sonhos de Deus", texto: "Isaías 43:19", resumo: "Abrir os olhos da comunidade para aquilo que Deus já está fazendo (perceber) e o que Ele quer fazer (futuro)" },
      { data: "2027-01-17", titulo: "Revelando sua singularidade", texto: "Josué 3:1-17", resumo: "Existe uma particularidade em você que te permite fazer algo maior. O objetivo é mostra algo único que Deus colocou em cada pessoa." },
      { data: "2027-01-24", titulo: "Santifiquem-se", texto: "Jeremias 1:1-10", resumo: "Incentivar a comunidade à santificação, se preparando para aquilo que Deus irá fazer de acordo com a visão que temos." },
      { data: "2027-01-31", titulo: "Águas profundas", texto: "Ezequiel 47", resumo: "Convidar a comunidade a se movimentar no espiritual." },
    ],
  },
  {
    slug: "coragem-2027",
    mes: 2,
    titulo: "Coragem",
    subtitulo: "Tema anual",
    objetivo: "Coragem para liderar.",
    cor: ['#2F4858', '#00839D'],
    mensagens: [
      { data: "2027-02-07", titulo: "Coragem para não se curvar", texto: "Daniel 3", resumo: "Diante de uma semana de carnaval, falar sobre o perigo da idolatria." },
      { data: "2027-02-14", titulo: "Coragem para enfrentar o medo", texto: "2 Timóteo 1:7; Romanos 8:15; Números 13; Mateus 14", resumo: "Mostrar como o medo pode nos impedir que vivamos o extraordinário de Deus. Incentivando a fé no que Deus tem para fazer." },
      { data: "2027-02-21", titulo: "Coragem para liderar", texto: "Josué 1:9; Êxodo 3 e 4; Juízes 6:15", resumo: "Explorar o exemplo de pessoas que não queriam ser líderes, mas foram chamados a isso e se tornaram. Para ativar novos líderes." },
      { data: "2027-02-28", titulo: "Coragem para agir", texto: "Atos 4:31; Ester 4:14-16", resumo: "Incentivar a igreja a agir. Dar senso de autorresponsabilidade no reino e na igreja de Cristo." },
    ],
  },
  {
    slug: "ainda-ha-lugar-na-mesa-2027",
    mes: 3,
    titulo: "Ainda há lugar na mesa",
    subtitulo: "O Grande Banquete",
    objetivo: "Coragem para se relacionar. Coragem para se envolver. Coragem para sentar em uma mesa nova. Coragem para se comprometer. Coragem para ser vulnerável.",
    cor: ['#8E9562', '#C9B37E'],
    mensagens: [
      { data: "2027-03-07", titulo: "A necessidade da mesa", texto: "Tiago 5:16; 2 Samuel 9:1-13", resumo: "Há um desejo de Deus para que nos relacionemos, com Ele e com os outros." },
      { data: "2027-03-14", titulo: "A mesa cura (ou destrói)", texto: "Salmos 1", resumo: "Discorrer sobre influências. Na mesa de Cristo Jesus encontramos cura e salvação e desvio na mesa dos escarnecedores." },
      { data: "2027-03-21", titulo: "Todos são convidados", texto: "Lucas 14:15-24; Efésios 3:4-6", resumo: "Mostrar como Deus convida todas pessoas à salvação e incentivar a comunidade a convidar pessoas para a páscoa." },
      { data: "2027-03-28", titulo: "Páscoa · O Grande Banquete", texto: "1 Timóteo 2:4-6; 2 Pedro 3:9", resumo: "Mostrar a mensagem da cruz e que Deus deseja que todos sejam salvos, convidando as pessoas a aceitarem Jesus." },
    ],
  },
  {
    slug: "mentiroso-maluco-ou-messias-2027",
    mes: 4,
    titulo: "Mentiroso, Maluco ou Messias",
    subtitulo: "Em defesa de Cristo",
    objetivo: "Coragem para ser transformado. Coragem para se render. Coragem para acreditar. Coragem para uma nova vida. Coragem para morrer.",
    cor: ['#00ACB3', '#7CC6C2'],
    mensagens: [
      { data: "2027-04-04", titulo: "Jesus realmente existiu?", texto: "1 João 1:2", resumo: "Mostrar de maneira persuasiva as evidências, comprovações históricas de que Jesus realmente existiu. E os impactos práticos disso." },
      { data: "2027-04-11", titulo: "Jesus realmente é o Messias?", texto: "Isaías 53; João 8:58; João 4", resumo: "Evidenciar como o cumprimento de profecias mostra que Jesus Cristo realmente é o Messias enviado de Deus." },
      { data: "2027-04-18", titulo: "Jesus realmente ressuscitou?", texto: "1 Coríntios 14:15; 1 Coríntios 15:6", resumo: "Evidenciar como a ressurreição realmente aconteceu, através das testemunhas oculares, túmulo vazio, devoção dos discípulos e a consequência da vinda do Espírito Santo." },
      { data: "2027-04-25", titulo: "Jesus realmente vai voltar?", texto: "João 14:2-3; Atos 1:11", resumo: "Mostrar como a Bíblia aponta a realidade que Cristo Jesus realmente vai voltar um dia. Cristo prometeu isso e Ele fala sobre isso." },
    ],
  },
  {
    slug: "entre-domingos-2027",
    mes: 5,
    titulo: "Entre Domingos",
    objetivo: "Coragem para se aprofundar. Coragem para amadurecer. Coragem para ser constante. Coragem para ter disciplina. Coragem para novos hábitos. Coragem para sair da zona de conforto. Coragem para novas prioridades.",
    cor: ['#5B4B8A', '#00839D'],
    mensagens: [
      { data: "2027-05-02", titulo: "Oração" },
      { data: "2027-05-09", titulo: "Leitura da Bíblia" },
      { data: "2027-05-16", titulo: "Jejum" },
      { data: "2027-05-23", titulo: "Adoração" },
      { data: "2027-05-30", titulo: "Ser testemunha" },
    ],
  },
  {
    slug: "love-killers-2027",
    mes: 6,
    titulo: "Love Killers",
    objetivo: "Coragem para se relacionar. Coragem para amar.",
    textos: ["1 João 2:16"],
    cor: ['#B5654A', '#E0A46B'],
    mensagens: [
      { data: "2027-06-06", titulo: "A ira que destrói o amor", texto: "Efésios 4:26-27" },
      { data: "2027-06-13", titulo: "A lúxuria que destrói o amor", texto: "1 Tessalonicenses 4:3-5" },
      { data: "2027-06-20", titulo: "O dinheiro que destrói o amor", texto: "Mateus 6:24; Lucas 18:18-30" },
      { data: "2027-06-27", titulo: "A soberba que destrói o amor", texto: "Filipenses 2:3; 1 Coríntios 5:6" },
    ],
  },
  {
    slug: "vozes-2027",
    mes: 7,
    titulo: "Vozes",
    objetivo: "Coragem para ouvir novas pessoas. Coragem para encarar o novo. Coragem para furar a bolha. Coragem para enfrentar o incerto. Coragem para o desconhecido.",
    cor: ['#1F6F78', '#8E9562'],
    mensagens: [
      { data: "2027-07-04", titulo: "Encorajamento" },
      { data: "2027-07-11", titulo: "Mensagem a definir" },
      { data: "2027-07-18", titulo: "Mensagem a definir" },
      { data: "2027-07-25", titulo: "Mensagem a definir" },
    ],
  },
  {
    slug: "acorda-2027",
    mes: 8,
    titulo: "Acorda",
    objetivo: "Coragem para dar novos passos. Coragem para agir. Coragem para se conectar. Coragem para pertencer. Coragem para continuar avançando.",
    cor: ['#00839D', '#2F4858'],
    mensagens: [
      { data: "2027-08-01", titulo: "Acorda pra resenha (Pedro)", texto: "Atos 12:6–17", resumo: "Pedro acorda na prisão, é liberto e vai encontrar os irmãos reunidos na casa de Maria." },
      { data: "2027-08-08", titulo: "Acorda pra vida (Thalita Cumi)", texto: "Marcos 5:35–43", resumo: "A menina acorda para a vida após a palavra de Jesus." },
      { data: "2027-08-15", titulo: "Acorda para ouvir (Êutico)", texto: "Atos 20:7–12", resumo: "Êutico dormia enquanto a palavra estava sendo pregada, devemos acordar para o que Deus quer falar." },
      { data: "2027-08-22", titulo: "Acorda para orar (Discípulos)", texto: "Mateus 26:36–46", resumo: "Os discípulos dormiam enquanto Jesus os convocava para orar. É hora de acordar para uma vida de oração." },
      { data: "2027-08-29", titulo: "Acorda pra missão (Jonas)", texto: "Jonas 1:1-6", resumo: "Jonas dormia enquanto estava indo para Társis e recusando seu chamado à missão de Deus." },
    ],
  },
  {
    slug: "linhas-tortas-2027",
    mes: 9,
    titulo: "Linhas tortas",
    objetivo: "Coragem para confiar. Coragem para se frustrar. Coragem para enfrentar os momentos ruins. Coragem para olhar além. Coragem para ter fé.",
    cor: ['#9C4F5B', '#D98A7E'],
    mensagens: [
      { data: "2027-09-05", titulo: "José: do poço ao palácio", texto: "Gênesis 37 e 50:15–21" },
      { data: "2027-09-12", titulo: "Rute: quando não sobra nada para o beta", texto: "Rute 1–4" },
      { data: "2027-09-19", titulo: "Daniel: fiel numa terra que não é sua", texto: "Daniel 6" },
      { data: "2027-09-26", titulo: "Emaús: o plano era esse", texto: "Lucas 24:13–35" },
    ],
  },
  {
    slug: "eu-robo-2027",
    mes: 10,
    titulo: "Eu Robô",
    objetivo: "Coragem para se desconectar. Coragem para parar. Coragem para mudar. Coragem para descansar. Coragem para ser humano. Coragem para criar. Coragem para inovar. Coragem para ir na contramão.",
    cor: ['#3E6B48', '#8E9562'],
    mensagens: [
      { data: "2027-10-03", titulo: "Velocidade x Descanso/Pausa", texto: "Mateus 11:28-30; Hebreus 4:11; Gênesis 2:2-3", resumo: "Mostrar a importância do descanso em detrimento a urgência atual" },
      { data: "2027-10-10", titulo: "Facilidade x Empenho", texto: "Eclesiastes 9:10; Mateus 7:24-27", resumo: "Discorrer sobre o mundo nos oferecer atalhos, facilidades, imediatismos versus o empenho, profundidade e solidez que Deus deseja de nós. O que custa, dura." },
      { data: "2027-10-17", titulo: "Mecânico x Autêntico (Criatividade)", texto: "Mateus 6", resumo: "Refletir sobre a religiosidade versus um coração genuíno. Fariseu x Discípulo." },
      { data: "2027-10-24", titulo: "Resultado x Jornada", texto: "Eclesiastes 3; Mateus 6:34", resumo: "Discorrer sobre desfrutar de cada estação da vida. Criticar uma queima de etapa, mas saber aproveitar cada momento da vida." },
      { data: "2027-10-31", titulo: "Número x Nome", texto: "Mateus 6:25–34; Isaías 43:1; Salmos 139; Mateus 10:30", resumo: "Mostrar como Deus não nos vê como apenas um número e não é um Deus distante, mas relacional, próximo e nos conhece pelo nome." },
    ],
  },
  {
    slug: "31-dias-para-mudar-sua-vida-2027",
    mes: 11,
    titulo: "31 dias para mudar sua vida",
    subtitulo: "Bênção ou maldição?",
    objetivo: "Coragem para ouvir, Coragem para refletir, Coragem para aprender, Coragem para mudar, Coragem para praticar, Coragem para ser generoso.",
    cor: ['#2F4858', '#5B4B8A'],
    mensagens: [
      { data: "2027-11-07", titulo: "Sexo", texto: "Provérbios 5; Cânticos" },
      { data: "2027-11-14", titulo: "Dinheiro", texto: "Provérbios 10:14; 13:11; 14:23; 11:24-25; 22:26-27" },
      { data: "2027-11-21", titulo: "Palavras", texto: "Provérbios 18:21; 15:4; 12:18" },
      { data: "2027-11-28", titulo: "Pessoas", texto: "Provérbios 13:20; 17:17; 18:24; 27:9; 11:14" },
    ],
  },
  {
    slug: "encontros-2027",
    mes: 12,
    titulo: "Encontros",
    objetivo: "Coragem para se surpreender, Coragem para encontrar Jesus, Coragem para agir, Coragem para decisão, Coragem para posicionamento.",
    cor: ['#B5654A', '#00839D'],
    mensagens: [
      { data: "2027-12-05", titulo: "O tanque de Betesda", texto: "João 5:1–15" },
      { data: "2027-12-12", titulo: "A mulher samaritana", texto: "João 4:1–42" },
      { data: "2027-12-19", titulo: "O cego de nascença", texto: "João 9:1–41" },
      { data: "2027-12-26", titulo: "Nascimento de Jesus", texto: "Lucas 2; Mateus 1-2" },
    ],
  },
];

/** Fundo do card/hero: a arte da série, ou o degradê de `cor` sem arte. */
export function fundoSerie(s: Serie): { backgroundImage: string } {
  return s.imagem
    ? { backgroundImage: `linear-gradient(180deg, rgba(0,0,0,.05), rgba(0,30,40,.55)), url(${s.imagem})` }
    : { backgroundImage: `linear-gradient(135deg, ${s.cor[0]}, ${s.cor[1]})` };
}
