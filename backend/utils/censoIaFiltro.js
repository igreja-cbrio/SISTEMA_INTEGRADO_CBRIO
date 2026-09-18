// ════════════════════════════════════════════════════════════════════════════
//  Censo · o que PODE sair para o modelo de IA (régua PURA)
//
//  ⚠️⚠️ POR QUE ISTO VIVE EM `utils/` E NÃO NO SERVIÇO
//  `services/censoLeituraIA.js` faz `require('@anthropic-ai/sdk')`, que mora em
//  `backend/package.json` — árvore de dependências PRÓPRIA, que o CI não
//  instala (ele roda `npm ci` só na raiz). Régua que decide se PII sai do
//  sistema tem que estar no gate de deploy, e regra no gate não pode arrastar
//  o SDK atrás dela. Mesmo padrão de `utils/dataBr.js` e `utils/camposContato.js`.
//  O serviço RE-EXPORTA daqui, então nenhum chamador muda.
// ════════════════════════════════════════════════════════════════════════════

const MAX_TEXTOS_POR_PERGUNTA = 400;
const MAX_CHARS_POR_TEXTO = 600;

/**
 * ⚠️⚠️ SÓ `texto_longo` VAI PARA O MODELO — é a guarda que faltava.
 *
 * Achado em 10/09/2026: o comentário do `POST /censo/ia` diz "só respostas de
 * pergunta ABERTA e NÃO sensível", e **nada no caminho checava o tipo**. O SQL
 * filtra só `sensivel = false` e `valor_texto not null`.
 *
 * MEDIDO no censo vivo antes de escrever esta régua:
 *   · `texto_curto` = **167 itens, 100% identificação** — nome, cpf, email,
 *     telefone, cep, cidade, bairro (mais conjuge_nome e instagram nos órfãos).
 *     Nenhuma opinião. Iriam TODOS para a Anthropic a cada clique no botão.
 *   · `texto_longo` = as 8 perguntas de opinião de verdade (motivo_permanecer,
 *     mais_ama, desconecta, deus_quer_fazer…). É o material que a leitura quer.
 *   · `busca` = nome de igreja e de GRUPO — e em `qual_grupo` a base tem nome
 *     de LÍDER digitado à mão. Dado categórico com gente dentro, não opinião.
 *
 * Dado de igreja identifica convicção religiosa (LGPD art. 11) e a lei do
 * projeto sobre mandar dado para ferramenta externa é explícita.
 *
 * ⚠️ Lista FECHADA e FAIL-CLOSED: tipo ausente, desconhecido ou novo fica de
 * fora por padrão. O custo de errar para dentro é vazar PII; o de errar para
 * fora é uma pergunta a menos na síntese.
 * ⚠️ Se um dia existir opinião em `texto_curto`, o caminho é marcar a pergunta,
 * não afrouxar isto — `texto_curto` é onde o CPF mora.
 */
const TIPOS_PARA_IA = new Set(['texto_longo']);

function ehTextoDeOpiniao(item) {
  return TIPOS_PARA_IA.has(String(item?.tipo || ''));
}

function prepararMaterial(itens) {
  const porPergunta = new Map();
  for (const i of itens || []) {
    // O bloco sensível não entra. Nunca. (Guarda redundante: o SQL já filtra —
    // duas guardas porque uma refatoração futura pode mexer só numa.)
    if (i?.sensivel === true) continue;
    // ⚠️ FAIL-CLOSED: sem saber o tipo, não sai. Item que chega sem `tipo`
    // (payload antigo, chamada de teste) é descartado em vez de vazar.
    if (!ehTextoDeOpiniao(i)) continue;
    const t = String(i?.valor_texto || '').trim();
    if (t.length < 3) continue;                 // "ok", "-", vazio: não é opinião
    const k = i.pergunta_id;
    if (!porPergunta.has(k)) {
      porPergunta.set(k, { pergunta_id: k, pergunta_texto: i.pergunta_texto || k, textos: [], total: 0 });
    }
    const b = porPergunta.get(k);
    b.total += 1;
    if (b.textos.length < MAX_TEXTOS_POR_PERGUNTA) b.textos.push(t.slice(0, MAX_CHARS_POR_TEXTO));
  }
  const blocos = [...porPergunta.values()].filter((b) => b.textos.length > 0);
  const truncadas = blocos
    .filter((b) => b.total > b.textos.length)
    .map((b) => ({ pergunta_id: b.pergunta_id, lidas: b.textos.length, total: b.total }));
  return { blocos, total_textos: blocos.reduce((s, b) => s + b.textos.length, 0), truncadas };
}

module.exports = {
  TIPOS_PARA_IA,
  ehTextoDeOpiniao,
  prepararMaterial,
  MAX_TEXTOS_POR_PERGUNTA,
  MAX_CHARS_POR_TEXTO,
};
