// Diagnóstico temporário do bot WhatsApp · estado das coletas/config/líderes.
// Roda 1x e some. NÃO faz parte do runtime.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const mask = (t) => !t ? '(null)' : '…' + String(t).slice(-4);

(async () => {
  console.log('=== whatsapp_config (id=1) ===');
  const { data: cfg, error: e0 } = await sb.from('whatsapp_config').select('*').eq('id', 1).maybeSingle();
  if (e0) console.log('  erro:', e0.message);
  else console.log('  ia_ativa:', cfg?.ia_ativa, '· institucional keys:', cfg ? Object.keys(cfg.institucional || {}) : '(sem linha)', '· updated_at:', cfg?.updated_at);

  console.log('\n=== whatsapp_lideres (ativos) ===');
  const { data: lids, error: e1 } = await sb.from('whatsapp_lideres')
    .select('id, telefone, nome_exibicao, escopo, grupo_id, ativo, created_at')
    .is('deleted_at', null).order('created_at', { ascending: false });
  if (e1) console.log('  erro:', e1.message);
  else (lids || []).forEach(l => console.log(`  ${mask(l.telefone)} · ${l.nome_exibicao || '(sem nome)'} · escopo=${JSON.stringify(l.escopo)} · ativo=${l.ativo}`));

  console.log('\n=== whatsapp_coletas (15 mais recentes) ===');
  const { data: cols, error: e2 } = await sb.from('whatsapp_coletas')
    .select('id, telefone, raw_text, status, modulo_destino, parsed, erro, whatsapp_message_id, created_at, aplicado_em')
    .order('created_at', { ascending: false }).limit(15);
  if (e2) { console.log('  erro:', e2.message); }
  else (cols || []).forEach(c => {
    const p = c.parsed || {};
    const dados = p.dados ? Object.entries(p.dados).filter(([, v]) => v != null).map(([k, v]) => `${k}=${v}`).join(',') : '';
    console.log(`  [${c.created_at?.slice(0, 19).replace('T', ' ')}] ${mask(c.telefone)} · status=${c.status} · modulo=${c.modulo_destino} · fonte=${p.fonte || '-'} · erro=${c.erro || '-'}`);
    console.log(`     raw="${(c.raw_text || '').slice(0, 60)}" · pronto=${p.pronto ?? '-'} · pendentes=${p.pendentes ?? '-'} · dados[${dados}] · msgid=${mask(c.whatsapp_message_id)}`);
  });

  console.log('\n=== contagem por status (todas) ===');
  for (const st of ['recebido', 'aguardando_info', 'parseado', 'aplicado', 'rejeitado', 'ignorado']) {
    const { count } = await sb.from('whatsapp_coletas').select('id', { count: 'exact', head: true }).eq('status', st);
    console.log(`  ${st}: ${count}`);
  }
  process.exit(0);
})().catch(e => { console.error('FALHA:', e.message); process.exit(1); });
