import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ user: { id: 'usuario-um' }, session: vi.fn() }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, loading: false }) }));
vi.mock('../supabaseClient', () => ({ supabase: { auth: { getSession: mocks.session } } }));
import { CampusBoundary, CampusProvider, useCampus, validateCampusConfiguration } from '../contexts/CampusContext';
import { getCampusHeader } from '../lib/campusSession';

const a = { id: 'sede', nome: 'Sede', slug: 'sede', tipo: 'sede' };
const b = { id: 'outro', nome: 'Campus 2', slug: 'outro', tipo: 'sede' };
const config = (id: string | null = 'sede') => ({ estado: 'ensaio', campus_legado_id: 'sede', campi: [a, b], campus_id: id, consolidado_permitido: false });
const response = (body: unknown, status = 200) => ({ ok: status === 200, status, json: async () => body }) as Response;
function Page() {
  const campus = useCampus();
  return <><span>Dados {campus.contexto?.campus_id}</span><button onClick={() => void campus.trocarCampus('outro')}>Trocar</button></>;
}
const Tree = () => <CampusProvider><CampusBoundary><Page /></CampusBoundary></CampusProvider>;
beforeEach(() => {
  sessionStorage.clear();
  mocks.user = { id: 'usuario-um' };
  mocks.session.mockResolvedValue({ data: { session: { access_token: 'token' } } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('contexto e barreira de campus', () => {
  it('esconde os dados anteriores durante a troca e espera a validação do servidor', async () => {
    let resolve: (value: Response) => void;
    const fetcher = vi.fn().mockResolvedValueOnce(response(config())).mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
    vi.stubGlobal('fetch', fetcher);
    render(<Tree />);
    await screen.findByText('Dados sede');
    fireEvent.click(screen.getByText('Trocar'));
    expect(screen.queryByText('Dados sede')).toBeNull();
    expect(getCampusHeader()).toEqual({});
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    await act(async () => resolve(response(config('outro'))));
    await screen.findByText('Dados outro');
    expect(getCampusHeader()).toEqual({ 'X-Campus-Id': 'outro' });
  });
  it('falha fechado e não recupera os dados antigos quando o servidor nega o campus', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(config())).mockResolvedValueOnce(response({ error: 'Campus não autorizado.' }, 403)));
    render(<Tree />);
    await screen.findByText('Dados sede');
    fireEvent.click(screen.getByText('Trocar'));
    await screen.findByRole('alert');
    expect(screen.queryByText('Dados sede')).toBeNull();
    expect(getCampusHeader()).toEqual({});
  });
  it('pede escolha quando há vários campi sem seleção', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(config(null))));
    render(<Tree />);
    await screen.findByText('Escolha o campus para continuar.');
    expect(screen.queryByText('Dados sede')).toBeNull();
    expect(screen.getByRole('button', { name: 'Campus 2' })).toBeTruthy();
  });
  it('não aceita campus escolhido que não esteja na lista permitida', () => {
    expect(() => validateCampusConfiguration({ ...config(), campus_id: 'intruso' })).toThrow('inválido');
  });
  it('não aceita ativar outro campus em preparação', () => {
    expect(() => validateCampusConfiguration({ ...config('outro'), estado: 'preparacao' })).toThrow('inválido');
  });
  it('não mostra o contexto de outro usuário enquanto o novo carrega', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(config())).mockImplementationOnce(() => new Promise(() => {})));
    const view = render(<Tree />);
    await screen.findByText('Dados sede');
    mocks.user = { id: 'usuario-dois' };
    view.rerender(<Tree />);
    expect(screen.queryByText('Dados sede')).toBeNull();
    expect(getCampusHeader()).toEqual({});
  });
});
