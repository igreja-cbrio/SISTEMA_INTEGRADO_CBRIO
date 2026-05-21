// Helpers de idade · LGPD com menores
// Dado data_nascimento pode ser null (responsavel nao quis informar).

export function calcIdadeMeses(dataNascimento: string | null | undefined): number | null {
  if (!dataNascimento) return null;
  const nasc = new Date(dataNascimento);
  if (isNaN(nasc.getTime())) return null;
  const hoje = new Date();
  let meses = (hoje.getFullYear() - nasc.getFullYear()) * 12 + (hoje.getMonth() - nasc.getMonth());
  if (hoje.getDate() < nasc.getDate()) meses -= 1;
  return Math.max(0, meses);
}

export function formatIdade(meses: number | null | undefined): string {
  if (meses == null) return '';
  if (meses < 24) return `${meses} mes${meses === 1 ? '' : 'es'}`;
  const anos = Math.floor(meses / 12);
  const restoMeses = meses % 12;
  if (anos < 5 && restoMeses) return `${anos}a ${restoMeses}m`;
  return `${anos} ano${anos === 1 ? '' : 's'}`;
}

export function formatIdadeShort(meses: number | null | undefined): string {
  if (meses == null) return '?';
  if (meses < 24) return `${meses}m`;
  return `${Math.floor(meses / 12)}a`;
}
