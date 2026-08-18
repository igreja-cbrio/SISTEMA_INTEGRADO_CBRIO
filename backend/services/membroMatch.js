// ============================================================================
// services/membroMatch · matching de identidade de pessoa (fonte: mem_membros)
//
// Centraliza a lógica que estava espalhada em routes/pessoas.js
// (findOrCreateMembro + GET /lookup): dado cpf/email/telefone, encontra os
// membros candidatos por chave forte e decide achar-ou-criar.
//
// É a base do "guardar na origem" (Marcos · 2026-06-15): todo ponto de entrada
// (Next, batismo, voluntariado, cadastro) passa por aqui pra não duplicar
// pessoa. A fila de reconciliação do módulo "Next - Batismo" (fase 1) consome
// buscarCandidatos pros casos ambíguos (telefone/nome batendo sem CPF) e os
// leva pra revisão humana — NUNCA auto-funde aqui (família compartilha
// telefone/e-mail · auto-merge errado junta pessoas distintas, pior que
// duplicata).
//
// Fase 0: só chave forte (cpf · email · telefone), preservando exatamente o
// comportamento do antigo findOrCreateMembro (cpf -> email -> cria). O scoring
// fuzzy de nome (pg_trgm) entra na fase 1, onde a fila o consome.
// ============================================================================

const { supabase } = require('../utils/supabase');
const { escapePostgrestValue } = require('../utils/sanitize');
const { sexoPara } = require('../utils/dadosDoCadastro');
const { nomeEhVersaoAbreviada } = require('./duplicidadePolicy');
const {
  normalizarCpf, normalizarTelefone, normalizarEmail, nomeNormalizado: normalizarNome,
  registrarObservacaoIdentidade,
} = require('./identidadeProgressiva');

const COLS = 'id, nome, email, telefone, cpf, data_nascimento, status, foto_url, familia_id';

// Confiança por chave · mesma escala da vw_membros_duplicados (consistência)
const PESO = { cpf: 100, telefone: 90, email: 85 };

async function _observar(membroId, entrada, matchedBy, created) {
  try {
    await registrarObservacaoIdentidade({
      membroId,
      origem: entrada.origem || 'matcher',
      origemId: entrada.origemId || null,
      nome: entrada.nome,
      cpf: entrada.cpf,
      telefone: entrada.telefone,
      email: entrada.email,
      dataNascimento: entrada.dataNascimento || entrada.extra?.data_nascimento || null,
      dados: { matched_by: matchedBy || null, created: !!created },
    });
  } catch (error) {
    // A observação é crítica para o diagnóstico, mas não pode derrubar um
    // formulário durante a janela entre backend e migration.
    console.error('[membroMatch] evidência de identidade não registrada:', error.message);
  }
}

// _registrarContatoNoMatch · quando a pessoa ligou num membro EXISTENTE
// trazendo contato diferente do principal (telefone do trabalho × pessoal),
// ACUMULA em mem_contatos via fn_registrar_contato (nunca sobrescreve o
// principal · decisão do Marcos 2026-07-17). Best-effort: falha não derruba
// a porta. Tolera a migration 20260717120000 ausente.
function _registrarContatoNoMatch(membroId, { telefone, email } = {}, fonte) {
  if (!membroId || (!telefone && !email)) return;
  supabase.rpc('fn_registrar_contato', {
    p_membro_id: membroId,
    p_telefone: telefone || null,
    p_email: email || null,
    p_fonte: fonte || 'porta',
  }).then(({ error }) => {
    if (error && !/fn_registrar_contato/.test(error.message || '')) {
      console.warn('[membroMatch] contato não registrado:', error.message);
    }
  });
}

