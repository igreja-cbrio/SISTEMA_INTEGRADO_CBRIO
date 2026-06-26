// ============================================================================
// Devocional · migrou pro app de membros
// ============================================================================
// As telas web do devocional (login/hoje/histórico) foram removidas — o
// devocional agora vive no aplicativo CBRio. Esta página é só um aviso curto
// pra quem cair nos links antigos.
// ============================================================================

import { BookOpen } from 'lucide-react';

export default function DevocionalMovido() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <BookOpen className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-xl font-bold text-foreground">O devocional agora está no app 💙</h1>
        <p className="text-sm text-muted-foreground">
          Abra o <span className="font-medium text-foreground">aplicativo CBRio</span> pra ler o
          devocional do dia e marcar o seu check-in. Por aqui (no navegador) ele não está mais
          disponível.
        </p>
      </div>
    </div>
  );
}
