import { useEffect, useState } from 'react';
import { batismoPublico } from '../../api';
import AnimatedBackground from './AnimatedBackground';
import { usePublicTheme, PublicThemeToggle } from './publicTheme';
import { BirthDatePicker } from '../../components/ui/birth-date-picker';

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

function mascaraCep(v: string) {
  const d = soDigitos(v).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
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
  return calc(d.slice(0, 9), 10) === parseInt(d[9], 10)
    && calc(d.slice(0, 10), 11) === parseInt(d[10], 10);
}

function Field({
  id, label, type = 'text', value, onChange, required, placeholder, as = 'input', rows, autoComplete, inputMode,
}: {
  id: string; label: string; type?: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  required?: boolean; placeholder?: string;
  as?: 'input' | 'textarea'; rows?: number;
  autoComplete?: string; inputMode?: any;
}) {
  const [focused, setFocused] = useState(false);
  const active = focused || type === 'date' || (value !== undefined && value !== null && String(value).length > 0);
  const Tag: any = as;
  return (
    <div style={{ position: 'relative', marginBottom: 20, marginTop: type === 'date' ? 16 : 0 }}>
      <Tag
        id={id} name={id}
        type={as === 'input' ? type : undefined}
        value={value} rows={rows}
        autoComplete={autoComplete} inputMode={inputMode}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        required={required}
        placeholder={placeholder && !active ? '' : ''}
        style={{
          display: 'block', width: '100%',
          padding: as === 'textarea' ? '14px 0 8px' : '12px 0',
          fontSize: 16, color: 'var(--cbrio-text)',
          background: 'transparent', border: 'none',
          borderBottom: `2px solid ${focused ? '#00B39D' : 'var(--cbrio-border)'}`,
          outline: 'none', transition: 'border-color 0.3s',
          boxSizing: 'border-box', fontFamily: 'inherit',
          resize: as === 'textarea' ? 'vertical' : undefined,
        }}
      />
      <label htmlFor={id} style={{
        position: 'absolute', left: 0,
        top: active ? -14 : 12,
        fontSize: active ? 11 : 16,
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
  const { C } = usePublicTheme();
  const [focused, setFocused] = useState(false);
  const active = focused || (value !== undefined && value !== null && String(value).length > 0);
  return (
    <div style={{ position: 'relative', marginBottom: 20 }}>
      <select
        id={id} name={id} value={value || ''} onChange={onChange}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} required={required}
        style={{
          display: 'block', width: '100%', padding: '12px 20px 12px 0', fontSize: 16,
          color: 'var(--cbrio-text)', background: 'transparent', border: 'none',
          borderBottom: `2px solid ${focused ? '#00B39D' : 'var(--cbrio-border)'}`,
          outline: 'none', transition: 'border-color 0.3s',
          appearance: 'none', WebkitAppearance: 'none', boxSizing: 'border-box', cursor: 'pointer',
        }}
      >
        <option value=""></option>
        {options.map(o => (
          <option key={o.value} value={o.value} style={{ background: C.optionBg, color: C.text }}>
            {o.label}
          </option>
        ))}
      </select>
      <label htmlFor={id} style={{
        position: 'absolute', left: 0,
        top: active ? -14 : 12,
        fontSize: active ? 11 : 16,
        color: focused ? '#00B39D' : 'var(--cbrio-text3)',
        transition: 'all 0.2s', pointerEvents: 'none',
      }}>
        {label}{required && <span style={{ color: '#ef4444' }}> *</span>}
      </label>
      <span style={{ position: 'absolute', right: 4, bottom: 14, pointerEvents: 'none', color: 'var(--cbrio-text3)', fontSize: 12 }}>▾</span>
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

const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function formatDataLonga(iso: string) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return `${d.getDate()} de ${MESES_PT[d.getMonth()]} de ${d.getFullYear()}`;
}

export default function InscricaoBatismo() {
  const { C } = usePublicTheme();
  const [proximaData, setProximaData] = useState<string>('');
  const [horarios, setHorarios] = useState<{ horario: string; label: string; vagas_restantes: number | null }[]>([]);
  const [form, setForm] = useState({
    nome: '', sobrenome: '',
    cpf: '', telefone: '', email: '',
    data_nascimento: '',
    endereco: '', cep: '',
    tamanho_camisa: '',
    fez_next: '', // '' não informado | 'sim' | 'nao'
    limitacao_mobilidade: '',
    motivo: '',
    observacoes: '',
    horario_culto: '',
    area_kpi: '', // opcional · 'sede' (default) | 'ami' | 'bridge' | 'online'
    website: '', // honeypot
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [grupoUrl, setGrupoUrl] = useState<string | null>(null);
  const [whatsappOptin, setWhatsappOptin] = useState(false);

  useEffect(() => {
    batismoPublico.horarios()
      .then((r: { data_batismo: string; horarios: typeof horarios }) => {
        setProximaData(r.data_batismo);
        const hs = Array.isArray(r.horarios) ? r.horarios : [];
        setHorarios(hs);
        // pré-seleciona o 1º horário aberto (se a pessoa ainda não escolheu)
        if (hs.length) setForm(f => (f.horario_culto ? f : { ...f, horario_culto: hs[0].horario }));
      })
      .catch(() => {
        batismoPublico.proximaData()
          .then((r: { data_batismo: string }) => setProximaData(r.data_batismo))
          .catch(() => {});
      });
  }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    let v = e.target.value;
    if (k === 'cpf') v = mascaraCpf(v);
    if (k === 'telefone') v = mascaraTelefone(v);
    if (k === 'cep') v = mascaraCep(v);
    setForm(f => ({ ...f, [k]: v }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.website) return; // honeypot
    if (!form.nome || form.nome.trim().length < 2) return setError('Informe seu nome.');
    if (!form.sobrenome.trim()) return setError('Informe seu sobrenome.');
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setError('E-mail inválido.');
    if (!form.telefone || soDigitos(form.telefone).length < 10) return setError('Telefone inválido.');
    if (!form.cpf || !cpfValido(form.cpf)) return setError('Informe um CPF válido.');

    setLoading(true);
    try {
      const resp: any = await batismoPublico.inscrever({
        nome: form.nome.trim(),
        sobrenome: form.sobrenome.trim(),
        cpf: form.cpf || null,
        telefone: form.telefone,
        email: form.email,
        data_nascimento: form.data_nascimento || null,
        endereco: form.endereco || null,
        cep: form.cep || null,
        tamanho_camisa: form.tamanho_camisa || null,
        fez_next: form.fez_next === 'sim' ? true : form.fez_next === 'nao' ? false : null,
        limitacao_mobilidade: form.limitacao_mobilidade || null,
        motivo: form.motivo || null,
        observacoes: form.observacoes || null,
        horario_culto: form.horario_culto || null,
        area_kpi: form.area_kpi || null,
        whatsapp_optin: whatsappOptin,
      });
      setGrupoUrl(resp?.grupo_url || null);
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
        position: 'relative', zIndex: 1, width: '100%', maxWidth: 640,
        background: C.card, backdropFilter: 'blur(24px)',
        border: `1px solid ${C.cardBorder}`, borderRadius: 20,
        padding: 'clamp(28px, 6vw, 40px) clamp(18px, 5vw, 36px)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/logo-cbrio-icon.png" alt="CBRio"
            style={{ width: 72, height: 72, marginBottom: 12, display: 'inline-block' }} />
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.5, background: 'linear-gradient(90deg, #00B39D, #00d9bd)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
            Inscrição para batismo
          </h1>
          <p style={{ fontSize: 13, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>
            "Aquele que crer e for batizado será salvo." — Marcos 16:16
          </p>
          {proximaData && (
            <div style={{
              display: 'inline-block', marginTop: 14,
              padding: '8px 16px', borderRadius: 12,
              background: 'rgba(0,179,157,0.12)',
              border: '1px solid rgba(0,179,157,0.3)',
              color: '#00B39D', fontSize: 13, fontWeight: 600,
            }}>
              Próximo batismo: {formatDataLonga(proximaData)}
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
              Inscrição confirmada!
            </h2>
            <p style={{ fontSize: 13, color: C.text3, marginTop: 10, lineHeight: 1.5 }}>
              Você está inscrito(a) para o batismo de <strong>{formatDataLonga(proximaData)}</strong>.
              Em breve nossa equipe de Integração entrará em contato com mais detalhes.
            </p>
            {grupoUrl && (
              <a
                href={grupoUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 18,
                  background: '#25D366', color: '#fff', fontWeight: 700, fontSize: 14,
                  padding: '12px 22px', borderRadius: 10, textDecoration: 'none',
                }}
              >
                💬 Entrar no grupo do batismo
              </a>
            )}
            <p style={{ fontSize: 12, color: C.textDim, marginTop: 16 }}>
              {grupoUrl ? 'Entre no grupo pra receber os próximos passos e avisos.' : 'Deus te abençoe nessa nova etapa.'}
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
              <SectionTitle>Dados pessoais</SectionTitle>
              <Row>
                <Field id="nome" label="Nome" value={form.nome} onChange={set('nome')} required autoComplete="given-name" />
                <Field id="sobrenome" label="Sobrenome" value={form.sobrenome} onChange={set('sobrenome')} required autoComplete="family-name" />
              </Row>
              <Field id="email" label="E-mail" type="email" value={form.email} onChange={set('email')} required autoComplete="email" inputMode="email" />
              <Row>
                <Field id="telefone" label="Telefone" value={form.telefone} onChange={set('telefone')} required placeholder="(00) 00000-0000" inputMode="tel" autoComplete="tel" />
                <Field id="cpf" label="CPF" value={form.cpf} onChange={set('cpf')} placeholder="000.000.000-00" inputMode="numeric" autoComplete="off" required />
              </Row>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--cbrio-text3)', marginBottom: 6 }}>Data de nascimento (opcional)</label>
                <BirthDatePicker value={form.data_nascimento} onChange={(v) => setForm(f => ({ ...f, data_nascimento: v }))} />
              </div>

              <SectionTitle>Endereço</SectionTitle>
              <Row>
                <Field id="cep" label="CEP" value={form.cep} onChange={set('cep')} placeholder="00000-000" inputMode="numeric" autoComplete="postal-code" />
                <Field id="endereco" label="Endereço" value={form.endereco} onChange={set('endereco')} autoComplete="street-address" />
              </Row>

              <SectionTitle>Sobre o batismo</SectionTitle>
              <Row>
                <SelectField
                  id="tamanho_camisa" label="Tamanho da camisa"
                  value={form.tamanho_camisa}
                  onChange={set('tamanho_camisa') as any}
                  options={[
                    { value: 'PP', label: 'PP' },
                    { value: 'P', label: 'P' },
                    { value: 'M', label: 'M' },
                    { value: 'G', label: 'G' },
                    { value: 'GG', label: 'GG' },
                    { value: 'XGG', label: 'XGG' },
                  ]}
                />
              </Row>

              {/* Horário do batismo · opções (só os disponíveis · lotados já
                  não vêm do backend). Antes era lista suspensa (Matheus · 16/07). */}
              <div style={{ marginBottom: 20, marginTop: 4 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--cbrio-text3)', marginBottom: 8 }}>
                  Horário do batismo
                </label>
                {horarios.length ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                    {horarios.map(h => {
                      const on = form.horario_culto === h.horario;
                      return (
                        <button
                          key={h.horario}
                          type="button"
                          onClick={() => setForm(f => ({ ...f, horario_culto: h.horario }))}
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                            minHeight: 56, padding: '11px 14px', borderRadius: 12, cursor: 'pointer',
                            textAlign: 'left',
                            border: `1.5px solid ${on ? '#00B39D' : C.inputBorder}`,
                            background: on ? 'rgba(0,179,157,0.12)' : (C.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
                            color: on ? '#00B39D' : 'var(--cbrio-text)',
                            fontFamily: 'inherit', transition: 'border-color 0.15s, background 0.15s',
                          }}
                        >
                          <span style={{ fontSize: 15, fontWeight: on ? 700 : 600 }}>{h.label}</span>
                          {h.vagas_restantes != null && (
                            <span style={{ fontSize: 11.5, color: on ? '#00B39D' : 'var(--cbrio-text3)', opacity: on ? 0.9 : 1 }}>
                              {h.vagas_restantes} vaga{h.vagas_restantes === 1 ? '' : 's'} restante{h.vagas_restantes === 1 ? '' : 's'}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: 'var(--cbrio-text3)', margin: '4px 0 0' }}>
                    Nenhum horário disponível no momento.
                  </p>
                )}
              </div>
              <SelectField
                id="area_kpi" label="Você frequenta qual público? (opcional)"
                value={form.area_kpi}
                onChange={set('area_kpi') as any}
                options={[
                  { value: '', label: 'Adultos' },
                  { value: 'ami', label: 'AMI' },
                  { value: 'bridge', label: 'Bridge' },
                  { value: 'online', label: 'Online' },
                ]}
              />
              <SelectField
                id="fez_next" label="Você já fez o NEXT?"
                value={form.fez_next}
                onChange={set('fez_next') as any}
                options={[
                  { value: '', label: 'Selecione' },
                  { value: 'sim', label: 'Sim' },
                  { value: 'nao', label: 'Não' },
                ]}
              />
              <SelectField
                id="limitacao_mobilidade"
                label="Possui alguma limitação de mobilidade?"
                value={form.limitacao_mobilidade}
                onChange={set('limitacao_mobilidade') as any}
                options={[
                  { value: 'Não', label: 'Não' },
                  { value: 'Sim', label: 'Sim' },
                ]}
              />
              <Field
                id="motivo"
                label="Quero ser batizado(a) na CBRio porque..."
                as="textarea" rows={3}
                value={form.motivo}
                onChange={set('motivo')}
              />
              <Field
                id="observacoes"
                label="Comentário adicional (familiares se batizando junto, etc)"
                as="textarea" rows={2}
                value={form.observacoes}
                onChange={set('observacoes')}
              />

              <label style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                background: C.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                border: `1px solid ${C.inputBorder}`,
                borderRadius: 12, padding: '14px 16px', margin: '4px 0 16px', cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={whatsappOptin}
                  onChange={(e) => setWhatsappOptin(e.target.checked)}
                  style={{ marginTop: 3, width: 18, height: 18, accentColor: '#00B39D', flexShrink: 0 }}
                />
                <span style={{ fontSize: 12.5, color: C.text3, lineHeight: 1.55 }}>
                  Aceito receber mensagens da CBRio no <strong>WhatsApp</strong> (lembretes do
                  batismo, avisos e felicitações). Você pode cancelar quando quiser. Seus dados
                  são tratados conforme a LGPD.
                </span>
              </label>

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
                {loading ? 'Enviando...' : 'Confirmar inscrição'}
              </button>

              <p style={{
                fontSize: 11, color: C.textDim, textAlign: 'center', marginTop: 16, lineHeight: 1.5,
              }}>
                A equipe da Integração entrará em contato em breve com mais detalhes.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
