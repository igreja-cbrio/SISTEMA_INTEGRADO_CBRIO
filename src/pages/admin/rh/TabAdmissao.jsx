import { useState, useEffect, useCallback, useRef } from 'react';
import { rh } from '../../../api';
import { Button } from '../../../components/ui/button';
import { Select as ShadSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', greenBg: '#10b98118',
  red: '#ef4444', redBg: '#ef444418', amber: '#f59e0b', amberBg: '#f59e0b18',
  blue: '#3b82f6', blueBg: '#3b82f618', purple: '#8b5cf6', purpleBg: '#8b5cf618',
};

const STATUS_ADM = {
  rascunho: { c: C.text3, bg: '#73737318', label: 'Rascunho' },
  formulario_enviado: { c: C.blue, bg: C.blueBg, label: 'Formulário Enviado' },
  formulario_preenchido: { c: C.amber, bg: C.amberBg, label: 'Formulário Preenchido' },
  contrato_gerado: { c: C.purple, bg: C.purpleBg, label: 'Contrato Gerado' },
  contrato_enviado: { c: C.blue, bg: C.blueBg, label: 'Contrato Enviado' },
  assinado: { c: C.green, bg: C.greenBg, label: 'Assinado' },
  concluido: { c: C.green, bg: C.greenBg, label: 'Concluído' },
  cancelado: { c: C.red, bg: C.redBg, label: 'Cancelado' },
};

const TIPO_CONTRATO = { clt: 'CLT', pj: 'PJ', voluntario: 'Voluntário', estagiario: 'Estagiário' };

