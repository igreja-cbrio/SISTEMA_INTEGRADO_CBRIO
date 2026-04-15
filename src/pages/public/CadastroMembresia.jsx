import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { cadastroPublico } from '../../api';
import { LoginShapesBackground } from '../../components/ui/shape-landing-hero';
import { MultistepFormShell } from '../../components/ui/multistep-form';
import MemberWalletPass from '../../components/membresia/MemberWalletPass';
import MemberWalletDialog from '../../components/membresia/MemberWalletDialog';

// ── Helpers de máscara ──
function soDigitos(v) { return (v || '').toString().replace(/\D+/g, ''); }

function mascaraCpf(v) {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function mascaraTelefone(v) {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function cpfValido(v) {
  const d = soDigitos(v);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  const calc = (base, fator) => {
    let soma = 0;
    for (let i = 0; i < base.length; i += 1) soma += parseInt(base[i], 10) * (fator - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const dv1 = calc(d.slice(0, 9), 10);
  const dv2 = calc(d.slice(0, 10), 11);
  return dv1 === parseInt(d[9], 10) && dv2 === parseInt(d[10], 10);
}

// ── Input reutilizável com label flutuante ──
function Field({ id, label, type = 'text', value, onChange, required, placeholder, as = 'input', rows, maxLength, autoComplete, inputMode }) {
  const [focused, setFocused] = useState(false);
  const active = focused || (value !== undefined && value !== null && String(value).length > 0);
  const Tag = as;

  return (
    <div style={{ position: 'relative', marginBottom: 20 }}>
      <Tag
        id={id}
        name={id}
        type={as === 'input' ? type : undefined}
        value={value}
        rows={rows}
        maxLength={maxLength}
        autoComplete={autoComplete}
        inputMode={inputMode}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        required={required}
        placeholder={placeholder && !active ? '' : ''}
        style={{
          display: 'block', width: '100%',
          padding: as === 'textarea' ? '14px 0 8px' : '10px 0',
          fontSize: 14,
          color: 'var(--cbrio-text)',
          background: 'transparent',
          border: 'none',
          borderBottom: `2px solid ${focused ? '#00B39D' : 'var(--cbrio-border)'}`,
          outline: 'none',
          transition: 'border-color 0.3s',
          boxSizing: 'border-box',
          fontFamily: 'inherit',
          resize: as === 'textarea' ? 'vertical' : undefined,
        }}
      />
      <label htmlFor={id} style={{
        position: 'absolute', left: 0,
        top: active ? -14 : 10,
        fontSize: active ? 11 : 14,
        color: focused ? '#00B39D' : 'var(--cbrio-text3)',
        transition: 'all 0.2s', pointerEvents: 'none',
      }}>
        {label}{required && <span style={{ color: '#ef4444' }}> *</span>}
      </label>
    </div>
  );
}

function SelectField({ id, label, value, onChange, options, required }) {
  const [focused, setFocused] = useState(false);
  const active = focused || (value !== undefined && value !== null && String(value).length > 0);

  return (
    <div style={{ position: 'relative', marginBottom: 20 }}>
      <select
        id={id}
        name={id}
        value={value || ''}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        required={required}
        style={{
          display: 'block', width: '100%', padding: '10px 0', fontSize: 14,
          color: 'var(--cbrio-text)', background: 'transparent', border: 'none',
          borderBottom: `2px solid ${focused ? '#00B39D' : 'var(--cbrio-border)'}`,
          outline: 'none', transition: 'border-color 0.3s',
          appearance: 'none',
          WebkitAppearance: 'none',
          boxSizing: 'border-box',
          cursor: 'pointer',
        }}
      >
        <option value=""></option>
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ background: '#161616', color: '#e5e5e5' }}>
            {o.label}
          </option>
        ))}
      </select>
      <label htmlFor={id} style={{
        position: 'absolute', left: 0,
        top: active ? -14 : 10,
        fontSize: active ? 11 : 14,
        color: focused ? '#00B39D' : 'var(--cbrio-text3)',
        transition: 'all 0.2s', pointerEvents: 'none',
      }}>
        {label}{required && <span style={{ color: '#ef4444' }}> *</span>}
      </label>
      <span style={{
        position: 'absolute', right: 4, bottom: 12,
        pointerEvents: 'none', color: 'var(--cbrio-text3)', fontSize: 12,
      }}>▾</span>
    </div>
  );
}

