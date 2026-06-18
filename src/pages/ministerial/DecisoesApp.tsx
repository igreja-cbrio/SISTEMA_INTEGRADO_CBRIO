import { useEffect, useState, useCallback } from 'react';
import { integracao as intApi } from '../../api';
import { Button } from '../../components/ui/button';
import { Smartphone, Check, X, Loader2 } from 'lucide-react';

type DecisaoApp = {
  id: string;
  ambiente: 'presencial' | 'online';
  tipo: string | null;
  observacao: string | null;
  status: string;
  criada_em: string;
  membro: { id: string; nome: string; telefone: string | null; email: string | null } | null;
  culto: { nome: string; data: string } | null;
};

const TIPO_LABEL: Record<string, string> = {
  aceitar: 'Aceitou a Jesus',
  reconciliacao: 'Reconciliação',
  rededicacao: 'Rededicação',
  batismo: 'Decisão pelo batismo',
  outro: 'Decisão',
};

/**
 * Fila de revisão das decisões de fé registradas pelo APP de membros.
 * Decisão da liderança: nada do app entra na NSM sem a Integração confirmar.
 */
export default function DecisoesApp() {
  const [itens, setItens] = useState<DecisaoApp[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [agindo, setAgindo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setItens(await intApi.decisoesApp.list('pendente'));
    } catch {
      /* mantém */
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function confirmar(d: DecisaoApp) {
    if (!window.confirm(`Confirmar a decisão de ${d.membro?.nome}? Ela entrará nas decisões oficiais (e na NSM).`)) return;
    setAgindo(d.id);
    try {
      await intApi.decisoesApp.confirmar(d.id);
      setItens((xs) => xs.filter((x) => x.id !== d.id));
    } catch (e) {
      alert('Erro ao confirmar: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setAgindo(null);
    }
  }

  async function descartar(d: DecisaoApp) {
    if (!window.confirm(`Descartar a decisão de ${d.membro?.nome}? Ela não será registrada.`)) return;
    setAgindo(d.id);
    try {
      await intApi.decisoesApp.descartar(d.id);
      setItens((xs) => xs.filter((x) => x.id !== d.id));
    } catch (e) {
      alert('Erro ao descartar: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setAgindo(null);
    }
  }

  if (carregando) return null;
  if (itens.length === 0) return null;

  return (
    <div
      className="mb-4 rounded-xl border p-4"
      style={{ background: 'var(--cbrio-card)', borderColor: 'var(--cbrio-border)' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Smartphone className="h-4 w-4" style={{ color: 'var(--cbrio-text2)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--cbrio-text)' }}>
          Decisões pelo app · aguardando confirmação ({itens.length})
        </h3>
      </div>
      <p className="text-xs mb-3" style={{ color: 'var(--cbrio-text3)' }}>
        Registradas por membros no app. Confirme pra virar decisão oficial (entra na NSM) ou descarte.
      </p>
      <div className="space-y-2">
        {itens.map((d) => (
          <div
            key={d.id}
            className="flex items-center gap-3 rounded-lg border p-3"
            style={{ background: 'var(--cbrio-bg)', borderColor: 'var(--cbrio-border)' }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate" style={{ color: 'var(--cbrio-text)' }}>
                {d.membro?.nome ?? '—'}
              </div>
              <div className="text-xs" style={{ color: 'var(--cbrio-text3)' }}>
                {d.tipo ? TIPO_LABEL[d.tipo] ?? 'Decisão' : 'Decisão'} · {d.ambiente === 'online' ? 'Online' : 'Presencial'}
                {d.culto?.nome ? ` · ${d.culto.nome}` : ''} · {new Date(d.criada_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </div>
              {d.observacao ? (
                <div className="text-xs italic mt-0.5" style={{ color: 'var(--cbrio-text2)' }}>“{d.observacao}”</div>
              ) : null}
            </div>
            <Button size="sm" onClick={() => confirmar(d)} disabled={agindo === d.id}>
              {agindo === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              <span className="ml-1">Confirmar</span>
            </Button>
            <Button size="sm" variant="outline" onClick={() => descartar(d)} disabled={agindo === d.id}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
