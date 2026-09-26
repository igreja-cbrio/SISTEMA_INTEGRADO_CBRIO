const {lerTodasPaginas} = require('../utils/campusPaginacao');
const {ErroCampus} = require('./campusContexto');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function carregarOrigensPco(db) {
  const {data:config,error} = await db.from('app_campus_config').select('estado,ja_ativado,campus_legado_id').eq('id',true).maybeSingle();
  if (error || !config || !UUID.test(config.campus_legado_id||'') || !['preparacao','ensaio','ativo'].includes(config.estado)
    || (config.estado==='preparacao'?config.ja_ativado!==false:config.ja_ativado!==true)) throw new ErroCampus(503,'pco_configuracao_pendente','Configuração de campus indisponível para sincronização.');
  const rows=await lerTodasPaginas(()=>{
    let q=db.from('vol_pco_service_type_campi').select('pco_service_type_id,igreja_id,service_type_id,igrejas!inner(id,ativa)').eq('ativo',true).eq('igrejas.ativa',true).order('pco_service_type_id');
    if(config.estado==='preparacao')q=q.eq('igreja_id',config.campus_legado_id);
    return q;
  });
  const mapa=new Map();
  for(const row of rows){
    const igreja=Array.isArray(row.igrejas)?row.igrejas[0]:row.igrejas;
    if(typeof row.pco_service_type_id!=='string'||!row.pco_service_type_id||!UUID.test(row.igreja_id||'')||!UUID.test(row.service_type_id||'')||igreja?.id!==row.igreja_id||igreja?.ativa!==true||mapa.has(row.pco_service_type_id))throw new ErroCampus(503,'pco_mapa_invalido','Mapa de origem do Planning Center inválido.');
    if(config.estado==='preparacao'&&row.igreja_id!==config.campus_legado_id)throw new ErroCampus(503,'pco_mapa_invalido','Origem divergente durante a preparação.');
    mapa.set(row.pco_service_type_id,Object.freeze({...row,estado:config.estado,campus_id:row.igreja_id,campi:Object.freeze([{id:row.igreja_id}])}));
  }
  return {estado:config.estado,mapa};
}
async function resolverServicoPco(db,origem,tipo,plano,scheduledAt){
  if(!origem||String(tipo.id)!==origem.pco_service_type_id||!UUID.test(origem.igreja_id||'')||!UUID.test(origem.service_type_id||''))throw new ErroCampus(503,'pco_origem_pendente','O tipo de serviço precisa de origem explícita.');
  const {data,error}=await db.rpc('fn_campus_vol_resolver_servico',{
    p_igreja_id:origem.igreja_id,p_service_type_id:origem.service_type_id,p_pco_service_type_id:origem.pco_service_type_id,
    p_pco_plan_id:String(plano.id),p_nome:plano.attributes.title||tipo.attributes.name,p_service_type_name:tipo.attributes.name,p_scheduled_at:scheduledAt,
  });
  if(error)throw error;
  const servico=Array.isArray(data)&&data.length===1?data[0]:data;
  if(!servico?.id||servico.igreja_id!==origem.igreja_id)throw new Error('Serviço retornado sem origem validada.');
  return servico;
}
module.exports={carregarOrigensPco,resolverServicoPco};

async function sincronizarEquipesPco(db,contexto,personIds) {
  const {filtrarCampus,carimbarCampus,validarContexto}=require('../utils/campusQuery');
  const {chavePco}=require('../utils/pcoChave');
  validarContexto(contexto,true);
  const ler=(table,columns,fn=q=>q)=>lerTodasPaginas(()=>fn(filtrarCampus(db.from(table).select(columns),contexto)).order('id'));
  const schedules=[];
  for(let i=0;i<personIds.length;i+=100)schedules.push(...await ler('vol_schedules','id,team_id,volunteer_id,planning_center_person_id,volunteer_name,team_name,position_name',q=>q.in('planning_center_person_id',personIds.slice(i,i+100))));
  if(!schedules.length)return{assigned:0,religadas:0,pendentes:0};
  const mapas=await ler('vol_pco_mapa','id,pco_chave,team_id,position_id,ignorar');
  const mapa=new Map(mapas.map(row=>[row.pco_chave,row]));
  const perfis=new Map();
  for(let i=0;i<personIds.length;i+=100){
    const {data,error}=await db.from('vol_profiles').select('id,planning_center_id').in('planning_center_id',personIds.slice(i,i+100));
    if(error||!Array.isArray(data))throw error||new Error('Perfis do Planning Center indisponíveis.');
    for(const row of data)perfis.set(row.planning_center_id,row.id);
  }
  const existentes=await ler('vol_team_members','id,team_id,position_id,volunteer_profile_id,planning_center_person_id');
  const chave=row=>JSON.stringify([row.team_id,row.position_id||null,row.volunteer_profile_id||`pco:${row.planning_center_person_id}`]);
  const vistos=new Set(existentes.map(chave));let assigned=0,religadas=0,pendentes=0;
  for(const escala of schedules){
    const alvo=mapa.get(chavePco(escala.team_name));
    if(!alvo){pendentes++;continue;}
    if(alvo.ignorar)continue;
    if(!alvo.team_id){pendentes++;continue;}
    // O de-para humano local é a única origem da equipe/função. Nome não cria entidade.
    const perfil=escala.volunteer_id||perfis.get(escala.planning_center_person_id)||null;
    const membro=carimbarCampus({team_id:alvo.team_id,position_id:alvo.position_id||null,volunteer_profile_id:perfil,
      planning_center_person_id:escala.planning_center_person_id,volunteer_name:escala.volunteer_name,is_active:true},contexto);
    const orfa=perfil && existentes.find(row=>!row.volunteer_profile_id && row.planning_center_person_id===membro.planning_center_person_id && row.team_id===membro.team_id && (row.position_id||null)===(membro.position_id||null));
    if(orfa){
      const {data,error}=await filtrarCampus(db.from('vol_team_members').update({volunteer_profile_id:perfil}),contexto).eq('id',orfa.id).is('volunteer_profile_id',null).select('id');
      if(error)throw error; // Conflito de histórico exige reconciliação; nunca apagar o vínculo órfão.
      if(!Array.isArray(data)||data.length!==1)throw new Error('Vínculo alterado durante a sincronização.');
      orfa.volunteer_profile_id=perfil;vistos.add(chave(membro));
    }
    if(!vistos.has(chave(membro))){
      const {error}=await db.from('vol_team_members').insert(membro);
      if(error&&error.code!=='23505')throw error;
      if(!error)assigned++;vistos.add(chave(membro));
    }
    if(!escala.team_id){
      const {data,error}=await filtrarCampus(db.from('vol_schedules').update({team_id:alvo.team_id,position_id:alvo.position_id||null}),contexto).eq('id',escala.id).is('team_id',null).select('id');
      if(error||!Array.isArray(data))throw error||new Error('Escala não retornou resultado.');
      religadas+=data.length;
    }
  }
  return{assigned,religadas,pendentes};
}
module.exports.sincronizarEquipesPco=sincronizarEquipesPco;
