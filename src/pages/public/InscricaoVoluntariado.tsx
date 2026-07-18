import { useState, useEffect } from 'react';
import { publicVoluntariado } from '../../api';
import AnimatedBackground from './AnimatedBackground';
import { usePublicTheme, PublicThemeToggle, PublicPaletteCtx, usePublicPalette } from './publicTheme';
import { BirthDatePicker } from '../../components/ui/birth-date-picker';

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

// ── Catalogos (espelham os valores reais que já existem em vol_inscricoes) ──
const DONS = [
  'Encorajamento', 'Hospitalidade', 'Ensino', 'Liderança', 'Ajuda',
  'Generosidade', 'Misericórdia', 'Cura', 'Fé', 'Sabedoria',
  'Conhecimento', 'Profecia', 'Discernimento', 'Serviço',
  'Administração', 'Pastoreio', 'Evangelismo', 'Criatividade Artística',
  'Não sei ainda',
];

interface OpcaoServir {
  label: string;
  area_canonica: string;
  exige_dados_menor: boolean;
  aviso_titulo?: string | null;
  aviso_texto?: string | null;
}

// Fallback usado se o endpoint não responder (ex: migration ainda não aplicada).
// As opções "de verdade" vem de GET /public/voluntariado/form-opcoes e são
// gerenciadas em /ministerial/voluntariado/admin (ativar/desativar/adicionar).
const OPCOES_FALLBACK: OpcaoServir[] = [
  { label: 'Kids', area_canonica: 'kids', exige_dados_menor: true,
    aviso_titulo: 'Para servir no CBKids, precisamos de algumas informações específicas',
    aviso_texto: 'Prezamos pelo bem-estar e segurança das nossas crianças, e para garantir que estamos proporcionando um ambiente seguro e confiável, realizamos a verificação de antecedentes criminais de todos os envolvidos. Assim, reforçamos nosso compromisso com a proteção e o cuidado contínuo de nossos pequenos.' },
  { label: 'AMI', area_canonica: 'ami', exige_dados_menor: false },
  { label: 'Bridge', area_canonica: 'bridge', exige_dados_menor: true,
    aviso_titulo: 'Para servir no Bridge, precisamos de algumas informações específicas',
    aviso_texto: 'Prezamos pelo bem-estar e segurança dos nossos adolescentes, e para garantir que estamos proporcionando um ambiente seguro e confiável, realizamos a verificação de antecedentes criminais de todos os envolvidos. Assim, reforçamos nosso compromisso com a proteção e o cuidado contínuo dos nossos jovens.' },
  { label: 'Online', area_canonica: 'online', exige_dados_menor: false },
  { label: 'Recepção - Integração', area_canonica: 'sede', exige_dados_menor: false },
  { label: 'Estacionamento - Integração', area_canonica: 'sede', exige_dados_menor: false },
  { label: 'Intercessão - Integração', area_canonica: 'sede', exige_dados_menor: false },
  { label: 'Check-in do voluntariado', area_canonica: 'sede', exige_dados_menor: false },
  { label: 'Cozinha do voluntariado', area_canonica: 'sede', exige_dados_menor: false },
  { label: 'Cuidados', area_canonica: 'sede', exige_dados_menor: false },
  { label: 'Louvor', area_canonica: 'sede', exige_dados_menor: false },
  { label: 'Produção', area_canonica: 'sede', exige_dados_menor: false },
  { label: 'Marketing - Fotografia', area_canonica: 'sede', exige_dados_menor: false },
  { label: 'Marketing - Vídeo', area_canonica: 'sede', exige_dados_menor: false },
  { label: 'Next', area_canonica: 'sede', exige_dados_menor: false },
  { label: 'Grupos', area_canonica: 'sede', exige_dados_menor: false },
  { label: 'Onde for mais necessário', area_canonica: 'sede', exige_dados_menor: false },
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
  // pra não sobrepor.
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
          fontSize: 16,
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
        fontSize: active ? 11 : 16,
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
          display: 'block', width: '100%', padding: '10px 0', fontSize: 16,
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
        fontSize: active ? 11 : 16,
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
        padding: '10px 14px', minHeight: 40, fontSize: 12, fontWeight: 600,
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

// Nome completo sem abreviação: rejeita partes com ponto ("J.") ou de 1 letra
// (conectivos "de/da/do/das/dos/e" são permitidos).
const CONECTIVOS_NOME = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
function temAbreviacaoNome(s: string) {
  return String(s || '').trim().split(/\s+/).some(p => {
    const limpo = p.replace(/\./g, '');
    if (CONECTIVOS_NOME.has(limpo.toLowerCase())) return false;
    return p.includes('.') || limpo.length === 1;
  });
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
  const [opcoes, setOpcoes] = useState<OpcaoServir[]>(OPCOES_FALLBACK);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  // Consentimento LGPD pra consulta de antecedentes (obrigatório Kids/Bridge).
  const [consentAntecedentes, setConsentAntecedentes] = useState(false);
  const [whatsappOptin, setWhatsappOptin] = useState(false);
  const { C } = usePublicTheme();

  // Opções vem do banco (gerenciadas no módulo de voluntariado). Fallback fica
  // valendo se o endpoint não responder.
  useEffect(() => {
    publicVoluntariado.formOpcoes()
      .then((data: any[]) => {
        if (Array.isArray(data) && data.length) {
          setOpcoes(data.map(o => ({
            label: o.label,
            area_canonica: o.area_canonica || 'sede',
            exige_dados_menor: !!o.exige_dados_menor,
            aviso_titulo: o.aviso_titulo,
            aviso_texto: o.aviso_texto,
          })));
        }
      })
      .catch(() => { /* mantem fallback */ });
  }, []);

  const MAX_MINISTERIOS = 3;
  const selecionadas = opcoes.filter(o => ministerios.includes(o.label));
  // Opções que exigem dados do menor (LGPD · CPF + nome da mae): Kids/Bridge.
  const precisaDadosMenor = selecionadas.some(o => o.exige_dados_menor);
  // Deriva a área canonica (vol_inscricoes.area) a partir das opções marcadas.
  const deriveArea = (mins: string[]): string => {
    const areas = opcoes.filter(o => mins.includes(o.label)).map(o => o.area_canonica);
    for (const a of ['kids', 'bridge', 'ami', 'online']) {
      if (areas.includes(a)) return a;
    }
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
        setError(`Você pode escolher até ${MAX_MINISTERIOS} áreas.`);
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
    if (!form.sobrenome || form.sobrenome.trim().length < 2) return setError('Informe seu sobrenome completo');
    if (temAbreviacaoNome(form.nome) || temAbreviacaoNome(form.sobrenome)) {
      return setError('Escreva seu nome completo, sem abreviações (ex.: "Maria da Silva Santos", não "Maria S.")');
    }
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setError('E-mail inválido');
    if (!form.telefone || soDigitos(form.telefone).length < 10) return setError('Telefone inválido');
    if (!form.cpf) return setError('Informe seu CPF');
    if (!cpfValido(form.cpf)) return setError('CPF inválido');
    if (!form.data_nascimento) return setError('Informe sua data de nascimento');
    if (ministerios.length === 0) return setError('Escolha ao menos uma área pra servir');
    if (!form.participou_next) return setError('Conta pra gente se você já participou do NEXT');
    if (precisaDadosMenor && (!form.nome_mae || form.nome_mae.trim().length < 2)) return setError('Nome da mãe obrigatório para Kids/Bridge');
    if (precisaDadosMenor && !consentAntecedentes) return setError('Autorize a consulta de antecedentes criminais para servir no Kids/Bridge');

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
        consentimento_antecedentes: precisaDadosMenor ? consentAntecedentes : false,
        whatsapp_optin: whatsappOptin,
        website: form.website,
      });
      setSent(true);
    } catch (err: any) {
      setError(err?.message || 'Erro ao enviar inscrição');
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
        padding: 'clamp(28px, 6vw, 40px) clamp(18px, 5vw, 36px)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img
            src="/logo-cbrio-icon.png"
            alt="CBRio"
            style={{ width: 72, height: 72, marginBottom: 12, display: 'inline-block' }}
          />
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.5, background: 'linear-gradient(90deg, #00B39D, #00d9bd)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
            Quero ser voluntário
          </h1>
          <p style={{ fontSize: 13, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>
            Sirva com a gente · cada dom encontra um lugar. Conte um pouco sobre você
            e nossa equipe entra em contato pra te conectar com a área certa.
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
              Inscrição recebida!
            </h2>
            <p style={{ fontSize: 13, color: C.text3, marginTop: 10, lineHeight: 1.5 }}>
              Recebemos sua inscrição. Em até 7 dias nossa equipe entra em contato
              pelo WhatsApp ou e-mail pra falar dos próximos passos. Obrigado por
              querer servir com a gente!
            </p>

            <div style={{
              marginTop: 24, padding: '24px 22px', textAlign: 'center',
              background: 'linear-gradient(160deg, #0e7c8e, #0a5f70)',
              borderRadius: 16, color: '#fff',
            }}>
              <h3 style={{
                fontSize: 15, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase',
                margin: '0 0 14px', color: '#fff',
              }}>
                Servir em Comunidade
              </h3>
              <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0, color: 'rgba(255,255,255,0.95)' }}>
                "Porém vocês, irmãos, foram chamados para serem livres. Mas não deixem que essa
                liberdade se torne uma desculpa para permitir que a natureza humana domine vocês.
                Pelo contrário, que o amor faça com que vocês sirvam uns aos outros. Pois a lei
                inteira se resume em um mandamento só: 'Ame os outros como você ama a você mesmo'."
              </p>
              <p style={{ fontSize: 13, fontWeight: 700, marginTop: 12, marginBottom: 0, color: '#fff' }}>
                Gálatas 5:13-14
              </p>
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
                value={form.website} onChange={set('website') as any} />
            </div>

            <form onSubmit={handleSubmit}>
              <SectionTitle>Dados pessoais</SectionTitle>
              <Row>
                <Field id="nome" label="Nome (sem abreviar)" value={form.nome} onChange={set('nome')} required autoComplete="given-name" />
                <Field id="sobrenome" label="Sobrenome completo (sem abreviar)" value={form.sobrenome} onChange={set('sobrenome')} required autoComplete="family-name" />
              </Row>
              <Field id="email" label="E-mail" type="email" value={form.email} onChange={set('email')} required autoComplete="email" inputMode="email" />
              <Row>
                <Field id="telefone" label="Telefone (WhatsApp)" value={form.telefone} onChange={set('telefone')} required placeholder="(00) 00000-0000" inputMode="tel" autoComplete="tel" />
                <Field id="cpf" label="CPF" value={form.cpf} onChange={set('cpf')} required placeholder="000.000.000-00" inputMode="numeric" autoComplete="off" />
              </Row>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--cbrio-text3)', marginBottom: 6 }}>
                  Data de nascimento <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <BirthDatePicker value={form.data_nascimento} onChange={(v) => setForm(f => ({ ...f, data_nascimento: v }))} />
              </div>

              <SectionTitle>Onde você quer servir</SectionTitle>
              <p style={{ fontSize: 12, color: C.text3, marginTop: -6, marginBottom: 14 }}>
                Marque até {MAX_MINISTERIOS} áreas ({ministerios.length}/{MAX_MINISTERIOS}). Em dúvida, marque "Onde for mais necessário".
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                {opcoes.map(o => {
                  const m = o.label;
                  const checked = ministerios.includes(m);
                  const atingiuLimite = !checked && ministerios.length >= MAX_MINISTERIOS;
                  return (
                    <span key={m} style={{ opacity: atingiuLimite ? 0.4 : 1 }}>
                      <ChipToggle label={m} checked={checked} onChange={() => toggleMinisterio(m)} />
                    </span>
                  );
                })}
              </div>

              {selecionadas.filter(o => o.aviso_titulo).map((o, i) => (
                <div key={i} style={{
                  background: '#00B39D14', border: '1px solid #00B39D40',
                  borderRadius: 12, padding: '14px 16px', marginBottom: 16,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 6 }}>
                    {o.aviso_titulo}
                  </div>
                  {o.aviso_texto && (
                    <p style={{ fontSize: 12.5, color: C.text3, lineHeight: 1.55, margin: 0 }}>
                      {o.aviso_texto}
                    </p>
                  )}
                </div>
              ))}
              {precisaDadosMenor && (
                <Field
                  id="nome_mae"
                  label="Nome da mãe"
                  value={form.nome_mae}
                  onChange={set('nome_mae')}
                  required
                />
              )}
              {precisaDadosMenor && (
                <label style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                  background: '#00B39D14', border: '1px solid #00B39D40',
                  borderRadius: 12, padding: '14px 16px', marginBottom: 16, cursor: 'pointer',
                }}>
                  <input
                    type="checkbox"
                    checked={consentAntecedentes}
                    onChange={(e) => setConsentAntecedentes(e.target.checked)}
                    style={{ marginTop: 3, width: 18, height: 18, accentColor: '#00B39D', flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 12.5, color: C.text3, lineHeight: 1.55 }}>
                    Autorizo a CBRio a consultar meus <strong>antecedentes criminais</strong> para fins
                    de triagem de voluntariado no ministério infantil/adolescentes. Entendo que é uma
                    medida de proteção das crianças e adolescentes e que meus dados serão tratados de
                    forma confidencial, conforme a LGPD.
                  </span>
                </label>
              )}

              <SectionTitle>Sua história com a gente</SectionTitle>
              <SelectField
                id="participou_next"
                label="Você já participou do NEXT?"
                value={form.participou_next}
                onChange={set('participou_next') as any}
                required
                options={[
                  { value: 'Sim', label: 'Sim, já participei' },
                  { value: 'Nao', label: 'Ainda não' },
                ]}
              />
              <SelectField
                id="dom_predominante"
                label="Qual seu dom predominante? (opcional)"
                value={form.dom_predominante}
                onChange={set('dom_predominante') as any}
                options={DONS.map(d => ({ value: d, label: d }))}
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
                  Aceito receber mensagens da CBRio no <strong>WhatsApp</strong> (avisos, escalas,
                  lembretes e felicitações). Você pode cancelar quando quiser. Seus dados são
                  tratados conforme a LGPD.
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
                Ao se inscrever, você concorda em receber contato da equipe da CBRio sobre
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
