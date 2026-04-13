import { useEffect, useMemo, useRef, useState } from 'react';
import { cadastroPublico } from '../../api';

// ── Background shader (mesmo padrão visual da tela de Login) ──
const vertexSource = `
  attribute vec4 a_position;
  void main() { gl_Position = a_position; }
`;

const fragmentSource = `
precision mediump float;
uniform vec2 iResolution;
uniform float iTime;
uniform vec3 u_color;

void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 centeredUV = (2.0 * fragCoord - iResolution.xy) / min(iResolution.x, iResolution.y);
  float time = iTime * 0.35;
  vec2 d = centeredUV;
  for (float i = 1.0; i < 8.0; i++) {
    d.x += 0.5 / i * cos(i * 2.0 * d.y + time);
    d.y += 0.5 / i * cos(i * 2.0 * d.x + time);
  }
  float wave = abs(sin(d.x + d.y + time));
  float glow = smoothstep(0.9, 0.2, wave);
  fragColor = vec4(u_color * glow, 1.0);
}

void main() { mainImage(gl_FragColor, gl_FragCoord.xy); }
`;

function SmokeyBackground({ color = '#00736B' }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl');
    if (!gl) return;

    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); return null; }
      return s;
    }

    const vs = compile(gl.VERTEX_SHADER, vertexSource);
    const fs = compile(gl.FRAGMENT_SHADER, fragmentSource);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'iResolution');
    const uTime = gl.getUniformLocation(prog, 'iTime');
    const uColor = gl.getUniformLocation(prog, 'u_color');

    const r = parseInt(color.substring(1, 3), 16) / 255;
    const g2 = parseInt(color.substring(3, 5), 16) / 255;
    const b = parseInt(color.substring(5, 7), 16) / 255;
    gl.uniform3f(uColor, r, g2, b);

    const t0 = Date.now();
    function render() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uTime, (Date.now() - t0) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      rafRef.current = requestAnimationFrame(render);
    }
    render();

    return () => cancelAnimationFrame(rafRef.current);
  }, [color]);

  return (
    <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 0 }} />
  );
}

