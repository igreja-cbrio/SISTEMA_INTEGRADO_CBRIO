// Página PÚBLICA standalone (fora do AppShell/ProtectedRoute · sem login).
// Aberta pelo QR dos CARTAZES espalhados pela igreja (lounge, banheiro,
// estacionamento, templo) — `?local=` diz de qual cartaz a pessoa veio.
//
// O que ela faz: registra a VISITA (nome + WhatsApp + CPF), entrega o VOUCHER
// da cafeteria na tela, e — se a pessoa marcar o opt-in — a pesquisa de
// satisfação chega no WhatsApp depois do culto. A pessoa também entra na lista
// de Próximos passos do Cuidados etiquetada como visitante.
//
// ⚠️ NÃO é decisão de fé e NÃO é cadastro de membresia: pede só o mínimo
// (Contrato de porta: formulário mínimo, funil padronizado no servidor). O CPF
// existe pra "não pegar o voucher duas vezes", e o texto diz isso.
//
// ⚠️ LAYOUT: segue o padrão das outras portas públicas (AnimatedBackground +
// publicTheme + card de vidro + campo com label flutuante) — o mesmo da
// DecisaoOnline, a pedido do Matheus (27/08).
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { visitantePublico } from '../../api';
import AnimatedBackground from './AnimatedBackground';
import { usePublicTheme, PublicThemeToggle } from './publicTheme';
import { mascaraCpf, mascaraTelefone, cpfValido } from '@/lib/inscricao';

type Culto = { id?: string; nome: string; data: string };
type Contexto = {
  ok: boolean;
  local: { id: string; nome: string; chamada: string } | null;
  culto: Culto | null;
  ao_vivo: boolean;
  textos: { lgpd: string; whatsapp: string };
};
type Resultado = {
  ok: boolean;
  repetida_hoje: boolean;
  nome: string;
  voucher: { codigo: string | null; status: 'emitido' | 'resgatado' | 'repetido' };
  culto: Culto | null;
  pesquisa?: 'depois_do_culto' | 'sem_optin';
};

/** Campo com label flutuante · o mesmo padrão das outras portas públicas. */
function Field({
  id, label, value, onChange, type = 'text', autoComplete, inputMode, maxLength, ajuda,
}: {
  id: string; label: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string; autoComplete?: string;
  inputMode?: 'numeric' | 'tel' | 'text'; maxLength?: number; ajuda?: string;
}) {
  const [focused, setFocused] = useState(false);
  const active = focused || String(value || '').length > 0;
  return (
    <div style={{ position: 'relative', marginBottom: ajuda ? 8 : 20 }}>
      <input
        id={id} name={id} type={type} value={value}
        autoComplete={autoComplete} inputMode={inputMode} maxLength={maxLength}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          display: 'block', width: '100%', padding: '12px 0',
          fontSize: 16, color: 'var(--cbrio-text)',
          background: 'transparent', border: 'none',
          borderBottom: `2px solid ${focused ? '#00B39D' : 'var(--cbrio-border)'}`,
          outline: 'none', transition: 'border-color 0.3s',
          boxSizing: 'border-box', fontFamily: 'inherit',
        }}
      />
      <label htmlFor={id} style={{
        position: 'absolute', left: 0, top: active ? -6 : 12,
        fontSize: active ? 11 : 15, color: active ? '#00B39D' : 'var(--cbrio-text3)',
        transition: 'all 0.2s', pointerEvents: 'none',
      }}>
        {label}
      </label>
    </div>
  );
}

const TEXTO_LGPD_PADRAO =
  'Autorizo a Igreja CBRio a guardar meu nome, CPF e WhatsApp para registrar minha visita, ' +
  'entregar o voucher da cafeteria e para que a equipe de integração fale comigo, conforme a LGPD. ' +
  'O CPF é usado só para não emitir o voucher duas vezes. Posso pedir acesso, correção ou exclusão ' +
  'dos meus dados a qualquer momento pelos canais da igreja.';
const TEXTO_OPTIN_PADRAO =
  'Aceito receber, pelo WhatsApp informado, uma pesquisa rápida de satisfação sobre o culto de hoje ' +
  'e mensagens da equipe de integração. Posso pedir para parar a qualquer momento.';

