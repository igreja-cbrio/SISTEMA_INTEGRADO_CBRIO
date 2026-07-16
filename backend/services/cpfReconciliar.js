// ============================================================================
// services/cpfReconciliar · reconciliação de CPF tardio
//
// O buraco que isto fecha (auditoria CPF · 2026-07-16): a pessoa entra sem CPF
// (decisão de culto vira stub em mem_membros), e quando o CPF chega DEPOIS
// (inscrição de batismo/Next, ficha de voluntário, censo, check-in) ele ficava
// só na linha-satélite — o membro seguia sem CPF e a identidade global nunca
// se consolidava.
//
// Política (mesma do membroMatch · NUNCA auto-funde):
//   · membro sem CPF + CPF livre        → preenche o CPF no membro (enriquece)
//   · CPF já pertence a OUTRO membro    → NÃO funde: abre pendência de
//     identidade (fila humana · módulo Entradas/Duplicados resolve com
//     merge_membros "somar, não substituir")
//   · membro já tem CPF diferente       → pendência (cpf_divergente)
//
// A tabela identidade_pendencias é criada na migration 20260716150000. O
// serviço tolera a tabela ausente (loga e segue) pra rodar antes da migration.
// ============================================================================

const { supabase } = require('../utils/supabase');
const { normalizarCpf, cpfValido } = require('../utils/cpf');

// Dono ativo do CPF (deleted_at IS NULL · dados vivos são digits-only).
async function donoAtivoDoCpf(cpf11, { exceto } = {}) {
  let q = supabase.from('mem_membros')
    .select('id, nome, cpf')
    .eq('cpf', cpf11)
    .is('deleted_at', null)
    .limit(2);
  if (exceto) q = q.neq('id', exceto);
  const { data, error } = await q;
  if (error) throw error;
  return (data && data[0]) || null;
}

async function registrarPendencia({ tipo, membroId, conflitoId, origem, origemId, detalhe }) {
  try {
    const { error } = await supabase.from('identidade_pendencias').insert({
      tipo,
      membro_id: membroId || null,
      membro_conflito_id: conflitoId || null,
      origem: origem || null,
      origem_id: origemId != null ? String(origemId) : null,
      detalhe: detalhe || null,
    });
    // 23505 = já existe pendência aberta pro mesmo par · idempotente
    if (error && error.code !== '23505') throw error;
    return !error;
  } catch (e) {
    console.error('[cpfReconciliar] pendência não registrada:', e.message);
    return false;
  }
}

async function logHistorico(membroId, acao, observacao) {
  // mem_historico só tem `descricao` (NOT NULL) — não existem colunas
  // acao/observacao (auditoria adversarial 2026-07-16: o insert antigo falhava
  // 100% das vezes em silêncio, porque o supabase-js não lança erro de API).
  const { error } = await supabase.from('mem_historico').insert({
    membro_id: membroId,
    descricao: `[${acao}] ${observacao}`,
    created_at: new Date().toISOString(),
  });
  if (error) console.warn('[cpfReconciliar] histórico não gravado:', error.message);
}

