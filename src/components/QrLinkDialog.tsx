// Dialog reutilizável de QR code pra um link (formulário de inscrição, etc):
// exibe o QR, permite baixar em PNG (alta resolução pra impressão/telão) e
// copiar o link. Padrão de geração igual ao QR do Next (QRCode.toDataURL).
//
// ⚠️ QR FIXO vs QR DINÂMICO (08/08). Por padrão este diálogo grava a URL FINAL
// no desenho do QR — e é isso que obriga a reimprimir tudo quando o destino
// muda. O botão "QR dinâmico" troca o conteúdo por `cbrio.org/r/<código>`, um
// endereço nosso e estável cujo destino vive no banco.
//
// Não fiz o dinâmico virar o padrão automático de propósito: criar um link
// curto é um registro permanente com nome e código, e gerar isso sem a pessoa
// pedir encheria o módulo de lixo a cada clique em "ver QR". Para o QR que vai
// para a tela e morre em cinco minutos, o fixo é o certo.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { links as linksApi } from '../api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Link2, QrCode as QrCodeIcon, RefreshCw, Loader2 } from 'lucide-react';

type Props = {
  link: string;
  titulo?: string;
  nomeArquivo?: string; // sem extensão · default 'qr-code'
  descricao?: string;
  /** Esconde a oferta de QR dinâmico (ex.: o QR JÁ é de um link curto). */
  semDinamico?: boolean;
  onClose: () => void;
};

export default function QrLinkDialog({
  link: linkOriginal, titulo, nomeArquivo = 'qr-code', descricao, semDinamico, onClose,
}: Props) {
  const [qrTela, setQrTela] = useState('');
  const [qrDownload, setQrDownload] = useState('');
  const [erro, setErro] = useState('');
  // Quando existe, é ELE que vai no QR — e é o que torna o papel reaproveitável.
  const [curto, setCurto] = useState<string | null>(null);
  const [criandoCurto, setCriandoCurto] = useState(false);

  const link = curto || linkOriginal;

  async function tornarDinamico() {
    setCriandoCurto(true);
    try {
      const r = await linksApi.paraDestino({ destino: linkOriginal, titulo: titulo || nomeArquivo });
      setCurto(`https://www.cbrio.org/r/${r.slug}`);
      toast.success(r.reusado
        ? 'Já existia um link curto para este destino — reusei'
        : 'QR dinâmico criado. Agora o destino pode mudar sem reimprimir.');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Não consegui criar o link curto');
    } finally { setCriandoCurto(false); }
  }

  useEffect(() => {
    if (!link) return;
    QRCode.toDataURL(link, { width: 320, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
      .then(setQrTela)
      .catch(() => setErro('Não foi possível gerar o QR code'));
    // Versão grande pra impressão/telão
    QRCode.toDataURL(link, { width: 1024, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
      .then(setQrDownload)
      .catch(() => {});
  }, [link]);

  function copiar() {
    navigator.clipboard.writeText(link);
    toast.success('Link copiado');
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md" style={{ zIndex: 1100 }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCodeIcon className="h-5 w-5 text-primary" />
            {titulo ? `QR code · ${titulo}` : 'QR code do link'}
          </DialogTitle>
        </DialogHeader>
        {erro ? (
          <p className="text-sm text-destructive text-center py-6">{erro}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {descricao || 'Aponte a câmera do celular pro QR pra abrir o formulário de inscrição.'}
            </p>
            {qrTela && (
              <img
                src={qrTela}
                alt="QR code do link de inscrição"
                className="mx-auto rounded-lg border border-border bg-white"
                style={{ width: 240, height: 240 }}
              />
            )}
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="block text-center text-xs text-primary truncate px-4"
            >
              {link}
            </a>
            {!semDinamico && (
              curto ? (
                <p className="text-[11px] text-center text-emerald-600 px-4">
                  QR dinâmico: pode imprimir à vontade. Se o destino mudar, você troca em
                  Links e QR e este papel continua valendo.
                </p>
              ) : (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-[11px] text-muted-foreground mb-2">
                    Este QR grava o endereço final. Se ele vai ser <strong>impresso</strong>,
                    gere a versão dinâmica: o papel aponta para um endereço estável e o destino
                    passa a ser editável — sem reimprimir nada.
                  </p>
                  <Button size="sm" variant="outline" className="w-full"
                    onClick={tornarDinamico} disabled={criandoCurto}>
                    {criandoCurto ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                    Gerar QR dinâmico
                  </Button>
                </div>
              )
            )}
            <div className="flex justify-center gap-2 pt-1">
              <a href={qrDownload || qrTela} download={`${nomeArquivo}.png`}>
                <Button size="sm" disabled={!qrDownload && !qrTela}>
                  <Download className="h-3.5 w-3.5 mr-1" /> Baixar PNG
                </Button>
              </a>
              <Button size="sm" variant="outline" onClick={copiar}>
                <Link2 className="h-3.5 w-3.5 mr-1" /> Copiar link
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