export default function VisitantePublico() {
  const [params] = useSearchParams();
  const localParam = params.get('local') || '';
  const { C } = usePublicTheme();

  const [ctx, setCtx] = useState<Contexto | null>(null);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cpf, setCpf] = useState('');
  const [aceite, setAceite] = useState(false);
  const [optin, setOptin] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    document.title = 'Bem-vindo à CBRio · registre sua visita';
    visitantePublico.contexto(localParam)
      .then((r: Contexto) => setCtx(r))
      .catch(() => setCtx(null)); // sem contexto o formulário funciona igual
  }, [localParam]);

  const textos = ctx?.textos || { lgpd: TEXTO_LGPD_PADRAO, whatsapp: TEXTO_OPTIN_PADRAO };

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (nome.trim().length < 2) return setErro('Por favor, informe seu nome.');
    const tel = telefone.replace(/\D/g, '');
    if (tel.length < 10 || tel.length > 11) return setErro('Informe seu WhatsApp com DDD (10 ou 11 dígitos).');
    const cpfDigitos = cpf.replace(/\D/g, '');
    if (cpfDigitos.length !== 11) return setErro('Informe o CPF com 11 dígitos.');
    if (!cpfValido(cpfDigitos)) return setErro('Esse CPF não é válido — confira os números.');
    if (!aceite) return setErro('Para registrar, marque o aceite do tratamento dos seus dados.');
    setEnviando(true);
    try {
      const r: Resultado = await visitantePublico.registrar({
        nome: nome.trim(), telefone: tel, cpf: cpfDigitos,
        aceite_lgpd: true, whatsapp_optin: optin, local: localParam || undefined,
      });
      setResultado(r);
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível registrar agora. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  const pagina: React.CSSProperties = {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative', overflow: 'hidden', padding: '40px 16px', background: C.pageBg,
  };
  const cartao: React.CSSProperties = {
    position: 'relative', zIndex: 1, width: '100%', maxWidth: 480,
    background: C.card, backdropFilter: 'blur(24px)',
    border: `1px solid ${C.cardBorder}`, borderRadius: 20,
    padding: 'clamp(28px, 6vw, 40px) clamp(18px, 5vw, 36px)',
  };
  const botao: React.CSSProperties = {
    width: '100%', padding: '15px 16px', fontSize: 17, fontWeight: 700,
    color: '#fff', background: '#00B39D', border: 'none', borderRadius: 12,
    marginTop: 20, cursor: enviando ? 'wait' : 'pointer', opacity: enviando ? 0.7 : 1,
  };
  const titulo: React.CSSProperties = {
    fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.5,
    background: 'linear-gradient(90deg, #00B39D, #00d9bd)',
    WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
  };

  // ── tela do VOUCHER ──────────────────────────────────────────────────────
  if (resultado) {
    const v = resultado.voucher;
    const temCodigo = v.status === 'emitido' && v.codigo;
    const jaResgatado = v.status === 'resgatado';
    return (
      <div style={pagina}>
        <AnimatedBackground />
        <PublicThemeToggle />
        <div style={{ ...cartao, textAlign: 'center' }}>
          <div style={{ fontSize: 52 }}>☕</div>
          <h1 style={{ ...titulo, fontSize: 26, margin: '12px 0 8px' }}>
            {temCodigo ? `Seu café está garantido, ${resultado.nome}!` : `Que bom te ver, ${resultado.nome}!`}
          </h1>

          {temCodigo && (
            <>
              <p style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--cbrio-text)' }}>
                Mostre este código na <strong>cafeteria</strong> e retire seu voucher.
              </p>
              <div style={{
                margin: '18px auto 8px', padding: '16px 20px', borderRadius: 16, maxWidth: 300,
                background: 'rgba(0,179,157,0.12)', border: '2px dashed rgba(0,179,157,0.6)',
                fontSize: 38, fontWeight: 900, letterSpacing: 6, color: '#00B39D', fontFamily: 'ui-monospace, monospace',
              }}>
                {v.codigo}
              </div>
              <p style={{ fontSize: 12, color: C.text3 }}>
                Vale uma vez. Tire um print ou deixe esta tela aberta.
              </p>
            </>
          )}

          {v.status === 'repetido' && (
            <p style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--cbrio-text)' }}>
              Sua visita foi registrada. O voucher da cafeteria é um presente de
              <strong> primeira visita</strong> — e o seu já foi entregue numa visita anterior.
              Que alegria ter você de volta!
            </p>
          )}

          {jaResgatado && (
            <p style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--cbrio-text)' }}>
              Sua visita de hoje já estava registrada e o voucher já foi retirado. Aproveite o culto!
            </p>
          )}

          {resultado.repetida_hoje && temCodigo && (
            <p style={{ fontSize: 12.5, color: C.text3, marginTop: 8 }}>
              Você já tinha registrado hoje — este é o mesmo código.
            </p>
          )}

          <div style={{
            marginTop: 22, padding: '12px 14px', borderRadius: 12, textAlign: 'left',
            background: 'rgba(0,179,157,0.06)', border: `1px solid ${C.cardBorder}`,
            fontSize: 13, lineHeight: 1.55, color: C.text2,
          }}>
            {resultado.pesquisa === 'depois_do_culto' ? (
              <>Depois do culto vamos te mandar no WhatsApp uma pergunta rápida: <strong>como foi sua experiência hoje?</strong> Leva 10 segundos.</>
            ) : (
              <>Alguém da nossa equipe de integração vai falar com você nos próximos dias. Seja muito bem-vindo!</>
            )}
          </div>

          {resultado.culto && (
            <p style={{ fontSize: 12, color: C.text3, marginTop: 16 }}>
              {resultado.culto.nome} · {String(resultado.culto.data || '').split('-').reverse().join('/')}
            </p>
          )}
          <p style={{ fontSize: 12, color: C.text3, marginTop: 10 }}>Comunidade Batista do Rio · cbrio.com.br</p>
        </div>
      </div>
    );
  }

  // ── formulário ───────────────────────────────────────────────────────────
  return (
    <div style={pagina}>
      <AnimatedBackground />
      <PublicThemeToggle />
      <div style={cartao}>
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <img src="/logo-cbrio-icon.png" alt="CBRio"
            style={{ width: 72, height: 72, marginBottom: 12, display: 'inline-block' }} />
          <h1 style={titulo}>Primeira vez aqui?</h1>
          <p style={{ fontSize: 13.5, color: C.text3, marginTop: 8, lineHeight: 1.6 }}>
            {ctx?.local?.chamada || 'Registre sua visita e ganhe um café por nossa conta.'}{' '}
            Deixe seu contato e <strong style={{ color: '#00B39D' }}>retire seu voucher na cafeteria</strong>.
          </p>
          {ctx?.culto && ctx.ao_vivo && (
            <div style={{
              display: 'inline-block', marginTop: 14, padding: '8px 16px', borderRadius: 12,
              background: 'rgba(0,179,157,0.12)', border: '1px solid rgba(0,179,157,0.3)',
              color: '#00B39D', fontSize: 13, fontWeight: 600,
            }}>
              {ctx.culto.nome}
            </div>
          )}
        </div>

        <form onSubmit={enviar}>
          <Field id="nome" label="Seu nome" value={nome}
            onChange={(e) => setNome(e.target.value)} autoComplete="name" />
          <Field id="telefone" label="Seu WhatsApp (com DDD)" value={telefone}
            onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
            type="tel" autoComplete="tel" inputMode="numeric" />
          <Field id="cpf" label="CPF" value={cpf}
            onChange={(e) => setCpf(mascaraCpf(e.target.value))}
            inputMode="numeric" maxLength={14} ajuda="sim" />
          <p style={{ fontSize: 11.5, color: C.text3, margin: '0 0 20px', lineHeight: 1.5 }}>
            O CPF serve só para o voucher não ser emitido duas vezes. Não fazemos nada além disso com ele.
          </p>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12.5, lineHeight: 1.5, color: C.text3, cursor: 'pointer', marginBottom: 12 }}>
            <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)}
              style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0, accentColor: '#00B39D' }} />
            <span>{textos.lgpd}</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12.5, lineHeight: 1.5, color: C.text3, cursor: 'pointer' }}>
            <input type="checkbox" checked={optin} onChange={(e) => setOptin(e.target.checked)}
              style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0, accentColor: '#00B39D' }} />
            <span>{textos.whatsapp}</span>
          </label>

          {erro && <p style={{ color: '#ef4444', fontSize: 14, marginTop: 12 }}>{erro}</p>}
          <button style={botao} type="submit" disabled={enviando}>
            {enviando ? 'Registrando…' : 'Registrar minha visita e pegar o voucher'}
          </button>
        </form>

        <p style={{ fontSize: 12, color: C.text3, marginTop: 22, textAlign: 'center' }}>
          Comunidade Batista do Rio · cbrio.com.br
        </p>
      </div>
    </div>
  );
}
