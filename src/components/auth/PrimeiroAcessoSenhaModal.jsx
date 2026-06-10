import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { KeyRound, ShieldAlert } from 'lucide-react';
import TrocarSenhaForm from './TrocarSenhaForm';

const DISMISS_KEY = 'cbrio_primeiro_acesso_dismissed';

/**
 * Detecta usuário que ainda não trocou a senha padrão (password_changed_at IS NULL)
 * e mostra modal sugerindo trocar. Dismissable · so reaparece no próximo login.
 *
 * So aparece pra logins email/password (OAuth Google/MS não tem senha pra trocar).
 */
export default function PrimeiroAcessoSenhaModal() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [modo, setModo] = useState('aviso'); // 'aviso' | 'form'

  useEffect(() => {
    if (!user || !profile) return;
    if (profile.password_changed_at) return; // já trocou
    const provider = user?.app_metadata?.provider;
    if (provider && provider !== 'email') return; // OAuth · ignorar
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') return;
    } catch { /* ignore */ }
    setOpen(true);
    setModo('aviso');
  }, [user, profile]);

  function dismiss() {
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setOpen(false);
  }

  function abrirForm() {
    setModo('form');
  }

  function aposTrocar() {
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogContent
        className="max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              {modo === 'aviso' ? <ShieldAlert className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
            </div>
            <DialogTitle>
              {modo === 'aviso' ? 'Bem-vindo(a) ao CBRio ERP!' : 'Defina sua nova senha'}
            </DialogTitle>
          </div>
          {modo === 'aviso' && (
            <DialogDescription className="text-left">
              Voce esta usando a <strong>senha padrão</strong> do sistema. Por seguranca,
              recomendamos trocar agora por uma senha pessoal. Voce pode adiar e fazer depois
              em <em>Meu Perfil</em>.
            </DialogDescription>
          )}
        </DialogHeader>

        {modo === 'aviso' ? (
          <div className="flex gap-2 mt-4">
            <Button variant="outline" className="flex-1" onClick={dismiss}>
              Depois
            </Button>
            <Button className="flex-1" onClick={abrirForm}>
              <KeyRound className="h-4 w-4 mr-2" />
              Trocar agora
            </Button>
          </div>
        ) : (
          <div className="mt-2">
            <TrocarSenhaForm onSuccess={aposTrocar} compact />
            <button
              type="button"
              onClick={dismiss}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground mt-3 underline"
            >
              Fazer depois
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
