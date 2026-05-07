// ============================================================================
// /inscricao-grupos — formulario publico para inscricao em grupo de conexao.
//
// Acessado via QR code distribuido nos cultos / redes sociais durante
// periodo de inscricao. Usa o GrupoSelector em modo "full" (todos os
// filtros: lider, categoria, bairro, CEP, lista, mapa) e um form
// minimo de identificacao (nome, CPF, email, telefone, DOB).
//
// Submit: cria mem_cadastros_pendentes (se ainda nao for membro) +
// mem_grupo_pedidos com origem='formulario_publico'.
// ============================================================================

import { useState, useEffect, useMemo } from 'react';
import { gruposPublic } from '../../api';
import { LoginShapesBackground } from '../../components/ui/shape-landing-hero';
import GrupoSelector from '../../components/grupos/GrupoSelector';
import { CheckCircle2, ArrowLeft, Users } from 'lucide-react';

const TEXTO_CONSENTIMENTO = `Ao enviar este formulario, voce autoriza a CBRio a utilizar seus dados pessoais para fins de comunicacao com a igreja e participacao em grupo de conexao, conforme a LGPD.`;

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
  // Forca dark theme (consistente com outras paginas publicas)
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.getAttribute('data-theme');
    html.setAttribute('data-theme', 'dark');
    return () => { if (prev) html.setAttribute('data-theme', prev); else html.removeAttribute('data-theme'); };
  }, []);

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

  const [grupoEscolhido, setGrupoEscolhido] = useState(null);
  const [form, setForm] = useState({
    nome: '', cpf: '', email: '', telefone: '',
    data_nascimento: '', observacao: '', website: '',
  });
  const [aceitaTermos, setAceitaTermos] = useState(false);
  const [step, setStep] = useState(0); // 0=escolher grupo, 1=dados, 2=success
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  const set = (k, masked) => (e) => setForm(f => ({ ...f, [k]: masked ? masked(e.target.value) : e.target.value }));

  const formValido = () => {
    if (!form.nome || form.nome.trim().length < 3) return false;
    if (soDigitos(form.cpf).length !== 11) return false;
    if (soDigitos(form.telefone).length < 10) return false;
    if (!aceitaTermos) return false;
    return true;
  };

  const submit = async () => {
    if (!grupoEscolhido) { setError('Escolha um grupo primeiro.'); return; }
    if (!formValido()) { setError('Preencha os campos obrigatorios.'); return; }
    setLoading(true);
    setError('');
    try {
      await gruposPublic.inscrever({
        grupo_id: grupoEscolhido.id,
        nome: form.nome.trim(),
        cpf: soDigitos(form.cpf),
        email: form.email.trim() || null,
        telefone: form.telefone,
        data_nascimento: form.data_nascimento || null,
        observacao: form.observacao || null,
        aceita_termos: aceitaTermos,
        consentimento_texto: TEXTO_CONSENTIMENTO,
        website: form.website,
      });
      setStep(2);
    } catch (e) {
      setError(e.message || 'Nao foi possivel enviar. Tente novamente.');
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden', padding: '40px 16px', background: '#0a0a0a',
    }}>
      <LoginShapesBackground />

      <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 720 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: -0.5 }}>
            Entre em um Grupo de Conexão
          </h1>
          <p style={{ fontSize: 14, color: '#a3a3a3', marginTop: 8 }}>
            Encontre um grupo perto de você e seja recebido pelo líder.
          </p>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20, padding: 24, backdropFilter: 'blur(16px)',
        }}>
          {step === 2 ? (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <CheckCircle2 size={56} style={{ color: '#10b981', margin: '0 auto 16px' }} />
              <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Pedido enviado!</h2>
              <p style={{ color: '#a3a3a3', fontSize: 14, lineHeight: 1.6 }}>
                Seu pedido para entrar no grupo <strong style={{ color: '#fff' }}>{grupoEscolhido?.nome}</strong> foi
                enviado. O líder vai analisar e você receberá uma confirmação por
                {form.email ? ' e-mail' : ''}{form.telefone ? ' / WhatsApp' : ''} em breve.
              </p>
              <button onClick={() => window.location.reload()} style={{
                marginTop: 20, padding: '10px 24px', borderRadius: 10, background: '#00B39D', color: '#fff',
                border: 'none', fontWeight: 700, cursor: 'pointer',
              }}>
                Inscrever outra pessoa
              </button>
            </div>
          ) : step === 0 ? (
            <div>
              <h2 style={{ color: '#fff', fontSize: 16, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
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
              <h2 style={{ color: '#fff', fontSize: 16, fontWeight: 700, marginBottom: 4 }}>2. Seus dados</h2>
              <p style={{ color: '#a3a3a3', fontSize: 12, marginBottom: 16 }}>
                Para o grupo <strong style={{ color: '#fff' }}>{grupoEscolhido?.nome}</strong>
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
                <Field label="Nome completo *" value={form.nome} onChange={set('nome')} />
                <Field label="CPF *" value={form.cpf} onChange={set('cpf', mascaraCpf)} maxLength={14} inputMode="numeric" />
                <Field label="Celular / WhatsApp *" value={form.telefone} onChange={set('telefone', mascaraTelefone)} maxLength={16} inputMode="tel" />
                <Field label="E-mail (opcional)" type="email" value={form.email} onChange={set('email')} />
                <Field label="Data de nascimento (opcional)" type="date" value={form.data_nascimento} onChange={set('data_nascimento')} />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: '#a3a3a3', display: 'block', marginBottom: 4 }}>Mensagem para o líder (opcional)</label>
                <textarea value={form.observacao} onChange={set('observacao')} rows={2} maxLength={400}
                  placeholder="Por exemplo: 'Sou amigo do João e quero participar'..."
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)',
                    color: '#fff', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* honeypot */}
              <input type="text" value={form.website} onChange={set('website')} style={{ position: 'absolute', left: -9999, opacity: 0 }} tabIndex={-1} autoComplete="off" />

              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                <p style={{ fontSize: 11, color: '#a3a3a3', lineHeight: 1.5, margin: 0, marginBottom: 8 }}>{TEXTO_CONSENTIMENTO}</p>
                <label style={{ fontSize: 12, color: '#fff', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
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
    </div>
  );
}

function Field({ label, ...rest }) {
  return (
    <div>
      <label style={{ fontSize: 12, color: '#a3a3a3', display: 'block', marginBottom: 4 }}>{label}</label>
      <input {...rest} style={{
        width: '100%', padding: '9px 12px', borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)',
        color: '#fff', fontSize: 13, boxSizing: 'border-box',
      }} />
    </div>
  );
}
