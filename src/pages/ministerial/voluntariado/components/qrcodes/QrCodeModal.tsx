import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface QrCodeModalProps {
  open: boolean;
  onClose: () => void;
  qrCode: string;
  volunteerName: string;
}

export default function QrCodeModal({ open, onClose, qrCode, volunteerName }: QrCodeModalProps) {
  const handleDownload = () => {
    const svg = document.getElementById('vol-qr-svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx?.drawImage(img, 0, 0);
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `qr-${volunteerName.replace(/\s+/g, '_')}.png`;
      a.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{volunteerName}</DialogTitle></DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          <QRCodeSVG id="vol-qr-svg" value={qrCode} size={250} level="H" />
          <p className="text-xs text-muted-foreground font-mono">{qrCode}</p>
          <Button onClick={handleDownload} variant="outline" className="gap-2">
            <Download className="h-4 w-4" /> Baixar QR Code
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
