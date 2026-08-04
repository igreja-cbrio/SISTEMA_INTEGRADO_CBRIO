import { describe, expect, it } from 'vitest';
import { sanitizeEvent, sanitizeRoute } from './sentry';

describe('observabilidade frontend', () => {
  it('remove query strings e identificadores sensíveis das rotas', () => {
    expect(sanitizeRoute('/api/pessoas/12345678901?token=segredo')).toBe('/api/pessoas/:id');
    expect(sanitizeRoute('/api/item/123e4567-e89b-12d3-a456-426614174000')).toBe('/api/item/:id');
    expect(sanitizeRoute('/api/pessoas/marcos%40cbrio.org')).toBe('/api/pessoas/:value');
    expect(sanitizeRoute('/api/pessoas/marcos@cbrio.org')).toBe('/api/pessoas/:value');
  });

  it('remove PII, payloads e credenciais do evento', () => {
    const event = sanitizeEvent({
      message: 'Falha para pessoa@cbrio.org CPF 123.456.789-09 token=segredo',
      user: { email: 'pessoa@cbrio.org' },
      extra: { payload: 'privado' },
      request: {
        url: '/api/pessoas/12345678901?token=segredo',
        data: { cpf: '12345678901' },
        query_string: 'token=segredo',
        cookies: { session: 'x' },
        headers: { Authorization: 'Bearer abc.def', Cookie: 'session=x' },
      },
      breadcrumbs: [{
        message: 'senha=supersecreta',
        data: { url: '/api/item/12345678901?cpf=123', body: { cpf: '123' } },
      }],
    });

    expect(event.user).toBeUndefined();
    expect(event.extra).toBeUndefined();
    expect(event.message).not.toContain('pessoa@cbrio.org');
    expect(event.message).not.toContain('123.456.789-09');
    expect(event.request.url).toBe('/api/pessoas/:id');
    expect(event.request.data).toBeUndefined();
    expect(event.request.headers.Authorization).toBeUndefined();
    expect(event.breadcrumbs[0].data.body).toBeUndefined();
    expect(event.breadcrumbs[0].data.url).toBe('/api/item/:id');
  });
});
