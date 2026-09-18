// ════════════════════════════════════════════════════════════════════════════
//  FLUXOS DE PORTA · o que a igreja se compromete a fazer com quem entra
//  (pedido do Marcos, 11/09/2026)
//
//  *"toda porta pública gera fluxos de processos a serem seguidos, eu queria
//   mapear todas e colocar em algum lugar para ser avaliado se está sendo
//   seguido"*
//
//  ⚠️⚠️ POR QUE ISTO EXISTE, medido no banco em 11/09: a porta do CONVERTIDO já
//  tem um fluxo — escrito como vinte colunas soltas em `cui_convertidos`. Nos
//  90 dias anteriores: 147 de 153 com 1º contato feito (mediana 2 dias), e
//  **encontro marcado 0 · direcionamento 2 · desfecho 0**. Ou seja: o passo que
//  tem tela, botão e dono é cumprido em 96%; todo passo que virou coluna sem
//  tela é ZERO. Este módulo é a régua do que falta — prazo, dono e FECHAMENTO.
//
//  ⚠️⚠️ TRÊS LEIS DE DESENHO, e a primeira é a que faz o número ser honesto:
//
//  1. **SÓ CONTA COMO DEVER O QUE É DEVER DA IGREJA.** Se a visitante não
//     retira o café e não responde a pesquisa, a igreja não falhou — ela
//     escolheu. Etapas `dependeDaPessoa` NUNCA entram na cobrança; entram só no
//     retrato. Misturar as duas faz o painel vermelho por culpa de ninguém, e
//     painel assim para de ser olhado.
//  2. **ESTADO NÃO SE GUARDA, SE CALCULA.** Cada etapa aponta pra evidência que
//     JÁ existe (coluna da porta) ou pra uma ação registrada. Não há coluna
//     "etapa atual" pra sair do ar com o dado real — a fonte é uma só.
//  3. **FLUXO QUE NÃO FECHA NÃO É FLUXO.** Toda porta termina em `desfecho`
//     obrigatório. É exatamente o que falta hoje no convertido (0 desfechos em
//     90 dias) e o que o Marcos pediu: *"se não, finaliza a conversa e esse
//     fluxo é encerrado"*.
//
//  Régua PURA (sem Supabase, sem rede, sem relógio implícito) porque entra no
//  gate de deploy: `npm run test:fluxo-porta`.
// ════════════════════════════════════════════════════════════════════════════

// BRT é UTC−3 fixo desde 2019 (mesma conversão de visitanteRegras).
const MS_DIA = 86400000;
const OFFSET_BRT = 3 * 3600 * 1000;

/**
 * Destinos possíveis de um encaminhamento. Lista FECHADA (lei de 24/08: opção
 * que vira dado não vive no cliente). Valor desconhecido é RECUSADO, não
 * convertido em 'outro' — aqui o dado é a decisão pastoral, não um rótulo.
 */
const ENCAMINHAMENTOS = [
  { v: 'grupo', l: 'Grupo' },
  { v: 'next', l: 'Next' },
  { v: 'batismo', l: 'Batismo' },
  { v: 'servir', l: 'Servir' },
  { v: 'cuidado', l: 'Cuidado pastoral' },
  { v: 'outro', l: 'Outro' },
];
const IDS_ENCAMINHAMENTO = ENCAMINHAMENTOS.map((e) => e.v);

/**
 * Como um fluxo pode terminar.
 * ⚠️ `nao_alcancada` é desfecho de verdade, não desistência: três tentativas sem
 * resposta é informação, e sem essa opção a equipe deixa a linha aberta pra
 * sempre — foi assim que o convertido chegou a 0 desfechos em 90 dias.
 */
const DESFECHOS = [
  { v: 'encaminhada', l: 'Encaminhei para algo', exigeEncaminhamento: true },
  { v: 'sem_necessidade', l: 'Conversamos, sem necessidade agora' },
  { v: 'nao_alcancada', l: 'Não consegui falar' },
];
const IDS_DESFECHO = DESFECHOS.map((d) => d.v);

