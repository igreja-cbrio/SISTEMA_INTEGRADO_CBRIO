import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, Download, AlertCircle, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AddToWalletButtons } from '@/components/ui/wallet-buttons';
import { cadastroPublico } from '@/api';

interface Props {
  cpf: string;
  dataNascimento: string;
  inline?: boolean;
  title?: string;
}

function isIOSLike() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || navigator.vendor || '';
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function MemberWalletPass({ cpf, dataNascimento, inline = false, title }: Props) {
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [googleBusy, setGoogleBusy] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);
  const svgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await cadastroPublico.walletQrToken(cpf, dataNascimento);
        if (!alive) return;
        setQrToken(r.qr);
        setMemberId(r.memberId || '');
      } catch (err: any) {
        if (!alive) return;
        setError(err.message || 'Nao foi possivel gerar o QR');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [cpf, dataNascimento]);

  const handleGoogle = async () => {
    setGoogleBusy(true);
    try {
      const r = await cadastroPublico.walletGoogle(cpf, dataNascimento);
      window.open(r.url, '_blank');
    } catch (err: any) {
      setError(err.message || 'Erro ao gerar passe do Google Wallet');
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleApple = async () => {
    setAppleBusy(true);
    try {
      const blob = await cadastroPublico.walletApple(cpf, dataNascimento);
      downloadBlob(blob, 'cbrio-membro.pkpass');
    } catch (err: any) {
      setError(err.message || 'Erro ao gerar passe Apple Wallet');
    } finally {
      setAppleBusy(false);
    }
  };

  const handleDownloadPng = () => {
    const svg = svgRef.current?.querySelector('svg');
    if (!svg) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const img = new Image();
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const size = 800;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 40, 40, size - 80, size - 80);
      canvas.toBlob((blob) => {
        if (!blob) return;
        downloadBlob(blob, `cbrio-membro-${memberId || 'qr'}.png`);
      }, 'image/png');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  if (loading) {
    return (
      <div className={`flex flex-col items-center gap-3 py-6 ${inline ? '' : 'px-4'}`}>
        <Loader2 className="h-6 w-6 animate-spin text-[#00B39D]" />
        <p className="text-sm text-white/70">Preparando seu QR de membro...</p>
      </div>
    );
  }

  if (error || !qrToken) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <AlertCircle className="h-6 w-6 text-red-400" />
        <p className="text-sm text-red-300">{error || 'Nao foi possivel gerar o QR'}</p>
      </div>
    );
  }

  const iOS = isIOSLike();

  return (
    <div className={`flex flex-col items-center gap-4 ${inline ? '' : 'px-2 py-2'}`}>
      {/* Wallet Card */}
      <div className="w-full max-w-xs rounded-3xl bg-[#00B39D] p-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <img src="/logo-cbrio-icon.png" alt="CBRio" className="h-6 w-6 object-contain" />
            <span className="text-white font-bold text-base tracking-tight" style={{ fontFamily: 'iBrand, system-ui, sans-serif' }}>CBRio</span>
          </div>
          <span className="text-[10px] font-semibold tracking-widest text-white/80 bg-white/15 px-2.5 py-0.5 rounded-full uppercase">
            Membro
          </span>
        </div>

        {/* Member label */}
        <div className="mb-4">
          <p className="text-[10px] font-medium tracking-widest text-white/70 uppercase mb-0.5">
            {title || 'Seu QR de membro esta pronto'}
          </p>
        </div>

        {/* QR Code */}
        <div ref={svgRef} className="flex justify-center mb-4">
          <div className="bg-white rounded-2xl p-3">
            <QRCodeSVG value={qrToken} size={180} level="M" includeMargin={false} />
          </div>
        </div>

        {memberId && (
          <p className="text-center text-[10px] font-mono text-white/50 tracking-wide mb-3">{memberId}</p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between">
          <img src="/logo-cbrio-icon.png" alt="" className="h-4 w-4 object-contain opacity-40" />
          <Wifi className="h-4 w-4 text-white/40 rotate-90" />
        </div>
      </div>

      {/* Action buttons */}
      <div className="w-full max-w-xs flex flex-col gap-2">
        <AddToWalletButtons
          onApple={handleApple}
          onGoogle={handleGoogle}
          appleBusy={appleBusy}
          googleBusy={googleBusy}
          showApple={iOS}
          className="w-full"
        />
        <Button
          variant="outline"
          className="w-full gap-2 min-h-[48px] border-white/20 text-white bg-transparent hover:bg-white/10"
          onClick={handleDownloadPng}
        >
          <Download className="h-4 w-4" />
          Baixar imagem do QR
        </Button>
      </div>
    </div>
  );
}
