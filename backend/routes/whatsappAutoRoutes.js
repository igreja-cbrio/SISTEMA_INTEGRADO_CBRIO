// Endpoints reutilizáveis pra configurar/testar a mensagem automática de
// WhatsApp de um contexto (chave). Montado pelo voluntariado e pelo cuidados.
const { supabase } = require('../utils/supabase');
const { enviarTeste, getConfig } = require('../services/whatsappAuto');

// router    · Express router do módulo (já com authenticate aplicado)
// chave     · contexto em whatsapp_auto_config (ex.: 'cuidados_aconselhamento')
// modulo    · slug pra authorizeModule (ex.: 'cuidados')
// authorizeModule · middleware do módulo
// prefix    · base das rotas (default '/whatsapp-auto')
function mountWhatsappAuto(router, { chave, modulo, authorizeModule, prefix = '/whatsapp-auto' }) {
  router.get(`${prefix}/config`, authorizeModule(modulo, 1), async (_req, res) => {
    try {
      const cfg = await getConfig(chave);
      if (!cfg) return res.status(404).json({ error: 'Configuração não encontrada' });
      res.json(cfg);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put(`${prefix}/config`, authorizeModule(modulo, 3), async (req, res) => {
    try {
      const allow = ['ativo', 'modo', 'template_nome', 'idioma', 'usa_nome', 'mensagem'];
      const patch = {};
      for (const k of allow) if (k in (req.body || {})) patch[k] = req.body[k];
      if (patch.modo && !['template', 'texto'].includes(patch.modo)) {
        return res.status(400).json({ error: 'modo inválido' });
      }
      patch.updated_at = new Date().toISOString();
      patch.updated_by = req.user?.id || null;
      const { data, error } = await supabase
        .from('whatsapp_auto_config').update(patch).eq('chave', chave).select('*').single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post(`${prefix}/testar`, authorizeModule(modulo, 3), async (req, res) => {
    try {
      const { telefone, nome } = req.body || {};
      if (!telefone) return res.status(400).json({ error: 'Informe um telefone pra testar' });
      const r = await enviarTeste(chave, telefone, nome);
      res.json(r);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get(`${prefix}/envios`, authorizeModule(modulo, 1), async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_auto_envios')
        .select('id, ref_id, telefone, nome, origem, status, erro, created_at')
        .eq('chave', chave).order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

module.exports = { mountWhatsappAuto };
