import { useState } from 'react';
import { publicVoluntariado } from '../../api';
import AnimatedBackground from './AnimatedBackground';
import { usePublicTheme, PublicThemeToggle, PublicPaletteCtx, usePublicPalette } from './publicTheme';

// ── Helpers ──
function soDigitos(v: string) { return (v || '').toString().replace(/\D+/g, ''); }

function mascaraCpf(v: string) {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function mascaraTelefone(v: string) {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function cpfValido(v: string) {
  const d = soDigitos(v);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  const calc = (base: string, fator: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i += 1) soma += parseInt(base[i], 10) * (fator - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const dv1 = calc(d.slice(0, 9), 10);
  const dv2 = calc(d.slice(0, 10), 11);
  return dv1 === parseInt(d[9], 10) && dv2 === parseInt(d[10], 10);
}

// ── Catalogos (espelham os valores reais que ja existem em vol_inscricoes) ──
const DONS = [
  'Encorajamento', 'Hospitalidade', 'Ensino', 'Lideranca', 'Ajuda',
  'Generosidade', 'Misericordia', 'Cura', 'Fe', 'Sabedoria',
  'Conhecimento', 'Profecia', 'Discernimento', 'Servico',
  'Administracao', 'Pastoreio', 'Evangelismo', 'Criatividade Artistica',
  'Nao sei ainda',
];

const MINISTERIOS = [
  'Kids',
  'AMI',
  'Bridge',
  'Online',
  'Recepcao - Integracao',
  'Estacionamento - Integracao',
  'Integracao',
  'Check-in do voluntariado',
  'Cozinha do voluntariado',
  'Capelania - Cuidados',
  'Aconselhamento - Cuidados',
  'Producao',
  'Marketing',
  'Logistica',
  'CBA - NEXT',
  'Grupos',
  'Generosidade',
  'Oracao',
  'Onde for mais necessario',
];

// ── Componentes de UI (estilo identico ao InscricaoNext) ──
function Field({
  id, label, type = 'text', value, onChange, required, placeholder, as = 'input', rows, maxLength, autoComplete, inputMode,
}: {
  id: string; label: string; type?: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  required?: boolean; placeholder?: string;
  as?: 'input' | 'textarea'; rows?: number;
  maxLength?: number; autoComplete?: string; inputMode?: any;
}) {
  const [focused, setFocused] = useState(false);
  const C = usePublicPalette();
  // type=date sempre exibe placeholder nativo (dd/mm/aaaa) · label flutua
  // pra nao sobrepor.
  const active = focused || type === 'date' || (value !== undefined && value !== null && String(value).length > 0);
  const Tag: any = as;
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
          color: C.text,
          background: 'transparent',
          border: 'none',
          borderBottom: `2px solid ${focused ? '#00B39D' : C.inputBorder}`,
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
        color: focused ? '#00B39D' : C.text3,
        transition: 'all 0.2s', pointerEvents: 'none',
      }}>
        {label}{required && <span style={{ color: '#ef4444' }}> *</span>}
      </label>
    </div>
  );
}

function SelectField({
  id, label, value, onChange, options, required,
}: {
  id: string; label: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: { value: string; label: string }[]; required?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const C = usePublicPalette();
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
          color: C.text, background: 'transparent', border: 'none',
          borderBottom: `2px solid ${focused ? '#00B39D' : C.inputBorder}`,
          outline: 'none', transition: 'border-color 0.3s',
          appearance: 'none', WebkitAppearance: 'none',
          boxSizing: 'border-box', cursor: 'pointer',
        }}
      >
        <option value=""></option>
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ background: C.optionBg, color: C.text }}>
            {o.label}
          </option>
        ))}
      </select>
      <label htmlFor={id} style={{
        position: 'absolute', left: 0,
        top: active ? -14 : 10,
        fontSize: active ? 11 : 14,
        color: focused ? '#00B39D' : C.text3,
        transition: 'all 0.2s', pointerEvents: 'none',
      }}>
        {label}{required && <span style={{ color: '#ef4444' }}> *</span>}
      </label>
      <span style={{
        position: 'absolute', right: 4, bottom: 12,
        pointerEvents: 'none', color: C.text3, fontSize: 12,
      }}>▾</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  const C = usePublicPalette();
  return (
    <h2 style={{
      fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: 1.2, color: '#00B39D',
      margin: '8px 0 14px', paddingBottom: 6,
      borderBottom: `1px solid ${C.inputBorder}`,
    }}>
      {children}
    </h2>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
      {children}
    </div>
  );
}

