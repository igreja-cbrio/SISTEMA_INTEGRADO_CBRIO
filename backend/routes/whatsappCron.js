// Crons de disparo WhatsApp pra membros (eventos por tempo · CRON_SECRET).
// Plug-and-play: só envia quando o env do template está setado (no-op gracioso).
const router = require('express').Router();
const { supabase } = require('../utils/supabase');
const { requireCron } = require('../utils/cronAuth');
const wpp = require('../services/whatsappService');
const { jaParabenizado, volProfileDoMembro, registrarParabens } = require('../services/aniversarioVoluntario');

// GET /api/whatsapp-cron/aniversarios — parabeniza os VOLUNTÁRIOS que fazem
// aniversário hoje (Ministério do Voluntariado · template WHATSAPP_TEMPLATE_ANIVERSARIO2).
// Consolidado: é o ÚNICO aniversário por WhatsApp (o antigo, genérico pra todo
// membro do app, foi removido pra não duplicar). Marketing → respeita opt-in
// (notificarMembro já exige). Roda 1x/dia.
router.get('/aniversarios', requireCron, async (_req, res) => {
  try {
    // Interruptor central (aba Comunicação→Disparos · decisão do Marcos 14/08)
    if (await require('../services/comunicacaoDisparosOff').disparoDesligado('aniversario_voluntario')) {
      return res.json({ ok: true, pulado: 'desligado_na_comunicacao' });
    }
    const hoje = new Date(Date.now() - 3 * 3600 * 1000); // BRT
    const mmdd = `${String(hoje.getUTCMonth() + 1).padStart(2, '0')}-${String(hoje.getUTCDate()).padStart(2, '0')}`;

    // Conjunto de membros que são VOLUNTÁRIOS ativos (vínculo aberto · ate IS NULL).
    const voluntarios = new Set();
    for (let off = 0; ; off += 1000) {
      const { data: vs, error: ve } = await supabase.from('mem_voluntarios')
        .select('membro_id').is('deleted_at', null).is('ate', null)
        .not('membro_id', 'is', null).range(off, off + 999);
      if (ve) throw ve;
      if (!vs || !vs.length) break;
      vs.forEach(v => voluntarios.add(v.membro_id));
      if (vs.length < 1000) break;
    }

    let alvo = 0, enviados = 0, jaParabenizados = 0, offset = 0;
    while (true) {
      const { data, error } = await supabase.from('mem_membros')
        .select('id, nome, data_nascimento, telefone, whatsapp_optin')
        .is('deleted_at', null).eq('whatsapp_optin', true)
        .not('data_nascimento', 'is', null).not('telefone', 'is', null)
        .range(offset, offset + 999);
      if (error) throw error;
      if (!data || !data.length) break;
      for (const m of data) {
        if (String(m.data_nascimento).slice(5, 10) !== mmdd) continue;
        if (!voluntarios.has(m.id)) continue; // só voluntários
        alvo++;

        // ⚠️ A coordenação pode ter parabenizado NA MÃO — a tela de
        // aniversariantes mostra a SEMANA (próximos 7 dias), então o clique dela
        // costuma vir ANTES do dia. Sem esta guarda a pessoa recebe o mesmo
        // template de Marketing 2×, que é o padrão que a Meta lê como spam.
        if (await jaParabenizado({ membroId: m.id })) { jaParabenizados++; continue; }

        const primeiroNome = (m.nome || '').trim().split(/\s+/)[0] || m.nome;
        const r = await wpp.notificarMembro(m.id, 'aniversario', [primeiroNome]);
        if (r?.sent) {
          enviados++;
          // Registra pra a TELA da coordenação mostrar "parabenizado" — sem
          // isso ela vê "não parabenizado" em quem o cron já alcançou e manda o
          // duplicado na mão (o furo na direção inversa).
          const volId = await volProfileDoMembro(m.id);
          await registrarParabens({ volProfileId: volId, porUserId: null });
        }
      }
      if (data.length < 1000) break;
      offset += 1000;
    }
    res.json({ ok: true, voluntarios_aniversariantes: alvo, enviados, ja_parabenizados: jaParabenizados });
  } catch (e) {
    console.error('[wpp-cron] aniversarios:', e.message);
    res.status(500).json({ error: 'Erro no cron de aniversários' });
  }
});

// GET /api/whatsapp-cron/batismos-lembrete — lembra quem se batiza AMANHÃ.
// {{1}} data · {{2}} hora = horario_culto DA INSCRIÇÃO (cada um se batiza no
// culto que escolheu · 08:30/10:00/...). Bug corrigido 2026-07-27: a hora era
// FIXA (env/'19h') e o lembrete de 25/07 saiu errado pra turma inteira — duas
// pessoas responderam corrigindo. Fallback: env WHATSAPP_BATISMO_HORA → 'a confirmar'.
router.get('/batismos-lembrete', requireCron, async (_req, res) => {
  try {
    // Interruptor central (aba Comunicação→Disparos · decisão do Marcos 14/08)
    if (await require('../services/comunicacaoDisparosOff').disparoDesligado('batismo_lembrete')) {
      return res.json({ ok: true, pulado: 'desligado_na_comunicacao' });
    }
    const base = new Date(Date.now() - 3 * 3600 * 1000); // BRT
    base.setDate(base.getDate() + 1);
    const amanhaISO = base.toISOString().slice(0, 10);
    const horaFallback = process.env.WHATSAPP_BATISMO_HORA || 'a confirmar';
    const { data, error } = await supabase.from('batismo_inscricoes')
      .select('id, membro_id, data_batismo, horario_culto, status')
      .is('deleted_at', null).eq('data_batismo', amanhaISO)
      .not('membro_id', 'is', null)
      .neq('status', 'realizado').neq('status', 'cancelado');
    if (error) throw error;
    let enviados = 0;
    for (const b of data || []) {
      const dataFmt = new Date(b.data_batismo + 'T12:00:00').toLocaleDateString('pt-BR');
      const hora = (b.horario_culto && String(b.horario_culto).trim()) || horaFallback;
      const r = await wpp.notificarMembro(b.membro_id, 'batismo_lembrete', [dataFmt, hora]);
      if (r?.sent) enviados++;
    }
    res.json({ ok: true, alvo: (data || []).length, enviados });
  } catch (e) {
    console.error('[wpp-cron] batismos-lembrete:', e.message);
    res.status(500).json({ error: 'Erro no cron de batismos' });
  }
});

module.exports = router;
