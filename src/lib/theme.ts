/**
 * Centralized theme tokens, color maps, formatters, and status definitions.
 */

export const C = {
  bg: 'var(--cbrio-bg)',
  card: 'var(--cbrio-card)',
  primary: '#00B39D',
  primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)',
  text2: 'var(--cbrio-text2)',
  text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)',
  tableHeader: 'var(--cbrio-table-header)',
  modalBg: 'var(--cbrio-modal-bg)',
  overlay: 'var(--cbrio-overlay)',
  green: '#10b981',
  greenBg: '#10b98118',
  red: '#ef4444',
  redBg: '#ef444418',
  amber: '#f59e0b',
  amberBg: '#f59e0b18',
  blue: '#3b82f6',
  blueBg: '#3b82f618',
  purple: '#8b5cf6',
  purpleBg: '#8b5cf618',
} as const

export const fmtDate = (d: string | null | undefined): string =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—'

export const fmtMoney = (v: number | string | null | undefined): string =>
  v != null
    ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    : '—'

export const fmtDateTime = (d: string | null | undefined): string =>
  d ? new Date(d).toLocaleString('pt-BR') : '—'

export const fmtPercent = (v: number | null | undefined): string =>
  v != null ? `${Number(v).toFixed(1)}%` : '—'

export type StatusEntry = { label: string; color: string; bg: string }

export const STATUS_FUNC: Record<string, StatusEntry> = {
  ativo: { label: 'Ativo', color: C.green, bg: C.greenBg },
  inativo: { label: 'Inativo', color: C.red, bg: C.redBg },
  ferias: { label: 'Férias', color: C.blue, bg: C.blueBg },
  licenca: { label: 'Licença', color: C.amber, bg: C.amberBg },
}

export const TIPO_CONTRATO: Record<string, string> = {
  clt: 'CLT', pj: 'PJ', voluntario: 'Voluntário', estagiario: 'Estagiário',
}

export const TIPO_FERIAS: Record<string, string> = {
  ferias: 'Férias', licenca_medica: 'Licença Médica',
  licenca_maternidade: 'Licença Maternidade', licenca_paternidade: 'Licença Paternidade', outro: 'Outro',
}

export const FERIAS_STATUS: Record<string, StatusEntry> = {
  pendente: { label: 'Pendente', color: C.amber, bg: C.amberBg },
  aprovado: { label: 'Aprovado', color: C.green, bg: C.greenBg },
  rejeitado: { label: 'Rejeitado', color: C.red, bg: C.redBg },
}

export const STATUS_ADM: Record<string, StatusEntry> = {
  rascunho: { label: 'Rascunho', color: C.text3, bg: `${C.text3}18` },
  formulario_enviado: { label: 'Formulário Enviado', color: C.blue, bg: C.blueBg },
  formulario_preenchido: { label: 'Formulário Preenchido', color: C.blue, bg: C.blueBg },
  contrato_gerado: { label: 'Contrato Gerado', color: C.amber, bg: C.amberBg },
  contrato_enviado: { label: 'Contrato Enviado', color: C.amber, bg: C.amberBg },
  assinado: { label: 'Assinado', color: C.primary, bg: C.primaryBg },
  concluido: { label: 'Concluído', color: C.green, bg: C.greenBg },
  cancelado: { label: 'Cancelado', color: C.red, bg: C.redBg },
}

export const STATUS_EXTRAS: Record<string, StatusEntry> = {
  agendado: { label: 'Agendado', color: C.blue, bg: C.blueBg },
  confirmado: { label: 'Confirmado', color: C.amber, bg: C.amberBg },
  realizado: { label: 'Realizado', color: C.green, bg: C.greenBg },
  cancelado: { label: 'Cancelado', color: C.red, bg: C.redBg },
}

export const CRITERIOS_AVALIACAO = [
  'Qualidade do Trabalho', 'Pontualidade', 'Trabalho em Equipe',
  'Comunicação', 'Proatividade', 'Conhecimento Técnico',
] as const

