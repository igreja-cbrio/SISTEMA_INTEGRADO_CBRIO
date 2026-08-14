import { Fragment, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, HelpCircle, Plus, Star, AlertTriangle, X } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { useEscalaMatriz, useMontagemContexto, useBulkSchedule, useDeleteSchedule, useVolServiceTypes } from '../../hooks';
import PainelEscalar, { type Vaga } from './PainelEscalar';

/**
 * MATRIZ da escala — o "Matrix" do Planning Center Services.
 *
 * Linhas = área × função · colunas = datas. É a visão que responde "onde estão
 * os buracos do meu mês?", que a tela de um culto por vez não responde: pra
 * saber onde faltava gente era preciso abrir culto por culto.
 *
 * ⚠️ A célula vazia é um BOTÃO ("2 vagas"), e clicar abre o MESMO painel
 * lateral da tela de um culto — mesma ordenação por rodízio, mesma trava de
 * disponibilidade, mesma gravação. Um segundo caminho de escalar teria as
 * próprias regras e divergiria do primeiro no dia em que uma delas mudasse.
 */

type Celula = { item_id: string | null; alvo: number; faltam: number; pessoas: any[] };
type Linha = {
  chave: string; team_id: string | null; team: string; cor: string | null;
  position_id: string | null; position: string | null; celulas: Record<string, Celula>;
};

function IconeStatus({ status }: { status: string }) {
  if (status === 'confirmed') return <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" />;
  if (status === 'declined') return <XCircle className="h-3 w-3 text-red-500 shrink-0" />;
  return <HelpCircle className="h-3 w-3 text-yellow-500 shrink-0" />;
}

