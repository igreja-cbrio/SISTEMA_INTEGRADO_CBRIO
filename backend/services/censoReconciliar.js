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

// Campos do censo que podem ser preenchidos no cadastro existente.
// É a MESMA lista de "campos seguros" do self-update do totem
// (membresia.js PUT /totem/membros/:id) + `profissao`, que o formulário
// público coleta e o totem não.
// ⚠️ `nome` está FORA de propósito: renomear pessoa a partir de formulário
//    público é irreversível na prática e o nome é chave de match.
// ⚠️ `cpf` está FORA porque tem serviço próprio (cpfReconciliar), que trata
//    conflito de identidade e CPF já pertencente a outro membro.
const CAMPOS_CENSO = [
  'email', 'telefone', 'data_nascimento', 'estado_civil',
  'endereco', 'bairro', 'cidade', 'cep', 'profissao',
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

  for (const campo of CAMPOS_CENSO) {
    const bruto = informado[campo];
    if (vazio(bruto)) continue;                 // não informou: nada a fazer

    const novo = String(bruto).trim();
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

  return { aplicar, acumular, conflitos, iguais };
}

// ── Confiança do vínculo (espelha cpfReconciliar) ────────────────────────────
// 'cpf' é a única chave que identifica pessoa sozinha (peso 100 no membroMatch).
function confiancaDoMatch(matchedBy) {
  return matchedBy === 'cpf' ? 'forte' : 'fraca';
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

// ── reconciliarCenso · aplica o censo num membro que JÁ EXISTE ───────────────
// Retorna { acao, aplicados[], conflitos[], acumulados[], iguais[] }
//   acao ∈ aplicado | sem_mudanca | conflito | sinal_fraco_ignorado |
//          membro_nao_encontrado
// `acao === 'conflito'` significa "tem campo pra humano decidir" — pode ter
// aplicado outros campos vazios no mesmo passe (e isso é desejado: reduz a fila
// ao que realmente precisa de gente).
async function reconciliarCenso({ membroId, matchedBy, dados = {}, origemId } = {}) {
  if (!membroId) return { acao: 'membro_nao_encontrado', aplicados: [], conflitos: [], acumulados: [], iguais: [] };

  const colunas = ['id', 'data_nascimento', 'deleted_at', ...CAMPOS_CENSO];
  const { data: membro, error } = await supabase
    .from('mem_membros')
    .select([...new Set(colunas)].join(', '))
    .eq('id', membroId)
    .maybeSingle();
  if (error) throw error;
  if (!membro || membro.deleted_at) {
    return { acao: 'membro_nao_encontrado', aplicados: [], conflitos: [], acumulados: [], iguais: [] };
  }

  const gate = podeAplicar({
    matchedBy,
    nascimentoMembro: membro.data_nascimento,
    nascimentoInformado: dados.data_nascimento,
  });
  if (!gate.ok) {
    // Não grava NADA e não abre trabalho humano falso: a linha do censo segue
    // como 'duplicado' e quem decide é a tela de Duplicatas, que já existe.
    return {
      acao: 'sinal_fraco_ignorado', motivo: gate.motivo,
      aplicados: [], conflitos: [], acumulados: [], iguais: [],
    };
  }

  let { aplicar, acumular, conflitos, iguais } = decidirCampos(membro, dados);
  let campos = Object.keys(aplicar);

  if (campos.length) {
    // Guarda de corrida: só aplica se os campos AINDA estiverem vazios. Entre o
    // read e o write alguém da equipe pode ter preenchido na tela de Membresia —
    // e sobrescrever edição humana com dado de formulário é exatamente o que
    // esta política existe pra não fazer. É tudo-ou-nada de propósito: 0 linhas
    // = o cadastro mudou, então recalculamos e o que foi preenchido vira conflito.
    let q = supabase.from('mem_membros')
      .update({ ...aplicar, updated_at: new Date().toISOString() })
      .eq('id', membroId);
    for (const campo of campos) q = q.is(campo, null);

    const { data: upd, error: e2 } = await q.select('id');
    if (e2) throw e2;

    if (!upd || upd.length === 0) {
      // Relê UMA vez e reavalia. Sem retry em laço: se mudou de novo, a linha
      // vai pra fila humana, que é o destino correto de disputa.
      const { data: m2, error: e3 } = await supabase
        .from('mem_membros')
        .select([...new Set(colunas)].join(', '))
        .eq('id', membroId)
        .maybeSingle();
      if (e3) throw e3;
      if (!m2 || m2.deleted_at) {
        return { acao: 'membro_nao_encontrado', aplicados: [], conflitos: [], acumulados: [], iguais: [] };
      }

      const r2 = decidirCampos(m2, dados);
      aplicar = r2.aplicar; acumular = r2.acumular; conflitos = r2.conflitos; iguais = r2.iguais;
      campos = Object.keys(aplicar);

      if (campos.length) {
        let q2 = supabase.from('mem_membros')
          .update({ ...aplicar, updated_at: new Date().toISOString() })
          .eq('id', membroId);
        for (const campo of campos) q2 = q2.is(campo, null);
        const { data: upd2, error: e4 } = await q2.select('id');
        if (e4) throw e4;
        if (!upd2 || upd2.length === 0) {
          // Perdeu a corrida 2×: não insiste. Vira conflito (humano decide).
          for (const campo of campos) {
            conflitos.push({ campo, atual: null, informado: aplicar[campo] });
          }
          aplicar = {}; campos = [];
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

  if (campos.length || acumulados.length) {
    const partes = [];
    if (campos.length) partes.push(`preenchido: ${campos.join(', ')}`);
    if (acumulados.length) partes.push(`contato acumulado: ${acumulados.join(', ')}`);
    if (conflitos.length) partes.push(`conflito p/ revisão: ${conflitos.map((c) => c.campo).join(', ')}`);
    await logHistorico(
      membroId,
      `${partes.join(' · ')}${origemId ? ` (cadastro ${origemId})` : ''}`,
    );
  }

  const acao = conflitos.length ? 'conflito'
    : (campos.length || acumulados.length) ? 'aplicado'
      : 'sem_mudanca';

  return { acao, aplicados: campos, conflitos, acumulados, iguais };
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
