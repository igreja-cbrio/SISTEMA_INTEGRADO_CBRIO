// Direcionamento Next: a matrícula determina a unidade do ato. Identidade segue
// global; destinos e flags são confirmados juntos pela RPC transacional.
const crypto=require('node:crypto');
const {supabase}=require('../utils/supabase');
const {notificar}=require('./notificar');
const {validarContexto,filtrarCampus}=require('../utils/campusQuery');
const {resolverPessoaRegistro}=require('./campusPessoaRegistro');
const {ErroCampus}=require('./campusContexto');
const batismoHorarios=require('./batismoHorarios');
const {contextoEventoArmazenado}=require('./campusNotificacaoEscopo');
const {resolverCampusOperacional}=require('./campusOperacional');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NEXT_DIRECIONA={
 grupos:{flag:'indicou_grupo',destino:'grupos',valor_alvo:'conectar',modulo:'grupos',label:'Grupos',link:'/grupos'},
 voluntarios:{flag:'indicou_servir',destino:'voluntarios',valor_alvo:'servir',modulo:'voluntariado',label:'Voluntários',link:'/ministerial/voluntariado/encaminhados'},
 batismo:{flag:'indicou_batismo',modulo:'integracao',label:'Batismo',link:'/ministerial/integracao?tab=batismos'},
 devocional:{flag:'indicou_devocional'},
};
const LEGADO='next-direcionar-v1',PREFIXO='next-direcionar-v2:';
function assinatura(payload){return crypto.createHmac('sha256',process.env.CRON_SECRET).update(payload).digest('hex').slice(0,24);}
function signDirecionarToken(campus){
 if(!process.env.CRON_SECRET)return null;
 if(campus)validarContexto(campus,true);
 const payload=campus?`${PREFIXO}${campus.campus_id}`:LEGADO;
 return Buffer.from(`${payload}.${assinatura(payload)}`).toString('base64url');
}
function lerToken(token){
 if(!process.env.CRON_SECRET||typeof token!=='string'||token.length>256||!/^[A-Za-z0-9_-]+$/.test(token))return null;
 try{
  const partes=Buffer.from(token,'base64url').toString('utf8').split('.');
  if(partes.length!==2)return null;
  const [payload,sig]=partes;
  if(!/^[a-f0-9]{24}$/.test(sig)||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(assinatura(payload))))return null;
  if(payload===LEGADO)return {legado:true,campusId:null};
  const id=payload.startsWith(PREFIXO)?payload.slice(PREFIXO.length):null;
  return UUID.test(id||'')?{legado:false,campusId:id}:null;
 }catch{return null;}
}
function verifyDirecionarToken(token){return !!lerToken(token);}
async function contextoDirecionarToken(token,db=supabase){
 const dados=lerToken(token);
 if(!dados)throw new ErroCampus(403,'next_token_invalido','Link inválido.');
 // QR antigo só resolve Sede enquanto preparação; nunca vira token da rede.
 const id=await resolverCampusOperacional(db,dados.campusId||undefined);
 return contextoEventoArmazenado(db,{igreja_id:id,escopo_campus:'campus'});
}
async function direcionarMatricula({matriculaId,destinos=[],areas=[],horarioBatismo=null,userId=null,permitir=null,campus},deps={}){
 validarContexto(campus,true);
 const db=deps.db||supabase,resolverPessoa=deps.resolverPessoa||resolverPessoaRegistro,avisar=deps.notificar||notificar,horarios=deps.horarios||batismoHorarios;
 const validos=[...new Set((Array.isArray(destinos)?destinos:[]).filter(d=>Object.hasOwn(NEXT_DIRECIONA,d)&&(!permitir||permitir.includes(d))))];
 if(!validos.length)throw new ErroCampus(400,'next_destino_invalido','Informe ao menos um destino válido.');
 if(!UUID.test(matriculaId||''))throw new ErroCampus(404,'next_matricula_ausente','Matrícula não encontrada neste campus.');
 const {data:m,error}=await filtrarCampus(db.from('next_matriculas')
  .select('id,igreja_id,turma_id,nome,sobrenome,cpf,telefone,email,data_nascimento,sexo,membro_id'),campus)
  .eq('id',matriculaId).is('deleted_at',null).maybeSingle();
 if(error)throw error;
 if(!m)throw new ErroCampus(404,'next_matricula_ausente','Matrícula não encontrada neste campus.');
 let evento=null,horario=null;
 if(validos.includes('batismo')){
  const opcoes={supabase:db,campusId:campus.campus_id};
  const [eventos,catalogo]=await Promise.all([horarios.eventosAbertos(1,opcoes),horarios.horariosConfigurados(opcoes)]);
  evento=eventos?.[0];horario=catalogo?.find(h=>h.horario===horarioBatismo&&h.aberto===true);
  if(!evento||!horario)throw new ErroCampus(horarioBatismo?409:400,'next_batismo_indisponivel','Selecione um horário aberto de batismo neste campus.');
  // Capacidade e idempotência são decididas sob lock, nunca por contagem no JS.
 }
 if(validos.some(d=>d!=='devocional')){
  const membroId=await resolverPessoa({...m,nome:`${m.nome||''} ${m.sobrenome||''}`.trim()},campus,'next_direcionamento',{supabase:db,membroVinculado:m.membro_id});
  if(!membroId)throw new Error('Não foi possível vincular a pessoa.');
  if(membroId!==m.membro_id){
   let q=filtrarCampus(db.from('next_matriculas').update({membro_id:membroId,updated_at:new Date().toISOString()}),campus).eq('id',m.id).is('deleted_at',null);
   q=m.membro_id?q.eq('membro_id',m.membro_id):q.is('membro_id',null);
   const vinculo=await q.select('id').maybeSingle();
   if(vinculo.error)throw vinculo.error;
   if(!vinculo.data)throw new ErroCampus(409,'next_matricula_alterada','A matrícula foi alterada. Atualize e tente novamente.');
  }
 }
 const {data:resultado,error:erroRpc}=await db.rpc('fn_campus_next_direcionar',{
  p_igreja_id:campus.campus_id,p_matricula_id:m.id,p_destinos:validos,
  p_areas:Array.isArray(areas)?areas:[],p_evento_batismo_id:evento?.id||null,
  p_horario_batismo_id:horario?.id||null,p_usuario_id:userId,
 });
 if(erroRpc)throw new ErroCampus(['23514','23505'].includes(erroRpc.code)?409:503,'next_direcionamento_indisponivel',erroRpc.code==='23514'?erroRpc.message:'Não foi possível confirmar o direcionamento.');
 if(!resultado?.ok)throw new Error('Direcionamento sem confirmação.');
 for(const destino of validos){
  const cfg=NEXT_DIRECIONA[destino];
  if(!resultado.criados?.[destino]||!cfg.modulo)continue;
  await avisar({modulo:cfg.modulo,titulo:`Direcionado para ${cfg.label} no NEXT`,
   mensagem:`${`${m.nome||''} ${m.sobrenome||''}`.trim()} foi direcionado(a) para ${cfg.label} no NEXT.`,
   link:cfg.link,campus,chaveDedup:`next_direcionamento:${campus.campus_id}:${m.id}:${destino}`,
  }).catch(e=>console.warn('[nextDirecionar] notificação:',e.message));
 }
 return {ok:true,destinos:validos,criados:Object.fromEntries([...validos,'batismo_horario_atualizado'].filter(d=>resultado.criados?.[d]===true).map(d=>[d,true])),turma_id:resultado.turma_id};
}
module.exports={NEXT_DIRECIONA,signDirecionarToken,verifyDirecionarToken,contextoDirecionarToken,direcionarMatricula};
