// Módulo de Inscrições · "Portas públicas do sistema" (aba Eventos · pedido do
// Marcos 28/07): o cérebro de inscrições mostra TODAS as portas públicas, não
// só a espinha — 1 card por porta (grupos, next, batismo, apresentação,
// voluntariado, líderes), detalhe no modal (senão a lista explode — mesmo
// racional do card de série "um quadrado Next").
//
// ⚠️ INVENTÁRIO somente-leitura DAS INSCRIÇÕES — nenhuma escrita de porta por
// aqui, nem super-admin: cada porta tem lógica-satélite no módulo dono
// (broadcast de temporada, turma do totem, 4º domingo calculado). "Operar
// daqui" chega com a F3.5, quando as portas viram séries nativas da espinha
// (SPEC-10 t2) — aí o card migra de seção naturalmente.
//
// ⚠️ ESTA TELA É UM RECORTE, NÃO O INVENTÁRIO DO SISTEMA. As portas públicas da
// igreja são mais do que as de inscrição: doação, decisão por Cristo,
// carteirinha, censo/pesquisas, suporte. O inventário COMPLETO vive em
// `/links` (módulo Links e QR), que é superconjunto deste. Aqui olhamos as
// portas de inscrição com a lente operacional (aberta/fechada, volume); lá se
// olha o mesmo conjunto com a lente do PAPEL (dinâmico × endereço fixo).
//
// ⚠️ Um registro só, duas lentes: o estado do QR vem de `links.catalogo()` e
// "Tornar dinâmico" chama `links.paraDestino()`. NÃO reimplementar o casamento
// destino↔link curto aqui — as duas telas divergiriam no 1º formulário novo, e
// a lista de portas já é única (`backend/services/inscricaoPortas.js`).
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { inscricoesApi as api, links as linksApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  DoorOpen, ExternalLink, Link2, Loader2, Lock, QrCode, ShieldAlert, ShieldCheck, Users,
} from 'lucide-react';
import QrLinkDialog from '../components/QrLinkDialog';

type Porta = {
  chave: string; nome: string; modulo: string;
  link: string; gestao: string; continua: boolean;
  aberta: boolean | null; aberta_detalhe: string | null;
  total: number; ultimos_30d: number;
  edicoes: { rotulo: string; total: number; ultima_em: string | null }[];
};

/**
 * O que o módulo Links sabe sobre a porta. São TRÊS estados, e confundi-los faz
 * a tela afirmar o que não sabe:
 *   { slug } → tem link curto (dinâmico)
 *   null     → não tem (ainda grava o endereço final no desenho do QR)
 *   undefined→ NÃO CONSEGUIMOS SABER (sem permissão em `links`, ou a consulta
 *              falhou). Aqui a tela não mostra selo nenhum — nunca "endereço
 *              fixo", que seria transformar ausência de leitura em afirmação.
 */
type EstadoQr = { slug: string; titulo: string } | null;

const BASE_CURTO = 'https://www.cbrio.org/r/';

function SeloQr({ estado }: { estado: EstadoQr }) {
  return estado ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-600 px-2 py-0.5 text-[11px] font-medium">
      <ShieldCheck className="h-3 w-3" /> QR dinâmico
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-600 px-2 py-0.5 text-[11px] font-medium">
      <ShieldAlert className="h-3 w-3" /> endereço fixo
    </span>
  );
}

function StatusPill({ porta }: { porta: Porta }) {
  if (porta.aberta === null) {
    return <span className="rounded-full bg-foreground/10 text-muted-foreground px-2 py-0.5 text-[11px] font-medium">status indisponível</span>;
  }
  return porta.aberta ? (
    <span className="rounded-full bg-emerald-500/15 text-emerald-600 px-2 py-0.5 text-[11px] font-bold">● aberta</span>
  ) : (
    <span className="rounded-full bg-foreground/10 text-muted-foreground px-2 py-0.5 text-[11px] font-medium">○ fechada</span>
  );
}

