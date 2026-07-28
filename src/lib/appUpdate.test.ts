import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_UPDATE_CACHE_BUSTER_PARAM,
  APP_UPDATE_RETRY_PARAM,
  APP_UPDATE_RETRY_STARTED_PARAM,
  APP_UPDATE_RETRY_WINDOW_MS,
  buildAppUpdateUrl,
  getAppUpdateRetryCount,
  getCurrentEntryScript,
  getEntryScriptFromHtml,
  reloadForAppUpdate,
} from './appUpdate';

describe('appUpdate', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('preserva rota, filtros e hash ao gerar a URL de atualização', () => {
    const result = new URL(buildAppUpdateUrl(
      'https://app.exemplo.org/solicitacoes?aba=compras#pedido-10',
      { now: 1234 },
    ));

    expect(result.pathname).toBe('/solicitacoes');
    expect(result.searchParams.get('aba')).toBe('compras');
    expect(result.searchParams.get(APP_UPDATE_RETRY_PARAM)).toBe('1');
    expect(result.searchParams.get(APP_UPDATE_RETRY_STARTED_PARAM)).toBe('1234');
    expect(result.searchParams.get(APP_UPDATE_CACHE_BUSTER_PARAM)).toBe('1234');
    expect(result.hash).toBe('#pedido-10');
  });

  it('incrementa tentativas automáticas e permite reiniciar pelo botão manual', () => {
    const href = 'https://app.exemplo.org/solicitacoes?_chunk_retry=2&_chunk_retry_at=5';

    expect(getAppUpdateRetryCount(href, 10)).toBe(2);
    expect(new URL(buildAppUpdateUrl(href, { now: 10 }))
      .searchParams.get(APP_UPDATE_RETRY_PARAM)).toBe('3');
    expect(new URL(buildAppUpdateUrl(href, { resetRetries: true, now: 10 }))
      .searchParams.get(APP_UPDATE_RETRY_PARAM)).toBe('1');
  });

  it('limita as tentativas a uma janela e ignora contadores inválidos', () => {
    const expired = `https://app.exemplo.org/?_chunk_retry=3&_chunk_retry_at=10`;
    const negative = 'https://app.exemplo.org/?_chunk_retry=-999';

    expect(getAppUpdateRetryCount(expired, 10 + APP_UPDATE_RETRY_WINDOW_MS + 1)).toBe(0);
    expect(getAppUpdateRetryCount(negative, 20)).toBe(0);
  });

  it('compara o entrypoint atual com o recebido no HTML mais recente', () => {
    document.head.innerHTML = '<script type="module" src="/assets/index-antigo.js"></script>';
    const latestHtml = '<html><head><script type="module" crossorigin src="/assets/index-novo.js"></script></head></html>';

    expect(getCurrentEntryScript('https://app.exemplo.org/solicitacoes'))
      .toBe('/assets/index-antigo.js');
    expect(getEntryScriptFromHtml(latestHtml, 'https://app.exemplo.org/index.html'))
      .toBe('/assets/index-novo.js');
  });

  it('recarrega mesmo quando a limpeza do navegador fica pendurada', async () => {
    vi.useFakeTimers();
    const replace = vi.fn();
    const reloadPromise = reloadForAppUpdate(
      { resetRetries: true },
      {
        getHref: () => 'https://app.exemplo.org/solicitacoes?aba=compras#pedido-10',
        refreshCaches: () => new Promise(() => {}),
        replace,
      },
    );

    await vi.advanceTimersByTimeAsync(1200);
    await reloadPromise;

    expect(replace).toHaveBeenCalledOnce();
    const target = new URL(replace.mock.calls[0][0]);
    expect(target.pathname).toBe('/solicitacoes');
    expect(target.searchParams.get('aba')).toBe('compras');
    expect(target.hash).toBe('#pedido-10');
  });
});
