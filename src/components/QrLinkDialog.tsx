// Dialog reutilizável de QR code pra um link (formulário de inscrição, etc):
// exibe o QR, permite baixar em PNG (alta resolução pra impressão/telão) e
// copiar o link. Padrão de geração igual ao QR do Next (QRCode.toDataURL).
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Link2, QrCode as QrCodeIcon } from 'lucide-react';

type Props = {
  link: string;
  titulo?: string;
  nomeArquivo?: string; // sem extensão · default 'qr-code'
  descricao?: string;
  onClose: () => void;
};

export default function QrLinkDialog({ link, titulo, nomeArquivo = 'qr-code', descricao, onClose }: Props) {
  const [qrTela, setQrTela] = useState('');
  const [qrDownload, setQrDownload] = useState('');
  const [erro, setErro] = useState('');

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
