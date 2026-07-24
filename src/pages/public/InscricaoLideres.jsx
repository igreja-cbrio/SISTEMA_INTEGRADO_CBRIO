// ============================================================================
// /inscricao-lideres — formulário público para NOVOS LÍDERES E ANFITRIÕES de
// grupos de conexão (Marcos · 2026-07-17).
//
// A pessoa preenche os dados, marca se quer ser líder, anfitrião ou OS DOIS
// (botões multi-seleção, no estilo do seletor de sexo) e conta o que motivou
// a decisão (opcional). Anfitrião = quem cede a casa → endereço e bairro
// viram obrigatórios. A candidatura cai na caixa de entrada do /grupos
// (origem "Novo líder/anfitrião") e a equipe assume dali: conversa com a
// pessoa e decide vincular a um grupo existente ou abrir um grupo novo.
//
// SEM WhatsApp em nenhuma etapa (fluxo assistido — a equipe sempre contata).
// Identidade: mesmas regras do /inscricao-grupos (CPF obrigatório com DV,
// nascimento, sexo) — o backend liga ao membro existente pelo matcher forte.
// ============================================================================

import { useState } from 'react';
import { gruposPublic } from '../../api';
import AnimatedBackground from './AnimatedBackground';
import { usePublicTheme, PublicThemeToggle, PublicPaletteCtx, usePublicPalette } from './publicTheme';
import { BirthDatePicker } from '../../components/ui/birth-date-picker';
import { CheckCircle2, Camera, X, Users, Home } from 'lucide-react';

const TEXTO_CONSENTIMENTO = `Ao enviar este formulário, você autoriza a CBRio a utilizar seus dados pessoais para fins de comunicação com a igreja e participação na equipe de grupos de conexão, conforme a LGPD.`;

const FORM_VAZIO = {
  nome: '', cpf: '', email: '', telefone: '', data_nascimento: '', genero: '',
  bairro: '', endereco: '', motivacao: '', website: '', foto_url: '',
};

