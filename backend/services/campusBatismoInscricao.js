const { randomUUID } = require('node:crypto');
const { ErroCampus } = require('./campusContexto');
const { validarContexto, carimbarCampus, filtrarCampus } = require('../utils/campusQuery');
const { resolverPessoaRegistro } = require('./campusPessoaRegistro');
const { eventosAbertos } = require('./batismoHorarios');
const { dataIso } = require('../utils/batismoData');
const STATUS = ['pendente','confirmado','realizado','cancelado'];
const AREAS = ['kids','sede','bridge','ami','online'];
const CAMPOS_RPC = ['membro_id','nome','sobrenome','cpf','telefone','email','data_nascimento','status','origem','area_kpi','tamanho_camisa','eh_crianca','possui_deficiencia','deficiencia_descricao','endereco','cep','sexo','fez_next','observacoes'];
const CAMPOS_EDICAO = ['status','data_batismo','evento_id','horario_culto','horario_id','observacoes','area_kpi','tamanho_camisa','eh_crianca','possui_deficiencia','deficiencia_descricao','endereco'];
function publico({codigo_acesso,codigo_conferencia,...row}) { return row; }
function erroBanco(error) {
  if (!error) return;
  throw new ErroCampus(['23505','23514'].includes(error.code)?409:503,'batismo_gravacao_indisponivel',
    error.code==='23505'?'Já existe uma inscrição para esta pessoa neste evento.':error.code==='23514'?error.message:'Não foi possível salvar a inscrição.');
}
async function selecao(db, ctx, dados) {
  let evento = null, horario = null;
  if (dados.evento_id || dados.data_batismo) {
    if (dados.data_batismo && !dataIso(dados.data_batismo)) throw new ErroCampus(400,'batismo_data_invalida','Data de batismo inválida.');
    let q=filtrarCampus(db.from('batismo_eventos').select('id,data'),ctx);
    q=dados.evento_id?q.eq('id',dados.evento_id):q.eq('data',dados.data_batismo);
    const r=await q.maybeSingle();erroBanco(r.error);evento=r.data;
    if (!evento || (dados.data_batismo && dados.data_batismo!==evento.data)) throw new ErroCampus(404,'batismo_evento_ausente','Evento não encontrado neste campus.');
  }
  if (dados.horario_id || dados.horario_culto) {
    let q=filtrarCampus(db.from('batismo_horarios').select('id,horario'),ctx).is('deleted_at',null);
    q=dados.horario_id?q.eq('id',dados.horario_id):q.eq('horario',dados.horario_culto);
    const r=await q.maybeSingle();erroBanco(r.error);horario=r.data;
    if (!horario || (dados.horario_culto && dados.horario_culto!==horario.horario)) throw new ErroCampus(404,'batismo_horario_ausente','Horário não encontrado neste campus.');
  }
  if (Boolean(evento)!==Boolean(horario)) throw new ErroCampus(400,'batismo_selecao_incompleta','Selecione a data e o horário do batismo.');
  return {evento,horario};
}
async function salvar(db,ctx,body,{atual=null,usuarioId=null,resolverPessoa=resolverPessoaRegistro}={}) {
  validarContexto(ctx,true);
  // Campos de auditoria, identidade e consentimento não são editáveis nesta rota.
  const dados=atual?{...atual}:{status:'pendente',origem:'manual',area_kpi:'sede',eh_crianca:false,possui_deficiencia:false};
  const campos=atual?CAMPOS_EDICAO:[...CAMPOS_RPC,'data_batismo','evento_id','horario_culto','horario_id'];
  for (const campo of campos) if (body[campo]!==undefined) dados[campo]=body[campo];
  if (atual && body.data_batismo!==undefined && body.evento_id===undefined && body.data_batismo!==atual.data_batismo) dados.evento_id=null;
  if (atual && body.evento_id!==undefined && body.data_batismo===undefined && body.evento_id!==atual.evento_id) dados.data_batismo=null;
  if (atual && body.horario_culto!==undefined && body.horario_id===undefined && body.horario_culto!==atual.horario_culto) dados.horario_id=null;
  if (atual && body.horario_id!==undefined && body.horario_culto===undefined && body.horario_id!==atual.horario_id) dados.horario_culto=null;
  if (!STATUS.includes(dados.status)||!AREAS.includes(dados.area_kpi)) throw new ErroCampus(400,'batismo_dados_invalidos','Status ou área inválidos.');
  if (typeof dados.nome!=='string'||!dados.nome.trim()||typeof dados.sobrenome!=='string'||!dados.sobrenome.trim()) throw new ErroCampus(400,'batismo_nome_invalido','Nome e sobrenome são obrigatórios.');
  for (const campo of ['eh_crianca','possui_deficiencia']) if (typeof dados[campo]!=='boolean') throw new ErroCampus(400,'batismo_dados_invalidos','Informe as opções de criança e deficiência.');
  if (!atual && (dados.horario_id || dados.horario_culto) && !dados.evento_id && !dados.data_batismo) {
    const eventos = await eventosAbertos(1,{supabase:db,campusId:ctx.campus_id});
    if (!eventos?.length) throw new ErroCampus(409,'batismo_evento_ausente','Não há data aberta neste campus.');
    dados.evento_id=eventos[0].id;
  }
  const {evento,horario}=await selecao(db,ctx,dados);
  if (!atual) {
    if (dados.origem === 'totem' && !String(dados.cpf || '').replace(/\D/g,'')) throw new ErroCampus(400,'batismo_cpf_obrigatorio','CPF é obrigatório para se inscrever pelo totem.');
    dados.telefone=String(dados.telefone||'').replace(/\D/g,'')||null;
    dados.cpf=String(dados.cpf||'').replace(/\D/g,'')||null;
    dados.email=String(dados.email||'').trim().toLowerCase()||null;
    dados.nome=dados.nome.trim();dados.sobrenome=dados.sobrenome.trim();
    dados.membro_id=await resolverPessoa({...dados,nome:`${dados.nome} ${dados.sobrenome}`},ctx,'batismo_cadastro_interno',{supabase:db});
  }
  let row;
  if (evento) {
    const args={p_igreja_id:ctx.campus_id,p_evento_id:evento.id,p_horario_id:horario.id,p_inscricao_id:atual?.id||randomUUID(),p_editar:!!atual,p_inscrito_por:usuarioId};
    for (const campo of CAMPOS_RPC) args[`p_${campo}`]=dados[campo]??null;
    const result=await db.rpc('fn_campus_batismo_reservar',args);erroBanco(result.error);row=result.data;
  } else {
    // Sem evento e sem horário não há vaga reservada. Atribuí-los posteriormente
    // exige a mesma RPC transacional usada na inscrição pública.
    const payload={};for(const campo of (atual?CAMPOS_EDICAO:CAMPOS_RPC)) if(dados[campo]!==undefined) payload[campo]=dados[campo];
    if(!atual) payload.inscrito_por=usuarioId;
    const q=atual?filtrarCampus(db.from('batismo_inscricoes').update({...payload,updated_at:new Date().toISOString()}),ctx).eq('id',atual.id).is('deleted_at',null):db.from('batismo_inscricoes').insert(carimbarCampus(payload,ctx));
    const result=await q.select().single();erroBanco(result.error);row=result.data;
  }
  if(!row?.id) throw new Error('Inscrição sem confirmação.');
  return publico(row);
}
async function registrarCheckin(db,ctx,atual,body,usuarioId,{resolverPessoa=resolverPessoaRegistro}={}) {
  validarContexto(ctx,true);
  if (!atual?.id || atual.igreja_id!==ctx.campus_id || atual.deleted_at) throw new ErroCampus(404,'batismo_inscricao_ausente','Inscrição não encontrada.');
  const cpf=String(body.cpf || '').replace(/\D/g,'') || atual.cpf || null;
  const membro_id=await resolverPessoa({...atual,cpf,nome:`${atual.nome} ${atual.sobrenome || ''}`.trim()},ctx,'batismo_checkin',{supabase:db,membroVinculado:atual.membro_id});
  const agora=new Date().toISOString();
  const update={checkin_em:atual.checkin_em || agora,checkin_por:atual.checkin_por || usuarioId,updated_at:agora};
  if (membro_id && membro_id!==atual.membro_id) update.membro_id=membro_id;
  if (cpf && !atual.cpf) update.cpf=cpf;
  if (body.consentiu===true && !atual.consentimento_em) update.consentimento_em=agora;
  let query=filtrarCampus(db.from('batismo_inscricoes').update(update),ctx).eq('id',atual.id).is('deleted_at',null);
  // Uma edição concorrente obriga recarregar antes de aplicar a identidade.
  query=atual.updated_at?query.eq('updated_at',atual.updated_at):query.is('updated_at',null);
  const {data,error}=await query.select('id,nome,sobrenome,codigo_acesso,codigo_conferencia').maybeSingle();erroBanco(error);
  if(!data) throw new ErroCampus(409,'batismo_edicao_concorrente','A inscrição foi alterada. Atualize a lista e tente novamente.');
  return {id:data.id,nome:`${data.nome} ${data.sobrenome || ''}`.trim(),codigo_acesso:data.codigo_acesso,codigo_conferencia:data.codigo_conferencia};
}
module.exports={salvar,selecao,publico,registrarCheckin};