/**
 * O catálogo. Uma porta, suas etapas, em ordem.
 *
 * `prazoDias` conta do REGISTRO (dia BRT) e vence no FIM daquele dia: "no dia
 * seguinte" = prazoDias 1 = até 23:59 de amanhã. Prazo em hora cheia faria a
 * equipe perder o prazo por ter ligado às 19h em vez das 18h.
 * `dependeDaPessoa: true` ⇒ fora da cobrança (lei 1).
 * `evidencia` diz ONDE se lê que a etapa aconteceu:
 *   · { tipo:'campo', campo }        → coluna da própria porta (carimbo de data)
 *   · { tipo:'campoUm', campo, de }  → coluna que vale quando está num conjunto
 *   · { tipo:'acao' }                → linha em `flx_acoes` (etapa humana nova)
 */
const FLUXOS = {
  visitante: {
    porta: 'visitante',
    label: 'Visitante',
    refTipo: 'vis_visitas',
    modulo: 'cuidados',
    baseData: 'created_at',
    etapas: [
      {
        chave: 'registro',
        label: 'Registrou a visita',
        quem: 'A pessoa, no QR do cartaz',
        dependeDaPessoa: true,
        prazoDias: 0,
        evidencia: { tipo: 'campo', campo: 'created_at' },
      },
      {
        chave: 'voucher',
        label: 'Retirou o café',
        quem: 'Cafeteria',
        dependeDaPessoa: true,
        prazoDias: 0,
        evidencia: { tipo: 'campoUm', campo: 'voucher_status', de: ['resgatado'], campoData: 'voucher_resgatado_em' },
      },
      {
        chave: 'pesquisa',
        label: 'Respondeu a pesquisa',
        quem: 'A pessoa, no WhatsApp',
        dependeDaPessoa: true,
        prazoDias: 3,
        evidencia: { tipo: 'campo', campo: 'pesquisa_respondida_em' },
      },
      {
        chave: 'contato',
        label: 'Falar com ela',
        quem: 'Integração',
        prazoDias: 1,
        evidencia: { tipo: 'campo', campo: 'primeiro_contato_em' },
      },
      {
        chave: 'desfecho',
        label: 'Encerrar com desfecho',
        quem: 'Integração',
        prazoDias: 3,
        encerra: true,
        evidencia: { tipo: 'acao' },
      },
    ],
  },
};

const PORTAS = Object.keys(FLUXOS);

function fluxoDaPorta(porta) {
  return FLUXOS[String(porta || '')] || null;
}

/** Etapas que são DEVER DA IGREJA — as únicas que entram em cobrança. */
function etapasCobradas(porta) {
  const f = fluxoDaPorta(porta);
  return f ? f.etapas.filter((e) => !e.dependeDaPessoa) : [];
}

/** Meia-noite BRT seguinte ao fim do dia `prazoDias` depois da base (ms). */
function prazoDaEtapa(baseEm, prazoDias) {
  const t = new Date(baseEm).getTime();
  if (!Number.isFinite(t)) return null;
  const diaBrt = Math.floor((t - OFFSET_BRT) / MS_DIA);
  const dias = Number.isFinite(Number(prazoDias)) ? Number(prazoDias) : 0;
  // fim do dia (diaBrt + dias) = meia-noite BRT do dia seguinte a ele
  return (diaBrt + dias + 1) * MS_DIA + OFFSET_BRT;
}