// _candidatosPorContatoSecundario · complementa a busca no mem_membros com os
// contatos ACUMULADOS (mem_contatos): a pessoa que usou o telefone do trabalho
// numa porta e o pessoal na outra é encontrada pelos dois. Tolera a tabela
// ausente. Retorna Map membro_id -> Set(motivos).
async function _candidatosPorContatoSecundario({ email, telefone } = {}) {
  const em = normalizarEmail(email);
  const tel = normalizarTelefone(telefone);
  const hits = new Map();
  if (!em && !tel) return hits;
  try {
    const ors = [];
    if (tel) ors.push(`and(tipo.eq.telefone,valor.eq.${tel})`);
    if (em) ors.push(`and(tipo.eq.email,valor.eq.${escapePostgrestValue(em)})`);
    const { data, error } = await supabase
      .from('mem_contatos')
      .select('membro_id, tipo')
      .or(ors.join(','))
      .is('deleted_at', null)
      .limit(30);
    if (error) return hits;
    for (const c of data || []) {
      if (!hits.has(c.membro_id)) hits.set(c.membro_id, new Set());
      hits.get(c.membro_id).add(c.tipo);
    }
  } catch { /* tabela ausente · segue só com o principal */ }
  return hits;
}


// ⚠️⚠️ A forma COMPARÁVEL do telefone. `mem_membros.telefone` guarda o que cada
// porta/import gravou, em formatos MISTOS — medido em 17/08: 840 de 3.597 vivos
// (23%) COM máscara e 29 com código de país. E `21996137099` **não é substring**
// de `(21)99613-7099`, então o `ilike %digitos%` que este arquivo usava desde
// sempre era CEGO nesses casos: 84 grupos de cadastros no mesmo telefone
// canônico com formas diferentes, 35 deles com o nome normalizado IDÊNTICO.
// (Caso Fabio Moura: 2 cadastros, mesmo nome/nascimento/e-mail/telefone e CPFs
// diferentes — o 2º nasceu porque o 1º era invisível pelo telefone.)
//
// Quem compara agora é a coluna GERADA `telefone_digits` (migration
// 20260817160000), e o lado da BUSCA precisa da mesma canonicalização.
// ⚠️ Tira o 55 SÓ quando o resto ainda é telefone completo — **DDD 55 é Santa
// Maria/RS**, e um `replace(^55)` cru destruiria todo número legítimo de lá.
function telefoneComparavel(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length >= 12 && d.length <= 13 && d.startsWith('55')) return d.slice(2);
  return d.length >= 10 ? d : null;
}

