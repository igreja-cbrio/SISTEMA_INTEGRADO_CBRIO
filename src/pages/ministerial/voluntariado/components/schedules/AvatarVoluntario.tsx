/**
 * Avatar do voluntário — foto quando existe, iniciais quando não.
 *
 * ⚠️⚠️ RECEBE `fotoUrl` JÁ RESOLVIDA pelo servidor, nunca `avatar_url` cru. O
 * Planning Center preenche `vol_profiles.avatar_url` com um PLACEHOLDER DE
 * INICIAIS pra quem não subiu foto (`/uploads/initials/MS.png`), então o campo
 * está preenchido em quase todo mundo: medido em 27/08/2026, **121 dos 226**
 * escalados dos próximos 30 dias. Renderizar o campo cru troca as iniciais
 * desenhadas por este componente (que combinam com o tema) por um PNG cinza do
 * PCO — mais bytes pra ficar pior. A régua vive em `backend/utils/fotoVoluntario`.
 *
 * ⚠️ `fotoUrl` ausente é o caso NORMAL (57% hoje) e também o que acontece com
 * bundle novo contra backend antigo: cai nas iniciais, sem tela quebrada.
 */
import { useState } from 'react';

export type StatusAvatar = 'confirmed' | 'declined' | 'pending';

const CLASSE: Record<StatusAvatar, string> = {
  confirmed: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  declined: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  pending: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

/** Primeira + última inicial. Uma palavra só usa as 2 primeiras letras. */
export function iniciais(nome: string): string {
  const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export default function AvatarVoluntario({
  nome, fotoUrl, status = 'pending', tamanho = 28, neutro = false,
}: {
  nome: string;
  fotoUrl?: string | null;
  status?: StatusAvatar;
  /** Lado em px. */
  tamanho?: number;
  /** Fundo neutro em vez de colorido por status (listas fora da escala). */
  neutro?: boolean;
}) {
  // ⚠️ Foto que não carrega (URL do PCO expirada, offline) cai nas iniciais em
  // vez de deixar o quadrado vazio — o `alt` de um <img> quebrado dentro de um
  // círculo pequeno fica ilegível.
  const [quebrou, setQuebrou] = useState(false);
  const mostrarFoto = !!fotoUrl && !quebrou;
  const fundo = neutro ? 'bg-muted text-muted-foreground' : CLASSE[status] || CLASSE.pending;

  return (
    <span
      className={`shrink-0 rounded-full flex items-center justify-center font-semibold overflow-hidden ${mostrarFoto ? 'bg-muted' : fundo}`}
      style={{ width: tamanho, height: tamanho, fontSize: Math.max(9, Math.round(tamanho * 0.38)) }}
      title={nome}
    >
      {mostrarFoto ? (
        <img
          data-foto-avatar=""
          src={fotoUrl as string}
          alt={nome}
          loading="lazy"
          onError={() => setQuebrou(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        iniciais(nome)
      )}
    </span>
  );
}
