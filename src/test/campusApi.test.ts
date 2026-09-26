import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ session: vi.fn(), report: vi.fn() }));
vi.mock('../supabaseClient', () => ({ supabase: { auth: { getSession: mocks.session, onAuthStateChange: vi.fn(), signOut: vi.fn() } } }));
vi.mock('../lib/sentry', () => ({ captureApiError: mocks.report }));
function deferred<T>() { let resolve: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve: (value: T) => resolve(value) }; }
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
let api: typeof import('../api');
let session: typeof import('../lib/campusSession');
beforeEach(async () => {
  vi.resetModules();
  mocks.session.mockResolvedValue({ data: { session: { access_token: 'test-token' } } });
  api = await import('../api');
  session = await import('../lib/campusSession');
  session.beginCampusSession('usuario', 'sede', true);
});
afterEach(() => { session.beginCampusSession(null, null); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('API com contexto de campus', () => {
  it('envia o campus validado nas chamadas comuns', async () => {
    const fetcher = vi.fn().mockResolvedValue(json([])); vi.stubGlobal('fetch', fetcher);
    await api.face.cultos();
    expect(fetcher.mock.calls[0][1].headers['X-Campus-Id']).toBe('sede');
  });
  it('não envia o campus privado para uma porta pública', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({})); vi.stubGlobal('fetch', fetcher);
    await api.onboardingPublico.get('token-publico');
    expect(fetcher.mock.calls[0][1].headers['X-Campus-Id']).toBeUndefined();
  });
  it('descarta resposta que terminou de ler o JSON depois da troca, sem telemetria falsa', async () => {
    const body = deferred<unknown>();
    const response = json({}); vi.spyOn(response, 'json').mockReturnValue(body.promise);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const request = api.face.cultos();
    await vi.waitFor(() => expect(response.json).toHaveBeenCalled());
    session.beginCampusSession('usuario', 'outro', true);
    body.resolve({ segredo: 'campus-anterior' });
    await expect(request).rejects.toMatchObject({ code: 'CAMPUS_CONTEXT_CHANGED' });
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it('descarta antes de enviar quando troca durante a obtenção do token', async () => {
    vi.resetModules();
    const token = deferred<unknown>(); mocks.session.mockReturnValue(token.promise);
    api = await import('../api'); session = await import('../lib/campusSession');
    session.beginCampusSession('usuario', 'sede', true);
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const request = api.face.cultos();
    session.beginCampusSession('usuario', 'outro', true);
    token.resolve({ data: { session: { access_token: 'novo-token' } } });
    await expect(request).rejects.toMatchObject({ code: 'CAMPUS_CONTEXT_CHANGED' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('envia o campus em upload sem definir boundary manualmente', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({})); vi.stubGlobal('fetch', fetcher);
    await api.attachments.upload('evento', 'tarefa', new FormData());
    const options = fetcher.mock.calls[0][1];
    expect(options.headers['X-Campus-Id']).toBe('sede');
    expect(options.headers['Content-Type']).toBeUndefined();
  });
  it('descarta upload antigo, em vez de transformá-lo em erro de JSON', async () => {
    const body = deferred<unknown>(); const response = json({});
    vi.spyOn(response, 'json').mockReturnValue(body.promise);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const request = api.attachments.upload('evento', 'tarefa', new FormData());
    await vi.waitFor(() => expect(response.json).toHaveBeenCalled());
    session.beginCampusSession('usuario', 'outro', true); body.resolve({});
    await expect(request).rejects.toMatchObject({ code: 'CAMPUS_CONTEXT_CHANGED' });
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it('propaga o campus ao streaming e cancela a leitura ao trocar', async () => {
    let source: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({ start(controller) { source = controller; } });
    const fetcher = vi.fn().mockResolvedValue(new Response(stream)); vi.stubGlobal('fetch', fetcher);
    const response = await api.agents.chat({ message: 'Olá', module: 'grupos', sessionId: null });
    expect(fetcher.mock.calls[0][1].headers['X-Campus-Id']).toBe('sede');
    const reader = response.body!.getReader(); const read = reader.read();
    session.beginCampusSession('usuario', 'outro', true);
    source.enqueue(new TextEncoder().encode('dados antigos'));
    await expect(read).rejects.toMatchObject({ code: 'CAMPUS_CONTEXT_CHANGED' });
  });
});