// ── Input reutilizável com label flutuante (mesmo estilo do Login) ──
function Field({ id, label, type = 'text', value, onChange, required, placeholder, as = 'input', rows, maxLength, autoComplete }) {
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

// ── Texto de consentimento LGPD (gravado como snapshot) ──
const TEXTO_CONSENTIMENTO =
  'Declaro que li e concordo com o tratamento dos meus dados pessoais pela CBRio para fins de acolhimento e acompanhamento pastoral, conforme a Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018). Meus dados serão mantidos em ambiente seguro e não serão compartilhados com terceiros sem minha autorização.';

const ESTADO_CIVIL_OPTS = [
  { value: 'solteiro', label: 'Solteiro(a)' },
  { value: 'casado', label: 'Casado(a)' },
  { value: 'divorciado', label: 'Divorciado(a)' },
  { value: 'viuvo', label: 'Viúvo(a)' },
  { value: 'uniao_estavel', label: 'União estável' },
];

export default function CadastroMembresia() {
  const [form, setForm] = useState({
    nome: '',
    email: '',
    telefone: '',
    data_nascimento: '',
    estado_civil: '',
    endereco: '',
    bairro: '',
    cidade: '',
    cep: '',
    profissao: '',
    como_conheceu: '',
    // honeypot — permanece vazio em humanos
    website: '',
  });
  const [aceitaTermos, setAceitaTermos] = useState(false);
  const [aceitaContato, setAceitaContato] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  // Captura origem do querystring (?origem=qr_code por exemplo)
  const origem = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const o = params.get('origem');
      return ['qr_code', 'evento', 'site'].includes(o) ? o : 'site';
    } catch { return 'site'; }
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!aceitaTermos) {
      setError('É necessário aceitar os termos para enviar o cadastro.');
      return;
    }
    if (!form.nome.trim() || form.nome.trim().length < 3) {
      setError('Por favor, informe seu nome completo.');
      return;
    }
    setLoading(true);
    try {
      await cadastroPublico.enviar({
        ...form,
        origem,
        aceita_termos: aceitaTermos,
        aceita_contato: aceitaContato,
        consentimento_texto: TEXTO_CONSENTIMENTO,
      });
      setSent(true);
    } catch (err) {
      setError(err.message || 'Não foi possível enviar o cadastro. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
      padding: '40px 16px',
    }}>
      <SmokeyBackground />

      <div style={{
        position: 'relative', zIndex: 1, width: '100%', maxWidth: 640,
        background: 'rgba(22,22,22,0.78)', backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20,
        padding: '40px 36px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>⛪</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#e5e5e5', margin: 0 }}>Queremos te conhecer</h1>
          <p style={{ fontSize: 13, color: '#a3a3a3', marginTop: 6, lineHeight: 1.5 }}>
            Preencha seus dados para que nossa equipe de acolhimento entre em contato.
          </p>
        </div>

        {sent ? (
          <div style={{
            padding: '36px 20px', textAlign: 'center',
            background: '#00B39D18', border: '1px solid #00B39D40', borderRadius: 14,
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: '#00B39D', color: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, marginBottom: 16,
            }}>✓</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#e5e5e5', margin: 0 }}>
              Cadastro enviado!
            </h2>
            <p style={{ fontSize: 13, color: '#a3a3a3', marginTop: 10, lineHeight: 1.5 }}>
              Obrigado por se conectar com a CBRio. Em breve nossa equipe entrará em contato com você.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {error && (
              <div style={{
                background: '#ef444418', border: '1px solid #ef444440', borderRadius: 10,
                padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#ef4444',
              }}>
                {error}
              </div>
            )}

            {/* Honeypot — escondido visualmente e de leitores de tela;
                bots preenchem porque veem o input no HTML. */}
            <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
              <label htmlFor="website">Website</label>
              <input
                id="website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={set('website')}
              />
            </div>

            <SectionTitle>Dados pessoais</SectionTitle>
            <Field id="nome" label="Nome completo" value={form.nome} onChange={set('nome')} required autoComplete="name" maxLength={200} />
            <Row>
              <Field id="email" type="email" label="E-mail" value={form.email} onChange={set('email')} autoComplete="email" maxLength={200} />
              <Field id="telefone" label="Telefone / WhatsApp" value={form.telefone} onChange={set('telefone')} autoComplete="tel" maxLength={30} />
            </Row>
            <Row>
              <Field id="data_nascimento" type="date" label="Data de nascimento" value={form.data_nascimento} onChange={set('data_nascimento')} />
              <SelectField id="estado_civil" label="Estado civil" value={form.estado_civil} onChange={set('estado_civil')} options={ESTADO_CIVIL_OPTS} />
            </Row>
            <Field id="profissao" label="Profissão" value={form.profissao} onChange={set('profissao')} maxLength={120} />

            <SectionTitle>Endereço</SectionTitle>
            <Field id="endereco" label="Endereço (rua e número)" value={form.endereco} onChange={set('endereco')} autoComplete="street-address" maxLength={200} />
            <Row>
              <Field id="bairro" label="Bairro" value={form.bairro} onChange={set('bairro')} maxLength={80} />
              <Field id="cidade" label="Cidade" value={form.cidade} onChange={set('cidade')} maxLength={80} />
            </Row>
            <Field id="cep" label="CEP" value={form.cep} onChange={set('cep')} autoComplete="postal-code" maxLength={12} />

            <SectionTitle>Como você chegou até nós?</SectionTitle>
            <Field
              id="como_conheceu"
              label="Como conheceu a CBRio? (opcional)"
              value={form.como_conheceu}
              onChange={set('como_conheceu')}
              as="textarea"
              rows={3}
              maxLength={500}
            />

            {/* LGPD */}
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--cbrio-border)',
              borderRadius: 12, padding: 16, marginTop: 24, marginBottom: 8,
            }}>
              <p style={{ fontSize: 12, color: '#a3a3a3', lineHeight: 1.6, margin: 0, marginBottom: 12 }}>
                {TEXTO_CONSENTIMENTO}
              </p>
              <Checkbox
                id="aceita_termos"
                checked={aceitaTermos}
                onChange={setAceitaTermos}
                label="Li e concordo com o tratamento dos meus dados pessoais. *"
              />
              <Checkbox
                id="aceita_contato"
                checked={aceitaContato}
                onChange={setAceitaContato}
                label="Autorizo o contato da equipe de acolhimento por e-mail, telefone ou WhatsApp."
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 8, padding: '13px 20px', marginTop: 16,
                background: loading ? '#009985' : '#00B39D',
                color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600,
                cursor: loading ? 'wait' : 'pointer', transition: 'all 0.3s', opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Enviando...' : 'Enviar cadastro'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 style={{
      fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: 1.2, color: '#00B39D',
      margin: '28px 0 14px', paddingBottom: 6,
      borderBottom: '1px solid var(--cbrio-border)',
    }}>
      {children}
    </h2>
  );
}

function Row({ children }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: 16,
    }}>
      {children}
    </div>
  );
}

function Checkbox({ id, checked, onChange, label }) {
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
