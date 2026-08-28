// ============================================================================
// services/censoReconciliar · recadastramento (censo) sobre cadastro existente
//
// O buraco que isto fecha (demanda do censo · 2026-08-03): o formulário público
// de membresia sempre tratou "pessoa que já existe" como DUPLICATA — gerava uma
// linha `mem_cadastros_pendentes` com status='duplicado' pra alguém resolver UMA
// POR UMA (não existe endpoint em lote). Num censo a MAIORIA das submissões é
// de gente que já está na base, então o trabalho humano fica impossível e a
// campanha morre na fila, não na coleta.
//
// Política (a MESMA do cpfReconciliar · NUNCA auto-funde, NUNCA sobrescreve):
//   · campo VAZIO no cadastro + valor informado  → PREENCHE (é enriquecimento)
//   · valor informado IGUAL ao que já está lá    → no-op
//   · valor DIFERENTE num campo que já tinha     → CONFLITO: não grava, vai
//     pra decisão humana na tela de Duplicatas (com os dois lados à vista)
//
// ⚠️ Telefone e e-mail divergentes NÃO são conflito: a decisão do Marcos de
//    2026-07-17 (Contrato de porta, item 3) é ACUMULAR em `mem_contatos` — o
//    principal só muda por ação humana. Contato novo é ganho de identidade, não
//    disputa: é o que faz a próxima porta encontrar a pessoa.
//
// ⚠️ Gate de confiança (idem cpfReconciliar): só aplica sozinho quando o vínculo
//    veio de CHAVE FORTE (`matched_by='cpf'`). Match por telefone+nome /
//    e-mail+nome / nascimento+nome são sinais que a FAMÍLIA COMPARTILHA — pai e
//    filho homônimos com o telefone da casa fariam o endereço de um virar o do
//    outro. Nesses casos só aplica se o nascimento confere DOS DOIS LADOS; senão
//    não toca em nada e a linha segue pra fila humana.
//
// ⚠️ NÃO promove ninguém a membro. `vinculo_declarado` é autodeclarado e não
//    encosta em `mem_membros.status` — mesma regra do `converteu_na_cbrio`.
// ============================================================================

const { supabase } = require('../utils/supabase');
const {
  normalizarTelefone, normalizarEmail, registrarContatoDaPorta,
} = require('./membroMatch');
const { traduzirParaCadastro } = require('../utils/censoCampoCadastro');

// Campos do censo que podem ser preenchidos no cadastro existente.
// É a MESMA lista de "campos seguros" do self-update do totem
// (membresia.js PUT /totem/membros/:id) + `profissao`, que o formulário
// público coleta e o totem não.
// ⚠️ `nome` está FORA de propósito: renomear pessoa a partir de formulário
//    público é irreversível na prática e o nome é chave de match.
// ⚠️ `cpf` está FORA porque tem serviço próprio (cpfReconciliar), que trata
//    conflito de identidade e CPF já pertencente a outro membro.
// ⚠️ `genero` entrou em 04/08, quando o formulário passou a coletar sexo: sem
//    ele o campo chegava do censo e era DESCARTADO em silêncio, então a pessoa
//    respondia e o cadastro continuava incompleto pela régua da fila.
// ⚠️ `escolaridade` entrou em 17/08: a pergunta existia no censo desde o começo
//    e o dado era DESCARTADO em silêncio por não ter coluna nem destino. Mesma
//    classe do sexo em 04/08.
const CAMPOS_CENSO = [
  'email', 'telefone', 'data_nascimento', 'estado_civil', 'genero',
  'endereco', 'bairro', 'cidade', 'cep', 'profissao', 'escolaridade',
];

// Campos cuja divergência ACUMULA (mem_contatos) em vez de virar conflito.
const CAMPOS_ACUMULAVEIS = new Set(['email', 'telefone']);

