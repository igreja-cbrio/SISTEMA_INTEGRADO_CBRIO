import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Wifi } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useRef } from 'react';

interface QrCodeModalProps {
  open: boolean;
  onClose: () => void;
  qrCode: string;
  volunteerName: string;
}

export default function QrCodeModal({ open, onClose, qrCode, volunteerName }: QrCodeModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleDownload = async () => {
    const card = cardRef.current;
    if (!card) return;

    const canvas = document.createElement('canvas');
    const scale = 2;
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Pre-load logo image and font
    const logoImg = new Image();
    logoImg.crossOrigin = 'anonymous';
    const logoLoaded = new Promise<void>((res) => {
      logoImg.onload = () => res();
      logoImg.onerror = () => res();
      logoImg.src = '/logo-cbrio-icon.png';
    });

    // Load iBrand font for canvas
    let fontLoaded = false;
    try {
      const font = new FontFace('iBrand', "url('/fonts/ibrand.otf')");
      await font.load();
      document.fonts.add(font);
      fontLoaded = true;
    } catch { /* fallback to system font */ }

    await logoLoaded;

    // Draw card background
    ctx.scale(scale, scale);
    const radius = 24;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(w - radius, 0);
    ctx.quadraticCurveTo(w, 0, w, radius);
    ctx.lineTo(w, h - radius);
    ctx.quadraticCurveTo(w, h, w - radius, h);
    ctx.lineTo(radius, h);
    ctx.quadraticCurveTo(0, h, 0, h - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fillStyle = '#00B39D';
    ctx.fill();

    // Header: logo image + text
    if (logoImg.complete && logoImg.naturalWidth > 0) {
      ctx.drawImage(logoImg, 20, 20, 28, 28);
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = fontLoaded ? 'bold 18px iBrand' : 'bold 18px system-ui, -apple-system, sans-serif';
    ctx.fillText('CBRio', 54, 42);
    ctx.font = '500 11px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('VOLUNTÁRIO', w - 100, 40);

    // Volunteer name
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '500 11px system-ui, -apple-system, sans-serif';
    ctx.fillText('VOLUNTÁRIO', 24, 80);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
    ctx.fillText(volunteerName, 24, 106);

    // QR code area
    const qrSize = 200;
    const qrX = (w - qrSize - 32) / 2;
    const qrY = 130;
    const qrR = 16;
    ctx.beginPath();
    ctx.moveTo(qrX + qrR, qrY);
    ctx.lineTo(qrX + qrSize + 32 - qrR, qrY);
    ctx.quadraticCurveTo(qrX + qrSize + 32, qrY, qrX + qrSize + 32, qrY + qrR);
    ctx.lineTo(qrX + qrSize + 32, qrY + qrSize + 32 - qrR);
    ctx.quadraticCurveTo(qrX + qrSize + 32, qrY + qrSize + 32, qrX + qrSize + 32 - qrR, qrY + qrSize + 32);
    ctx.lineTo(qrX + qrR, qrY + qrSize + 32);
    ctx.quadraticCurveTo(qrX, qrY + qrSize + 32, qrX, qrY + qrSize + 32 - qrR);
    ctx.lineTo(qrX, qrY + qrR);
    ctx.quadraticCurveTo(qrX, qrY, qrX + qrR, qrY);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Draw QR from SVG
    const svg = card.querySelector('#vol-qr-svg');
    if (svg) {
      const svgData = new XMLSerializer().serializeToString(svg);
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, qrX + 16, qrY + 16, qrSize, qrSize);
        triggerDownload(canvas);
      };
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    } else {
      triggerDownload(canvas);
    }
  };

  const triggerDownload = (canvas: HTMLCanvasElement) => {
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr-${volunteerName.replace(/\s+/g, '_')}.png`;
    a.click();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm border-0 bg-transparent shadow-none p-4 [&>button]:text-white [&>button]:hover:text-white/80">
        <div className="flex flex-col items-center gap-4">
          {/* Wallet Card */}
          <div
            ref={cardRef}
            className="w-full rounded-3xl bg-[#00B39D] p-6 shadow-2xl"
            style={{ minHeight: 420 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2">
                <img src="/logo-cbrio-icon.png" alt="CBRio" className="h-7 w-7 object-contain" />
                <span className="text-white font-bold text-lg tracking-tight" style={{ fontFamily: 'iBrand, system-ui, sans-serif' }}>CBRio</span>
              </div>
              <span className="text-[11px] font-semibold tracking-widest text-white/80 bg-white/15 px-3 py-1 rounded-full uppercase">
                Voluntário
              </span>
            </div>

            {/* Volunteer Info */}
            <div className="mb-6">
              <p className="text-[11px] font-medium tracking-widest text-white/70 uppercase mb-1">
                Voluntário
              </p>
              <p className="text-xl font-bold text-white leading-tight">
                {volunteerName}
              </p>
            </div>

            {/* QR Code */}
            <div className="flex justify-center mb-6">
              <div className="bg-white rounded-2xl p-4">
                <QRCodeSVG id="vol-qr-svg" value={qrCode} size={200} level="H" />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between">
              <img src="/logo-cbrio-icon.png" alt="" className="h-5 w-5 object-contain opacity-40" />
              <Wifi className="h-5 w-5 text-white/40 rotate-90" />
            </div>
          </div>

          {/* Download Button */}
          <Button
            onClick={handleDownload}
            variant="outline"
            className="gap-2 border-white/30 text-white hover:bg-white/10 hover:text-white bg-transparent"
          >
            <Download className="h-4 w-4" /> Baixar QR Code
          </Button>

          <p className="text-[10px] text-white/50 font-mono">{qrCode}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
