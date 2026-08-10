// Respostas do censo, uma linha por PESSOA.
//
// Pedido do Matheus (10/08): "uma aba de respostas em forma de lista, com cada
// pessoa, para eu poder clicar e ver a resposta individual, e conseguir apagar a
// resposta de uma pessoa — apagando, é liberado pra ela fazer de novo".
//
// ⚠️ Esta é a tela mais NOMINAL do módulo: nome, contato e o que a pessoa
// respondeu. O bloco sensível já vem filtrado pelo SERVIDOR para quem não está
// na lista de acesso — aqui só mostramos que existe algo oculto, nunca o
// conteúdo. Não "melhorar" isso trazendo o item completo.
import { useCallback, useEffect, useState } from 'react';
import { censo } from '../../api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, Search, Trash2, Lock, User, UserX, ExternalLink } from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import { toast } from 'sonner';
import { normalizarBusca, contemNormalizado } from '@/lib/busca';

type Linha = {
  id: string;
  nome: string;
  na_base: boolean;
  contato: string | null;
  canal: string | null;
  identificado_por: string | null;
  concluida_em: string;
  duracao_seg: number | null;
};

type Item = {
  pergunta_id: string;
  pergunta_texto: string;
  tipo: string;
  valor_texto: string | null;
  valor_num: number | null;
  valor_opcoes: string[] | null;
  sensivel?: boolean;
  acao?: string | null;
};

type Detalhe = Linha & {
  itens: Item[];
  itens_sensiveis_ocultos: number;
  consentimento_em?: string | null;
};

const CANAL_LABEL: Record<string, string> = {
  qr: 'QR do culto', app: 'App do membro', link: 'Link', whatsapp: 'WhatsApp',
};