export const NOTA_COLORS = ['', '#ef4444', '#f59e0b', '#eab308', '#22c55e', '#10b981']
export const NOTA_LABELS = ['', 'Insuficiente', 'Regular', 'Bom', 'Muito Bom', 'Excelente']

export const TIPO_CONTA: Record<string, string> = {
  corrente: 'Corrente', poupanca: 'Poupança', caixa: 'Caixa', investimento: 'Investimento',
}

export const TIPO_TRANSACAO: Record<string, string> = {
  receita: 'Receita', despesa: 'Despesa', transferencia: 'Transferência',
}

export const STATUS_TRANSACAO: Record<string, StatusEntry> = {
  pendente: { label: 'Pendente', color: C.amber, bg: C.amberBg },
  conciliado: { label: 'Conciliado', color: C.green, bg: C.greenBg },
  cancelado: { label: 'Cancelado', color: C.red, bg: C.redBg },
}

export const STATUS_PAGAR: Record<string, StatusEntry> = {
  pendente: { label: 'Pendente', color: C.amber, bg: C.amberBg },
  pago: { label: 'Pago', color: C.green, bg: C.greenBg },
  cancelado: { label: 'Cancelado', color: C.red, bg: C.redBg },
  vencido: { label: 'Vencido', color: C.red, bg: C.redBg },
}

export const STATUS_REEMBOLSO: Record<string, StatusEntry> = {
  pendente: { label: 'Pendente', color: C.amber, bg: C.amberBg },
  aprovado: { label: 'Aprovado', color: C.green, bg: C.greenBg },
  rejeitado: { label: 'Rejeitado', color: C.red, bg: C.redBg },
  pago: { label: 'Pago', color: C.primary, bg: C.primaryBg },
}

export const URGENCIA_COLORS: Record<string, StatusEntry> = {
  urgente: { label: 'Urgente', color: C.red, bg: C.redBg },
  alta: { label: 'Alta', color: C.amber, bg: C.amberBg },
  normal: { label: 'Normal', color: C.blue, bg: C.blueBg },
  baixa: { label: 'Baixa', color: C.green, bg: C.greenBg },
}

export const STATUS_SOLICITACAO: Record<string, StatusEntry> = {
  pendente: { label: 'Pendente', color: C.amber, bg: C.amberBg },
  aprovado: { label: 'Aprovado', color: C.green, bg: C.greenBg },
  rejeitado: { label: 'Rejeitado', color: C.red, bg: C.redBg },
  em_cotacao: { label: 'Em Cotação', color: C.blue, bg: C.blueBg },
  pedido_gerado: { label: 'Pedido Gerado', color: C.primary, bg: C.primaryBg },
}

export const STATUS_PEDIDO: Record<string, StatusEntry> = {
  aguardando: { label: 'Aguardando', color: C.amber, bg: C.amberBg },
  em_transito: { label: 'Em Trânsito', color: C.blue, bg: C.blueBg },
  recebido: { label: 'Recebido', color: C.green, bg: C.greenBg },
  cancelado: { label: 'Cancelado', color: C.red, bg: C.redBg },
}

export const STATUS_BEM: Record<string, StatusEntry> = {
  ativo: { label: 'Ativo', color: C.green, bg: C.greenBg },
  manutencao: { label: 'Manutenção', color: C.amber, bg: C.amberBg },
  baixado: { label: 'Baixado', color: C.red, bg: C.redBg },
  extraviado: { label: 'Extraviado', color: C.red, bg: C.redBg },
}

export const TIPO_MOV: Record<string, string> = {
  entrada: 'Entrada', saida: 'Saída', transferencia: 'Transferência',
  manutencao: 'Manutenção', baixa: 'Baixa',
}

export const INV_STATUS: Record<string, StatusEntry> = {
  em_andamento: { label: 'Em Andamento', color: C.amber, bg: C.amberBg },
  concluido: { label: 'Concluído', color: C.green, bg: C.greenBg },
  cancelado: { label: 'Cancelado', color: C.red, bg: C.redBg },
}

export function statusStyle(entry: StatusEntry | undefined) {
  if (!entry) return {}
  return {
    color: entry.color,
    background: entry.bg,
    padding: '2px 8px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 600,
  }
}