function vazio(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

// Forma canônica só PRA COMPARAR — o valor gravado é o que a pessoa digitou
// (menos o trim). Comparar "Rua X" com "rua x " como diferentes geraria
// conflito falso e jogaria a linha na fila humana sem motivo.
function paraComparar(campo, valor) {
  if (vazio(valor)) return '';
  const s = String(valor).trim();
  if (campo === 'email') return normalizarEmail(s) || '';
  if (campo === 'telefone') return normalizarTelefone(s) || '';
  if (campo === 'cep') return s.replace(/\D+/g, '');
  if (campo === 'data_nascimento') return s.slice(0, 10);
  return s.toLowerCase().replace(/\s+/g, ' ');
}

// ── decidirCampos · a POLÍTICA, pura (sem banco, sem relógio) ────────────────
// `atual` = o que está em mem_membros · `informado` = o que a pessoa enviou.
// Devolve o que aplicar, o que acumular, o que é conflito e o que já estava
// igual. É esta função que os testes cobrem — o resto do arquivo é IO.
function decidirCampos(atual = {}, informado = {}) {
  const aplicar = {};
  const acumular = {};
  const conflitos = [];
  const iguais = [];
  const descartados = [];

  for (const campo of CAMPOS_CENSO) {
    const bruto = informado[campo];
    if (vazio(bruto) && !Array.isArray(bruto)) continue;   // não informou: nada a fazer

    // ⚠️⚠️ TRADUÇÃO ANTES DE QUALQUER COISA (17/08). O que chega aqui é o
    // RÓTULO que a pessoa viu na tela ("Casado(a)"); o que a coluna aceita é o
    // vocabulário do CHECK ('casado'). Sem esta linha o UPDATE inteiro morria
    // com 23514 e levava embora TODOS os outros campos do mesmo passe — foi o
    // que deixou as 12 respostas do Censo 2026 sem aplicar nada.
    const t = traduzirParaCadastro(campo, bruto);
    if (!t.ok) {
      // 'vazio' não é problema — é só não ter informado. O resto é DECLARADO:
      // campo silenciosamente descartado é como o CPF do censo ficou 4 dias
      // sumindo em 04/08 sem nada na tela denunciar.
      if (t.motivo !== 'vazio') {
        descartados.push({ campo, informado: Array.isArray(bruto) ? bruto.join(', ') : String(bruto), motivo: t.motivo });
      }
      continue;
    }

    const novo = t.valor;
    const cmpNovo = paraComparar(campo, novo);
    if (!cmpNovo) continue;                     // informou algo que normaliza pra vazio

    const cmpAtual = paraComparar(campo, atual[campo]);

    if (!cmpAtual) {
      aplicar[campo] = novo;                    // destino vazio → enriquece
    } else if (cmpAtual === cmpNovo) {
      iguais.push(campo);                       // confirmou o que já tínhamos
    } else if (CAMPOS_ACUMULAVEIS.has(campo)) {
      acumular[campo] = novo;                   // decisão 17/07: soma, não disputa
    } else {
      conflitos.push({ campo, atual: atual[campo] ?? null, informado: novo });
    }
  }

  return { aplicar, acumular, conflitos, iguais, descartados };
}

// ── Confiança do vínculo (espelha cpfReconciliar) ────────────────────────────
// 'cpf' é a única chave que identifica pessoa sozinha (peso 100 no membroMatch).
//
// ⚠️ `token_censo` também é FORTE, e por um motivo diferente: não é um dado que
// a pessoa digitou (e que poderia ser de outra pessoa da família) — é o link
// PESSOAL que o sistema emitiu e entregou no WhatsApp/e-mail DELA, assinado com
// o `membro_id` dentro (utils/censoToken.js). Não há a que outro cadastro ele
// possa apontar. Tratá-lo como fraco jogaria na fila humana justamente o caminho
// que o disparo criou pra resolver ~2.000 cadastros sem CPF — e é o CPF que
// esses cadastros estão vindo buscar, então exigir CPF forte aqui seria circular.
const CHAVES_FORTES = new Set(['cpf', 'token_censo']);

function confiancaDoMatch(matchedBy) {
  return CHAVES_FORTES.has(matchedBy) ? 'forte' : 'fraca';
}

// Com sinal fraco, exige nascimento conferível E IGUAL dos dois lados. Sem isso
// o vínculo pode ter ligado a pessoa ERRADA (mãe/filha com o mesmo telefone) e
// aplicaríamos o endereço de uma no cadastro da outra.
function podeAplicar({ matchedBy, nascimentoMembro, nascimentoInformado }) {
  if (confiancaDoMatch(matchedBy) === 'forte') return { ok: true };
  const a = nascimentoMembro ? String(nascimentoMembro).slice(0, 10) : null;
  const b = nascimentoInformado ? String(nascimentoInformado).slice(0, 10) : null;
  if (!a || !b) return { ok: false, motivo: 'sinal_fraco_sem_nascimento' };
  if (a !== b) return { ok: false, motivo: 'sinal_fraco_nascimento_divergente' };
  return { ok: true };
}

async function logHistorico(membroId, resumo) {
  // Schema VIVO de mem_historico (mesma nota do cpfReconciliar): `tipo` é
  // NOT NULL com CHECK que aceita 'outro'; a ação vai no prefixo da descrição.
  const { error } = await supabase.from('mem_historico').insert({
    membro_id: membroId,
    tipo: 'outro',
    descricao: `[censo] ${resumo}`,
    created_at: new Date().toISOString(),
  });
  if (error) console.warn('[censoReconciliar] histórico não gravado:', error.message);
}

// Colunas de `mem_membros` que podem não existir ainda (deploy em 2 etapas).
// ⚠️ Pedir coluna inexistente faz o PostgREST recusar a query INTEIRA (42703),
// o que derrubaria a reconciliação de TODO MUNDO por causa de um campo novo —
// a lição do `parcelas_max`. Aqui a ausência degrada pra "esse campo não entra
// nesta rodada", nunca pra erro.
const COLUNAS_OPCIONAIS = ['escolaridade'];

function semColunasOpcionais(lista) {
  return lista.filter((c) => !COLUNAS_OPCIONAIS.includes(c));
}

// Códigos de erro de DADO (o valor não serve pra coluna). Diferente de erro de
// INFRA, que precisa propagar: aqui insistir não resolve, e derrubar o passe
// inteiro por um campo ruim é o bug que estamos consertando.
const ERRO_DE_DADO = new Set(['23514', '22P02', '22001', '22007', '22008', '42703']);

// Aplica os campos com a guarda de corrida `.is(campo, null)`.
// Se o bloco for recusado por DADO, tenta campo a campo — assim um valor ruim
// deixa de levar os bons embora (política de 04/08: gravar o efeito DURANTE).
async function aplicarCampos(membroId, aplicar) {
  const campos = Object.keys(aplicar);
  if (!campos.length) return { gravados: [], recusados: [], perdeuCorrida: false };

  const tentar = async (subset) => {
    let q = supabase.from('mem_membros')
      .update({ ...subset, updated_at: new Date().toISOString() })
      .eq('id', membroId);
    for (const campo of Object.keys(subset)) q = q.is(campo, null);
    return q.select('id');
  };

  const { data, error } = await tentar(aplicar);
  if (!error) {
    return { gravados: data && data.length ? campos : [], recusados: [], perdeuCorrida: !data || !data.length };
  }
  if (!ERRO_DE_DADO.has(error.code)) throw error;

  const gravados = []; const recusados = []; let perdeuCorrida = false;
  for (const campo of campos) {
    const { data: d1, error: e1 } = await tentar({ [campo]: aplicar[campo] });
    if (e1) {
      if (!ERRO_DE_DADO.has(e1.code)) throw e1;
      recusados.push({ campo, informado: aplicar[campo], motivo: `banco_recusou_${e1.code}` });
    } else if (d1 && d1.length) gravados.push(campo);
    else perdeuCorrida = true;
  }
  return { gravados, recusados, perdeuCorrida };
}

// ── reconciliarCenso · aplica o censo num membro que JÁ EXISTE ───────────────
// Retorna { acao, aplicados[], conflitos[], acumulados[], iguais[], descartados[] }
//   acao ∈ aplicado | sem_mudanca | conflito | sinal_fraco_ignorado |
//          membro_nao_encontrado
// `acao === 'conflito'` significa "tem campo pra humano decidir" — pode ter
// aplicado outros campos vazios no mesmo passe (e isso é desejado: reduz a fila
// ao que realmente precisa de gente).
// `descartados` = o que o censo trouxe e NÃO foi gravado (rótulo fora do
// vocabulário, CEP inválido, coluna ausente). Nunca é silencioso.
async function reconciliarCenso({ membroId, matchedBy, dados = {}, origemId } = {}) {
  const vazioResp = (acao, extra = {}) => ({
    acao, aplicados: [], conflitos: [], acumulados: [], iguais: [], descartados: [], ...extra,
  });
  if (!membroId) return vazioResp('membro_nao_encontrado');

  const colunasTodas = [...new Set(['id', 'data_nascimento', 'deleted_at', ...CAMPOS_CENSO])];
  let colunas = colunasTodas;
  let indisponiveis = [];

  let { data: membro, error } = await supabase
    .from('mem_membros').select(colunas.join(', ')).eq('id', membroId).maybeSingle();

  if (error && error.code === '42703') {
    // Migration ainda não aplicada: segue sem os campos novos.
    colunas = semColunasOpcionais(colunasTodas);
    indisponiveis = COLUNAS_OPCIONAIS.slice();
    ({ data: membro, error } = await supabase
      .from('mem_membros').select(colunas.join(', ')).eq('id', membroId).maybeSingle());
  }
  if (error) throw error;
  if (!membro || membro.deleted_at) return vazioResp('membro_nao_encontrado');

  // Cópia local: o chamador não pode ter o payload dele alterado por nós.
  const informado = { ...dados };
  const descartadosBase = [];
  for (const campo of indisponiveis) {
    if (!vazio(informado[campo])) {
      descartadosBase.push({ campo, informado: String(informado[campo]), motivo: 'coluna_ausente' });
    }
    delete informado[campo];
  }

  const gate = podeAplicar({
    matchedBy,
    nascimentoMembro: membro.data_nascimento,
    nascimentoInformado: informado.data_nascimento,
  });
  if (!gate.ok) {
    // Não grava NADA e não abre trabalho humano falso: a linha do censo segue
    // como 'duplicado' e quem decide é a tela de Duplicatas, que já existe.
    return vazioResp('sinal_fraco_ignorado', { motivo: gate.motivo, descartados: descartadosBase });
  }

  let { aplicar, acumular, conflitos, iguais, descartados } = decidirCampos(membro, informado);
  descartados = [...descartadosBase, ...descartados];
  let campos = Object.keys(aplicar);

  if (campos.length) {
    // Guarda de corrida: só aplica se os campos AINDA estiverem vazios. Entre o
    // read e o write alguém da equipe pode ter preenchido na tela de Membresia —
    // e sobrescrever edição humana com dado de formulário é exatamente o que
    // esta política existe pra não fazer. 0 linhas = o cadastro mudou, então
    // recalculamos e o que foi preenchido vira conflito.
    const r1 = await aplicarCampos(membroId, aplicar);
    descartados.push(...r1.recusados);
    campos = r1.gravados;

    if (r1.perdeuCorrida) {
      // Relê UMA vez e reavalia. Sem retry em laço: se mudou de novo, a linha
      // vai pra fila humana, que é o destino correto de disputa.
      const { data: m2, error: e3 } = await supabase
        .from('mem_membros').select(colunas.join(', ')).eq('id', membroId).maybeSingle();
      if (e3) throw e3;
      if (!m2 || m2.deleted_at) return vazioResp('membro_nao_encontrado');

      const r2 = decidirCampos(m2, informado);
      acumular = r2.acumular; conflitos = r2.conflitos; iguais = r2.iguais;
      // Campos já gravados na 1ª passada não voltam a ser propostos.
      const restantes = Object.fromEntries(
        Object.entries(r2.aplicar).filter(([c]) => !campos.includes(c)),
      );

      if (Object.keys(restantes).length) {
        const r3 = await aplicarCampos(membroId, restantes);
        descartados.push(...r3.recusados);
        campos = [...campos, ...r3.gravados];
        if (r3.perdeuCorrida) {
          // Perdeu a corrida 2×: não insiste. Vira conflito (humano decide).
          for (const campo of Object.keys(restantes)) {
            if (!r3.gravados.includes(campo) && !r3.recusados.some((x) => x.campo === campo)) {
              conflitos.push({ campo, atual: null, informado: restantes[campo] });
            }
          }
        }
      }
    }
  }

  // Contato divergente ACUMULA (nunca sobrescreve o principal). Best-effort:
  // falha aqui não invalida o que já foi aplicado.
  const acumulados = Object.keys(acumular);
  if (acumulados.length) {
    registrarContatoDaPorta(
      membroId,
      { telefone: acumular.telefone || null, email: acumular.email || null },
      'censo',
    );
  }

  if (campos.length || acumulados.length || descartados.length) {
    const partes = [];
    if (campos.length) partes.push(`preenchido: ${campos.join(', ')}`);
    if (acumulados.length) partes.push(`contato acumulado: ${acumulados.join(', ')}`);
    if (conflitos.length) partes.push(`conflito p/ revisão: ${conflitos.map((c) => c.campo).join(', ')}`);
    // Descarte VAI PRO HISTÓRICO: é o rastro de "a pessoa respondeu e o sistema
    // não guardou", que é justamente o que ninguém descobria antes.
    if (descartados.length) {
      partes.push(`não guardado: ${descartados.map((d) => `${d.campo} (${d.motivo})`).join(', ')}`);
    }
    await logHistorico(
      membroId,
      `${partes.join(' · ')}${origemId ? ` (cadastro ${origemId})` : ''}`,
    );
  }

  const acao = conflitos.length ? 'conflito'
    : (campos.length || acumulados.length) ? 'aplicado'
      : 'sem_mudanca';

  return { acao, aplicados: campos, conflitos, acumulados, iguais, descartados };
}

module.exports = {
  reconciliarCenso,
  // exportados pro teste e pra reuso — a política é o que importa manter estável
  decidirCampos,
  podeAplicar,
  confiancaDoMatch,
  CAMPOS_CENSO,
  CAMPOS_ACUMULAVEIS,
};