function PortaModal({ porta, qr, podeGerirLinks, onClose, onQr, onMudouQr }: {
  porta: Porta;
  qr: EstadoQr | undefined;
  podeGerirLinks: boolean;
  onClose: () => void;
  onQr: (link: string, titulo: string, dinamico: boolean) => void;
  onMudouQr: () => void;
}) {
  const navigate = useNavigate();
  const [convertendo, setConvertendo] = useState(false);
  const link = `${window.location.origin}${porta.link}`;
  // O que vai DENTRO do QR: o código curto quando existe, senão o endereço
  // final. É isto que faz o papel gerado por esta tela ser reaproveitável.
  const linkQr = qr ? `${BASE_CURTO}${qr.slug}` : link;

  function copiar() {
    navigator.clipboard.writeText(link);
    toast.success('Link copiado');
  }

  async function tornarDinamico() {
    setConvertendo(true);
    try {
      const r = await linksApi.paraDestino({ destino: link, titulo: porta.nome });
      toast.success(r.reusado
        ? `Já existia um link curto para esta porta: /r/${r.slug}`
        : `Pronto: cbrio.org/r/${r.slug}. Este QR pode ser impresso sem medo.`);
      onMudouQr();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Não consegui converter');
    } finally { setConvertendo(false); }
  }
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg flex flex-col max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DoorOpen className="h-4 w-4 text-primary" /> {porta.nome}
            <span className="rounded bg-foreground/8 px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">módulo {porta.modulo}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <StatusPill porta={porta} />
            {porta.aberta_detalhe && <span className="text-xs text-muted-foreground">{porta.aberta_detalhe}</span>}
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="text-xs text-muted-foreground">Link público do formulário</span>
              {qr !== undefined && <SeloQr estado={qr} />}
            </div>
            <div className="text-sm font-mono break-all">{link}</div>
            {qr && (
              <div className="text-xs font-mono text-primary mt-1">cbrio.org/r/{qr.slug}</div>
            )}
            <div className="flex gap-2 mt-2.5 flex-wrap">
              <Button size="sm" variant="outline" onClick={copiar}><Link2 className="h-3.5 w-3.5 mr-1" /> Copiar link</Button>
              <Button size="sm" variant="outline" onClick={() => onQr(linkQr, porta.nome, !!qr)}><QrCode className="h-3.5 w-3.5 mr-1" /> QR Code</Button>
              <a href={link} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir</Button></a>
            </div>
            {/* O botão só aparece pra quem pode escrever no módulo LINKS (nível
                4) — não pro nível de Inscrições. É a expressão da régua: repontar
                o destino de um cartaz impresso é decisão de quem cuida dos QRs. */}
            {qr === null && podeGerirLinks && (
              <div className="mt-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
                <p className="text-[11px] text-muted-foreground mb-2">
                  Este QR grava o endereço final. Se ele vai para cartaz, banner ou adesivo,
                  converta antes: o papel passa a apontar para um endereço estável e o destino
                  vira editável — sem reimprimir nada. Não muda nada para quem se inscreve.
                </p>
                <Button size="sm" className="w-full" onClick={tornarDinamico} disabled={convertendo}>
                  {convertendo && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                  Tornar dinâmico
                </Button>
              </div>
            )}
            {porta.chave === 'grupos' && (
              <p className="text-[11px] text-muted-foreground mt-2">
                Os QRs individuais por grupo continuam em Grupos → QR Inscrição.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border p-3 text-center">
              <div className="text-2xl font-extrabold tabular-nums">{porta.ultimos_30d}</div>
              <div className="text-[11px] text-muted-foreground">inscrições · últimos 30 dias</div>
            </div>
            <div className="rounded-lg border border-border p-3 text-center">
              <div className="text-2xl font-extrabold tabular-nums">{porta.total}</div>
              <div className="text-[11px] text-muted-foreground">no histórico (ativas)</div>
            </div>
          </div>

          {porta.edicoes.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-1.5">
                {porta.chave === 'grupos' ? 'Temporadas' : porta.chave === 'next' ? 'Turmas' : 'Edições'} recentes
              </div>
              <div className="divide-y divide-border/60 rounded-lg border border-border">
                {porta.edicoes.map((e) => (
                  <div key={e.rotulo} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="break-words">{e.rotulo}</span>
                    <span className="inline-flex items-center gap-1 text-muted-foreground text-xs shrink-0">
                      <Users className="h-3 w-3" /> {e.total}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-xs text-muted-foreground flex items-start gap-2">
            <Lock className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
            <span>
              <b className="text-foreground">Somente leitura.</b> Inscrições, aberturas e configurações desta porta
              são geridas no módulo {porta.modulo} — aqui é o inventário central. (Na F3.5 cada porta vira série
              nativa da espinha e passa a poder ser operada daqui.)
            </span>
          </div>
        </div>
        <div className="pt-3">
          <Button className="w-full" onClick={() => navigate(porta.gestao)}>
            Gerenciar no módulo {porta.modulo}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function InscricoesPortas() {
  // ⚠️ getAccessLevel recebe um ARRAY e faz `moduleNames.some(...)` por dentro.
  // Passar a string derruba a página com "some is not a function" — e o
  // AuthContext é .jsx, então o TypeScript não pega (mesma nota de Links.tsx).
  const { getAccessLevel } = useAuth() as { getAccessLevel?: (m: string[]) => number };
  const nivelLinks = typeof getAccessLevel === 'function' ? getAccessLevel(['links']) : 0;
  const podeGerirLinks = nivelLinks >= 4;

  const navigate = useNavigate();
  const [portas, setPortas] = useState<Porta[] | null>(null);
  const [erro, setErro] = useState(false);
  const [portaAberta, setPortaAberta] = useState<Porta | null>(null);
  const [qr, setQr] = useState<{ link: string; titulo: string; dinamico: boolean } | null>(null);
  // chave da porta → estado do QR. `null` = catálogo indisponível (sem
  // permissão em `links` ou consulta falhou) e a tela omite o selo.
  const [estadoQr, setEstadoQr] = useState<Record<string, EstadoQr> | null>(null);

  const carregarCatalogo = useCallback(() => {
    // Best-effort DE PROPÓSITO: quem não tem `links` nível 1 toma 403 aqui, e
    // isso não pode derrubar (nem esvaziar) o inventário de inscrições.
    linksApi.catalogo()
      .then((c: any) => {
        const mapa: Record<string, EstadoQr> = {};
        for (const item of c?.itens || []) {
          if (typeof item?.chave === 'string' && item.chave.startsWith('porta_')) {
            mapa[item.chave.slice('porta_'.length)] = item.link_curto || null;
          }
        }
        setEstadoQr(mapa);
      })
      .catch(() => setEstadoQr(null));
  }, []);

  useEffect(() => {
    api.portas()
      .then((r: any) => setPortas(Array.isArray(r?.portas) ? r.portas : []))
      .catch(() => setErro(true));
    carregarCatalogo();
  }, [carregarCatalogo]);

  if (erro) return null; // seção auxiliar — nunca quebra a aba Eventos

  // Só conta o que o catálogo conhece: porta ausente dele não vira "endereço
  // fixo" no número — seria contar como problema o que não foi medido.
  const conhecidas = (portas || []).filter((p) => estadoQr && p.chave in estadoQr);
  const semProtecao = conhecidas.filter((p) => !estadoQr![p.chave]).length;

  return (
    <>
      <Card className="glass-solid p-4">
        <div className="mb-3">
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <DoorOpen className="h-4 w-4 text-primary" /> Portas públicas do sistema
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            As outras entradas de inscrição além dos eventos daqui — visão de inventário; a gestão segue em cada módulo.
          </p>
        </div>
        {conhecidas.length > 0 && semProtecao > 0 && (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs">
            <p className="font-medium text-foreground">
              {semProtecao} de {conhecidas.length} portas ainda gravam o endereço final no QR.
            </p>
            <p className="text-muted-foreground mt-0.5">
              Se uma dessas for impressa e o endereço mudar depois, não tem conserto — só
              reimprimindo. Abra a porta e converta; leva um clique e não muda nada para quem
              se inscreve.
            </p>
          </div>
        )}

        {!portas ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Carregando…</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {portas.map((p) => (
              <button key={p.chave} onClick={() => setPortaAberta(p)}
                className="rounded-lg border border-border p-3 text-left hover:border-primary/50 hover:bg-primary/5 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-sm break-words">{p.nome}</div>
                  <StatusPill porta={p} />
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="rounded bg-foreground/8 px-1.5 py-0.5">{p.modulo}</span>
                  <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {p.ultimos_30d} em 30d</span>
                  {estadoQr && p.chave in estadoQr && <SeloQr estado={estadoQr[p.chave]} />}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* A placa que impede a leitura errada: esta lista é o RECORTE das
            portas de inscrição, não o inventário do sistema. Doação, decisão,
            carteirinha, censo e suporte também são portas públicas — e vivem
            no módulo Links e QR, que é o superconjunto deste. */}
        <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[11px] text-muted-foreground">
            Aqui só as portas de <b className="text-foreground">inscrição</b>. Doação, decisão,
            carteirinha, censo e suporte também são portas públicas.
          </p>
          {nivelLinks >= 1 && (
            <Button size="sm" variant="ghost" onClick={() => navigate('/links')}>
              <QrCode className="h-3.5 w-3.5 mr-1" /> Ver todas em Links e QR
            </Button>
          )}
        </div>
      </Card>

      {portaAberta && (
        <PortaModal
          porta={portaAberta}
          qr={estadoQr ? estadoQr[portaAberta.chave] : undefined}
          podeGerirLinks={podeGerirLinks}
          onClose={() => setPortaAberta(null)}
          onQr={(link, titulo, dinamico) => setQr({ link, titulo, dinamico })}
          onMudouQr={carregarCatalogo}
        />
      )}
      {qr && (
        <QrLinkDialog
          link={qr.link}
          titulo={qr.titulo}
          // Já é um link curto: oferecer "gerar QR dinâmico" criaria um 2º
          // código para o mesmo destino e a lista de links viraria lixo.
          semDinamico={qr.dinamico}
          nomeArquivo={`qr-${qr.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
          descricao={qr.dinamico
            ? 'QR dinâmico: pode imprimir. Se o destino mudar, você troca em Links e QR e o papel continua valendo.'
            : 'Imprima ou projete — quem escanear cai direto no formulário público desta porta.'}
          onClose={() => setQr(null)}
        />
      )}
    </>
  );
}
