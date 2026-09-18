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
//
// PORTA 3 do Contrato de Inscrição (F3.1 · docs/modulo-inscricoes/): e-mail
// obrigatório (D2), opt-in de WhatsApp EXPLÍCITO com checkbox default false
// (D4 · 28/07, substitui o "concluir É o consentimento" de 24/07),
// anti-abreviação no nome, teto de 11 dígitos no telefone. Validações de
// src/lib/inscricao (fonte única).
// ============================================================================

import { useRef, useState } from 'react';
import { gruposPublic } from '../../api';
import AnimatedBackground from './AnimatedBackground';
import { usePublicTheme, PublicThemeToggle, PublicPaletteCtx, usePublicPalette } from './publicTheme';
import { BirthDatePicker } from '../../components/ui/birth-date-picker';
import { CheckCircle2, Camera, X, Users, Home, Heart } from 'lucide-react';
import SeletorBairro from '../../components/ui/seletor-bairro';
import {
  soDigitos, mascaraCpf, mascaraTelefone, cpfValido, telefoneValido,
  nomeCompletoValido, temAbreviacaoNome, AVISO_OPTIN,
} from '../../lib/inscricao';

const TEXTO_CONSENTIMENTO = `Ao enviar este formulário, você autoriza a CBRio a utilizar seus dados pessoais para fins de comunicação com a igreja e participação na equipe de grupos de conexão, conforme a LGPD.`;

// LGPD: o titular não consente sozinho pelo cônjuge — ele DECLARA que o
// cônjuge está ciente e concorda (mesmo desenho do /inscricao-grupos). O texto
// vai como snapshot no consentimento do cônjuge (porta grupos_lider).
const TEXTO_CONSENTIMENTO_CONJUGE = `Declaro que meu cônjuge está ciente desta inscrição, concorda com ela e autoriza a CBRio a utilizar os dados pessoais informados aqui para comunicação com a igreja e participação na equipe de grupos de conexão, conforme a LGPD.`;

const FORM_VAZIO = {
  nome: '', cpf: '', email: '', telefone: '', data_nascimento: '', genero: '',
  bairro: '', endereco: '', motivacao: '', website: '', foto_url: '',
};

// Cônjuge (inscrição em par · Marcos 02/09) — mesmos campos obrigatórios do
// titular; papel/motivação/endereço valem pros dois.
const CONJUGE_VAZIO = {
  nome: '', cpf: '', email: '', telefone: '', data_nascimento: '', genero: '',
  aceita_termos: false, whatsapp_optin: false,
};

