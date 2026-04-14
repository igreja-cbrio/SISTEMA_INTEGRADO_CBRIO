import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { RefreshCw } from 'lucide-react';
import { useLastSync } from '../../hooks';

export default function LastSyncIndicator() {
  const { data: lastSync } = useLastSync();
  if (!lastSync) return null;

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <RefreshCw className="h-3.5 w-3.5" />
      <span>
        Ultima sync: {formatDistanceToNow(new Date(lastSync.created_at), { addSuffix: true, locale: ptBR })}
        {' '}({lastSync.services_synced} cultos, {lastSync.schedules_synced} escalas)
      </span>
    </div>
  );
}
