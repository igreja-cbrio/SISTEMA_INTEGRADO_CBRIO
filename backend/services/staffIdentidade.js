// RH permanece central. O vínculo self-service exige e-mail literal e único;
// campus selecionado não concede acesso à ficha de outra pessoa.
async function funcionarioDaSessao(db, email, colunas = 'id, nome, cargo, area, cpf, telefone, data_admissao, status') {
  const normalizado = String(email || '').trim().toLowerCase();
  if (!normalizado) return null;
  const literal = normalizado.replace(/[\\%_*]/g, '\\$&');
  const { data, error } = await db.from('rh_funcionarios').select(`${colunas},email`)
    .ilike('email', literal).in('status', ['ativo', 'ferias', 'licenca']).is('deleted_at', null).limit(2);
  if (error || !Array.isArray(data)) throw error || new Error('Não foi possível verificar o vínculo de funcionário.');
  if (!data.length) return null;
  if (data.length !== 1 || String(data[0].email || '').trim().toLowerCase() !== normalizado) {
    throw new Error('O vínculo de funcionário precisa ser revisado.');
  }
  const { email: _email, ...funcionario } = data[0];
  return funcionario;
}
module.exports = { funcionarioDaSessao };
