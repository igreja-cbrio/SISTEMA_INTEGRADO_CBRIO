import { useEffect, useState } from 'react';
import { apresentacaoCriancasPublico } from '../../api';
import AnimatedBackground from './AnimatedBackground';
import { usePublicTheme, PublicThemeToggle } from './publicTheme';

function soDigitos(v: string) { return (v || '').toString().replace(/\D+/g, ''); }

function mascaraCpf(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
}
function cpfValido(cpf: string) {
  const c = cpf.replace(/\D/g, '');
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  let s1 = 0; for (let i = 0; i < 9; i++) s1 += parseInt(c[i]) * (10 - i);
  let d1 = (s1 * 10) % 11; if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(c[9])) return false;
  let s2 = 0; for (let i = 0; i < 10; i++) s2 += parseInt(c[i]) * (11 - i);
  let d2 = (s2 * 10) % 11; if (d2 === 10) d2 = 0;
  return d2 === parseInt(c[10]);
}
function mascaraTelefone(v: string) {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function Field({
  id, label, value, onChange, required, placeholder, as = 'input', rows, autoComplete, inputMode,
}: {
  id: string; label: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  required?: boolean; placeholder?: string;
  as?: 'input' | 'textarea'; rows?: number;
  autoComplete?: string; inputMode?: any;
}) {
  const [focused, setFocused] = useState(false);
  const active = focused || (value !== undefined && value !== null && String(value).length > 0);
  const Tag: any = as;
  return (
    <div style={{ position: 'relative', marginBottom: 20 }}>
      <Tag
        id={id} name={id}
        type={as === 'input' ? 'text' : undefined}
        value={value} rows={rows}
        autoComplete={autoComplete} inputMode={inputMode}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        required={required}
        placeholder={placeholder && !active ? '' : ''}
        style={{
          display: 'block', width: '100%',
          padding: as === 'textarea' ? '14px 0 8px' : '10px 0',
          fontSize: 14, color: 'var(--cbrio-text)',
          background: 'transparent', border: 'none',
          borderBottom: `2px solid ${focused ? '#00B39D' : 'var(--cbrio-border)'}`,
          outline: 'none', transition: 'border-color 0.3s',
          boxSizing: 'border-box', fontFamily: 'inherit',
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

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
      {children}
    </div>
  );
}

const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function formatDataLonga(iso: string) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return `${d.getDate()} de ${MESES_PT[d.getMonth()]} de ${d.getFullYear()}`;
}

export default function ApresentacaoCriancas() {
  const { C } = usePublicTheme();
  const [proximaData, setProximaData] = useState('');
  const [form, setForm] = useState({
    nome_pai: '', nome_mae: '', telefone: '', cpf_responsavel: '',
    website: '', // honeypot
  });
  const [criancas, setCriancas] = useState<{ nome: string; idadeNum: string; idadeUnidade: string }[]>([{ nome: '', idadeNum: '', idadeUnidade: 'meses' }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const setCriancaCampo = (i: number, k: 'nome' | 'idadeNum' | 'idadeUnidade', v: string) => {
    setCriancas(cs => cs.map((c, idx) => (idx === i ? { ...c, [k]: v } : c)));
  };
  const addCrianca = () => setCriancas(cs => [...cs, { nome: '', idadeNum: '', idadeUnidade: 'meses' }]);
  const removeCrianca = (i: number) => setCriancas(cs => (cs.length > 1 ? cs.filter((_, idx) => idx !== i) : cs));

  useEffect(() => {
    apresentacaoCriancasPublico.proximaData()
      .then((r: { data_apresentacao: string }) => setProximaData(r.data_apresentacao))
      .catch(() => {});
  }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    let v = e.target.value;
    if (k === 'telefone') v = mascaraTelefone(v);
    if (k === 'cpf_responsavel') v = mascaraCpf(v);
    setForm(f => ({ ...f, [k]: v }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.website) return; // honeypot
    if (!form.nome_pai.trim() && !form.nome_mae.trim()) return setError('Informe o nome do pai ou da mãe.');
    const criancasValidas = criancas
      .map(c => ({ nome: c.nome.trim(), idade: c.idadeNum.trim() ? `${c.idadeNum.trim()} ${c.idadeUnidade}` : null }))
      .filter(c => c.nome.length >= 2);
    if (!criancasValidas.length) return setError('Informe o nome completo de ao menos uma criança.');
    if (soDigitos(form.telefone).length < 10) return setError('Telefone inválido.');
    if (!cpfValido(form.cpf_responsavel)) return setError('Informe um CPF válido do responsável.');

    setLoading(true);
    try {
      await apresentacaoCriancasPublico.inscrever({
        nome_pai: form.nome_pai.trim() || null,
        nome_mae: form.nome_mae.trim() || null,
        criancas: criancasValidas,
        telefone: form.telefone,
        cpf_responsavel: form.cpf_responsavel,
      });
      setSent(true);
    } catch (err: any) {
      setError(err?.message || 'Erro ao enviar inscrição.');
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
      padding: '40px 16px', background: C.pageBg,
    }}>
      <AnimatedBackground />
      <PublicThemeToggle />

      <div style={{
        position: 'relative', zIndex: 1, width: '100%', maxWidth: 560,
        background: C.card, backdropFilter: 'blur(24px)',
        border: `1px solid ${C.cardBorder}`, borderRadius: 20,
        padding: 'clamp(28px, 6vw, 40px) clamp(18px, 5vw, 36px)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/logo-cbrio-icon.png" alt="CBRio"
            style={{ width: 72, height: 72, marginBottom: 12, display: 'inline-block' }} />
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.5, background: 'linear-gradient(90deg, #00B39D, #00d9bd)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
            Apresentação de Crianças
          </h1>
          <p style={{ fontSize: 13, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>
            Que bom que você decidiu apresentar seu(sua) filho(a) na CBRio! Preencha abaixo —
            entraremos em contato para agendar o horário.
          </p>
          {proximaData && (
            <div style={{
              display: 'inline-block', marginTop: 14,
              padding: '8px 16px', borderRadius: 12,
              background: 'rgba(0,179,157,0.12)',
              border: '1px solid rgba(0,179,157,0.3)',
              color: '#00B39D', fontSize: 13, fontWeight: 600,
            }}>
              Próxima apresentação: {formatDataLonga(proximaData)}
            </div>
          )}
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
              Inscrição enviada!
            </h2>
            <p style={{ fontSize: 13, color: C.text3, marginTop: 10, lineHeight: 1.5 }}>
              {proximaData && <>A próxima apresentação é em <strong>{formatDataLonga(proximaData)}</strong>. </>}
              Nossa equipe do Kids vai entrar em contato pelo telefone informado para agendar o horário.
            </p>
          </div>
        ) : (
          <>
            {error && (
              <div style={{
                background: '#ef444418', border: '1px solid #ef444440', borderRadius: 10,
                padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#ef4444',
              }}>{error}</div>
            )}

            {/* Honeypot */}
            <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
              <label htmlFor="website">Website</label>
              <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off"
                value={form.website} onChange={set('website') as any} />
            </div>

            <form onSubmit={handleSubmit}>
              <Row>
                <Field id="nome_pai" label="Nome completo do pai" value={form.nome_pai} onChange={set('nome_pai')} autoComplete="name" />
                <Field id="nome_mae" label="Nome completo da mãe" value={form.nome_mae} onChange={set('nome_mae')} autoComplete="name" />
              </Row>

              <div style={{ marginBottom: 8, marginTop: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, color: '#00B39D' }}>
                Crianças
              </div>
              {criancas.map((c, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 64px 92px auto', gap: 10, alignItems: 'end' }}>
                  <Field id={`crianca_nome_${i}`} label={`Nome completo da criança ${criancas.length > 1 ? i + 1 : ''}`.trim()} value={c.nome} onChange={(e) => setCriancaCampo(i, 'nome', e.target.value)} required={i === 0} />
                  <Field id={`crianca_idade_${i}`} label="Idade" value={c.idadeNum} onChange={(e) => setCriancaCampo(i, 'idadeNum', e.target.value)} inputMode="numeric" />
                  <div style={{ position: 'relative', marginBottom: 20 }}>
                    <label htmlFor={`crianca_unidade_${i}`} style={{ position: 'absolute', left: 0, top: -14, fontSize: 11, color: 'var(--cbrio-text3)' }}>Unidade</label>
                    <select
                      id={`crianca_unidade_${i}`}
                      value={c.idadeUnidade}
                      onChange={(e) => setCriancaCampo(i, 'idadeUnidade', e.target.value)}
                      style={{ display: 'block', width: '100%', padding: '10px 0', fontSize: 14, color: 'var(--cbrio-text)', background: 'transparent', border: 'none', borderBottom: '2px solid var(--cbrio-border)', outline: 'none', appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' }}
                    >
                      <option value="dias" style={{ background: C.optionBg, color: C.text }}>dias</option>
                      <option value="meses" style={{ background: C.optionBg, color: C.text }}>meses</option>
                      <option value="anos" style={{ background: C.optionBg, color: C.text }}>anos</option>
                    </select>
                  </div>
                  {criancas.length > 1 ? (
                    <button type="button" onClick={() => removeCrianca(i)} title="Remover criança"
                      style={{ marginBottom: 22, background: 'transparent', border: 'none', color: '#ef4444', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
                  ) : <span />}
                </div>
              ))}
              <button type="button" onClick={addCrianca}
                style={{ marginBottom: 20, marginTop: -4, background: 'transparent', border: 'none', color: '#00B39D', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                + Adicionar outra criança
              </button>

              <Field id="telefone" label="Telefone para contato" value={form.telefone} onChange={set('telefone')} required placeholder="(00) 00000-0000" inputMode="tel" autoComplete="tel" />
              <Field id="cpf_responsavel" label="CPF do responsável" value={form.cpf_responsavel} onChange={set('cpf_responsavel')} required placeholder="000.000.000-00" inputMode="numeric" />

              <button type="submit" disabled={loading} style={{
                width: '100%', marginTop: 8, padding: '13px', borderRadius: 12,
                background: loading ? '#00B39D80' : 'linear-gradient(90deg, #00B39D, #00d9bd)',
                color: '#fff', fontSize: 15, fontWeight: 700, border: 'none',
                cursor: loading ? 'default' : 'pointer', transition: 'opacity 0.2s',
              }}>
                {loading ? 'Enviando...' : 'Enviar inscrição'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
