import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { semComentariosJs } from './_semComentarios';

/**
 * Guarda do REM-02 da auditoria do banco — e do que ele revelou.
 *
 * ⚠️⚠️ `supabase.auth.admin.generateLink()` NÃO MANDA E-MAIL. Ele GERA o link e
 * devolve em `data.properties.action_link`; o envio é de quem chama. Quem
 * escreve `const { error } = await ...generateLink(...)` está jogando o link
 * fora e, logo abaixo, logando "Magic link enviado" e devolvendo 200. Quebra em
 * silêncio, dos dois lados: o servidor acha que enviou e a tela diz que enviou.
 *
 * Foi assim que a porta do devocional ficou anos sem entregar nada. Aquela rota
 * foi REMOVIDA (as telas web do devocional não existem mais), mas o padrão
 * sobreviveu em portas VIVAS — por isso esta guarda não é do arquivo, é do
 * REPO: nenhum arquivo NOVO pode entrar na lista dos que descartam o link.
 *
 * ⚠️ A lista encolhe, nunca cresce. Consertar um ponto (pegar o `action_link` e
 * mandar por `services/email.js`, ou trocar por `signInWithOtp`, que envia)
 * mantém o teste verde. Abrir um ponto novo derruba o gate.
 */

const DIR = resolve(__dirname, '../../backend/routes');

/**
 * Pontos conhecidos que geram link e NÃO enviam — inventário de 16/09/2026,
 * levantado quando o REM-02 foi fechado. Cada um é uma porta que diz à pessoa
 * "enviamos um link" sem enviar nada:
 *
 *  · `publicVoluntariado.js` (2 pontos) — o login do AUTO CHECK-IN do
 *    voluntário e o cadastro novo. A tela `/voluntariado/self-checkin` existe e
 *    é chamada; o e-mail nunca chega.
 *  · `publicMembresia.js` (1 ponto) — a conta criada pela porta pública. O
 *    comentário do PUB-01 diz que "a ENTRADA passa a ser o link no e-mail", e
 *    ela não passa.
 *
 * Decisão de produto pendente do Marcos (implementar o envio muda o que pessoas
 * reais recebem), por isso estão listados em vez de consertados.
 */
const DESCARTAM_O_LINK = new Set(['publicVoluntariado.js', 'publicMembresia.js']);

function arquivosDeRota(): string[] {
  return readdirSync(DIR).filter((f) => f.endsWith('.js'));
}

/** Um ponto de chamada por ocorrência, com o trecho que precede a chamada. */
function chamadas(src: string): string[] {
  const fora: string[] = [];
  const marca = 'auth.admin.generateLink';
  let i = src.indexOf(marca);
  while (i !== -1) {
    // A linha da atribuição começa no `const` mais próximo antes da chamada.
    const ini = src.lastIndexOf('const', i);
    fora.push(src.slice(ini === -1 ? Math.max(0, i - 200) : ini, i));
    i = src.indexOf(marca, i + marca.length);
  }
  return fora;
}

/** Descarta o link = desestrutura SÓ o `error`, sem pegar o `data`. */
function descartaOLink(trecho: string): boolean {
  return !/\{\s*data\b/.test(trecho);
}

describe('magic link · quem gera tem que enviar', () => {
  it('nenhum arquivo NOVO gera link e joga fora', () => {
    const novos: string[] = [];

    for (const arq of arquivosDeRota()) {
      const src = semComentariosJs(readFileSync(resolve(DIR, arq), 'utf8'));
      const pontos = chamadas(src).filter(descartaOLink);
      if (pontos.length && !DESCARTAM_O_LINK.has(arq)) novos.push(`${arq} (${pontos.length})`);
    }

    expect(
      novos,
      'ponto novo gerando magic link sem enviar — `generateLink` devolve o link em `data.properties.action_link` e NÃO manda e-mail; use `services/email.js` ou `signInWithOtp`',
    ).toEqual([]);
  });

  it('a porta do devocional não gera mais link nenhum', () => {
    const src = semComentariosJs(readFileSync(resolve(DIR, 'publicDevocional.js'), 'utf8'));
    expect(
      src.includes('generateLink'),
      'o login por magic link do devocional voltou — as telas web dele não existem mais (`/devocional` renderiza DevocionalMovido) e a rota criava auth user + profile a partir de uma chamada pública',
    ).toBe(false);
    expect(src.includes("router.post(")).toBe(false);
  });
});
