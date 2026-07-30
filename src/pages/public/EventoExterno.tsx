// Página pública · confirmação de presença de um evento (espinha + Celebra/ext).
// Se o evento tem sorteio, revela o "número da sorte" com confete.
//
// PORTA 1 do Contrato de Inscrição (F3.1 · docs/modulo-inscricoes/): campos
// padrão fixos (nome completo, WhatsApp, CPF, e-mail, nascimento, sexo;
// endereço opcional) + termos LGPD + opt-in explícito (D4) + consentimento de
// imagem quando o evento tem campo de foto. Validações vêm de src/lib/inscricao
// (fonte única — não recriar máscaras locais). O texto dos termos vem do
// backend (GET /textos) — o snapshot gravado é sempre o canônico.
//
// Layout no MODELO DO GRUPOS (pedido do Marcos 28/07): campos em caixa com
// label em cima, grid lado a lado (auto-fit 220px), cartão 720px, fonte 16
// nos inputs (anti-zoom iOS) e container 100dvh + margin auto (fix do iPhone).
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import confetti from 'canvas-confetti';
import QRCode from 'qrcode';
import { eventoPublico } from '../../api';
import AnimatedBackground from './AnimatedBackground';
import { usePublicTheme, PublicThemeToggle } from './publicTheme';
import { BirthDatePicker } from '../../components/ui/birth-date-picker';
import { DatePicker } from '../../components/ui/date-picker';
import {
  soDigitos, mascaraTelefone, mascaraCpf, cpfValido, telefoneValido,
  nomeCompletoValido, temAbreviacaoNome, validarNascimento, SEXOS, AVISO_OPTIN,
} from '../../lib/inscricao';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function dataLonga(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

const SPAN: React.CSSProperties = { gridColumn: '1 / -1' };

// Caixa padrão dos inputs (modelo do Grupos · ≥16px evita o zoom do iOS)
function boxStyle(C: any, focused: boolean): React.CSSProperties {
  return {
    width: '100%', padding: '10px 12px', borderRadius: 8, boxSizing: 'border-box',
    border: `1px solid ${focused ? '#00B39D' : C.inputBorder}`,
    background: C.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
    color: C.text, fontSize: 16, outline: 'none', transition: 'border-color .15s',
  };
}

function Rotulo({ children }: { children: React.ReactNode }) {
  const { C } = usePublicTheme();
  return <label style={{ fontSize: 12, color: C.text3, display: 'block', marginBottom: 4 }}>{children}</label>;
}

function Field({ id, label, value, onChange, required, as = 'input', inputMode, maxLength, span }: {
  id: string; label: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  required?: boolean; as?: 'input' | 'textarea'; inputMode?: any; maxLength?: number; span?: boolean;
}) {
  const { C } = usePublicTheme();
  const [focused, setFocused] = useState(false);
  const Tag: any = as;
  return (
    <div style={span ? SPAN : undefined}>
      <Rotulo>{label}{required ? ' *' : ''}</Rotulo>
      <Tag id={id} name={id} value={value} inputMode={inputMode} maxLength={maxLength}
        rows={as === 'textarea' ? 3 : undefined}
        onChange={onChange} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} required={required}
        style={{ ...boxStyle(C, focused), resize: as === 'textarea' ? 'vertical' : undefined }} />
    </div>
  );
}

// Lista suspensa (dropdown) em caixa, com seta ▾.
function SelectBox({ id, label, value, onChange, required, opcoes }: {
  id: string; label: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; required?: boolean; opcoes: string[];
}) {
  const { C } = usePublicTheme();
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <Rotulo>{label}{required ? ' *' : ''}</Rotulo>
      <div style={{ position: 'relative' }}>
        <select id={id} name={id} value={value || ''} onChange={onChange} required={required}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{ ...boxStyle(C, focused), appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer', paddingRight: 28 }}>
          <option value="">Selecione…</option>
          {opcoes.map((o, i) => <option key={i} value={o} style={{ background: 'var(--cbrio-modal-bg)', color: 'var(--cbrio-text)' }}>{o}</option>)}
        </select>
        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: C.text3, fontSize: 12 }}>▾</span>
      </div>
    </div>
  );
}

