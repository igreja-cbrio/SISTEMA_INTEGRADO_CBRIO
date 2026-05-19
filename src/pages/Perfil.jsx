import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Avatar, AvatarFallback } from '../components/ui/avatar';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';

function mascaraTelefone(v) {
  const d = (v || '').replace(/\D+/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default function Perfil() {
  const { profile, role } = useAuth();
  const [telefone, setTelefone] = useState(profile?.telefone || '');
  const [savingTel, setSavingTel] = useState(false);

  const initials = (profile?.name || '??')
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  async function salvarTelefone() {
    if (!profile?.id || !supabase) return;
    setSavingTel(true);
    try {
      const digits = telefone.replace(/\D+/g, '');
      if (digits && digits.length < 10) {
        toast.error('Telefone invalido. Informe DDD + numero.');
        setSavingTel(false);
        return;
      }
      const { error } = await supabase
        .from('profiles')
        .update({ telefone: digits ? mascaraTelefone(digits) : null })
        .eq('id', profile.id);
      if (error) throw error;
      toast.success('Telefone atualizado · voce passa a receber notificacoes no WhatsApp');
    } catch (e) {
      toast.error(e.message || 'Erro ao salvar');
    } finally {
      setSavingTel(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-foreground">Meu Perfil</h1>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-4 mb-6">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="bg-primary/20 text-primary text-xl font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-lg font-semibold text-foreground">{profile?.name || '—'}</h2>
            <p className="text-sm text-muted-foreground">{profile?.email || '—'}</p>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary mt-1 inline-block">
              {role || 'Membro'}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Nome</label>
              <p className="text-sm text-foreground mt-1">{profile?.name || '—'}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">E-mail</label>
              <p className="text-sm text-foreground mt-1">{profile?.email || '—'}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Área</label>
              <p className="text-sm text-foreground mt-1">{profile?.area || '—'}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Cargo</label>
              <p className="text-sm text-foreground mt-1">{role || '—'}</p>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <label className="text-xs font-medium text-muted-foreground">Celular (WhatsApp)</label>
            <p className="text-xs text-muted-foreground/80 mt-1 mb-2">
              Usado para enviar atualizacoes de pedidos do Mercado Livre vinculados as suas solicitacoes.
            </p>
            <div className="flex gap-2">
              <Input
                value={telefone}
                onChange={e => setTelefone(mascaraTelefone(e.target.value))}
                placeholder="(21) 99999-9999"
                className="max-w-xs"
                inputMode="tel"
                autoComplete="tel"
                maxLength={16}
              />
              <Button
                size="sm"
                onClick={salvarTelefone}
                disabled={savingTel || telefone === (profile?.telefone || '')}
              >
                {savingTel ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
