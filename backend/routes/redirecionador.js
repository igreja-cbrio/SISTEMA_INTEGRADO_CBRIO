// ════════════════════════════════════════════════════════════════════════════
//  cbrio.org/r/<slug> → onde quer que o destino esteja hoje
//
//  Esta rota é o motivo de a feature existir. Ela precisa ser a coisa mais
//  rápida e mais burra do sistema: alguém está com o celular apontado para um
//  cartaz, no meio de um culto, e cada milissegundo aqui é tempo de câmera
//  parada.
//
//  Decisões que vêm disso:
//
//   · UMA consulta ao banco antes do redirect. Nada mais. A contagem de acesso
//     acontece DEPOIS de a resposta já ter saído — quem escaneou não espera por
//     estatística.
//   · Cache curto na borda (30s). O culto inteiro escaneia o mesmo QR nos mesmos
//     dois minutos; sem cache, são 2.500 idas ao banco pela mesma linha. Curto
//     porque o destino pode mudar a qualquer momento e meia hora de cache
//     transformaria "mudei o link" em "mudei o link e ninguém viu".
//   · 302, nunca 301. O 301 é PERMANENTE: o navegador guarda para sempre e
//     nunca mais pergunta. Num redirecionador cujo objetivo é mudar de destino,
//     301 é a única coisa que quebraria a feature inteira, e quebraria de um
//     jeito que não dá para consertar do servidor.
//   · Slug desligado ou inexistente devolve uma PÁGINA, não um 404 cru. Quem
//     escaneou está com um papel na mão e merece saber o que aconteceu.
// ════════════════════════════════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const { supabase } = require('../utils/supabase');

/** 'celular' | 'computador' | 'outro'. Deriva do user-agent e joga o resto
 *  fora: para saber qual cartaz funciona basta isso, e o UA cru é rastro. */
function aparelhoDe(ua) {
  const s = String(ua || '').toLowerCase();
  if (!s) return 'outro';
  if (/iphone|android|ipad|mobile/.test(s)) return 'celular';
  if (/windows|macintosh|linux|cros/.test(s)) return 'computador';
  return 'outro';
}

/** Só o domínio de onde veio — nunca a URL inteira, que pode carregar dados de
 *  quem clicou. Ausente na maioria dos leitores de QR, e tudo bem. */
function origemDe(referer) {
  try { return new URL(String(referer)).hostname.slice(0, 120) || null; }
  catch { return null; }
}

function pagina(titulo, mensagem) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo}</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#eef2f1;color:#1a1a1a;font-family:system-ui,-apple-system,sans-serif;padding:24px}
  .c{max-width:420px;text-align:center}
  h1{font-size:19px;margin:0 0 10px}
  p{font-size:15px;line-height:1.5;color:#555;margin:0}
  a{color:#0d9488;text-decoration:none;font-weight:500;display:inline-block;margin-top:18px}
</style></head><body><div class="c">
<h1>${titulo}</h1><p>${mensagem}</p>
<a href="https://www.cbrio.org">Ir para o site da CBRio</a>
</div></body></html>`;
}

router.get('/:slug', async (req, res) => {
  const slug = String(req.params.slug || '').toLowerCase().slice(0, 60);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    return res.status(404).type('html').send(pagina(
      'Link não encontrado',
      'Esse endereço não existe. Confira se o código foi digitado corretamente.',
    ));
  }

  try {
    const { data, error } = await supabase
      .from('link_curto').select('id, destino, ativo, titulo')
      .eq('slug', slug).is('deleted_at', null).maybeSingle();
    if (error) throw error;

    if (!data) {
      return res.status(404).type('html').send(pagina(
        'Link não encontrado',
        'Esse QR code não está mais ativo no nosso sistema. Se ele estava num cartaz ou impresso, avise a equipe da CBRio.',
      ));
    }
    if (!data.ativo) {
      // Desligado é diferente de inexistente, e a pessoa merece saber a
      // diferença: um está fora do ar de propósito, o outro nunca existiu.
      return res.status(410).type('html').send(pagina(
        'Esse link foi desativado',
        `${data.titulo ? `"${data.titulo}" não` : 'Este link não'} está mais no ar. Se você chegou por um material impresso, ele provavelmente já passou.`,
      ));
    }

    // 302 + cache curto na borda. `private` não: queremos que a CDN sirva o
    // culto inteiro sem tocar no banco.
    res.set('Cache-Control', 'public, max-age=0, s-maxage=30');
    res.redirect(302, data.destino);

    // Contagem depois do redirect: a resposta já foi. Se falhar, perdemos uma
    // linha de estatística — nunca um escaneamento.
    supabase.from('link_curto_acesso').insert({
      link_id: data.id,
      aparelho: aparelhoDe(req.get('user-agent')),
      origem: origemDe(req.get('referer')),
    }).then(() => {}, () => {});
  } catch {
    // Banco fora do ar não pode virar tela branca para quem escaneou.
    res.status(503).type('html').send(pagina(
      'Não consegui abrir agora',
      'Tivemos um problema momentâneo. Tente escanear de novo em alguns segundos.',
    ));
  }
});

module.exports = router;
module.exports.aparelhoDe = aparelhoDe;
module.exports.origemDe = origemDe;
