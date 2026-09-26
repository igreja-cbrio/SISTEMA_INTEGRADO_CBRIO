const { randomUUID } = require('node:crypto');
const { ErroCampus } = require('./campusContexto');
const { eventosAbertos, horariosConfigurados, ocupacaoPorHorario } = require('./batismoHorarios');
const { TEXTOS } = require('./inscricaoContrato');
const { horariosDisponiveis } = require('../utils/batismoHorario');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function contextoPublico(db, solicitado, exigir=true) {
  // Cabeçalhos ERP nunca concedem autorização nesta porta pública.
  const {data:config,error}=await db.from('app_campus_config').select('estado,campus_legado_id,ja_ativado').eq('id',true).maybeSingle();
  if(error || !config || !['preparacao','ensaio','ativo'].includes(config.estado) || !UUID.test(config.campus_legado_id || '')
    || (config.estado==='preparacao' ? config.ja_ativado!==false : config.ja_ativado!==true)) throw new ErroCampus(503,'campus_configuracao_pendente','Configuração de campus indisponível.');
  const {data:rows,error:catalogError}=await db.from('igrejas').select('id,nome,slug,tipo').eq('ativa',true).eq('tipo','sede').order('nome');
  if(catalogError || !Array.isArray(rows)) throw new ErroCampus(503,'campus_indisponivel','Catálogo de campus indisponível.');
  const ctx={...config,campi:config.estado==='preparacao'?rows.filter(c=>c.id===config.campus_legado_id):rows};
  let campus = null;
  if (solicitado !== undefined && solicitado !== null && solicitado !== '') {
    if (typeof solicitado !== 'string') throw new ErroCampus(400,'campus_invalido','Informe um campus válido.');
    campus = ctx.campi.find(c=>c.id===solicitado.toLowerCase() || c.slug===solicitado);
    if (!campus) throw new ErroCampus(404,'campus_nao_encontrado','Campus não encontrado.');
  } else if (ctx.estado==='preparacao') campus=ctx.campi.find(c=>c.id===ctx.campus_legado_id);
  if (!campus && exigir) throw new ErroCampus(409,'campus_selecao_necessaria','Selecione o campus do batismo.');
  return {...ctx,campus_id:campus?.id || null};
}
async function catalogo(db,ctx) {
  const opcoes={supabase:db,campusId:ctx.campus_id};
  const [eventos,horarios]=await Promise.all([eventosAbertos(3,opcoes),horariosConfigurados(opcoes)]);
  if (!eventos || !horarios) throw new ErroCampus(503,'batismo_catalogo_indisponivel','Não foi possível carregar as datas e os horários deste campus.');
  const datas=await Promise.all(eventos.map(async e=>({evento_id:e.id,data_batismo:e.data,
    horarios:horariosDisponiveis(horarios,await ocupacaoPorHorario(e.data,opcoes)).map(h=>({...h,horario_id:horarios.find(x=>x.horario===h.horario)?.id}))})));
  const {grupo_url}=await require('./campusBatismoArquivos').lerConfigBatismo(db,ctx.campus_id);
  return {termos_lgpd:TEXTOS.termos_lgpd,campus_id:ctx.campus_id,datas,data_batismo:datas[0]?.data_batismo || null,horarios:datas[0]?.horarios || [],grupo_url};
}
async function reservar(db,ctx,payload,body) {
  const opcoes={supabase:db,campusId:ctx.campus_id};
  const [eventos,horarios]=await Promise.all([eventosAbertos(3,opcoes),horariosConfigurados(opcoes)]);
  if(!eventos || !horarios) throw new ErroCampus(503,'batismo_catalogo_indisponivel','Catálogo de batismo indisponível.');
  const evento=body.evento_id ? eventos.find(e=>e.id===body.evento_id) : eventos.find(e=>e.data===payload.data_batismo);
  const horario=body.horario_id ? horarios.find(h=>h.id===body.horario_id) : horarios.find(h=>h.horario===payload.horario_culto);
  if(!evento || !horario || (payload.data_batismo && evento.data!==payload.data_batismo) || (payload.horario_culto && horario.horario!==payload.horario_culto)) {
    throw new ErroCampus(409,'batismo_selecao_invalida','Escolha uma data e um horário disponíveis neste campus.');
  }
  if(body.inscricao_id!==undefined && !UUID.test(body.inscricao_id || '')) throw new ErroCampus(400,'batismo_id_invalido','Identificador de inscrição inválido.');
  const args={p_igreja_id:ctx.campus_id,p_evento_id:evento.id,p_horario_id:horario.id,p_inscricao_id:body.inscricao_id || randomUUID(),p_editar:false};
  for(const campo of ['membro_id','nome','sobrenome','cpf','telefone','email','data_nascimento','status','origem','area_kpi','tamanho_camisa','eh_crianca','possui_deficiencia','deficiencia_descricao','endereco','cep','sexo','fez_next','observacoes']) args[`p_${campo}`]=payload[campo] ?? null;
  const {data,error}=await db.rpc('fn_campus_batismo_reservar',args);
  if(error) throw new ErroCampus(error.code==='23505'||error.code==='23514'?409:503,'batismo_reserva_indisponivel',error.code==='23505'?'Já existe uma inscrição para esta pessoa ou identificador.':error.code==='23514'?error.message:'Não foi possível reservar a vaga.');
  if(!data?.id) throw new Error('Reserva sem confirmação.');
  return data;
}
async function membroConfirmado(db,userId) {
  if(!userId) throw new ErroCampus(401,'campus_sem_sessao','Autenticação necessária.');
  const {data:profile,error}=await db.from('profiles').select('membro_id').eq('id',userId).maybeSingle();
  if(error) throw error;
  if(!profile?.membro_id) throw new ErroCampus(403,'membro_vinculo_necessario','Confirme seu cadastro de membro antes de se inscrever.');
  const result=await db.from('mem_membros').select('id,nome,cpf,telefone,email,data_nascimento,genero').eq('id',profile.membro_id).is('deleted_at',null).maybeSingle();
  if(result.error) throw result.error;
  if(!result.data) throw new ErroCampus(403,'membro_vinculo_necessario','Confirme seu cadastro de membro antes de se inscrever.');
  return result.data;
}
module.exports={contextoPublico,catalogo,reservar,membroConfirmado};
