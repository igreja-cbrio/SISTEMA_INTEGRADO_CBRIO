import { useState, useEffect, useCallback } from 'react';
import { rh } from '../../../api';
import { Button } from '../../../components/ui/button';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', greenBg: '#10b98118',
  red: '#ef4444', redBg: '#ef444418', amber: '#f59e0b', amberBg: '#f59e0b18',
  blue: '#3b82f6', blueBg: '#3b82f618',
};

const fmtMoney = (v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';

const s = {
  card: { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' },
  cardHeader: { padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: 700, color: C.text },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '10px 16px', fontSize: 11, fontWeight: 700, color: C.text2, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'left', borderBottom: `1px solid ${C.border}`, background: 'var(--cbrio-table-header)' },
  thR: { padding: '10px 16px', fontSize: 11, fontWeight: 700, color: C.text2, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right', borderBottom: `1px solid ${C.border}`, background: 'var(--cbrio-table-header)' },
  td: { padding: '12px 16px', fontSize: 13, color: C.text, borderBottom: `1px solid ${C.border}` },
  tdR: { padding: '12px 16px', fontSize: 13, color: C.text, borderBottom: `1px solid ${C.border}`, textAlign: 'right', fontFamily: 'monospace' },
  btn: (v = 'primary') => ({ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.15s', ...(v === 'primary' ? { background: C.primary, color: '#fff' } : {}), ...(v === 'ghost' ? { background: 'transparent', color: C.text2 } : {}), ...(v === 'secondary' ? { background: 'transparent', color: C.primary, border: `1px solid ${C.primary}` } : {}) }),
  empty: { textAlign: 'center', padding: 40, color: C.text3, fontSize: 14 },
  kpi: (color) => ({ padding: '14px 16px', borderRadius: 10, border: `1px solid ${C.border}`, borderLeft: `3px solid ${color}` }),
};

const TIPO_LABEL = { clt: 'CLT', pj: 'PJ', voluntario: 'Voluntário', estagiario: 'Estagiário' };

export default function TabFolha() {
  const [funcs, setFuncs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await rh.funcionarios.list({ status: 'ativo' });
      setFuncs(data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filtroTipo ? funcs.filter(f => f.tipo_contrato === filtroTipo) : funcs;

  function exportCSV(data) {
    const headers = ['Nome','Cargo','Área','Tipo','Salário','Alimentação','Transporte','Saúde','Plano Saúde','INSS','IR','FGTS','Rem. Bruta','Rem. Líquida','Custo Total'];
    const rows = data.map(f => {
      const isPJ = f.tipo_contrato === 'pj';
      const benef = Number(f.alimentacao||0)+Number(f.transporte||0)+Number(f.saude||0)+Number(f.plano_saude||0);
      return [
        f.nome, f.cargo, f.area||'', TIPO_LABEL[f.tipo_contrato]||f.tipo_contrato,
        f.salario||0, f.alimentacao||0, f.transporte||0, f.saude||0, f.plano_saude||0,
        isPJ?'':f.inss||0, isPJ?'':f.ir||0, isPJ?'':f.fgts||0,
        isPJ?'':f.remuneracao_bruta||0,
        isPJ?Number(f.salario||0)+benef:f.remuneracao_liquida||0,
        isPJ?Number(f.salario||0)+benef:f.custo_total_mensal||0,
      ];
    });
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `folha_pagamento_${new Date().toISOString().slice(0,7)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Totais
  const totSalario = filtered.reduce((s, f) => s + Number(f.salario || 0), 0);
  const totBeneficios = filtered.reduce((s, f) => {
    return s + Number(f.alimentacao || 0) + Number(f.transporte || 0) + Number(f.saude || 0)
      + Number(f.seguro_vida || 0) + Number(f.educacao || 0) + Number(f.plano_saude || 0)
      + Number(f.gratificacao || 0) + Number(f.complemento_salario || 0) + Number(f.saldo_livre || 0)
      + Number(f.adicional_nivel || 0) + Number(f.participacao_comite || 0) + Number(f.veiculo || 0)
      + Number(f.adicional_pastores || 0) + Number(f.adicional_lideranca || 0) + Number(f.adicional_pulpito || 0);
  }, 0);
  const totFGTS = filtered.reduce((s, f) => s + Number(f.fgts || 0), 0);
  const totINSS = filtered.reduce((s, f) => s + Number(f.inss || 0), 0);
  const totIR = filtered.reduce((s, f) => s + Number(f.ir || 0), 0);
  const totDescontos = totFGTS + totINSS + totIR;
  const totCusto = filtered.reduce((s, f) => {
    if (f.tipo_contrato === 'pj') {
      const benPJ = Number(f.alimentacao || 0) + Number(f.transporte || 0) + Number(f.saude || 0) + Number(f.plano_saude || 0) + Number(f.seguro_vida || 0) + Number(f.educacao || 0) + Number(f.gratificacao || 0) + Number(f.complemento_salario || 0);
      return s + Number(f.salario || 0) + benPJ;
    }
    return s + Number(f.custo_total_mensal || f.salario || 0);
  }, 0);

  function printHolerite(func) {
    const beneficios = [
      { l: 'Alimentação', v: func.alimentacao }, { l: 'Transporte', v: func.transporte },
      { l: 'Saúde', v: func.saude }, { l: 'Plano de Saúde', v: func.plano_saude },
      { l: 'Seguro de Vida', v: func.seguro_vida }, { l: 'Educação', v: func.educacao },
      { l: 'Gratificação', v: func.gratificacao }, { l: 'Complemento', v: func.complemento_salario },
    ].filter(b => Number(b.v) > 0);

    const totalBenef = beneficios.reduce((s, b) => s + Number(b.v), 0);
    const bruto = Number(func.remuneracao_bruta || func.salario || 0) + totalBenef;
    const mes = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const isPJ = func.tipo_contrato === 'pj';

    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Holerite — ${func.nome}</title>
    <style>
      body { font-family: Arial, sans-serif; max-width: 700px; margin: 30px auto; padding: 0 20px; color: #1a1a1a; font-size: 13px; }
      h2 { text-align: center; margin-bottom: 4px; }
      .sub { text-align: center; color: #666; margin-bottom: 24px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th, td { padding: 6px 10px; border: 1px solid #ddd; }
      th { background: #f5f5f5; text-align: left; font-size: 11px; text-transform: uppercase; }
      .r { text-align: right; font-family: monospace; }
      .total { font-weight: 700; background: #f0f0f0; }
      .footer { margin-top: 40px; display: flex; justify-content: space-between; }
      .sig { text-align: center; width: 45%; border-top: 1px solid #333; padding-top: 8px; }
      @media print { body { margin: 0; } }
    </style></head><body>
    <h2>DEMONSTRATIVO DE PAGAMENTO</h2>
    <div class="sub">Igreja Comunidade Batista do Rio de Janeiro — CBRio</div>
    <div class="sub">Competência: ${mes}</div>

    <table>
      <tr><th>Colaborador</th><td>${func.nome}</td><th>CPF</th><td>${func.cpf || '—'}</td></tr>
      <tr><th>Cargo</th><td>${func.cargo}</td><th>Tipo</th><td>${TIPO_LABEL[func.tipo_contrato]}</td></tr>
      <tr><th>Área</th><td>${func.area || '—'}</td><th>Admissão</th><td>${func.data_admissao ? new Date(func.data_admissao + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td></tr>
    </table>

    <table>
      <tr><th colspan="2">PROVENTOS</th></tr>
      <tr><td>Salário Base</td><td class="r">${fmtMoney(func.salario)}</td></tr>
      ${beneficios.map(b => `<tr><td>${b.l}</td><td class="r">${fmtMoney(b.v)}</td></tr>`).join('')}
      <tr class="total"><td>Total Proventos</td><td class="r">${fmtMoney(bruto)}</td></tr>
    </table>

    ${!isPJ ? `<table>
      <tr><th colspan="2">DESCONTOS</th></tr>
      ${Number(func.inss) > 0 ? `<tr><td>INSS</td><td class="r">${fmtMoney(func.inss)}</td></tr>` : ''}
      ${Number(func.ir) > 0 ? `<tr><td>IRRF</td><td class="r">${fmtMoney(func.ir)}</td></tr>` : ''}
      <tr class="total"><td>Total Descontos</td><td class="r">${fmtMoney(Number(func.inss || 0) + Number(func.ir || 0))}</td></tr>
    </table>

    <table>
      <tr><th colspan="2">ENCARGOS (não descontados do colaborador)</th></tr>
      ${Number(func.fgts) > 0 ? `<tr><td>FGTS</td><td class="r">${fmtMoney(func.fgts)}</td></tr>` : ''}
    </table>` : '<p style="color:#d97706;"><em>Colaborador PJ — sem descontos legais</em></p>'}

    <table>
      <tr class="total"><td>VALOR LÍQUIDO</td><td class="r" style="font-size:16px;">${fmtMoney(isPJ ? Number(func.salario || 0) + totalBenef : func.remuneracao_liquida)}</td></tr>
    </table>

    <div class="footer">
      <div class="sig">Empregador</div>
      <div class="sig">Colaborador</div>
    </div>
    </body></html>`);
    w.document.close();
    w.print();
  }

  return (<>
    {/* KPIs */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
      <div style={s.kpi(C.primary)}><div style={{ fontSize: 10, color: C.text3, textTransform: 'uppercase', fontWeight: 600 }}>Salários</div><div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{fmtMoney(totSalario)}</div></div>
      <div style={s.kpi(C.blue)}><div style={{ fontSize: 10, color: C.text3, textTransform: 'uppercase', fontWeight: 600 }}>Benefícios</div><div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{fmtMoney(totBeneficios)}</div></div>
      <div style={s.kpi(C.red)}><div style={{ fontSize: 10, color: C.text3, textTransform: 'uppercase', fontWeight: 600 }}>Descontos</div><div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{fmtMoney(totDescontos)}</div></div>
      <div style={s.kpi(C.amber)}><div style={{ fontSize: 10, color: C.text3, textTransform: 'uppercase', fontWeight: 600 }}>Custo Total</div><div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{fmtMoney(totCusto)}</div></div>
      <div style={s.kpi(C.green)}><div style={{ fontSize: 10, color: C.text3, textTransform: 'uppercase', fontWeight: 600 }}>Colaboradores</div><div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{filtered.length}</div></div>
    </div>

    {/* Filtro + Export */}
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, justifyContent: 'space-between', alignItems: 'center' }}>
      <select style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: 'var(--cbrio-input-bg)', color: C.text }}
        value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
        <option value="">Todos os tipos</option>
        {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <Button variant="outline" size="sm" onClick={() => exportCSV(filtered)}>Exportar CSV</Button>
    </div>

    {/* Tabela */}
    <div style={s.card}>
      <div style={s.cardHeader}>
        <div style={s.cardTitle}>Folha de Pagamento — {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={s.table}>
          <thead><tr>
            <th style={s.th}>Colaborador</th>
            <th style={s.th}>Tipo</th>
            <th style={s.thR}>Salário</th>
            <th style={s.thR}>Benefícios</th>
            <th style={s.thR}>INSS</th>
            <th style={s.thR}>IR</th>
            <th style={s.thR}>FGTS</th>
            <th style={s.thR}>Líquido</th>
            <th style={s.th}>Holerite</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td style={s.td} colSpan={9}>Carregando...</td></tr>
            : filtered.length === 0 ? <tr><td style={s.td} colSpan={9}><div style={s.empty}>Nenhum colaborador ativo</div></td></tr>
            : filtered.sort((a, b) => a.nome.localeCompare(b.nome)).map(f => {
              const benef = Number(f.alimentacao || 0) + Number(f.transporte || 0) + Number(f.saude || 0) + Number(f.plano_saude || 0) + Number(f.seguro_vida || 0) + Number(f.educacao || 0) + Number(f.gratificacao || 0) + Number(f.complemento_salario || 0);
              const isPJ = f.tipo_contrato === 'pj';
              return (
                <tr key={f.id}>
                  <td style={s.td}>
                    <div style={{ fontWeight: 600 }}>{f.nome}</div>
                    <div style={{ fontSize: 11, color: C.text3 }}>{f.cargo}</div>
                  </td>
                  <td style={s.td}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: isPJ ? '#8b5cf618' : '#3b82f618', color: isPJ ? '#8b5cf6' : '#3b82f6', fontWeight: 600 }}>{TIPO_LABEL[f.tipo_contrato]}</span></td>
                  <td style={s.tdR}>{fmtMoney(f.salario)}</td>
                  <td style={s.tdR}>{benef > 0 ? fmtMoney(benef) : '—'}</td>
                  <td style={{ ...s.tdR, color: isPJ ? C.text3 : C.red }}>{isPJ ? '—' : fmtMoney(f.inss)}</td>
                  <td style={{ ...s.tdR, color: isPJ ? C.text3 : C.red }}>{isPJ ? '—' : fmtMoney(f.ir)}</td>
                  <td style={{ ...s.tdR, color: isPJ ? C.text3 : C.amber }}>{isPJ ? '—' : fmtMoney(f.fgts)}</td>
                  <td style={{ ...s.tdR, fontWeight: 700, color: C.green }}>{fmtMoney(isPJ ? Number(f.salario || 0) + benef : f.remuneracao_liquida)}</td>
                  <td style={s.td}><Button variant="ghost" size="xs" onClick={() => printHolerite(f)}>Imprimir</Button></td>
                </tr>
              );
            })}
            {/* Totais */}
            {filtered.length > 0 && (
              <tr style={{ background: 'var(--cbrio-table-header)', fontWeight: 700 }}>
                <td style={s.td} colSpan={2}>TOTAL</td>
                <td style={s.tdR}>{fmtMoney(totSalario)}</td>
                <td style={s.tdR}>{fmtMoney(totBeneficios)}</td>
                <td style={{ ...s.tdR, color: C.red }}>{fmtMoney(totINSS)}</td>
                <td style={{ ...s.tdR, color: C.red }}>{fmtMoney(totIR)}</td>
                <td style={{ ...s.tdR, color: C.amber }}>{fmtMoney(totFGTS)}</td>
                <td style={{ ...s.tdR, color: C.green }}>{fmtMoney(totCusto)}</td>
                <td style={s.td}></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  </>);
}
