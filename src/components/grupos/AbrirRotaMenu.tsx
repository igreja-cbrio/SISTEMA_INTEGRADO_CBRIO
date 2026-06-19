// AbrirRotaMenu · trigger (children) que abre um menu com a escolha de abrir a
// rota no Google Maps ou no Waze. Reusa o helper urlsNavegacao. Usado no detalhe
// do grupo e no popup do mapa de grupos.
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MapPin, Navigation } from 'lucide-react';
import { urlsNavegacao } from '@/lib/mapas';
import type { CSSProperties, ReactNode } from 'react';

type Props = {
  lat?: number | null;
  lng?: number | null;
  endereco?: string | null;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  align?: 'start' | 'center' | 'end';
};

export function AbrirRotaMenu({ lat, lng, endereco, children, className, style, align = 'start' }: Props) {
  const { google, waze, temDestino } = urlsNavegacao({ lat, lng, endereco });
  if (!temDestino) {
    // Sem coords e sem endereço → não há rota; renderiza o conteúdo sem menu.
    return <span className={className} style={style}>{children}</span>;
  }
  const abrir = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={className} style={{ cursor: 'pointer', ...style }}>{children}</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[170px]">
        <DropdownMenuItem onClick={() => abrir(google)} className="gap-2 cursor-pointer">
          <MapPin className="h-4 w-4 text-[#00B39D]" /> Google Maps
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => abrir(waze)} className="gap-2 cursor-pointer">
          <Navigation className="h-4 w-4 text-[#33ccff]" /> Waze
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
