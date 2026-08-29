// ENSAIO do check-in do módulo de inscrições · evento "Patrocinadores - Celebra 2026"
// Pedido do Marcos (2026-07-30): o caminho QR -> check-in -> desfazer nunca rodou
// com dado real, e o Celebra é 29/08.
//
// O que faz, em produção, nesta ordem:
//   1. liga checkin_ativo no evento (como o botão Ativar da tela faz)
//   2. gera o comprovante e confere pelo endpoint PÚBLICO (caminho do QR)
//   3. marca o check-in pela MESMA RPC que a rota usa (fn_insc_checkin_marcar)
//   4. confere o ledger append-only e o estado atual
//   5. testa o duplo check-in (tem que AVISAR, não estourar)
//   6. desfaz (fn_insc_checkin_desfazer) e confere que voltou a zero
//   7. desliga checkin_ativo
//
// Reversível: o insc_checkins volta a 0. O LEDGER é append-only de propósito e
// guarda a trilha do ensaio com motivo explícito — isso é feature, não sujeira.
require('dotenv').config();
const { supabase } = require('../utils/supabase');
const comp = require('../services/inscricaoComprovante');

const MOTIVO = 'ENSAIO pre-Celebra - desfeito na hora';

// ESCREVE EM PRODUCAO (marca e desfaz check-in num inscrito real, liga e
// desliga checkin_ativo). Por isso exige --exec explicito, igual aos outros
// scripts de operacao do repo.
if (!process.argv.includes('--exec')) {
  console.log('ENSAIO do check-in (evento Patrocinadores - Celebra).');
  console.log('Escreve em PRODUCAO e desfaz na hora. Rode com --exec para valer.');
  process.exit(0);
}

(async () => {
  const { data: ev } = await supabase.from('insc_eventos')
    .select('id,nome,checkin_ativo').ilike('nome', '%Patrocinadores%').maybeSingle();
  const { data: ins } = await supabase.from('inscricoes')
    .select('id,nome_completo,status').eq('evento_id', ev.id).is('deleted_at', null)
    .order('created_at').limit(1);
  const alvo = ins[0];
  const checkinAtivoOriginal = ev.checkin_ativo;
  console.log('evento:', ev.nome, '| checkin_ativo original:', checkinAtivoOriginal);
  console.log('inscrição do ensaio:', alvo.nome_completo, '·', alvo.status);
  console.log('');

  let falhas = 0;
  const passo = (n, txt, cond) => { console.log((cond ? '  OK   ' : '  FALHA') + ' ' + n + '. ' + txt); if (!cond) falhas++; };

  // 1 · ativar
  await supabase.from('insc_eventos').update({ checkin_ativo: true }).eq('id', ev.id);
  const { data: ev2 } = await supabase.from('insc_eventos').select('checkin_ativo').eq('id', ev.id).single();
  passo(1, 'checkin_ativo ligado (equivale ao botão Ativar)', ev2.checkin_ativo === true);

  // 2 · comprovante pelo caminho público
  const token = comp.gerarTokenComprovante(alvo.id);
  const r = await fetch('https://www.cbrio.org/api/public/evento/comprovante/' + token);
  const body = await r.json().catch(() => ({}));
  passo(2, 'comprovante público resolve (HTTP ' + r.status + ', nome="' + (body.nome || '?') + '")',
    r.status === 200 && body.nome === alvo.nome_completo);

  // 3 · marcar pela MESMA RPC da rota
  const m1 = await supabase.rpc('fn_insc_checkin_marcar', {
    p_inscricao_id: alvo.id, p_por: null, p_modo: 'qr',
    p_override_pendente: false, p_override_motivo: MOTIVO,
  });
  passo(3, 'fn_insc_checkin_marcar: ' + (m1.error ? 'ERRO ' + m1.error.code + ' ' + m1.error.message
    : JSON.stringify(m1.data)), !m1.error && m1.data && m1.data.ok);

  // 4 · estado atual + ledger
  const { data: st } = await supabase.from('insc_checkins').select('id,modo,em').eq('inscricao_id', alvo.id);
  passo(4, 'insc_checkins criou 1 linha (modo=' + (st?.[0]?.modo || '—') + ')', (st || []).length === 1);
  const { data: led1 } = await supabase.from('insc_checkin_eventos')
    .select('id,acao,motivo,em').eq('inscricao_id', alvo.id).order('em');
  passo(4.1, 'ledger registrou: ' + (led1 || []).map((l) => l.acao).join(' -> '), (led1 || []).length >= 1);

  // 5 · duplo check-in tem que AVISAR, não estourar
  const m2 = await supabase.rpc('fn_insc_checkin_marcar', {
    p_inscricao_id: alvo.id, p_por: null, p_modo: 'qr',
    p_override_pendente: false, p_override_motivo: MOTIVO,
  });
  passo(5, 'duplo check-in avisa em vez de estourar: ' + (m2.error ? 'ERRO ' + m2.error.code
    : JSON.stringify(m2.data)), !m2.error && m2.data && m2.data.ja_checkin === true);

  // 6 · desfazer
  const d = await supabase.rpc('fn_insc_checkin_desfazer', {
    p_evento_id: ev.id, p_inscricao_id: alvo.id, p_por: null, p_motivo: MOTIVO,
  });
  passo(6, 'fn_insc_checkin_desfazer: ' + (d.error ? 'ERRO ' + d.error.code + ' ' + d.error.message
    : JSON.stringify(d.data)), !d.error);
  const { data: st2 } = await supabase.from('insc_checkins').select('id').eq('inscricao_id', alvo.id);
  passo(6.1, 'insc_checkins voltou a ZERO linha', (st2 || []).length === 0);
  const { data: led2 } = await supabase.from('insc_checkin_eventos')
    .select('acao,motivo').eq('inscricao_id', alvo.id).order('em');
  passo(6.2, 'ledger com a trilha completa: ' + (led2 || []).map((l) => l.acao).join(' -> '),
    (led2 || []).some((l) => l.acao === 'desfeito'));
  const motivoGravado = (led2 || []).some((l) => (l.motivo || '').includes('ENSAIO'));
  passo(6.3, 'motivo do desfazer foi GRAVADO no ledger (era o bug do del() sem corpo)', motivoGravado);

  // 7 · restaurar
  await supabase.from('insc_eventos').update({ checkin_ativo: checkinAtivoOriginal }).eq('id', ev.id);
  const { data: ev3 } = await supabase.from('insc_eventos').select('checkin_ativo').eq('id', ev.id).single();
  passo(7, 'checkin_ativo restaurado pra ' + checkinAtivoOriginal, ev3.checkin_ativo === checkinAtivoOriginal);

  // estado global
  const { count: totalCk } = await supabase.from('insc_checkins').select('*', { count: 'exact', head: true });
  const { count: totalLed } = await supabase.from('insc_checkin_eventos').select('*', { count: 'exact', head: true });
  console.log('');
  console.log('estado final · insc_checkins:', totalCk, '(esperado 0) · ledger:', totalLed, '(trilha do ensaio, append-only)');
  console.log('');
  console.log(falhas === 0 ? '>>> ENSAIO PASSOU EM TODOS OS PASSOS' : '>>> ' + falhas + ' PASSO(S) FALHARAM');
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => { console.error('ERRO GERAL:', e.message); process.exit(1); });
