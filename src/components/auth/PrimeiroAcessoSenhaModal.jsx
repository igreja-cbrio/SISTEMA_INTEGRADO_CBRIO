import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { KeyRound, ShieldAlert } from 'lucide-react';
import TrocarSenhaForm from './TrocarSenhaForm';

/**
 * Detecta usuário que ainda não trocou a senha padrão (password_changed_at IS NULL)
 * e OBRIGA a trocar antes de usar o sistema. Não-dispensável: a senha padrão
 * (cbrio1234) é pública (está no nome do workflow de onboarding), então deixar
 * a conta nela é um risco de invasão. Ao trocar, o RPC app_marcar_senha_trocada
 * grava password_changed_at e o modal some.
 *
 * So aparece pra logins email/password (OAuth Google/MS não tem senha pra trocar).
 */
export default function PrimeiroAcessoSenhaModal() {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [modo, setModo] = useState('aviso'); // 'aviso' | 'form'

  useEffect(() => {
    if (!user || !profile) return;
    if (profile.password_changed_at) return; // já trocou
    const provider = user?.app_metadata?.provider;
    if (provider && provider !== 'email') return; // OAuth · ignorar
    setOpen(true);
    setModo('aviso');
  }, [user, profile]);

  function abrirForm() {
    setModo('form');
  }

  function aposTrocar() {
    setOpen(false);
  }

  return (
    // Obrigatório · onOpenChange no-op + handlers preventDefault + hideClose
    // impedem qualquer forma de fechar sem definir a senha pessoal.
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-md"
        hideClose
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
              {modo === 'aviso' ? 'Defina sua senha pessoal' : 'Defina sua nova senha'}
            </DialogTitle>
          </div>
          {modo === 'aviso' && (
            <DialogDescription className="text-left">
              Sua conta ainda usa a <strong>senha padrão</strong> do sistema, que é
              pública. Por segurança, é necessário definir uma senha pessoal antes de
              continuar.
            </DialogDescription>
          )}
        </DialogHeader>

        {modo === 'aviso' ? (
          <div className="mt-4">
            <Button className="w-full" onClick={abrirForm}>
              <KeyRound className="h-4 w-4 mr-2" />
              Trocar agora
            </Button>
          </div>
        ) : (
          <div className="mt-2">
            <TrocarSenhaForm onSuccess={aposTrocar} compact />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