function quando(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function duracao(seg: number | null) {
  if (!seg || seg <= 0) return null;
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return m ? `${m}min${s ? ` ${s}s` : ''}` : `${s}s`;
}

/** O valor respondido, no formato de cada tipo. */
function valorLegivel(i: Item): string {
  if (i.valor_opcoes?.length) return i.valor_opcoes.join(', ');
  if (i.valor_num !== null && i.valor_num !== undefined) return String(i.valor_num);
  return i.valor_texto || '—';
}

export default function AbaRespostas({ pesquisaId, podeApagar }: {
  pesquisaId: string | null;
  podeApagar: boolean;
}) {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [confirmar, setConfirmar] = useState<Linha | null>(null);
  const [apagando, setApagando] = useState(false);

  const carregar = useCallback(async () => {
    if (!pesquisaId) return;
    setErro(null); setLinhas(null);
    try {
      setLinhas(await censo.respostas(pesquisaId, 500));
    } catch (e) {
      setErro((e as Error)?.message || 'Não foi possível carregar as respostas.');
    }
  }, [pesquisaId]);
  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (!aberta) { setDetalhe(null); return; }
    let vivo = true;
    censo.resposta(aberta)
      .then((d: Detalhe) => { if (vivo) setDetalhe(d); })
      .catch((e: Error) => { if (vivo) toast.error(e?.message || 'Erro ao abrir a resposta'); });
    return () => { vivo = false; };
  }, [aberta]);

  async function apagar() {
    if (!confirmar) return;
    setApagando(true);
    try {
      await censo.removerResposta(confirmar.id);
      // Tira da lista local em vez de recarregar: a ação já foi confirmada pelo
      // servidor e o recálculo da lista é caro (mesma régua das filas de Entradas).
      setLinhas((l) => (l ? l.filter((x) => x.id !== confirmar.id) : l));
      setConfirmar(null);
      setAberta(null);
      toast.success(`Resposta de ${confirmar.nome} apagada. Ela já pode responder de novo.`);
    } catch (e) {
      toast.error((e as Error)?.message || 'Não foi possível apagar');
    } finally {
      setApagando(false);
    }
  }

  if (!pesquisaId) {
    return <p className="text-sm text-muted-foreground">Escolha uma pesquisa acima.</p>;
  }
  if (erro) {
    return (
      <Card><CardContent className="p-5 space-y-3">
        <p className="text-sm text-red-600">{erro}</p>
        <Button variant="outline" size="sm" onClick={carregar}>Tentar de novo</Button>
      </CardContent></Card>
    );
  }
  if (linhas === null) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando respostas…
      </div>
    );
  }
  if (!linhas.length) {
    return (
      <EmptyState
        icone={User}
        titulo="Nenhuma resposta ainda"
        mensagem="Quando alguém concluir o censo, a resposta aparece aqui, uma linha por pessoa."
      />
    );
  }

  // Busca acento-insensível pela régua da casa (normaliza os DOIS lados).
  const filtradas = normalizarBusca(busca)
    ? linhas.filter((l) => contemNormalizado(l.nome, busca) || contemNormalizado(l.contato || '', busca))
    : linhas;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {linhas.length} resposta(s) concluída(s)
          {filtradas.length !== linhas.length && ` · ${filtradas.length} no filtro`}
        </p>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou contato"
            className="pl-8"
          />
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 text-left font-medium">Pessoa</th>
                <th className="px-3 py-2.5 text-left font-medium">Como respondeu</th>
                <th className="px-3 py-2.5 text-left font-medium">Quando</th>
                <th className="px-3 py-2.5 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((l) => (
                <tr key={l.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => setAberta(l.id)}
                      className="text-left font-medium hover:text-primary hover:underline"
                    >
                      {l.nome}
                    </button>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {l.na_base ? (
                        <span className="text-[11px] text-muted-foreground">no cadastro</span>
                      ) : (
                        <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-500">
                          <UserX className="size-3 mr-1" />sem cadastro
                        </Badge>
                      )}
                      {l.contato && (
                        <span className="text-[11px] text-muted-foreground tabular-nums">{l.contato}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {CANAL_LABEL[l.canal || ''] || l.canal || '—'}
                    {duracao(l.duracao_seg) && (
                      <span className="text-[11px]"> · {duracao(l.duracao_seg)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground tabular-nums whitespace-nowrap">
                    {quando(l.concluida_em)}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => setAberta(l.id)}>
                      <ExternalLink className="size-3.5 mr-1" />Ver
                    </Button>
                    {podeApagar && (
                      <Button
                        variant="ghost" size="sm"
                        className="text-muted-foreground hover:text-red-600"
                        onClick={() => setConfirmar(l)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── resposta individual ── */}
      <Dialog open={!!aberta} onOpenChange={(o) => !o && setAberta(null)}>
        <DialogContent className="max-w-2xl flex flex-col max-h-[85vh] p-0">
          <DialogHeader className="p-5 pb-3">
            <DialogTitle>{detalhe?.nome || 'Resposta'}</DialogTitle>
            <DialogDescription>
              {detalhe
                ? `${CANAL_LABEL[detalhe.canal || ''] || detalhe.canal || 'canal não informado'} · concluída em ${quando(detalhe.concluida_em)}`
                : 'Carregando…'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0 px-5 pb-2">
            {!detalhe ? (
              <div className="py-8 flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            ) : (
              <div className="space-y-3">
                {detalhe.itens_sensiveis_ocultos > 0 && (
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5 bg-muted/50 rounded-md p-2.5">
                    <Lock className="size-3.5 mt-0.5 shrink-0" />
                    {detalhe.itens_sensiveis_ocultos} resposta(s) do bloco sensível não aparecem
                    aqui. O acesso nominal a esse bloco é restrito à equipe de cuidado pastoral.
                  </p>
                )}
                {detalhe.itens.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma resposta visível.</p>
                ) : (
                  <dl className="space-y-2.5">
                    {detalhe.itens.map((i) => (
                      <div key={i.pergunta_id} className="border-b border-border/60 pb-2.5 last:border-0">
                        <dt className="text-xs text-muted-foreground">{i.pergunta_texto}</dt>
                        <dd className="text-sm mt-0.5 whitespace-pre-wrap break-words">
                          {valorLegivel(i)}
                          {i.acao === 'cuidado' && (
                            <Badge variant="secondary" className="ml-2 bg-sky-500/15 text-sky-600">
                              pedido de cuidado
                            </Badge>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="p-5 pt-3 border-t border-border">
            {podeApagar && detalhe && (
              <Button
                variant="outline"
                className="text-red-600 hover:text-red-700"
                onClick={() => {
                  const l = linhas.find((x) => x.id === detalhe.id);
                  if (l) setConfirmar(l);
                }}
              >
                <Trash2 className="size-4 mr-1.5" />Apagar esta resposta
              </Button>
            )}
            <Button variant="ghost" onClick={() => setAberta(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── confirmação de apagar ── */}
      <Dialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apagar a resposta de {confirmar?.nome}?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  As respostas dela saem dos gráficos e da cobertura, e ela fica
                  <b> liberada para responder de novo</b> — pelo app ou pelo QR.
                </p>
                <p className="text-muted-foreground">
                  O registro não é destruído: fica marcado como apagado, então dá para
                  recuperar se for engano.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmar(null)} disabled={apagando}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={apagar} disabled={apagando}>
              {apagando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
              Apagar e liberar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
