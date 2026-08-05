// ============================================================================
// Totem · credencial do DISPOSITIVO no navegador (2026-08-05)
//
// ⚠️ O QUE PODE FICAR AQUI: só a credencial do equipamento
// (`{estacao_id, codigo, nome, token, linhagem}`). NUNCA dado de pessoa —
// nome, CPF, telefone, e-mail, formulário em andamento. O totem fica num hall
// público e um `localStorage` com PII é vazamento esperando acontecer; o
// contraste é proposital com `cbrio-totem-resume` (TotemMembro.tsx), que guarda
// só um token de uso único.
//
// ⚠️ O token é bearer e extraível por quem senta na frente do PC — e o desenho
// assume isso. Ele autoriza uma superfície mínima (ver backend/routes/totem.js),
// é cercado por IP quando a estação tem `ip_permitidos`, e é revogável
// individualmente pela equipe. Quando a equipe revoga, o backend responde 401
// com `limpar_credencial` e este módulo apaga a credencial na hora.
// ============================================================================

import { resolveApiBaseUrl } from './api-base';

const API = resolveApiBaseUrl(import.meta.env.VITE_API_URL);
const CHAVE = 'cbrio-totem-estacao';

// Evento que a tela ouve pra voltar ao pareamento sem prop drilling.
export const EVENTO_DESPAREADO = 'totem:despareado';

export type CredencialTotem = {
  estacao_id: string;
  codigo: string;
  nome: string;
  token: string;
  linhagem?: string;
};

export type EstacaoTotem = {
  id: string;
  codigo: string;
  nome: string;
  local?: string | null;
  finalidades: string[];
  evento_fixo_id?: string | null;
  tef_ativo: boolean;
  tem_impressora: boolean;
};

export class ErroTotem extends Error {
  reason: string;
  limparCredencial: boolean;
  constructor(mensagem: string, reason = 'erro', limparCredencial = false) {
    super(mensagem);
    this.name = 'ErroTotem';
    this.reason = reason;
    this.limparCredencial = limparCredencial;
  }
}

export function lerCredencial(): CredencialTotem | null {
  try {
    const cru = localStorage.getItem(CHAVE);
    if (!cru) return null;
    const c = JSON.parse(cru);
    if (!c?.token || !c?.estacao_id) return null;
    return c as CredencialTotem;
  } catch {
    // JSON corrompido (aconteceu num reset de navegador) → trata como não
    // pareado em vez de estourar na primeira renderização.
    return null;
  }
}

export function salvarCredencial(c: CredencialTotem) {
  localStorage.setItem(CHAVE, JSON.stringify(c));
}

export function limparCredencial(motivo = 'desconhecido') {
  localStorage.removeItem(CHAVE);
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_DESPAREADO, { detail: { motivo } }));
  } catch { /* ambiente sem window (SSR/teste) */ }
}

async function corpo(r: Response) {
  try { return await r.json(); } catch { return {}; }
}

/**
 * Chamada autenticada pela estação. Em 401 com `limpar_credencial`, apaga a
 * credencial e avisa a tela — é isso que faz "revoguei no painel" virar tela de
 * pareamento no totem em ≤60s (o TTL do cache do backend).
 *
 * ⚠️ 503 (`indisponivel`) NÃO limpa nada: instabilidade de banco não é
 * credencial inválida, e desparear o totem por causa disso exigiria um
 * voluntário repareando no meio do culto.
 */
export async function apiTotem<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const cred = lerCredencial();
  if (!cred) throw new ErroTotem('Dispositivo não pareado', 'token_ausente', true);

  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'x-totem-token': cred.token,
      ...(opts.headers || {}),
    },
  });

  const j = await corpo(r);
  if (!r.ok) {
    if (r.status === 401 && j?.limpar_credencial) limparCredencial(j?.reason || 'revogado');
    throw new ErroTotem(j?.error || 'Erro de comunicação', j?.reason || `http_${r.status}`, !!j?.limpar_credencial);
  }
  return j as T;
}

/** Troca o código de 8 caracteres digitado pelo voluntário pela credencial. */
export async function parear(codigo: string): Promise<EstacaoTotem> {
  const r = await fetch(`${API}/totem/parear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      codigo,
      // Ajuda a equipe a reconhecer a linha no painel ("PC do hall · Chrome").
      rotulo: navigator.userAgent.slice(0, 120),
    }),
  });
  const j = await corpo(r);
  if (!r.ok) throw new ErroTotem(j?.error || 'Não foi possível parear', j?.reason || 'erro');

  salvarCredencial({
    estacao_id: j.estacao.id,
    codigo: j.estacao.codigo,
    nome: j.estacao.nome,
    token: j.token,
    linhagem: j.linhagem,
  });
  return j.estacao as EstacaoTotem;
}

/** Quem sou eu + heartbeat (o backend bate o ponto com throttle de 60s). */
export function eu() {
  return apiTotem<{ ok: boolean; estacao: EstacaoTotem; servidor_em: string }>('/totem/eu');
}
