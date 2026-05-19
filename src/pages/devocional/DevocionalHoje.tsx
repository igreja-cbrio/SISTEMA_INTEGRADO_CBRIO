import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { devocionalMembro } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { Textarea } from '../../components/ui/textarea';
import { BookOpen, CheckCircle2, Loader2, LogOut, History, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

type Item = {
  id: string;
  titulo: string;
  passagem: string | null;
  passagem_texto: string | null;
  reflexao: string;
  aplicacao: string | null;
  oracao: string | null;
  data: string;
  gerado_por_ia: boolean;
  devocional_planos: { id: string; titulo: string };
};

export default function DevocionalHoje() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<Item | null>(null);
  const [membroNome, setMembroNome] = useState<string | null>(null);
  const [concluido, setConcluido] = useState(false);
  const [obs, setObs] = useState('');
  const [saving, setSaving] = useState(false);
  const [showObs, setShowObs] = useState(false);

  function load() {
    setLoading(true);
    devocionalMembro.hoje()
      .then((r: any) => {
        setItem(r.item);
        setMembroNome(r.membro?.nome || null);
        setConcluido(!!r.concluido_hoje);
      })
      .catch((e: any) => toast.error(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function fazerCheckIn() {
    setSaving(true);
    try {
      await devocionalMembro.checkIn({
        item_id: item?.id || null,
        observacoes: obs.trim() || null,
      });
      toast.success('Devocional registrado · que Deus te abencoe!');
      setConcluido(true);
      setShowObs(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function sair() {
    await signOut();
    navigate('/devocional', { replace: true });
  }

  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  return (
    <div className="min-h-screen" style={{ background: 'var(--cbrio-bg)' }}>
      <header className="sticky top-0 z-30 border-b bg-card/90 backdrop-blur">
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="h-5 w-5 text-primary flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">Devocional</div>
              <div className="text-xs text-muted-foreground truncate">
                {membroNome || profile?.name || profile?.email}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => navigate('/devocional/historico')} aria-label="Historico">
              <History className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={sair} aria-label="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-4 pb-32">
        <div className="text-center">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{hoje}</p>
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-3/4 mx-auto" />
            <Skeleton className="h-4 w-1/2 mx-auto" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !item ? (
          <Card className="p-8 text-center space-y-3">
            <Sparkles className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="font-medium">Sem devocional pra hoje</p>
            <p className="text-sm text-muted-foreground">
              Nenhum plano ativo tem item pra esta data. Volte amanha ou pergunte ao seu lider.
            </p>
          </Card>
        ) : (
          <>
            <Card className="p-5 space-y-4">
              <div className="space-y-1">
                {item.passagem && (
                  <Badge variant="outline" className="text-xs">{item.passagem}</Badge>
                )}
                <h1 className="text-2xl font-bold leading-tight">{item.titulo}</h1>
              </div>

              {item.passagem_texto && (
                <blockquote className="border-l-4 border-primary pl-3 italic text-sm whitespace-pre-wrap">
                  {item.passagem_texto}
                </blockquote>
              )}

              <div className="prose prose-sm dark:prose-invert max-w-none">
                <p className="whitespace-pre-wrap leading-relaxed">{item.reflexao}</p>
              </div>

              {item.aplicacao && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">Aplicacao</h3>
                  <p className="text-sm whitespace-pre-wrap">{item.aplicacao}</p>
                </div>
              )}

              {item.oracao && (
                <div className="bg-muted rounded-lg p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Oracao</h3>
                  <p className="text-sm whitespace-pre-wrap italic">{item.oracao}</p>
                </div>
              )}
            </Card>

            {showObs && !concluido && (
              <Card className="p-4 space-y-2">
                <label className="text-sm font-medium">Anote o que Deus te falou (opcional)</label>
                <Textarea
                  rows={4}
                  value={obs}
                  onChange={e => setObs(e.target.value)}
                  placeholder="Pode ficar em branco se preferir so marcar como concluido."
                />
              </Card>
            )}
          </>
        )}
      </main>

      {item && (
        <div className="fixed bottom-0 left-0 right-0 border-t bg-card/95 backdrop-blur p-3 z-40">
          <div className="max-w-2xl mx-auto flex items-center gap-2">
            {concluido ? (
              <div className="flex-1 flex items-center justify-center gap-2 py-2.5 text-primary font-semibold">
                <CheckCircle2 className="h-5 w-5" />
                Concluido hoje
              </div>
            ) : showObs ? (
              <>
                <Button variant="outline" onClick={() => setShowObs(false)} disabled={saving} className="flex-shrink-0">
                  Cancelar
                </Button>
                <Button onClick={fazerCheckIn} disabled={saving} className="flex-1">
                  {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando</> : 'Confirmar check-in'}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setShowObs(true)} className="flex-shrink-0">
                  Anotar
                </Button>
                <Button onClick={fazerCheckIn} disabled={saving || !membroNome} className="flex-1" size="lg">
                  {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> ...</> : <><CheckCircle2 className="h-5 w-5 mr-2" /> Fiz hoje</>}
                </Button>
              </>
            )}
          </div>
          {!membroNome && !loading && (
            <p className="text-xs text-amber-600 text-center mt-2 max-w-2xl mx-auto">
              Seu profile nao esta linkado a um membro. Avise um lider.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