// ── Texto de consentimento LGPD ──
const TEXTO_CONSENTIMENTO =
  'Declaro que li e concordo com o tratamento dos meus dados pessoais pela CBRio para fins de acolhimento e acompanhamento pastoral, conforme a Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018). Meus dados serão mantidos em ambiente seguro e não serão compartilhados com terceiros sem minha autorização.';

const ESTADO_CIVIL_OPTS = [
  { value: 'solteiro', label: 'Solteiro(a)' },
  { value: 'casado', label: 'Casado(a)' },
  { value: 'divorciado', label: 'Divorciado(a)' },
  { value: 'viuvo', label: 'Viúvo(a)' },
  { value: 'uniao_estavel', label: 'União estável' },
];

const STEPS = [
  { id: 'pessoal', title: 'Dados Pessoais' },
  { id: 'info', title: 'Informações' },
  { id: 'endereco', title: 'Endereço' },
  { id: 'termos', title: 'Termos' },
];

function Row({ children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 style={{
      fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: 1.2, color: '#00B39D',
      margin: '8px 0 14px', paddingBottom: 6,
      borderBottom: '1px solid var(--cbrio-border)',
    }}>
      {children}
    </h2>
  );
}

function CheckboxField({ id, checked, onChange, label }) {
  return (
    <label htmlFor={id} style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      fontSize: 13, color: '#d4d4d4', cursor: 'pointer',
      padding: '6px 0',
    }}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{
          marginTop: 2, width: 16, height: 16,
          accentColor: '#00B39D', cursor: 'pointer',
        }}
      />
      <span style={{ lineHeight: 1.5 }}>{label}</span>
    </label>
  );
}

