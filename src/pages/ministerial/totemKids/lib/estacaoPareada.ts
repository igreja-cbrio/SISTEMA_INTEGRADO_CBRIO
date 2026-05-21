// Helpers de localStorage pra estacao pareada no device.
// Cada tablet/celular se vincula a UMA estacao via QR token (parear) e
// daí pra frente todo check-in envia esse estacao_id automaticamente.

const KEY = 'totem_kids_estacao_pareada';

export interface EstacaoPareada {
  id: string;
  nome: string;
  tipo: 'manned' | 'self' | 'roster';
  printer_modelo?: string | null;
  pareada_em: string; // ISO timestamp
}

export function getEstacaoPareada(): EstacaoPareada | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setEstacaoPareada(e: Omit<EstacaoPareada, 'pareada_em'>): void {
  const payload: EstacaoPareada = { ...e, pareada_em: new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify(payload));
}

export function clearEstacaoPareada(): void {
  localStorage.removeItem(KEY);
}