function soDigitos(v) { return (v || '').toString().replace(/\D+/g, ''); }
// Dígitos verificadores do CPF (mesma regra do backend — valida antes de enviar).
function cpfValido(cpfMasked) {
  const cpf = soDigitos(cpfMasked);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(cpf[i]) * (10 - i);
  let r = (s * 10) % 11;
  if (r === 10) r = 0;
  if (r !== parseInt(cpf[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(cpf[i]) * (11 - i);
  r = (s * 10) % 11;
  if (r === 10) r = 0;
  return r === parseInt(cpf[10]);
}
function mascaraCpf(v) {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
function mascaraTelefone(v) {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default function InscricaoLideres() {
  const { C } = usePublicTheme();

  const [form, setForm] = useState(FORM_VAZIO);
  const [querLider, setQuerLider] = useState(false);
  const [querAnfitriao, setQuerAnfitriao] = useState(false);
  const [aceitaTermos, setAceitaTermos] = useState(false);
  const [errosCampos, setErrosCampos] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(null); // { mensagem? } quando ok
  const [fotoUploading, setFotoUploading] = useState(false);
  const [fotoErro, setFotoErro] = useState('');

  const set = (campo, mask) => (e) => {
    const v = mask ? mask(e.target.value) : e.target.value;
    setForm(f => ({ ...f, [campo]: v }));
    setErrosCampos(p => (p[campo] ? { ...p, [campo]: '' } : p));
  };

  const togglePapel = (papel) => {
    if (papel === 'lider') setQuerLider(v => !v);
    else setQuerAnfitriao(v => !v);
    setErrosCampos(p => (p.papel ? { ...p, papel: '' } : p));
  };

  const onFoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFotoErro(''); setFotoUploading(true);
    try {
      const { foto_url } = await gruposPublic.uploadFoto(file);
      setForm(f => ({ ...f, foto_url }));
    } catch (err) {
      setFotoErro(err.message || 'Não foi possível enviar a foto. Você pode seguir sem ela.');
    } finally { setFotoUploading(false); }
  };

  const scrollAteCampo = (campo) => {
    try { document.querySelector(`[data-campo="${campo}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
  };

  const validarCampos = () => {
    const erros = {};
    if (!form.nome || form.nome.trim().length < 3) erros.nome = 'Digite o nome completo.';
    if (soDigitos(form.telefone).length < 10) erros.telefone = 'Digite um celular válido com DDD.';
    if (!form.data_nascimento || !/^\d{4}-\d{2}-\d{2}$/.test(form.data_nascimento)) {
      erros.data_nascimento = 'Selecione uma data válida.';
    } else {
      const nasc = new Date(form.data_nascimento + 'T12:00:00');
      if (Number.isNaN(nasc.getTime())) erros.data_nascimento = 'Selecione uma data válida.';
      else if (nasc > new Date()) erros.data_nascimento = 'A data de nascimento não pode estar no futuro.';
      else if (nasc.getFullYear() < 1900) erros.data_nascimento = 'Confira o ano de nascimento.';
    }
    if (form.genero !== 'masculino' && form.genero !== 'feminino') erros.genero = 'Marque masculino ou feminino.';
    const cpfDig = soDigitos(form.cpf);
    if (cpfDig.length !== 11) erros.cpf = 'Informe o CPF completo.';
    else if (!cpfValido(form.cpf)) erros.cpf = 'Este CPF não é válido — confira os números.';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) erros.email = 'E-mail inválido.';
    if (!querLider && !querAnfitriao) erros.papel = 'Marque pelo menos uma opção: líder e/ou anfitrião.';
    // Anfitrião = quem cede a casa · o endereço é o dado (Marcos 17/07)
    if (querAnfitriao) {
      if (!form.endereco || form.endereco.trim().length < 5) erros.endereco = 'Como anfitrião, informe o endereço onde o grupo aconteceria.';
      if (!form.bairro || form.bairro.trim().length < 2) erros.bairro = 'Como anfitrião, informe o bairro.';
    }
    if (!aceitaTermos) erros.aceita_termos = 'É necessário aceitar os termos para enviar.';
    return erros;
  };

  const submit = async () => {
    const erros = validarCampos();
    if (Object.keys(erros).length > 0) {
      setErrosCampos(erros);
      setError('');
      const primeiro = ['nome', 'telefone', 'data_nascimento', 'genero', 'cpf', 'email', 'papel', 'endereco', 'bairro', 'aceita_termos'].find(k => erros[k]);
      if (primeiro) scrollAteCampo(primeiro === 'papel' ? 'papel' : primeiro);
      return;
    }
    setErrosCampos({});
    setLoading(true); setError('');
    try {
      const r = await gruposPublic.inscreverLider({
        nome: form.nome.trim(),
        cpf: soDigitos(form.cpf),
        email: form.email.trim() || null,
        telefone: form.telefone,
        data_nascimento: form.data_nascimento || null,
        genero: form.genero || null,
        quer_lider: querLider,
        quer_anfitriao: querAnfitriao,
        motivacao: form.motivacao.trim() || null,
        bairro: form.bairro.trim() || null,
        endereco: form.endereco.trim() || null,
        foto_url: form.foto_url || null,
        aceita_termos: aceitaTermos,
        // Líder consente com WhatsApp por padrão (obrigatório do papel · o aviso
        // no formulário explica; enviar aqui = ação afirmativa ao concluir).
        whatsapp_optin: true,
        consentimento_texto: TEXTO_CONSENTIMENTO,
        website: form.website,
      });
      setEnviado({ mensagem: r?.ja_inscrito ? r.mensagem : null });
    } catch (e) {
      if (e.campo) {
        setErrosCampos(p => ({ ...p, [e.campo]: e.message }));
        scrollAteCampo(e.campo);
      } else {
        setError(e.message || 'Não foi possível enviar. Tente novamente.');
      }
    } finally { setLoading(false); }
  };

  const resetForm = () => {
    setForm(FORM_VAZIO); setQuerLider(false); setQuerAnfitriao(false);
    setAceitaTermos(false); setErrosCampos({}); setError(''); setEnviado(null);
  };

  const PAPEIS = [
    { key: 'lider', ativo: querLider, Icon: Users, rotulo: 'Quero ser líder', desc: 'Conduzir os encontros e cuidar das pessoas do grupo' },
    { key: 'anfitriao', ativo: querAnfitriao, Icon: Home, rotulo: 'Quero ser anfitrião', desc: 'Abrir a minha casa para os encontros do grupo' },
  ];

  return (
    <PublicPaletteCtx.Provider value={C}>
    <div style={{
      minHeight: '100dvh', display: 'flex', position: 'relative',
      padding: 'clamp(20px, 5vw, 40px) clamp(10px, 3vw, 16px)',
      paddingBottom: 'calc(clamp(20px, 5vw, 40px) + env(safe-area-inset-bottom, 0px))',
      background: C.pageBg,
    }}>
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <AnimatedBackground />
      </div>
      <PublicThemeToggle />

      <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 640, margin: 'auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 'clamp(14px, 3vw, 24px)' }}>
          <h1 style={{
            fontSize: 'clamp(22px, 6vw, 28px)', fontWeight: 800, margin: 0, letterSpacing: -0.5,
            background: 'linear-gradient(90deg, #00B39D, #00d9bd)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          }}>
            Seja líder ou anfitrião de um grupo
          </h1>
          <p style={{ fontSize: 14, color: C.text3, marginTop: 8 }}>
            Deixe seus dados e a equipe de Grupos da CBRio vai falar com você.
          </p>
        </div>

        <div style={{
          background: C.card, border: `1px solid ${C.cardBorder}`,
          borderRadius: 20, padding: 'clamp(14px, 3.5vw, 24px)', backdropFilter: 'blur(16px)',
        }}>
          {enviado ? (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <CheckCircle2 size={56} style={{ color: '#10b981', margin: '0 auto 16px' }} />
              <h2 style={{ color: C.text, fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
                Inscrição enviada!
              </h2>
              <p style={{ color: C.text3, fontSize: 14, lineHeight: 1.6 }}>
                {enviado.mensagem || (
                  <>Que alegria ter você disposto a servir! A equipe de Grupos vai entrar em contato pra conversar sobre os próximos passos.</>
                )}
              </p>
              <button onClick={resetForm} style={{
                marginTop: 20, padding: '10px 24px', borderRadius: 10, background: '#00B39D', color: '#fff',
                border: 'none', fontWeight: 700, cursor: 'pointer',
              }}>
                Inscrever outra pessoa
              </button>
            </div>
          ) : (
            <div>
              {/* Papel — botões no estilo do seletor de sexo, mas MULTI-seleção */}
              <div data-campo="papel" style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: C.text3, display: 'block', marginBottom: 6 }}>
                  Como você quer servir? * <span style={{ opacity: 0.8 }}>(pode marcar os dois)</span>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 8 }}>
                  {PAPEIS.map(({ key, ativo, Icon, rotulo, desc }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => togglePapel(key)}
                      aria-pressed={ativo}
                      style={{
                        textAlign: 'left', padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                        border: `1px solid ${ativo ? '#00B39D' : (errosCampos.papel ? '#ef4444' : C.inputBorder)}`,
                        background: ativo ? 'rgba(0,179,157,0.12)' : (C.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
                        color: ativo ? '#00B39D' : C.text,
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14 }}>
                        <Icon size={17} /> {rotulo}
                        {ativo && <CheckCircle2 size={15} style={{ marginLeft: 'auto' }} />}
                      </span>
                      <span style={{ display: 'block', fontSize: 11.5, marginTop: 4, color: ativo ? C.text3 : C.text3, lineHeight: 1.4 }}>
                        {desc}
                      </span>
                    </button>
                  ))}
                </div>
                {errosCampos.papel && <p style={{ fontSize: 11.5, color: '#ef4444', margin: '4px 0 0' }}>{errosCampos.papel}</p>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12, marginBottom: 12 }}>
                <Field campo="nome" error={errosCampos.nome} label="Nome completo *" value={form.nome} onChange={set('nome')} />
                <Field campo="telefone" error={errosCampos.telefone} label="Celular / WhatsApp *" value={form.telefone} onChange={set('telefone', mascaraTelefone)} maxLength={16} inputMode="tel" />
                <div data-campo="data_nascimento">
                  <label style={{ fontSize: 12, color: C.text3, display: 'block', marginBottom: 4 }}>Data de nascimento *</label>
                  <BirthDatePicker
                    value={form.data_nascimento}
                    onChange={(v) => {
                      setForm(f => ({ ...f, data_nascimento: v }));
                      setErrosCampos(p => (p.data_nascimento ? { ...p, data_nascimento: '' } : p));
                    }}
                    placeholder="dia/mês/ano"
                    aria-invalid={!!errosCampos.data_nascimento}
                  />
                  {errosCampos.data_nascimento && <p style={{ fontSize: 11.5, color: '#ef4444', margin: '4px 0 0' }}>{errosCampos.data_nascimento}</p>}
                </div>
                <div data-campo="genero">
                  <label style={{ fontSize: 12, color: C.text3, display: 'block', marginBottom: 4 }}>Sexo *</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[['masculino', 'Masculino'], ['feminino', 'Feminino']].map(([valor, rotulo]) => (
                      <button
                        key={valor}
                        type="button"
                        onClick={() => {
                          setForm(f => ({ ...f, genero: valor }));
                          setErrosCampos(p => (p.genero ? { ...p, genero: '' } : p));
                        }}
                        style={{
                          flex: 1, minHeight: 44, padding: '9px 10px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                          fontWeight: form.genero === valor ? 700 : 500,
                          border: `1px solid ${form.genero === valor ? '#00B39D' : (errosCampos.genero ? '#ef4444' : C.inputBorder)}`,
                          background: form.genero === valor ? 'rgba(0,179,157,0.12)' : (C.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
                          color: form.genero === valor ? '#00B39D' : C.text,
                        }}
                      >
                        {rotulo}
                      </button>
                    ))}
                  </div>
                  {errosCampos.genero && <p style={{ fontSize: 11.5, color: '#ef4444', margin: '4px 0 0' }}>{errosCampos.genero}</p>}
                </div>
                <Field campo="cpf" error={errosCampos.cpf} label="CPF *" value={form.cpf} onChange={set('cpf', mascaraCpf)} maxLength={14} inputMode="numeric" />
                <Field campo="email" error={errosCampos.email} label="E-mail (opcional)" type="email" value={form.email} onChange={set('email')} />
                <Field
                  campo="bairro"
                  error={errosCampos.bairro}
                  label={querAnfitriao ? 'Bairro *' : 'Bairro (opcional)'}
                  value={form.bairro}
                  onChange={set('bairro')}
                />
                <Field
                  campo="endereco"
                  error={errosCampos.endereco}
                  label={querAnfitriao ? 'Endereço onde o grupo aconteceria *' : 'Endereço (opcional)'}
                  value={form.endereco}
                  onChange={set('endereco')}
                  placeholder={querAnfitriao ? 'Rua, número e complemento' : ''}
                />
              </div>

              {querAnfitriao && (
                <div style={{
                  padding: '8px 12px', marginBottom: 12, borderRadius: 10,
                  background: 'rgba(0,179,157,0.10)', border: '1px solid rgba(0,179,157,0.45)',
                  fontSize: 12, color: C.isDark ? '#5eead4' : '#0f766e', lineHeight: 1.5,
                }}>
                  Como anfitrião, o endereço é onde os encontros aconteceriam — a equipe combina os detalhes com você.
                </div>
              )}

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: C.text3, display: 'block', marginBottom: 4 }}>O que motivou sua decisão? (opcional)</label>
                <textarea value={form.motivacao} onChange={set('motivacao')} rows={3} maxLength={500}
                  placeholder="Conte pra gente o que te levou a querer servir nos grupos..."
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8,
                    border: `1px solid ${C.inputBorder}`, background: C.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                    color: C.text, fontSize: 16, fontFamily: 'inherit', boxSizing: 'border-box',
                  }}
                />
              </div>

              <FotoOpcional
                C={C}
                fotoUrl={form.foto_url}
                uploading={fotoUploading}
                erro={fotoErro}
                onPick={onFoto}
                onRemove={() => setForm(f => ({ ...f, foto_url: '' }))}
              />

              {/* honeypot */}
              <input type="text" value={form.website} onChange={set('website')} style={{ position: 'absolute', left: -9999, opacity: 0 }} tabIndex={-1} autoComplete="off" />

              {/* Aviso de WhatsApp · virar líder implica receber as mensagens
                  operacionais (Marcos 2026-07-24). Concluir a inscrição É o
                  consentimento — por isso não tem checkbox separado aqui. */}
              <div style={{ background: 'rgba(0,179,157,0.10)', border: '1px solid rgba(0,179,157,0.45)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                <p style={{ fontSize: 12, color: C.text, lineHeight: 1.5, margin: 0 }}>
                  📲 Como líder, você vai <strong>receber mensagens da CBRio no WhatsApp</strong> (chamada do mês, materiais e avisos dos grupos). Ao concluir a inscrição você concorda em recebê-las — dá pra cancelar quando quiser, respondendo <strong>SAIR</strong>.
                </p>
              </div>

              <div data-campo="aceita_termos" style={{ background: C.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', border: `1px solid ${errosCampos.aceita_termos ? '#ef4444' : C.cardBorder}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
                <p style={{ fontSize: 11, color: C.text3, lineHeight: 1.5, margin: 0, marginBottom: 8 }}>{TEXTO_CONSENTIMENTO}</p>
                <label style={{ fontSize: 12, color: C.text, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={aceitaTermos} onChange={e => {
                    setAceitaTermos(e.target.checked);
                    setErrosCampos(p => (p.aceita_termos ? { ...p, aceita_termos: '' } : p));
                  }} style={{ accentColor: '#00B39D' }} />
                  Li e aceito os termos *
                </label>
                {errosCampos.aceita_termos && <p style={{ fontSize: 11.5, color: '#ef4444', margin: '6px 0 0' }}>{errosCampos.aceita_termos}</p>}
              </div>

              {error && (
                <div style={{ padding: 10, marginBottom: 12, background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', borderRadius: 8, color: '#fca5a5', fontSize: 12 }}>
                  {error}
                </div>
              )}

              <button onClick={submit} disabled={loading} style={{
                width: '100%', padding: '12px', borderRadius: 10,
                background: loading ? 'rgba(0,179,157,0.3)' : '#00B39D',
                color: '#fff', fontWeight: 700, border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer', fontSize: 14,
              }}>
                {loading ? 'Enviando...' : 'Enviar inscrição'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
    </PublicPaletteCtx.Provider>
  );
}

function FotoOpcional({ C, fotoUrl, uploading, erro, onPick, onRemove }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 12, color: C.text3, display: 'block', marginBottom: 6 }}>Foto (opcional · ajuda a equipe a te reconhecer)</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
          border: `1px solid ${C.inputBorder}`, background: C.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text3,
        }}>
          {fotoUrl
            ? <img src={fotoUrl} alt="Sua foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <Camera size={22} />}
        </div>
        <label style={{
          padding: '8px 14px', minHeight: 44, boxSizing: 'border-box', borderRadius: 8, border: `1px solid #00B39D`, color: '#00B39D',
          fontWeight: 600, fontSize: 13, cursor: uploading ? 'wait' : 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent',
        }}>
          <Camera size={15} />
          {uploading ? 'Enviando...' : (fotoUrl ? 'Trocar foto' : 'Tirar foto ou escolher da galeria')}
          <input type="file" accept="image/*" onChange={onPick} disabled={uploading} style={{ display: 'none' }} />
        </label>
        {fotoUrl && !uploading && (
          <button type="button" onClick={onRemove} style={{
            background: 'none', border: 'none', color: C.text3, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12,
          }}>
            <X size={14} /> Remover
          </button>
        )}
      </div>
      {erro && <p style={{ fontSize: 11, color: '#fca5a5', marginTop: 6 }}>{erro}</p>}
    </div>
  );
}

function Field({ label, error, campo, ...rest }) {
  const C = usePublicPalette();
  return (
    <div data-campo={campo}>
      <label style={{ fontSize: 12, color: C.text3, display: 'block', marginBottom: 4 }}>{label}</label>
      <input {...rest} aria-invalid={!!error} style={{
        width: '100%', padding: '9px 12px', borderRadius: 8,
        border: `1px solid ${error ? '#ef4444' : C.inputBorder}`,
        background: C.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
        color: C.text, fontSize: 16, boxSizing: 'border-box',
      }} />
      {error && <p style={{ fontSize: 11.5, color: '#ef4444', margin: '4px 0 0' }}>{error}</p>}
    </div>
  );
}