export default function InscricaoLideres() {
  const { C } = usePublicTheme();

  const [form, setForm] = useState(FORM_VAZIO);
  const [querLider, setQuerLider] = useState(false);
  const [querAnfitriao, setQuerAnfitriao] = useState(false);
  const [aceitaTermos, setAceitaTermos] = useState(false);
  const [optin, setOptin] = useState(false); // D4 · explícito, default false
  const [comConjuge, setComConjuge] = useState(false);
  const [conjuge, setConjuge] = useState(CONJUGE_VAZIO);
  const submittingRef = useRef(false); // trava síncrona de duplo-toque
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

  const setConj = (campo, mask) => (e) => {
    const v = mask ? mask(e.target.value) : e.target.value;
    setConjuge(c => ({ ...c, [campo]: v }));
    setErrosCampos(p => (p[`conjuge.${campo}`] ? { ...p, [`conjuge.${campo}`]: '' } : p));
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
    if (!nomeCompletoValido(form.nome)) {
      erros.nome = temAbreviacaoNome(form.nome) ? 'Escreva o nome completo, sem abreviações.' : 'Digite o nome completo.';
    }
    if (!telefoneValido(form.telefone)) erros.telefone = 'Digite um celular válido com DDD.';
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
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) erros.email = 'Informe um e-mail válido.';
    if (!querLider && !querAnfitriao) erros.papel = 'Marque pelo menos uma opção: líder e/ou anfitrião.';
    // Anfitrião = quem cede a casa · o endereço é o dado (Marcos 17/07)
    if (querAnfitriao) {
      if (!form.endereco || form.endereco.trim().length < 5) erros.endereco = 'Como anfitrião, informe o endereço onde o grupo aconteceria.';
      if (!form.bairro || form.bairro.trim().length < 2) erros.bairro = 'Como anfitrião, informe o bairro.';
    }
    if (!aceitaTermos) erros.aceita_termos = 'É necessário aceitar os termos para enviar.';
    // Cônjuge (inscrição em par): mesma régua do titular, chaves 'conjuge.*'.
    if (comConjuge) {
      if (!nomeCompletoValido(conjuge.nome)) {
        erros['conjuge.nome'] = temAbreviacaoNome(conjuge.nome) ? 'Escreva o nome completo, sem abreviações.' : 'Digite o nome completo.';
      }
      if (!telefoneValido(conjuge.telefone)) erros['conjuge.telefone'] = 'Digite um celular válido com DDD.';
      if (!conjuge.data_nascimento || !/^\d{4}-\d{2}-\d{2}$/.test(conjuge.data_nascimento)) {
        erros['conjuge.data_nascimento'] = 'Selecione uma data válida.';
      }
      if (conjuge.genero !== 'masculino' && conjuge.genero !== 'feminino') erros['conjuge.genero'] = 'Marque masculino ou feminino.';
      const cpfConj = soDigitos(conjuge.cpf);
      if (cpfConj.length !== 11) erros['conjuge.cpf'] = 'Informe o CPF completo.';
      else if (!cpfValido(conjuge.cpf)) erros['conjuge.cpf'] = 'Este CPF não é válido — confira os números.';
      else if (cpfConj === soDigitos(form.cpf)) erros['conjuge.cpf'] = 'O CPF do cônjuge é o mesmo do titular — confira os números.';
      if (!conjuge.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(conjuge.email.trim())) erros['conjuge.email'] = 'Informe um e-mail válido.';
      if (!conjuge.aceita_termos) erros['conjuge.aceita_termos'] = 'Confirme que seu cônjuge está ciente e concorda com a inscrição.';
    }
    return erros;
  };

  const submit = async () => {
    if (submittingRef.current) return;
    const erros = validarCampos();
    if (Object.keys(erros).length > 0) {
      setErrosCampos(erros);
      setError('');
      const primeiro = [
        'nome', 'telefone', 'data_nascimento', 'genero', 'cpf', 'email', 'papel', 'endereco', 'bairro',
        'conjuge.nome', 'conjuge.telefone', 'conjuge.data_nascimento', 'conjuge.genero', 'conjuge.cpf',
        'conjuge.email', 'conjuge.aceita_termos', 'aceita_termos',
      ].find(k => erros[k]);
      if (primeiro) scrollAteCampo(primeiro === 'papel' ? 'papel' : primeiro);
      return;
    }
    setErrosCampos({});
    submittingRef.current = true;
    setLoading(true); setError('');
    try {
      const r = await gruposPublic.inscreverLider({
        nome: form.nome.trim(),
        cpf: soDigitos(form.cpf),
        email: form.email.trim(),
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
        // D4 (28/07): opt-in explícito — checkbox default false, nada implícito.
        whatsapp_optin: optin,
        consentimento_texto: TEXTO_CONSENTIMENTO,
        // Cônjuge (inscrição em par): cada um vira UMA inscrição própria no
        // backend, cruzadas — papel/motivação/endereço valem pros dois.
        ...(comConjuge ? {
          conjuge: {
            nome: conjuge.nome.trim(),
            cpf: soDigitos(conjuge.cpf),
            email: conjuge.email.trim(),
            telefone: conjuge.telefone,
            data_nascimento: conjuge.data_nascimento || null,
            genero: conjuge.genero || null,
            aceita_termos: conjuge.aceita_termos === true,
            whatsapp_optin: conjuge.whatsapp_optin === true,
          },
          consentimento_conjuge_texto: TEXTO_CONSENTIMENTO_CONJUGE,
        } : {}),
        website: form.website,
      });
      setEnviado({ mensagem: r?.ja_inscrito ? r.mensagem : null, conjuge: r?.conjuge || null });
    } catch (e) {
      if (e.campo) {
        setErrosCampos(p => ({ ...p, [e.campo]: e.message }));
        scrollAteCampo(e.campo);
      } else {
        setError(e.message || 'Não foi possível enviar. Tente novamente.');
      }
    } finally { setLoading(false); submittingRef.current = false; }
  };

  const resetForm = () => {
    setForm(FORM_VAZIO); setQuerLider(false); setQuerAnfitriao(false);
    setAceitaTermos(false); setOptin(false); setComConjuge(false); setConjuge(CONJUGE_VAZIO);
    setErrosCampos({}); setError(''); setEnviado(null);
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
              {enviado.conjuge && (
                <div style={{
                  marginTop: 14, padding: '10px 12px', borderRadius: 10, textAlign: 'left',
                  background: enviado.conjuge.ok ? 'rgba(0,179,157,0.10)' : 'rgba(239,68,68,0.12)',
                  border: `1px solid ${enviado.conjuge.ok ? 'rgba(0,179,157,0.45)' : '#ef4444'}`,
                  fontSize: 13, color: C.text, lineHeight: 1.5,
                }}>
                  <strong>{enviado.conjuge.nome || 'Seu cônjuge'}:</strong>{' '}
                  {enviado.conjuge.ok
                    ? (enviado.conjuge.ja_inscrito
                      ? 'já tinha uma inscrição em aberto — a equipe vai falar com vocês dois.'
                      : 'inscrição registrada junto com a sua. A equipe fala com o casal de uma vez.')
                    : `${enviado.conjuge.error || 'não conseguimos registrar a inscrição.'} A sua está valendo — fale com a equipe de Grupos.`}
                </div>
              )}
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
                <Field campo="email" error={errosCampos.email} label="E-mail *" type="email" value={form.email} onChange={set('email')} />
                {/* ⚠️ Este formulário não pede CEP — quem se candidata a líder
                    informa o bairro onde o grupo aconteceria, e pedir CEP para
                    isso seria atrito sem ganho. O que ele ganha aqui é a lista
                    validada: sem ela, cada candidatura inventava uma grafia. */}
                <div data-campo="bairro">
                  <label
                    htmlFor="bairro"
                    style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6, color: 'var(--cbrio-text2, #555)' }}
                  >
                    {querAnfitriao ? 'Bairro *' : 'Bairro (opcional)'}
                  </label>
                  <SeletorBairro
                    id="bairro"
                    value={form.bairro}
                    onChange={(v) => setForm((f) => ({ ...f, bairro: v }))}
                    atalhos={6}
                  />
                  {errosCampos.bairro && (
                    <p style={{ fontSize: 11.5, color: '#ef4444', margin: '4px 0 0' }}>{errosCampos.bairro}</p>
                  )}
                </div>
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

              {/* ── Cônjuge · candidatura em par (Marcos 02/09) ── */}
              <div style={{
                border: `1.5px solid ${comConjuge ? 'rgba(0,179,157,0.55)' : C.cardBorder}`,
                background: comConjuge ? 'rgba(0,179,157,0.07)' : (C.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                borderRadius: 12, padding: 14, marginBottom: 12,
              }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={comConjuge}
                    onChange={(e) => setComConjuge(e.target.checked)}
                    style={{ marginTop: 2, width: 18, height: 18, accentColor: '#00B39D', flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>
                    <Heart size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2, color: '#00B39D' }} />
                    <strong>Inscrever meu cônjuge junto</strong>
                    <span style={{ display: 'block', fontSize: 12, color: C.text3, marginTop: 3 }}>
                      Vão liderar (ou receber o grupo) juntos? Inscreva os dois de uma vez — a equipe
                      recebe a candidatura do casal e fala com vocês.
                    </span>
                  </span>
                </label>

                {comConjuge && (
                  <div style={{ marginTop: 14 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>
                      Dados do seu cônjuge
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12 }}>
                      <Field campo="conjuge.nome" error={errosCampos['conjuge.nome']} label="Nome completo *" value={conjuge.nome} onChange={setConj('nome')} />
                      <Field campo="conjuge.telefone" error={errosCampos['conjuge.telefone']} label="Celular / WhatsApp *" value={conjuge.telefone} onChange={setConj('telefone', mascaraTelefone)} maxLength={16} inputMode="tel" />
                      <div data-campo="conjuge.data_nascimento">
                        <label style={{ fontSize: 12, color: C.text3, display: 'block', marginBottom: 4 }}>Data de nascimento *</label>
                        <BirthDatePicker
                          value={conjuge.data_nascimento}
                          onChange={(v) => {
                            setConjuge(c => ({ ...c, data_nascimento: v }));
                            setErrosCampos(p => (p['conjuge.data_nascimento'] ? { ...p, 'conjuge.data_nascimento': '' } : p));
                          }}
                          placeholder="dia/mês/ano"
                          aria-invalid={!!errosCampos['conjuge.data_nascimento']}
                        />
                        {errosCampos['conjuge.data_nascimento'] && <p style={{ fontSize: 11.5, color: '#ef4444', margin: '4px 0 0' }}>{errosCampos['conjuge.data_nascimento']}</p>}
                      </div>
                      <div data-campo="conjuge.genero">
                        <label style={{ fontSize: 12, color: C.text3, display: 'block', marginBottom: 4 }}>Sexo *</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {[['masculino', 'Masculino'], ['feminino', 'Feminino']].map(([valor, rotulo]) => (
                            <button
                              key={valor}
                              type="button"
                              onClick={() => {
                                setConjuge(c => ({ ...c, genero: valor }));
                                setErrosCampos(p => (p['conjuge.genero'] ? { ...p, 'conjuge.genero': '' } : p));
                              }}
                              style={{
                                flex: 1, minHeight: 44, padding: '9px 10px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                                fontWeight: conjuge.genero === valor ? 700 : 500,
                                border: `1px solid ${conjuge.genero === valor ? '#00B39D' : (errosCampos['conjuge.genero'] ? '#ef4444' : C.inputBorder)}`,
                                background: conjuge.genero === valor ? 'rgba(0,179,157,0.12)' : (C.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
                                color: conjuge.genero === valor ? '#00B39D' : C.text,
                              }}
                            >
                              {rotulo}
                            </button>
                          ))}
                        </div>
                        {errosCampos['conjuge.genero'] && <p style={{ fontSize: 11.5, color: '#ef4444', margin: '4px 0 0' }}>{errosCampos['conjuge.genero']}</p>}
                      </div>
                      <Field campo="conjuge.cpf" error={errosCampos['conjuge.cpf']} label="CPF *" value={conjuge.cpf} onChange={setConj('cpf', mascaraCpf)} maxLength={14} inputMode="numeric" />
                      <Field campo="conjuge.email" error={errosCampos['conjuge.email']} label="E-mail *" type="email" value={conjuge.email} onChange={setConj('email')} />
                    </div>

                    <div data-campo="conjuge.aceita_termos" style={{
                      marginTop: 12, padding: 12, borderRadius: 10,
                      background: C.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                      border: `1px solid ${errosCampos['conjuge.aceita_termos'] ? '#ef4444' : C.cardBorder}`,
                    }}>
                      <p style={{ fontSize: 11, color: C.text3, lineHeight: 1.5, margin: 0, marginBottom: 8 }}>{TEXTO_CONSENTIMENTO_CONJUGE}</p>
                      <label style={{ fontSize: 12, color: C.text, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input type="checkbox" checked={conjuge.aceita_termos} onChange={e => {
                          setConjuge(c => ({ ...c, aceita_termos: e.target.checked }));
                          setErrosCampos(p => (p['conjuge.aceita_termos'] ? { ...p, 'conjuge.aceita_termos': '' } : p));
                        }} style={{ accentColor: '#00B39D' }} />
                        Meu cônjuge está ciente e concorda *
                      </label>
                      {errosCampos['conjuge.aceita_termos'] && <p style={{ fontSize: 11.5, color: '#ef4444', margin: '6px 0 0' }}>{errosCampos['conjuge.aceita_termos']}</p>}
                    </div>

                    <label style={{ marginTop: 10, fontSize: 12, color: C.text, display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', lineHeight: 1.5 }}>
                      <input type="checkbox" checked={conjuge.whatsapp_optin} onChange={e => setConjuge(c => ({ ...c, whatsapp_optin: e.target.checked }))}
                        style={{ accentColor: '#00B39D', marginTop: 2, flexShrink: 0 }} />
                      <span>📲 Meu cônjuge também quer receber as mensagens de líder no WhatsApp.</span>
                    </label>
                  </div>
                )}
              </div>

              {/* honeypot */}
              <input type="text" value={form.website} onChange={set('website')} style={{ position: 'absolute', left: -9999, opacity: 0 }} tabIndex={-1} autoComplete="off" />

              {/* Opt-in de WhatsApp EXPLÍCITO (D4 · 28/07 — substitui o
                  "concluir É o consentimento" de 24/07). Como líder as
                  mensagens são operacionais (chamada do mês, materiais),
                  então o texto deixa a consequência clara. */}
              <div style={{ background: 'rgba(0,179,157,0.10)', border: '1px solid rgba(0,179,157,0.45)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: C.text, display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', lineHeight: 1.5 }}>
                  <input type="checkbox" checked={optin} onChange={e => setOptin(e.target.checked)}
                    style={{ accentColor: '#00B39D', marginTop: 2, flexShrink: 0 }} />
                  <span>
                    📲 <strong>Quero receber as mensagens de líder no WhatsApp</strong> (chamada do mês, materiais e avisos dos grupos). {AVISO_OPTIN} Dá pra cancelar quando quiser respondendo <strong>SAIR</strong>.
                  </span>
                </label>
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
