// Régua PURA do calendário da rotina de gestão.
//
// ⚠️ Mora em `utils/` e NÃO importa o supabase de propósito: é isso que a torna
// testável sem banco e sem env. Ela decide QUAL BLOCO dispara — errar aqui faz o
// bloco de sexta chegar na segunda, e o pedido de dado perder os 5 dias de folga
// que são a razão de ele sair na sexta.

// ⚠️ Dia da IGREJA é BRT, SEMPRE. `toISOString().slice(0,10)` é UTC: das 21h do
// Rio em diante o dia já virou, e a rotina de segunda dispararia como terça.
// Mesma armadilha do censo, do totem Kids e do "culto de agora".
export function hojeBRT(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

// 0=dom … 6=sáb, no fuso da igreja.
export function diaDaSemanaBRT(agora: Date = new Date()): number {
  // Meio-dia evita a borda do fuso ao reconstruir a data a partir do dia BRT.
  return new Date(`${hojeBRT(agora)}T12:00:00`).getDay();
}

export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type BlocoDaRotina = "abastecer" | "decidir" | "fechar" | "fora";

// SEXTA abastece (tudo que depende de outra pessoa sai hoje — 5 dias de folga
// até a quarta) · SEGUNDA decide e comunica · QUARTA fecha.
// ⚠️ Terça e quinta são "fora" DE PROPÓSITO: o plano original tinha 5 manhãs e
// foi cortado pra 3. Acrescentar dia aqui é decisão de rotina, não ajuste.
export function blocoDoDia(dow: number): BlocoDaRotina {
  if (dow === 5) return "abastecer";
  if (dow === 1) return "decidir";
  if (dow === 3) return "fechar";
  return "fora";
}

export function tituloDoBloco(bloco: BlocoDaRotina): string {
  switch (bloco) {
    case "abastecer":
      return "SEXTA · Abastecer (tudo que depende de outra pessoa sai hoje)";
    case "decidir":
      return "SEGUNDA · Decidir e comunicar (2 pautas de manhã + o documento das 17:00)";
    case "fechar":
      return "QUARTA · Fechar (last call + qualidade + subir + reunião + ata em 24h)";
    default:
      return "Hoje não é dia de rotina";
  }
}

// A próxima quarta a partir de um dia. Se o dia JÁ é quarta, é ele mesmo — na
// quarta a reunião a preparar é a de hoje, não a da semana que vem.
export function proximaQuarta(dia: string): string {
  const dow = new Date(`${dia}T12:00:00`).getDay();
  return somarDias(dia, (3 - dow + 7) % 7);
}

// É a última sexta do mês? O fechamento mensal roda DENTRO do dia de sexta, em
// vez de criar um 4º dia de rotina.
export function ehUltimaSextaDoMes(dia: string): boolean {
  const d = new Date(`${dia}T12:00:00`);
  if (d.getDay() !== 5) return false;
  const maisSete = new Date(d);
  maisSete.setDate(maisSete.getDate() + 7);
  return maisSete.getMonth() !== d.getMonth();
}

export const NOME_DO_DIA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
