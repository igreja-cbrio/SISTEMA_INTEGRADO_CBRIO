// PORTA 5 do Contrato de Inscrição (F3.1 · docs/modulo-inscricoes/): nome em
// campo único (D1), nascimento OBRIGATÓRIO (D3 — só neste formulário; o
// walk-in do totem não muda), sexo obrigatório e endereço opcional (28/07),
// termos LGPD com snapshot, opt-in explícito (D4). O seletor de evento saiu
// (o backend o descartava desde a migração pra turmas). Validações de
// src/lib/inscricao (fonte única).
import { useEffect, useRef, useState } from 'react';
import { next as nextApi } from '../../api';
import AnimatedBackground from './AnimatedBackground';
import { usePublicTheme, PublicThemeToggle } from './publicTheme';
import { BirthDatePicker } from '../../components/ui/birth-date-picker';
import {
  soDigitos, mascaraCpf, mascaraTelefone, cpfValido, telefoneValido,
  nomeCompletoValido, temAbreviacaoNome, validarNascimento, SEXOS, AVISO_OPTIN,
} from '../../lib/inscricao';

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
          fontSize: 16, // 16px evita o zoom automatico do iOS ao focar
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
  const { C } = usePublicTheme();
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
          display: 'block', width: '100%', padding: '10px 0', fontSize: 16, // 16px evita o zoom do iOS ao focar
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
          <option key={o.value} value={o.value} style={{ background: C.optionBg, color: C.text }}>
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
type TurmaOpcao = { id: string; nome: string; data: string };

const DIA_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/**
 * "Domingo, 6 de setembro · 9h30".
 *
 * ⚠️ Fatia a string 'YYYY-MM-DD' em vez de usar `new Date(...)`: a data sem
 * horário é lida como meia-noite UTC, que no Rio é 21h do dia anterior — o
 * domingo 06/09 apareceria como sábado 05/09 no rótulo.
 */
function rotuloDomingo(data: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data || ''));
  if (!m) return String(data || '');
  const dia = Number(m[3]);
  return `Domingo, ${dia} de ${DIA_MES[Number(m[2]) - 1]} · 9h30`;
}

const TEXTOS_FALLBACK = {
  termos_lgpd: 'Autorizo a Igreja CBRio a tratar os dados deste formulário para organizar o NEXT e me comunicar sobre ele, conforme a LGPD.',
  aviso_optin: AVISO_OPTIN,
};

