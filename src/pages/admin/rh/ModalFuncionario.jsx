import { useState, useRef } from 'react';
import { supabase } from '../../../supabaseClient';
import { Button } from '../../../components/ui/button';
import { X } from 'lucide-react';

const s = {
  label:    { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--cbrio-text2)', marginBottom: 5, marginTop: 14 },
  input:    { width: '100%', padding: '9px 12px', border: '1px solid var(--cbrio-border)', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: 'var(--cbrio-input-bg)', color: 'var(--cbrio-text)' },
  select:   { width: '100%', padding: '9px 12px', border: '1px solid var(--cbrio-border)', borderRadius: 8, fontSize: 14, outline: 'none', background: 'var(--cbrio-input-bg)', color: 'var(--cbrio-text)', boxSizing: 'border-box' },
  fullCol:  { gridColumn: '1 / -1' },
};

const CAMPOS = [
  { key: 'nome',          label: 'Nome completo *',  type: 'text',   required: true, fullRow: true },
  { key: 'cargo',         label: 'Cargo *',           type: 'text',   required: true },
  { key: 'email',         label: 'E-mail',            type: 'email' },
  { key: 'telefone',      label: 'Telefone',          type: 'text' },
  { key: 'cpf',           label: 'CPF',               type: 'text' },
  { key: 'area',          label: 'Área',              type: 'text' },
  { key: 'data_admissao', label: 'Data de admissão *',type: 'date',   required: true },
  { key: 'salario',       label: 'Salário (R$)',      type: 'number' },
];

export default function ModalFuncionario({ funcionario, onSalvar, onFechar }) {
  const [form, setForm] = useState({
    nome: '', cargo: '', email: '', telefone: '', cpf: '', area: '',
    data_admissao: '', salario: '', tipo_contrato: 'clt', status: 'ativo',
    observacoes: '', foto_url: '',
    ...funcionario,
  });
  const [salvando, setSalvando] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(funcionario?.foto_url || '');
  const [localError, setLocalError] = useState('');
  const fileRef = useRef(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setLocalError('Selecione um arquivo de imagem (JPG, PNG, etc.)'); return; }
    if (file.size > 5 * 1024 * 1024) { setLocalError('A imagem deve ter no máximo 5MB'); return; }

    setUploading(true);
    setLocalError('');
    try {
      const ext = file.name.split('.').pop();
      const filePath = `colaboradores/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('rh-fotos').upload(filePath, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('rh-fotos').getPublicUrl(filePath);
      setForm((f) => ({ ...f, foto_url: publicUrl }));
      setPreviewUrl(publicUrl);
    } catch (err) {
      console.error('Erro ao fazer upload:', err);
      setLocalError('Erro ao fazer upload da foto. Tente novamente.');
    } finally { setUploading(false); }
  }

  function handleRemoveFoto() {
    setForm((f) => ({ ...f, foto_url: '' }));
    setPreviewUrl('');
    if (fileRef.current) fileRef.current.value = '';
  }

  function validarCPF(cpf) {
    if (!cpf) return true;
    const nums = cpf.replace(/\D/g, '');
    if (nums.length !== 11) return false;
    if (/^(\d)\1+$/.test(nums)) return false;
    let soma = 0;
    for (let i = 0; i < 9; i++) soma += parseInt(nums[i]) * (10 - i);
    let dig = 11 - (soma % 11);
    if (dig >= 10) dig = 0;
    if (parseInt(nums[9]) !== dig) return false;
    soma = 0;
    for (let i = 0; i < 10; i++) soma += parseInt(nums[i]) * (11 - i);
    dig = 11 - (soma % 11);
    if (dig >= 10) dig = 0;
    return parseInt(nums[10]) === dig;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.cpf && !validarCPF(form.cpf)) {
      setLocalError('CPF inválido. Verifique os dígitos.');
      return;
    }
    setLocalError('');
    setSalvando(true);
    const payload = { ...form };
    if (payload.salario === '') delete payload.salario;
    await onSalvar(payload);
    setSalvando(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex' }}>
      {/* Overlay */}
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.5)' }} onClick={onFechar} />
      {/* Side Panel */}
      <div style={{ width: '50%', minWidth: 440, maxWidth: 600, background: 'var(--cbrio-modal-bg)', overflowY: 'auto', boxShadow: '-8px 0 30px rgba(0,0,0,0.3)', animation: 'slideInRight 0.25s ease-out', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--cbrio-modal-bg)', padding: '20px 24px 12px', borderBottom: '1px solid var(--cbrio-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--cbrio-text)' }}>{funcionario?.id ? 'Editar Colaborador' : 'Admitir Colaborador'}</div>
          <Button variant="ghost" size="icon" onClick={onFechar}><X className="h-4 w-4" /></Button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding: '16px 24px 24px', flex: 1 }}>
          {localError && (
            <div style={{ color: '#ef4444', background: '#ef444418', border: '1px solid #ef444450', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, fontWeight: 500 }}>
              {localError}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            {CAMPOS.map(({ key, label, type, required, fullRow }) => (
              <div key={key} style={fullRow ? s.fullCol : undefined}>
                <label style={s.label}>{label}</label>
                <input style={s.input} type={type} value={form[key] ?? ''} onChange={set(key)} required={required} step={type === 'number' ? '0.01' : undefined} />
              </div>
            ))}

            <div style={s.fullCol}>
              <label style={s.label}>Foto do colaborador</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {previewUrl && (
                  <img src={previewUrl} alt="Foto" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--cbrio-border)', flexShrink: 0 }} onError={() => setPreviewUrl('')} />
                )}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} disabled={uploading} style={{ display: 'none' }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                      {uploading ? 'Enviando...' : previewUrl ? 'Trocar foto' : 'Escolher foto'}
                    </Button>
                    {previewUrl && (
                      <Button type="button" variant="destructive" size="sm" onClick={handleRemoveFoto}>Remover</Button>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--cbrio-text2)' }}>JPG, PNG — máx. 5MB</span>
                </div>
              </div>
            </div>

            <div>
              <label style={s.label}>Tipo de contrato</label>
              <select style={s.select} value={form.tipo_contrato} onChange={set('tipo_contrato')}>
                <option value="clt">CLT</option>
                <option value="pj">PJ</option>
                <option value="voluntario">Voluntário</option>
                <option value="estagiario">Estagiário</option>
              </select>
            </div>

            <div>
              <label style={s.label}>Status</label>
              <select style={s.select} value={form.status} onChange={set('status')}>
                <option value="ativo">Ativo</option>
                <option value="ferias">Férias</option>
                <option value="licenca">Licença</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>

            <div style={s.fullCol}>
              <label style={s.label}>Observações</label>
              <textarea style={{ ...s.input, height: 80, resize: 'vertical' }} value={form.observacoes ?? ''} onChange={set('observacoes')} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--cbrio-border)' }}>
            <Button type="button" variant="ghost" onClick={onFechar}>Cancelar</Button>
            <Button type="submit" disabled={salvando || uploading}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