function _ms(v) {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * A etapa aconteceu? Devolve { feito, em } lendo a evidência declarada.
 * `acoes` é um mapa { [chaveDaEtapa]: { feito_em, ... } }.
 */
function evidenciaDaEtapa(etapa, registro, acoes) {
  const ev = etapa.evidencia || {};
  if (ev.tipo === 'acao') {
    const a = acoes && acoes[etapa.chave];
    return a ? { feito: true, em: _ms(a.feito_em) } : { feito: false, em: null };
  }
  const valor = registro ? registro[ev.campo] : null;
  if (ev.tipo === 'campoUm') {
    const ok = Array.isArray(ev.de) && ev.de.includes(valor);
    // status não carrega data própria: o carimbo é o da porta, quando existir
    return { feito: ok, em: ok ? _ms(registro[ev.campoData] || null) : null };
  }
  const em = _ms(valor);
  return { feito: em != null, em };
}

/**
 * Situação de UMA etapa:
 *   'feito' · 'aguardando' · 'no_prazo' · 'vence_hoje' · 'atrasado' · 'dispensada'
 *
 * ⚠️⚠️ Etapa `dependeDaPessoa` NUNCA fica 'atrasado' — fica 'aguardando'. Quem
 * não retirou o café não está em atraso com ninguém; a igreja é que está
 * esperando. Foi o teste que pegou: o voucher vencia à meia-noite e no dia
 * seguinte a tela acusaria a visitante de atraso.
 *
 * ⚠️ 'dispensada' é o que acontece com toda etapa depois que o fluxo FECHOU, e
 * com as etapas seguintes de um fluxo encerrado — cobrar contato de quem já foi
 * encerrado é cobrar trabalho que ninguém deve fazer.
 */
function situacaoEtapa({ porta, etapa, registro, acoes, agora, encerrado }) {
  const ev = evidenciaDaEtapa(etapa, registro, acoes);
  if (ev.feito) return 'feito';
  if (encerrado) return 'dispensada';
  if (etapa.dependeDaPessoa) return 'aguardando';
  const f = fluxoDaPorta(porta);
  const base = registro ? registro[(f && f.baseData) || 'created_at'] : null;
  const prazo = prazoDaEtapa(base, etapa.prazoDias);
  if (prazo == null) return 'no_prazo';
  const now = agora instanceof Date ? agora.getTime() : (typeof agora === 'number' ? agora : Date.now());
  if (now >= prazo) return 'atrasado';
  // vence hoje = o prazo cai antes da próxima meia-noite BRT
  const fimDeHoje = (Math.floor((now - OFFSET_BRT) / MS_DIA) + 1) * MS_DIA + OFFSET_BRT;
  return prazo <= fimDeHoje ? 'vence_hoje' : 'no_prazo';
}

/**
 * O retrato de UMA pessoa no fluxo da porta.
 *
 * Devolve { porta, encerrado, desfecho, etapas:[{...situação, prazo}], atual,
 *           atrasadas, cobradasPendentes }.
 * `atual` = a primeira etapa COBRADA ainda não feita; null quando não há dever
 * pendente (ou porque acabou, ou porque só falta o que depende da pessoa).
 */
function estadoDoFluxo({ porta, registro, acoes, agora }) {
  const f = fluxoDaPorta(porta);
  if (!f || !registro) return null;
  const mapa = acoes || {};
  // ⚠️ A etapa que encerra vem do CATÁLOGO, não da string 'desfecho': a próxima
  // porta pode chamar a dela de outro nome, e aí o fluxo nunca fecharia — em
  // silêncio, que é o modo de falha que este módulo existe pra evitar.
  const chaveEncerra = (f.etapas.find((e) => e.encerra) || {}).chave;
  const acaoDesfecho = (chaveEncerra && mapa[chaveEncerra]) || null;
  const encerrado = !!acaoDesfecho;
  const etapas = f.etapas.map((e) => {
    const etapa = e;
    const ev = evidenciaDaEtapa(etapa, registro, mapa);
    return {
      chave: e.chave,
      label: e.label,
      quem: e.quem,
      // ⚠️ snake_case aqui porque isto ATRAVESSA a API; dentro do catálogo é
      // camelCase. Misturar os dois no mesmo objeto já fez a tela ler undefined
      // e tratar etapa da pessoa como dever da igreja.
      depende_da_pessoa: !!e.dependeDaPessoa,
      encerra: !!e.encerra,
      prazo_em: prazoDaEtapa(registro[f.baseData], e.prazoDias),
      feito_em: ev.em,
      situacao: situacaoEtapa({ porta: f.porta, etapa, registro, acoes: mapa, agora, encerrado: encerrado && !ev.feito }),
    };
  });
  const cobradas = etapas.filter((e) => !e.depende_da_pessoa);
  const atrasadas = cobradas.filter((e) => e.situacao === 'atrasado').map((e) => e.chave);
  const pendentes = cobradas.filter((e) => e.situacao !== 'feito' && e.situacao !== 'dispensada');
  return {
    porta: f.porta,
    label: f.label,
    encerrado,
    desfecho: acaoDesfecho ? acaoDesfecho.resultado || null : null,
    encaminhamento: acaoDesfecho ? acaoDesfecho.encaminhamento || null : null,
    etapas,
    atual: pendentes.length ? pendentes[0].chave : null,
    atrasadas,
    cobradas_pendentes: pendentes.length,
  };
}

/**
 * Adesão do fluxo num conjunto de pessoas — o número que o Marcos pediu
 * ("avaliar se está sendo seguido").
 *
 * ⚠️ Conta SÓ etapa cobrada (lei 1). `no_prazo` inclui o que ainda tem prazo
 * aberto: não é acerto nem erro, é "ainda dá tempo" — e misturar isso com
 * 'feito' inflaria a adesão no começo da semana.
 * ⚠️ `adesao_pct` é null quando não há nada vencido ainda: percentual sobre
 * zero é mentira com cara de número (lei da casa).
 */
function adesaoDoFluxo({ porta, itens, agora }) {
  const f = fluxoDaPorta(porta);
  if (!f) return null;
  const lista = Array.isArray(itens) ? itens : [];
  const porEtapa = {};
  for (const e of etapasCobradas(porta)) {
    porEtapa[e.chave] = { label: e.label, feito: 0, atrasado: 0, no_prazo: 0, dispensada: 0 };
  }
  let encerrados = 0;
  for (const it of lista) {
    const st = estadoDoFluxo({ porta, registro: it.registro, acoes: it.acoes, agora });
    if (!st) continue;
    if (st.encerrado) encerrados += 1;
    for (const e of st.etapas) {
      if (e.depende_da_pessoa) continue;
      const alvo = porEtapa[e.chave];
      if (!alvo) continue;
      if (e.situacao === 'feito') alvo.feito += 1;
      else if (e.situacao === 'atrasado') alvo.atrasado += 1;
      else if (e.situacao === 'dispensada') alvo.dispensada += 1;
      else alvo.no_prazo += 1;
    }
  }
  let feitas = 0, vencidas = 0;
  for (const k of Object.keys(porEtapa)) {
    feitas += porEtapa[k].feito;
    vencidas += porEtapa[k].feito + porEtapa[k].atrasado;
  }
  return {
    porta: f.porta,
    pessoas: lista.length,
    encerrados,
    por_etapa: porEtapa,
    // adesão = do que JÁ VENCEU, quanto foi feito
    adesao_pct: vencidas ? Math.round((feitas / vencidas) * 100) : null,
    vencidas,
  };
}

/** Valida o que a tela manda ao registrar um desfecho. */
function validarDesfecho({ resultado, encaminhamento }) {
  const r = String(resultado || '').trim();
  if (!IDS_DESFECHO.includes(r)) return { ok: false, erro: 'Escolha como o fluxo terminou.', campo: 'resultado' };
  const def = DESFECHOS.find((d) => d.v === r);
  const enc = String(encaminhamento || '').trim();
  if (def.exigeEncaminhamento) {
    if (!enc) return { ok: false, erro: 'Diga para onde você encaminhou.', campo: 'encaminhamento' };
    if (!IDS_ENCAMINHAMENTO.includes(enc)) return { ok: false, erro: 'Destino desconhecido.', campo: 'encaminhamento' };
  } else if (enc && !IDS_ENCAMINHAMENTO.includes(enc)) {
    return { ok: false, erro: 'Destino desconhecido.', campo: 'encaminhamento' };
  }
  return { ok: true, resultado: r, encaminhamento: enc || null };
}

module.exports = {
  FLUXOS, PORTAS, ENCAMINHAMENTOS, IDS_ENCAMINHAMENTO, DESFECHOS, IDS_DESFECHO,
  fluxoDaPorta, etapasCobradas, prazoDaEtapa, evidenciaDaEtapa, situacaoEtapa,
  estadoDoFluxo, adesaoDoFluxo, validarDesfecho,
};
