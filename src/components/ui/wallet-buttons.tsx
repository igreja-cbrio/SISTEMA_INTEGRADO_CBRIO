import { Loader2 } from 'lucide-react';

function AppleWalletBadge({ className = '' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 187 56"
      className={className}
      role="img"
      aria-label="Adicionar ao Apple Wallet"
    >
      <rect width="187" height="56" rx="6" fill="#000" />
      <rect x="0.5" y="0.5" width="186" height="55" rx="5.5" stroke="#fff" strokeOpacity="0.25" fill="none" />
      {/* Wallet icon — card stack */}
      <g transform="translate(12, 12)">
        <rect x="0" y="12" width="24" height="16" rx="3" fill="#FC3D3A" />
        <rect x="0" y="8" width="24" height="16" rx="3" fill="#F5A623" />
        <rect x="0" y="4" width="24" height="16" rx="3" fill="#4CD964" />
        <rect x="0" y="0" width="24" height="16" rx="3" fill="#5AC8FA" />
      </g>
      {/* Text */}
      <text x="46" y="22" fill="#fff" fontSize="10" fontFamily="-apple-system, 'SF Pro Text', Helvetica, Arial, sans-serif" fontWeight="400">
        Adicionar ao
      </text>
      <text x="46" y="40" fill="#fff" fontSize="16" fontFamily="-apple-system, 'SF Pro Display', Helvetica, Arial, sans-serif" fontWeight="600" letterSpacing="-0.3">
        Apple Wallet
      </text>
    </svg>
  );
}

function GoogleWalletBadge({ className = '' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 187 56"
      className={className}
      role="img"
      aria-label="Adicionar ao Google Wallet"
    >
      <rect width="187" height="56" rx="6" fill="#000" />
      <rect x="0.5" y="0.5" width="186" height="55" rx="5.5" stroke="#fff" strokeOpacity="0.25" fill="none" />
      {/* Google "G" icon */}
      <g transform="translate(14, 14)">
        <svg width="28" height="28" viewBox="0 0 48 48">
          <path d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" fill="#FBBC04" />
          <path d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" fill="#EA4335" />
          <path d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0124 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" fill="#34A853" />
          <path d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 01-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" fill="#4285F4" />
        </svg>
      </g>
      {/* Text */}
      <text x="50" y="22" fill="#fff" fontSize="10" fontFamily="-apple-system, 'SF Pro Text', Helvetica, Arial, sans-serif" fontWeight="400">
        Adicionar ao
      </text>
      <text x="50" y="40" fill="#fff" fontSize="16" fontFamily="-apple-system, 'SF Pro Display', Helvetica, Arial, sans-serif" fontWeight="600" letterSpacing="-0.3">
        Google Wallet
      </text>
    </svg>
  );
}

interface AddToWalletButtonsProps {
  onApple?: () => void;
  onGoogle?: () => void;
  appleBusy?: boolean;
  googleBusy?: boolean;
  showApple?: boolean;
  className?: string;
}

export function AddToWalletButtons({
  onApple,
  onGoogle,
  appleBusy = false,
  googleBusy = false,
  showApple,
  className = '',
}: AddToWalletButtonsProps) {
  const isApple = showApple ?? isIOSLike();

  return (
    <div className={`max-w-[240px] ${className}`}>
      {isApple ? (
        <button
          onClick={onApple}
          disabled={appleBusy}
          className="relative w-full min-h-[56px] flex items-center justify-center rounded-md overflow-hidden transition-opacity hover:opacity-80 disabled:opacity-50"
          aria-label="Adicionar ao Apple Wallet"
        >
          {appleBusy ? (
            <div className="flex items-center justify-center gap-2 bg-black rounded-md w-full min-h-[56px]">
              <Loader2 className="h-5 w-5 animate-spin text-white" />
              <span className="text-white text-sm">Adicionando…</span>
            </div>
          ) : (
            <AppleWalletBadge className="w-full h-auto" />
          )}
        </button>
      ) : (
        <button
          onClick={onGoogle}
          disabled={googleBusy}
          className="relative w-full min-h-[56px] flex items-center justify-center rounded-md overflow-hidden transition-opacity hover:opacity-80 disabled:opacity-50"
          aria-label="Adicionar ao Google Wallet"
        >
          {googleBusy ? (
            <div className="flex items-center justify-center gap-2 bg-black rounded-md w-full min-h-[56px]">
              <Loader2 className="h-5 w-5 animate-spin text-white" />
              <span className="text-white text-sm">Adicionando…</span>
            </div>
          ) : (
            <GoogleWalletBadge className="w-full h-auto" />
          )}
        </button>
      )}
    </div>
  );
}

function isIOSLike() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || navigator.vendor || '';
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
}
