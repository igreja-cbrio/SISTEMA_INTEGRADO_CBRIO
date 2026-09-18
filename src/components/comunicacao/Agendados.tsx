// Vista "Agendados" da aba Envios (F3 do redesenho · 09/09/2026).
//
// O que está programado, o que está pausado e o que já saiu — inclusive o
// "enviado agora" do botão Novo envio, que grava na MESMA tabela
// (wa_agendamentos) pra ficar no histórico. Criar e editar é o
// NovoEnvioModal; aqui só se lista, pausa/reativa e exclui.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Loader2, Pencil, Power, Repeat, Send, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { comunicacao } from '../../api';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

export type Agendamento = {
  id: string; nome: string; template_nome?: string | null; texto?: string | null; params?: string[] | null;
  audiencia?: { tipo?: string; telefones?: string[] } | null;
  quando?: string | null; recorrencia?: 'diaria' | 'semanal' | 'mensal' | null;
  dia_semana?: number | null; dia_mes?: number | null; hora?: string | null;
  ativo: boolean; ultimo_disparo?: string | null; created_at?: string | null; criado_por?: string | null;
};
export const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export function fmtDataHora(iso?: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return String(iso); }
}
/** "Enviado agora" grava quando = agora no mesmo instante do created_at. */
export function ehManual(a: Agendamento): boolean {
  if (a.recorrencia || !a.quando || !a.created_at) return false;
  const dq = Date.parse(a.quando); const dc = Date.parse(a.created_at);
  return Number.isFinite(dq) && Number.isFinite(dc) && Math.abs(dq - dc) < 60_000 && !!a.ultimo_disparo;
}
export type Situacao = 'proximo' | 'pausado' | 'enviado';
export function situacao(a: Agendamento): Situacao {
  if (a.recorrencia) return a.ativo ? 'proximo' : 'pausado';
  if (a.ultimo_disparo) return 'enviado';
  return a.ativo ? 'proximo' : 'pausado';
}
export function descreverQuando(a: Agendamento): string {
  if (ehManual(a)) return `Manual · ${fmtDataHora(a.ultimo_disparo)}`;
  if (a.quando) return `${a.ultimo_disparo ? 'Enviado' : 'Único'} · ${fmtDataHora(a.ultimo_disparo || a.quando)}`;
  const h = (a.hora || '').slice(0, 5);
  if (a.recorrencia === 'diaria') return `Diária · ${h || '09:00'}`;
  if (a.recorrencia === 'semanal') return `Semanal · ${DIAS_SEMANA[a.dia_semana ?? 0]} ${h}`;
  if (a.recorrencia === 'mensal') return `Mensal · dia ${a.dia_mes} ${h}`;
  return '—';
}

const TITULOS: Record<Situacao, { titulo: string; sub: string }> = {
  proximo: { titulo: 'Programados', sub: 'Vão sair pelo cron horário quando chegar a hora (única) ou toda vez que casar o dia (recorrente).' },
  pausado: { titulo: 'Pausados', sub: 'Não saem até alguém reativar.' },
  enviado: { titulo: 'Já enviados', sub: 'Únicos que já saíram e envios manuais. Cada mensagem está em Enviados, contexto comunicacao.*' },
};

