import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ estado: vi.fn(), usuarios: vi.fn(), vinculos: vi.fn(), salvarVinculos: vi.fn(), superAdmin: true }));
vi.mock('../api', () => ({ campus: { admin: mocks } }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ isSuperAdmin: mocks.superAdmin }) }));
import Campi from '../pages/admin/Campi';
const usuario = { id: 'usuario-id', name: 'Pessoa de teste', email: 'pessoa@example.test' };
const estado = {
  config: { estado: 'preparacao', campus_legado_id: 'sede', ja_ativado: false },
  campi: [{ id: 'sede', nome: 'Sede', slug: 'sede', tipo: 'sede', ativa: true }, { id: 'outro', nome: 'Campus 2', slug: 'campus-2', tipo: 'sede', ativa: true }],
  cobertura: [{ frente: 'grupos', api_validada: true, rls_validada: false, produtores_validados: false, regressao_validada: false, evidencia: null }],
};
beforeEach(() => {
  mocks.superAdmin = true;
  mocks.estado.mockResolvedValue(estado); mocks.usuarios.mockResolvedValue([usuario]);
  mocks.vinculos.mockResolvedValue([{ igreja_id: 'sede', papel: 'membro' }]);
  mocks.salvarVinculos.mockResolvedValue({ ok: true });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
async function selecionarUsuario() {
  render(<Campi />);
  await screen.findByText('Acessos por usuário');
  fireEvent.change(screen.getByLabelText('Nome ou e-mail'), { target: { value: 'pessoa' } });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar usuário' }));
  fireEvent.click(await screen.findByRole('button', { name: /Pessoa de teste/ }));
  await screen.findByRole('checkbox', { name: 'Permitir Sede' });
}
describe('administração dos vínculos de campus', () => {
  it('não busca pessoas automaticamente ou com menos de três caracteres', async () => {
    render(<Campi />); await screen.findByText('Acessos por usuário');
    expect(mocks.usuarios).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Nome ou e-mail'), { target: { value: 'ab' } });
    expect(screen.getByRole('button', { name: 'Buscar usuário' })).toBeDisabled();
    expect(mocks.usuarios).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /ativar/i })).toBeNull();
  });
  it('seleciona apenas os vínculos existentes e salva somente a alteração explícita', async () => {
    await selecionarUsuario();
    const sede = screen.getByRole('checkbox', { name: 'Permitir Sede' });
    const outro = screen.getByRole('checkbox', { name: 'Permitir Campus 2' });
    expect(sede).toBeChecked(); expect(outro).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Salvar vínculos' })).toBeDisabled();
    fireEvent.click(outro);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar vínculos' }));
    await waitFor(() => expect(mocks.salvarVinculos).toHaveBeenCalledWith({ usuario_id: 'usuario-id', igreja_ids: ['sede', 'outro'] }));
    await screen.findByText(/Vínculos salvos/);
  });
  it('permite remover o último vínculo sem conceder todos os campi como fallback', async () => {
    await selecionarUsuario();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Permitir Sede' }));
    expect(screen.getByText(/Nenhum vínculo explícito/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar vínculos' }));
    await waitFor(() => expect(mocks.salvarVinculos).toHaveBeenCalledWith({ usuario_id: 'usuario-id', igreja_ids: [] }));
  });
  it('não habilita a gravação quando a leitura dos vínculos falha', async () => {
    mocks.vinculos.mockRejectedValue(new Error('Falha ao carregar vínculos.'));
    await selecionarUsuario();
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao carregar vínculos.');
    expect(screen.getByRole('button', { name: 'Salvar vínculos' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Permitir Sede' })).toBeDisabled();
  });
  it('não carrega dados administrativos para usuários comuns', () => {
    mocks.superAdmin = false; render(<Campi />);
    expect(screen.getByRole('alert')).toHaveTextContent('restrita aos superadministradores');
    expect(mocks.estado).not.toHaveBeenCalled();
  });
});
