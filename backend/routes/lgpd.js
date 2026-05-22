// =====================================================================
// LGPD · exportação de dados pessoais
// =====================================================================
// Endpoint admin (secretaria) gera relatório completo de um membro
// com TODAS as tabelas que armazenam dados dele · respeita direito à
// portabilidade (LGPD Art. 18 V).
//
// Member self-service intencionalmente NÃO criado · decisão do Marcos
// 2026-05-22: membro solicita presencialmente na secretaria, que
// gera o relatório com identidade verificada (CPF + telefone confere).
//
// Toda solicitação fica auditada em `app_audit_log` com:
//   - quem solicitou (admin)
//   - de quem (membro_id)
//   - quando
//   - motivo declarado
// =====================================================================
const router = require('express').Router();
const { supabase } = require('../utils/supabase');
const { authenticate, authorizeModule } = require('../middleware/auth');

router.use(authenticate);

// GET /api/lgpd/membro/:id/exportar?motivo=...
// Gera JSON completo com TODOS os dados de um membro
// Requer cargo com módulo membresia >= 3
router.get(
  '/membro/:id/exportar',
  authorizeModule('membresia', 3),
  async (req, res) => {
    try {
      const membroId = req.params.id;
      const motivo = (req.query.motivo || req.body?.motivo || '').toString().trim();

      if (!membroId) return res.status(400).json({ error: 'membro_id obrigatório' });

      // 1. Dados base
      const { data: membro, error: errMembro } = await supabase
        .from('mem_membros').select('*').eq('id', membroId).maybeSingle();

      if (errMembro) throw errMembro;
      if (!membro) return res.status(404).json({ error: 'Membro não encontrado' });

      // 2. Coleta paralela de TODAS as tabelas com dados do membro
      const [
        familia, profileLinkado, trilha, grupos, encontroPresencas,
        ministerios, contribuicoes, checkins, devocionais, historico,
        batismos, decisoesCulto, jornada180, acompanhamentos, convertidos,
        nsmEventos, intVisitanteOrigem,
      ] = await Promise.all([
        membro.familia_id
          ? supabase.from('mem_familias').select('*').eq('id', membro.familia_id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('profiles').select('id, email, name, area, role, active').eq('membro_id', membroId).maybeSingle(),
        supabase.from('mem_trilha_valores').select('*').is('deleted_at', null).eq('membro_id', membroId).order('created_at'),
        supabase.from('mem_grupo_membros').select('*, mem_grupos(id, nome, recorrencia)').is('deleted_at', null).eq('membro_id', membroId),
        supabase.from('mem_grupo_encontro_presencas').select('encontro_id, presente').is('deleted_at', null).eq('membro_id', membroId).limit(200),
        supabase.from('mem_voluntarios').select('*, mem_ministerios(nome)').is('deleted_at', null).eq('membro_id', membroId),
        supabase.from('mem_contribuicoes').select('*').is('deleted_at', null).eq('membro_id', membroId).order('data', { ascending: false }),
        supabase.from('mem_checkins').select('*').is('deleted_at', null).eq('membro_id', membroId).order('data', { ascending: false }).limit(500),
        supabase.from('mem_devocionais').select('*').is('deleted_at', null).eq('membro_id', membroId).order('data', { ascending: false }).limit(200),
        supabase.from('mem_historico').select('*').is('deleted_at', null).eq('membro_id', membroId).order('created_at', { ascending: false }),
        supabase.from('batismo_inscricoes').select('*').is('deleted_at', null).eq('membro_id', membroId),
        supabase.from('cultos_decisoes_pessoas').select('*').is('deleted_at', null).eq('membro_id', membroId),
        supabase.from('cui_jornada180').select('*').is('deleted_at', null).eq('membro_id', membroId).order('data_encontro', { ascending: false }),
        supabase.from('cui_acompanhamentos').select('*').is('deleted_at', null).eq('membro_id', membroId),
        supabase.from('cui_convertidos').select('*').is('deleted_at', null).eq('membro_id', membroId),
        supabase.from('nsm_eventos').select('*').eq('membro_id', membroId).order('data_engajamento', { ascending: false }),
        supabase.from('int_visitantes').select('*').eq('membresia_id', membroId),
      ]);

      // 3. Auditoria · registra que a solicitação aconteceu
      await supabase.from('app_audit_log').insert({
        table_name: 'lgpd_export',
        row_id: membroId,
        action: 'INSERT',
        user_id: req.user?.id || null,
        user_email: req.user?.email || null,
        changes: {
          tipo: 'lgpd_export_membro',
          motivo: motivo || '(não informado)',
          requisitante_nome: req.user?.name || null,
          ip: (req.headers['x-forwarded-for'] || req.ip || '').toString(),
        },
      });

      // 4. Monta JSON estruturado
      const relatorio = {
        gerado_em: new Date().toISOString(),
        requisitante: {
          user_id: req.user?.id || null,
          email: req.user?.email || null,
          nome: req.user?.name || null,
        },
        motivo: motivo || '(não informado)',
        membro: {
          dados_basicos: membro,
          familia: familia.data || null,
          profile_linkado: profileLinkado.data || null,
        },
        jornada: {
          trilha_valores: trilha.data || [],
          batismos: batismos.data || [],
          decisoes_culto: decisoesCulto.data || [],
          jornada180: jornada180.data || [],
          nsm_eventos: nsmEventos.data || [],
        },
        comunidade: {
          grupos: grupos.data || [],
          encontro_presencas_count: (encontroPresencas.data || []).length,
          ministerios_voluntariado: ministerios.data || [],
          checkins_count: (checkins.data || []).length,
          devocionais_count: (devocionais.data || []).length,
        },
        cuidados_pastorais: {
          historico: historico.data || [],
          acompanhamentos: acompanhamentos.data || [],
          convertidos: convertidos.data || [],
        },
        financeiro: {
          contribuicoes: contribuicoes.data || [],
          total_contribuicoes: (contribuicoes.data || []).reduce(
            (acc, c) => acc + (Number(c.valor) || 0), 0
          ),
        },
        historico_pre_membro: {
          visitas_iniciais: intVisitanteOrigem.data || [],
        },
      };

      res.json(relatorio);
    } catch (e) {
      console.error('[LGPD export]', e.message);
      res.status(500).json({ error: 'Erro ao gerar relatório LGPD' });
    }
  }
);

// GET /api/lgpd/historico-solicitacoes
// Lista quem solicitou exports recentes (auditoria · só admin RH/membresia)
router.get(
  '/historico-solicitacoes',
  authorizeModule('membresia', 3),
  async (req, res) => {
    try {
      const { limit = 100 } = req.query;
      const { data, error } = await supabase
        .from('app_audit_log')
        .select('id, row_id, user_email, changes, created_at')
        .eq('table_name', 'lgpd_export')
        .order('created_at', { ascending: false })
        .limit(parseInt(limit));

      if (error) throw error;
      res.json(data || []);
    } catch (e) {
      res.status(500).json({ error: 'Erro ao listar histórico LGPD' });
    }
  }
);

module.exports = router;
