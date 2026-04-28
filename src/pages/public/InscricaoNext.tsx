import { useEffect, useState } from 'react';
import { next as nextApi } from '../../api';
import { LoginShapesBackground } from '../../components/ui/shape-landing-hero';

// ── Helpers de mascara ──
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

// ── Input com label flutuante (mesmo estilo do CadastroMembresia) ──
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
  const active = focused || (value !== undefined && value !== null && String(value).length > 0);
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

function SelectField({
  id, label, value, onChange, options, required,
}: {
  id: string; label: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: { value: string; label: string }[]; required?: boolean;
}) {
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

function SectionTitle({ children }: { children: React.ReactNode }) {
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

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
      {children}
    </div>
  );
}

type Evento = { id: string; data: string; titulo?: string };

export default function InscricaoNext() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [form, setForm] = useState({
    evento_id: '',
    nome: '', sobrenome: '',
    cpf: '', telefone: '', email: '',
    data_nascimento: '',
    observacoes: '',
    website: '', // honeypot
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    nextApi.publicEventos().then((evs: Evento[]) => {
      setEventos(evs || []);
      if (evs && evs[0]) setForm(f => ({ ...f, evento_id: evs[0].id }));
    }).catch(() => {});
  }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    let v = e.target.value;
    if (k === 'cpf') v = mascaraCpf(v);
    if (k === 'telefone') v = mascaraTelefone(v);
    setForm(f => ({ ...f, [k]: v }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.nome || form.nome.trim().length < 2) return setError('Informe seu nome');
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setError('Email invalido');
    if (!form.telefone || soDigitos(form.telefone).length < 10) return setError('Telefone invalido');
    if (form.cpf && !cpfValido(form.cpf)) return setError('CPF invalido');

    setLoading(true);
    try {
      await nextApi.publicInscrever({
        evento_id: form.evento_id || null,
        nome: form.nome.trim(),
        sobrenome: form.sobrenome.trim() || null,
        cpf: form.cpf || null,
        telefone: form.telefone,
        email: form.email,
        data_nascimento: form.data_nascimento || null,
        observacoes: form.observacoes || null,
        website: form.website,
      });
      setSent(true);
    } catch (err: any) {
      setError(err?.message || 'Erro ao enviar inscricao');
    }
    setLoading(false);
  };

  const eventoOptions = eventos.map(ev => ({
    value: ev.id,
    label: new Date(ev.data + 'T12:00:00').toLocaleDateString('pt-BR', {
      weekday: 'long', day: '2-digit', month: 'long',
    }),
  }));

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
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#e5e5e5', margin: 0 }}>Inscricao no NEXT</h1>
          <p style={{ fontSize: 13, color: '#a3a3a3', marginTop: 6, lineHeight: 1.5 }}>
            O NEXT e a porta de entrada da CBRio — onde voce conhece nossa cultura,
            como funciona cada area e descobre os proximos passos.
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
              Inscricao confirmada!
            </h2>
            <p style={{ fontSize: 13, color: '#a3a3a3', marginTop: 10, lineHeight: 1.5 }}>
              Voce esta inscrito(a) no NEXT. Em breve nossa equipe entrara em contato com mais detalhes.
              Nos vemos no domingo!
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
              {eventoOptions.length > 0 && (
                <>
                  <SectionTitle>Evento</SectionTitle>
                  <SelectField
                    id="evento_id"
                    label="Em qual domingo voce vai participar?"
                    value={form.evento_id}
                    onChange={set('evento_id') as any}
                    options={eventoOptions}
                    required
                  />
                </>
              )}

              <SectionTitle>Dados pessoais</SectionTitle>
              <Row>
                <Field id="nome" label="Nome" value={form.nome} onChange={set('nome')} required autoComplete="given-name" />
                <Field id="sobrenome" label="Sobrenome" value={form.sobrenome} onChange={set('sobrenome')} autoComplete="family-name" />
              </Row>
              <Field id="email" label="Email" type="email" value={form.email} onChange={set('email')} required autoComplete="email" inputMode="email" />
              <Row>
                <Field id="telefone" label="Telefone" value={form.telefone} onChange={set('telefone')} required placeholder="(00) 00000-0000" inputMode="tel" autoComplete="tel" />
                <Field id="cpf" label="CPF (opcional)" value={form.cpf} onChange={set('cpf')} placeholder="000.000.000-00" inputMode="numeric" autoComplete="off" />
              </Row>
              <Field id="data_nascimento" label="Data de nascimento (opcional)" type="date" value={form.data_nascimento} onChange={set('data_nascimento')} autoComplete="bday" />

              <SectionTitle>Observacoes</SectionTitle>
              <Field
                id="observacoes"
                label="Quer compartilhar algo com a gente?"
                as="textarea"
                rows={3}
                value={form.observacoes}
                onChange={set('observacoes')}
                placeholder="Como nos conheceu, expectativas, etc."
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
                fontSize: 11, color: '#737373', textAlign: 'center', marginTop: 16, lineHeight: 1.5,
              }}>
                Ao se inscrever, voce concorda em receber contato da equipe da CBRio sobre o NEXT.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
