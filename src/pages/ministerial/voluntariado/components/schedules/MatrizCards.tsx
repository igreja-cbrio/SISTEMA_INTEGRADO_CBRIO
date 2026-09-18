import { useMemo, useState } from 'react';
import { CheckCircle2, XCircle, HelpCircle, Plus, Star, X, ChevronDown, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import AvatarVoluntario from './AvatarVoluntario';

/**
 * A MATRIZ em CARDS POR ÁREA — no estilo da tela de Escalas.
 *
 * Pedido do Matheus (26/08/2026), vendo a grade: *"a visualização não deve ser
 * assim, tá muito cansativa, deve ser nesse estilo de cards por área"* — e, ao
 * ser perguntado, *"sim, no estilo da tela de escalas"*.
 *
 * ⚠️ Mesmos dados da tabela, outra leitura. A tabela sobrevive (é a única visão
 * que responde "onde estão os buracos do MÊS" com as datas lado a lado); o que
 * mudou é o DEFAULT. Tirar a tabela porque a outra é mais bonita seria perder a
 * pergunta que só ela responde.
 *
 * ⚠️⚠️ NENHUMA régua vive aqui. Escalar, tirar e abrir o detalhe da pessoa são
 * callbacks do pai — o MESMO `PainelEscalar`, a MESMA trava de disponibilidade,
 * a MESMA gravação. Um segundo caminho de escalar teria regras próprias e
 * divergiria do primeiro no dia em que uma das duas mudasse (é a lei que a
 * própria matriz já seguia ao reusar o painel da tela de um culto).
 */

type Celula = { item_id: string | null; alvo: number; faltam: number; pessoas: any[] };
type Linha = {
  chave: string; team_id: string | null; team: string; area: string; cor: string | null;
  equipe_vinculada?: boolean;
  position_id: string | null; position: string | null; celulas: Record<string, Celula>;
};
type Subarea = { team_id: string | null; team: string; cor: string | null; vinculada: boolean; linhas: Linha[] };
type Grupo = { area: string; subareas: Subarea[] };

function IconeStatus({ status }: { status: string }) {
  if (status === 'confirmed') return <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />;
  if (status === 'declined') return <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />;
  return <HelpCircle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />;
}

type Contagem = { conf: number; dec: number; pend: number; alvo: number; faltam: number };

function contar(linhas: Linha[], cultoIds: string[]): Contagem {
  const c: Contagem = { conf: 0, dec: 0, pend: 0, alvo: 0, faltam: 0 };
  for (const l of linhas) {
    for (const id of cultoIds) {
      const cel = l.celulas[id];
      if (!cel) continue;
      c.alvo += cel.alvo || 0;
      c.faltam += cel.faltam || 0;
      for (const p of cel.pessoas || []) {
        if (p.status === 'confirmed') c.conf += 1;
        else if (p.status === 'declined') c.dec += 1;
        else c.pend += 1;
      }
    }
  }
  return c;
}

function Contadores({ c }: { c: Contagem }) {
  return (
    <div
      className="flex items-center gap-3 text-xs"
      title="confirmaram · avisaram que não vão · ainda sem resposta (contam como presentes)"
    >
      <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
        <CheckCircle2 className="h-3.5 w-3.5" /> {c.conf}
      </span>
      <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
        <XCircle className="h-3.5 w-3.5" /> {c.dec}
      </span>
      <span className="inline-flex items-center gap-1 text-amber-500 dark:text-amber-400">
        <HelpCircle className="h-3.5 w-3.5" /> {c.pend}
      </span>
      {c.faltam > 0 && (
        <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
          <Plus className="h-3.5 w-3.5" /> faltam {c.faltam}
        </span>
      )}
    </div>
  );
}

export default function MatrizCards({
  grupos, cultos, ehMinhaArea, onFixar, onVaga, onDetalhe, onTirar,
}: {
  grupos: Grupo[];
  cultos: any[];
  ehMinhaArea: (teamId: string | null) => boolean;
  onFixar: (teamId: string | null) => void;
  onVaga: (servico: any, linha: Linha, cel: Celula) => void;
  onDetalhe: (p: { id: string | null; nome: string }) => void;
  onTirar: (p: any, culto: any) => void;
}) {
  const cultoIds = useMemo(() => cultos.map(c => c.id), [cultos]);

  // ⚠️ Abre TODAS as áreas por padrão. Recolher por padrão esconderia o buraco
  // da escala atrás de um toque — e é justamente o buraco que a tela existe pra
  // mostrar. Quem quiser fechar, fecha.
  const [fechadas, setFechadas] = useState<Set<string>>(new Set());
  const alterna = (area: string) => setFechadas(s => {
    const n = new Set(s);
    if (n.has(area)) n.delete(area); else n.add(area);
    return n;
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
      {grupos.map(g => {
        const linhasDaArea = g.subareas.flatMap(s => s.linhas);
        const c = contar(linhasDaArea, cultoIds);
        const aberta = !fechadas.has(g.area);
        return (
          <div key={g.area} className="rounded-xl border bg-card self-start overflow-hidden">
            {/* Cabeçalho da área */}
            <button
              type="button"
              onClick={() => alterna(g.area)}
              aria-expanded={aberta}
              className="w-full flex items-start justify-between gap-2 p-3 border-b text-left hover:bg-accent/30 transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  {aberta ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <p className="font-semibold truncate" title={g.area}>{g.area}</p>
                </div>
                <div className="mt-1 pl-5"><Contadores c={c} /></div>
              </div>
              <span className="text-[11px] text-muted-foreground shrink-0 pt-0.5">
                {c.alvo > 0 ? `${Math.max(c.alvo - c.faltam, 0)}/${c.alvo}` : '—'}
              </span>
            </button>

            {aberta && (
              <div className="p-2 space-y-3">
                {/* ⚠️ Uma seção por CULTO, com a DATA escrita. Na matriz há
                    várias datas à vista, e escalar no domingo errado é o erro
                    que a visão de período torna fácil. */}
                {cultos.map(culto => {
                  const doCulto = linhasDaArea
                    .map(l => ({ linha: l, cel: l.celulas[culto.id] }))
                    .filter(x => x.cel && (x.cel.alvo > 0 || (x.cel.pessoas || []).length > 0));
                  return (
                    <div key={culto.id} className="rounded-lg border bg-background/40">
                      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b">
                        <p className="text-[11px] font-medium capitalize truncate">
                          {format(new Date(culto.scheduled_at), "EEE, dd/MM", { locale: ptBR })}
                          <span className="font-normal text-muted-foreground">
                            {' · '}{format(new Date(culto.scheduled_at), 'HH:mm')}
                          </span>
                        </p>
                        <span className="text-[10px] text-muted-foreground truncate max-w-[45%]" title={culto.name}>
                          {culto.name}
                        </span>
                      </div>

                      {!doCulto.length ? (
                        /* "vazio" escrito (pedido do Matheus, 14/08): a área
                           existe noutra data, mas aqui não há vaga definida —
                           um traço é ambíguo com "não carregou". */
                        <p className="px-2.5 py-2 text-[11px] text-muted-foreground/60">
                          vazio — nenhuma vaga definida neste culto
                        </p>
                      ) : (
                        <div className="p-1.5 space-y-2">
                          {g.subareas.map(sub => {
                            const linhasSub = doCulto.filter(x => (x.linha.team_id || `nome:${x.linha.team}`) === (sub.team_id || `nome:${sub.team}`));
                            if (!linhasSub.length) return null;
                            return (
                              <div key={sub.team_id || sub.team}>
                                <div className="flex items-center gap-1.5 px-1 mb-1">
                                  {sub.cor && <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: sub.cor }} />}
                                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{sub.team}</span>
                                  {/* ⚠️⚠️ TERCEIRO estado: a equipe é conhecida (o nome veio
                                      do Planning Center) mas não está vinculada a uma equipe do
                                      sistema — então ela não tem área, não entra na composição
                                      e o supervisor da área não a vê. Sem este selo, a tela
                                      mostrava o nome e ninguém entendia por que ela cai em
                                      "Sem área". */}
                                  {sub.vinculada === false && (
                                    <span
                                      className="shrink-0 rounded-full border border-amber-500/40 px-1.5 text-[9px] text-amber-600"
                                      title="A equipe veio do Planning Center e não está vinculada a uma equipe do sistema. Por isso não tem área e não entra na composição da escala."
                                    >não vinculada</span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => onFixar(sub.team_id)}
                                    title={ehMinhaArea(sub.team_id) ? 'Tirar das minhas áreas' : 'Fixar em "Minhas áreas"'}
                                    className="text-muted-foreground/40 hover:text-[#00B39D] transition-colors"
                                  >
                                    <Star className={`h-3 w-3 ${ehMinhaArea(sub.team_id) ? 'fill-[#00B39D] text-[#00B39D]' : ''}`} />
                                  </button>
                                </div>
                                {linhasSub.map(({ linha, cel }) => (
                                  <div key={linha.chave} className="pl-1">
                                    {linha.position && (
                                      <p className="text-[10px] text-muted-foreground/70 px-1">{linha.position}</p>
                                    )}
                                    <div className="space-y-0.5">
                                      {(cel!.pessoas || []).map((p: any) => (
                                        <div key={p.id} className="group/p flex items-center gap-2 p-1 rounded-lg hover:bg-muted/50">
                                          <AvatarVoluntario nome={p.nome} fotoUrl={p.foto_url} status={p.status} tamanho={24} />
                                          <button
                                            type="button"
                                            onClick={() => onDetalhe({ id: p.volunteer_id || null, nome: p.nome })}
                                            title={`Ver detalhes de ${p.nome}`}
                                            className={`text-xs truncate flex-1 text-left hover:underline focus:underline focus:outline-none ${p.status === 'declined' ? 'line-through text-muted-foreground' : ''}`}
                                          >
                                            {p.nome}
                                          </button>
                                          <IconeStatus status={p.status} />
                                          <button
                                            type="button"
                                            onClick={() => onTirar(p, culto)}
                                            title="Tirar da escala"
                                            className="shrink-0 text-muted-foreground/40 hover:text-destructive opacity-0 group-hover/p:opacity-100 focus:opacity-100 transition-opacity"
                                          >
                                            <X className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      ))}
                                      {/* A vaga em aberto mora DENTRO da área,
                                          como o "2 Needed" do Services — não num
                                          card de cobertura à parte. */}
                                      {cel!.faltam > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => onVaga(culto, linha, cel!)}
                                          className="w-full mt-0.5 inline-flex items-center gap-1 rounded border border-dashed border-red-300 dark:border-red-900/60 px-1.5 py-1 text-[11px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                                        >
                                          <Plus className="h-3 w-3" /> {cel!.faltam} vaga{cel!.faltam > 1 ? 's' : ''} em aberto · preencher
                                        </button>
                                      )}
                                      {cel!.alvo === 0 && (cel!.pessoas || []).length > 0 && (
                                        <p className="text-[9px] text-muted-foreground/70 px-1">fora da composição</p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
