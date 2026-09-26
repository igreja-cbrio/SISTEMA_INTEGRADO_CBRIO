const {randomUUID}=require('node:crypto');
const {ErroCampus}=require('./campusContexto');
const {resolverCampusOperacional}=require('./campusOperacional');
const {dataIso}=require('../utils/batismoData');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
const BUCKET='batismos-campi';
function validarEvento(e) {
 if(!e || !UUID.test(e.id||'') || !UUID.test(e.igreja_id||'') || !dataIso(e.data)) throw new ErroCampus(404,'batismo_evento_inexistente','Evento de batismo não encontrado.');
 return e;
}
async function eventoPorData(db,campusId,data) {
 if(!dataIso(data)) throw new ErroCampus(400,'batismo_data_invalida','Data de batismo inválida.');
 const {data:e,error}=await db.from('batismo_eventos').select('id,igreja_id,data').eq('igreja_id',campusId).eq('data',data).maybeSingle();
 if(error) throw error;return validarEvento(e);
}
async function eventoDaInscricao(db,insc) {
 if(!insc?.evento_id || !insc?.igreja_id) throw new ErroCampus(404,'batismo_evento_inexistente','Evento de batismo não encontrado.');
 const {data:e,error}=await db.from('batismo_eventos').select('id,igreja_id,data').eq('id',insc.evento_id).eq('igreja_id',insc.igreja_id).maybeSingle();
 if(error) throw error;return validarEvento(e);
}
async function legado(db,e) {
 const {data:c,error}=await db.from('app_campus_config').select('campus_legado_id').eq('id',true).maybeSingle();
 if(error || !UUID.test(c?.campus_legado_id||'')) throw new Error('Configuração histórica indisponível.');
 return e.igreja_id===c.campus_legado_id;
}
function nomeSeguro(nome) { return typeof nome==='string' && !!nome && !nome.includes('/') && !nome.includes('\\') && !nome.includes('..') && !nome.startsWith('.'); }
async function listarPasta(db,bucket,pasta,origem) {
 const arquivos=[];
 for(let offset=0;;offset+=200) {
  const {data,error}=await db.storage.from(bucket).list(pasta,{limit:200,offset,sortBy:{column:'name',order:'asc'}});
  if(error || !Array.isArray(data)) throw error || new Error('Catálogo de fotos inválido.');
  arquivos.push(...data.filter(f=>f.id && nomeSeguro(f.name)));if(data.length<200) break;
 }
 if(!arquivos.length) return [];
 const paths=arquivos.map(f=>`${pasta}/${f.name}`);
 const {data,error}=await db.storage.from(bucket).createSignedUrls(paths,900);
 if(error || !Array.isArray(data) || data.length!==paths.length || data.some(x=>x.error || !x.signedUrl)) throw error || new Error('Não foi possível autorizar as fotos.');
 return arquivos.map((f,i)=>({nome:f.name,url:data[i].signedUrl,origem}));
}
async function listarFotos(db,evento) {
 const e=validarEvento(evento);
 const novas=await listarPasta(db,BUCKET,`${e.igreja_id}/${e.id}`,'campus');
 const antigas=await legado(db,e)?await listarPasta(db,'batismos',e.data,'legado'):[];
 return [...novas,...antigas];
}
async function enviarFotos(db,evento,files) {
 const e=validarEvento(evento);
 if(!Array.isArray(files)||!files.length) throw new ErroCampus(400,'batismo_foto_ausente','Nenhuma foto enviada.');
 if(files.some(f=>!EXT[f.mimetype] || !f.buffer || f.buffer.length>10*1024*1024)) throw new ErroCampus(400,'batismo_foto_invalida','Use imagens JPG, PNG ou WebP de até 10 MB.');
 const paths=[];
 try {
  for(const f of files) {
   const path=`${e.igreja_id}/${e.id}/${randomUUID()}.${EXT[f.mimetype]}`;
   const {error}=await db.storage.from(BUCKET).upload(path,f.buffer,{contentType:f.mimetype,upsert:false});
   if(error) throw error;paths.push(path);
  }
 } catch(error) {if(paths.length) await db.storage.from(BUCKET).remove(paths);throw error;}
 return {ok:true,enviadas:paths.length};
}
async function removerFoto(db,evento,nome,origem='campus') {
 const e=validarEvento(evento);
 if(!nomeSeguro(nome)||!['campus','legado'].includes(origem)) throw new ErroCampus(400,'batismo_foto_invalida','Nome de foto inválido.');
 if(origem==='legado' && !await legado(db,e)) throw new ErroCampus(404,'batismo_foto_inexistente','Foto não encontrada.');
 const path=origem==='legado'?`${e.data}/${nome}`:`${e.igreja_id}/${e.id}/${nome}`;
 const {error}=await db.storage.from(origem==='legado'?'batismos':BUCKET).remove([path]);if(error) throw error;
 return {ok:true};
}
async function lerConfigBatismo(db,campusId) {
 const id=await resolverCampusOperacional(db,campusId);
 const {data,error}=await db.from('batismo_config_campus').select('grupo_url,updated_at').eq('igreja_id',id).maybeSingle();
 if(error) throw error;return data || {grupo_url:null,updated_at:null};
}
async function salvarConfigBatismo(db,campusId,{grupo_url,updated_by}) {
 const id=await resolverCampusOperacional(db,campusId);
 if(grupo_url!==null && (typeof grupo_url!=='string'||grupo_url.length>2048||!/^https:\/\/(chat\.whatsapp\.com|wa\.me)\//i.test(grupo_url))) throw new ErroCampus(400,'batismo_grupo_invalido','Informe um link HTTPS válido do WhatsApp.');
 const {data,error}=await db.from('batismo_config_campus').upsert({igreja_id:id,grupo_url,updated_by,updated_at:new Date().toISOString()},{onConflict:'igreja_id'}).select('grupo_url,updated_at').single();
 if(error) throw error;return data;
}
async function salvarFotoReferencia(db,campusId,inscricaoId,file) {
 if(!UUID.test(inscricaoId||'')||!UUID.test(campusId||'')) throw new ErroCampus(404,'batismo_inscricao_inexistente','Inscrição não encontrada.');
 if(!file || !EXT[file.mimetype] || !file.buffer || file.buffer.length>10*1024*1024) throw new ErroCampus(400,'batismo_foto_invalida','Envie uma imagem JPG, PNG ou WebP de até 10 MB.');
 const {data:insc,error}=await db.from('batismo_inscricoes').select('id,consentimento_em').eq('id',inscricaoId).eq('igreja_id',campusId).is('deleted_at',null).maybeSingle();
 if(error) throw error;
 if(!insc) throw new ErroCampus(404,'batismo_inscricao_inexistente','Inscrição não encontrada.');
 if(!insc.consentimento_em) throw new ErroCampus(409,'batismo_consentimento_necessario','Registre o consentimento antes de enviar a foto de referência.');
 const path=`${campusId}/referencia/${inscricaoId}/${randomUUID()}.${EXT[file.mimetype]}`;
 const bucket=db.storage.from('batismos-biometria');
 const result=await bucket.upload(path,file.buffer,{contentType:file.mimetype,upsert:false});if(result.error) throw result.error;
 const update=await db.from('batismo_inscricoes').update({foto_referencia_url:path,updated_at:new Date().toISOString()}).eq('id',inscricaoId).eq('igreja_id',campusId).is('deleted_at',null).select('id').maybeSingle();
 if(update.error || !update.data) {await bucket.remove([path]);throw update.error || new Error('Inscrição não disponível.');}
 return {ok:true,foto_referencia_url:path};
}
module.exports={eventoPorData,eventoDaInscricao,listarFotos,enviarFotos,removerFoto,lerConfigBatismo,salvarConfigBatismo,salvarFotoReferencia};
