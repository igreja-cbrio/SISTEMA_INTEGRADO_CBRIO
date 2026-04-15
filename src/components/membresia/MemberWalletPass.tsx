import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, Wallet, Apple, Download, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cadastroPublico } from '@/api';

interface Props {
  cpf: string;
  dataNascimento: string;
  /** Show inline on page (not inside modal). */
  inline?: boolean;
  /** Optional title override. */
  title?: string;
}

function isIOSLike() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || navigator.vendor || '';
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
}

/**
 * Renderiza opcoes de wallet para um membro ja cadastrado:
 *  - Botao Google Wallet (Android) — gera JWT no backend
 *  - QR inline + botao "Salvar imagem" (iPhone / fallback)
 *
 * O componente carrega o token do QR assim que monta; o botao do Google
 * Wallet e disparado sob demanda (evita gerar JWT se o usuario nao clicar).
 */
export default function MemberWalletPass({ cpf, dataNascimento, inline = false, title }: Props) {
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [googleBusy, setGoogleBusy] = useState(false);
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

  const handleDownloadPng = () => {
    // Converte o SVG do QR em PNG e dispara download (iPhone salva em Fotos)
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
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `cbrio-membro-${memberId || 'qr'}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
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
      <div className="text-center space-y-1">
        <div className="flex items-center justify-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-[#00B39D]" />
          <p className="font-semibold text-white">{title || 'Seu QR de membro esta pronto'}</p>
        </div>
        <p className="text-xs text-white/60">
          {iOS
            ? 'No iPhone, use "Salvar imagem" e adicione a foto a wallet do seu app preferido.'
            : 'Adicione o passe ao Google Wallet ou salve a imagem do QR.'}
        </p>
      </div>

      {/* QR inline */}
      <div ref={svgRef} className="rounded-xl bg-white p-4">
        <QRCodeSVG value={qrToken} size={180} level="M" includeMargin={false} />
      </div>
      {memberId && (
        <p className="text-[11px] font-mono text-white/50 tracking-wide">{memberId}</p>
      )}

      {/* Botoes */}
      <div className="w-full max-w-xs flex flex-col gap-2">
        <Button
          className="w-full gap-2 bg-[#00B39D] hover:bg-[#00B39D]/90 min-h-[48px] text-white"
          onClick={handleGoogle}
          disabled={googleBusy}
        >
          {googleBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          Adicionar ao Google Wallet
        </Button>
        <Button
          variant="outline"
          className="w-full gap-2 min-h-[48px] border-white/20 text-white bg-transparent hover:bg-white/10"
          onClick={handleDownloadPng}
        >
          {iOS ? <Apple className="h-4 w-4" /> : <Download className="h-4 w-4" />}
          {iOS ? 'Salvar no iPhone (imagem)' : 'Baixar imagem do QR'}
        </Button>
      </div>
    </div>
  );
}
