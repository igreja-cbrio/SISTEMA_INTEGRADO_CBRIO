// As respostas do censo de UMA pessoa, abertas da ficha dela na membresia.
//
// Pedido do Matheus (07/08): "se eu responder o censo, a equipe de membresia deve
// conseguir ver isso nas minhas atividades e ver as minhas respostas".
//
// ⚠️ O bloco sensível (saúde emocional, casamento, "nunca teve coragem") é
// filtrado NO SERVIDOR, por `cen_acesso_sensivel`. Este componente não decide
// nada sobre isso: ele só mostra o que recebeu, e diz quantos itens ficaram
// ocultos — dizer "existe algo que você não vê" é mais honesto que entregar uma
// resposta incompleta parecendo completa.
import { useCallback, useEffect, useState } from 'react';
import { membresia } from '../../api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, Lock, ClipboardList } from 'lucide-react';

type Item = {
  pergunta_id: string;
  pergunta_texto: string | null;
  tipo: string;
  valor_texto: string | null;
  valor_num: number | null;
  valor_opcoes: string[] | null;
  sensivel: boolean;
  acao: string | null;
};

type Resposta = {
  id: string;
  pesquisa: string | null;
  concluida_em: string;
  canal: string;
  identificado_por: string;
  duracao_seg: number | null;
  itens: Item[];
  itens_sensiveis_ocultos: number;
};

const CANAL_LABEL: Record<string, string> = {
  qr: 'QR do culto', app: 'aplicativo', link: 'link', email: 'e-mail',
  whatsapp: 'WhatsApp', totem: 'totem', importado: 'importação',
};

function valorLegivel(i: Item) {
  if (i.valor_opcoes?.length) return i.valor_opcoes.join(' · ');
  if (i.valor_texto) return i.valor_texto;
  if (i.valor_num !== null && i.valor_num !== undefined) return String(i.valor_num);
  return '—';
}

export default function CensoRespostasDialog({ membroId, onClose }: { membroId: string; onClose: () => void }) {
  const [dados, setDados] = useState<{ respostas: Resposta[]; pode_ver_sensivel?: boolean } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try { setDados(await membresia.membros.censo(membroId)); }
    catch (e: unknown) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
  }, [membroId]);
  useEffect(() => { carregar(); }, [carregar]);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Respostas do censo
          </DialogTitle>
        </DialogHeader>

        {erro ? (
          <p className="text-sm text-destructive py-6 text-center">{erro}</p>
        ) : !dados ? (
          <div className="py-8 flex items-center justify-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : dados.respostas.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Esta pessoa ainda não respondeu nenhum censo.
          </p>
        ) : (
          <div className="space-y-6">
            {dados.respostas.map((r) => (
              <div key={r.id}>
                <div className="flex items-baseline justify-between gap-2 flex-wrap mb-3">
                  <h3 className="font-semibold text-sm">{r.pesquisa || 'Censo'}</h3>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.concluida_em).toLocaleDateString('pt-BR')}
                    {' · '}{CANAL_LABEL[r.canal] || r.canal}
                    {r.duracao_seg ? ` · ${Math.round(r.duracao_seg / 60)} min` : ''}
                  </p>
                </div>

                {r.itens_sensiveis_ocultos > 0 && (
                  <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 mb-3">
                    <Lock className="size-3.5 mt-0.5 text-muted-foreground shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      {r.itens_sensiveis_ocultos} resposta(s) do bloco de saúde emocional não
                      aparecem aqui. Elas ficam com a equipe designada para o acompanhamento
                      pastoral — não é o seu nível de acesso que decide isso, é uma lista
                      nomeada à parte.
                    </p>
                  </div>
                )}

                <dl className="space-y-2.5">
                  {r.itens.map((i) => (
                    <div key={i.pergunta_id} className="grid sm:grid-cols-[1fr_1fr] gap-1 sm:gap-3">
                      <dt className="text-xs text-muted-foreground flex items-start gap-1.5">
                        {i.pergunta_texto || i.pergunta_id}
                        {i.sensivel && (
                          <Badge variant="secondary" className="bg-rose-500/15 text-rose-600 shrink-0">
                            sensível
                          </Badge>
                        )}
                        {i.acao === 'cuidado' && (
                          <Badge variant="secondary" className="bg-sky-500/15 text-sky-600 shrink-0">
                            pedido
                          </Badge>
                        )}
                      </dt>
                      <dd className="text-sm">{valorLegivel(i)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
