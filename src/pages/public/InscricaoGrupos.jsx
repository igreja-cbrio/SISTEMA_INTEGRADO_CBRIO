// ============================================================================
// /inscricao-grupos — formulário público para inscrição em grupo de conexão.
//
// Acessado via QR code distribuído nos cultos / redes sociais durante
// período de inscrição, ou num TOTEM (navegador quiosque no lounge). Usa o
// GrupoSelector em modo "full" (todos os filtros: líder, categoria, bairro,
// CEP, lista, mapa) e um form mínimo de identificação (nome, telefone
// obrigatórios · CPF, e-mail, nascimento e foto opcionais).
//
// Submit: roteia pro membro existente OU cria mem_cadastros_pendentes +
// mem_grupo_pedidos (origem='formulario_publico'). Se o backend detecta um
// cadastro parecido NESTE grupo, devolve 409 possivel_duplicado → mostramos
// "é você?" (confirmar, não bloquear).
//
// Totem: auto-reset por ociosidade (~90s) devolve ao início entre pessoas.
// ============================================================================

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { gruposPublic } from '../../api';
import AnimatedBackground from './AnimatedBackground';
import { usePublicTheme, PublicThemeToggle, PublicPaletteCtx, usePublicPalette } from './publicTheme';
import GrupoSelector from '../../components/grupos/GrupoSelector';
import { CheckCircle2, ArrowLeft, Users, Camera, X, HelpCircle } from 'lucide-react';

const TEXTO_CONSENTIMENTO = `Ao enviar este formulário, você autoriza a CBRio a utilizar seus dados pessoais para fins de comunicacao com a igreja e participação em grupo de conexão, conforme a LGPD.`;

const IDLE_MS = 90_000; // totem: volta ao início após ~90s sem interação