const styles = {
  card: { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' },
  cardHeader: { padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: 700, color: C.text },
  btn: (v = 'primary') => ({ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.15s', ...(v === 'primary' ? { background: C.primary, color: '#fff' } : {}), ...(v === 'secondary' ? { background: 'transparent', color: C.primary, border: `1px solid ${C.primary}` } : {}), ...(v === 'danger' ? { background: C.red, color: '#fff' } : {}), ...(v === 'ghost' ? { background: 'transparent', color: C.text2, padding: '6px 12px' } : {}), ...(v === 'success' ? { background: C.green, color: '#fff' } : {}) }),
  badge: (c, bg) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: c, background: bg }),
  input: { padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, outline: 'none', width: '100%', background: 'var(--cbrio-input-bg)', color: C.text },
  select: { padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: 'var(--cbrio-input-bg)', color: C.text, outline: 'none', width: '100%' },
  label: { fontSize: 11, fontWeight: 600, color: C.text2, marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 },
  formGroup: { marginBottom: 14 },
  formRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  overlay: { position: 'fixed', inset: 0, background: 'var(--cbrio-overlay)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 40, zIndex: 1000 },
  modal: { background: 'var(--cbrio-modal-bg)', borderRadius: 16, width: '95%', maxWidth: 700, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  modalHeader: { padding: '20px 24px 12px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: 700, color: C.text },
  modalBody: { padding: '16px 24px 24px' },
  modalFooter: { padding: '12px 24px 20px', display: 'flex', gap: 8, justifyContent: 'flex-end' },
  empty: { textAlign: 'center', padding: 40, color: C.text3, fontSize: 14 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '10px 16px', fontSize: 11, fontWeight: 700, color: C.text2, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'left', borderBottom: `1px solid ${C.border}`, background: 'var(--cbrio-table-header)' },
  td: { padding: '12px 16px', fontSize: 13, color: C.text, borderBottom: `1px solid ${C.border}` },
  filterRow: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' },
  section: { marginTop: 20, padding: 16, background: 'var(--cbrio-input-bg)', borderRadius: 10 },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: C.primary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
};

function Input({ label, error, ...props }) { return (<div style={styles.formGroup}>{label && <label style={styles.label}>{label}</label>}<input style={{ ...styles.input, ...(error ? { borderColor: '#ef4444' } : {}) }} {...props} />{error && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>{error}</div>}</div>); }
function AdmSelect({ label, children, value, onChange }) {
  return (
    <div style={styles.formGroup}>
      {label && <label style={styles.label}>{label}</label>}
      <ShadSelect value={value || '__none__'} onValueChange={v => onChange && onChange({ target: { value: v === '__none__' ? '' : v } })}>
        <SelectTrigger className="w-full h-9 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent className="z-[1001]">{children}</SelectContent>
      </ShadSelect>
    </div>
  );
}

// ── Template de contrato PJ ──────────────────────────────
function gerarContratoPJ(adm) {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const salario = adm.salario ? Number(adm.salario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ ___________';
  return `
<h2 style="text-align:center;margin-bottom:24px;">CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h2>

<p>Pelo presente instrumento particular, de um lado:</p>

<p><strong>CONTRATANTE:</strong> Igreja Comunidade Batista do Rio de Janeiro — CBRio, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº _______________, com sede na cidade do Rio de Janeiro/RJ, neste ato representada por seu(s) responsável(is) legal(is);</p>

<p>e, de outro lado:</p>

<p><strong>CONTRATADA:</strong> ${adm.pj_razao_social || '_______________'}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${adm.pj_cnpj || '_______________'}${adm.pj_inscricao_municipal ? ', Inscrição Municipal nº ' + adm.pj_inscricao_municipal : ''}, com sede em ${adm.pj_endereco_empresa || '_______________'}, neste ato representada por <strong>${adm.nome || '_______________'}</strong>, CPF nº ${adm.cpf || '_______________'};</p>

<p>Têm entre si justo e contratado o seguinte:</p>

<h3>CLÁUSULA 1ª — DO OBJETO</h3>
<p>O presente contrato tem por objeto a prestação de serviços de <strong>${adm.cargo || '_______________'}</strong>${adm.area ? ', na área de ' + adm.area : ''}, conforme as necessidades da CONTRATANTE.</p>

<h3>CLÁUSULA 2ª — DO PRAZO</h3>
<p>O presente contrato terá início em <strong>${adm.data_inicio ? new Date(adm.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR') : '___/___/______'}</strong>, com prazo indeterminado, podendo ser rescindido por qualquer das partes mediante aviso prévio de 30 (trinta) dias.</p>

<h3>CLÁUSULA 3ª — DA REMUNERAÇÃO</h3>
<p>Pela prestação dos serviços, a CONTRATANTE pagará à CONTRATADA o valor mensal de <strong>${salario}</strong>, mediante emissão de Nota Fiscal de Serviços pela CONTRATADA.</p>
<p>O pagamento será realizado até o dia 10 (dez) de cada mês subsequente à prestação dos serviços${adm.pj_pix ? ', via PIX chave: ' + adm.pj_pix : adm.pj_banco ? ', via transferência bancária (Banco: ' + adm.pj_banco + ', Ag: ' + (adm.pj_agencia || '') + ', Conta: ' + (adm.pj_conta || '') + ')' : ''}.</p>

<h3>CLÁUSULA 4ª — DAS OBRIGAÇÕES DA CONTRATADA</h3>
<p>a) Prestar os serviços com qualidade e dedicação;<br/>
b) Emitir Nota Fiscal de Serviços mensalmente;<br/>
c) Manter regularidade fiscal e tributária;<br/>
d) Responsabilizar-se por todos os encargos fiscais e tributários incidentes sobre a prestação de serviços.</p>

<h3>CLÁUSULA 5ª — DAS OBRIGAÇÕES DA CONTRATANTE</h3>
<p>a) Efetuar os pagamentos nas condições e prazos estabelecidos;<br/>
b) Fornecer as informações e meios necessários à execução dos serviços;<br/>
c) Comunicar previamente qualquer alteração nas condições de trabalho.</p>

<h3>CLÁUSULA 6ª — DA RESCISÃO</h3>
<p>O presente contrato poderá ser rescindido por qualquer das partes, a qualquer tempo, mediante comunicação por escrito com antecedência mínima de 30 (trinta) dias, sem ônus para qualquer das partes, salvo as obrigações vencidas e não pagas.</p>

<h3>CLÁUSULA 7ª — DO FORO</h3>
<p>Fica eleito o foro da Comarca do Rio de Janeiro/RJ para dirimir quaisquer dúvidas oriundas do presente contrato.</p>

<br/>
<p>E, por estarem assim justas e contratadas, as partes assinam o presente instrumento em 2 (duas) vias de igual teor e forma.</p>

<br/>
<p>Rio de Janeiro, ${hoje}.</p>

<br/><br/>
<div style="display:flex;justify-content:space-between;margin-top:40px;">
  <div style="text-align:center;width:45%;">
    <div style="border-top:1px solid #333;padding-top:8px;">
      <strong>CONTRATANTE</strong><br/>
      Igreja Comunidade Batista do Rio de Janeiro
    </div>
  </div>
  <div style="text-align:center;width:45%;">
    <div style="border-top:1px solid #333;padding-top:8px;">
      <strong>CONTRATADA</strong><br/>
      ${adm.pj_razao_social || adm.nome || '_______________'}
    </div>
  </div>
</div>
`.trim();
}

// ── Template de contrato CLT ──────────────────────────────
function gerarContratoCLT(adm) {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const salario = adm.salario ? Number(adm.salario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ ___________';
  return `
<h2 style="text-align:center;margin-bottom:24px;">CONTRATO DE TRABALHO POR PRAZO INDETERMINADO</h2>

<p>Pelo presente instrumento particular, de um lado:</p>

<p><strong>EMPREGADOR:</strong> Igreja Comunidade Batista do Rio de Janeiro — CBRio, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº _______________, com sede na cidade do Rio de Janeiro/RJ;</p>

<p><strong>EMPREGADO:</strong> ${adm.nome || '_______________'}, portador(a) do CPF nº ${adm.cpf || '_______________'}${adm.rg ? ', RG nº ' + adm.rg : ''}, residente em ${adm.endereco || '_______________'};</p>

<p>Têm entre si justo e contratado o seguinte:</p>

<h3>CLÁUSULA 1ª — DA FUNÇÃO</h3>
<p>O EMPREGADO exercerá a função de <strong>${adm.cargo || '_______________'}</strong>${adm.area ? ', na área de ' + adm.area : ''}.</p>

<h3>CLÁUSULA 2ª — DO PRAZO</h3>
<p>O presente contrato terá início em <strong>${adm.data_inicio ? new Date(adm.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR') : '___/___/______'}</strong>, com prazo de experiência de 90 (noventa) dias, após o qual passará a vigorar por prazo indeterminado.</p>

<h3>CLÁUSULA 3ª — DA REMUNERAÇÃO</h3>
<p>O EMPREGADO receberá a remuneração mensal de <strong>${salario}</strong>, sujeita aos descontos legais (INSS, IRRF, etc.).</p>

<h3>CLÁUSULA 4ª — DA JORNADA DE TRABALHO</h3>
<p>A jornada de trabalho será de 44 (quarenta e quatro) horas semanais, de segunda a sexta-feira, das 09:00 às 18:00, com 1 (uma) hora de intervalo para refeição.</p>

<h3>CLÁUSULA 5ª — DOS BENEFÍCIOS</h3>
<p>O EMPREGADO terá direito aos benefícios previstos na legislação trabalhista (férias, 13º salário, FGTS) e aos benefícios adicionais oferecidos pelo EMPREGADOR.</p>

<br/>
<p>Rio de Janeiro, ${hoje}.</p>

<br/><br/>
<div style="display:flex;justify-content:space-between;margin-top:40px;">
  <div style="text-align:center;width:45%;">
    <div style="border-top:1px solid #333;padding-top:8px;">
      <strong>EMPREGADOR</strong><br/>
      Igreja Comunidade Batista do Rio de Janeiro
    </div>
  </div>
  <div style="text-align:center;width:45%;">
    <div style="border-top:1px solid #333;padding-top:8px;">
      <strong>EMPREGADO</strong><br/>
      ${adm.nome || '_______________'}
    </div>
  </div>
</div>
`.trim();
}

function gerarContratoVoluntario(adm) {
  const hoje = new Date().toLocaleDateString('pt-BR');
  return `
<h2 style="text-align:center;margin-bottom:24px;">TERMO DE ADESÃO AO SERVIÇO VOLUNTÁRIO</h2>
<p>Pelo presente instrumento:</p>
<p><strong>ENTIDADE:</strong> Igreja Comunidade Batista do Rio de Janeiro — CBRio, pessoa jurídica de direito privado, com sede na cidade do Rio de Janeiro/RJ;</p>
<p><strong>VOLUNTÁRIO(A):</strong> ${adm.nome || '_______________'}, portador(a) do CPF nº ${adm.cpf || '_______________'}${adm.rg ? ', RG nº ' + adm.rg : ''}, residente em ${adm.endereco || '_______________'};</p>
<p>Firmam o presente Termo de Adesão ao Serviço Voluntário, nos termos da Lei nº 9.608/98:</p>

<h3>CLÁUSULA 1ª — DO OBJETO</h3>
<p>O(A) VOLUNTÁRIO(A) prestará, de forma gratuita e espontânea, serviços de <strong>${adm.cargo || '_______________'}</strong>${adm.area ? ', na área de ' + adm.area : ''}, sem qualquer vínculo empregatício ou obrigação de natureza trabalhista, previdenciária ou afim.</p>

<h3>CLÁUSULA 2ª — DO PERÍODO</h3>
<p>O serviço voluntário terá início em <strong>${adm.data_inicio ? new Date(adm.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR') : '___/___/______'}</strong>, com prazo indeterminado, podendo ser encerrado a qualquer momento por qualquer das partes, sem necessidade de aviso prévio.</p>

<h3>CLÁUSULA 3ª — DA GRATUIDADE</h3>
<p>O serviço voluntário NÃO gera vínculo empregatício nem obrigação de natureza trabalhista, previdenciária ou afim. O(A) VOLUNTÁRIO(A) não receberá remuneração pelos serviços prestados, podendo receber apenas ressarcimento de despesas comprovadamente realizadas no desempenho das atividades.</p>

<h3>CLÁUSULA 4ª — DAS OBRIGAÇÕES</h3>
<p>O(A) VOLUNTÁRIO(A) compromete-se a:<br/>
a) Desempenhar as atividades com dedicação e responsabilidade;<br/>
b) Respeitar as normas internas da ENTIDADE;<br/>
c) Manter sigilo sobre informações confidenciais.</p>

<br/>
<p>Rio de Janeiro, ${hoje}.</p>
<br/><br/>
<div style="display:flex;justify-content:space-between;margin-top:40px;">
  <div style="text-align:center;width:45%;"><div style="border-top:1px solid #333;padding-top:8px;"><strong>ENTIDADE</strong><br/>Igreja CBRio</div></div>
  <div style="text-align:center;width:45%;"><div style="border-top:1px solid #333;padding-top:8px;"><strong>VOLUNTÁRIO(A)</strong><br/>${adm.nome || '_______________'}</div></div>
</div>`.trim();
}

function gerarContratoEstagiario(adm) {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const salario = adm.salario ? Number(adm.salario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ ___________';
  return `
<h2 style="text-align:center;margin-bottom:24px;">TERMO DE COMPROMISSO DE ESTÁGIO</h2>
<p>Pelo presente instrumento, celebram o presente Termo de Compromisso de Estágio, nos termos da Lei nº 11.788/2008:</p>

<p><strong>CONCEDENTE:</strong> Igreja Comunidade Batista do Rio de Janeiro — CBRio, com sede na cidade do Rio de Janeiro/RJ;</p>
<p><strong>ESTAGIÁRIO(A):</strong> ${adm.nome || '_______________'}, portador(a) do CPF nº ${adm.cpf || '_______________'}${adm.rg ? ', RG nº ' + adm.rg : ''}, residente em ${adm.endereco || '_______________'};</p>

<h3>CLÁUSULA 1ª — DO OBJETO</h3>
<p>O estágio tem por objetivo proporcionar ao(à) ESTAGIÁRIO(A) experiência prática na área de <strong>${adm.cargo || '_______________'}</strong>${adm.area ? ', no setor de ' + adm.area : ''}, complementando sua formação acadêmica.</p>

<h3>CLÁUSULA 2ª — DO PERÍODO E HORÁRIO</h3>
<p>O estágio terá início em <strong>${adm.data_inicio ? new Date(adm.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR') : '___/___/______'}</strong>, com duração de 12 (doze) meses, podendo ser renovado até o limite de 2 (dois) anos. A jornada será de 6 (seis) horas diárias e 30 (trinta) horas semanais.</p>

<h3>CLÁUSULA 3ª — DA BOLSA-AUXÍLIO</h3>
<p>O(A) ESTAGIÁRIO(A) receberá bolsa-auxílio mensal no valor de <strong>${salario}</strong>, além de auxílio-transporte conforme legislação vigente.</p>

<h3>CLÁUSULA 4ª — DOS DIREITOS DO ESTAGIÁRIO</h3>
<p>a) Recesso remunerado de 30 dias a cada 12 meses de estágio;<br/>
b) Seguro contra acidentes pessoais;<br/>
c) Jornada reduzida em períodos de avaliação escolar.</p>

<h3>CLÁUSULA 5ª — DAS OBRIGAÇÕES</h3>
<p>O(A) ESTAGIÁRIO(A) deverá:<br/>
a) Cumprir a jornada estabelecida;<br/>
b) Apresentar relatórios periódicos de atividades;<br/>
c) Manter matrícula regular na instituição de ensino;<br/>
d) Zelar pelas informações e patrimônio da CONCEDENTE.</p>

<h3>CLÁUSULA 6ª — DA RESCISÃO</h3>
<p>O presente termo poderá ser rescindido a qualquer momento por qualquer das partes.</p>

<br/>
<p>Rio de Janeiro, ${hoje}.</p>
<br/><br/>
<div style="display:flex;justify-content:space-between;margin-top:40px;">
  <div style="text-align:center;width:30%;"><div style="border-top:1px solid #333;padding-top:8px;"><strong>CONCEDENTE</strong><br/>Igreja CBRio</div></div>
  <div style="text-align:center;width:30%;"><div style="border-top:1px solid #333;padding-top:8px;"><strong>ESTAGIÁRIO(A)</strong><br/>${adm.nome || '_______________'}</div></div>
  <div style="text-align:center;width:30%;"><div style="border-top:1px solid #333;padding-top:8px;"><strong>INSTITUIÇÃO DE ENSINO</strong><br/>_______________</div></div>
</div>`.trim();
}

// ═══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL: TabAdmissao
// ═══════════════════════════════════════════════════════════
export default function TabAdmissao() {
  const [admissoes, setAdmissoes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalForm, setModalForm] = useState(null);
  const [modalContrato, setModalContrato] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = filtroStatus ? { status: filtroStatus } : undefined;
      setAdmissoes(await rh.admissoes.list(params));
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [filtroStatus]);

  useEffect(() => { load(); }, [load]);

  const [localError, setLocalError] = useState('');

  async function salvar(data) {
    setSaving(true);
    try {
      if (data.id) await rh.admissoes.update(data.id, data);
      else await rh.admissoes.create(data);
      setModalForm(null);
      load(); setLocalError('');
    } catch (e) { setLocalError(e.message); }
    setSaving(false);
  }

  async function excluir(id) {
    try { await rh.admissoes.remove(id); load(); } catch (e) { setLocalError(e.message); }
  }

  async function concluir(id) {
    try { await rh.admissoes.concluir(id); load(); } catch (e) { setLocalError(e.message); }
  }

  function abrirContrato(adm) {
    if (!adm.contrato_editado) {
      const generators = { pj: gerarContratoPJ, clt: gerarContratoCLT, voluntario: gerarContratoVoluntario, estagiario: gerarContratoEstagiario };
      const gen = generators[adm.tipo_contrato] || gerarContratoCLT;
      setModalContrato({ ...adm, contrato_editado: gen(adm) });
    } else {
      setModalContrato(adm);
    }
  }

  async function salvarContrato(adm) {
    setSaving(true);
    try {
      await rh.admissoes.update(adm.id, {
        contrato_editado: adm.contrato_editado,
        status: adm.status === 'rascunho' || adm.status === 'formulario_preenchido' ? 'contrato_gerado' : adm.status,
      });
      setModalContrato(null);
      load();
    } catch (e) { setLocalError(e.message); }
    setSaving(false);
  }

  const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

  return (<>
    {localError && <div style={{ color: '#ef4444', background: '#ef444418', border: '1px solid #ef444450', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>{localError}</div>}
    <div style={styles.filterRow}>
      <ShadSelect value={filtroStatus || '__all__'} onValueChange={v => setFiltroStatus(v === '__all__' ? '' : v)}>
        <SelectTrigger className="h-9 w-auto min-w-[160px] text-sm"><SelectValue placeholder="Todos os status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Todos os status</SelectItem>
          {Object.entries(STATUS_ADM).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
        </SelectContent>
      </ShadSelect>
      <Button onClick={() => setModalForm({ tipo_contrato: 'pj', status: 'rascunho' })}>
        + Nova Admissão
      </Button>
    </div>

    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div style={styles.cardTitle}>Processos de Admissão</div>
      </div>
      <table style={styles.table}>
        <thead><tr>
          <th style={styles.th}>Nome</th>
          <th style={styles.th}>Tipo</th>
          <th style={styles.th}>Cargo</th>
          <th style={styles.th}>Status</th>
          <th style={styles.th}>Data Início</th>
          <th style={styles.th}>Ações</th>
        </tr></thead>
        <tbody>
          {loading ? <tr><td style={styles.td} colSpan={6}>Carregando...</td></tr>
          : admissoes.length === 0 ? <tr><td style={styles.td} colSpan={6}><div style={styles.empty}>Nenhuma admissão em andamento</div></td></tr>
          : admissoes.map(a => {
            const st = STATUS_ADM[a.status] || STATUS_ADM.rascunho;
            return (
              <tr key={a.id}>
                <td style={{ ...styles.td, fontWeight: 600 }}>{a.nome}</td>
                <td style={styles.td}><span style={styles.badge(a.tipo_contrato === 'pj' ? C.purple : C.blue, a.tipo_contrato === 'pj' ? C.purpleBg : C.blueBg)}>{TIPO_CONTRATO[a.tipo_contrato]}</span></td>
                <td style={styles.td}>{a.cargo || '—'}</td>
                <td style={styles.td}><span style={styles.badge(st.c, st.bg)}>{st.label}</span></td>
                <td style={styles.td}>{fmtDate(a.data_inicio)}</td>
                <td style={styles.td}>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <Button variant="ghost" size="xs" onClick={() => setModalForm(a)}>Editar</Button>
                    <Button variant="ghost" size="xs" className="text-[#00B39D]" onClick={() => abrirContrato(a)}>Contrato</Button>
                    {a.status !== 'concluido' && a.status !== 'cancelado' && (
                      <Button variant="ghost" size="xs" className="text-emerald-500" onClick={() => concluir(a.id)}>Concluir</Button>
                    )}
                    <Button variant="ghost" size="xs" className="text-red-500" onClick={() => excluir(a.id)}>Excluir</Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>

    {/* Modal: Formulário de Admissão */}
    {modalForm && <AdmissaoFormModal data={modalForm} onClose={() => setModalForm(null)} onSave={salvar} saving={saving} />}

    {/* Modal: Editor de Contrato */}
    {modalContrato && <ContratoEditorModal data={modalContrato} onClose={() => setModalContrato(null)} onSave={salvarContrato} saving={saving} />}
  </>);
}

// ═══════════════════════════════════════════════════════════
// PAINEL LATERAL: Formulário de Admissão
// ═══════════════════════════════════════════════════════════
function AdmissaoFormModal({ data, onClose, onSave, saving }) {
  const [f, setF] = useState({ ...data });
  const [errors, setErrors] = useState({});
  const upd = (k, v) => { setF(p => ({ ...p, [k]: v })); setErrors(e => ({ ...e, [k]: '' })); };

  function validate() {
    const errs = {};
    if (!f.nome?.trim()) errs.nome = 'Nome é obrigatório';
    if (!f.cargo?.trim()) errs.cargo = 'Cargo é obrigatório';
    if (!f.data_inicio) errs.data_inicio = 'Data de início é obrigatória';
    if (f.tipo_contrato === 'pj') {
      if (!f.pj_razao_social?.trim()) errs.pj_razao_social = 'Razão social é obrigatória';
      if (!f.pj_cnpj?.trim()) errs.pj_cnpj = 'CNPJ é obrigatório';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSave() {
    if (validate()) onSave(f);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex' }}>
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
      <div style={{ width: '55%', minWidth: 500, maxWidth: 700, background: 'var(--cbrio-modal-bg)', overflowY: 'auto', boxShadow: '-8px 0 30px rgba(0,0,0,0.3)', animation: 'slideInRight 0.25s ease-out', display: 'flex', flexDirection: 'column' }}>
        {/* Header sticky */}
        <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--cbrio-modal-bg)', padding: '20px 28px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{f.id ? 'Editar Admissão' : 'Nova Admissão'}</div>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: '24px 28px', overflowY: 'auto' }}>
          <AdmSelect label="Tipo de Contrato *" value={f.tipo_contrato || 'pj'} onChange={e => upd('tipo_contrato', e.target.value)}>
            {Object.entries(TIPO_CONTRATO).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </AdmSelect>

          <div style={styles.section}>
            <div style={styles.sectionTitle}>Dados Pessoais</div>
            <Input label="Nome Completo *" value={f.nome || ''} onChange={e => upd('nome', e.target.value)} error={errors.nome} />
            <div style={styles.formRow}>
              <Input label="CPF" value={f.cpf || ''} onChange={e => upd('cpf', e.target.value)} />
              <Input label="RG" value={f.rg || ''} onChange={e => upd('rg', e.target.value)} />
            </div>
            <div style={styles.formRow}>
              <Input label="Email" type="email" value={f.email || ''} onChange={e => upd('email', e.target.value)} />
              <Input label="Telefone" value={f.telefone || ''} onChange={e => upd('telefone', e.target.value)} />
            </div>
            <Input label="Data de Nascimento" type="date" value={f.data_nascimento || ''} onChange={e => upd('data_nascimento', e.target.value)} />
            <Input label="Endereço Completo" value={f.endereco || ''} onChange={e => upd('endereco', e.target.value)} />
          </div>

          {f.tipo_contrato === 'pj' && (
            <div style={styles.section}>
              <div style={styles.sectionTitle}>Dados da Empresa (PJ)</div>
              <Input label="Razão Social *" value={f.pj_razao_social || ''} onChange={e => upd('pj_razao_social', e.target.value)} error={errors.pj_razao_social} />
              <div style={styles.formRow}>
                <Input label="Nome Fantasia" value={f.pj_nome_fantasia || ''} onChange={e => upd('pj_nome_fantasia', e.target.value)} />
                <Input label="CNPJ *" value={f.pj_cnpj || ''} onChange={e => upd('pj_cnpj', e.target.value)} error={errors.pj_cnpj} />
              </div>
              <Input label="Inscrição Municipal" value={f.pj_inscricao_municipal || ''} onChange={e => upd('pj_inscricao_municipal', e.target.value)} />
              <Input label="Endereço da Empresa" value={f.pj_endereco_empresa || ''} onChange={e => upd('pj_endereco_empresa', e.target.value)} />

              <div style={{ ...styles.sectionTitle, marginTop: 16 }}>Dados Bancários</div>
              <div style={styles.formRow}>
                <Input label="Banco" value={f.pj_banco || ''} onChange={e => upd('pj_banco', e.target.value)} />
                <Input label="Agência" value={f.pj_agencia || ''} onChange={e => upd('pj_agencia', e.target.value)} />
              </div>
              <div style={styles.formRow}>
                <Input label="Conta" value={f.pj_conta || ''} onChange={e => upd('pj_conta', e.target.value)} />
                <Input label="Chave PIX" value={f.pj_pix || ''} onChange={e => upd('pj_pix', e.target.value)} />
              </div>
            </div>
          )}

          <div style={styles.section}>
            <div style={styles.sectionTitle}>Cargo e Remuneração</div>
            <div style={styles.formRow}>
              <Input label="Cargo *" value={f.cargo || ''} onChange={e => upd('cargo', e.target.value)} error={errors.cargo} />
              <Input label="Área" value={f.area || ''} onChange={e => upd('area', e.target.value)} />
            </div>
            <div style={styles.formRow}>
              <Input label="Salário / Valor Mensal (R$)" type="number" step="0.01" value={f.salario || ''} onChange={e => upd('salario', e.target.value)} />
              <Input label="Data de Início *" type="date" value={f.data_inicio || ''} onChange={e => upd('data_inicio', e.target.value)} error={errors.data_inicio} />
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Observações</label>
            <textarea style={{ ...styles.input, minHeight: 60, resize: 'vertical' }} value={f.observacoes || ''} onChange={e => upd('observacoes', e.target.value)} />
          </div>
        </div>

        {/* Footer sticky */}
        <div style={{ position: 'sticky', bottom: 0, background: 'var(--cbrio-modal-bg)', padding: '16px 28px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : f.id ? 'Salvar' : 'Criar Admissão'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PAINEL LATERAL: Editor de Contrato (contentEditable)
// ═══════════════════════════════════════════════════════════
function ContratoEditorModal({ data, onClose, onSave, saving }) {
  const editorRef = useRef(null);
  const [adm, setAdm] = useState({ ...data });

  function handleSave() {
    if (editorRef.current) {
      adm.contrato_editado = editorRef.current.innerHTML;
    }
    onSave(adm);
  }

  function handlePrint() {
    const content = editorRef.current?.innerHTML;
    if (!content) return;
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>Contrato — ${adm.nome}</title>
      <style>
        body { font-family: 'Times New Roman', serif; max-width: 700px; margin: 40px auto; padding: 0 24px; color: #1a1a1a; line-height: 1.7; font-size: 14px; }
        h2 { font-size: 18px; } h3 { font-size: 15px; margin-top: 24px; }
        @media print { body { margin: 0; } }
      </style></head><body>${content}</body></html>
    `);
    w.document.close();
    w.print();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex' }}>
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
      <div style={{ width: '65%', minWidth: 600, maxWidth: 900, background: 'var(--cbrio-modal-bg)', boxShadow: '-8px 0 30px rgba(0,0,0,0.3)', animation: 'slideInRight 0.25s ease-out', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--cbrio-modal-bg)', padding: '20px 28px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>Contrato — {adm.nome}</div>
            <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>Edite o texto abaixo. O contrato é totalmente editável.</div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>

        {/* Toolbar */}
        <div style={{ padding: '12px 28px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 8 }}>
          <Button variant="outline" onClick={() => document.execCommand('bold')}>Negrito</Button>
          <Button variant="outline" onClick={() => document.execCommand('italic')}>Itálico</Button>
          <Button variant="outline" onClick={() => document.execCommand('underline')}>Sublinhado</Button>
          <div style={{ flex: 1 }} />
          <Button variant="ghost" onClick={handlePrint}>Imprimir / PDF</Button>
        </div>

        {/* Editor */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          dangerouslySetInnerHTML={{ __html: (adm.contrato_editado || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/on\w+\s*=/gi, 'data-removed=') }}
          style={{
            flex: 1, padding: '32px 48px', overflowY: 'auto',
            outline: 'none', fontSize: 14, lineHeight: 1.7, color: C.text,
            fontFamily: "'Times New Roman', serif",
            background: 'var(--cbrio-input-bg)',
          }}
        />

        {/* Footer */}
        <div style={{ position: 'sticky', bottom: 0, background: 'var(--cbrio-modal-bg)', padding: '16px 28px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar Contrato'}
          </Button>
        </div>
      </div>
    </div>
  );
}