export default function MatrizEscala({ ehMinhaArea, onFixar }: {
  ehMinhaArea: (teamId: string | null) => boolean;
  onFixar: (teamId: string | null) => void;
}) {
  const [semanas, setSemanas] = useState(4);
  const [tipoId, setTipoId] = useState('');
  const [soMinhas, setSoMinhas] = useState(false);
  const [celula, setCelula] = useState<{ servico: any; linha: Linha; cel: Celula } | null>(null);

  const { data: tipos = [] } = useVolServiceTypes();
  const { data, isLoading, error } = useEscalaMatriz({ semanas, service_type_id: tipoId || undefined }) as any;
  const { data: contexto, isLoading: contextoLoading } = useMontagemContexto(celula?.servico?.id) as any;
  const bulk = useBulkSchedule();
  const remover = useDeleteSchedule();
  const qc = useQueryClient();

  const cultos = (data?.cultos || []) as any[];
  const linhasTodas = (data?.linhas || []) as Linha[];

  const linhas = useMemo(
    () => (soMinhas ? linhasTodas.filter(l => ehMinhaArea(l.team_id)) : linhasTodas),
    [linhasTodas, soMinhas, ehMinhaArea],
  );

  // Agrupa por área para o cabeçalho de seção (como as colunas de equipe do
  // Services, só que deitadas).
  const grupos = useMemo(() => {
    const m = new Map<string, { team_id: string | null; team: string; cor: string | null; linhas: Linha[] }>();
    for (const l of linhas) {
      const k = l.team_id || l.team;
      if (!m.has(k)) m.set(k, { team_id: l.team_id, team: l.team, cor: l.cor, linhas: [] });
      m.get(k)!.linhas.push(l);
    }
    return [...m.values()];
  }, [linhas]);

  const escalar = (pessoas: any[], vaga: Vaga) => {
    const servicoId = celula?.servico?.id;
    if (!servicoId) return;
    bulk.mutate({
      service_id: servicoId,
      assignments: pessoas.map(p => ({
        volunteer_id: p.id,
        volunteer_name: p.full_name,
        team_id: vaga.team_id || undefined,
        team_name: vaga.team,
        position_id: vaga.position_id || undefined,
        position_name: vaga.position || undefined,
        escala_culto_item_id: vaga.item_id || undefined,
        planning_center_person_id: p.planning_center_id || undefined,
      })),
    } as any, {
      onSuccess: (r: any) => {
        toast.success(`${r.created} escalado(s) em ${vaga.team}`);
        if (r.pulados?.length) {
          toast.warning(`${r.pulados.length} não entrou por indisponibilidade: ${r.pulados.map((p: any) => p.nome).join(', ')}`, { duration: 10000 });
        }
        qc.invalidateQueries({ queryKey: ['vol', 'escala-matriz'] });
        setCelula(null);
      },
      onError: (e: any) => toast.error(e.message || 'Erro ao escalar'),
    });
  };

  // ⚠️ Tirar alguém tem que caber AQUI. Sem isso, o supervisor que enxerga o
  // erro na grade precisa sair dela, achar o culto na outra visão e remover lá
  // — e a matriz viraria uma tela de leitura que só sabe acrescentar.
  const tirarDaEscala = (p: any, culto: any) => {
    const quando = format(new Date(culto.scheduled_at), "dd/MM 'às' HH:mm");
    if (!confirm(`Tirar ${p.nome} da escala de ${quando}?`)) return;
    remover.mutate(p.id, {
      onSuccess: () => {
        toast.success(`${p.nome} saiu da escala de ${quando}`);
        qc.invalidateQueries({ queryKey: ['vol', 'escala-matriz'] });
      },
      onError: () => toast.error('Erro ao remover'),
    });
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Período:</span>
            {[2, 4, 8].map(n => (
              <button
                key={n} onClick={() => setSemanas(n)}
                className={`h-7 px-2.5 rounded-md border text-xs font-medium transition ${semanas === n ? 'border-[#00B39D] bg-[#00B39D]/10 text-[#00B39D]' : 'border-border hover:bg-muted/50'}`}
              >
                {n} sem
              </button>
            ))}
          </div>
          <select
            value={tipoId} onChange={e => setTipoId(e.target.value)}
            className="h-7 rounded-md border bg-background px-2 text-xs"
          >
            <option value="">Todos os cultos</option>
            {tipos.filter((t: any) => t.is_active).map((t: any) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
            <input type="checkbox" checked={soMinhas} onChange={e => setSoMinhas(e.target.checked)} className="accent-[#00B39D]" />
            Só as minhas áreas
          </label>
          {data?.resumo && (
            <span className="ml-auto text-xs">
              <span className="text-muted-foreground">no período: </span>
              <span className="font-medium">{data.resumo.preenchidas}/{data.resumo.alvo}</span>
              {data.resumo.faltam > 0 && <span className="text-red-500 font-medium"> · faltam {data.resumo.faltam}</span>}
            </span>
          )}
        </CardContent>
      </Card>

      {data?.truncado && (
        <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Há mais cultos no período do que cabe na grade — reduza as semanas ou filtre por tipo de culto.
        </p>
      )}

      {/* ⚠️ Erro NÃO se disfarça de grade vazia: "nenhum culto" e "a consulta
          falhou" levam a decisões opostas. */}
      {error ? (
        <Card><CardContent className="p-8 text-center">
          <p className="text-sm text-red-600 dark:text-red-400">Não foi possível carregar a matriz.</p>
          <p className="text-xs text-muted-foreground mt-1">{(error as any)?.message}</p>
        </CardContent></Card>
      ) : isLoading ? (
        <div className="text-center py-10 text-muted-foreground">Carregando a matriz…</div>
      ) : !cultos.length ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          Nenhum culto marcado nesse período.
        </CardContent></Card>
      ) : !linhas.length ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          {soMinhas
            ? 'Nenhuma das suas áreas aparece nesses cultos. Desmarque "só as minhas áreas" ou fixe uma área com a estrela.'
            : 'Estes cultos ainda não têm escala nem composição. Aplique um template na tela de um culto.'}
        </CardContent></Card>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card border-b border-r px-3 py-2 text-left text-xs font-semibold text-muted-foreground min-w-[180px]">
                  Área · Função
                </th>
                {cultos.map(c => (
                  <th key={c.id} className="border-b px-3 py-2 text-left min-w-[150px] bg-card">
                    <div className="text-xs font-semibold capitalize">
                      {format(new Date(c.scheduled_at), "EEE, dd/MM", { locale: ptBR })}
                    </div>
                    <div className="text-[11px] font-normal text-muted-foreground truncate">
                      {format(new Date(c.scheduled_at), 'HH:mm')} · {c.name}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-0.5 text-green-600"><CheckCircle2 className="h-3 w-3" />{c.status?.confirmados ?? 0}</span>
                      <span className="flex items-center gap-0.5 text-red-500"><XCircle className="h-3 w-3" />{c.status?.recusados ?? 0}</span>
                      <span className="flex items-center gap-0.5 text-yellow-600"><HelpCircle className="h-3 w-3" />{c.status?.pendentes ?? 0}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos.map(g => (
                // ⚠️ Fragment COM key: sem ela o React perde a identidade das
                // linhas ao reordenar (trocar o filtro) e a grade embaralha.
                <Fragment key={g.team_id || g.team}>
                  <tr className="bg-muted/40">
                    <td className="sticky left-0 z-10 bg-muted/60 border-b border-r px-3 py-1.5" colSpan={1}>
                      <div className="flex items-center gap-1.5">
                        {g.cor && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: g.cor }} />}
                        <span className="font-semibold text-xs truncate">{g.team}</span>
                        <button
                          onClick={() => onFixar(g.team_id)}
                          title={ehMinhaArea(g.team_id) ? 'Tirar das minhas áreas' : 'Fixar em "Minhas áreas"'}
                          className="text-muted-foreground/40 hover:text-[#00B39D] transition-colors"
                        >
                          <Star className={`h-3 w-3 ${ehMinhaArea(g.team_id) ? 'fill-[#00B39D] text-[#00B39D]' : ''}`} />
                        </button>
                      </div>
                    </td>
                    <td className="border-b" colSpan={cultos.length} />
                  </tr>
                  {g.linhas.map(l => (
                    <tr key={l.chave} className="hover:bg-accent/20">
                      <td className="sticky left-0 z-10 bg-card border-b border-r px-3 py-1.5 text-xs text-muted-foreground align-top">
                        {l.position || 'Equipe toda'}
                      </td>
                      {cultos.map(c => {
                        const cel = l.celulas[c.id];
                        return (
                          <td key={c.id} className="border-b px-2 py-1.5 align-top">
                            {cel?.pessoas?.map((p: any) => (
                              <div key={p.id} className="group/p flex items-center gap-1 min-w-0" title={p.nome}>
                                <IconeStatus status={p.status} />
                                <span className={`text-xs truncate ${p.status === 'declined' ? 'line-through text-muted-foreground' : ''}`}>
                                  {p.nome}
                                </span>
                                <button
                                  onClick={() => tirarDaEscala(p, c)}
                                  title="Tirar da escala"
                                  className="ml-auto shrink-0 text-muted-foreground/40 hover:text-destructive opacity-0 group-hover/p:opacity-100 focus:opacity-100 transition-opacity"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                            {cel && cel.faltam > 0 && (
                              <button
                                onClick={() => setCelula({ servico: c, linha: l, cel })}
                                className="mt-0.5 inline-flex items-center gap-1 rounded border border-dashed border-red-300 dark:border-red-900/60 px-1.5 py-0.5 text-[11px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                              >
                                <Plus className="h-3 w-3" /> {cel.faltam} vaga{cel.faltam > 1 ? 's' : ''}
                              </button>
                            )}
                            {/* Célula sem composição neste culto: a área existe
                                noutra data, mas aqui não há vaga definida — dizer
                                isso é melhor que uma célula em branco ambígua. */}
                            {!cel && <span className="text-[11px] text-muted-foreground/40">—</span>}
                            {cel && cel.alvo === 0 && cel.pessoas.length > 0 && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 mt-0.5">fora da composição</Badge>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PainelEscalar
        vaga={celula ? {
          team_id: celula.linha.team_id, team: celula.linha.team,
          position_id: celula.linha.position_id, position: celula.linha.position,
          item_id: celula.cel.item_id, faltam: celula.cel.faltam,
        } : null}
        pool={contexto?.pool || []}
        rodizio={contexto?.rodizio}
        carregando={contextoLoading}
        // ⚠️ A data vai no cabeçalho do painel: na matriz o supervisor tem 4
        // colunas abertas ao mesmo tempo, e escalar no domingo errado é o erro
        // que a grade torna fácil.
        subtitulo={celula ? format(new Date(celula.servico.scheduled_at), "EEEE, dd/MM 'às' HH:mm", { locale: ptBR }) : undefined}
        onClose={() => setCelula(null)}
        onEscalar={escalar}
        escalando={bulk.isPending}
      />
    </div>
  );
}
