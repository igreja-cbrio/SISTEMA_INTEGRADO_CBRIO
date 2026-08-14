import { useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Users, Clock } from 'lucide-react';
import { format } from 'date-fns';

/**
 * Painel lateral de escalar — o coração da montagem, no formato do Planning
 * Center Services (visto ao vivo em 13/08/2026, a pedido do Matheus).
 *
 * Três coisas vieram de lá e são o motivo deste componente existir:
 *
 *  1. **Ele abre no contexto da VAGA** (área + função), não como uma lista
 *     global. Antes, escalar era abrir um modal com todos os voluntários da
 *     igreja e lembrar em que equipe a pessoa devia entrar.
 *  2. **A ordem é o rodízio**: quem está há mais tempo sem servir aparece
 *     primeiro, com o tempo escrito ao lado ("há 7 semanas"). Em ordem
 *     alfabética o topo era sempre a mesma gente.
 *  3. **Seleção múltipla**: marca 4 e escala os 4 de uma vez.
 *
 * ⚠️ Indisponível NÃO aparece aqui — é a lei de 13/08 ("quem não estiver
 * disponível não vai aparecer para o supervisor ou líder escalar"), e o
 * servidor recusa de qualquer jeito (409). Mostrar o nome só produziria erro.
 * Quem já serve em OUTRO culto do mesmo dia aparece, mas num grupo separado e
 * no fim: é escolha do supervisor, não sugestão nossa.
 */

type Vaga = {
  team_id: string | null;
  team: string;
  position_id?: string | null;
  position?: string | null;
  item_id?: string | null;
  faltam?: number;
};

// ⚠️ Espelho de apresentação da ordem de `backend/utils/volRodizio.js`
// (`ordenarCandidatos`). O NÚMERO vem pronto do servidor
// (`semanasSemServir`); aqui só se ordena por ele. Mudou a regra lá, muda aqui.
function ordenar(a: any, b: any) {
  const ca = (a.escaladoEm?.length ? 1 : 0) - (b.escaladoEm?.length ? 1 : 0);
  if (ca !== 0) return ca;
  const pa = a.semanasSemServir === null || a.semanasSemServir === undefined ? Infinity : a.semanasSemServir;
  const pb = b.semanasSemServir === null || b.semanasSemServir === undefined ? Infinity : b.semanasSemServir;
  if (pa !== pb) return pb - pa;
  return String(a.full_name || '').localeCompare(String(b.full_name || ''), 'pt-BR');
}

