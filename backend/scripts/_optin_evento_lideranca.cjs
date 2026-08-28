// ============================================================================
// Liga o opt-in de WhatsApp das inscrições de UM evento — por DECISÃO da
// liderança, não por clique da pessoa.
// ============================================================================
// Decisão do Marcos (2026-07-31), sobre o Celebra: *"são todos voluntários,
// marque a opção de opt-in para eles, como se eles tivessem aceitado, mas vamos
// criar um template para se quiser cancelar (...) não é o ideal, mas vale, só
// não mande mensagem pra ninguém agora"*.
//
// Contexto que motivou: 85 das 98 inscrições do Celebra são MIGRADAS do
// formulário antigo, que **não tinha o checkbox de opt-in** — então "não
// marcou" ali não significa "recusou", significa que nunca foi perguntado. Sem
// isso, o comprovante com o código de check-in alcançaria 15 de 98 pessoas.
//
// ⚠️ O QUE ESTE SCRIPT NÃO FAZ, DE PROPÓSITO:
//   · NÃO envia mensagem nenhuma (o envio é outro caminho, e o Marcos pediu
//     explicitamente pra não disparar agora).
//   · NÃO grava consentimento como se a PESSOA tivesse aceitado. O registro em
//     `inscricao_consentimentos` diz, no texto, que foi decisão da liderança —
//     fabricar prova de aceite é pior que não ter registro.
//   · NÃO mexe em `mem_membros.whatsapp_optin` (isso afetaria envios de OUTROS
//     módulos, que não foram decididos aqui). Só a inscrição deste evento.
//
// Reversível: `--desfazer` volta ao estado anterior lendo o backup JSON.
// Dry-run por padrão. `--exec` grava.
//
//   node backend/scripts/_optin_evento_lideranca.cjs --evento=<uuid>
//   node backend/scripts/_optin_evento_lideranca.cjs --evento=<uuid> --exec
// ============================================================================
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { supabase } = require('../utils/supabase');
const { registrarConsentimentos } = require('../services/inscricaoContrato');

const arg = (nome) => (process.argv.find((a) => a.startsWith(`--${nome}=`)) || '').split('=')[1] || null;
const EXEC = process.argv.includes('--exec');
const EVENTO = arg('evento');
const BACKUP = path.join(__dirname, `_optin_backup_${(EVENTO || 'x').slice(0, 8)}.json`);

const TEXTO_DECISAO = 'Opt-in de WhatsApp concedido por DECISÃO DA LIDERANÇA (não houve aceite '
  + 'da pessoa neste ato): público interno/voluntário do evento e mensagem de serviço com o '
  + 'comprovante e o código de check-in da própria inscrição. Toda mensagem informa como '
  + 'cancelar (responder SAIR), e o cancelamento é aplicado na hora.';

(async () => {
  if (!EVENTO) {
    console.error('Uso: --evento=<uuid do insc_eventos> [--exec]');
    process.exit(1);
  }

  const { data: ev } = await supabase.from('insc_eventos')
    .select('id, nome, data').eq('id', EVENTO).maybeSingle();
  if (!ev) { console.error('Evento não encontrado.'); process.exit(1); }

  const linhas = [];
  for (let off = 0; off < 20000; off += 1000) {
    const { data, error } = await supabase.from('inscricoes')
      .select('id, nome_completo, telefone, whatsapp_optin, legado_fonte, membro_id, status')
      .eq('evento_id', EVENTO).is('deleted_at', null).neq('status', 'cancelada')
      .range(off, off + 999);
    if (error) throw new Error(error.message);
    linhas.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  const semOptin = linhas.filter((i) => !i.whatsapp_optin);
  const semTelefone = semOptin.filter((i) => String(i.telefone || '').replace(/\D/g, '').length < 10);
  const alvo = semOptin.filter((i) => String(i.telefone || '').replace(/\D/g, '').length >= 10);

  console.log(`evento: ${ev.nome} (${ev.data})`);
  console.log('inscrições ativas:', linhas.length,
    '| já com opt-in:', linhas.length - semOptin.length,
    '| SEM opt-in:', semOptin.length);
  console.log('  migradas (legado_fonte) entre as sem opt-in:', semOptin.filter((i) => i.legado_fonte).length);
  console.log('  a ligar (com telefone válido):', alvo.length,
    '| sem telefone utilizável (ficam de fora):', semTelefone.length);

  if (!EXEC) {
    console.log('\nDRY-RUN. Nada gravado. Rode com --exec.');
    console.log('⚠️ NÃO envia mensagem — só liga a flag e registra a decisão.');
    return;
  }

  // Backup ANTES de qualquer escrita (é consentimento: precisa ser reversível).
  fs.writeFileSync(BACKUP, JSON.stringify({
    evento: EVENTO, em: new Date().toISOString(),
    anterior: semOptin.map((i) => ({ id: i.id, whatsapp_optin: i.whatsapp_optin })),
  }, null, 1));
  console.log('backup:', BACKUP);

  let ligados = 0, erros = 0;
  const agora = new Date().toISOString();
  for (const i of alvo) {
    const { error } = await supabase.from('inscricoes')
      .update({ whatsapp_optin: true, whatsapp_optin_em: agora })
      .eq('id', i.id).eq('whatsapp_optin', false);   // trava: não sobrescreve quem já marcou
    if (error) { erros++; if (erros <= 3) console.error('  erro:', error.message); continue; }
    ligados++;
    // Registro HONESTO do ato: quem decidiu e por quê. `aceito: true` é o estado
    // do opt-in; o TEXTO deixa explícito que não houve aceite da pessoa.
    await registrarConsentimentos({
      porta: 'inscricoes', refId: i.id, membroId: i.membro_id || null,
      itens: [{ tipo: 'whatsapp', texto: TEXTO_DECISAO, aceito: true }],
    }).catch(() => {});
  }

  console.log('\nligados:', ligados, '| erros:', erros);
  const { count } = await supabase.from('inscricoes')
    .select('*', { count: 'exact', head: true })
    .eq('evento_id', EVENTO).is('deleted_at', null).neq('status', 'cancelada')
    .eq('whatsapp_optin', true);
  console.log('com opt-in agora:', count, 'de', linhas.length);
  console.log('\n⚠️ Nenhuma mensagem foi enviada. Envio depende do template aprovado na Meta.');
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
