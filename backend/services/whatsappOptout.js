// ============================================================================
// Opt-out / opt-in de WhatsApp por palavra-chave ou botão (Marcos 2026-07-24)
//
// Respeitar o "não quero mais receber" é prioridade máxima — opt-out é MELHOR
// que bloqueio (bloqueio derruba a qualidade do número que a igreja toda usa).
// Determinístico (sem LLM): pega tanto o texto digitado quanto o payload do
// botão "Não quero mais receber" que vier nos templates da Meta.
//
// Desliga a pessoa nos DOIS lugares onde ela pode estar:
//   - mem_membros.whatsapp_optin      (destinatário de Marketing/avisos)
//   - whatsapp_lideres.recebe_lembretes (líder · chamada/renovação/material)
// Casa por telefone (últimos 8 dígitos · robusto a formatação/DDI/9).
// ============================================================================
const { supabase } = require('../utils/supabase');

const digits = (t) => String(t || '').replace(/\D/g, '');
const tel8 = (t) => digits(t).slice(-8);

// Detecta a intenção a partir do texto/rótulo de botão. Retorna 'out' | 'in' | null.
// Curto de propósito (comando/tap) + palavras inequívocas. NÃO usa "cancelar"
// (colide com o cancelamento da sessão de nota fiscal do webhook).
function intencaoOptOut(bruto, { deBotao = false } = {}) {
  const n = String(bruto || '').toLowerCase().trim();
  if (!n) return null;
  // Frases inequívocas valem em QUALQUER tamanho (não pegam relato de grupo).
  if (/n[aã]o quero (mais )?(receber|mensagens|msgs?)/.test(n) || /parar de receber/.test(n)) return 'out';
  if (/voltar a receber/.test(n)) return 'in';
  // Comandos curtos (1-2 palavras) ou botão: exigem mensagem curta pra não
  // pegar frase que por acaso começa com a palavra (ex.: "Parar tudo no grupo").
  const curto = deBotao || n.length <= 24;
  if (curto) {
    if (/^(sair|parar|pare|stop|descadastrar|remover|desinscrever)\b/.test(n)) return 'out';
    if (/^(voltar|quero receber)\b/.test(n)) return 'in';
  }
  return null;
}

// Aplica o opt-out (ligar=false) ou opt-in (ligar=true) pra um telefone.
// `ligar` opt-out → busca só quem está LIGADO agora (conjunto pequeno);
// opt-in → busca só quem se desligou antes (whatsapp_optin=false). Assim o
// scan é barato mesmo com a base grande.
async function aplicarOptOut({ telefone, ligar = false }) {
  const chave = tel8(telefone);
  if (!chave || chave.length < 8) return { afetados: 0 };
  let afetados = 0;

  // Membros
  try {
    const { data: mems } = await supabase.from('mem_membros')
      .select('id, telefone').eq('whatsapp_optin', !ligar).is('deleted_at', null).limit(5000);
    const alvo = (mems || []).filter(m => tel8(m.telefone) === chave);
    for (const m of alvo) {
      await supabase.from('mem_membros')
        .update({ whatsapp_optin: ligar, whatsapp_optin_em: ligar ? new Date().toISOString() : null })
        .eq('id', m.id);
      afetados++;
    }
  } catch (e) { console.warn('[optout] membros:', e.message); }

  // Inscrições (2026-07-31): `inscricaoWhatsapp` gateia pelo opt-in da PRÓPRIA
  // INSCRIÇÃO (`inscricoes.whatsapp_optin`), não pelo do membro — a maioria dos
  // inscritos nem tem cadastro. Sem desligar aqui, quem responde SAIR continuava
  // recebendo comprovante/confirmação de evento: opt-out pela metade.
  // Só as inscrições ATIVAS (cancelada não recebe nada de qualquer forma).
  try {
    const { data: insc } = await supabase.from('inscricoes')
      .select('id, telefone').eq('whatsapp_optin', !ligar)
      .neq('status', 'cancelada').is('deleted_at', null).limit(5000);
    const alvoI = (insc || []).filter((i) => tel8(i.telefone) === chave);
    for (const i of alvoI) {
      await supabase.from('inscricoes')
        .update({ whatsapp_optin: ligar, whatsapp_optin_em: ligar ? new Date().toISOString() : null })
        .eq('id', i.id);
      afetados++;
    }
  } catch (e) { console.warn('[optout] inscricoes:', e.message); }

  // Líderes (tabela pequena · varre e casa por telefone)
  try {
    const { data: lids } = await supabase.from('whatsapp_lideres')
      .select('id, telefone, recebe_lembretes').is('deleted_at', null).limit(5000);
    const alvoL = (lids || []).filter(l => tel8(l.telefone) === chave && l.recebe_lembretes !== ligar);
    for (const l of alvoL) {
      await supabase.from('whatsapp_lideres').update({ recebe_lembretes: ligar }).eq('id', l.id);
      afetados++;
    }
  } catch (e) { console.warn('[optout] lideres:', e.message); }

  return { afetados };
}

module.exports = { intencaoOptOut, aplicarOptOut };