function ChipToggle({ checked, onChange, label }: {
  checked: boolean; onChange: () => void; label: string;
}) {
  const C = usePublicPalette();
  return (
    <button
      type="button"
      onClick={onChange}
      style={{
        padding: '8px 12px', fontSize: 12, fontWeight: 600,
        background: checked ? '#00B39D' : 'transparent',
        color: checked ? '#fff' : C.text2,
        border: `1px solid ${checked ? '#00B39D' : C.inputBorder}`,
        borderRadius: 999, cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}

export default function InscricaoVoluntariado() {
  const [form, setForm] = useState({
    nome: '', sobrenome: '', email: '', telefone: '',
    cpf: '', data_nascimento: '', nome_mae: '',
    participou_next: '',
    dom_predominante: '',
    website: '', // honeypot
  });
  const [ministerios, setMinisterios] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const { C } = usePublicTheme();

  const MAX_MINISTERIOS = 3;
  // Areas que exigem dados do menor (LGPD): Kids e Bridge
  const precisaDadosMenor = ministerios.includes('Kids') || ministerios.includes('Bridge');
  // Deriva a area canonica (vol_inscricoes.area) a partir dos ministerios marcados
  const deriveArea = (mins: string[]): string => {
    if (mins.includes('Kids')) return 'kids';
    if (mins.includes('Bridge')) return 'bridge';
    if (mins.includes('AMI')) return 'ami';
    if (mins.includes('Online')) return 'online';
    return 'sede';
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    let v = e.target.value;
    if (k === 'cpf') v = mascaraCpf(v);
    if (k === 'telefone') v = mascaraTelefone(v);
    setForm(f => ({ ...f, [k]: v }));
  };

  const toggleMinisterio = (m: string) => {
    setMinisterios(prev => {
      if (prev.includes(m)) return prev.filter(x => x !== m);
      if (prev.length >= MAX_MINISTERIOS) {
        setError(`Voce pode escolher ate ${MAX_MINISTERIOS} areas.`);
        return prev;
      }
      setError('');
      return [...prev, m];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.nome || form.nome.trim().length < 2) return setError('Informe seu nome');
    if (!form.sobrenome || form.sobrenome.trim().length < 1) return setError('Informe seu sobrenome');
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setError('Email invalido');
    if (!form.telefone || soDigitos(form.telefone).length < 10) return setError('Telefone invalido');
    if (form.cpf && !cpfValido(form.cpf)) return setError('CPF invalido');
    if (ministerios.length === 0) return setError('Escolha ao menos uma area pra servir');
    if (precisaDadosMenor && !form.data_nascimento) return setError('Data de nascimento obrigatoria para Kids/Bridge');
    if (precisaDadosMenor && (!form.nome_mae || form.nome_mae.trim().length < 2)) return setError('Nome da mae obrigatorio para Kids/Bridge');

    setLoading(true);
    try {
      await publicVoluntariado.inscreverForm({
        nome: form.nome.trim(),
        sobrenome: form.sobrenome.trim(),
        email: form.email,
        telefone: form.telefone,
        cpf: form.cpf || null,
        data_nascimento: form.data_nascimento || null,
        nome_mae: form.nome_mae || null,
        area: deriveArea(ministerios),
        participou_next: form.participou_next || null,
        dom_predominante: form.dom_predominante || null,
        ministerios_interesse: ministerios,
        website: form.website,
      });
      setSent(true);
    } catch (err: any) {
      setError(err?.message || 'Erro ao enviar inscricao');
    }
    setLoading(false);
  };

  return (
    <PublicPaletteCtx.Provider value={C}>
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
      padding: '40px 16px', background: C.pageBg,
    }}>
      <AnimatedBackground />
      <PublicThemeToggle />

      <div style={{
        position: 'relative', zIndex: 1, width: '100%', maxWidth: 640,
        background: C.card, backdropFilter: 'blur(24px)',
        border: `1px solid ${C.cardBorder}`, borderRadius: 20,
        padding: '40px 36px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img
            src="/logo-cbrio-icon.png"
            alt="CBRio"
            style={{ width: 72, height: 72, marginBottom: 12, display: 'inline-block' }}
          />
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.5, background: 'linear-gradient(90deg, #00B39D, #00d9bd)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
            Quero ser voluntario
          </h1>
          <p style={{ fontSize: 13, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>
            Sirva com a gente · cada dom encontra um lugar. Conte um pouco sobre voce
            e nossa equipe entra em contato pra te conectar com a area certa.
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
            <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>
              Inscricao recebida!
            </h2>
            <p style={{ fontSize: 13, color: C.text3, marginTop: 10, lineHeight: 1.5 }}>
              Recebemos sua inscricao. Em ate 7 dias nossa equipe entra em contato
              pelo WhatsApp ou email pra falar dos proximos passos. Obrigado por
              querer servir com a gente!
            </p>
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
                value={form.website} onChange={set('website') as any} />
            </div>

            <form onSubmit={handleSubmit}>
              <SectionTitle>Dados pessoais</SectionTitle>
              <Row>
                <Field id="nome" label="Nome" value={form.nome} onChange={set('nome')} required autoComplete="given-name" />
                <Field id="sobrenome" label="Sobrenome" value={form.sobrenome} onChange={set('sobrenome')} required autoComplete="family-name" />
              </Row>
              <Field id="email" label="Email" type="email" value={form.email} onChange={set('email')} required autoComplete="email" inputMode="email" />
              <Row>
                <Field id="telefone" label="Telefone (WhatsApp)" value={form.telefone} onChange={set('telefone')} required placeholder="(00) 00000-0000" inputMode="tel" autoComplete="tel" />
                <Field id="cpf" label="CPF (opcional)" value={form.cpf} onChange={set('cpf')} placeholder="000.000.000-00" inputMode="numeric" autoComplete="off" />
              </Row>
              <Field
                id="data_nascimento"
                label={precisaDadosMenor ? 'Data de nascimento' : 'Data de nascimento (opcional)'}
                type="date"
                value={form.data_nascimento}
                onChange={set('data_nascimento')}
                required={precisaDadosMenor}
                autoComplete="bday"
              />
              {precisaDadosMenor && (
                <Field
                  id="nome_mae"
                  label="Nome da mae"
                  value={form.nome_mae}
                  onChange={set('nome_mae')}
                  required
                />
              )}

              <SectionTitle>Onde voce quer servir</SectionTitle>
              <p style={{ fontSize: 12, color: C.text3, marginTop: -6, marginBottom: 14 }}>
                Marque ate {MAX_MINISTERIOS} areas ({ministerios.length}/{MAX_MINISTERIOS}). Em duvida, marca "Onde for mais necessario".
                {precisaDadosMenor && ' Kids/Bridge pedem data de nascimento e nome da mae acima.'}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                {MINISTERIOS.map(m => {
                  const checked = ministerios.includes(m);
                  const atingiuLimite = !checked && ministerios.length >= MAX_MINISTERIOS;
                  return (
                    <span key={m} style={{ opacity: atingiuLimite ? 0.4 : 1 }}>
                      <ChipToggle label={m} checked={checked} onChange={() => toggleMinisterio(m)} />
                    </span>
                  );
                })}
              </div>

              <SectionTitle>Sua historia com a gente</SectionTitle>
              <SelectField
                id="participou_next"
                label="Voce ja participou do NEXT?"
                value={form.participou_next}
                onChange={set('participou_next') as any}
                options={[
                  { value: 'Sim', label: 'Sim, ja participei' },
                  { value: 'Nao', label: 'Ainda nao' },
                ]}
              />
              <SelectField
                id="dom_predominante"
                label="Qual seu dom predominante? (opcional)"
                value={form.dom_predominante}
                onChange={set('dom_predominante') as any}
                options={DONS.map(d => ({ value: d, label: d }))}
              />

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', padding: '14px 20px',
                  background: loading ? 'rgba(0,179,157,0.5)' : '#00B39D',
                  color: '#fff', border: 'none', borderRadius: 12,
                  fontSize: 15, fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
                  marginTop: 12, transition: 'background 0.2s',
                }}
              >
                {loading ? 'Enviando...' : 'Confirmar inscricao'}
              </button>

              <p style={{
                fontSize: 11, color: C.textDim, textAlign: 'center', marginTop: 16, lineHeight: 1.5,
              }}>
                Ao se inscrever, voce concorda em receber contato da equipe da CBRio sobre
                voluntariado e oportunidades de servir.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
    </PublicPaletteCtx.Provider>
  );
}