// Escolha em "pills" (botões clicáveis). multi=true permite marcar várias.
function PillSelect({ label, value, onPick, required, opcoes, multi }: {
  label: string; value: string; onPick: (v: string) => void; required?: boolean; opcoes: string[]; multi?: boolean;
}) {
  const { C } = usePublicTheme();
  const sels = multi ? String(value || '').split(',').map(s => s.trim()).filter(Boolean) : [];
  const isSel = (o: string) => multi ? sels.includes(o) : value === o;
  function pick(o: string) {
    if (!multi) { onPick(o); return; }
    const novo = sels.includes(o) ? sels.filter(x => x !== o) : [...sels, o];
    onPick(novo.join(', '));
  }
  return (
    <div style={SPAN}>
      <Rotulo>{label}{required ? ' *' : ''}{multi ? ' (pode marcar mais de uma)' : ''}</Rotulo>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {opcoes.map((o, i) => {
          const sel = isSel(o);
          return (
            <button key={i} type="button" onClick={() => pick(o)}
              style={{
                padding: '9px 15px', borderRadius: 999, fontSize: 13.5, cursor: 'pointer', lineHeight: 1.1,
                border: `1.5px solid ${sel ? '#00B39D' : C.inputBorder}`,
                background: sel ? 'linear-gradient(90deg,#00B39D,#00d9bd)' : 'transparent',
                color: sel ? '#fff' : C.text, fontWeight: sel ? 700 : 500,
                boxShadow: sel ? '0 4px 14px rgba(0,179,157,0.35)' : 'none', transition: 'all .15s',
              }}>{o}</button>
          );
        })}
      </div>
    </div>
  );
}

// Rede social · dropdown da rede + campo do @/handle, combinados numa string
// "Rede · @handle" guardada numa única chave de `dados`.
const REDES_SOCIAIS = ['Instagram', 'Facebook', 'X (Twitter)', 'TikTok', 'YouTube', 'LinkedIn', 'Kwai', 'Outra'];
function RedeSocialField({ label, value, onChange, required }: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean;
}) {
  const { C } = usePublicTheme();
  const parse = (v: string) => { const s = String(v || ''); const i = s.indexOf(' · '); return i >= 0 ? [s.slice(0, i), s.slice(i + 3)] : ['', s]; };
  const [rede, setRede] = useState(() => parse(value)[0]);
  const [handle, setHandle] = useState(() => parse(value)[1]);
  const [foco, setFoco] = useState(false);
  function emit(r: string, h: string) {
    const v = r && h ? `${r} · ${h}` : (h || r || '');
    onChange(v);
  }
  return (
    <div style={SPAN}>
      <Rotulo>{label}{required ? ' *' : ''}</Rotulo>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '0 0 150px' }}>
          <select value={rede} onChange={e => { setRede(e.target.value); emit(e.target.value, handle); }} required={required}
            style={{ ...boxStyle(C, false), appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer', paddingRight: 26 }}>
            <option value="">Rede…</option>
            {REDES_SOCIAIS.map((o, i) => <option key={i} value={o} style={{ background: 'var(--cbrio-modal-bg)', color: 'var(--cbrio-text)' }}>{o}</option>)}
          </select>
          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: C.text3, fontSize: 12 }}>▾</span>
        </div>
        <input value={handle} onChange={e => { setHandle(e.target.value); emit(rede, e.target.value); }}
          onFocus={() => setFoco(true)} onBlur={() => setFoco(false)} placeholder="@usuário ou link"
          style={{ ...boxStyle(C, foco), flex: 1, minWidth: 160, width: undefined }} />
      </div>
    </div>
  );
}

