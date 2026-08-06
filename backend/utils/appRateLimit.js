/**
 * Régua PURA do rate limit do app de membros (auditoria 06/08/2026).
 *
 * ⚠️⚠️ O LIMITE DO APP É POR USUÁRIO, NÃO POR IP — e é isso que este arquivo
 * decide. Vive em `utils/` (sem express, sem banco, sem rede) porque é régua
 * que entra no gate de deploy: mudá-la sem alguém perceber é reabrir o furo.
 *
 * O que isto conserta: no WiFi da igreja TODO celular sai pelo MESMO IP público
 * (NAT) e UMA abertura do app gasta 10-30 requisições. Com o teto por IP, 5 a
 * 10 aparelhos esgotavam a cota de TODOS — e com a meta de 4.000 instalações
 * (a base inteira) esse é o cenário central do lançamento. É a mesma lição do
 * totem (todos atrás de 1 NAT) e das portas públicas (multidão no culto), que
 * saíram do teto por IP em 28/07; o `/api/app` tinha ficado de fora.
 *
 * ⚠️ E o 429 não aparecia como erro de rede: o app trata a falha como resposta
 * de NEGÓCIO — `lib/temporadaGrupos.ts` devolve `aberta:false` ("inscrições
 * fechadas") e `lib/useAdminGrupo.ts` devolve `isAdmin:false` (líder sem o botão
 * de gerenciar). O limite estourado se disfarçava de regra da igreja.
 *
 * A chave sai em 3 níveis, nesta ordem:
 *   1. `u:<id>`  — `req.user.id`, quando authApp/tryAuth rodou ANTES do limiter
 *                  (é a ordem da maioria das rotas).
 *   2. `t:<hash>` — hash do Bearer, quando o limiter vem ANTES do authApp na
 *                  cadeia (caso de `/membro/vincular` e `/inscricoes`). O token
 *                  identifica a pessoa sem reordenar 67 declarações de rota, e o
 *                  hash existe pra não usar JWT como chave em memória.
 *   3. `ip:<...>` — só pro que é genuinamente anônimo (`/anuncios`, `/grupos`,
 *                  `/visitante`). Aqui o teto é generoso de propósito: continua
 *                  sendo 1 IP pra igreja inteira.
 */
const crypto = require('crypto');

const PREFIXO_ANONIMO = 'ip:';

/**
 * Expande um IPv6 em 8 hextets (resolve o `::`). `null` se não for IPv6 válido.
 */
function expandirIpv6(ip) {
  if (!/^[0-9a-fA-F:]+$/.test(ip)) return null;
  const lados = ip.split('::');
  if (lados.length > 2) return null;
  const esq = lados[0] ? lados[0].split(':').filter(Boolean) : [];
  const dir = lados.length === 2 && lados[1] ? lados[1].split(':').filter(Boolean) : [];
  if (lados.length === 1) return esq.length === 8 ? esq.map((h) => h.toLowerCase()) : null;
  const faltam = 8 - esq.length - dir.length;
  if (faltam < 0) return null;
  return [...esq, ...Array(faltam).fill('0'), ...dir].map((h) => h.toLowerCase());
}

/**
 * ⚠️⚠️ NORMALIZAÇÃO PRÓPRIA, DE PROPÓSITO — não usar o `ipKeyGenerator` do
 * express-rate-limit aqui (incidente 06/08/2026, 15:38→16:0x BRT).
 *
 * O que aconteceu: a 1ª versão deste arquivo fazia
 * `const { ipKeyGenerator } = require('express-rate-limit')`. Passou em TODOS os
 * testes locais (inclusive num smoke com express de verdade) e **quebrou em
 * produção** com `ipKeyGenerator is not a function` — 500 em
 * `/api/app/anuncios` e `/api/app/grupos`, as duas rotas ANÔNIMAS, que são as
 * únicas que chegam neste ramo. As autenticadas seguiram respondendo, e por isso
 * o estrago passou perto de ser invisível.
 *
 * ⚠️⚠️ A CAUSA, MEDIDA (e não é a que eu supus primeiro): **o backend tem
 * árvore de dependências PRÓPRIA em produção.** O `vercel.json` roda
 * `installCommand: "npm install && cd backend && npm install"`, e
 * `backend/package.json` declara `"express-rate-limit": "^7.4.0"`
 * (`backend/package-lock.json` → **7.5.1**). O `package.json` da RAIZ tem
 * **8.3.2** — e `ipKeyGenerator` só existe na 8.x. Localmente o
 * `backend/node_modules` estava vazio, então o Node subiu pra raiz e resolveu a
 * 8.3.2: o teste local exercitava uma versão que produção nunca carrega.
 *
 * ⚠️ RÉGUA QUE FICA (vale pra qualquer pacote, não só este): **conferir a
 * versão em `backend/package.json`, não na raiz**, antes de usar API nova de
 * dependência em `backend/`. Ver a versão na raiz é a armadilha.
 * Aqui a normalização é nossa: pura, sem dependência, no gate.
 *
 * Agrupa IPv6 pelo /64 (a alocação típica de um cliente): sem isso, trocar de
 * endereço dentro da própria casa daria bucket novo e o teto anônimo não valeria
 * nada. IPv4 e IPv4-mapeado ficam como estão.
 */
function normalizarIpParaChave(ip) {
  const bruto = String(ip == null ? '' : ip).trim();
  if (!bruto) return 'desconhecido';
  const semZona = bruto.split('%')[0]; // fe80::1%eth0
  if (!semZona.includes(':')) return semZona; // IPv4
  const mapeado = semZona.match(/(\d{1,3}(?:\.\d{1,3}){3})$/); // ::ffff:200.1.1.1
  if (mapeado) return mapeado[1];
  const hextets = expandirIpv6(semZona);
  return hextets ? `${hextets.slice(0, 4).join(':')}::/64` : semZona;
}

/**
 * @param {{ user?: {id?: string}, headers?: object, ip?: string }} req
 * @param {(ip: string) => string} [normalizarIp] normalizador do IP. O default é
 *   o nosso `normalizarIpParaChave`; o parâmetro existe só pra teste.
 */
function chaveLimiteApp(req, normalizarIp = normalizarIpParaChave) {
  const userId = req?.user?.id;
  if (userId) return `u:${userId}`;

  const bruto = req?.headers?.authorization;
  const token = typeof bruto === 'string' ? bruto.replace(/^Bearer\s+/i, '').trim() : '';
  // ⚠️ Comprimento mínimo: um "Bearer x" de lixo não pode virar bucket próprio,
  // senão qualquer cliente escapa do teto por IP mandando um token inventado.
  if (token.length >= 40) {
    return `t:${crypto.createHash('sha256').update(token).digest('hex').slice(0, 32)}`;
  }

  const ip = req?.ip || 'desconhecido';
  return `${PREFIXO_ANONIMO}${typeof normalizarIp === 'function' ? normalizarIp(ip) : ip}`;
}

/** Chave anônima paga o teto de IP (mais alto: é 1 IP pra congregação). */
function ehChaveAnonima(chave) {
  return String(chave || '').startsWith(PREFIXO_ANONIMO);
}

module.exports = { chaveLimiteApp, ehChaveAnonima, normalizarIpParaChave, PREFIXO_ANONIMO };
