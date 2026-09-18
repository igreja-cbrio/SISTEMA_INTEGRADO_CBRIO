// ============================================================================
// E-Inscrição · a IMPORTAÇÃO em si (planejar + executar)
//
// Pedido do Marcos (14/09/2026): *"adicione dentro do painel do retiro a opção
// de importar inscrições usando esse molde da planilha, para que posteriormente
// ele possa alterar direto sem me mandar"*. Até aqui a importação só existia
// como script de terminal (`_importar_einscricao_retiro.cjs`) — quem coordena o
// retiro tinha que me mandar a exportação.
//
// A régua de LINHA (planilha → inscrição) vive em `backend/utils/eInscricao.js`.
// Aqui mora a régua de CONJUNTO: dado o que a planilha traz e o que já está no
// banco, o que entra, o que cancela e o que fica de fora — e depois a gravação.
//
// ⚠️ `planejar` é PURO de propósito (não lê banco, não escreve): é ele que a
// tela mostra ANTES de gravar e é ele que o gate testa
// (`src/test/importarEInscricao.test.ts`). `executar` é a única parte que toca
// o banco, e só executa um plano já montado.
//
// ⚠️⚠️ A importação NUNCA sobrescreve inscrição existente. Quem já está fica
// como está — nem valor, nem resposta, nem vínculo. A planilha é um SNAPSHOT de
// outra plataforma; deixá-la mandar por cima do que a equipe corrigiu aqui
// transformaria cada re-importação num rollback silencioso das correções.
//
// ⚠️⚠️ NÃO mexe em `insc_eventos.lotes`: a inscrição importada JÁ ocupa posição
// na régua do lote e da vaga (linha viva não-cancelada). Reduzir `lotes[0].vagas`
// por cima contaria a mesma pessoa duas vezes.
// ============================================================================
const ei = require('../utils/eInscricao');

/** Sem estes 5 o INSERT é recusado pelo CHECK `chk_inscricoes_contrato`. */
const CAMPOS_CONTRATO = [
  ['cpf', 'CPF'],
  ['telefone', 'telefone'],
  ['email', 'e-mail'],
  ['data_nascimento', 'data de nascimento'],
  ['sexo', 'gênero'],
];

/** Idade em anos completos numa data 'YYYY-MM-DD'. null se não dá pra saber. */
function idadeEmAnos(nascimento, agora = new Date()) {
  if (!nascimento) return null;
  const m = String(nascimento).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  let anos = agora.getUTCFullYear() - Number(m[1]);
  const mesDia = (agora.getUTCMonth() + 1) * 100 + agora.getUTCDate();
  if (mesDia < Number(m[2]) * 100 + Number(m[3])) anos -= 1;
  return anos;
}

/**
 * Alertas que a pessoa que importa PRECISA ver antes de clicar em gravar.
 * Não bloqueiam nada: a planilha é a verdade da outra plataforma e corrigir
 * dado de gente é decisão humana, não do parser. (Foi assim que a "Laura
 * nascida em 2025" apareceu na importação de 09/09 em vez de virar 2015 em
 * silêncio.)
 */
function alertasDaLinha(linha, agora = new Date()) {
  const alertas = [...(linha.avisos || [])];
  const idade = idadeEmAnos(linha.data_nascimento, agora);
  if (idade != null && idade < 18 && !linha.responsavel_nome) alertas.push('menor sem responsável na planilha');
  if (idade != null && (idade < 5 || idade > 90)) alertas.push(`idade ${idade} anos — conferir a data de nascimento`);
  return alertas;
}

/**
 * Planeja a importação.
 *
 * @param linhas  saída de `mapearLinhaEInscricao` (uma por linha da planilha)
 * @param vivas   inscrições NÃO soft-deletadas do evento
 *                ({ id, codigo, nome_completo, cpf, status, origem, dados })
 *                — inclusive as canceladas, que seguram o CPF no UNIQUE parcial
 * @param keysEvento  keys dos campos do evento, pra apontar resposta que cairia
 *                    numa pergunta que este evento não tem
 *
 * Chave de identidade, nesta ordem: código da plataforma → CPF. O código é o
 * mais forte (é o id de lá); o CPF pega quem entrou pelo Pix aqui e comprou
 * também no cartão, evitando a segunda linha.
 */
