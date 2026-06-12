import EncaminhamentosInbox from '../../../components/EncaminhamentosInbox';
import { useAuth } from '@/contexts/AuthContext';
import { UserPlus } from 'lucide-react';

// Caixa de entrada dos encaminhamentos pra servir (destino=voluntarios).
// Origem: desfecho do encontro pastoral em /cuidados.
export default function VolEncaminhados() {
  const { isAdmin, getAccessLevel } = useAuth() as any;
  const canWrite = isAdmin || (getAccessLevel?.(['voluntariado']) ?? 0) >= 3;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-primary" /> Encaminhados pra servir
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pessoas que o cuidado pastoral encaminhou pra servir como voluntárias. Faça o primeiro contato e registre a devolutiva.
        </p>
      </div>
      <EncaminhamentosInbox destino="voluntarios" canWrite={canWrite} />
    </div>
  );
}
