// ════════════════════════════════════════════════════════════════════════════
//  LINKS E QR · o papel fica, o destino muda
//
//  Cada linha aqui é um QR que está (ou vai estar) impresso em algum lugar. A
//  tela é organizada em torno de duas perguntas que ninguém consegue responder
//  hoje: "para onde este cartaz leva?" e "alguém está escaneando?".
//
//  A coisa mais importante da tela é o que ela NÃO deixa fazer: o código não é
//  editável depois de criado. Trocar o código é exatamente o que a feature
//  existe para evitar — ele está impresso, e mudá-lo quebraria todo cartaz
//  pendurado sem nenhum aviso.
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';
import { links as api } from '../../api';
import { BASE_QR, sugerirSlug } from '@/lib/linksCurtos';
import { useAuth } from '../../contexts/AuthContext';
import EmptyState from '@/components/EmptyState';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import QrLinkDialog from '@/components/QrLinkDialog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Link2, Plus, QrCode, Loader2, Pencil, ExternalLink, Eye, EyeOff, MapPin, History,
} from 'lucide-react';

type Link = {
  link_id: string; slug: string; titulo: string; destino: string; ativo: boolean;
  onde: string | null; acessos: number; acessos_7d: number; acessos_30d: number;
  ultimo_acesso: string | null;
};


function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';
}

