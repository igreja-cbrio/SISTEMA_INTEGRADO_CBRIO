// Página do módulo Conversas (inbox de WhatsApp compartilhado, escopo por área).
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ConversasInbox from '../components/waInbox/ConversasInbox';

export default function Conversas() {
  const { user, userAreas, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Botões de WhatsApp dos outros módulos chegam com ?telefone=&texto= —
  // captura na 1ª renderização e limpa a URL (não reabre ao navegar).
  const [abrir] = useState(() => ({
    telefone: searchParams.get('telefone') || undefined,
    texto: searchParams.get('texto') || undefined,
  }));
  useEffect(() => {
    if (searchParams.get('telefone') || searchParams.get('texto')) {
      setSearchParams({}, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        currentUserId={user?.id}
        userAreas={userAreas || []}
        isAdmin={isAdmin}
        abrirTelefone={abrir.telefone}
        textoInicial={abrir.texto}
      />
    </div>
  );
}
