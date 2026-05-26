import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Form pra trocar senha usando senha atual.
 * onSuccess opcional · chamado depois de trocar com sucesso.
 */
export default function TrocarSenhaForm({ onSuccess, compact = false }) {
  const { updatePasswordWithCurrent } = useAuth();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e?.preventDefault?.();
    if (!atual) return toast.error('Informe a senha atual');
    if (nova.length < 6) return toast.error('A nova senha precisa de pelo menos 6 caracteres');
    if (nova !== confirma) return toast.error('As senhas nao conferem');
    if (nova === atual) return toast.error('A nova senha precisa ser diferente da atual');
    setLoading(true);
    const { error } = await updatePasswordWithCurrent(atual, nova);
    setLoading(false);
    if (error) { toast.error(error.message || 'Erro ao trocar senha'); return; }
    toast.success('Senha atualizada');
    setAtual(''); setNova(''); setConfirma('');
    onSuccess?.();
  }

  return (
    <form onSubmit={handleSubmit} className={compact ? 'space-y-3' : 'space-y-4'}>
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Senha atual</label>
        <Input
          type={show ? 'text' : 'password'}
          value={atual}
          onChange={(e) => setAtual(e.target.value)}
          autoComplete="current-password"
          placeholder="••••••••"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Nova senha</label>
        <Input
          type={show ? 'text' : 'password'}
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          autoComplete="new-password"
          placeholder="Pelo menos 6 caracteres"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Confirme a nova senha</label>
        <Input
          type={show ? 'text' : 'password'}
          value={confirma}
          onChange={(e) => setConfirma(e.target.value)}
          autoComplete="new-password"
          placeholder="Repita a nova senha"
        />
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="accent-primary" />
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        Mostrar senha
      </label>
      <Button type="submit" disabled={loading} className="w-full">
        <KeyRound className="h-4 w-4 mr-2" />
        {loading ? 'Atualizando...' : 'Atualizar senha'}
      </Button>
    </form>
  );
}