export default function Agendados({ podeEscrever, podeExcluir, onEditar, refreshKey = 0 }: {
  podeEscrever: boolean; podeExcluir: boolean; onEditar: (a: Agendamento) => void; refreshKey?: number;
}) {
  const [lista, setLista] = useState<Agendamento[] | null>(null);
  const [erro, setErro] = useState(false);
  const [confirmarId, setConfirmarId] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setErro(false); setLista(null);
    comunicacao.agendamentos.list().then((r: Agendamento[]) => setLista(r || [])).catch(() => setErro(true));
  }, []);
  useEffect(() => { carregar(); }, [carregar, refreshKey]);

  const grupos = useMemo(() => {
    const g: Record<Situacao, Agendamento[]> = { proximo: [], pausado: [], enviado: [] };
    for (const a of lista || []) g[situacao(a)].push(a);
    // Programados: o mais próximo primeiro; enviados: o mais recente primeiro.
    g.proximo.sort((x, y) => String(x.quando || '9') .localeCompare(String(y.quando || '9')));
    g.enviado.sort((x, y) => String(y.ultimo_disparo || '').localeCompare(String(x.ultimo_disparo || '')));
    return g;
  }, [lista]);

  async function toggleAtivo(a: Agendamento) {
    setOcupado(a.id);
    try { await comunicacao.agendamentos.atualizar(a.id, { ativo: !a.ativo }); toast.success(a.ativo ? 'Pausado' : 'Reativado'); carregar(); }
    catch (e: unknown) { toast.error((e as Error)?.message || 'Erro'); }
    finally { setOcupado(null); }
  }
  async function remover(a: Agendamento) {
    setOcupado(a.id);
    try { await comunicacao.agendamentos.remover(a.id); toast.success('Excluído'); setConfirmarId(null); carregar(); }
    catch (e: unknown) { toast.error((e as Error)?.message || 'Erro ao excluir'); }
    finally { setOcupado(null); }
  }

  if (erro) {
    return (
      <div style={{ margin: 16, padding: 16, background: '#FCEBEB', border: '1px dashed #F09595', borderRadius: 8, textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#501313', marginBottom: 4 }}>Não foi possível carregar</div>
        <div style={{ fontSize: 11, color: '#791F1F', marginBottom: 10 }}>Falha ao listar os agendamentos.</div>
        <button onClick={carregar} style={{ background: '#E24B4A', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Tentar de novo</button>
      </div>
    );
  }
  if (!lista) return <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  if (lista.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Nenhum envio programado ainda. {podeEscrever ? 'Use "Novo envio" para enviar agora, agendar uma data ou criar uma recorrência.' : ''}
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {(['proximo', 'pausado', 'enviado'] as Situacao[]).map((sit) => {
        const itens = grupos[sit];
        if (itens.length === 0) return null;
        return (
          <section key={sit}>
            <div className="mb-2">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{TITULOS[sit].titulo} · {itens.length}</div>
              <div className="text-[11px] text-muted-foreground/80">{TITULOS[sit].sub}</div>
            </div>
            <div className="space-y-2">
              {itens.map((a) => {
                const manual = ehManual(a);
                const n = a.audiencia?.telefones?.length || 0;
                const Icone = manual ? Zap : a.recorrencia ? Repeat : CalendarClock;
                return (
                  <Card key={a.id} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Icone className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="font-semibold">{a.nome}</span>
                          {sit === 'proximo' && <Badge>{a.recorrencia ? 'recorrente' : 'agendado'}</Badge>}
                          {sit === 'pausado' && <Badge variant="secondary">pausado</Badge>}
                          {sit === 'enviado' && <Badge variant="outline" className="border-emerald-500/40 text-emerald-700">{manual ? 'enviado agora' : 'enviado'}</Badge>}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {descreverQuando(a)} · <b>{n}</b> destinatário{n === 1 ? '' : 's'}
                          {a.recorrencia && a.ultimo_disparo ? <> · último disparo {fmtDataHora(a.ultimo_disparo)}</> : null}
                        </div>
                        <div className="mt-1 text-xs">
                          {a.template_nome
                            ? <Badge variant="outline">template: {a.template_nome}</Badge>
                            : <span className="line-clamp-2 text-muted-foreground">{a.texto}</span>}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {sit !== 'enviado' && (
                          <>
                            <button title={a.ativo ? 'Pausar' : 'Reativar'} disabled={!podeEscrever || ocupado === a.id} onClick={() => toggleAtivo(a)}
                              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"><Power className="h-4 w-4" /></button>
                            <button title="Editar" disabled={!podeEscrever} onClick={() => onEditar(a)}
                              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-primary disabled:opacity-40"><Pencil className="h-4 w-4" /></button>
                          </>
                        )}
                        {confirmarId === a.id ? (
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="destructive" disabled={ocupado === a.id} onClick={() => remover(a)}>Excluir</Button>
                            <Button size="sm" variant="outline" onClick={() => setConfirmarId(null)}>Não</Button>
                          </div>
                        ) : (
                          <button title="Excluir" disabled={!podeExcluir} onClick={() => setConfirmarId(a.id)}
                            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Send className="h-3 w-3" /> Quem entrega é a fila (cron horário, com retentativa). O que saiu de fato está em Enviados.
      </p>
    </div>
  );
}
