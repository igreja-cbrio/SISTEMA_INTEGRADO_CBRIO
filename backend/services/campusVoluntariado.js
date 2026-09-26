const { filtrarCampus } = require('../utils/campusQuery');
const { lerTodasPaginas } = require('../utils/campusPaginacao');
const { ErroCampus, responderErroCampus } = require('./campusContexto');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHECKINS = '*, volunteer:vol_profiles(id, full_name, planning_center_id), schedule:vol_schedules(id, volunteer_name, volunteer_id, team_name, position_name), service:vol_services(id, name, scheduled_at)';
function criarLeituraVoluntariado({ supabase, tipo, agora = () => new Date() }) {
  return async (req, res) => {
    try {
      const query = req.query || {};
      for (const chave of ['service_id','volunteer_id']) if (query[chave] !== undefined && (typeof query[chave] !== 'string' || !UUID.test(query[chave]))) throw new ErroCampus(400,'vol_filtro_invalido','Identificador inválido.');
      const consulta = (tabela, colunas = '*') => filtrarCampus(supabase.from(tabela).select(colunas),req.campus);
      const todas = (tabela,colunas,aplicar = q => q) => lerTodasPaginas(() => aplicar(consulta(tabela,colunas)).order('id'));
      const lotes = async (tabela,colunas,chave,ids) => {
        const rows = [];
        for (let i=0;i<ids.length;i+=100) rows.push(...await todas(tabela,colunas,q => q.in(chave,ids.slice(i,i+100))));
        return rows;
      };
      if (tipo.startsWith('my-')) {
        const usuarioId = req.user?.id || req.user?.userId;
        if (!UUID.test(usuarioId || '')) throw new ErroCampus(401,'vol_sem_identidade','Autenticação necessária.');
        const {data: perfil,error} = await supabase.from('vol_profiles').select('id,planning_center_id').eq('auth_user_id',usuarioId).maybeSingle();
        if (error) throw error;
        if (tipo !== 'my-services' && !perfil) return res.json([]);
        if (tipo === 'my-availability') return res.json(await todas('vol_availability','*',q => q.eq('volunteer_profile_id',perfil.id).order('unavailable_from')));
        if (tipo === 'my-checkins') {
          const {data,error: erro} = await consulta('vol_check_ins','id, checked_in_at, method, is_unscheduled, schedule_id, service:vol_services(id, name, scheduled_at)')
            .eq('volunteer_id',perfil.id).order('checked_in_at',{ascending:false}).order('id').limit(100);
          if (erro || !Array.isArray(data)) throw erro || new Error('Histórico inválido.');
          return res.json(data);
        }
        if (tipo === 'my-services') {
          const ano = query.year === undefined ? agora().getUTCFullYear() : Number(query.year);
          if (!Number.isInteger(ano) || ano < 1900 || ano > 9998) throw new ErroCampus(400,'vol_ano_invalido','Ano inválido.');
          const services = await todas('vol_services','id, name, service_type_name, service_type_id, scheduled_at',q => q.not('service_type_id','is',null)
            .gte('scheduled_at',`${ano}-01-01T00:00:00-03:00`).lt('scheduled_at',`${ano+1}-01-01T00:00:00-03:00`).order('scheduled_at'));
          const availability = perfil ? await todas('vol_availability','id,service_id',q => q.eq('volunteer_profile_id',perfil.id).not('service_id','is',null)) : [];
          const mapa = new Map(availability.map(row => [row.service_id,row.id]));
          return res.json(services.map(row => ({...row,is_unavailable:mapa.has(row.id),availability_id:mapa.get(row.id)||null})));
        }
        if (tipo !== 'my-schedules') throw new Error('Leitura própria não certificada.');
        // Identidade vem do token. Duas consultas estruturadas evitam interpolar ID externo em .or().
        const ler = (coluna,id) => todas('vol_schedules','*, service:vol_services!inner(*)',q => q.eq(coluna,id).gte('service.scheduled_at',agora().toISOString()).order('service(scheduled_at)'));
        const rows = await ler('volunteer_id',perfil.id);
        if (perfil.planning_center_id) rows.push(...await ler('planning_center_person_id',perfil.planning_center_id));
        const unicos = [...new Map(rows.map(row => [row.id,row])).values()].sort((a,b) => String(a.service?.scheduled_at||'').localeCompare(String(b.service?.scheduled_at||'')) || a.id.localeCompare(b.id));
        const checkins = await lotes('vol_check_ins','id,schedule_id','schedule_id',unicos.map(row => row.id));
        const presentes = new Set(checkins.map(row => row.schedule_id));
        return res.json(unicos.map(row => ({...row,has_checkin:presentes.has(row.id)})));
      }
      let filtro = q => q;
      if (tipo === 'upcoming') filtro = q => q.gte('scheduled_at',agora().toISOString());
      if (tipo === 'today') {
        const dia = new Date(agora().getTime()-3*3600000).toISOString().slice(0,10);
        const proximoDia = new Date(Date.parse(dia)+86400000).toISOString().slice(0,10);
        filtro = q => q.gte('scheduled_at',`${dia}T00:00:00-03:00`).lt('scheduled_at',`${proximoDia}T00:00:00-03:00`);
      }
      if (tipo === 'window') {
        const dias = (valor,padrao,minimo) => {
          if (valor === undefined) return padrao;
          const n = Number(valor);
          if (!Number.isInteger(n) || n < minimo || n > 120) throw new ErroCampus(400,'vol_periodo_invalido','Período inválido.');
          return n;
        };
        const back = dias(query.back,21,0), ahead = dias(query.ahead,35,1), now = agora().getTime();
        filtro = q => q.gte('scheduled_at',new Date(now-back*86400000).toISOString()).lte('scheduled_at',new Date(now+ahead*86400000).toISOString());
      }
      if (tipo === 'report') {
        const dataValida = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
        if (!dataValida(query.desde) || !dataValida(query.ate) || query.desde > query.ate) throw new ErroCampus(400,'vol_periodo_invalido','Informe um período válido.');
        const proximoDia = new Date(Date.parse(query.ate)+86400000).toISOString().slice(0,10);
        filtro = q => q.gte('scheduled_at',`${query.desde}T00:00:00-03:00`).lt('scheduled_at',`${proximoDia}T00:00:00-03:00`);
      }
      if (['services','upcoming','today','window','report'].includes(tipo)) {
        let services;
        if (tipo === 'upcoming') {
          const {data,error} = await filtro(consulta('vol_services')).order('scheduled_at').order('id').limit(10);
          if (error || !Array.isArray(data)) throw error || new Error('Lista de serviços inválida.');
          services = data;
        } else services = await todas('vol_services','*',q => filtro(q).order('scheduled_at'));
        const ids = services.map(s => s.id);
        if (tipo === 'report') return res.json({services,schedules:await lotes('vol_schedules','*','service_id',ids),checkIns:await lotes('vol_check_ins',CHECKINS,'service_id',ids)});
        const counts = await lotes('vol_schedules','id,service_id','service_id',ids);
        const mapa = new Map(); for (const row of counts) mapa.set(row.service_id,(mapa.get(row.service_id)||0)+1);
        return res.json(services.map(s => ({...s,scheduled_count:mapa.get(s.id)||0})));
      }
      const aplicar = q => {
        if (query.service_id) q=q.eq('service_id',query.service_id);
        if (query.volunteer_id) q=q.eq('volunteer_id',query.volunteer_id);
        if (tipo === 'checkins' && query.is_unscheduled === 'true') q=q.eq('is_unscheduled',true);
        return q;
      };
      if (tipo === 'checkins') return res.json(await todas('vol_check_ins',CHECKINS,q => aplicar(q).order('checked_in_at',{ascending:false})));
      if (tipo !== 'schedules') throw new Error('Leitura não certificada.');
      const schedules = await todas('vol_schedules','*, service:vol_services(*)',q => aplicar(q).order('team_name'));
      const checkins = await lotes('vol_check_ins','*','schedule_id',schedules.map(s => s.id));
      const mapa = new Map(); for (const row of checkins) if (!mapa.has(row.schedule_id)) mapa.set(row.schedule_id,row);
      return res.json(schedules.map(s => ({...s,check_in:mapa.get(s.id)||null})));
    } catch (error) { return responderErroCampus(res,error); }
  };
}
module.exports = { criarLeituraVoluntariado };

