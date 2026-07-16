// ═══════════════════════════════════════════════════════════
// Admissão · peças reutilizáveis (form + contrato) usadas pela ficha do
// colaborador "Em admissão" dentro de Colaboradores. Antes era uma aba
// própria (TabAdmissao) que batia em endpoints inexistentes (/rh/admissoes).
// Agora a admissão é um STATUS do colaborador: o contratado entra como
// rh_funcionarios status='em_admissao' e, ao concluir, vira 'ativo'.
// ═══════════════════════════════════════════════════════════
import { useState, useRef } from 'react';
import { Button } from '../../../components/ui/button';
import { BirthDatePicker } from '../../../components/ui/birth-date-picker';
import { Select as ShadSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';

const C = {
  card: 'var(--cbrio-card)', primary: '#00B39D',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)',
};

// tipo_contrato é gravado em MAIÚSCULAS (CHECK do banco: CLT/PJ/PJ+/PREBENDA).
const TIPO_CONTRATO = { CLT: 'CLT', PJ: 'PJ', 'PJ+': 'PJ+', PREBENDA: 'Prebenda' };
export const ehPJ = (t) => String(t || '').toUpperCase().startsWith('PJ'); // cobre PJ e PJ+

const styles = {
  input: { padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, outline: 'none', width: '100%', background: 'var(--cbrio-input-bg)', color: C.text },
  label: { fontSize: 11, fontWeight: 600, color: C.text2, marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 },
  formGroup: { marginBottom: 14 },
  formRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  section: { marginTop: 20, padding: 16, background: 'var(--cbrio-input-bg)', borderRadius: 10 },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: C.primary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
};

function Input({ label, error, ...props }) {
  return (
    <div style={styles.formGroup}>
      {label && <label style={styles.label}>{label}</label>}
      <input style={{ ...styles.input, ...(error ? { borderColor: '#ef4444' } : {}) }} {...props} />
      {error && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>{error}</div>}
    </div>
  );
}
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

// ── Templates de contrato ─────────────────────────────────
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

// Dispatcher: PJ/PJ+ → contrato de prestação de serviços; CLT/PREBENDA → CLT.
export function gerarContratoAdmissao(adm) {
  return ehPJ(adm.tipo_contrato) ? gerarContratoPJ(adm) : gerarContratoCLT(adm);
}

// ── Mapeamento form ↔ rh_funcionarios ─────────────────────
// Campos que não têm coluna própria viajam no jsonb admissao_dados.
const ADMISSAO_EXTRA_KEYS = ['rg', 'data_nascimento', 'endereco', 'etapa', 'contrato_editado',
  'pj_razao_social', 'pj_nome_fantasia', 'pj_cnpj', 'pj_inscricao_municipal', 'pj_endereco_empresa',
  'pj_banco', 'pj_agencia', 'pj_conta', 'pj_pix'];

export function formParaFuncionario(f) {
  const admissao_dados = {};
  ADMISSAO_EXTRA_KEYS.forEach(k => { if (f[k] !== undefined && f[k] !== '' && f[k] !== null) admissao_dados[k] = f[k]; });
  return {
    nome: f.nome, cpf: f.cpf || null, email: f.email || null, telefone: f.telefone || null,
    cargo: f.cargo, area: f.area || null,
    tipo_contrato: String(f.tipo_contrato || 'CLT').toUpperCase(),
    salario: f.salario || null,
    data_admissao: f.data_inicio || null,
    observacoes: f.observacoes || null,
    admissao_dados,
  };
}

export function funcionarioParaForm(func) {
  return {
    id: func.id,
    nome: func.nome || '', cpf: func.cpf || '', email: func.email || '', telefone: func.telefone || '',
    cargo: func.cargo || '', area: func.area || '',
    tipo_contrato: func.tipo_contrato || 'CLT',
    salario: func.salario ?? '',
    data_inicio: func.data_admissao || '',
    observacoes: func.observacoes || '',
    ...(func.admissao_dados || {}),
  };
}

// ── Painel lateral: formulário de admissão ────────────────
export function AdmissaoFormModal({ data, onClose, onSave, saving }) {
  const [f, setF] = useState({ tipo_contrato: 'PJ', ...data });
  const [errors, setErrors] = useState({});
  const upd = (k, v) => { setF(p => ({ ...p, [k]: v })); setErrors(e => ({ ...e, [k]: '' })); };

  function validate() {
    const errs = {};
    if (!f.nome?.trim()) errs.nome = 'Nome é obrigatório';
    if (!f.cargo?.trim()) errs.cargo = 'Cargo é obrigatório';
    if (!f.data_inicio) errs.data_inicio = 'Data de início é obrigatória';
    if (ehPJ(f.tipo_contrato)) {
      if (!f.pj_razao_social?.trim()) errs.pj_razao_social = 'Razão social é obrigatória';
      if (!f.pj_cnpj?.trim()) errs.pj_cnpj = 'CNPJ é obrigatório';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }
  function handleSave() { if (validate()) onSave(f); }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex' }}>
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
      <div style={{ width: '55%', minWidth: 'min(500px, 100vw)', maxWidth: 700, background: 'var(--cbrio-modal-bg)', overflowY: 'auto', boxShadow: '-8px 0 30px rgba(0,0,0,0.3)', animation: 'slideInRight 0.25s ease-out', display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--cbrio-modal-bg)', padding: '20px 28px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{f.id ? 'Editar admissão' : 'Nova admissão'}</div>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>

        <div style={{ flex: 1, padding: '24px 28px', overflowY: 'auto' }}>
          <AdmSelect label="Tipo de Contrato *" value={f.tipo_contrato || 'PJ'} onChange={e => upd('tipo_contrato', e.target.value)}>
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
            <div style={styles.formGroup}>
              <label style={styles.label}>Data de Nascimento</label>
              <BirthDatePicker value={f.data_nascimento || ''} onChange={v => upd('data_nascimento', v)} />
            </div>
            <Input label="Endereço Completo" value={f.endereco || ''} onChange={e => upd('endereco', e.target.value)} />
          </div>

          {ehPJ(f.tipo_contrato) && (
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

        <div style={{ position: 'sticky', bottom: 0, background: 'var(--cbrio-modal-bg)', padding: '16px 28px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : f.id ? 'Salvar' : 'Criar admissão'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Painel lateral: editor de contrato (contentEditable) ──
export function ContratoEditorModal({ data, onClose, onSave, saving }) {
  const editorRef = useRef(null);
  const [adm] = useState({ ...data });

  function handleSave() {
    const html = editorRef.current ? editorRef.current.innerHTML : adm.contrato_editado;
    onSave({ ...adm, contrato_editado: html });
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
      <div style={{ width: '65%', minWidth: 'min(600px, 100vw)', maxWidth: 900, background: 'var(--cbrio-modal-bg)', boxShadow: '-8px 0 30px rgba(0,0,0,0.3)', animation: 'slideInRight 0.25s ease-out', display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--cbrio-modal-bg)', padding: '20px 28px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>Contrato — {adm.nome}</div>
            <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>Edite o texto abaixo. O contrato é totalmente editável.</div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>

        <div style={{ padding: '12px 28px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 8 }}>
          <Button variant="outline" onClick={() => document.execCommand('bold')}>Negrito</Button>
          <Button variant="outline" onClick={() => document.execCommand('italic')}>Itálico</Button>
          <Button variant="outline" onClick={() => document.execCommand('underline')}>Sublinhado</Button>
          <div style={{ flex: 1 }} />
          <Button variant="ghost" onClick={handlePrint}>Imprimir / PDF</Button>
        </div>

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
