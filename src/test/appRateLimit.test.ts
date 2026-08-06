import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error - módulo CJS do backend (régua pura, sem express/banco)
import { chaveLimiteApp, ehChaveAnonima, normalizarIpParaChave } from '../../backend/utils/appRateLimit.js';

// Contrato da chave de rate limit do app de membros (auditoria 06/08/2026).
// O que estes testes protegem: o teto do /api/app é POR USUÁRIO. Voltar a
// contar por IP faz 5-10 celulares no WiFi da igreja esgotarem a cota de TODOS
// — e o app traduz o 429 em "inscrições fechadas" / "líder sem permissão".
const bearer = (t: string) => ({ headers: { authorization: `Bearer ${t}` } });
const TOKEN = 'a'.repeat(60); // JWT real tem centenas de chars

describe('chaveLimiteApp · quem paga a cota', () => {
  it('usuário autenticado tem bucket próprio (não divide com o WiFi)', () => {
    const a = chaveLimiteApp({ user: { id: 'user-1' }, ip: '200.1.1.1' });
    const b = chaveLimiteApp({ user: { id: 'user-2' }, ip: '200.1.1.1' });
    expect(a).toBe('u:user-1');
    expect(b).toBe('u:user-2');
    expect(a).not.toBe(b); // MESMO IP, cotas separadas — é o ponto do conserto
    expect(ehChaveAnonima(a)).toBe(false);
  });

  it('req.user vence o token: rota com authApp antes do limiter usa o id', () => {
    const chave = chaveLimiteApp({ user: { id: 'user-1' }, ...bearer(TOKEN) });
    expect(chave).toBe('u:user-1');
  });

  it('limiter ANTES do authApp cai no hash do Bearer, não no IP', () => {
    // É a ordem real de /membro/vincular e /inscricoes: sem isto, essas duas
    // rotas continuariam contando por IP (o furo, só que em 2 rotas).
    const chave = chaveLimiteApp({ ...bearer(TOKEN), ip: '200.1.1.1' });
    expect(chave.startsWith('t:')).toBe(true);
    expect(ehChaveAnonima(chave)).toBe(false);
  });

  it('o mesmo token dá a mesma chave, e tokens diferentes dão chaves diferentes', () => {
    expect(chaveLimiteApp(bearer(TOKEN))).toBe(chaveLimiteApp(bearer(TOKEN)));
    expect(chaveLimiteApp(bearer(TOKEN))).not.toBe(chaveLimiteApp(bearer('b'.repeat(60))));
  });

  it('NÃO guarda o JWT na chave (ela é hash curto)', () => {
    const chave = chaveLimiteApp(bearer(TOKEN));
    expect(chave).not.toContain(TOKEN);
    expect(chave.length).toBeLessThanOrEqual(34); // 't:' + 32 hex
  });

  it('token curto/inventado NÃO cria bucket próprio — volta pro IP', () => {
    // Senão qualquer cliente escaparia do teto anônimo mandando "Bearer x".
    const chave = chaveLimiteApp({ ...bearer('xxx'), ip: '200.1.1.1' });
    expect(ehChaveAnonima(chave)).toBe(true);
    expect(chave).toBe('ip:200.1.1.1');
  });

  it('anônimo de verdade usa IP e é marcado como anônimo (paga o teto alto)', () => {
    const chave = chaveLimiteApp({ ip: '200.1.1.1' });
    expect(chave).toBe('ip:200.1.1.1');
    expect(ehChaveAnonima(chave)).toBe(true);
  });

  it('normalizador injetado é respeitado (usado só em teste)', () => {
    const chave = chaveLimiteApp({ ip: '2001:db8::1' }, () => 'X');
    expect(chave).toBe('ip:X');
  });

  it('IPv6 já vem normalizado por PADRÃO, sem normalizador injetado', () => {
    // ⚠️ É este caso que quebrou produção em 06/08: o default dependia do
    // `ipKeyGenerator` do express-rate-limit, que não existe no build CJS
    // (Node 22 do Vercel). Sem default próprio, o ramo anônimo dava 500.
    expect(chaveLimiteApp({ ip: '2001:db8::1' })).toBe('ip:2001:db8:0:0::/64');
    expect(chaveLimiteApp({ ip: '200.1.1.1' })).toBe('ip:200.1.1.1');
  });
});

