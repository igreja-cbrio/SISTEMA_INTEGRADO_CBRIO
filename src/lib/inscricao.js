// Contrato de Inscrição — utilidades de FORM (espelho client de
// backend/services/inscricaoContrato.js · regras em docs/modulo-inscricoes/).
// Toda porta pública de inscrição usa ESTAS funções — não recriar cópias
// locais de máscara/validação (era assim que divergia).
// ⚠️ Mudou regra aqui? Mudar também no backend (a validação server é a lei).

export const SEXOS = ['masculino', 'feminino']; // D8 — nunca "outro"

// D4 — exibido junto do checkbox de opt-in de WhatsApp
export const AVISO_OPTIN =
  'Se você não marcar, não conseguiremos te enviar confirmações, lembretes e avisos pelo WhatsApp.';

export function soDigitos(v) {
  return String(v || '').replace(/\D/g, '');
}

// Tira o código do país ANTES de truncar. Sem isso, colar "+55 21 99999-8888"
// (o formato que sai dos contatos do celular) virava `55219999988` — 11 dígitos,
// passava nas duas validações e gravava um número que não existe. Havia 15
// cadastros nesse padrão em produção quando isto foi corrigido (31/07).
// ⚠️ Só remove quando o resto AINDA é telefone completo (12-13 dígitos): DDD 55
// existe (Santa Maria/RS), então "(55) 99999-8888" tem que ficar intacto.
export function tirarCodigoPais(digitos) {
  const d = String(digitos || '');
  if (d.length >= 12 && d.length <= 13 && d.startsWith('55')) return d.slice(2);
  return d;
}

export function mascaraTelefone(v) {
  const d = tirarCodigoPais(soDigitos(v)).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function mascaraCpf(v) {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function cpfValido(cpf) {
  const d = soDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (base, peso) => {
    let soma = 0;
    for (let i = 0; i < base.length; i += 1) soma += Number(base[i]) * (peso - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(d.slice(0, 9), 10) === Number(d[9]) && dv(d.slice(0, 10), 11) === Number(d[10]);
}

export function telefoneValido(v) {
  const d = soDigitos(v);
  return d.length >= 10 && d.length <= 11;
}

const CONECTIVOS_NOME = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

export function temAbreviacaoNome(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  return partes.some((p) => {
    const limpa = p.replace(/\./g, '');
    if (CONECTIVOS_NOME.has(limpa.toLowerCase())) return false;
    return p.includes('.') || limpa.length <= 1;
  });
}

export function nomeCompletoValido(nome) {
  const n = String(nome || '').trim().replace(/\s+/g, ' ');
  return n.length >= 5 && n.split(' ').length >= 2 && !temAbreviacaoNome(n);
}

// ISO YYYY-MM-DD, data real, não-futura, ano >= 1900 → string normalizada ou null
export function validarNascimento(v) {
  const s = String(v || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  if (Number(s.slice(0, 4)) < 1900) return null;
  if (s > new Date().toISOString().slice(0, 10)) return null;
  return s;
}