function criarDisponibilidadeVoluntariado({supabase, excluir = false}) {
  return async (req,res) => {
    try {
      const {validarContexto,carimbarCampus} = require('../utils/campusQuery');
      validarContexto(req.campus,true);
      const uid = req.user?.id || req.user?.userId;
      if (!UUID.test(uid || '')) throw new ErroCampus(401,'vol_sem_identidade','Autenticação necessária.');
      const {data:perfil,error} = await supabase.from('vol_profiles').select('id').eq('auth_user_id',uid).maybeSingle();
      if (error) throw error;
      if (!perfil) throw new ErroCampus(404,'vol_perfil_ausente','Perfil de voluntário não encontrado.');
      if (excluir) {
        if (!UUID.test(req.params?.id || '')) throw new ErroCampus(404,'vol_disponibilidade_ausente','Indisponibilidade não encontrada.');
        // A tabela não possui deleted_at; a exclusão mantém a regra vigente e prova propriedade na mesma operação.
        const {data,error:erro} = await filtrarCampus(supabase.from('vol_availability').delete(),req.campus)
          .eq('id',req.params.id).eq('volunteer_profile_id',perfil.id).select('id').maybeSingle();
        if (erro) throw erro;
        if (!data) throw new ErroCampus(404,'vol_disponibilidade_ausente','Indisponibilidade não encontrada.');
        return res.json({success:true});
      }
      const b=req.body || {};
      carimbarCampus(b,req.campus);
      const {data:vinculo,error:erroVinculo} = await supabase.from('vol_profile_campi').select('profile_id')
        .eq('profile_id',perfil.id).eq('igreja_id',req.campus.campus_id).eq('ativo',true).maybeSingle();
      if (erroVinculo) throw erroVinculo;
      if (!vinculo) {
        if (req.campus.estado !== 'preparacao') throw new ErroCampus(403,'vol_vinculo_ausente','O perfil não possui vínculo ativo neste campus.');
        const legado = await require('./campusVoluntariadoOrigem').resolverOrigemVoluntariado(supabase);
        if (legado.campus_id !== req.campus.campus_id) throw new ErroCampus(403,'vol_vinculo_ausente','Campus divergente.');
        // O trigger cria o primeiro vínculo a partir deste ato apenas na preparação, sem reativar revogados.
      }
      let inicio=b.unavailable_from, fim=b.unavailable_to || inicio;
      if (b.service_id) {
        if (typeof b.service_id !== 'string' || !UUID.test(b.service_id)) throw new ErroCampus(400,'vol_servico_invalido','Serviço inválido.');
        const {data:servico,error:erroServico} = await filtrarCampus(supabase.from('vol_services').select('id,scheduled_at'),req.campus).eq('id',b.service_id).maybeSingle();
        if (erroServico) throw erroServico;
        if (!servico) throw new ErroCampus(404,'vol_servico_ausente','Serviço não encontrado neste campus.');
        inicio=new Date(Date.parse(servico.scheduled_at)-3*3600000).toISOString().slice(0,10);fim=inicio;
      }
      const valida=d=>typeof d==='string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0,10)===d;
      if (!valida(inicio) || !valida(fim) || inicio>fim) throw new ErroCampus(400,'vol_periodo_invalido','Informe um período válido.');
      if (b.reason != null && (typeof b.reason !== 'string' || b.reason.length>1000)) throw new ErroCampus(400,'vol_motivo_invalido','Motivo inválido.');
      const {data,error:erro} = await supabase.from('vol_availability').insert(carimbarCampus({volunteer_profile_id:perfil.id,
        service_id:b.service_id||null,unavailable_from:inicio,unavailable_to:fim,reason:b.reason?.trim()||null},req.campus)).select().single();
      if (erro) throw erro;
      if (!data) throw new Error('Indisponibilidade sem resultado.');
      return res.json(data);
    } catch(error) { return responderErroCampus(res,error); }
  };
}
module.exports.criarDisponibilidadeVoluntariado = criarDisponibilidadeVoluntariado;