describe('normalizarIpParaChave · agrupamento de IPv6 por /64', () => {
  it('dois endereços da MESMA /64 caem na mesma chave', () => {
    // Senão trocar de endereço dentro de casa daria bucket novo, e o teto
    // anônimo não valeria nada.
    const a = normalizarIpParaChave('2001:db8:85a3:1::1');
    const b = normalizarIpParaChave('2001:db8:85a3:1::beef');
    expect(a).toBe(b);
  });

  it('/64 diferentes NÃO se misturam', () => {
    expect(normalizarIpParaChave('2001:db8:85a3:1::1'))
      .not.toBe(normalizarIpParaChave('2001:db8:85a3:2::1'));
  });

  it('IPv4 passa intacto e IPv4-mapeado volta a IPv4', () => {
    expect(normalizarIpParaChave('200.1.1.1')).toBe('200.1.1.1');
    expect(normalizarIpParaChave('::ffff:200.1.1.1')).toBe('200.1.1.1');
  });

  it('tolera zona de interface e caixa alta', () => {
    expect(normalizarIpParaChave('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
    expect(normalizarIpParaChave('2001:DB8::1')).toBe(normalizarIpParaChave('2001:db8::1'));
  });

  it('IP vazio/nulo não quebra (vira "desconhecido")', () => {
    expect(normalizarIpParaChave('')).toBe('desconhecido');
    expect(normalizarIpParaChave(null)).toBe('desconhecido');
    expect(normalizarIpParaChave(undefined)).toBe('desconhecido');
  });

  it('lixo que não é IP volta como veio, sem lançar', () => {
    expect(() => normalizarIpParaChave('nao-e-ip:::x')).not.toThrow();
  });
});

// ⚠️⚠️ GUARDA DO INCIDENTE DE 06/08/2026 — a classe de bug que teste de unidade
// não pega sozinho, porque o teste roda com a dependência ERRADA.
//
// `backend/` tem árvore de dependências PRÓPRIA em produção: o `vercel.json` faz
// `installCommand: "npm install && cd backend && npm install"`. O
// `backend/package.json` pina express-rate-limit `^7.4.0` (lock 7.5.1) e a RAIZ
// tem 8.3.2 — e `ipKeyGenerator` só existe na 8.x. Como o `backend/node_modules`
// costuma estar VAZIO nas worktrees, o Node sobe pra raiz e o teste local
// exercita 8.3.2: verde aqui, `ipKeyGenerator is not a function` (500) lá.
//
// Régua: conferir versão de dependência em `backend/package.json`, nunca na raiz.
describe('guarda · não depender de export nomeado do express-rate-limit', () => {
  // ⚠️ Tira comentários antes de casar: os dois arquivos DOCUMENTAM o import
  // errado como exemplo do que não fazer, e a guarda tem que olhar o código —
  // senão a própria explicação do incidente derruba o gate (aconteceu).
  const semComentarios = (codigo: string) =>
    codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const fonte = (rel: string) =>
    semComentarios(readFileSync(resolve(__dirname, '../../', rel), 'utf8'));

  it('nem o router do app nem a régua importam nomeados do pacote', () => {
    for (const arquivo of ['backend/routes/app.js', 'backend/utils/appRateLimit.js']) {
      const codigo = fonte(arquivo);
      expect(codigo, `${arquivo} não pode desestruturar require('express-rate-limit')`)
        .not.toMatch(/(?:const|let|var)\s*\{[^}]*\}\s*=\s*require\(\s*['"]express-rate-limit['"]/);
      expect(codigo, `${arquivo} não pode usar ipKeyGenerator do pacote`)
        .not.toMatch(/\bipKeyGenerator\s*\(/);
    }
  });

  it('o backend tem express-rate-limit PRÓPRIO — a versão da raiz não vale', () => {
    // É este fato que causou o incidente: em produção `backend/routes/app.js`
    // carrega o pacote de `backend/node_modules`, não o da raiz. Se alguém
    // remover a dependência do backend (passando a depender da raiz), este
    // teste falha e a pessoa lê o porquê aqui em vez de descobrir em produção.
    const pkgBackend = JSON.parse(
      readFileSync(resolve(__dirname, '../../backend/package.json'), 'utf8'),
    );
    const pkgRaiz = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8'));
    const vBackend = pkgBackend.dependencies?.['express-rate-limit'];
    const vRaiz = pkgRaiz.dependencies?.['express-rate-limit'];
    expect(vBackend, 'backend/package.json precisa declarar express-rate-limit').toBeTruthy();
    // O major do backend é o que manda em produção. Documentado: hoje 7 × 8.
    expect(String(vBackend).replace(/[^\d]*(\d+).*/, '$1')).toBe('7');
    expect(String(vRaiz).replace(/[^\d]*(\d+).*/, '$1')).toBe('8');
  });

  it('requisição sem IP e sem token não quebra a montagem da chave', () => {
    expect(chaveLimiteApp({})).toBe('ip:desconhecido');
    expect(chaveLimiteApp(undefined as never)).toBe('ip:desconhecido');
  });

  it('aceita "bearer" em caixa baixa (cliente que monta o header na mão)', () => {
    const chave = chaveLimiteApp({ headers: { authorization: `bearer ${TOKEN}` }, ip: '1.1.1.1' });
    expect(chave.startsWith('t:')).toBe(true);
  });
});
