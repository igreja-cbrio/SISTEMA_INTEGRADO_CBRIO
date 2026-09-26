import { beforeEach, describe, expect, it } from 'vitest';
import { beginCampusSession, createCampusRequest, getCampusHeader, isCampusSessionReady } from '../lib/campusSession';

beforeEach(() => beginCampusSession(null, null));
describe('transporte por campus', () => {
  it('não envia campus antes da validação do contexto', () => {
    beginCampusSession('usuario', 'sede');
    expect(getCampusHeader()).toEqual({});
    expect(isCampusSessionReady()).toBe(false);
    beginCampusSession('usuario', 'sede', true);
    expect(getCampusHeader()).toEqual({ 'X-Campus-Id': 'sede' });
  });
  it('cancela a requisição e rejeita a resposta antiga ao trocar o campus', () => {
    beginCampusSession('usuario', 'sede', true);
    const previous = createCampusRequest();
    beginCampusSession('usuario', 'outro', true);
    expect(previous.signal.aborted).toBe(true);
    expect(() => previous.assertCurrent()).toThrow('O campus mudou');
    const current = createCampusRequest();
    expect(() => current.assertCurrent()).not.toThrow();
    current.release();
  });
  it('também invalida ao trocar de usuário no mesmo campus', () => {
    beginCampusSession('um', 'sede', true);
    const previous = createCampusRequest();
    beginCampusSession('dois', 'sede', true);
    expect(() => previous.assertCurrent()).toThrow();
  });
});