// buscarCandidatos · membros que batem por chave forte, ranqueados por
// confiança. Cada candidato sai com { ...membro, motivos: [...], score }.
// Usado pelo GET /lookup e (fase 1) pela fila de reconciliação.
// Desde 2026-07-17 também acha pelos contatos SECUNDÁRIOS (mem_contatos).
async function buscarCandidatos({ cpf, email, telefone } = {}, { limit = 5 } = {}) {
  const c = normalizarCpf(cpf);
  const em = normalizarEmail(email);
  const tel = normalizarTelefone(telefone);

  const telCmp = telefoneComparavel(telefone);

  const base = [];
  if (c) base.push(`cpf.eq.${c}`);
  if (em) base.push(`email.ilike.${escapePostgrestValue(em)}`);
  if (base.length === 0 && !telCmp && !tel) return [];

  const consulta = (ors) => supabase
    .from('mem_membros')
    .select(COLS)
    .or(ors.join(','))
    .is('deleted_at', null)
    .limit(Math.max(limit, 5) * 2);

  // ⚠️⚠️ FALLBACK OBRIGATÓRIO, e aqui ele é crítico: pedir coluna inexistente faz
  // o PostgREST recusar a query INTEIRA, e esta função é o caminho de TODA porta
  // de pessoa. Sem o fallback, o intervalo entre este deploy e a migration
  // derrubaria batismo, censo, grupos, Next e voluntariado de uma vez.
  const orsNovo = [...base, ...(telCmp ? [`telefone_digits.eq.${telCmp}`] : [])];
  const orsAntigo = [...base, ...(tel ? [`telefone.ilike.%${tel}%`] : [])];

  // A busca nos contatos secundários roda EM PARALELO (como antes): serializar
  // somaria uma ida ao banco em toda porta de pessoa.
  const [primeira, secundarios] = await Promise.all([
    orsNovo.length ? consulta(orsNovo) : Promise.resolve({ data: [], error: null }),
    _candidatosPorContatoSecundario({ email, telefone }),
  ]);
  let resultado = primeira;
  if (resultado.error && /telefone_digits/.test(String(resultado.error.message || ''))) {
    console.warn('[membroMatch] telefone_digits ausente (migration 20260817160000 não aplicada) — a busca por telefone caiu no ilike, que é cego a número mascarado');
    resultado = orsAntigo.length ? await consulta(orsAntigo) : { data: [], error: null };
  }
  const { data, error } = resultado;
  if (error) throw error;

  let rows = data || [];
  const jaTem = new Set(rows.map((m) => m.id));
  const idsExtras = [...secundarios.keys()].filter((id) => !jaTem.has(id));
  if (idsExtras.length) {
    const { data: extras } = await supabase
      .from('mem_membros')
      .select(COLS)
      .in('id', idsExtras.slice(0, 20))
      .is('deleted_at', null);
    rows = rows.concat(extras || []);
  }

  return rows
    .map((m) => {
      const motivos = [];
      const sec = secundarios.get(m.id);
      if (c && normalizarCpf(m.cpf) === c) motivos.push('cpf');
      if (tel && (normalizarTelefone(m.telefone) === tel || sec?.has('telefone'))) motivos.push('telefone');
      if (em && (normalizarEmail(m.email) === em || sec?.has('email'))) motivos.push('email');
      const score = motivos.reduce((s, k) => Math.max(s, PESO[k] || 0), 0);
      return { ...m, motivos, score };
    })
    .filter((m) => m.motivos.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// acharOuCriar · acha por chave confiável (cpf -> email) ou cria mem_membros
// novo. Comportamento idêntico ao antigo findOrCreateMembro. NÃO auto-liga por
// telefone (risco de fundir pessoas distintas que compartilham número).
async function acharOuCriar(entrada = {}) {
  // Compatibilidade para consumidores antigos, agora sob a mesma política
  // conservadora. E-mail sozinho nunca mais identifica uma pessoa.
  return acharOuCriarGuardado(entrada);
}

// ── Nome: comparação conservadora pra AUTO-link ──────────────────────────────
function _bigrams(s) {
  const m = new Map();
  for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); }
  return m;
}
function _dice(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ba = _bigrams(a), bb = _bigrams(b);
  let inter = 0, ta = 0, tb = 0;
  for (const v of ba.values()) ta += v;
  for (const [g, v] of bb) { tb += v; if (ba.has(g)) inter += Math.min(v, ba.get(g)); }
  return ta + tb === 0 ? 0 : (2 * inter) / (ta + tb);
}
// CONSERVADOR de propósito (≥0.90) · só pra decidir AUTO-link por telefone.
// Nomes "parecidos" abaixo disso NÃO ligam sozinhos — viram fila do Kevyn.
function nomesMesmaPessoa(a, b) {
  const x = normalizarNome(a), y = normalizarNome(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return _dice(x, y) >= 0.90;
}

// ⚠️⚠️ O NOME QUE AUTORIZA LIGAR (2026-08-18 · decisão do Marcos).
//
// `nomesMesmaPessoa` é Dice ≥0,90 e RECUSA nome abreviado — e era isso que
// transformava cadastro antigo em FANTASMA: o registro do Next legado tem nome
// e telefone; a pessoa entra em grupos hoje com o nome civil completo e o MESMO
// telefone, o matcher não reconhece, nasce uma segunda pessoa. Medido em 18/08:
// `nomesMesmaPessoa` recusa TODOS os casos de nome contido da base
// ("Kelly Veiga da Silva Oliveira" × "Kelly Veiga", "Eliane Santana" ×
// "Eliane dos Santos Santana Sobrinho").
//
// ⚠️ Entra o CONTAINMENT e SÓ ele. Medido sobre telefone em comum na base viva:
// containment = 100 pares, todos a mesma pessoa · Dice ≥0,90 = 4 pares, e 2 são
// IRMÃS ("Layane" × "Dayane A. M. Bello Joseph", "Mayla" × "Nayla Duarte
// Victor Minari"). Uma letra no PRIMEIRO nome é indistinguível de parente, então
// typo continua fora de LIGAR — ele SUGERE, na fila.
//
// ⚠️ `nomesMesmaPessoa` fica na OU porque cobre o caso `x === y` e a tolerância a
// acento/caixa que o containment por token não cobre sozinho.
function nomeAutorizaLigar(a, b) {
  return nomesMesmaPessoa(a, b) || nomeEhVersaoAbreviada(a, b);
}

// Nome-placeholder do import financeiro ("Contribuinte 059412...") — o extrato
// chega com o nome mascarado e a fin_resolver_ou_criar_contribuinte cria o
// membro assim. NÃO é um nome de pessoa: nenhum fluxo de pessoas deve exibi-lo
// nem preferi-lo a um cadastro com nome real (incidente Kids 2026-07-26: 6
// check-ins imprimiram "Contribuinte NNN" como mãe na etiqueta).
function ehNomePlaceholder(nome) {
  return /^contribuinte\b/i.test(String(nome || '').trim());
}

// ehNomeDerivadoDeEmail · o nome é o PREFIXO do próprio e-mail, não um nome.
// Vem do gatilho de signup em auth.users, que faz
// `COALESCE(full_name, name, split_part(email,'@',1))`: quando o provedor OAuth
// não manda nome, o prefixo do e-mail vira o nome da pessoa. Casos reais:
// "juloora", "catiassgullo", "toscano.milton" — e o pior, Apple Sign-In com
// "Ocultar meu e-mail", que dá um relay aleatório ("sy9p84mryx").
// ⚠️ NÃO é heurística de "nome estranho": exige o e-mail e compara com ele, então
// não pega apelido nem nome curto legítimo. Usado pra AVISAR gente (fila humana),
// nunca pra apagar cadastro.
function ehNomeDerivadoDeEmail(nome, email) {
  const n = String(nome || '').trim();
  const em = String(email || '').trim();
  if (!n || !em || !em.includes('@')) return false;
  const prefixo = em.split('@')[0];
  if (!prefixo) return false;
  const norm = (v) => String(v).toLowerCase().replace(/[\s._-]+/g, '');
  // igual ao prefixo (com ou sem pontuação/caixa) OU relay da Apple, em que o
  // prefixo É o identificador aleatório e nunca é nome de pessoa.
  if (norm(n) === norm(prefixo)) return true;
  return /@privaterelay\.appleid\.com$/i.test(em) && norm(n) === norm(prefixo);
}

// nomeEhEnderecoDeEmail · o campo NOME contém um endereço de e-mail inteiro.
// Forma DIFERENTE do ehNomeDerivadoDeEmail: aqui não há e-mail na coluna própria
// pra comparar — a pessoa (ou o transcritor do import) digitou o e-mail no lugar
// do nome. 3 casos medidos em 04/08, dois vindos do
// `import_next_historico_2025_2026` (lista de presença transcrita) e um do wifi.
// ⚠️ Também é sinal de CONTATO PERDIDO: em 2 dos 3 a coluna `email` está vazia,
// então o sistema tem um e-mail que não usa. Vira trabalho humano (o nome real
// não é derivável do endereço), NUNCA exclusão.
function nomeEhEnderecoDeEmail(nome) {
  const n = String(nome || '').trim();
  if (!n || /\s/.test(n)) return false;   // nome com espaço não é um endereço
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(n);
}

// _consolidarCpfNoMatch · quando a pessoa entrou COM CPF mas ligou por sinal
// fraco (e-mail/telefone+nome/nascimento+nome), consolida o CPF no membro
// ligado — é o "CPF tardio" (pessoa converteu antes sem CPF, voltou com CPF).
// Delegado ao cpfReconciliar: preenche se o membro não tem CPF; conflito
// (CPF de outro membro / membro com CPF diferente) vira pendência humana,
// nunca auto-funde. Best-effort: falha aqui não derruba o vínculo.
// Confiança: e-mail/telefone+nome são sinais que a FAMÍLIA compartilha —
// homônimos exatos (pai/filho) fariam o CPF de um virar identidade do outro.
// Por isso vão como 'fraca' (só consolida com nascimento conferível dos 2
// lados; senão mantém o CPF somente na origem, sem abrir pendência).
// 'nome+nascimento' já
// conferiu o nascimento por construção → 'forte'.
async function _consolidarCpfNoMatch(membroId, cpf11, matchedBy, dataNascimento) {
  if (!cpf11) return;
  try {
    const { reconciliarCpfTardio } = require('./cpfReconciliar');
    await reconciliarCpfTardio({
      membroId, cpf: cpf11, origem: `matcher:${matchedBy}`, dataNascimento,
      confianca: matchedBy === 'nome+nascimento' ? 'forte' : 'fraca',
    });
  } catch (e) {
    console.error('[membroMatch] consolidar cpf pós-match:', e.message);
  }
}

// acharOuCriarGuardado · "guardar na origem" (Marcos · 2026-06-16). Política:
//   CPF exato → liga · e-mail exato + NOME batendo → liga · telefone + NOME
//   batendo → liga · senão CRIA stub. NUNCA liga por telefone/e-mail sozinho
//   (família compartilha o número E o e-mail · auto-link errado junta pessoas
//   distintas = pior que duplicata). Colisão sem nome batendo cria stub e a
//   vw_membros_duplicados / vw_nb_duplicados_suspeitos + a fila do Kevyn pegam.
// `extra` = campos extras pro insert (ex.: data_nascimento, familia_id).
// `soChaveForte`: liga SÓ por CPF (a pessoa afirmou "não sou eu" no dedup —
//   nenhum sinal deniável pode religá-la a outro cadastro).
async function acharOuCriarGuardado({ cpf, email, telefone, nome, dataNascimento, genero, status = 'visitante', extra = {}, origem = 'matcher', origemId = null } = {}, { soChaveForte = false, permitirMatchPerfeito = false } = {}) {
  const entrada = { cpf, email, telefone, nome, dataNascimento, genero, status, extra, origem, origemId };
  const cpf11 = normalizarCpf(cpf);
  const emailLc = normalizarEmail(email);
  const tel = normalizarTelefone(telefone);
  const nasc = dataNascimento || extra.data_nascimento || null;
  // ⚠️ Aceita 'M'/'F' e 'masculino'/'feminino' na entrada porque as portas
  // guardam o sexo em vocabulários diferentes (`batismo_inscricoes.sexo` é
  // curto, `mem_membros.genero` é longo) — copiar cru grava valor que nenhum
  // filtro do sistema encontra depois. Valor irreconhecível vira null, nunca
  // um chute.
  const generoCanon = sexoPara('membro', genero) || sexoPara('membro', extra.genero) || null;
  // Se chegou um CPF novo, contato compartilhável não pode absorvê-lo em um
  // cadastro antigo sem confirmar também o nascimento. Nesse caso criamos um
  // novo registro e a observação-ponte eleva o par para revisão humana.
  const candidatoCompativel = (c) => nomeAutorizaLigar(c.nome, nome)
    && (!cpf11 || (!!nasc && !!c.data_nascimento && nasc === c.data_nascimento));

  if (cpf11) {
    const { data } = await supabase.from('mem_membros').select('id, nome')
      .eq('cpf', cpf11).is('deleted_at', null).maybeSingle();
    if (data?.id) {
      // Match por CPF num registro com nome-placeholder do financeiro
      // ("Contribuinte NNN...") e a porta trouxe o nome REAL: adota o registro
      // (CPF = mesma pessoa) e corrige o nome — o fantasma vira o cadastro
      // real, em vez de propagar "Contribuinte" pra etiquetas/telas.
      if (ehNomePlaceholder(data.nome) && nome && String(nome).trim().length >= 3 && !ehNomePlaceholder(nome)) {
        const { error: eNome } = await supabase.from('mem_membros')
          .update({ nome: String(nome).trim() }).eq('id', data.id);
        if (!eNome) console.log(`[membroMatch] placeholder renomeado via ${origem}: ${data.nome} -> ${String(nome).trim()} (${data.id})`);
      }
      _registrarContatoNoMatch(data.id, { telefone: tel, email: emailLc }, 'porta');
      await _observar(data.id, entrada, 'cpf', false);
      return { membro_id: data.id, created: false, matched_by: 'cpf' };
    }
  }
  if (!soChaveForte && emailLc && nome) {
    // E-mail SEMPRE exige o NOME batendo (esposa que usa o e-mail do marido não
    // pode ser ligada ao marido). Sem nome, e-mail sozinho NÃO liga — cai no
    // CRIA/stub (a família compartilha a caixa · alinha ao contrato de
    // acharOuCriar: "e-mail sozinho nunca mais identifica uma pessoa").
    // buscarCandidatos cobre também o e-mail SECUNDÁRIO (mem_contatos).
    const cands = await buscarCandidatos({ email: emailLc }, { limit: 8 });
    const hit = cands.find(candidatoCompativel);
    if (hit?.id) {
      await _consolidarCpfNoMatch(hit.id, cpf11, 'email', nasc);
      _registrarContatoNoMatch(hit.id, { telefone: tel, email: emailLc }, 'porta');
      await _observar(hit.id, entrada, 'email+nome', false);
      return { membro_id: hit.id, created: false, matched_by: 'email' };
    }
  }
  if (soChaveForte) {
    // pula direto pro CRIA (nenhum sinal deniável liga)
  } else if (tel && nome) {
    const cands = await buscarCandidatos({ telefone }, { limit: 8 });
    const hit = cands.find(candidatoCompativel);
    if (hit) {
      await _consolidarCpfNoMatch(hit.id, cpf11, 'telefone+nome', nasc);
      _registrarContatoNoMatch(hit.id, { telefone: tel, email: emailLc }, 'porta');
      await _observar(hit.id, entrada, 'telefone+nome', false);
      return { membro_id: hit.id, created: false, matched_by: 'telefone+nome' };
    }
  }
  // nome + data de nascimento · forte pra quem não tem CPF/e-mail/telefone batendo
  // (ex.: pessoas importadas de grupos têm nome+nascimento). Conservador: mesma
  // data de nascimento E nome batendo (≥0.90) — não liga por nascimento sozinho.
  if (!soChaveForte && nasc && nome) {
    const { data } = await supabase.from('mem_membros')
      .select('id, nome').eq('data_nascimento', nasc).is('deleted_at', null).limit(30);
    const hit = (data || []).find((c) => nomesMesmaPessoa(c.nome, nome));
    if (hit) {
      await _consolidarCpfNoMatch(hit.id, cpf11, 'nome+nascimento', nasc);
      _registrarContatoNoMatch(hit.id, { telefone: tel, email: emailLc }, 'porta');
      await _observar(hit.id, entrada, 'nome+nascimento', false);
      return { membro_id: hit.id, created: false, matched_by: 'nome+nascimento' };
    }
  }

  // ── MATCH PERFEITO · a exceção estreita ao `soChaveForte` ──────────────────
  // Decisão do Marcos (17/08): "não vejo problema de criar duplicatas, desde que
  // entrem na trilha de duplicatas e sejam resolvidas; evidente que se tiver uma
  // pessoa que tenha match perfeito acho que é bom conectar já."
  //
  // `soChaveForte` existe pra impedir que sinal COMPARTILHÁVEL (telefone da casa,
  // e-mail da família) escreva o dado de uma pessoa no cadastro de outra — por
  // isso ele continua valendo. O que entra aqui é mais estreito do que o ramo
  // nome+nascimento normal, de propósito:
  //   · nome NORMALIZADO IDÊNTICO (não Dice ≥0,90, não abreviação contida)
  //   · nascimento IDÊNTICO
  //   · nenhum CPF CONFLITANTE
  //   · e EXATAMENTE UM candidato
  //
  // ⚠️⚠️ O veto de CPF não é preciosismo — a medição de 17/08 achou 2 grupos com
  // nome e nascimento idênticos na base viva, e **1 deles tem CPFs diferentes**
  // (Fabio Moura: 19002762755 × 01212666720). Sem o veto, este ramo ligaria
  // aquele par, e ali um dos CPFs está errado: decidir qual é ato humano. Ou
  // seja: sem o veto, a régua erraria em metade dos casos que ela alcança.
  //
  // ⚠️ "Exatamente um" também é regra: 2+ candidatos com nome e nascimento
  // idênticos significa que a base JÁ tem duplicata ali, e escolher um seria
  // cara-ou-coroa. Vai pra fila, que é onde gente decide.
  //
  // ⚠️ NUNCA ligar por opção implícita: quem passa `soChaveForte` por causa de um
  // "não sou eu" do dedup (`nao_vincular_fraco` nos Grupos) NÃO manda
  // `permitirMatchPerfeito` — ali a pessoa negou o vínculo explicitamente, e
  // nome+nascimento não pode desfazer isso.
  if (soChaveForte && permitirMatchPerfeito && nasc && nome) {
    const alvo = normalizarNome(nome);
    const { data: cands } = await supabase.from('mem_membros')
      .select('id, nome, cpf').eq('data_nascimento', nasc).is('deleted_at', null).limit(30);
    const perfeitos = (cands || []).filter((c) => {
      if (normalizarNome(c.nome) !== alvo) return false;
      const cCpf = normalizarCpf(c.cpf);
      if (cpf11 && cCpf && cpf11 !== cCpf) return false;   // CPF conflitante VETA
      return true;
    });
    if (perfeitos.length === 1) {
      const hit = perfeitos[0];
      await _consolidarCpfNoMatch(hit.id, cpf11, 'nome+nascimento', nasc);
      _registrarContatoNoMatch(hit.id, { telefone: tel, email: emailLc }, 'porta');
      await _observar(hit.id, entrada, 'nome+nascimento_exato', false);
      return { membro_id: hit.id, created: false, matched_by: 'nome+nascimento_exato' };
    }
    if (perfeitos.length > 1) {
      console.log(`[membroMatch] match perfeito AMBÍGUO em ${origem}: ${perfeitos.length} cadastros com "${nome}" e ${nasc} — criando e deixando pra fila`);
    }
  }

  // origem_cadastro = a PORTA que criou a pessoa. Sem isso, 2.163 cadastros
  // ficaram com origem nula (medido 04/08) e "de onde veio esse dado?" não tinha
  // resposta — exatamente a pergunta que uma auditoria de entrada precisa fazer.
  // `extra` tem prioridade (chamador que já sabe a porta) e o 'matcher' genérico
  // não é gravado (não informa nada).
  const origemSlug = String(origem || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const origemCadastro = extra.origem_cadastro
    || (origemSlug && origemSlug !== 'matcher' ? origemSlug.slice(0, 60) : null);

  // ⚠️⚠️ `data_nascimento` e `genero` PRECISAM entrar aqui. Até 17/08 eles só
  // chegavam ao banco se o chamador os pusesse em `extra` — o `nasc` era
  // calculado logo acima, usado para DECIDIR identidade (ramo nome+nascimento,
  // gate do candidatoCompativel) e depois DESCARTADO na criação. O efeito é a
  // mesma família do CPF do censo (04/08), do opt-in (05/08) e do sexo do Next
  // (11/08): a pessoa preenche, a porta salva na tabela dela, e o CADASTRO —
  // que é o que todo o sistema lê — nasce vazio.
  //
  // Medido em 17/08, o que motivou: 62 cadastros VIVOS com o nascimento gravado
  // em `mem_identidade_observacoes` e a coluna do cadastro em branco, vindos de
  // 8 portas diferentes (54 deles nos 17 dias anteriores). Casos que o Marcos
  // viu: Wesley Barros Ramos (censo, nasc 1955-09-29) e Pedro Moreira Gonçalez
  // (batismo, nasc 2006-10-08 + sexo M).
  //
  // ⚠️ Isto vale SÓ na CRIAÇÃO — a linha não existe ainda, então não há dado
  // humano a sobrescrever. Preencher cadastro que já existe continua sendo
  // só-onde-vazio, na régua de cada porta.
  //
  // ⚠️ Perder o nascimento também DEGRADAVA a fila de duplicidades: é ele que
  // faz o par "mesmo nome + mesmo nascimento" virar quase_confirmado. O par do
  // Wesley chegou a 100 pela ponte de observações, mas o cadastro novo não
  // exibia o dado que sustenta a decisão.
  const { data, error } = await supabase.from('mem_membros').insert({
    ...extra,
    nome: nome || 'Sem nome',
    email: emailLc || null,
    telefone: tel || null,
    cpf: cpf11,
    status,
    active: true,
    ...(nasc ? { data_nascimento: nasc } : {}),
    ...(generoCanon ? { genero: generoCanon } : {}),
    ...(origemCadastro ? { origem_cadastro: origemCadastro } : {}),
  }).select('id').single();
  if (error) {
    // 23505 (uniq_mem_membros_cpf_ativo) = corrida: dois totens/fluxos com o
    // mesmo CPF novo ao mesmo tempo. Religa no vencedor em vez de 500.
    if (error.code === '23505' && cpf11) {
      const { data: d2 } = await supabase.from('mem_membros')
        .select('id').eq('cpf', cpf11).is('deleted_at', null).maybeSingle();
      if (d2?.id) {
        await _observar(d2.id, entrada, 'cpf', false);
        return { membro_id: d2.id, created: false, matched_by: 'cpf' };
      }
    }
    throw error;
  }
  await _observar(data.id, entrada, null, true);
  return { membro_id: data.id, created: true, matched_by: null };
}

// acharMembroGuardado · versão SÓ-LEITURA de acharOuCriarGuardado (NÃO cria).
// Para pontos de entrada que querem apenas ROTEAR pro membro já existente sem
// materializar um stub agora (ex.: inscrição pública de grupos, onde o membro
// só vira membro na aprovação do líder). Mesma política conservadora de
// acharOuCriarGuardado: cpf → email → telefone+nome → nascimento+nome → null.
// NUNCA liga por telefone/e-mail sozinho (família compartilha o número).
// `soChaveForte`: quando true, liga SÓ por CPF exato (pula e-mail, telefone+nome
//   e nascimento+nome). Usado quando a pessoa afirma "não sou eu" no dedup — aí
//   nenhum sinal deniável (e-mail/telefone/nome, que a família compartilha) pode
//   ligá-la a outro cadastro; só o CPF, que é individual, resolve.
async function acharMembroGuardado({ cpf, email, telefone, nome, dataNascimento } = {}, { soChaveForte = false } = {}) {
  const cpf11 = normalizarCpf(cpf);
  const emailLc = normalizarEmail(email);
  const tel = normalizarTelefone(telefone);
  const nasc = dataNascimento || null;
  const candidatoCompativel = (c) => nomeAutorizaLigar(c.nome, nome)
    && (!cpf11 || (!!nasc && !!c.data_nascimento && nasc === c.data_nascimento));

  if (cpf11) {
    const { data } = await supabase.from('mem_membros').select('id')
      .eq('cpf', cpf11).is('deleted_at', null).maybeSingle();
    if (data?.id) return { membro_id: data.id, matched_by: 'cpf' };
  }
  if (soChaveForte) return null;
  if (emailLc && nome) {
    // E-mail compartilhado pela família não liga sozinho: exige o NOME batendo.
    // Sem nome, não roteia por e-mail (cai pra telefone+nome / nascimento+nome /
    // null). buscarCandidatos cobre também o e-mail SECUNDÁRIO (mem_contatos).
    const cands = await buscarCandidatos({ email: emailLc }, { limit: 8 });
    const hit = cands.find(candidatoCompativel);
    if (hit?.id) return { membro_id: hit.id, matched_by: 'email' };
  }
  if (tel && nome) {
    const cands = await buscarCandidatos({ telefone }, { limit: 8 });
    const hit = cands.find(candidatoCompativel);
    if (hit) return { membro_id: hit.id, matched_by: 'telefone+nome' };
  }
  if (nasc && nome) {
    const { data } = await supabase.from('mem_membros')
      .select('id, nome').eq('data_nascimento', nasc).is('deleted_at', null).limit(30);
    const hit = (data || []).find((c) => nomesMesmaPessoa(c.nome, nome));
    if (hit) return { membro_id: hit.id, matched_by: 'nome+nascimento' };
  }
  return null;
}

module.exports = {
  normalizarCpf,
  normalizarTelefone,
  normalizarEmail,
  normalizarNome,
  nomesMesmaPessoa,
  ehNomePlaceholder,
  ehNomeDerivadoDeEmail,
  nomeEhEnderecoDeEmail,
  buscarCandidatos,
  acharOuCriar,
  acharOuCriarGuardado,
  acharMembroGuardado,
  // Exportado (2026-07-31) pra fila de identidade das Entradas: quando um humano
  // liga inscrição órfã a um cadastro, o telefone/e-mail QUE ELA USOU no
  // formulário tem que acumular em mem_contatos — senão a próxima porta não
  // encontra a pessoa e nasce órfã de novo. Mesma função do match; não duplicar.
  registrarContatoDaPorta: _registrarContatoNoMatch,
};
