const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { resolverContextoCampus, responderErroCampus } = require('../services/campusContexto');

router.use(authenticate);

router.get('/contexto', async (req, res) => {
  // Não permitir cache de metadados de acesso em proxy/browser compartilhado.
  res.set('Cache-Control', 'private, no-store');
  try {
    const contexto = await resolverContextoCampus(req, { permitirConsolidado: true, exigirSelecao: false });
    req.campus = contexto;
    return res.json(contexto);
  } catch (erro) {
    return responderErroCampus(res, erro);
  }
});

const { supabase } = require('../utils/supabase');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function somenteAdminCampus(req,res,next) {
  try {
    const { data,error }=await supabase.from('app_super_admins').select('email')
      .eq('email',String(req.user.email || '').trim().toLowerCase()).eq('ativo',true).maybeSingle();
    if(error) throw error;
    if(!data) return res.status(403).json({error:'Acesso restrito aos administradores gerais.'});
    res.set('Cache-Control','private, no-store');
    return next();
  } catch { return res.status(503).json({error:'Não foi possível verificar a autorização.'}); }
}
router.use('/admin',somenteAdminCampus);
router.get('/admin/estado',async(req,res)=>{
  try {
    const resultados=await Promise.all([
      supabase.from('app_campus_config').select('estado,campus_legado_id,ja_ativado').eq('id',true).single(),
      supabase.from('igrejas').select('id,nome,slug,tipo,ativa').order('nome'),
      supabase.from('app_campus_cobertura').select('*').order('frente'),
    ]);
    if(resultados.some(r=>r.error)) throw new Error('Falha de consulta');
    res.json({config:resultados[0].data,campi:resultados[1].data,cobertura:resultados[2].data});
  } catch { res.status(503).json({error:'Não foi possível carregar a preparação multicampus.'}); }
});
router.get('/admin/usuarios',async(req,res)=>{
  const busca=String(req.query.busca || '').trim();
  if(busca.length<3 || busca.length>100) return res.status(400).json({error:'Digite de 3 a 100 caracteres para buscar.'});
  // Nome usa ILIKE escapado. Não interpolar uma expressão OR do PostgREST.
  const literal=busca.replace(/[\\%_]/g,'\\$&').replace(/\*/g,'_');
  try {
    const {data,error}=await supabase.from('profiles').select('id,name,email').ilike('name',`%${literal}%`).order('name').limit(30);
    if(error) throw error;
    res.json(data || []);
  } catch { res.status(503).json({error:'Não foi possível buscar os usuários.'}); }
});
router.get('/admin/vinculos',async(req,res)=>{
  if(!UUID.test(String(req.query.usuario_id || ''))) return res.status(400).json({error:'Usuário inválido.'});
  try {
    const {data,error}=await supabase.from('usuario_igrejas').select('igreja_id,papel').eq('usuario_id',req.query.usuario_id);
    if(error) throw error;
    res.json(data || []);
  } catch { res.status(503).json({error:'Não foi possível carregar os vínculos.'}); }
});
router.put('/admin/vinculos',async(req,res)=>{
  const {usuario_id,igreja_ids}=req.body || {};
  if(!UUID.test(usuario_id || '') || !Array.isArray(igreja_ids) || igreja_ids.length>100 || igreja_ids.some(id=>!UUID.test(id || ''))) {
    return res.status(400).json({error:'Informe um usuário e uma lista válida de campi.'});
  }
  try {
    const {data,error}=await supabase.rpc('fn_campus_definir_acessos',{
      p_usuario_id:usuario_id,p_igreja_ids:[...new Set(igreja_ids)],p_autor_id:req.user.id || req.user.userId,
    });
    if(error) throw error;
    res.json(data);
  } catch(e) {
    const status={P0400:400,P0403:403,P0404:404}[e.code];
    res.status(status || 503).json({error:status ? e.message : 'Não foi possível salvar os acessos.'});
  }
});
module.exports = router;
