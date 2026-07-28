// Módulo de Inscrições · "Portas públicas do sistema" (aba Eventos · pedido do
// Marcos 28/07): o cérebro de inscrições mostra TODAS as portas públicas, não
// só a espinha — 1 card por porta (grupos, next, batismo, apresentação,
// voluntariado, líderes), detalhe no modal (senão a lista explode — mesmo
// racional do card de série "um quadrado Next").
//
// ⚠️ INVENTÁRIO somente-leitura — nenhuma escrita por aqui, nem super-admin:
// cada porta tem lógica-satélite no módulo dono (broadcast de temporada, turma
// do totem, 4º domingo calculado). "Operar daqui" chega com a F3.5, quando as
// portas viram séries nativas da espinha (SPEC-10 t2) — aí o card migra de
// seção naturalmente.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { inscricoesApi as api } from '../api';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import { DoorOpen, ExternalLink, Link2, Lock, QrCode, Users } from 'lucide-react';
import QrLinkDialog from '../components/QrLinkDialog';

type Porta = {
  chave: string; nome: string; modulo: string;
  link: string; gestao: string; continua: boolean;
  aberta: boolean | null; aberta_detalhe: string | null;
  total: number; ultimos_30d: number;
  edicoes: { rotulo: string; total: number; ultima_em: string | null }[];
};

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

function PortaModal({ porta, onClose, onQr }: { porta: Porta; onClose: () => void; onQr: (link: string, titulo: string) => void }) {
  const navigate = useNavigate();
  const link = `${window.location.origin}${porta.link}`;
  function copiar() {
    navigator.clipboard.writeText(link);
    toast.success('Link copiado');
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
            <div className="text-xs text-muted-foreground mb-1.5">Link público do formulário</div>
            <div className="text-sm font-mono break-all">{link}</div>
            <div className="flex gap-2 mt-2.5">
              <Button size="sm" variant="outline" onClick={copiar}><Link2 className="h-3.5 w-3.5 mr-1" /> Copiar link</Button>
              <Button size="sm" variant="outline" onClick={() => onQr(link, porta.nome)}><QrCode className="h-3.5 w-3.5 mr-1" /> QR Code</Button>
              <a href={link} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir</Button></a>
            </div>
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
  const [portas, setPortas] = useState<Porta[] | null>(null);
  const [erro, setErro] = useState(false);
  const [portaAberta, setPortaAberta] = useState<Porta | null>(null);
  const [qr, setQr] = useState<{ link: string; titulo: string } | null>(null);

  useEffect(() => {
    api.portas()
      .then((r: any) => setPortas(Array.isArray(r?.portas) ? r.portas : []))
      .catch(() => setErro(true));
  }, []);

  if (erro) return null; // seção auxiliar — nunca quebra a aba Eventos

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
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {portaAberta && (
        <PortaModal porta={portaAberta} onClose={() => setPortaAberta(null)}
          onQr={(link, titulo) => setQr({ link, titulo })} />
      )}
      {qr && (
        <QrLinkDialog
          link={qr.link}
          titulo={qr.titulo}
          nomeArquivo={`qr-${qr.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
          descricao="Imprima ou projete — quem escanear cai direto no formulário público desta porta."
          onClose={() => setQr(null)}
        />
      )}
    </>
  );
}