export default function CadastroMembresia() {
  const [currentStep, setCurrentStep] = useState(0);
  const [form, setForm] = useState({
    nome: '', sobrenome: '', cpf: '', email: '', telefone: '',
    data_nascimento: '', estado_civil: '', endereco: '', bairro: '',
    cidade: '', cep: '', profissao: '', como_conheceu: '',
    website: '', // honeypot
  });
  const [aceitaTermos, setAceitaTermos] = useState(false);
  const [aceitaContato, setAceitaContato] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);

  // Foto
  const [fotoPreview, setFotoPreview] = useState(null);
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoUploading, setFotoUploading] = useState(false);
  const fotoRef = useRef(null);

  // Sugestão de família
  const [familiaSugerida, setFamiliaSugerida] = useState(null);
  const [familiaOpcoes, setFamiliaOpcoes] = useState([]);
  const [showFamiliaStep, setShowFamiliaStep] = useState(false);
  const [buscouFamilia, setBuscouFamilia] = useState(false);

  const origem = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const o = params.get('origem');
      return ['qr_code', 'evento', 'site'].includes(o) ? o : 'site';
    } catch { return 'site'; }
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setMasked = (k, mask) => (e) => setForm((f) => ({ ...f, [k]: mask(e.target.value) }));

  const [fotoDragOver, setFotoDragOver] = useState(false);

  const processarFoto = useCallback((file) => {
    if (!file.type.startsWith('image/')) { setError('Selecione um arquivo de imagem (JPG, PNG ou WebP).'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('A imagem deve ter no maximo 5 MB.'); return; }
    setFotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setFotoPreview(ev.target.result);
    reader.readAsDataURL(file);
    setError('');
  }, []);

  const handleFotoSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) processarFoto(file);
  }, [processarFoto]);

  const handleFotoDrop = useCallback((e) => {
    e.preventDefault();
    setFotoDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) processarFoto(file);
  }, [processarFoto]);

  // Step validation
  const isStepValid = () => {
    switch (currentStep) {
      case 0:
        return form.nome.trim() !== '' && form.sobrenome.trim() !== '' && soDigitos(form.telefone).length >= 10 && cpfValido(form.cpf);
      case 1:
        return !!form.data_nascimento;
      case 2:
        return true; // address is optional
      case 3:
        return aceitaTermos;
      default:
        return true;
    }
  };

  function validarForm() {
    if (!form.nome.trim()) return 'Informe seu nome.';
    if (!form.sobrenome.trim()) return 'Informe seu sobrenome.';
    if (soDigitos(form.telefone).length < 10) return 'Informe um celular válido com DDD.';
    if (!cpfValido(form.cpf)) return 'CPF inválido.';
    if (!form.data_nascimento) return 'Informe sua data de nascimento.';
    if (!aceitaTermos) return 'É necessário aceitar os termos para enviar o cadastro.';
    return null;
  }

  async function verificarFamiliaEEnviar() {
    setError('');
    const erro = validarForm();
    if (erro) { setError(erro); return; }

    if (buscouFamilia) {
      await enviarCadastro(familiaSugerida?.id);
      return;
    }

    setLoading(true);
    try {
      const { familias } = await cadastroPublico.verificarFamilia(form.sobrenome.trim());
      if (familias && familias.length > 0) {
        setFamiliaOpcoes(familias);
        setShowFamiliaStep(true);
        setBuscouFamilia(true);
      } else {
        setBuscouFamilia(true);
        await enviarCadastro();
      }
    } catch {
      setBuscouFamilia(true);
      await enviarCadastro();
    } finally {
      setLoading(false);
    }
  }

  async function enviarCadastro(familiaId) {
    setLoading(true);
    try {
      let foto_url = null;
      if (fotoFile) {
        setFotoUploading(true);
        try {
          const res = await cadastroPublico.uploadFoto(fotoFile);
          foto_url = res.foto_url;
        } catch { /* photo upload failure should not block cadastro */ }
        setFotoUploading(false);
      }

      const { sobrenome, ...rest } = form;
      await cadastroPublico.enviar({
        ...rest,
        nome: `${form.nome.trim()} ${sobrenome.trim()}`.trim(),
        cpf: soDigitos(form.cpf),
        origem,
        aceita_termos: aceitaTermos,
        aceita_contato: aceitaContato,
        consentimento_texto: TEXTO_CONSENTIMENTO,
        familia_sugerida_id: familiaId || null,
        foto_url,
      });
      setSent(true);
    } catch (err) {
      setError(err.message || 'Não foi possível enviar o cadastro. Tente novamente.');
      setShowFamiliaStep(false);
    } finally {
      setLoading(false);
    }
  }

  function selecionarFamilia(fam) {
    setFamiliaSugerida(fam);
    setShowFamiliaStep(false);
    enviarCadastro(fam.id);
  }

  function negarFamilia() {
    setFamiliaSugerida(null);
    setShowFamiliaStep(false);
    enviarCadastro(null);
  }

  const nextStep = () => {
    if (currentStep < STEPS.length - 1) setCurrentStep(s => s + 1);
  };
  const prevStep = () => {
    if (currentStep > 0) setCurrentStep(s => s - 1);
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
      padding: '40px 16px', background: '#0a0a0a',
    }}>
      <LoginShapesBackground />

      <div style={{
        position: 'relative', zIndex: 1, width: '100%', maxWidth: 640,
        background: 'rgba(22,22,22,0.78)', backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20,
        padding: '40px 36px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img
            src="/logo-cbrio-icon.png"
            alt="CBRio"
            style={{ width: 72, height: 72, marginBottom: 12, display: 'inline-block' }}
          />
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#e5e5e5', margin: 0 }}>Cadastro de Membresia</h1>
          <p style={{ fontSize: 13, color: '#a3a3a3', marginTop: 6, lineHeight: 1.5 }}>
            Preencha seus dados para que nossa equipe de acolhimento entre em contato.
          </p>
        </div>

        {sent ? (
          <div style={{
            padding: '32px 20px', textAlign: 'center',
            background: '#00B39D18', border: '1px solid #00B39D40', borderRadius: 14,
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: '#00B39D', color: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, marginBottom: 16,
            }}>&#10003;</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#e5e5e5', margin: 0 }}>
              Cadastro enviado!
            </h2>
            <p style={{ fontSize: 13, color: '#a3a3a3', marginTop: 10, lineHeight: 1.5 }}>
              Obrigado por se conectar com a CBRio. Em breve nossa equipe entrará em contato com você.
            </p>

            {/* QR de membro — adicionar na wallet do dispositivo */}
            <div style={{
              marginTop: 24, paddingTop: 20,
              borderTop: '1px solid rgba(255,255,255,0.08)',
            }}>
              <MemberWalletPass
                cpf={soDigitos(form.cpf)}
                dataNascimento={form.data_nascimento}
                title="Seu QR de membro CBRio"
                inline
              />
            </div>
          </div>
        ) : showFamiliaStep ? (
          <div style={{
            padding: '28px 20px', textAlign: 'center',
            background: 'rgba(0,179,157,0.06)', border: '1px solid rgba(0,179,157,0.25)',
            borderRadius: 14,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: '#00B39D30', color: '#00B39D',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, marginBottom: 14,
            }}>&#x1F3E0;</div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#e5e5e5', margin: '0 0 8px' }}>
              Encontramos uma familia!
            </h2>
            <p style={{ fontSize: 13, color: '#a3a3a3', lineHeight: 1.5, marginBottom: 20 }}>
              {familiaOpcoes.length === 1
                ? `Existe a familia "${familiaOpcoes[0].nome}" cadastrada. Voce faz parte dessa familia?`
                : `Encontramos familias com sobrenome parecido. Voce faz parte de alguma delas?`}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360, margin: '0 auto' }}>
              {familiaOpcoes.map((fam) => (
                <button
                  key={fam.id}
                  type="button"
                  onClick={() => selecionarFamilia(fam)}
                  disabled={loading}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: 8, padding: '12px 20px',
                    background: 'rgba(0,179,157,0.12)', border: '1px solid rgba(0,179,157,0.35)',
                    borderRadius: 10, color: '#00B39D', fontSize: 14, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}
                >
                  Sim, sou da familia {fam.nome}
                </button>
              ))}
              <button
                type="button"
                onClick={negarFamilia}
                disabled={loading}
                style={{
                  padding: '12px 20px', background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
                  color: '#a3a3a3', fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', transition: 'all 0.2s',
                }}
              >
                {loading ? 'Enviando...' : 'Nao, nao faco parte de nenhuma dessas familias'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div style={{
                background: '#ef444418', border: '1px solid #ef444440', borderRadius: 10,
                padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#ef4444',
              }}>
                {error}
              </div>
            )}

            {/* Honeypot */}
            <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
              <label htmlFor="website">Website</label>
              <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off"
                value={form.website} onChange={set('website')} />
            </div>

            <MultistepFormShell
              steps={STEPS}
              currentStep={currentStep}
              onNext={nextStep}
              onPrev={prevStep}
              onSubmit={verificarFamiliaEEnviar}
              isSubmitting={loading}
              isStepValid={isStepValid()}
              submitLabel="Enviar cadastro"
            >
              {/* Step 1: Dados Pessoais */}
              {currentStep === 0 && (
                <div>
                  <SectionTitle>Dados pessoais</SectionTitle>

                  {/* Foto */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20, gap: 8 }}>
                    <div
                      onClick={() => fotoRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setFotoDragOver(true); }}
                      onDragLeave={() => setFotoDragOver(false)}
                      onDrop={handleFotoDrop}
                      style={{
                        width: 96, height: 96, borderRadius: '50%',
                        background: fotoPreview ? 'transparent' : fotoDragOver ? 'rgba(0,179,157,0.25)' : 'rgba(0,179,157,0.12)',
                        border: `2px dashed ${fotoDragOver ? '#00B39D' : fotoPreview ? '#00B39D' : 'var(--cbrio-border)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', overflow: 'hidden', position: 'relative',
                        transition: 'border-color 0.3s, background 0.3s',
                      }}
                    >
                      {fotoPreview ? (
                        <img src={fotoPreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ textAlign: 'center', color: fotoDragOver ? '#00B39D' : '#a3a3a3' }}>
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                            <circle cx="12" cy="13" r="4" />
                          </svg>
                          <div style={{ fontSize: 10, marginTop: 2 }}>Foto</div>
                        </div>
                      )}
                      {fotoUploading && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <div style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                        </div>
                      )}
                    </div>
                    <input ref={fotoRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleFotoSelect} />
                    {!fotoPreview && <span style={{ fontSize: 11, color: '#a3a3a3' }}>Clique ou arraste uma foto</span>}
                    {fotoPreview && (
                      <button type="button" onClick={() => { setFotoFile(null); setFotoPreview(null); if (fotoRef.current) fotoRef.current.value = ''; }}
                        style={{ fontSize: 12, color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                        Remover foto
                      </button>
                    )}
                  </div>

                  <Row>
                    <Field id="nome" label="Nome" value={form.nome} onChange={set('nome')} required autoComplete="given-name" maxLength={100} />
                    <Field id="sobrenome" label="Sobrenome" value={form.sobrenome} onChange={set('sobrenome')} required autoComplete="family-name" maxLength={100} />
                  </Row>
                  <Row>
                    <Field id="cpf" label="CPF" value={form.cpf} onChange={setMasked('cpf', mascaraCpf)} required inputMode="numeric" maxLength={14} />
                    <Field id="telefone" label="Celular / WhatsApp" value={form.telefone} onChange={setMasked('telefone', mascaraTelefone)} required autoComplete="tel" inputMode="tel" maxLength={16} />
                  </Row>
                </div>
              )}

              {/* Step 2: Informações */}
              {currentStep === 1 && (
                <div>
                  <SectionTitle>Informações</SectionTitle>
                  <Row>
                    <Field id="data_nascimento" type="date" label="Data de nascimento" value={form.data_nascimento} onChange={set('data_nascimento')} required />
                    <Field id="email" type="email" label="E-mail" value={form.email} onChange={set('email')} autoComplete="email" maxLength={200} />
                  </Row>
                  <Row>
                    <SelectField id="estado_civil" label="Estado civil" value={form.estado_civil} onChange={set('estado_civil')} options={ESTADO_CIVIL_OPTS} />
                    <Field id="profissao" label="Profissão" value={form.profissao} onChange={set('profissao')} maxLength={120} />
                  </Row>
                  <Field
                    id="como_conheceu"
                    label="Como conheceu a CBRio? (opcional)"
                    value={form.como_conheceu}
                    onChange={set('como_conheceu')}
                    as="textarea"
                    rows={3}
                    maxLength={500}
                  />
                </div>
              )}

              {/* Step 3: Endereço */}
              {currentStep === 2 && (
                <div>
                  <SectionTitle>Endereço</SectionTitle>
                  <Field id="endereco" label="Endereço (rua e número)" value={form.endereco} onChange={set('endereco')} autoComplete="street-address" maxLength={200} />
                  <Row>
                    <Field id="bairro" label="Bairro" value={form.bairro} onChange={set('bairro')} maxLength={80} />
                    <Field id="cidade" label="Cidade" value={form.cidade} onChange={set('cidade')} maxLength={80} />
                  </Row>
                  <Field id="cep" label="CEP" value={form.cep} onChange={set('cep')} autoComplete="postal-code" maxLength={12} />
                </div>
              )}

              {/* Step 4: Termos */}
              {currentStep === 3 && (
                <div>
                  <SectionTitle>Termos e consentimento</SectionTitle>
                  <div style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--cbrio-border)',
                    borderRadius: 12, padding: 16, marginBottom: 8,
                  }}>
                    <p style={{ fontSize: 12, color: '#a3a3a3', lineHeight: 1.6, margin: 0, marginBottom: 12 }}>
                      {TEXTO_CONSENTIMENTO}
                    </p>
                    <CheckboxField
                      id="aceita_termos"
                      checked={aceitaTermos}
                      onChange={setAceitaTermos}
                      label="Li e concordo com o tratamento dos meus dados pessoais. *"
                    />
                    <CheckboxField
                      id="aceita_contato"
                      checked={aceitaContato}
                      onChange={setAceitaContato}
                      label="Autorizo o contato da equipe de acolhimento por e-mail, telefone ou WhatsApp."
                    />
                  </div>
                </div>
              )}
            </MultistepFormShell>

            {/* "Ja fiz meu cadastro e quero meu QR de membro" */}
            <div style={{
              marginTop: 20, padding: '16px 0 0',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              textAlign: 'center',
            }}>
              <button
                type="button"
                onClick={() => setWalletDialogOpen(true)}
                style={{
                  background: 'transparent', border: 'none',
                  color: '#00B39D', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', textDecoration: 'underline',
                  padding: 4,
                }}
              >
                Ja fiz meu cadastro e quero meu QR de membro
              </button>
            </div>
          </>
        )}
      </div>

      <MemberWalletDialog
        open={walletDialogOpen}
        onOpenChange={setWalletDialogOpen}
      />
    </div>
  );
}
