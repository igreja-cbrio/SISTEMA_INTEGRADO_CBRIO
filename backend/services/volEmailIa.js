// IA do composer de e-mails do voluntariado · gera ou melhora assunto + corpo.
//
// Saída por TAGS (<ASSUNTO>/<HTML>) em vez de JSON — HTML dentro de JSON quebra
// o JSON.parse (mesmo truque do apresentacaoGenerator.js). Modelo Sonnet com
// fallback pra Haiku quando o ID não é reconhecido pela SDK em prod.

const Anthropic = require('@anthropic-ai/sdk');

const MODELOS = [
  process.env.VOL_EMAIL_IA_MODEL, // override manual (env)
  'claude-sonnet-4-6',
  'claude-sonnet-4-5',
  'claude-haiku-4-5-20251001',
].filter(Boolean);

function clienteAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY não configurada');
  }
  return new Anthropic();
}

function isModelError(e) {
  const msg = String(e?.message || '').toLowerCase();
  return e?.status === 404 || msg.includes('model') && (msg.includes('not_found') || msg.includes('not found') || msg.includes('invalid'));
}

function extractTag(text, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

const SYSTEM = `Você escreve e-mails para os voluntários da CBRio (Igreja Central Barra, Rio de Janeiro) em nome da coordenação de voluntários.

REGRAS DE CONTEÚDO:
- Português brasileiro com acentuação correta. Tom caloroso, direto e respeitoso — comunicação interna de igreja, sem formalidade excessiva.
- Comece a saudação usando o placeholder {{nome}} (será trocado pelo primeiro nome de cada voluntário). Ex.: "Olá, {{nome}}!".
- Seja objetivo: o voluntário precisa entender em segundos o que é, quando é e o que fazer.
- Nunca invente datas, horários, locais ou links que não estejam no briefing. Se faltar informação essencial, escreva um marcador claro como [DEFINIR HORÁRIO].

REGRAS DE HTML (e-mail · compatível com Outlook/Gmail):
- Use SOMENTE as tags: <p>, <h2>, <h3>, <strong>, <em>, <a>, <ul>, <ol>, <li>, <br>, <img>.
- Estilos apenas inline e simples (ex.: <a style="color:#00B39D">). Sem <style>, sem CSS externo, sem <script>, sem atributos de evento.
- Não inclua <html>, <head> ou <body> — apenas o corpo interno (o sistema envolve num template próprio).
- Se o briefing pedir um botão, use um link: <a href="URL" style="background:#00B39D;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Texto</a>.

FORMATO DA RESPOSTA (obrigatório · sem markdown, sem cercas de código):
<ASSUNTO>assunto curto e claro do e-mail</ASSUNTO>
<HTML>corpo em HTML</HTML>`;

// {objetivo, tom?, corpo_atual?} → {assunto, corpo_html, modelo}
async function gerarEmail({ objetivo, tom, corpo_atual }) {
  if (!objetivo || objetivo.trim().length < 5) {
    throw new Error('Descreva o objetivo do e-mail (o que precisa ser comunicado)');
  }

  const partes = [`Briefing do e-mail: ${objetivo.trim()}`];
  if (tom?.trim()) partes.push(`Tom desejado: ${tom.trim()}`);
  if (corpo_atual?.trim()) {
    partes.push(`O e-mail abaixo já foi escrito. MELHORE este texto (clareza, tom, estrutura) mantendo as informações — não reescreva do zero nem invente conteúdo novo:\n\n${corpo_atual.trim().slice(0, 8000)}`);
  }
  const userMsg = partes.join('\n\n');

  const client = clienteAnthropic();
  let ultimaFalha = null;
  for (const modelo of MODELOS) {
    try {
      const response = await client.messages.create({
        model: modelo,
        max_tokens: 2000,
        system: SYSTEM,
        messages: [{ role: 'user', content: userMsg }],
      });
      const raw = response.content?.filter((b) => b.type === 'text').map((b) => b.text).join('') || '';
      const cleaned = raw.replace(/^```(?:html|xml)?\s*/i, '').replace(/```\s*$/i, '').trim();
      const assunto = extractTag(cleaned, 'ASSUNTO');
      const corpoHtml = extractTag(cleaned, 'HTML');
      if (!corpoHtml) throw new Error('IA não retornou o corpo no formato esperado');
      return { assunto: assunto || '', corpo_html: corpoHtml, modelo };
    } catch (e) {
      if (isModelError(e)) { ultimaFalha = e; continue; }
      throw e;
    }
  }
  throw ultimaFalha || new Error('Nenhum modelo disponível');
}

module.exports = { gerarEmail };