export default function InscricaoNext() {
  const { C } = usePublicTheme();
  const [form, setForm] = useState({
    nome_completo: '',
    cpf: '', telefone: '', email: '',
    data_nascimento: '', sexo: '', endereco: '',
    turma_id: '',
    website: '', // honeypot
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [aceitaTermos, setAceitaTermos] = useState(false);
  const [whatsappOptin, setWhatsappOptin] = useState(false);
  const [textos, setTextos] = useState<any>(TEXTOS_FALLBACK);
  // Domingos disponíveis (1 turma por domingo · culto de 09:30 · 26/08/2026).
  // `null` = ainda carregando · `[]` = nenhum domingo aberto · undefined = falhou.
  const [turmas, setTurmas] = useState<TurmaOpcao[] | null>(null);
  const [turmasErro, setTurmasErro] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    nextApi.publicTextos()
      .then((t: any) => { if (t?.termos_lgpd) setTextos(t); })
      .catch(() => { /* fallback local */ });
  }, []);

  useEffect(() => {
    nextApi.publicTurmas()
      .then((r: any) => setTurmas(Array.isArray(r?.turmas) ? r.turmas : []))
      // ⚠️ Falha de rede NÃO vira "nenhum domingo": o campo fica de fora e a
      // inscrição segue pelo caminho antigo (o servidor resolve a turma). Sumir
      // com o campo é melhor que travar a inscrição inteira.
      .catch(() => { setTurmas([]); setTurmasErro(true); });
  }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    let v = e.target.value;
    if (k === 'cpf') v = mascaraCpf(v);
    if (k === 'telefone') v = mascaraTelefone(v);
    setForm(f => ({ ...f, [k]: v }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    setError('');
    if (!nomeCompletoValido(form.nome_completo)) {
      return setError(temAbreviacaoNome(form.nome_completo)
        ? 'Escreva seu nome completo, sem abreviações'
        : 'Informe seu nome completo');
    }
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setError('Email inválido');
    if (!telefoneValido(form.telefone)) return setError('Telefone inválido');
    if (!form.cpf) return setError('Informe seu CPF');
    if (!cpfValido(form.cpf)) return setError('CPF inválido — confira os dígitos');
    if (!validarNascimento(form.data_nascimento)) return setError('Informe sua data de nascimento');
    if (!SEXOS.includes(form.sexo)) return setError('Selecione o sexo');
    // Só exige a escolha quando houve domingo para escolher.
    if (turmas && turmas.length > 0 && !form.turma_id) {
      return setError('Escolha o domingo em que você vai participar');
    }
    if (!aceitaTermos) return setError('É preciso aceitar os termos para se inscrever');

    submittingRef.current = true;
    setLoading(true);
    try {
      await nextApi.publicInscrever({
        nome_completo: form.nome_completo.trim(),
        cpf: form.cpf,
        telefone: form.telefone,
        email: form.email,
        data_nascimento: form.data_nascimento,
        sexo: form.sexo,
        endereco: form.endereco.trim() || null,
        turma_id: form.turma_id || null,
        aceita_termos: aceitaTermos,
        whatsapp_optin: whatsappOptin,
        website: form.website,
      });
      setSent(true);
    } catch (err: any) {
      setError(err?.message || 'Erro ao enviar inscrição');
    }
    setLoading(false);
    submittingRef.current = false;
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
          <img
            src="/logo-cbrio-icon.png"
            alt="CBRio"
            style={{ width: 72, height: 72, marginBottom: 12, display: 'inline-block' }}
          />
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.5, background: 'linear-gradient(90deg, #00B39D, #00d9bd)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Inscrição no NEXT</h1>
          <p style={{ fontSize: 13, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>
            O NEXT é o seu próximo passo dentro da Igreja CBRio! É onde conhecemos
            sua história, apresentamos nossa igreja e compartilhamos nossa visão!
            <br />
            <strong>Acontece todo domingo, às 9h30.</strong> Você participa de
            um encontro só — escolha abaixo a data que preferir.
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
              Inscrição confirmada!
            </h2>
            <p style={{ fontSize: 13, color: C.text3, marginTop: 10, lineHeight: 1.5 }}>
              Você está inscrito(a) no NEXT, no domingo que você escolheu, às 9h30.
              Em breve nossa equipe entrará em contato com mais detalhes. Nos vemos lá!
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
              <Field id="nome_completo" label="Nome completo (sem abreviar)" value={form.nome_completo} onChange={set('nome_completo')} required autoComplete="name" />
              <Field id="email" label="Email" type="email" value={form.email} onChange={set('email')} required autoComplete="email" inputMode="email" />
              <Row>
                <Field id="telefone" label="Telefone" value={form.telefone} onChange={set('telefone')} required placeholder="(00) 00000-0000" inputMode="tel" autoComplete="tel" />
                <Field id="cpf" label="CPF" value={form.cpf} onChange={set('cpf')} required placeholder="000.000.000-00" inputMode="numeric" autoComplete="off" />
              </Row>
              <Row>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--cbrio-text3)', marginBottom: 6 }}>
                    Data de nascimento <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <BirthDatePicker value={form.data_nascimento} onChange={(v) => setForm(f => ({ ...f, data_nascimento: v }))} />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--cbrio-text3)', marginBottom: 6 }}>
                    Sexo <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {SEXOS.map((o) => {
                      const sel = form.sexo === o;
                      return (
                        <button key={o} type="button" onClick={() => setForm(f => ({ ...f, sexo: o }))} aria-pressed={sel}
                          style={{
                            flex: 1, minHeight: 42, padding: '9px 10px', borderRadius: 999, fontSize: 13, cursor: 'pointer',
                            fontWeight: sel ? 700 : 500, textTransform: 'capitalize',
                            border: `1.5px solid ${sel ? '#00B39D' : 'var(--cbrio-border)'}`,
                            background: sel ? 'linear-gradient(90deg,#00B39D,#00d9bd)' : 'transparent',
                            color: sel ? '#fff' : 'var(--cbrio-text)', transition: 'all .15s',
                          }}>{o}</button>
                      );
                    })}
                  </div>
                </div>
              </Row>
              <Field id="endereco" label="Endereço (opcional)" value={form.endereco} onChange={set('endereco')} autoComplete="street-address" />

              {(turmas && turmas.length > 0) && (
                <>
                  <SectionTitle>Qual domingo?</SectionTitle>
                  <SelectField
                    id="turma_id"
                    label="Escolha o domingo em que você vai participar"
                    value={form.turma_id}
                    onChange={set('turma_id') as any}
                    options={turmas.map(t => ({ value: t.id, label: rotuloDomingo(t.data) }))}
                    required
                  />
                </>
              )}


              <label style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                background: C.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                border: `1px solid ${C.inputBorder}`,
                borderRadius: 12, padding: '14px 16px', margin: '4px 0 12px', cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={aceitaTermos}
                  onChange={(e) => setAceitaTermos(e.target.checked)}
                  style={{ marginTop: 3, width: 18, height: 18, accentColor: '#00B39D', flexShrink: 0 }}
                />
                <span style={{ fontSize: 12.5, color: C.text3, lineHeight: 1.55 }}>
                  <strong style={{ color: C.text }}>Li e aceito os termos *</strong><br />
                  {textos.termos_lgpd}
                </span>
              </label>

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
                  Aceito receber mensagens da CBRio no <strong>WhatsApp</strong> (avisos, lembretes
                  e felicitações). {textos.aviso_optin || AVISO_OPTIN} Você pode cancelar quando
                  quiser. Seus dados são tratados conforme a LGPD.
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
                Ao se inscrever, você concorda em receber contato da equipe da CBRio sobre o NEXT.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