function planejar(linhas, vivas, { keysEvento = null, agora = new Date() } = {}) {
  const porCpf = new Map();
  const porCodigo = new Map();
  for (const v of vivas || []) {
    if (v?.cpf && !porCpf.has(v.cpf)) porCpf.set(v.cpf, v);
    const cod = v?.dados?.e_inscricao?.codigo;
    if (cod && !porCodigo.has(cod)) porCodigo.set(cod, v);
  }
  // Duplicata DENTRO do arquivo: a mesma pessoa exportada duas vezes bateria no
  // UNIQUE parcial e viraria "falha" no meio da gravação. Aqui vira "pulada".
  const noArquivo = new Map();

  const inserir = []; const cancelar = []; const pular = []; const invalidas = [];
  const keysDesconhecidas = new Set();

  for (const l of linhas || []) {
    const ja = (l.codigo_plataforma && porCodigo.get(l.codigo_plataforma))
      || (l.cpf && porCpf.get(l.cpf));

    if (l.status === 'cancelada') {
      if (ja && ja.status !== 'cancelada' && ja.origem === ei.ORIGEM_E_INSCRICAO) {
        cancelar.push({ linha: l, existente: ja });
      } else {
        pular.push({ linha: l, motivo: ja ? 'cancelada lá e aqui também' : 'cancelada lá e nunca entrou aqui' });
      }
      continue;
    }
    if (ja) {
      pular.push({ linha: l, motivo: `já está no sistema (${ja.codigo} · ${ja.status})`, existente: ja });
      continue;
    }
    const chaveArquivo = l.codigo_plataforma || l.cpf;
    if (chaveArquivo && noArquivo.has(chaveArquivo)) {
      pular.push({ linha: l, motivo: 'linha repetida na própria planilha' });
      continue;
    }

    const faltam = CAMPOS_CONTRATO.filter(([campo]) => !l[campo]).map(([, rotulo]) => rotulo);
    if (faltam.length) { invalidas.push({ linha: l, faltam }); continue; }

    if (keysEvento) {
      for (const k of Object.keys(l.dados || {})) {
        if (k !== 'e_inscricao' && !keysEvento.has(k)) keysDesconhecidas.add(k);
      }
    }
    if (chaveArquivo) noArquivo.set(chaveArquivo, l);
    inserir.push({ linha: l, alertas: alertasDaLinha(l, agora) });
  }

  const bruto = inserir.reduce((s, x) => s + (x.linha.dados?.e_inscricao?.valor_bruto_centavos || 0), 0);
  const liquido = inserir.reduce((s, x) => s + (x.linha.valor_cobrado_centavos || 0), 0);

  return {
    inserir,
    cancelar,
    pular,
    invalidas,
    keys_desconhecidas: [...keysDesconhecidas],
    total_linhas: (linhas || []).length,
    dinheiro: { bruto_centavos: bruto, liquido_centavos: liquido, taxa_pct: ei.TAXA_E_INSCRICAO_PCT },
  };
}

/**
 * Grava o plano. Uma linha por vez, de propósito: o vínculo com a membresia
 * roda DEPOIS do INSERT (o matcher guarda o id da inscrição como origem) e uma
 * falha isolada não pode derrubar as outras 25.
 *
 * @param supabase              cliente já autenticado (service_role)
 * @param acharOuCriarGuardado  matcher oficial da membresia
 */
async function executar({ supabase, acharOuCriarGuardado, eventoId, plano }) {
  const inseridas = []; const canceladas = []; const erros = [];
  let ligados = 0; let criados = 0; let semVinculo = 0;

  for (const { linha } of plano.inserir) {
    const { avisos, codigo_plataforma: _cod, ...row } = linha;
    const { data: ins, error } = await supabase.from('inscricoes')
      .insert({ ...row, evento_id: eventoId, whatsapp_optin: false })
      .select('id, codigo').single();
    if (error) { erros.push({ nome: linha.nome_completo, erro: error.message }); continue; }

    let r = null;
    try {
      r = await acharOuCriarGuardado({
        cpf: linha.cpf, email: linha.email, telefone: linha.telefone, nome: linha.nome_completo,
        dataNascimento: linha.data_nascimento, genero: linha.sexo, status: 'visitante',
        extra: { data_nascimento: linha.data_nascimento },
        origem: 'inscricoes_e_inscricao', origemId: ins.id,
      });
    } catch (e) {
      erros.push({ nome: linha.nome_completo, erro: `vínculo: ${e.message}`, apenas_vinculo: true });
    }
    let vinculo = 'sem vínculo';
    if (r?.membro_id) {
      const { error: eM } = await supabase.from('inscricoes')
        .update({ membro_id: r.membro_id }).eq('id', ins.id).is('membro_id', null);
      if (eM) {
        erros.push({ nome: linha.nome_completo, erro: `gravar vínculo: ${eM.message}`, apenas_vinculo: true });
        semVinculo++;
      } else if (r.created) { criados++; vinculo = 'cadastro criado'; } else { ligados++; vinculo = `ligado (${r.matched_by})`; }
    } else semVinculo++;

    inseridas.push({
      id: ins.id, codigo: ins.codigo, nome: linha.nome_completo,
      codigo_plataforma: linha.dados?.e_inscricao?.codigo || null,
      valor_centavos: linha.valor_cobrado_centavos, vinculo,
    });
  }

  for (const { linha, existente } of plano.cancelar) {
    const { error } = await supabase.from('inscricoes')
      .update({ status: 'cancelada' }).eq('id', existente.id).neq('status', 'cancelada');
    if (error) erros.push({ nome: linha.nome_completo, erro: `cancelar: ${error.message}` });
    else canceladas.push({ id: existente.id, codigo: existente.codigo, nome: linha.nome_completo });
  }

  return { inseridas, canceladas, ligados, criados, sem_vinculo: semVinculo, erros };
}

module.exports = { planejar, executar, alertasDaLinha, idadeEmAnos, CAMPOS_CONTRATO };