const FORM_VAZIO = {
  nome: '', cpf: '', email: '', telefone: '',
  data_nascimento: '', observacao: '', website: '', foto_url: '',
};

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
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default function InscricaoGrupos() {
  const { C } = usePublicTheme();

  const temporadaParam = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('temporada') || '';
    } catch { return ''; }
  }, []);
  const grupoParam = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('grupo') || '';
    } catch { return ''; }
  }, []);
  // Modo totem (quiosque no lounge · URL com ?totem=1): só nele ligamos o
  // auto-reset por ociosidade — num celular via QR isso apagaria os dados de
  // quem pausa pra pensar / procurar o CPF.
  const totemMode = useMemo(() => {
    try {
      const v = new URLSearchParams(window.location.search).get('totem');
      return v === '1' || v === 'true';
    } catch { return false; }
  }, []);

  const [grupoEscolhido, setGrupoEscolhido] = useState(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [aceitaTermos, setAceitaTermos] = useState(false);
  const [step, setStep] = useState(0); // 0=escolher grupo, 1=dados, 2=success
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dup, setDup] = useState(null);          // { onde } quando 409 possivel_duplicado
  const [resultado, setResultado] = useState(null); // { mensagem } quando já membro/já pedido
  const [fotoUploading, setFotoUploading] = useState(false);
  const [fotoErro, setFotoErro] = useState('');

  // Quando vem com ?grupo=<id> (ex: clique no mapa), pre-carrega o
  // grupo e pula direto para o passo 1 (dados).
  useEffect(() => {
    if (!grupoParam) return;
    let cancelled = false;
    (async () => {
      try {
        const g = await gruposPublic.getById(grupoParam);
        if (!cancelled && g && g.id) {
          setGrupoEscolhido(g);
          setStep(1);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [grupoParam]);

  const resetForm = useCallback(() => {
    setForm(FORM_VAZIO);
    setAceitaTermos(false);
    setError(''); setDup(null); setResultado(null); setFotoErro('');
    setStep(grupoParam ? 1 : 0);
    if (!grupoParam) setGrupoEscolhido(null);
  }, [grupoParam]);

  // ── Auto-reset por ociosidade (SÓ no totem) ──
  const busyRef = useRef(false);
  const submittingRef = useRef(false); // trava síncrona contra duplo-envio (toque duplo)
  useEffect(() => { busyRef.current = loading || fotoUploading; }, [loading, fotoUploading]);
  useEffect(() => {
    if (!totemMode) return; // celular/QR não faz auto-reset (perderia o que a pessoa digitou)
    let t;
    const bump = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (busyRef.current) { bump(); return; } // não reseta no meio de uma ação
        resetForm();
        try { window.scrollTo(0, 0); } catch {}
      }, IDLE_MS);
    };
    const evs = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
    evs.forEach(e => window.addEventListener(e, bump, { passive: true }));
    bump();
    return () => { clearTimeout(t); evs.forEach(e => window.removeEventListener(e, bump)); };
  }, [resetForm, totemMode]);

  const set = (k, masked) => (e) => setForm(f => ({ ...f, [k]: masked ? masked(e.target.value) : e.target.value }));

  // CPF é OPCIONAL agora — só nome, telefone e aceite dos termos são obrigatórios.
  const formValido = () => {
    if (!form.nome || form.nome.trim().length < 3) return false;
    if (soDigitos(form.telefone).length < 10) return false;
    if (!aceitaTermos) return false;
    return true;
  };

  const onFoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite re-selecionar o mesmo arquivo
    if (!file) return;
    setFotoErro(''); setFotoUploading(true);
    try {
      const { foto_url } = await gruposPublic.uploadFoto(file);
      setForm(f => ({ ...f, foto_url }));
    } catch (err) {
      setFotoErro(err.message || 'Não foi possível enviar a foto. Você pode seguir sem ela.');
    } finally { setFotoUploading(false); }
  };

  const doSubmit = async (extra = {}) => {
    if (!grupoEscolhido) { setError('Escolha um grupo primeiro.'); return; }
    if (!formValido()) { setError('Preencha os campos obrigatórios.'); return; }
    if (submittingRef.current) return; // trava re-entrada (duplo-toque antes do re-render)
    submittingRef.current = true;
    setLoading(true); setError('');
    try {
      const cpfDigitos = soDigitos(form.cpf);
      const r = await gruposPublic.inscrever({
        grupo_id: grupoEscolhido.id,
        nome: form.nome.trim(),
        // Envia o CPF só quando completo (11 dígitos) — parcial vira "sem CPF".
        cpf: cpfDigitos.length === 11 ? cpfDigitos : null,
        email: form.email.trim() || null,
        telefone: form.telefone,
        data_nascimento: form.data_nascimento || null,
        observacao: form.observacao || null,
        foto_url: form.foto_url || null,
        aceita_termos: aceitaTermos,
        consentimento_texto: TEXTO_CONSENTIMENTO,
        website: form.website,
        ...extra,
      });
      setDup(null);
      setResultado(r && (r.ja_membro || r.ja_pedido) ? { mensagem: r.mensagem } : null);
      setStep(2);
    } catch (e) {
      if (e.status === 409 && e.codigo === 'possivel_duplicado') {
        setDup({ onde: e.onde || 'pedido_pendente' });
      } else {
        setError(e.message || 'Não foi possível enviar. Tente novamente.');
      }
    } finally { setLoading(false); submittingRef.current = false; }
  };

  const submit = () => doSubmit();

  return (
    <PublicPaletteCtx.Provider value={C}>
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden', padding: '40px 16px', background: C.pageBg,
    }}>
      <AnimatedBackground />
      <PublicThemeToggle />

      <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 720 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{
            fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: -0.5,
            background: 'linear-gradient(90deg, #00B39D, #00d9bd)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          }}>
            Entre em um Grupo de Conexão
          </h1>
          <p style={{ fontSize: 14, color: C.text3, marginTop: 8 }}>
            Encontre um grupo perto de você e seja recebido pelo líder.
          </p>
        </div>

        <div style={{
          background: C.card, border: `1px solid ${C.cardBorder}`,
          borderRadius: 20, padding: 24, backdropFilter: 'blur(16px)',
        }}>
          {step === 2 ? (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <CheckCircle2 size={56} style={{ color: '#10b981', margin: '0 auto 16px' }} />
              <h2 style={{ color: C.text, fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
                {resultado ? 'Tudo certo!' : 'Pedido enviado!'}
              </h2>
              <p style={{ color: C.text3, fontSize: 14, lineHeight: 1.6 }}>
                {resultado ? (
                  resultado.mensagem
                ) : (
                  <>
                    Seu pedido para entrar no grupo <strong style={{ color: C.text }}>{grupoEscolhido?.nome}</strong> foi
                    enviado. O líder vai analisar e você receberá uma confirmação por
                    {form.email ? ' e-mail' : ''}{form.telefone ? ' / WhatsApp' : ''} em breve.
                  </>
                )}
              </p>
              <button onClick={resetForm} style={{
                marginTop: 20, padding: '10px 24px', borderRadius: 10, background: '#00B39D', color: '#fff',
                border: 'none', fontWeight: 700, cursor: 'pointer',
              }}>
                Inscrever outra pessoa
              </button>
            </div>
          ) : step === 0 ? (
            <div>
              <h2 style={{ color: C.text, fontSize: 16, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={18} style={{ color: '#00B39D' }} /> 1. Escolha o grupo
              </h2>
              <GrupoSelector
                mode="full"
                usePublicApi
                temporadaId={temporadaParam || undefined}
                selectedGrupoId={grupoEscolhido?.id}
                onSelect={setGrupoEscolhido}
              />
              {grupoEscolhido && (
                <div style={{
                  marginTop: 16, padding: 12, background: 'rgba(0,179,157,0.10)',
                  border: '1px solid #00B39D', borderRadius: 10, fontSize: 13, color: '#00B39D',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                }}>
                  <span>✓ Grupo selecionado: <strong>{grupoEscolhido.nome}</strong>{grupoEscolhido.lider_nome && <> · líder: {grupoEscolhido.lider_nome}</>}</span>
                  <button onClick={() => setStep(1)} style={{
                    padding: '8px 18px', borderRadius: 8, background: '#00B39D', color: '#fff',
                    border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: 13,
                  }}>
                    Continuar →
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div>
              <button onClick={() => setStep(0)} style={{
                background: 'none', border: 'none', color: '#00B39D', display: 'flex', alignItems: 'center',
                gap: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, marginBottom: 12, padding: 0,
              }}>
                <ArrowLeft size={16} /> Voltar à escolha do grupo
              </button>
              <h2 style={{ color: C.text, fontSize: 16, fontWeight: 700, marginBottom: 4 }}>2. Seus dados</h2>
              <p style={{ color: C.text3, fontSize: 12, marginBottom: 16 }}>
                Para o grupo <strong style={{ color: C.text }}>{grupoEscolhido?.nome}</strong>
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
                <Field label="Nome completo *" value={form.nome} onChange={set('nome')} />
                <Field label="Celular / WhatsApp *" value={form.telefone} onChange={set('telefone', mascaraTelefone)} maxLength={16} inputMode="tel" />
                <Field label="CPF (opcional · evita duplicidade)" value={form.cpf} onChange={set('cpf', mascaraCpf)} maxLength={14} inputMode="numeric" />
                <Field label="E-mail (opcional)" type="email" value={form.email} onChange={set('email')} />
                <Field label="Data de nascimento (opcional)" type="date" value={form.data_nascimento} onChange={set('data_nascimento')} />
              </div>

              {/* Foto opcional — reforço de identidade / anti-duplicata */}
              <FotoOpcional
                C={C}
                fotoUrl={form.foto_url}
                uploading={fotoUploading}
                erro={fotoErro}
                onPick={onFoto}
                onRemove={() => setForm(f => ({ ...f, foto_url: '' }))}
              />

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: C.text3, display: 'block', marginBottom: 4 }}>Mensagem para o líder (opcional)</label>
                <textarea value={form.observacao} onChange={set('observacao')} rows={2} maxLength={400}
                  placeholder="Por exemplo: 'Sou amigo do João e quero participar'..."
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8,
                    border: `1px solid ${C.inputBorder}`, background: C.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                    color: C.text, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* honeypot */}
              <input type="text" value={form.website} onChange={set('website')} style={{ position: 'absolute', left: -9999, opacity: 0 }} tabIndex={-1} autoComplete="off" />

              <div style={{ background: C.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', border: `1px solid ${C.cardBorder}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
                <p style={{ fontSize: 11, color: C.text3, lineHeight: 1.5, margin: 0, marginBottom: 8 }}>{TEXTO_CONSENTIMENTO}</p>
                <label style={{ fontSize: 12, color: C.text, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={aceitaTermos} onChange={e => setAceitaTermos(e.target.checked)} style={{ accentColor: '#00B39D' }} />
                  Li e aceito os termos *
                </label>
              </div>

              {error && (
                <div style={{ padding: 10, marginBottom: 12, background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', borderRadius: 8, color: '#fca5a5', fontSize: 12 }}>
                  {error}
                </div>
              )}

              <button onClick={submit} disabled={loading || !formValido()} style={{
                width: '100%', padding: '12px', borderRadius: 10,
                background: loading || !formValido() ? 'rgba(0,179,157,0.3)' : '#00B39D',
                color: '#fff', fontWeight: 700, border: 'none',
                cursor: loading || !formValido() ? 'not-allowed' : 'pointer', fontSize: 14,
              }}>
                {loading ? 'Enviando...' : 'Enviar pedido'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal "é você?" — confirmação de possível duplicata (não bloqueia) */}
      {dup && (
        <DupModal
          C={C}
          onde={dup.onde}
          loading={loading}
          erro={error}
          onSouEu={() => doSubmit({ sou_eu: true })}
          onOutraPessoa={() => doSubmit({ confirmar_novo: true })}
          onFechar={() => setDup(null)}
        />
      )}
    </div>
    </PublicPaletteCtx.Provider>
  );
}

function FotoOpcional({ C, fotoUrl, uploading, erro, onPick, onRemove }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 12, color: C.text3, display: 'block', marginBottom: 6 }}>Foto (opcional · ajuda o líder a te reconhecer)</label>
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
          padding: '8px 14px', borderRadius: 8, border: `1px solid #00B39D`, color: '#00B39D',
          fontWeight: 600, fontSize: 13, cursor: uploading ? 'wait' : 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent',
        }}>
          <Camera size={15} />
          {uploading ? 'Enviando...' : (fotoUrl ? 'Trocar foto' : 'Adicionar foto')}
          <input type="file" accept="image/*" capture="environment" onChange={onPick} disabled={uploading} style={{ display: 'none' }} />
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

function DupModal({ C, onde, loading, erro, onSouEu, onOutraPessoa, onFechar }) {
  const msg = onde === 'membro_ativo'
    ? 'Encontramos alguém já participando deste grupo com dados parecidos aos seus.'
    : 'Já recebemos um pedido para este grupo com dados parecidos aos seus.';
  return (
    <div
      onClick={onFechar}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100, background: C.overlay || 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 420, background: C.modalBg || C.card,
        border: `1px solid ${C.cardBorder}`, borderRadius: 16, padding: 24, textAlign: 'center',
      }}>
        <HelpCircle size={44} style={{ color: '#00B39D', margin: '0 auto 12px' }} />
        <h3 style={{ color: C.text, fontSize: 18, fontWeight: 800, marginBottom: 8 }}>É você mesmo?</h3>
        <p style={{ color: C.text3, fontSize: 13, lineHeight: 1.6, marginBottom: erro ? 12 : 20 }}>{msg}</p>
        {erro && (
          <div style={{ padding: 10, marginBottom: 14, background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', borderRadius: 8, color: '#fca5a5', fontSize: 12 }}>
            {erro}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={onSouEu} disabled={loading} style={{
            padding: '12px', borderRadius: 10, background: loading ? 'rgba(0,179,157,0.3)' : '#00B39D',
            color: '#fff', fontWeight: 700, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 14,
          }}>
            {loading ? 'Confirmando...' : 'Sim, sou eu'}
          </button>
          <button onClick={onOutraPessoa} disabled={loading} style={{
            padding: '12px', borderRadius: 10, background: 'transparent',
            color: C.text, fontWeight: 600, border: `1px solid ${C.inputBorder}`,
            cursor: loading ? 'not-allowed' : 'pointer', fontSize: 14,
          }}>
            Não, sou outra pessoa
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, ...rest }) {
  const C = usePublicPalette();
  return (
    <div>
      <label style={{ fontSize: 12, color: C.text3, display: 'block', marginBottom: 4 }}>{label}</label>
      <input {...rest} style={{
        width: '100%', padding: '9px 12px', borderRadius: 8,
        border: `1px solid ${C.inputBorder}`, background: C.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
        color: C.text, fontSize: 13, boxSizing: 'border-box',
      }} />
    </div>
  );
}
