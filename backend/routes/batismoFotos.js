const router = require('express').Router();
const multer = require('multer');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

// Fotos por campus/evento em bucket privado; histórico legado também usa URL assinada.
// O app de membros lista essa pasta na aba Batismo: cada pessoa vê só a
// pasta da data do PRÓPRIO batismo (lib/batismo.ts do app). Gestão
// restrita a admin/diretor.

const uploadMw = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 40 }, // 10 MB por foto, 40 por vez
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Formato de imagem não suportado. Use JPG, PNG ou WebP.'));
  },
});


// ⚠️ AUTORIZAÇÃO (18/08/2026 · decisão do Marcos): *"Pedro deve poder publicar,
// alterar fotos, alterar destaques... mexer no app por esse módulo."*
// O guard era `authorize('admin','diretor')` e o Pedro Paiva tem role
// **`assistente`** (medido) — ele coordena o Marketing e não passava. Agora quem
// manda é o MÓDULO: leitura 1 (quem abre a aba App já tem isso) e escrita 3, o
// nível que a matriz JÁ dá a `coordenador-marketing` e `assistente-marketing`.
// ⚠️ `admin`/`diretor` continuam passando (bypass dentro do authorizeModule), então
// ninguém que publicava ontem perdeu acesso.
// ⚠️ O nível 3 vale também pro DELETE, e é decisão: aqui apagar é curadoria
// rotineira (trocar destaque, tirar foto ruim), não destruição de registro — e com
// 4 o acesso passaria a depender de a pessoa estar em `usuario_areas` (o boost de
// área dá 5), o que separaria a equipe por acidente de cadastro, não por decisão.
// ⚠️ O guard fica no `router.use` de propósito: rota nova neste arquivo nasce
// protegida sem ninguém precisar lembrar.
const podeVer = authorizeModule('marketing', 1);
const podeEditar = authorizeModule('marketing', 3);
router.use(authenticate, (req, res, next) => (
  ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? podeEditar : podeVer
)(req, res, next));

const { criarMiddlewareCampus } = require('../middleware/campus');
const { responderErroCampus } = require('../services/campusContexto');
const { lerTodasPaginas } = require('../utils/campusPaginacao');
const arquivos = require('../services/campusBatismoArquivos');
router.use(criarMiddlewareCampus({modulo:'marketing',cobertura:{leitura:true,escrita:true}}));

router.get('/', async (req,res)=>{
 try {
  const inscricoes=await lerTodasPaginas(()=>supabase.from('batismo_inscricoes').select('data_batismo,status')
    .eq('igreja_id',req.campus.campus_id).is('deleted_at',null).not('data_batismo','is',null)
    .not('status','in','(cancelado,rejeitado)').order('id'));
  const contagem={};for(const i of inscricoes) contagem[i.data_batismo]=(contagem[i.data_batismo]||0)+1;
  const result=await Promise.all(Object.keys(contagem).sort().reverse().slice(0,24).map(async data=>{
   const evento=await arquivos.eventoPorData(supabase,req.campus.campus_id,data);
   return {data,evento_id:evento.id,batizandos:contagem[data],fotos:(await arquivos.listarFotos(supabase,evento)).length};
  }));res.json(result);
 }catch(e){responderErroCampus(res,e);}
});
router.get('/:data/fotos',async(req,res)=>{
 try {const e=await arquivos.eventoPorData(supabase,req.campus.campus_id,req.params.data);res.json(await arquivos.listarFotos(supabase,e));}
 catch(e){responderErroCampus(res,e);}
});
router.post('/:data/fotos',uploadMw.array('fotos',40),async(req,res)=>{
 try {
  const e=await arquivos.eventoPorData(supabase,req.campus.campus_id,req.params.data);
  const result=await arquivos.enviarFotos(supabase,e,req.files);
  // Edge exige service role e escopo do ato. Nunca disparar fan-out só por data.
  if(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
   fetch(`${process.env.SUPABASE_URL}/functions/v1/notify-batismo-fotos`,{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`},
    body:JSON.stringify({campus_id:e.igreja_id,evento_id:e.id}),signal:AbortSignal.timeout(5000),
   }).then(r=>{if(!r.ok) console.error('[BATISMO-FOTOS] notificação recusada:',r.status);}).catch(()=>console.error('[BATISMO-FOTOS] falha ao notificar álbum.'));
  }
  res.status(201).json(result);
 }catch(e){responderErroCampus(res,e);}
});
router.delete('/:data/fotos/:nome',async(req,res)=>{
 try {const e=await arquivos.eventoPorData(supabase,req.campus.campus_id,req.params.data);res.json(await arquivos.removerFoto(supabase,e,req.params.nome,req.query.origem || 'campus'));}
 catch(e){responderErroCampus(res,e);}
});
module.exports=router;
