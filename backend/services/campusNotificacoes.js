const { validarContexto } = require('../utils/campusQuery');
const { lerTodasPaginas } = require('../utils/campusPaginacao');

// Primeiro aplica as regras normais do módulo; este passo apenas INTERSECTA
// os candidatos com quem pode acessar o campus. Nunca acrescenta destinatários.
async function filtrarDestinatariosCampus(db, contexto, candidatos) {
  validarContexto(contexto, true);
  if (contexto.estado === 'preparacao') return [...new Set(candidatos)];
  const ids = [...new Set(candidatos)];
  if (!ids.length) return [];
  const { data: admins, error } = await db.from('app_super_admins').select('email').eq('ativo', true);
  if (error || !Array.isArray(admins)) throw new Error('Não foi possível verificar os destinatários do campus.');
  const emails = new Set(admins.map(a => String(a.email).trim().toLowerCase()));
  const autorizados = new Set();
  for (let inicio = 0; inicio < ids.length; inicio += 100) {
    const lote = ids.slice(inicio, inicio + 100);
    const [vinculos, perfis] = await Promise.all([
      lerTodasPaginas(() => db.from('usuario_igrejas').select('usuario_id').eq('igreja_id', contexto.campus_id).in('usuario_id', lote).order('usuario_id')),
      lerTodasPaginas(() => db.from('profiles').select('id,email,is_diretoria_geral,active').in('id', lote).eq('active', true).order('id')),
    ]);
    const locais = new Set(vinculos.map(v => v.usuario_id));
    for (const perfil of perfis) {
      if (locais.has(perfil.id) || perfil.is_diretoria_geral === true || emails.has(String(perfil.email || '').trim().toLowerCase())) autorizados.add(perfil.id);
    }
  }
  return ids.filter(id => autorizados.has(id));
}
module.exports = { filtrarDestinatariosCampus };
