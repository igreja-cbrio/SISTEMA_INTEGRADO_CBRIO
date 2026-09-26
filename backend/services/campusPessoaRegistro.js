const { validarContexto } = require('../utils/campusQuery');
const { cpfValido, normalizarCpf } = require('../utils/cpf');
const { ErroCampus } = require('./campusContexto');

// Recebe apenas dados fornecidos na porta. O membro explícito já deve ter
// passado pelo guard de referência da rota; nunca devolve sua ficha global.
async function resolverPessoaRegistro(entrada, campus, origem, dependencias = {}) {
  validarContexto(campus, true);
  const db = dependencias.supabase || require('../utils/supabase').supabase;
  const temCpf = String(entrada.cpf || '').trim() !== '';
  const informado = String(entrada.cpf || '').replace(/\D/g, '');
  const cpf = normalizarCpf(informado);
  const telefone = String(entrada.telefone || '').replace(/\D/g, '') || null;
  const email = String(entrada.email || '').trim().toLowerCase() || null;
  const dataNascimento = entrada.data_nascimento || entrada.dataNascimento || null;
  if (entrada.membro_id) {
    let consulta = db.from('mem_membros').select('id,cpf,data_nascimento').eq('id', entrada.membro_id).is('deleted_at', null);
    // A exceção é só o vínculo já lido de um ato local pelo servidor, nunca um campo do payload.
    if (dependencias.membroVinculado !== entrada.membro_id) consulta = consulta.eq('igreja_id', campus.campus_id);
    const { data: membro, error } = await consulta.maybeSingle();
    if (error) throw error;
    if (!membro) throw new ErroCampus(404, 'campus_membro_ausente', 'Membro não encontrado neste campus.');
    if (temCpf && (!informado || (informado !== String(membro.cpf || '').replace(/\D/g, '') && (!cpf || !cpfValido(cpf))))) throw new ErroCampus(400, 'cpf_invalido', 'CPF inválido.');
    if (dataNascimento && membro.data_nascimento && String(dataNascimento).slice(0, 10) !== String(membro.data_nascimento).slice(0, 10)) {
      const { error: pendenciaError } = await db.from('identidade_pendencias').insert({
        tipo: 'vinculo_divergente', membro_id: membro.id, origem, origem_id: entrada.id ? String(entrada.id) : null,
        detalhe: 'Nascimento informado diverge do cadastro vinculado. Revisão humana necessária.',
      });
      if (pendenciaError && pendenciaError.code !== '23505') throw pendenciaError;
    }
    if (cpf && cpf !== normalizarCpf(membro.cpf)) {
      const reconciliar = dependencias.reconciliar || require('./cpfReconciliar').reconciliarCpfTardio;
      await reconciliar({ membroId: membro.id, cpf, origem, igrejaId: campus.campus_id, dataNascimento, confianca: dependencias.membroVinculado === membro.id ? 'fraca' : 'forte' });
    }
    if (telefone || email) {
      const { error: contatoError } = await db.rpc('fn_registrar_contato', { p_membro_id: membro.id, p_telefone: telefone, p_email: email, p_fonte: origem });
      if (contatoError) throw contatoError;
    }
    return membro.id;
  }
  if (temCpf && (!cpf || !cpfValido(cpf))) throw new ErroCampus(400, 'cpf_invalido', 'CPF inválido.');
  const nome = String(entrada.nome || '').trim();
  if (!nome) return null;
  const matcher = dependencias.matcher || require('./membroMatch').acharOuCriarGuardado;
  const encontrado = await matcher({ cpf, telefone, email, nome, dataNascimento, origem, status: 'visitante', extra: { igreja_id: campus.campus_id } });
  if (!encontrado?.membro_id) throw new Error('Não foi possível vincular a pessoa.');
  return encontrado.membro_id;
}
module.exports = { resolverPessoaRegistro };
