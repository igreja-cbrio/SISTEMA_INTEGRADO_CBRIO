import { Loader2 } from 'lucide-react';

function AppleWalletBadge({ className = '' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 280 44"
      className={className}
      role="img"
      aria-label="Add to Apple Wallet"
    >
      <rect width="280" height="44" rx="8" fill="#000" />
      <rect x="0.5" y="0.5" width="279" height="43" rx="7.5" stroke="#fff" strokeOpacity="0.25" fill="none" />
      {/* Wallet icon */}
      <g transform="translate(14, 10)">
        {/* Card stack */}
        <rect x="0" y="6" width="22" height="16" rx="3" fill="#FF6B6B" />
        <rect x="0" y="3" width="22" height="16" rx="3" fill="#FFD93D" />
        <rect x="0" y="0" width="22" height="16" rx="3" fill="#6BCB77" />
        <rect x="0" y="0" width="22" height="16" rx="3" fill="url(#walletGrad)" />
        <defs>
          <linearGradient id="walletGrad" x1="0" y1="0" x2="22" y2="16">
            <stop offset="0%" stopColor="#4D96FF" />
            <stop offset="100%" stopColor="#6BCB77" />
          </linearGradient>
        </defs>
      </g>
      {/* Text */}
      <text x="44" y="17" fill="#fff" fontSize="9" fontFamily="-apple-system, SF Pro Text, Helvetica, Arial, sans-serif" fontWeight="400">
        Adicionar ao
      </text>
      <text x="44" y="32" fill="#fff" fontSize="14" fontFamily="-apple-system, SF Pro Display, Helvetica, Arial, sans-serif" fontWeight="600" letterSpacing="-0.2">
        Apple Wallet
      </text>
    </svg>
  );
}

function GoogleWalletBadge({ className = '' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 280 44"
      className={className}
      role="img"
      aria-label="Add to Google Wallet"
    >
      <rect width="280" height="44" rx="8" fill="#000" />
      <rect x="0.5" y="0.5" width="279" height="43" rx="7.5" stroke="#fff" strokeOpacity="0.25" fill="none" />
      {/* Google Wallet icon */}
      <g transform="translate(14, 10)">
        {/* Simplified Google Wallet logo */}
        <path d="M3 4h18a2 2 0 012 2v12a2 2 0 01-2 2H3a2 2 0 01-2-2V6a2 2 0 012-2z" fill="#4285F4" />
        <path d="M1 10h22v4H1z" fill="#34A853" />
        <path d="M1 14h22v4a2 2 0 01-2 2H3a2 2 0 01-2-2v-4z" fill="#FBBC04" />
        <circle cx="17" cy="12" r="3" fill="#fff" />
        <circle cx="17" cy="12" r="1.5" fill="#EA4335" />
      </g>
      {/* Text */}
      <text x="44" y="17" fill="#fff" fontSize="9" fontFamily="-apple-system, SF Pro Text, Helvetica, Arial, sans-serif" fontWeight="400">
        Adicionar ao
      </text>
      <text x="44" y="32" fill="#fff" fontSize="14" fontFamily="-apple-system, SF Pro Display, Helvetica, Arial, sans-serif" fontWeight="600" letterSpacing="-0.2">
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
    <div className={className}>
      {isApple ? (
        <button
          onClick={onApple}
          disabled={appleBusy}
          className="relative w-full min-h-[48px] flex items-center justify-center rounded-lg overflow-hidden transition-opacity hover:opacity-80 disabled:opacity-50"
          aria-label="Adicionar ao Apple Wallet"
        >
          {appleBusy ? (
            <div className="flex items-center justify-center gap-2 bg-black rounded-lg w-full min-h-[48px]">
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
          className="relative w-full min-h-[48px] flex items-center justify-center rounded-lg overflow-hidden transition-opacity hover:opacity-80 disabled:opacity-50"
          aria-label="Adicionar ao Google Wallet"
        >
          {googleBusy ? (
            <div className="flex items-center justify-center gap-2 bg-black rounded-lg w-full min-h-[48px]">
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
