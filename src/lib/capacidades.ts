// Fonte única das capacidades de assento usadas no % de ocupação.
// Antes ficavam hardcoded dentro de VisualizacaoFrequencia.tsx (achado Atlas #5).
// Centralizar aqui evita divergência (o CLAUDE.md histórico citava 1200) — o
// valor correto, confirmado pelo Marcos em 2026-06-25, é 1050.
//
// ⚠️ Há um valor SEPARADO de 1300 na coluna calculada vw_culto_stats.taxa_ocupacao
// (usada pelo Dashboard Semanal, outro módulo) · não foi unificada aqui pra não
// mexer na view; alinhar depois se virar contrato único.
export const CAPACIDADE_TEMPLO = 1050; // Domingo · Quarta · AMI
export const CAPACIDADE_KIDS = 250;
