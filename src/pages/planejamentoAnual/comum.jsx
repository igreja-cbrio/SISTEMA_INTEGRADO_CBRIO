// Planejamento Anual · tokens e helpers compartilhados das telas
export const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D', primaryBg: '#00B39D18',
  green: '#10b981', amber: '#f59e0b', blue: '#3b82f6', red: '#ef4444', purple: '#8b5cf6',
};

export const cardStyle = { background: C.card, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow)', borderRadius: 16 };

export const btn = (v = 'primary') => ({
  padding: '7px 13px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
  display: 'inline-flex', alignItems: 'center', gap: 6,
  ...(v === 'primary' ? { background: C.primary, color: '#fff' } : {}),
  ...(v === 'ghost' ? { background: 'transparent', color: C.t2, border: `1px solid ${C.border}` } : {}),
  ...(v === 'soft' ? { background: C.primaryBg, color: C.primary } : {}),
  ...(v === 'danger' ? { background: C.red, color: '#fff' } : {}),
  ...(v === 'amber' ? { background: '#f59e0b22', color: C.amber } : {}),
});

export const input = {
  padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13,
  background: 'var(--cbrio-input-bg, #fff)', color: C.text, outline: 'none', width: '100%', boxSizing: 'border-box',
};

export const label = { fontSize: 12, fontWeight: 600, color: C.t2, display: 'block', marginBottom: 4 };
export const hint = { fontSize: 11.5, color: C.t3, marginTop: 3 };

export const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const MESES_LONGOS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export const NATUREZAS = [
  { valor: 'evento', rotulo: 'Evento' },
  { valor: 'projeto', rotulo: 'Projeto' },
  { valor: 'rotina', rotulo: 'Rotina' },
];

export const RECORRENCIAS = [
  { valor: 'unica', rotulo: 'Única' },
  { valor: 'diaria', rotulo: 'Diária' },
  { valor: 'semanal', rotulo: 'Semanal' },
  { valor: 'mensal', rotulo: 'Mensal' },
  { valor: 'trimestral', rotulo: 'Trimestral' },
  { valor: 'semestral', rotulo: 'Semestral' },
  { valor: 'personalizada', rotulo: 'Personalizada' },
];

export const ESTADOS = {
  rascunho: { rotulo: 'Rascunho', cor: C.t3 },
  em_avaliacao: { rotulo: 'Em avaliação', cor: C.blue },
  ranqueada: { rotulo: 'Aguardando decisão', cor: C.purple },
  aprovada: { rotulo: 'Aprovada', cor: C.green },
  aprovada_ressalvas: { rotulo: 'Aprovada com ressalvas', cor: C.amber },
  reprovada: { rotulo: 'Devolvida com exigência', cor: C.red },
  retificada: { rotulo: 'Retificada · com o Pastor', cor: C.amber },
  arquivada: { rotulo: 'Arquivada', cor: C.t3 },
  enviada: { rotulo: 'Enviada', cor: C.blue },
};

export function Badge({ texto, cor }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 600,
      color: cor, background: `${cor}1c`, whiteSpace: 'nowrap',
    }}>{texto}</span>
  );
}

export function EstadoBadge({ estado }) {
  const e = ESTADOS[estado] || { rotulo: estado, cor: C.t3 };
  return <Badge texto={e.rotulo} cor={e.cor} />;
}

export const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmtBRLk = (v) => 'R$ ' + (Number(v || 0) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';

export function fmtData(d) {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [y, m, dd] = s.split('-');
  return `${dd}/${m}/${y}`;
}

// Exibe o "quando" da proposta respeitando a precisão declarada
export function fmtQuando(p) {
  if (!p?.data_inicio) return '—';
  const mes = MESES_LONGOS[parseInt(String(p.data_inicio).slice(5, 7), 10) - 1] || '';
  const ini = p.precisao_inicio === 'dia' ? fmtData(p.data_inicio) : mes;
  if (p.multi_dia && p.data_fim) {
    const mesFim = MESES_LONGOS[parseInt(String(p.data_fim).slice(5, 7), 10) - 1] || '';
    const fim = p.precisao_fim === 'dia' ? fmtData(p.data_fim) : mesFim;
    return `${ini} → ${fim}`;
  }
  return ini;
}

export const thStyle = { textAlign: 'left', padding: '8px 10px', fontSize: 11.5, fontWeight: 700, color: 'var(--cbrio-text3)', textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid var(--hairline)' };
export const tdStyle = { padding: '9px 10px', fontSize: 13, color: 'var(--cbrio-text)', borderBottom: '1px solid var(--hairline)', verticalAlign: 'top' };
