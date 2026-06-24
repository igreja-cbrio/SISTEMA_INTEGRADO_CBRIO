// ============================================================================
// Totem Kids · Solicitações de vínculo (criança↔responsável) feitas pelo app
// ============================================================================
// O responsável pede pelo app informando o nome da criança + o nome dos pais
// (mãe e/ou pai) e, opcionalmente, uma foto da criança (com consentimento).
// Aqui a equipe Kids confere e APROVA (cria o vínculo) ou REJEITA. Segurança
// de menor: nada de vínculo automático. (Docs legados aparecem nas pendentes
// antigas, quando houver.)
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, ShieldCheck, Clock, Check, X, FileText, Baby, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { totemKids } from '@/api';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Solicitacao = {
  id: string;
  solicitante_nome: string;
  solicitante_telefone: string | null;
  solicitante_parentesco: string;
  crianca_nome: string;
  crianca_data_nascimento: string | null;
  mae_nome: string | null;
  pai_nome: string | null;
  status: string;
  motivo_rejeicao: string | null;
  observacao: string | null;
  created_at: string;
  decidido_em: string | null;
  decidido_por_nome: string | null;
};

type Detalhe = Solicitacao & {
  crianca_foto_url: string | null;
  // legado (solicitações antigas com documentos)
  crianca_doc_url: string | null;
  doc_pai_url: string | null;
  doc_mae_url: string | null;
};

const PARENTESCO_LABEL: Record<string, string> = {
  mae: 'Mãe', pai: 'Pai', avo_a: 'Avó/Avô', tio_a: 'Tio/Tia', tutor: 'Tutor(a)', outro: 'Responsável',
};

