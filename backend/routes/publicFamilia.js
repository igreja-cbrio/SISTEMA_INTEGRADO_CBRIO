/**
 * Rota pública do convite de familiar (página de bounce /f/a/:codigo).
 * Só LEITURA: mostra quem convidou pra pessoa decidir abrir o app e aceitar.
 * O aceite em si exige login no app (POST /api/app/familia/aceitar).
 */
const router = require('express').Router();
const { supabase } = require('../utils/supabase');

const ROTULO = { filho: 'filho(a)', pai_mae: 'pai/mãe', conjuge: 'cônjuge', irmao: 'irmão(ã)', outro: 'familiar' };
const primeiroNome = (n) => String(n || '').trim().split(/\s+/)[0] || 'Alguém';

// GET /api/public/familia/convite/:codigo
router.get('/convite/:codigo', async (req, res) => {
  try {
    const codigo = String(req.params.codigo || '').trim().toUpperCase();
    if (!codigo) return res.status(400).json({ error: 'Código não informado' });
    const { data: conv } = await supabase.from('mem_familia_convites')
      .select('status, expira_em, parentesco, criador_membro_id')
      .eq('codigo', codigo).is('deleted_at', null).maybeSingle();
    if (!conv) return res.status(404).json({ error: 'Convite não encontrado', status: 'inexistente' });
    if (conv.status !== 'pendente') return res.status(200).json({ status: conv.status });
    if (new Date(conv.expira_em) < new Date()) return res.status(200).json({ status: 'expirado' });
    const { data: criador } = await supabase.from('mem_membros').select('nome').eq('id', conv.criador_membro_id).maybeSingle();
    res.json({
      status: 'pendente',
      criador_nome: primeiroNome(criador?.nome),
      parentesco: conv.parentesco,
      rotulo: ROTULO[conv.parentesco] || ROTULO.outro,
      codigo,
    });
  } catch (e) {
    console.error('[publicFamilia] convite:', e.message);
    res.status(500).json({ error: 'Erro ao ler o convite' });
  }
});

module.exports = router;
