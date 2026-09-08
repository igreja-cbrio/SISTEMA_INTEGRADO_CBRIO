// Equipe de atendimento (Comunicação → Bot → Equipe) · 08/09/2026.
//
// Pedido do Marcos: "gerenciamento de atendentes junto do fluxo do bot — quem é
// responsável por receber as mensagens daquela área; uma pessoa pode ser
// responsável por mais de uma área". Matriz ÁREA × (titular · suplente). O
// menu de setores, a resposta a disparo, a IA e a triagem humana passam a
// ATRIBUIR a conversa ao titular e a avisar só ele — em vez de avisar as 6–9
// pessoas do organograma da área e ninguém assumir.
//
// A linha "Entrada" é a que mais importa hoje: com o menu desligado, toda
// conversa nova cai lá e, sem titular, ninguém é avisado (medido em 08/09:
// 162 das 232 conversas estavam na Entrada).
import { useState, useEffect, useCallback } from 'react';
import { comunicacao } from '@/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Users, AlertTriangle, RefreshCw, Inbox } from 'lucide-react';

type Colab = { id: string; name: string; avatar_url: string | null };
type Linha = { area: string; titular_id: string | null; suplente_id: string | null; configurada: boolean; fora_do_catalogo?: boolean };
type Resp = { migration_ok: boolean; linhas: Linha[]; colaboradores: Colab[] };

const NENHUM = '__nenhum__';

function iniciais(nome: string) {
  return nome.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
}

export default function EquipeAtendimento({ podeEscrever }: { podeEscrever: boolean }) {
  const [dados, setDados] = useState<Resp | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setErro(null);
    comunicacao.equipe.list().then((r: Resp) => setDados(r)).catch((e: any) => setErro(e?.message || 'Falha ao carregar a equipe'));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const colab = (id: string | null) => (id ? dados?.colaboradores.find(c => c.id === id) || null : null);

  async function salvar(linha: Linha, patch: Partial<Pick<Linha, 'titular_id' | 'suplente_id'>>) {
    if (!dados || !podeEscrever) return;
    const novo = { titular_id: linha.titular_id, suplente_id: linha.suplente_id, ...patch };
    if (novo.titular_id && novo.suplente_id && novo.titular_id === novo.suplente_id) {
      toast.error('Titular e suplente não podem ser a mesma pessoa.');
      return;
    }
    // otimista: a linha muda na hora; erro do servidor recarrega o estado real
    setDados(d => d ? { ...d, linhas: d.linhas.map(l => l.area === linha.area ? { ...l, ...novo, configurada: !!(novo.titular_id || novo.suplente_id) } : l) } : d);
    setSalvando(linha.area);
    try {
      await comunicacao.equipe.salvar(linha.area, novo);
      toast.success(`${linha.area}: equipe salva`);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar');
      carregar();
    } finally { setSalvando(null); }
  }

  const configuradas = dados?.linhas.filter(l => l.configurada).length ?? 0;
  const entrada = dados?.linhas.find(l => l.area === 'Entrada');

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold"><Users className="h-4 w-4 text-primary" />Equipe de atendimento</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Quem recebe as conversas de cada área. A conversa que chega pela área (menu, resposta a disparo, bot de IA ou
              triagem manual) nasce <b>atribuída ao titular</b>, e só ele é avisado. Sem titular, entra o suplente; sem os dois,
              vale o de sempre: aviso pra todo mundo do organograma da área e ninguém assume.
            </p>
          </div>
          <button onClick={carregar} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Atualizar"><RefreshCw className="h-4 w-4" /></button>
        </div>
        {dados && !dados.migration_ok && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            A migration <code>20260908160000_wa_equipe_atendimento</code> ainda não foi aplicada. Nada é gravado até aplicar; enquanto isso as conversas seguem avisando a área inteira.
          </div>
        )}
        {dados && dados.migration_ok && entrada && !entrada.configurada && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
            <Inbox className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span><b>A Entrada está sem titular.</b> Com o menu desligado, toda conversa nova cai nela — e sem titular ninguém é avisado. É a linha que mais vale preencher.</span>
          </div>
        )}
      </Card>

      {erro ? (
        <Card className="p-6 text-center text-sm">
          <p className="font-medium text-destructive">Não foi possível carregar a equipe</p>
          <p className="mt-1 text-xs text-muted-foreground">{erro}</p>
        </Card>
      ) : !dados ? (
        <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5 text-[11px] text-muted-foreground">
            <span>{configuradas} de {dados.linhas.length} áreas com alguém responsável</span>
            {!podeEscrever && <span>modo leitura · pede nível 3 em Comunicação</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-medium">Área</th>
                  <th className="px-4 py-2.5 text-left font-medium">Titular</th>
                  <th className="px-4 py-2.5 text-left font-medium">Suplente</th>
                  <th className="px-4 py-2.5 text-left font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {dados.linhas.map(l => (
                  <tr key={l.area} className={`border-b border-border/60 ${l.area === 'Entrada' ? 'bg-amber-500/5' : ''}`}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2 font-medium">
                        {l.area === 'Entrada' ? <Inbox className="h-4 w-4 text-amber-500" /> : <Users className="h-4 w-4 text-muted-foreground" />}
                        {l.area}
                        {l.area === 'Entrada' && <span className="text-[10px] font-normal text-muted-foreground">conversa ainda sem área</span>}
                        {l.fora_do_catalogo && <Badge variant="outline" className="text-[10px]">área inativa</Badge>}
                      </div>
                    </td>
                    {(['titular_id', 'suplente_id'] as const).map(campo => {
                      const atual = colab(l[campo]);
                      return (
                        <td key={campo} className="px-4 py-2">
                          <Select value={l[campo] || NENHUM} disabled={!podeEscrever || !dados.migration_ok || salvando === l.area}
                            onValueChange={v => salvar(l, { [campo]: v === NENHUM ? null : v } as any)}>
                            <SelectTrigger className="h-9 min-w-[200px]">
                              <SelectValue placeholder="— ninguém —">
                                {atual ? (
                                  <span className="flex items-center gap-2">
                                    <Avatar className="h-5 w-5">{atual.avatar_url && <AvatarImage src={atual.avatar_url} />}<AvatarFallback className="text-[8px]">{iniciais(atual.name)}</AvatarFallback></Avatar>
                                    <span className="truncate">{atual.name}</span>
                                  </span>
                                ) : <span className="text-muted-foreground">— ninguém —</span>}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NENHUM}>— ninguém —</SelectItem>
                              {dados.colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                      );
                    })}
                    <td className="px-4 py-2.5">
                      {salvando === l.area ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        : l.titular_id ? <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-400">titular recebe</Badge>
                        : l.suplente_id ? <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-[10px] text-sky-700 dark:text-sky-400">só suplente</Badge>
                        : <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300">avisa a área toda</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
