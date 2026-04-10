import {} from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Avatar, AvatarFallback } from '../components/ui/avatar';

export default function Perfil() {
  const { profile, role } = useAuth();

  const initials = (profile?.name || '??')
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

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
        </div>
      </div>
    </div>
  );
}
