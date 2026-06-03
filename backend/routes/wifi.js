const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase, query } = require('../utils/supabase');
const { isAuthorizedCron } = require('../utils/cronAuth');
const { runWifiSync } = require('../services/wifiSync');

// ── Cron · ANTES de authenticate ──
router.get('/cron/sync', async (req, res) => {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'unauthorized' });
  try {
    const r = await runWifiSync();
    res.json(r);
  } catch (e) {
    console.error('[wifi/cron/sync]', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.use(authenticate);

// Sincronizar agora (manual)
router.post('/sync', authorizeModule('wifi', 3), async (_req, res) => {
  try {
    const r = await runWifiSync();
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Status do último sync + contagens gerais
router.get('/resumo', authorizeModule('wifi', 1), async (_req, res) => {
  try {
    const { data: ultimoSync } = await supabase
      .from('wifi_sync_log').select('*')
      .order('iniciado_em', { ascending: false }).limit(1).maybeSingle();

    const { rows } = await query(`
      SELECT
        (SELECT count(*) FROM vw_wifi_pessoas)                              AS pessoas,
        (SELECT count(*) FROM vw_wifi_pessoas WHERE eh_membro)              AS pessoas_membros,
        (SELECT count(*) FROM vw_wifi_pessoas WHERE dizima_oferta)          AS pessoas_dizimam,
        (SELECT count(*) FROM vw_wifi_pessoas WHERE serve)                  AS pessoas_servem,
        (SELECT count(*) FROM vw_wifi_pessoas WHERE em_grupo)               AS pessoas_em_grupo,
        (SELECT count(*) FROM wifi_conexoes WHERE deleted_at IS NULL AND evento='login') AS conexoes_login,
        (SELECT count(*) FROM wifi_conexoes WHERE deleted_at IS NULL AND evento='login'
            AND timestamp_evento >= now() - interval '30 days')            AS conexoes_30d
    `);
    res.json({ ...rows[0], ultimoSync: ultimoSync || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Lista de pessoas (agrupadas por CPF) · busca + filtro por culto/período
router.get('/pessoas', authorizeModule('wifi', 1), async (req, res) => {
  try {
    const busca = (req.query.busca || '').toString().trim();
    const cultoId = (req.query.culto_id || '').toString().trim();
    const inicio = (req.query.inicio || '').toString().trim();
    const fim = (req.query.fim || '').toString().trim();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;

    const where = [];
    const params = [];
    let i = 1;

    if (busca) {
      params.push(`%${busca.toLowerCase()}%`, `%${busca.replace(/\D/g, '')}%`);
      where.push(`(lower(p.nome) LIKE $${i} OR ($${i + 1} <> '%%' AND p.cpf_norm LIKE $${i + 1}))`);
      i += 2;
    }
    if (cultoId || inicio || fim) {
      const sub = [`v2.cpf_norm = p.cpf_norm`, `cx.evento = 'login'`, `cx.deleted_at IS NULL`];
      if (cultoId) { params.push(cultoId); sub.push(`cx.culto_id = $${i++}`); }
      if (inicio) { params.push(inicio); sub.push(`cx.timestamp_evento >= $${i++}`); }
      if (fim) { params.push(fim); sub.push(`cx.timestamp_evento < ($${i++}::date + 1)`); }
      where.push(`EXISTS (SELECT 1 FROM wifi_conexoes cx
                    JOIN wifi_visitantes v2 ON v2.id = cx.wifi_visitante_id
                    WHERE ${sub.join(' AND ')})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows: cntRows } = await query(
      `SELECT count(*)::int AS total FROM vw_wifi_pessoas p ${whereSql}`, params);
    const total = cntRows[0]?.total || 0;

    params.push(limit, offset);
    const { rows } = await query(`
      SELECT p.cpf_norm, p.nome, p.telefone, p.email, p.membro_id, p.eh_membro,
             p.membro_status, p.serve, p.em_grupo, p.dizima_oferta, p.tem_batismo,
             p.tem_next, p.tem_decisao, p.aceite_lgpd, p.total_logins,
             p.cultos_distintos, p.ultima_conexao, p.cadastros
        FROM vw_wifi_pessoas p
        ${whereSql}
        ORDER BY p.ultima_conexao DESC NULLS LAST, p.nome
        LIMIT $${i++} OFFSET $${i++}
    `, params);

    res.json({ total, page, limit, pessoas: rows });
  } catch (e) {
    console.error('[wifi/pessoas]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Perfil 360º de uma pessoa (por CPF normalizado)
router.get('/pessoas/:cpf', authorizeModule('wifi', 1), async (req, res) => {
  try {
    const cpf = (req.params.cpf || '').replace(/\D/g, '');
    if (!cpf) return res.status(400).json({ error: 'CPF inválido' });

    const { rows: pRows } = await query(
      `SELECT * FROM vw_wifi_pessoas WHERE cpf_norm = $1`, [cpf]);
    if (!pRows.length) return res.status(404).json({ error: 'Pessoa não encontrada' });
    const pessoa = pRows[0];
    const membroId = pessoa.membro_id;

    // Conexões (timeline de logins) com culto
    const { rows: conexoes } = await query(`
      SELECT cx.id, cx.timestamp_evento, cx.mac_address, cx.evento,
             cx.culto_id, c.data AS culto_data, c.nome AS culto_nome, st.name AS servico
        FROM wifi_conexoes cx
        JOIN wifi_visitantes v ON v.id = cx.wifi_visitante_id
        LEFT JOIN cultos c ON c.id = cx.culto_id
        LEFT JOIN vol_service_types st ON st.id = c.service_type_id
       WHERE v.cpf_norm = $1 AND cx.deleted_at IS NULL AND cx.evento = 'login'
       ORDER BY cx.timestamp_evento DESC
       LIMIT 300
    `, [cpf]);

    // Frequência por tipo de culto
    const { rows: freqServico } = await query(`
      SELECT COALESCE(st.name,'(fora de culto)') AS servico,
             count(*)::int AS logins,
             count(DISTINCT c.data)::int AS dias
        FROM wifi_conexoes cx
        JOIN wifi_visitantes v ON v.id = cx.wifi_visitante_id
        LEFT JOIN cultos c ON c.id = cx.culto_id
        LEFT JOIN vol_service_types st ON st.id = c.service_type_id
       WHERE v.cpf_norm = $1 AND cx.deleted_at IS NULL AND cx.evento = 'login'
       GROUP BY COALESCE(st.name,'(fora de culto)')
       ORDER BY logins DESC
    `, [cpf]);

    // Cruzamentos
    const cruzamento = {};

    if (membroId) {
      const { data: membro } = await supabase.from('mem_membros')
        .select('id,nome,status,data_conversao,batizado,data_batismo,data_membresia,origem_cadastro')
        .eq('id', membroId).maybeSingle();
      cruzamento.membro = membro || null;

      const { rows: grupos } = await query(`
        SELECT g.id, g.nome, gm.funcao, gm.entrou_em
          FROM mem_grupo_membros gm JOIN mem_grupos g ON g.id = gm.grupo_id
         WHERE gm.membro_id = $1 AND gm.saiu_em IS NULL AND gm.deleted_at IS NULL
      `, [membroId]);
      cruzamento.grupos = grupos;

      const { rows: vol } = await query(`
        SELECT mv.papel, mv.desde, m.nome AS ministerio
          FROM mem_voluntarios mv LEFT JOIN mem_ministerios m ON m.id = mv.ministerio_id
         WHERE mv.membro_id = $1 AND mv.ate IS NULL AND mv.deleted_at IS NULL
      `, [membroId]);
      cruzamento.voluntariado = vol;

      // Contribuições · resumo SEM valores (só presença/recência) por LGPD/financeiro
      const { rows: contrib } = await query(`
        SELECT tipo, count(*)::int AS qtd, max(data) AS ultima
          FROM mem_contribuicoes
         WHERE membro_id = $1 AND deleted_at IS NULL
           AND data >= (CURRENT_DATE - 365)
         GROUP BY tipo ORDER BY ultima DESC
      `, [membroId]);
      cruzamento.contribuicoes = contrib;

      const { rows: trilha } = await query(`
        SELECT etapa, data_conclusao, concluida
          FROM mem_trilha_valores
         WHERE membro_id = $1 AND deleted_at IS NULL
         ORDER BY data_conclusao DESC NULLS LAST
      `, [membroId]);
      cruzamento.trilha = trilha;
    }

    // Batismo / decisões / NEXT · por membro_id OU CPF (essas tabelas têm CPF)
    const { rows: batismos } = await query(`
      SELECT id, status, data_batismo, created_at
        FROM batismo_inscricoes
       WHERE deleted_at IS NULL AND (cpf = $1 ${membroId ? 'OR membro_id = $2' : ''})
       ORDER BY created_at DESC
    `, membroId ? [cpf, membroId] : [cpf]);
    cruzamento.batismos = batismos;

    const { rows: decisoes } = await query(`
      SELECT dp.id, dp.tipo_decisao, dp.registrado_em, c.data AS culto_data, c.nome AS culto_nome
        FROM cultos_decisoes_pessoas dp
        LEFT JOIN cultos c ON c.id = dp.culto_id
       WHERE dp.deleted_at IS NULL AND (dp.cpf = $1 ${membroId ? 'OR dp.membro_id = $2' : ''})
       ORDER BY dp.registrado_em DESC
    `, membroId ? [cpf, membroId] : [cpf]);
    cruzamento.decisoes = decisoes;

    const { rows: next } = await query(`
      SELECT id, evento_id, check_in_at, created_at
        FROM next_inscricoes
       WHERE (cpf = $1 ${membroId ? 'OR membro_id = $2' : ''})
       ORDER BY created_at DESC
    `, membroId ? [cpf, membroId] : [cpf]);
    cruzamento.next = next;

    res.json({ pessoa, conexoes, freqServico, cruzamento });
  } catch (e) {
    console.error('[wifi/pessoas/:cpf]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Conexões por faixa de culto (período)
router.get('/cultos', authorizeModule('wifi', 1), async (req, res) => {
  try {
    const inicio = (req.query.inicio || '').toString().trim();
    const fim = (req.query.fim || '').toString().trim();
    const params = [];
    let i = 1;
    const filtros = [`c.deleted_at IS NULL`];
    if (inicio) { params.push(inicio); filtros.push(`c.data >= $${i++}`); }
    if (fim) { params.push(fim); filtros.push(`c.data <= $${i++}`); }

    const { rows } = await query(`
      SELECT c.id, c.data, c.nome AS culto_nome, st.name AS servico,
             count(*) FILTER (WHERE cx.evento = 'login')::int AS logins,
             count(DISTINCT upper(cx.mac_address)) FILTER (WHERE cx.evento = 'login')::int AS dispositivos,
             count(DISTINCT v.cpf_norm)::int AS pessoas_identificadas
        FROM cultos c
        JOIN vol_service_types st ON st.id = c.service_type_id
        LEFT JOIN wifi_conexoes cx ON cx.culto_id = c.id AND cx.deleted_at IS NULL
        LEFT JOIN wifi_visitantes v ON v.id = cx.wifi_visitante_id
       WHERE ${filtros.join(' AND ')}
       GROUP BY c.id, c.data, c.nome, st.name
       HAVING count(*) FILTER (WHERE cx.evento = 'login') > 0
       ORDER BY c.data DESC, st.name
       LIMIT 400
    `, params);

    res.json({ cultos: rows });
  } catch (e) {
    console.error('[wifi/cultos]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
