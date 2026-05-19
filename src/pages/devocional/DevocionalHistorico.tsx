import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { devocionalMembro } from '../../api';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { ArrowLeft, CheckCircle2, History } from 'lucide-react';
import { toast } from 'sonner';

type Registro = {
  id: string;
  data_devocional: string;
  observacoes: string | null;
  devocional_item_id: string | null;
  devocional_itens?: { id: string; titulo: string; passagem: string | null } | null;
};

export default function DevocionalHistorico() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [registros, setRegistros] = useState<Registro[]>([]);

  useEffect(() => {
    devocionalMembro.historico()
      .then((r: any) => setRegistros(r?.data || []))
      .catch((e: any) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen" style={{ background: 'var(--cbrio-bg)' }}>
      <header className="sticky top-0 z-30 border-b bg-card/90 backdrop-blur">
        <div className="flex items-center gap-2 h-14 px-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/devocional/hoje')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Meu historico</span>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-3">
        {loading ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : registros.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Nenhum devocional registrado ainda.
          </Card>
        ) : (
          registros.map(r => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs font-mono text-muted-foreground">{fmt(r.data_devocional)}</span>
                    {r.devocional_itens?.passagem && (
                      <Badge variant="outline" className="text-xs">{r.devocional_itens.passagem}</Badge>
                    )}
                  </div>
                  {r.devocional_itens?.titulo && (
                    <p className="font-medium text-sm">{r.devocional_itens.titulo}</p>
                  )}
                  {r.observacoes && (
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{r.observacoes}</p>
                  )}
                  {!r.devocional_itens && !r.observacoes && (
                    <p className="text-xs text-muted-foreground italic">Check-in sem anotacao</p>
                  )}
                </div>
              </div>
            </Card>
          ))
        )}
      </main>
    </div>
  );
}

function fmt(iso: string) {
  if (!iso) return '';
  return new Date(iso + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
}