function Editor({ link, onFechar, onSalvo }: {
  link: Link | null; onFechar: () => void; onSalvo: () => void;
}) {
  const criando = !link;
  const [titulo, setTitulo] = useState(link?.titulo || '');
  const [slug, setSlug] = useState(link?.slug || '');
  const [slugTocado, setSlugTocado] = useState(!!link);
  const [destino, setDestino] = useState(link?.destino || '');
  const [onde, setOnde] = useState(link?.onde || '');
  const [salvando, setSalvando] = useState(false);

  // Enquanto ninguém editar o código à mão, ele acompanha o nome. Depois de
  // tocado, para de acompanhar — senão a pessoa perde o que digitou.
  function mudarTitulo(v: string) {
    setTitulo(v);
    if (criando && !slugTocado) setSlug(sugerirSlug(v));
  }

  async function salvar() {
    setSalvando(true);
    try {
      if (criando) await api.criar({ titulo, slug, destino, onde });
      else await api.atualizar(link!.link_id, { titulo, destino, onde });
      toast.success(criando ? 'Link criado' : 'Link atualizado');
      onSalvo(); onFechar();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Não consegui salvar');
    } finally { setSalvando(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{criando ? 'Novo link com QR' : 'Editar link'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Nome</Label>
            <Input value={titulo} onChange={(e) => mudarTitulo(e.target.value)}
              placeholder="Censo 2026 · cartaz da entrada" className="mt-1" />
          </div>

          <div>
            <Label className="text-xs">Endereço do QR</Label>
            {criando ? (
              <>
                <div className="flex items-center mt-1">
                  <span className="text-sm text-muted-foreground px-2 py-2 bg-muted rounded-l-md border border-r-0 border-input">
                    cbrio.org/r/
                  </span>
                  <Input value={slug} className="rounded-l-none"
                    onChange={(e) => { setSlugTocado(true); setSlug(sugerirSlug(e.target.value)); }}
                    placeholder="censo" />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Este endereço vai impresso no papel e <strong>não pode mudar depois</strong> —
                  é justamente o que faz o QR nunca precisar ser reimpresso. Só o destino muda.
                </p>
              </>
            ) : (
              <div className="mt-1 px-3 py-2 rounded-md bg-muted text-sm font-mono">
                cbrio.org/r/{link!.slug}
                <span className="ml-2 text-[11px] font-sans text-muted-foreground not-italic">
                  (fixo — está impresso)
                </span>
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs">Para onde leva hoje</Label>
            <Input value={destino} onChange={(e) => setDestino(e.target.value)}
              placeholder="https://www.cbrio.org/censo/p/censo-cbrio-2026" className="mt-1" />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Pode mudar quantas vezes quiser. Quem escanear a partir de agora vai para o
              novo destino, sem reimprimir nada.
            </p>
          </div>

          <div>
            <Label className="text-xs">Onde está impresso <span className="text-muted-foreground">(opcional)</span></Label>
            <Input value={onde} onChange={(e) => setOnde(e.target.value)}
              placeholder="Banner da entrada, verso do cartão de visitante" className="mt-1" />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Daqui a seis meses, isto é o que impede o link de virar intocável por medo de
              quebrar algo que ninguém lembra onde está.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || !titulo.trim() || !destino.trim() || (criando && slug.length < 3)}>
            {salvando && <Loader2 className="size-4 mr-1.5 animate-spin" />}
            {criando ? 'Criar' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Links() {
  // ⚠️ getAccessLevel recebe um ARRAY e faz `moduleNames.some(...)` por dentro.
  // Passar a string 'links' derrubava a página inteira com "some is not a
  // function" — e o TypeScript não pegava porque o AuthContext é .jsx e o
  // retorno chegava como `any`. O tipo abaixo é o que faz o compilador pegar
  // isso da próxima vez.
  const { getAccessLevel } = useAuth() as { getAccessLevel?: (m: string[]) => number };
  const nivel = typeof getAccessLevel === 'function' ? getAccessLevel(['links']) : 1;
  const podeEditar = nivel >= 4;

  const [lista, setLista] = useState<Link[] | null>(null);
  const [editando, setEditando] = useState<Link | null | undefined>(undefined);
  const [qr, setQr] = useState<Link | null>(null);
  const [historico, setHistorico] = useState<{ link: Link; itens: { destino_antigo: string | null; destino_novo: string; alterado_em: string }[] } | null>(null);

  const carregar = useCallback(async () => {
    try { setLista(await api.listar()); }
    catch { toast.error('Não consegui carregar os links'); setLista([]); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function alternarAtivo(l: Link) {
    try {
      await api.atualizar(l.link_id, { ativo: !l.ativo });
      toast.success(l.ativo ? 'Link desativado' : 'Link reativado');
      carregar();
    } catch { toast.error('Não consegui alterar'); }
  }

  async function verHistorico(l: Link) {
    try {
      const d = await api.obter(l.link_id);
      setHistorico({ link: l, itens: d.historico || [] });
    } catch { toast.error('Não consegui carregar o histórico'); }
  }

  return (
    <div className="cbrio-glass-scope max-w-5xl mx-auto p-4 md:p-6 space-y-5">
      <ModuleHeader
        icon={QrCode}
        title="Links e QR"
        subtitle="QR code que não precisa ser reimpresso: o código fica no papel, o destino muda aqui"
        actions={podeEditar ? (
          <Button onClick={() => setEditando(null)}>
            <Plus className="size-4 mr-1" /> Novo link
          </Button>
        ) : null}
      />

      {lista === null ? (
        <div className="p-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando…
        </div>
      ) : lista.length === 0 ? (
        <EmptyState
          icone={Link2}
          titulo="Nenhum link ainda"
          mensagem={podeEditar
            ? 'Crie o primeiro. A partir daí, todo QR que você imprimir aponta para um endereço estável — e quando o destino mudar, você troca aqui em vez de mandar imprimir tudo de novo.'
            : 'Nenhum link curto foi criado ainda.'}
        />
      ) : (
        <div className="space-y-3">
          {lista.map((l) => (
            <Card key={l.link_id} className={l.ativo ? '' : 'opacity-60'}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold truncate">{l.titulo}</h3>
                      {!l.ativo && <Badge variant="secondary">desativado</Badge>}
                    </div>
                    <p className="text-sm font-mono text-primary mt-0.5">cbrio.org/r/{l.slug}</p>
                    <a href={l.destino} target="_blank" rel="noreferrer"
                      className="text-xs text-muted-foreground hover:text-foreground truncate block mt-1">
                      → {l.destino}
                    </a>
                    {l.onde && (
                      <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                        <MapPin className="size-3" /> {l.onde}
                      </p>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-xl font-semibold tabular-nums">{l.acessos}</p>
                    <p className="text-[11px] text-muted-foreground">
                      escaneamentos<br />
                      {l.acessos_7d} nos últimos 7 dias
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      último: {fmt(l.ultimo_acesso)}
                    </p>
                  </div>
                </div>

                <div className="flex gap-1.5 mt-3 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => setQr(l)}>
                    <QrCode className="size-3.5 mr-1" /> QR
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <a href={`${BASE_QR}${l.slug}`} target="_blank" rel="noreferrer">
                      <ExternalLink className="size-3.5 mr-1" /> Testar
                    </a>
                  </Button>
                  {podeEditar && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setEditando(l)}>
                        <Pencil className="size-3.5 mr-1" /> Editar destino
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => verHistorico(l)}>
                        <History className="size-3.5 mr-1" /> Histórico
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => alternarAtivo(l)}>
                        {l.ativo ? <EyeOff className="size-3.5 mr-1" /> : <Eye className="size-3.5 mr-1" />}
                        {l.ativo ? 'Desativar' : 'Reativar'}
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editando !== undefined && (
        <Editor link={editando} onFechar={() => setEditando(undefined)} onSalvo={carregar} />
      )}

      {qr && (
        <QrLinkDialog
          link={`${BASE_QR}${qr.slug}`}
          titulo={qr.titulo}
          nomeArquivo={`qr-${qr.slug}`}
          descricao="Este QR pode ser impresso à vontade: se o destino mudar, você troca no sistema e o papel continua valendo."
          onClose={() => setQr(null)}
        />
      )}

      {historico && (
        <Dialog open onOpenChange={(o) => { if (!o) setHistorico(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Para onde este QR já apontou</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {historico.itens.length === 0 ? (
                <p className="text-sm text-muted-foreground">O destino nunca mudou.</p>
              ) : historico.itens.map((h, i) => (
                <div key={i} className="text-xs border-l-2 border-border pl-3 py-1">
                  <p className="text-muted-foreground">
                    {new Date(h.alterado_em).toLocaleString('pt-BR')}
                  </p>
                  <p className="break-all">{h.destino_novo}</p>
                  {h.destino_antigo && (
                    <p className="break-all text-muted-foreground line-through">{h.destino_antigo}</p>
                  )}
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
