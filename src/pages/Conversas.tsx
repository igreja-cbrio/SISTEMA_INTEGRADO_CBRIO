// Página do módulo Conversas (inbox de WhatsApp compartilhado, escopo por área).
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { cuidados as cuidadosApi } from '../api';
import ConversasInbox from '../components/waInbox/ConversasInbox';

export default function Conversas() {
  const { user, userAreas, isAdmin } = useAuth();
  const [atendentes, setAtendentes] = useState<any[]>([]);

  useEffect(() => {
    // Lista de responsáveis p/ atribuição (best-effort — "Atribuir a mim" sempre funciona).
    cuidadosApi.convertidos.atendentes().then(setAtendentes).catch(() => {});
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Conversas</h1>
        <p className="text-sm text-muted-foreground">
          Inbox de WhatsApp da igreja — receba e responda quem escreve, com triagem por área.
          Cada equipe vê a Entrada (não triada) e as conversas da sua área.
        </p>
      </div>
      <ConversasInbox
        atendentes={atendentes}
        currentUserId={user?.id}
        userAreas={userAreas || []}
        isAdmin={isAdmin}
      />
    </div>
  );
}
