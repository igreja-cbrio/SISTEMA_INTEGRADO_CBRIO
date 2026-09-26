import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CampusBoundary, useCampus } from '../../contexts/CampusContext';

function WorkspaceCache({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000, gcTime: 10 * 60_000 } },
  }));
  useEffect(() => () => {
    void client.cancelQueries();
    client.clear();
  }, [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// Trocar usuário/campus desmonta também state local, subscriptions e overlays.
// O cache público do App não participa das páginas operacionais.
export default function CampusWorkspace({ children }: { children: ReactNode }) {
  const { scopeKey } = useCampus();
  return <CampusBoundary><WorkspaceCache key={scopeKey}>{children}</WorkspaceCache></CampusBoundary>;
}