// Campo de upload de imagem (ex.: logo da empresa parceira). Sobe pro Storage
// via endpoint público e guarda a URL; avisa o pai enquanto está enviando pra
// travar o "Confirmar" até terminar.
function ImagemField({ slug, label, value, onChange, onBusy, required }: {
  slug: string; label: string; value: string;
  onChange: (url: string) => void; onBusy: (busy: boolean) => void; required?: boolean;
}) {
  const { C } = usePublicTheme();
  const [subindo, setSubindo] = useState(false);
  const [erroLocal, setErroLocal] = useState('');
  async function enviar(file?: File) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setErroLocal('Imagem muito grande (máximo 5MB).'); return; }
    setErroLocal(''); setSubindo(true); onBusy(true);
    try { const r: any = await eventoPublico.uploadImagem(slug, file); onChange(r.url); }
    catch (e: any) { setErroLocal(e?.message || 'Erro ao enviar a imagem.'); }
    finally { setSubindo(false); onBusy(false); }
  }
  return (
    <div style={SPAN}>
      <Rotulo>{label}{required ? ' *' : ''}</Rotulo>
      {value ? (
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <img src={value} alt={label} style={{ maxHeight: 130, maxWidth: '100%', borderRadius: 12, border: `1px solid ${C.inputBorder}`, display: 'block', background: '#fff' }} />
          <button type="button" onClick={() => onChange('')} aria-label="Remover imagem"
            style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: 999, width: 26, height: 26, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      ) : (
        <label style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textAlign: 'center',
          cursor: subindo ? 'default' : 'pointer', border: `1.5px dashed ${C.inputBorder}`, borderRadius: 12,
          padding: '22px 14px', fontSize: 13.5, color: C.text3,
        }}>
          {subindo ? 'Enviando…' : '📷 Enviar imagem (PNG, JPG, WEBP)'}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={subindo}
            style={{ display: 'none' }} onChange={e => enviar(e.target.files?.[0])} />
        </label>
      )}
      {erroLocal && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>{erroLocal}</div>}
    </div>
  );
}

// Sexo em 2 botões-caixa (contrato: sempre e somente masculino/feminino · D8)
function SexoBox({ value, onPick }: { value: string; onPick: (v: string) => void }) {
  const { C } = usePublicTheme();
  return (
    <div>
      <Rotulo>Sexo *</Rotulo>
      <div style={{ display: 'flex', gap: 8 }}>
        {SEXOS.map((o) => {
          const sel = value === o;
          return (
            <button key={o} type="button" onClick={() => onPick(o)} aria-pressed={sel}
              style={{
                flex: 1, minHeight: 42, padding: '9px 10px', borderRadius: 8, fontSize: 13.5, cursor: 'pointer',
                border: `1px solid ${sel ? '#00B39D' : C.inputBorder}`,
                background: sel ? 'rgba(0,179,157,0.12)' : (C.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
                color: sel ? '#00B39D' : C.text, fontWeight: sel ? 700 : 500,
                textTransform: 'capitalize', transition: 'all .15s',
              }}>{o}</button>
          );
        })}
      </div>
    </div>
  );
}

// Checkbox de consentimento (termos / imagem / opt-in) com texto pequeno.
function ConsentBox({ checked, onChange, children }: {
  checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode;
}) {
  const { C } = usePublicTheme();
  return (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ marginTop: 3, width: 16, height: 16, accentColor: '#00B39D', flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: C.text3, lineHeight: 1.5 }}>{children}</span>
    </label>
  );
}

// QR do comprovante de inscrição (SPEC-06) — codifica a URL pública
// /i/c/<token>, que a pessoa reabre quando quiser e a portaria escaneia no
// check-in do evento. Fundo branco de propósito (QR de leitura é sempre
// nítido, mesma regra dos QRs de impressão).
function ComprovanteQr({ token }: { token: string }) {
  const { C } = usePublicTheme();
  const [qr, setQr] = useState('');
  const url = `${window.location.origin}/i/c/${token}`;
  useEffect(() => {
    QRCode.toDataURL(url, { width: 480, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
      .then(setQr).catch(() => {});
  }, [url]);
  if (!qr) return null;
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 13, color: '#00B39D', fontWeight: 700 }}>Seu comprovante de inscrição</div>
      <div style={{ display: 'inline-block', background: '#fff', padding: 10, borderRadius: 12, marginTop: 8 }}>
        <img src={qr} alt="QR do comprovante de inscrição" style={{ width: 168, height: 168, display: 'block' }} />
      </div>
      <p style={{ fontSize: 12, color: C.text3, marginTop: 8, lineHeight: 1.5 }}>
        Apresente este QR na entrada do evento. Salve uma captura de tela ou guarde o link:
      </p>
      <a href={url} style={{ fontSize: 12, color: '#00B39D', fontWeight: 600, wordBreak: 'break-all' }}>{url}</a>
    </div>
  );
}

const TEXTOS_FALLBACK = {
  termos_lgpd: 'Autorizo a Igreja CBRio a tratar os dados deste formulário para organizar esta atividade e me comunicar sobre ela, conforme a LGPD.',
  imagem: 'Autorizo o uso de fotos do evento em que eu apareça nas mídias da Igreja CBRio.',
  aviso_optin: AVISO_OPTIN,
};

