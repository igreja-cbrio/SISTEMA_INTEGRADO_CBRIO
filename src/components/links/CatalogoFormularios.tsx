// ════════════════════════════════════════════════════════════════════════════
//  Todo formulário público do sistema, num lugar só
//
//  Pedido do Matheus: "dá para mostrar todos os QR codes do sistema, de todos os
//  formulários?". Até aqui cada QR morava na tela do seu módulo, e a pergunta
//  "quais QRs existem?" não tinha onde ser respondida.
//
//  A informação que a tela realmente entrega não é a lista — é a MARCA DE
//  ESTADO: quais desses já estão protegidos (dinâmicos) e quais ainda vão
//  obrigar a reimprimir tudo se o endereço mudar. É a diferença entre um
//  inventário e um alerta.
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';
import { links as api } from '../../api';
import { BASE_QR } from '@/lib/linksCurtos';
import QrLinkDialog from '@/components/QrLinkDialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, QrCode, ExternalLink, ShieldCheck, ShieldAlert, Lock } from 'lucide-react';

type Item = {
  chave: string; nome: string; grupo: string; url: string; descricao: string;
  /** Frase do cartaz do telão · vem do catálogo, só onde a igreja definiu uma. */
  chamada_qr?: string | null;
  link_curto: { slug: string; titulo: string } | null;
};
type Catalogo = { base: string; itens: Item[]; excluidos_por_serem_pessoais: string[] };

export default function CatalogoFormularios({ podeEditar, onMudou }: {
  podeEditar: boolean; onMudou: () => void;
}) {
  const [d, setD] = useState<Catalogo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [convertendo, setConvertendo] = useState<string | null>(null);
  const [qr, setQr] = useState<
    { link: string; titulo: string; dinamico: boolean; chamada?: string | null } | null
  >(null);

  const carregar = useCallback(async () => {
    try { setD(await api.catalogo()); }
    catch (e: unknown) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function tornarDinamico(i: Item) {
    setConvertendo(i.chave);
    try {
      const r = await api.paraDestino({ destino: i.url, titulo: i.nome });
      toast.success(r.reusado
        ? `Já existia um link curto para este formulário: /r/${r.slug}`
        : `Pronto: cbrio.org/r/${r.slug}. Agora esse QR pode ser impresso sem medo.`);
      await carregar();
      onMudou();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Não consegui converter');
    } finally { setConvertendo(null); }
  }

  if (erro) return <p className="text-sm text-destructive py-6 text-center">{erro}</p>;
  if (!d) {
    return (
      <div className="py-10 flex items-center justify-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="size-4 animate-spin" /> Levantando os formulários…
      </div>
    );
  }

  const semProtecao = d.itens.filter((i) => !i.link_curto).length;
  const grupos = [...new Set(d.itens.map((i) => i.grupo))];

  return (
    <div className="space-y-5">
      <Card className={semProtecao
        ? 'border-amber-500/30 bg-amber-500/5' : 'border-emerald-500/30 bg-emerald-500/5'}>
        <CardContent className="p-4 text-sm">
          {semProtecao ? (
            <>
              <p className="font-medium mb-1">
                {semProtecao} de {d.itens.length} formulários ainda gravam o endereço final no QR.
              </p>
              <p className="text-muted-foreground">
                Se um desses for impresso e o endereço mudar depois, não tem conserto — só
                reimprimindo. Converter leva um clique e não muda nada para quem usa o
                formulário hoje.
              </p>
            </>
          ) : (
            <p className="font-medium">
              Todos os formulários já têm link dinâmico. Pode imprimir qualquer um deles.
            </p>
          )}
        </CardContent>
      </Card>

      {grupos.map((g) => (
        <div key={g}>
          <h3 className="text-sm font-semibold text-primary border-b border-border pb-1.5 mb-2.5">{g}</h3>
          <div className="space-y-2">
            {d.itens.filter((i) => i.grupo === g).map((i) => (
              <Card key={i.chave}>
                <CardContent className="p-3.5">
                  <div className="flex items-start gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium text-sm truncate">{i.nome}</h4>
                        {i.link_curto ? (
                          <Badge variant="secondary"
                            className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-500">
                            <ShieldCheck className="size-3 mr-1" /> dinâmico
                          </Badge>
                        ) : (
                          <Badge variant="secondary"
                            className="bg-amber-500/15 text-amber-700 dark:text-amber-500">
                            <ShieldAlert className="size-3 mr-1" /> endereço fixo
                          </Badge>
                        )}
                      </div>
                      {i.link_curto ? (
                        <p className="text-xs font-mono text-primary mt-0.5">
                          cbrio.org/r/{i.link_curto.slug}
                        </p>
                      ) : (
                        <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">
                          {i.url.replace(/^https?:\/\//, '')}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-0.5">{i.descricao}</p>
                    </div>

                    <div className="flex gap-1.5 flex-wrap shrink-0">
                      <Button size="sm" variant="outline" onClick={() => setQr({
                        link: i.link_curto ? `${BASE_QR}${i.link_curto.slug}` : i.url,
                        titulo: i.nome,
                        dinamico: !!i.link_curto,
                        chamada: i.chamada_qr,
                      })}>
                        <QrCode className="size-3.5 mr-1" /> QR
                      </Button>
                      <Button size="sm" variant="ghost" asChild>
                        <a href={i.url} target="_blank" rel="noreferrer" aria-label={`Abrir ${i.nome}`}>
                          <ExternalLink className="size-3.5" />
                        </a>
                      </Button>
                      {podeEditar && !i.link_curto && (
                        <Button size="sm" onClick={() => tornarDinamico(i)}
                          disabled={convertendo === i.chave}>
                          {convertendo === i.chave && <Loader2 className="size-3.5 mr-1 animate-spin" />}
                          Tornar dinâmico
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {/* A ausência precisa ser explicada, senão parece esquecimento — e alguém
          acabaria imprimindo um link pessoal num cartaz. */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-2">
            <Lock className="size-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">
                O que fica de fora desta lista, de propósito
              </p>
              <p>
                Links <strong>pessoais</strong> não aparecem aqui:{' '}
                {d.excluidos_por_serem_pessoais.join(', ')}. Cada pessoa recebe o seu, com um
                código só dela. Imprimir um desses num cartaz entregaria o acesso de uma pessoa
                para a igreja inteira.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {qr && (
        <QrLinkDialog
          link={qr.link}
          titulo={qr.titulo}
          semDinamico={qr.dinamico}
          chamada={qr.chamada || undefined}
          nomeArquivo={`qr-${qr.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
          descricao={qr.dinamico
            ? 'QR dinâmico: pode imprimir. Se o destino mudar, você troca aqui e o papel continua valendo.'
            : 'Atenção: este QR grava o endereço final. Se vai ser impresso, converta para dinâmico antes.'}
          onClose={() => setQr(null)}
        />
      )}
    </div>
  );
}