// reconciliarCpfTardio · um CPF acabou de chegar pra um membro já existente.
// `dataNascimento` (opcional): nascimento informado junto com o CPF — se
// divergir do nascimento do membro, o vínculo por sinal fraco provavelmente
// ligou a pessoa ERRADA (mãe/filha homônimas com telefone compartilhado) →
// não grava, vira pendência.
// `confianca` ('forte' | 'fraca'): quando o vínculo que trouxe o CPF nasceu de
// um match FRACO (telefone+nome / e-mail+nome — sinais que a família
// compartilha), gravar o CPF direto contamina a identidade global se o match
// errou (pai e filho homônimos com o telefone da casa). Com 'fraca', só
// consolida se o nascimento confere DOS DOIS lados; sem nascimento conferível
// vira pendência humana (cpf_para_confirmar).
// Retorna { acao } ∈ ja_tinha | cpf_preenchido | conflito_pendencia |
//   divergente_pendencia | nascimento_divergente_pendencia |
//   cpf_para_confirmar_pendencia | cpf_invalido | membro_nao_encontrado
async function reconciliarCpfTardio({ membroId, cpf, origem, origemId, dataNascimento, confianca = 'forte' } = {}) {
  const cpf11 = normalizarCpf(cpf);
  if (!membroId || !cpf11 || !cpfValido(cpf11)) return { acao: 'cpf_invalido' };

  const { data: membro, error } = await supabase.from('mem_membros')
    .select('id, nome, cpf, data_nascimento, deleted_at')
    .eq('id', membroId)
    .maybeSingle();
  if (error) throw error;
  if (!membro || membro.deleted_at) return { acao: 'membro_nao_encontrado' };

  const cpfAtual = normalizarCpf(membro.cpf);
  if (cpfAtual === cpf11) return { acao: 'ja_tinha' };

  // Nascimento divergente = forte suspeita de que o membro ligado é OUTRA
  // pessoa (o sinal fraco errou) → não consolida, fila humana decide.
  const nascInput = dataNascimento ? String(dataNascimento).slice(0, 10) : null;
  const nascMembro = membro.data_nascimento ? String(membro.data_nascimento).slice(0, 10) : null;
  if (nascInput && nascMembro && nascInput !== nascMembro) {
    await registrarPendencia({
      tipo: 'vinculo_divergente', membroId, conflitoId: null, origem, origemId,
      detalhe: 'CPF chegou com data de nascimento diferente da do membro vinculado — provável vínculo por sinal fraco na pessoa errada.',
    });
    return { acao: 'nascimento_divergente_pendencia' };
  }

  // Membro já tem OUTRO CPF → não sobrescreve identidade · fila humana decide
  if (cpfAtual) {
    const dono = await donoAtivoDoCpf(cpf11, { exceto: membroId });
    await registrarPendencia({
      tipo: 'cpf_divergente', membroId, conflitoId: dono?.id || null,
      origem, origemId,
      detalhe: `Membro já tem CPF; um CPF diferente chegou via ${origem || 'origem desconhecida'}.`,
    });
    return { acao: 'divergente_pendencia', conflito_id: dono?.id || null };
  }

  // CPF pertence a outro membro ativo → duplicata provável · fila humana funde
  const dono = await donoAtivoDoCpf(cpf11, { exceto: membroId });
  if (dono) {
    await registrarPendencia({
      tipo: 'cpf_conflito', membroId, conflitoId: dono.id,
      origem, origemId,
      detalhe: `CPF chegou pra um cadastro sem CPF, mas já pertence a outro membro ativo — provável mesma pessoa em 2 cadastros (fundir).`,
    });
    return { acao: 'conflito_pendencia', conflito_id: dono.id };
  }

  // Match fraco sem nascimento conferível dos DOIS lados → não consolida
  // (o membro pode ser um homônimo da família; o CPF viraria identidade
  // permanente do cadastro errado e capturaria todas as portas). Fila humana.
  // Roda DEPOIS dos checks de conflito de propósito: cpf_divergente e
  // cpf_conflito carregam o conflito_id (informação de fusão) que este tipo
  // genérico não tem — o gate só barra a GRAVAÇÃO do caminho feliz.
  if (confianca === 'fraca' && !(nascInput && nascMembro)) {
    await registrarPendencia({
      tipo: 'cpf_para_confirmar', membroId, conflitoId: null, origem, origemId,
      detalhe: `CPF ${cpf11} chegou junto de um vínculo por sinal fraco (${origem || 'origem desconhecida'}) sem nascimento conferível dos dois lados — confirmar antes de consolidar no cadastro.`,
    });
    return { acao: 'cpf_para_confirmar_pendencia' };
  }

  // Caminho feliz: enriquece o membro com o CPF
  const { data: upd, error: e2 } = await supabase.from('mem_membros')
    .update({ cpf: cpf11, updated_at: new Date().toISOString() })
    .eq('id', membroId)
    .is('cpf', null)
    .select('id');
  if (e2) {
    // 23505 = corrida com outro fluxo gravando o mesmo CPF · vira conflito
    if (e2.code === '23505') {
      const donoAgora = await donoAtivoDoCpf(cpf11, { exceto: membroId });
      if (donoAgora) {
        await registrarPendencia({
          tipo: 'cpf_conflito', membroId, conflitoId: donoAgora.id, origem, origemId,
          detalhe: 'Corrida: outro fluxo gravou o mesmo CPF primeiro.',
        });
        return { acao: 'conflito_pendencia', conflito_id: donoAgora.id };
      }
      // Sem dono VIVO e mesmo assim 23505: o CPF está preso num cadastro
      // soft-deletado — em prod ainda existe a constraint TOTAL antiga
      // mem_membros_cpf_key (pré-20260715120000), que trava o CPF até de
      // deletados. Vira pendência (fundir/restaurar é decisão humana).
      await registrarPendencia({
        tipo: 'cpf_conflito', membroId, conflitoId: null, origem, origemId,
        detalhe: 'CPF preso num cadastro deletado (constraint total mem_membros_cpf_key).',
      });
      return { acao: 'conflito_pendencia', conflito_id: null };
    }
    throw e2;
  }
  if (!upd || upd.length === 0) {
    // Corrida: o membro recebeu OUTRO CPF entre o read e o write (a guarda
    // .is('cpf', null) casou 0 linhas). Sem isso, retornava 'cpf_preenchido'
    // com histórico mentiroso e o conflito real era engolido.
    const { data: m2 } = await supabase.from('mem_membros')
      .select('cpf').eq('id', membroId).maybeSingle();
    if (normalizarCpf(m2?.cpf) === cpf11) return { acao: 'ja_tinha' };
    await registrarPendencia({
      tipo: 'cpf_divergente', membroId, conflitoId: null, origem, origemId,
      detalhe: 'Corrida: o membro recebeu outro CPF durante a reconciliação.',
    });
    return { acao: 'divergente_pendencia', conflito_id: null };
  }

  await logHistorico(membroId, 'cpf_recebido',
    `CPF recebido tardiamente via ${origem || 'fluxo'}${origemId ? ` (id ${origemId})` : ''} e consolidado no cadastro.`);
  return { acao: 'cpf_preenchido' };
}

// propagarCpfConvertido · espelha o CPF do membro nas linhas de cui_convertidos
// que nasceram sem CPF (a coorte BAT90/NEXT90 cruza por membro_id/cpf/nome —
// quanto mais CPF, menos dependência do match por nome).
async function propagarCpfConvertido({ membroId }) {
  try {
    const { data: m } = await supabase.from('mem_membros')
      .select('cpf').eq('id', membroId).maybeSingle();
    const cpf11 = normalizarCpf(m?.cpf);
    if (!cpf11) return 0;
    const { data, error } = await supabase.from('cui_convertidos')
      .update({ cpf: cpf11 })
      .eq('membro_id', membroId)
      .is('cpf', null)
      .select('id');
    if (error) throw error;
    return (data || []).length;
  } catch (e) {
    console.error('[cpfReconciliar] propagar cui_convertidos:', e.message);
    return 0;
  }
}

module.exports = { reconciliarCpfTardio, propagarCpfConvertido, donoAtivoDoCpf, registrarPendencia };