function LinhaCandidato({ v, marcado, onToggle }: { v: any; marcado: boolean; onToggle: () => void }) {
  const conflito = (v.escaladoEm || []) as Array<{ scheduled_at: string }>;
  return (
    <label className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent/50 cursor-pointer transition-colors">
      <Checkbox checked={marcado} onCheckedChange={onToggle} />
      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0 overflow-hidden">
        {v.avatar_url
          ? <img data-foto-avatar="" src={v.avatar_url} alt={v.full_name} className="h-full w-full object-cover" />
          : String(v.full_name || '?').charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{v.full_name}</p>
        {conflito.length > 0 && (
          <span className="text-[11px] text-amber-700 dark:text-amber-400">
            já serve às {format(new Date(conflito[0].scheduled_at), 'HH:mm')}
          </span>
        )}
      </div>
      {/* O tempo sem servir é a informação que faz esta lista valer — fica à
          direita, alinhado, como no Services. */}
      <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0" title="Última vez que esta pessoa foi escalada">
        {v.rotuloRodizio || '—'}
      </span>
    </label>
  );
}

export default function PainelEscalar({
  vaga, pool, rodizio, carregando, subtitulo, onClose, onEscalar, escalando,
}: {
  vaga: Vaga | null;
  pool: any[];
  rodizio?: { desde?: string | null };
  carregando?: boolean;
  /** Qual culto. Obrigatório na matriz, onde há várias datas à vista. */
  subtitulo?: string;
  onClose: () => void;
  onEscalar: (pessoas: any[], vaga: Vaga) => void;
  escalando?: boolean;
}) {
  const [busca, setBusca] = useState('');
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [escopo, setEscopo] = useState<'area' | 'todos'>('area');

  const { semConflito, comConflito, totalArea, ocultosIndisponiveis } = useMemo(() => {
    if (!vaga) return { semConflito: [], comConflito: [], totalArea: 0, ocultosIndisponiveis: 0 };
    // Indisponível e já escalado neste culto ficam fora, sempre.
    const base = (pool || []).filter((v: any) => !v.indisponivel && !v.jaEscalado);
    // ⚠️ Quantos sumiram por indisponibilidade é DECLARADO: sem esse número, a
    // ausência de um nome conhecido vira "cadê fulano?" e o supervisor vai
    // procurar bug onde há uma pessoa que avisou que não pode.
    const ocultos = (pool || []).filter((v: any) => v.indisponivel && !v.jaEscalado &&
      (v.team_members || []).some((m: any) => m.team_id === vaga.team_id)).length;
    const daArea = base.filter((v: any) =>
      (v.team_members || []).some((m: any) => m.team_id === vaga.team_id));

    let lista = escopo === 'area' ? daArea : base;
    const q = busca.trim().toLowerCase();
    if (q) lista = lista.filter((v: any) => String(v.full_name || '').toLowerCase().includes(q));

    const ordenada = [...lista].sort(ordenar);
    return {
      semConflito: ordenada.filter((v: any) => !(v.escaladoEm || []).length),
      comConflito: ordenada.filter((v: any) => (v.escaladoEm || []).length > 0),
      totalArea: daArea.length,
      ocultosIndisponiveis: ocultos,
    };
  }, [vaga, pool, busca, escopo]);

  if (!vaga) return null;

  const alternar = (id: string) => setMarcados(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const escalar = () => {
    const todos = [...semConflito, ...comConflito];
    const escolhidos = todos.filter((v: any) => marcados.has(v.id));
    if (!escolhidos.length) return;
    onEscalar(escolhidos, vaga);
    setMarcados(new Set());
  };

  const faltam = vaga.faltam ?? 0;
  const excedeu = faltam > 0 && marcados.size > faltam;

  return (
    <Sheet open onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0 gap-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b shrink-0 text-left">
          <SheetTitle className="text-base">
            {vaga.team}{vaga.position ? ` · ${vaga.position}` : ''}
          </SheetTitle>
          {subtitulo && (
            <p className="text-sm font-medium capitalize text-[#00B39D]">{subtitulo}</p>
          )}
          <p className="text-sm text-muted-foreground">
            {faltam > 0
              ? `${faltam} vaga${faltam > 1 ? 's' : ''} em aberto`
              : 'Sem vaga em aberto — quem entrar aqui é acréscimo'}
          </p>
        </SheetHeader>

        <div className="px-4 py-3 border-b shrink-0 space-y-2">
          <div className="flex gap-1.5">
            <button
              onClick={() => setEscopo('area')}
              className={`flex-1 h-8 rounded-md border text-xs font-medium transition ${escopo === 'area' ? 'border-[#00B39D] bg-[#00B39D]/10 text-[#00B39D]' : 'border-border hover:bg-muted/50'}`}
            >
              Da área ({totalArea})
            </button>
            {/* "Todos" é o equivalente ao "Assign new person to…" do Services:
                quem não é da equipe pode ser escalado, mas por escolha
                explícita — não misturado na lista principal. */}
            <button
              onClick={() => setEscopo('todos')}
              className={`flex-1 h-8 rounded-md border text-xs font-medium transition ${escopo === 'todos' ? 'border-[#00B39D] bg-[#00B39D]/10 text-[#00B39D]' : 'border-border hover:bg-muted/50'}`}
            >
              Qualquer voluntário
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              autoFocus placeholder="Buscar por nome..." value={busca}
              onChange={e => setBusca(e.target.value)} className="pl-8 h-9 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-2 py-2">
          {/* ⚠️ Carregando NÃO pode se parecer com "ninguém disponível" — é a
              diferença entre esperar meio segundo e concluir que a área está
              vazia e sair procurando gente noutro lugar. */}
          {carregando && !pool?.length ? (
            <div className="text-center py-10 text-sm text-muted-foreground">Carregando voluntários…</div>
          ) : semConflito.length === 0 && comConflito.length === 0 ? (
            <div className="text-center py-10">
              <Users className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">
                {escopo === 'area'
                  ? 'Ninguém disponível nesta área. Tente "Qualquer voluntário".'
                  : 'Ninguém disponível com esse recorte.'}
              </p>
            </div>
          ) : (
            <>
              {semConflito.length > 0 && (
                <>
                  <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Livres neste dia
                  </p>
                  {semConflito.map((v: any) => (
                    <LinhaCandidato key={v.id} v={v} marcado={marcados.has(v.id)} onToggle={() => alternar(v.id)} />
                  ))}
                </>
              )}
              {comConflito.length > 0 && (
                <>
                  <p className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                    Já servem em outro culto deste dia ({comConflito.length})
                  </p>
                  {comConflito.map((v: any) => (
                    <LinhaCandidato key={v.id} v={v} marcado={marcados.has(v.id)} onToggle={() => alternar(v.id)} />
                  ))}
                </>
              )}
            </>
          )}
        </div>

        <div className="border-t px-4 py-3 shrink-0 space-y-2">
          {ocultosIndisponiveis > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {ocultosIndisponiveis} pessoa(s) desta área não aparecem porque avisaram que não podem neste culto.
            </p>
          )}
          {/* ⚠️ A janela do rodízio é DECLARADA: "sem escala recente" sem dizer
              o alcance faria o supervisor achar que a pessoa nunca serviu. */}
          {rodizio?.desde && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3 w-3 shrink-0" />
              Rodízio conferido desde {format(new Date(rodizio.desde), 'dd/MM/yyyy')}
            </p>
          )}
          {excedeu && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              Você marcou {marcados.size} para {faltam} vaga(s) — os extras entram como acréscimo.
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
            <Button
              size="sm" className="bg-[#00B39D] hover:bg-[#00B39D]/90 text-white"
              disabled={marcados.size === 0 || escalando} onClick={escalar}
            >
              {escalando ? 'Escalando…' : `Escalar ${marcados.size || ''}`.trim()}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export type { Vaga };
