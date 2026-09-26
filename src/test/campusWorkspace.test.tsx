import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import CampusWorkspace from '../components/layout/CampusWorkspace';
const current = vi.hoisted(() => ({ scopeKey: 'usuario:campus-a:1', ready: true }));
vi.mock('../contexts/CampusContext', () => ({
  useCampus: () => current,
  CampusBoundary: ({ children }: { children: React.ReactNode }) => current.ready ? children : <p>Carregando campus…</p>,
}));
afterEach(cleanup);
function Page() {
  const client = useQueryClient();
  const [value, setValue] = useState('vazio');
  const cached = client.getQueryData<string>(['pessoas']) || 'sem cache';
  return <><span>{value}</span><span>{cached}</span><button onClick={() => {
    client.setQueryData(['pessoas'], 'pessoa do campus A'); setValue('formulário do campus A');
  }}>Preencher</button></>;
}
describe('workspace por campus', () => {
  it('não reaproveita cache nem formulário ao trocar de campus', () => {
    const ui = render(<CampusWorkspace><Page /></CampusWorkspace>);
    fireEvent.click(screen.getByText('Preencher'));
    expect(screen.getByText('pessoa do campus A')).toBeInTheDocument();
    current.scopeKey = 'usuario:campus-b:2';
    ui.rerender(<CampusWorkspace><Page /></CampusWorkspace>);
    expect(screen.queryByText('pessoa do campus A')).not.toBeInTheDocument();
    expect(screen.queryByText('formulário do campus A')).not.toBeInTheDocument();
    expect(screen.getByText('sem cache')).toBeInTheDocument();
  });
  it('não monta página operacional sem contexto validado', () => {
    current.ready = false;
    render(<CampusWorkspace><Page /></CampusWorkspace>);
    expect(screen.queryByText('Preencher')).not.toBeInTheDocument();
    current.ready = true;
  });
});