export default function EventoExterno() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { C } = usePublicTheme();
  const [evento, setEvento] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [nomeCompleto, setNomeCompleto] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [sexo, setSexo] = useState('');
  const [endereco, setEndereco] = useState('');
  const [aceitaTermos, setAceitaTermos] = useState(false);
  const [optin, setOptin] = useState(false);
  const [consentImagem, setConsentImagem] = useState(false);
  const [textos, setTextos] = useState<any>(TEXTOS_FALLBACK);
  const [dados, setDados] = useState<Record<string, string>>({});
  const [website, setWebsite] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [subindoImg, setSubindoImg] = useState(0);
  const [resultado, setResultado] = useState<{ numero: number | null; jaInscrito?: boolean; temSorteio?: boolean; comprovanteToken?: string | null } | null>(null);
  const marcarBusy = (b: boolean) => setSubindoImg(n => Math.max(0, n + (b ? 1 : -1)));

  useEffect(() => {
    eventoPublico.get(slug).then(setEvento).catch(e => setErro(e.message || 'Evento não encontrado')).finally(() => setCarregando(false));
    eventoPublico.textos().then((t: any) => { if (t?.termos_lgpd) setTextos(t); }).catch(() => { /* fallback local */ });
  }, [slug]);

  const temCampoImagem = (evento?.campos || []).some((c: any) => c.tipo === 'imagem');

  function confete() {
    const cores = ['#00B39D', '#00d9bd', '#ffd166', '#ef476f', '#118ab2'];
    confetti({ particleCount: 110, spread: 75, startVelocity: 45, origin: { y: 0.6 }, colors: cores });
    setTimeout(() => confetti({ particleCount: 60, angle: 60, spread: 65, origin: { x: 0, y: 0.7 }, colors: cores }), 150);
    setTimeout(() => confetti({ particleCount: 60, angle: 120, spread: 65, origin: { x: 1, y: 0.7 }, colors: cores }), 150);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (!nomeCompletoValido(nomeCompleto)) {
      setErro(temAbreviacaoNome(nomeCompleto) ? 'Escreva o nome completo, sem abreviações.' : 'Informe seu nome completo.');
      return;
    }
    if (!telefoneValido(telefone)) { setErro('Informe um telefone válido (com DDD).'); return; }
    if (!cpfValido(cpf)) { setErro('Informe um CPF válido.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErro('Informe um e-mail válido.'); return; }
    if (!validarNascimento(nascimento)) { setErro('Informe sua data de nascimento.'); return; }
    if (!SEXOS.includes(sexo)) { setErro('Selecione o sexo.'); return; }
    if (!aceitaTermos) { setErro('É preciso aceitar os termos para se inscrever.'); return; }
    if (subindoImg > 0) { setErro('Aguarde o envio da imagem terminar.'); return; }
    for (const c of (evento?.campos || [])) {
      if (c.obrigatorio && !String(dados[c.key] || '').trim()) { setErro(`Preencha: ${c.label}`); return; }
    }
    setEnviando(true);
    try {
      const r = await eventoPublico.inscrever(slug, {
        nome_completo: nomeCompleto.trim(),
        telefone, cpf: soDigitos(cpf), email: email.trim(),
        data_nascimento: nascimento, sexo,
        endereco: endereco.trim() || null,
        aceita_termos: aceitaTermos,
        whatsapp_optin: optin,
        consent_imagem: temCampoImagem ? consentImagem : undefined,
        dados, website,
      });
      // Evento PAGO: a vaga ficou reservada e a pessoa escolhe como pagar na
      // NOSSA tela — Pix e boleto ali mesmo, cartão no checkout do Asaas (é o
      // único que precisa sair, porque número de cartão não passa pelo nosso
      // domínio). Antes isto mandava direto pro `checkout_url`; sair do domínio
      // no meio do fluxo derruba conversão e a pessoa perdia o link ao fechar a
      // aba — a tela `/pagamento/:token` é endereçável e ela pode voltar.
      // ⚠️ Sem confete e sem "presença confirmada" aqui — nada de comemoração
      // antes de o servidor dizer `pago`.
      if (r.pagamento) {
        navigate(`/pagamento/${r.public_token}`);
        return;
      }
      setResultado({ numero: r.numero_sorte, jaInscrito: r.ja_inscrito, temSorteio: r.tem_sorteio, comprovanteToken: r.comprovante_token || null });
      if (r.tem_sorteio) setTimeout(confete, 200);
    } catch (e: any) { setErro(e.message || 'Erro ao confirmar presença.'); }
    finally { setEnviando(false); }
  }

  const setCampo = (key: string) => (e: any) => setDados(d => ({ ...d, [key]: e.target.value }));

  return (
    <div style={{
      // 100dvh + rolagem livre + cartão via margin:auto (mesmo fix do Grupos —
      // o antigo 100vh + alignItems:center cortava o rodapé no iPhone).
      minHeight: '100dvh', display: 'flex', position: 'relative',
      padding: 'clamp(20px, 5vw, 40px) clamp(10px, 3vw, 16px)',
      paddingBottom: 'calc(clamp(20px, 5vw, 40px) + env(safe-area-inset-bottom, 0px))',
      background: C.pageBg,
    }}>
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <AnimatedBackground />
      </div>
      <PublicThemeToggle />

      <div style={{
        position: 'relative', zIndex: 1, width: '100%', maxWidth: 720, margin: 'auto',
        background: C.card, backdropFilter: 'blur(24px)',
        border: `1px solid ${C.cardBorder}`, borderRadius: 20,
        padding: 'clamp(20px, 4.5vw, 32px) clamp(16px, 4vw, 28px)',
      }}>
        {evento?.capa_url && (
          <img src={evento.capa_url} alt={evento?.nome || 'capa'}
            style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 14, marginBottom: 18, display: 'block' }} />
        )}
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          {!evento?.capa_url && <img src="/logo-cbrio-icon.png" alt="CBRio" style={{ width: 64, height: 64, marginBottom: 10, display: 'inline-block' }} />}
          {carregando ? (
            <p style={{ color: C.text3, fontSize: 14 }}>Carregando…</p>
          ) : erro && !evento ? (
            <p style={{ color: C.text3, fontSize: 14 }}>{erro}</p>
          ) : (
            <>
              <h1 style={{ fontSize: 'clamp(22px, 6vw, 27px)', fontWeight: 800, margin: 0, letterSpacing: -0.5, background: 'linear-gradient(90deg, #00B39D, #00d9bd)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                {evento?.nome}
              </h1>
              {(dataLonga(evento?.data) || evento?.hora) && (
                <div style={{ display: 'inline-block', marginTop: 10, padding: '6px 16px', borderRadius: 999, background: 'rgba(0,179,157,0.12)', border: '1px solid rgba(0,179,157,0.3)', color: '#00B39D', fontSize: 14, fontWeight: 700 }}>
                  {[dataLonga(evento?.data), evento?.hora].filter(Boolean).join(' · ')}
                </div>
              )}
              {evento?.local && <p style={{ fontSize: 13, color: C.text3, marginTop: 8 }}>{evento.local}</p>}
              {evento?.descricao && <p style={{ fontSize: 13, color: C.text3, marginTop: 8, lineHeight: 1.5, whiteSpace: 'pre-line' }}>{evento.descricao}</p>}
            </>
          )}
        </div>

        {!carregando && evento && (
          resultado ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', background: '#00B39D18', border: '1px solid #00B39D40', borderRadius: 14 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#00B39D', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, marginBottom: 14 }}>&#10003;</div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>{evento.msg_sucesso_titulo || 'Presença confirmada!'}</h2>
              {/* Re-inscrição SEMPRE avisada — a mensagem custom do evento não
                  pode suprimir o "você já estava confirmado" (a pessoa precisa
                  saber que não criou uma inscrição nova). */}
              {resultado.jaInscrito && (
                <p style={{ fontSize: 13, color: '#00B39D', fontWeight: 600, marginTop: 8 }}>
                  Você já estava confirmado(a) — atualizamos seus dados.
                </p>
              )}
              {/* Texto de agradecimento: custom do evento (se houver) ou o padrão */}
              {evento.msg_sucesso_texto ? (
                <p style={{ fontSize: 13, color: C.text3, marginTop: 8, whiteSpace: 'pre-wrap' }}>{evento.msg_sucesso_texto}</p>
              ) : (
                <p style={{ fontSize: 13, color: C.text3, marginTop: 8 }}>
                  {resultado.jaInscrito ? null : resultado.temSorteio ? 'Anota aí o seu número da sorte:' : `Te esperamos${evento?.nome ? ` no ${evento.nome}` : ''}!`}
                </p>
              )}
              {/* Bloco do número só quando o número EXISTE — no empate de
                  corrida/linha sem sorte o server pode devolver null, e
                  "Seu número da sorte" vazio é pior que nada. */}
              {resultado.temSorteio && resultado.numero != null && (
                <>
                  <div style={{ marginTop: 12, fontSize: 13, color: '#00B39D', fontWeight: 600 }}>Seu número da sorte</div>
                  <div style={{ fontSize: 64, fontWeight: 800, color: '#00B39D', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{resultado.numero}</div>
                  <p style={{ fontSize: 12, color: C.text3, marginTop: 6 }}>Guarde este número — vale pro sorteio!</p>
                </>
              )}
              {resultado.temSorteio && resultado.numero == null && (
                <p style={{ fontSize: 12, color: C.text3, marginTop: 10 }}>
                  Seu número da sorte já foi gerado na sua primeira inscrição — se não anotou, procure a equipe no dia do evento.
                </p>
              )}
              {resultado.comprovanteToken && <ComprovanteQr token={resultado.comprovanteToken} />}
            </div>
          ) : (evento.inscricoes_encerradas ?? !evento.form_ativo) ? (
            <p style={{ textAlign: 'center', color: C.text3, fontSize: 14, padding: '20px 0' }}>{evento.aviso || 'As inscrições deste evento estão encerradas.'}</p>
          ) : (
            <form onSubmit={enviar}>
              {/* Vagas limitadas: mostrar ANTES de preencher. A conferência que
                  vale é a do servidor (dentro do lock) — aqui é só aviso, então
                  pode ficar 1 ou 2 vagas defasado num lançamento movimentado. */}
              {typeof evento.vagas_restantes === 'number' && (
                <div style={{
                  marginBottom: 16, padding: '8px 14px', borderRadius: 999, display: 'inline-block',
                  fontSize: 12.5, fontWeight: 600,
                  background: evento.vagas_restantes <= 10 ? '#f59e0b18' : '#00B39D18',
                  border: `1px solid ${evento.vagas_restantes <= 10 ? '#f59e0b40' : '#00B39D40'}`,
                  color: evento.vagas_restantes <= 10 ? '#b45309' : '#00B39D',
                }}>
                  {evento.vagas_restantes === 1
                    ? 'Última vaga!'
                    : `Restam ${evento.vagas_restantes} vagas`}
                </div>
              )}
              {/* Evento pago: o valor aparece ANTES de a pessoa preencher. */}
              {evento.pagamento_ativo && evento.valor_centavos > 0 && (
                <div style={{
                  marginBottom: 16, padding: '12px 14px', borderRadius: 12,
                  background: '#00B39D12', border: '1px solid #00B39D33',
                }}>
                  <div style={{ fontSize: 12, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Valor da inscrição</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#00B39D', marginTop: 2 }}>
                    {(evento.valor_centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                  <div style={{ fontSize: 12, color: C.text3, marginTop: 4 }}>
                    Pagamento por Pix, cartão{evento.parcelas_max > 1 ? ` (em até ${evento.parcelas_max}x)` : ''} ou boleto.
                    {' '}Ao enviar, você vai para a página de pagamento.
                  </div>
                  {evento.pagamento_expira_horas > 0 && (
                    <div style={{ fontSize: 12, color: '#b45309', marginTop: 4 }}>
                      {/* Prazo explícito: a vaga fica reservada e depois volta pra fila. */}
                      Sua vaga fica reservada por {evento.pagamento_expira_horas}h até o pagamento.
                    </div>
                  )}
                </div>
              )}
              {erro && <div style={{ background: '#ef444418', border: '1px solid #ef444440', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#ef4444' }}>{erro}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12 }}>
                {/* Campos padrão do contrato (fixos em todo formulário · ordem do Grupos) */}
                <Field id="nome_completo" label="Nome completo (sem abreviar)" value={nomeCompleto} onChange={e => setNomeCompleto(e.target.value)} required />
                <Field id="telefone" label="Celular / WhatsApp" value={telefone} onChange={e => setTelefone(mascaraTelefone(e.target.value))} required inputMode="tel" maxLength={16} />
                <div>
                  <Rotulo>Data de nascimento *</Rotulo>
                  <BirthDatePicker value={nascimento} onChange={setNascimento} placeholder="dia/mês/ano" />
                </div>
                <SexoBox value={sexo} onPick={setSexo} />
                <Field id="cpf" label="CPF" value={cpf} onChange={e => setCpf(mascaraCpf(e.target.value))} required inputMode="numeric" maxLength={14} />
                <Field id="email" label="E-mail" value={email} onChange={e => setEmail(e.target.value)} required inputMode="email" />
                <Field id="endereco" label="Endereço (opcional)" value={endereco} onChange={e => setEndereco(e.target.value)} />

                {/* Campos específicos deste evento (form-builder) */}
                {(evento.campos || []).map((c: any) => (
                  c.tipo === 'select' ? (
                    <SelectBox key={c.key} id={c.key} label={c.label} value={dados[c.key] || ''} onChange={setCampo(c.key)} required={c.obrigatorio} opcoes={c.opcoes || []} />
                  ) : (c.tipo === 'escolha' || c.tipo === 'multi') ? (
                    <PillSelect key={c.key} label={c.label} value={dados[c.key] || ''} required={c.obrigatorio} opcoes={c.opcoes || []} multi={c.tipo === 'multi'}
                      onPick={(v) => setDados(d => ({ ...d, [c.key]: v }))} />
                  ) : c.tipo === 'rede_social' ? (
                    <RedeSocialField key={c.key} label={c.label} value={dados[c.key] || ''} required={c.obrigatorio}
                      onChange={(v) => setDados(d => ({ ...d, [c.key]: v }))} />
                  ) : c.tipo === 'imagem' ? (
                    <ImagemField key={c.key} slug={slug} label={c.label} value={dados[c.key] || ''} required={c.obrigatorio}
                      onChange={(url) => setDados(d => ({ ...d, [c.key]: url }))} onBusy={marcarBusy} />
                  ) : c.tipo === 'data' ? (
                    // Tipo 'data' do form-builder ganhou renderização própria
                    // (P3 do sweep 28/07 — caía no input de texto livre e a
                    // resposta vinha em qualquer formato). Grava ISO YYYY-MM-DD.
                    <div key={c.key}>
                      <Rotulo>{c.label}{c.obrigatorio ? ' *' : ''}</Rotulo>
                      <DatePicker value={dados[c.key] || ''} onChange={(v) => setDados(d => ({ ...d, [c.key]: v }))} placeholder="dia/mês/ano" />
                    </div>
                  ) : (
                    <Field key={c.key} id={c.key} label={c.label} value={dados[c.key] || ''} onChange={setCampo(c.key)}
                      required={c.obrigatorio} as={c.tipo === 'textarea' ? 'textarea' : 'input'} span={c.tipo === 'textarea'}
                      inputMode={c.tipo === 'email' ? 'email' : c.tipo === 'numero' ? 'numeric' : undefined} />
                  )
                ))}
              </div>

              {/* Consentimentos (Contrato de Inscrição) */}
              <div style={{ marginTop: 18 }}>
                <ConsentBox checked={aceitaTermos} onChange={setAceitaTermos}>
                  <b style={{ color: C.text }}>Li e aceito os termos *</b><br />{textos.termos_lgpd}
                </ConsentBox>
                {temCampoImagem && (
                  <ConsentBox checked={consentImagem} onChange={setConsentImagem}>{textos.imagem}</ConsentBox>
                )}
                <ConsentBox checked={optin} onChange={setOptin}>
                  📲 <b style={{ color: C.text }}>Quero receber avisos deste evento no WhatsApp</b><br />
                  {textos.aviso_optin || AVISO_OPTIN}
                </ConsentBox>
              </div>

              <input value={website} onChange={e => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" style={{ display: 'none' }} aria-hidden="true" />
              <button type="submit" disabled={enviando || subindoImg > 0} style={{
                width: '100%', marginTop: 8, padding: '13px', borderRadius: 12,
                background: (enviando || subindoImg > 0) ? '#00B39D80' : 'linear-gradient(90deg, #00B39D, #00d9bd)',
                color: '#fff', fontSize: 15, fontWeight: 700, border: 'none', cursor: (enviando || subindoImg > 0) ? 'default' : 'pointer',
              }}>{enviando ? 'Enviando…' : subindoImg > 0 ? 'Aguarde a imagem…' : 'Confirmar presença'}</button>
            </form>
          )
        )}
      </div>
    </div>
  );
}