export default function TotemKidsVinculos() {
  const navigate = useNavigate();
  const [aba, setAba] = useState<'pendente' | 'aprovado' | 'rejeitado'>('pendente');
  const [lista, setLista] = useState<Solicitacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [modoRejeitar, setModoRejeitar] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const data = await totemKids.vinculos.list(aba);
      setLista(data || []);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro ao carregar solicitações');
    } finally {
      setCarregando(false);
    }
  }, [aba]);

  useEffect(() => { carregar(); }, [carregar]);

  async function abrirDetalhe(id: string) {
    setCarregandoDetalhe(true);
    setModoRejeitar(false);
    setMotivoRejeicao('');
    try {
      const d = await totemKids.vinculos.get(id);
      setDetalhe(d);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro ao abrir solicitação');
    } finally {
      setCarregandoDetalhe(false);
    }
  }

  async function aprovar() {
    if (!detalhe) return;
    setProcessando(true);
    try {
      await totemKids.vinculos.aprovar(detalhe.id);
      toast.success(`Vínculo aprovado · ${detalhe.crianca_nome} ↔ ${detalhe.solicitante_nome}`);
      setDetalhe(null);
      carregar();
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro ao aprovar');
    } finally {
      setProcessando(false);
    }
  }

  async function rejeitar() {
    if (!detalhe) return;
    setProcessando(true);
    try {
      await totemKids.vinculos.rejeitar(detalhe.id, motivoRejeicao.trim() || null);
      toast.success('Solicitação recusada');
      setDetalhe(null);
      carregar();
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro ao rejeitar');
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-3 md:p-4 space-y-3 md:space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate('/ministerial/totem-kids')}>
          <ArrowLeft className="h-4 w-4 md:mr-1" /> <span className="hidden md:inline">Check-in</span>
        </Button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-pink-700 dark:text-pink-300 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Vínculos · solicitações do app
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Confira os dados antes de aprovar. O vínculo libera o pré-check-in pelo app.
          </p>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-2">
        {(['pendente', 'aprovado', 'rejeitado'] as const).map((a) => (
          <Button
            key={a}
            variant={aba === a ? 'default' : 'outline'}
            size="sm"
            className={aba === a ? 'bg-pink-600 hover:bg-pink-700' : ''}
            onClick={() => setAba(a)}
          >
            {a === 'pendente' ? 'Pendentes' : a === 'aprovado' ? 'Aprovadas' : 'Recusadas'}
          </Button>
        ))}
      </div>

      {carregando ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-pink-500" /></div>
      ) : lista.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          Nenhuma solicitação {aba === 'pendente' ? 'pendente' : aba === 'aprovado' ? 'aprovada' : 'recusada'}.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {lista.map((s) => (
            <button
              key={s.id}
              onClick={() => abrirDetalhe(s.id)}
              className="w-full text-left flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-pink-50 dark:hover:bg-pink-950/30 transition"
            >
              <div className="h-11 w-11 rounded-full bg-pink-100 dark:bg-pink-900/40 flex items-center justify-center shrink-0">
                <Baby className="h-6 w-6 text-pink-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{s.crianca_nome}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {PARENTESCO_LABEL[s.solicitante_parentesco] || 'Responsável'}: {s.solicitante_nome}
                  {' · '}{format(new Date(s.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                </div>
              </div>
              {s.status === 'pendente' && <Badge variant="outline" className="text-amber-600 border-amber-400"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>}
              {s.status === 'aprovado' && <Badge variant="outline" className="text-green-600 border-green-400"><Check className="h-3 w-3 mr-1" />Aprovada</Badge>}
              {s.status === 'rejeitado' && <Badge variant="outline" className="text-red-600 border-red-400"><X className="h-3 w-3 mr-1" />Recusada</Badge>}
            </button>
          ))}
        </div>
      )}

      {/* Modal de detalhe */}
      <Dialog open={!!detalhe || carregandoDetalhe} onOpenChange={(o) => { if (!o) { setDetalhe(null); setModoRejeitar(false); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Conferir solicitação de vínculo</DialogTitle>
            <DialogDescription>Confira os dados antes de decidir. Informações confidenciais.</DialogDescription>
          </DialogHeader>

          {carregandoDetalhe || !detalhe ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-pink-500" /></div>
          ) : (
            <div className="space-y-4">
              {detalhe.crianca_foto_url && (
                <div className="flex justify-center">
                  <img
                    src={detalhe.crianca_foto_url}
                    alt={`Foto de ${detalhe.crianca_nome}`}
                    className="h-28 w-28 rounded-lg object-cover border"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground text-xs">Criança</div>
                  <div className="font-medium">{detalhe.crianca_nome}</div>
                  {detalhe.crianca_data_nascimento && (
                    <div className="text-xs text-muted-foreground">
                      Nasc.: {format(new Date(detalhe.crianca_data_nascimento + 'T00:00:00'), 'dd/MM/yyyy')}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">{PARENTESCO_LABEL[detalhe.solicitante_parentesco] || 'Responsável'}</div>
                  <div className="font-medium">{detalhe.solicitante_nome}</div>
                  {detalhe.solicitante_telefone && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{detalhe.solicitante_telefone}</div>
                  )}
                </div>
              </div>

              {/* Nome dos pais informados pelo responsável */}
              {(detalhe.mae_nome || detalhe.pai_nome) && (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-muted-foreground text-xs">Mãe</div>
                    <div className="font-medium">{detalhe.mae_nome || '—'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Pai</div>
                    <div className="font-medium">{detalhe.pai_nome || '—'}</div>
                  </div>
                </div>
              )}

              {detalhe.observacao && (
                <div className="text-sm bg-muted/50 rounded-md p-2">
                  <span className="text-muted-foreground text-xs">Observação: </span>{detalhe.observacao}
                </div>
              )}

              {/* Documentos legados (solicitações antigas) */}
              {(detalhe.crianca_doc_url || detalhe.doc_pai_url || detalhe.doc_mae_url) && (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground font-medium">Documentos enviados (solicitação antiga)</div>
                  <div className="grid grid-cols-1 gap-2">
                    {detalhe.crianca_doc_url && <DocLink label="Documento da criança" url={detalhe.crianca_doc_url} />}
                    {detalhe.doc_pai_url && <DocLink label="Documento do pai" url={detalhe.doc_pai_url} />}
                    {detalhe.doc_mae_url && <DocLink label="Documento da mãe" url={detalhe.doc_mae_url} />}
                  </div>
                </div>
              )}

              {detalhe.status === 'pendente' ? (
                modoRejeitar ? (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Motivo da recusa (opcional · será mostrado ao responsável)"
                      value={motivoRejeicao}
                      onChange={(e) => setMotivoRejeicao(e.target.value)}
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => setModoRejeitar(false)} disabled={processando}>Voltar</Button>
                      <Button variant="destructive" className="flex-1" onClick={rejeitar} disabled={processando}>
                        {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <><X className="h-4 w-4 mr-1" /> Confirmar recusa</>}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 pt-2 border-t">
                    <Button variant="outline" className="flex-1 text-red-600 hover:text-red-700" onClick={() => setModoRejeitar(true)} disabled={processando}>
                      <X className="h-4 w-4 mr-1" /> Recusar
                    </Button>
                    <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={aprovar} disabled={processando}>
                      {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1" /> Aprovar vínculo</>}
                    </Button>
                  </div>
                )
              ) : (
                <div className="text-sm text-muted-foreground pt-2 border-t">
                  {detalhe.status === 'aprovado' ? 'Aprovada' : 'Recusada'}
                  {detalhe.decidido_por_nome && ` por ${detalhe.decidido_por_nome}`}
                  {detalhe.decidido_em && ` em ${format(new Date(detalhe.decidido_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`}
                  {detalhe.motivo_rejeicao && <div className="mt-1">Motivo: {detalhe.motivo_rejeicao}</div>}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocLink({ label, url }: { label: string; url: string | null }) {
  if (!url) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-md border border-dashed text-muted-foreground text-sm">
        <FileText className="h-4 w-4" /> {label} · não enviado
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 rounded-md border bg-card hover:bg-accent transition text-sm font-medium">
      <FileText className="h-4 w-4 text-pink-500" /> {label}
      <span className="ml-auto text-xs text-muted-foreground">abrir ↗</span>
    </a>
  );
}
