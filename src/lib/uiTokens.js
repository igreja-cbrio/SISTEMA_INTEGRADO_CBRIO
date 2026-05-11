// ============================================================================
// uiTokens · cores semanticas + estilos de botao compartilhados
//
// Cores e estilos usados em todo o sistema de KPIs (Painel, Gestao, MinhaArea,
// EstruturaOkr, DadosBrutos). Antes cada pagina redefinia botoes inline e
// cores hex hardcoded.
// ============================================================================

// Cores semanticas · use em vez de hex direto (#ef4444, #10B981, etc).
export const COLORS = {
  primary:     '#00B39D',
  primaryBg:   '#00B39D18',
  primaryDark: '#00897B',

  // Status
  green:   '#10B981', greenBg:   '#10B98118',
  amber:   '#F59E0B', amberBg:   '#F59E0B18',
  red:     '#EF4444', redBg:     '#EF444418',
  blue:    '#3B82F6', blueBg:    '#3B82F618',
  purple:  '#8B5CF6', purpleBg:  '#8B5CF618',
  pink:    '#EC4899', pinkBg:    '#EC489918',
  gray:    '#6B7280', grayBg:    '#6B728018',
};

// Tokens CSS (referenciam variaveis em :root · trocam com o tema)
export const TOKENS = {
  bg:        'var(--cbrio-bg)',
  card:      'var(--cbrio-card)',
  text:      'var(--cbrio-text)',
  t2:        'var(--cbrio-text2)',
  t3:        'var(--cbrio-text3)',
  border:    'var(--cbrio-border)',
  inputBg:   'var(--cbrio-input-bg)',
  modalBg:   'var(--cbrio-modal-bg)',
  overlay:   'var(--cbrio-overlay)',
  tableHdr:  'var(--cbrio-table-header)',
};

// Botoes compartilhados
export const btnPrimary = {
  padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
  background: COLORS.primary, color: '#fff', border: 'none', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 4,
};

export const btnPrimaryLg = {
  padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
  background: COLORS.primary, color: '#fff', border: 'none', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
};

export const btnSm = {
  background: 'transparent', border: `1px solid ${TOKENS.border}`,
  padding: 6, borderRadius: 4, cursor: 'pointer', color: TOKENS.t3,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

export const btnGhost = {
  padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
  background: 'transparent', color: TOKENS.t2,
  border: `1px solid ${TOKENS.border}`, cursor: 'pointer',
};

export const btnGhostSm = {
  padding: '4px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
  background: 'transparent', color: TOKENS.t2,
  border: `1px solid ${TOKENS.border}`, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 3,
};

export const btnIcon = {
  background: 'transparent', border: 'none', padding: 6, borderRadius: 4,
  cursor: 'pointer', color: TOKENS.t3,
};

// Input padrao
export const inpBase = {
  padding: '6px 10px', borderRadius: 6, fontSize: 12,
  border: `1px solid ${TOKENS.border}`, background: TOKENS.inputBg,
  color: TOKENS.text, fontFamily: 'inherit',
};

// Status visual (no_alvo / atras / critico / sem_dado · usado em multiplos pontos)
import { CheckCircle2, Clock, TrendingDown, MinusCircle } from 'lucide-react';

export const STATUS_VISUAL = {
  no_alvo:  { Icon: CheckCircle2, cor: COLORS.green, bg: COLORS.greenBg, label: 'No alvo' },
  verde:    { Icon: CheckCircle2, cor: COLORS.green, bg: COLORS.greenBg, label: 'No alvo' },
  atras:    { Icon: Clock,        cor: COLORS.amber, bg: COLORS.amberBg, label: 'Atras' },
  amarelo:  { Icon: Clock,        cor: COLORS.amber, bg: COLORS.amberBg, label: 'Atencao' },
  critico:  { Icon: TrendingDown, cor: COLORS.red,   bg: COLORS.redBg,   label: 'Critico' },
  vermelho: { Icon: TrendingDown, cor: COLORS.red,   bg: COLORS.redBg,   label: 'Critico' },
  sem_dado: { Icon: MinusCircle,  cor: COLORS.gray,  bg: COLORS.grayBg,  label: 'Sem dado' },
};

// Cor por area (kids/ami/bridge/sede/online/cba)
export const AREA_COR = {
  kids:   COLORS.amber,
  ami:    COLORS.blue,
  bridge: COLORS.purple,
  sede:   COLORS.green,
  online: COLORS.pink,
  cba:    COLORS.gray,
};

// Cor por valor da jornada
export const VALOR_COR = {
  seguir:       COLORS.purple,
  conectar:     COLORS.blue,
  investir:     COLORS.amber,
  servir:       COLORS.green,
  generosidade: COLORS.pink,
};
