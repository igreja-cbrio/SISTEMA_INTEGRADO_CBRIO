import { describe, it, expect } from 'vitest';
// @ts-expect-error - módulo CJS do backend (régua pura, sem express/banco)
import { chaveLimiteApp, ehChaveAnonima } from '../../backend/utils/appRateLimit.js';

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

  it('normalizador de IP é aplicado quando existe (sub-rede IPv6)', () => {
    const chave = chaveLimiteApp({ ip: '2001:db8::1' }, () => '2001:db8::/64');
    expect(chave).toBe('ip:2001:db8::/64');
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
