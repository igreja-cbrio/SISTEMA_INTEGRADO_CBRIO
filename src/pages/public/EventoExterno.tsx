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
import { useEffect, useMemo, useState } from 'react';
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
// Perguntas condicionais e bloco do responsável (17/08). ⚠️ Espelhos de
// backend/utils/* — a MESMA régua decide aqui e no servidor, e há teste no gate
// amarrando os dois. Não reimplementar nada disto na tela.
import { keysVisiveis } from '../../lib/camposCondicionais';
import { exigeResponsavel, PARENTESCOS } from '../../lib/inscricaoMenor';
import BaixarInstrucoes from './BaixarInstrucoes';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function dataLonga(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

// Evento de vários dias (retiro): "5 a 10 de fevereiro de 2027". Mesmo mês/ano
// não repete o resto; meses diferentes caem nas duas datas por extenso.
function periodoLongo(inicio?: string | null, fim?: string | null) {
  if (!inicio) return '';
  if (!fim || fim === inicio) return dataLonga(inicio);
  const d1 = new Date(inicio + 'T12:00:00');
  const d2 = new Date(fim + 'T12:00:00');
  if (d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear()) {
    return `${d1.getDate()} a ${d2.getDate()} de ${MESES[d1.getMonth()]} de ${d1.getFullYear()}`;
  }
  return `${dataLonga(inicio)} a ${dataLonga(fim)}`;
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
  // ⚠️ Fallback local; o canônico vem de `GET /textos` (services/inscricaoContrato)
  // e é o snapshot que fica gravado no consentimento. Este texto só cobre a rede
  // caindo antes de a tela carregar.
  menor_responsavel: 'Declaro que sou responsável legal pela pessoa inscrita, que ela é menor de 18 anos e que autorizo a inscrição e o tratamento dos dados dela pela Igreja CBRio para este evento, conforme a LGPD (art. 14).',
  aviso_optin: AVISO_OPTIN,
};

/**
 * Como o valor é apresentado antes de a pessoa preencher: as formas REAIS deste
 * evento, não uma frase fixa. Dizer "Pix, cartão ou boleto" num evento que só
 * aceita Pix é a tela prometendo o que o servidor vai recusar.
 */
function rotuloMetodos(evento: any): string {
  const m: string[] = Array.isArray(evento?.pagamento_metodos) ? evento.pagamento_metodos : [];
  const nomes: string[] = [];
  if (m.includes('pix')) nomes.push('Pix');
  if (m.includes('cartao')) {
    nomes.push(`cartão${evento?.parcelas_max > 1 ? ` (em até ${evento.parcelas_max}x)` : ''}`);
  }
  if (m.includes('boleto')) nomes.push('boleto');
  if (!nomes.length) return 'Pagamento online.';
  const lista = nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} ou ${nomes[nomes.length - 1]}`;
  return `Pagamento por ${lista}.`;
}

/**
 * A escolha da forma ANTES do formulário, quando o cartão foi terceirizado.
 *
 * ⚠️ Os dois caminhos são HONESTOS sobre o que acontece: "continua aqui" x "vai
 * para outro site". Botão que muda de site sem avisar é como a pessoa desiste no
 * meio — ela acha que errou o clique.
 *
 * ⚠️ `exclusivo` (não sobrou forma nossa) mostra UM botão só: perguntar entre
 * uma alternativa é atrito puro, e a resposta seria sempre a mesma.
 */
function EscolhaPagamento({ C, evento, onProprio }: { C: any; evento: any; onProprio: () => void }) {
  const ext = evento.checkout_externo;
  const so = !!ext?.exclusivo;
  const btn = (destaque: boolean) => ({
    display: 'block', width: '100%', textAlign: 'left' as const, cursor: 'pointer',
    padding: '14px 16px', borderRadius: 14, marginTop: 10,
    background: destaque ? '#00B39D14' : C.card,
    border: `1px solid ${destaque ? '#00B39D55' : C.cardBorder}`,
    color: C.text, font: 'inherit',
  });
  return (
    <div style={{ padding: '4px 0 8px' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Como você quer pagar?</div>
      <p style={{ fontSize: 13, color: C.text3, marginTop: 4, lineHeight: 1.5 }}>
        {so
          ? `A inscrição deste evento é feita pelo ${ext.nome}.`
          : 'A forma muda o lugar onde você preenche a inscrição — por isso a gente pergunta antes.'}
      </p>

      {/* Com lotes, o preço do Pix aparece JÁ NA ESCOLHA (pedido do Arthur:
          "a pessoa vê qual o lote atual e quanto está"). O valor do cartão é o
          da tabela do E-Inscrição, definido lá — prometer um número aqui seria
          afirmar preço de outra plataforma. */}
      {evento.lote_atual && (
        <div style={{
          marginTop: 12, padding: '8px 12px', borderRadius: 10, display: 'inline-block',
          background: '#00B39D12', border: '1px solid #00B39D33', fontSize: 12.5, color: C.text2,
        }}>
          <b style={{ color: '#00B39D' }}>{evento.lote_atual.nome}</b>
          {' · no Pix: '}
          <b style={{ color: '#00B39D' }}>
            {(evento.lote_atual.valor_centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </b>
        </div>
      )}

      {!so && (
        <button type="button" onClick={onProprio} style={btn(true)}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Pix</div>
          <div style={{ fontSize: 12.5, color: C.text3, marginTop: 2 }}>
            Você preenche a inscrição aqui e recebe o QR Code na hora.
          </div>
        </button>
      )}

      {/* ⚠️ Link de verdade (`<a>`), não window.open: o navegador mostra o
          destino no toque longo, e bloqueador de pop-up não engole a navegação.
          `rel="noopener"` porque a outra página não pode mexer nesta. */}
      <a href={ext.url} target="_blank" rel="noopener noreferrer" style={{ ...btn(so), textDecoration: 'none' }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Cartão de crédito</div>
        <div style={{ fontSize: 12.5, color: C.text3, marginTop: 2 }}>
          Sua inscrição é feita no {ext.nome} — você sai desta página e preenche por lá.
        </div>
      </a>

      <p style={{ fontSize: 11.5, color: C.text3, marginTop: 12, lineHeight: 1.5 }}>
        Quem se inscreve pelo {ext.nome} recebe a confirmação por lá.
      </p>
    </div>
  );
}

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
  // Bloco do responsável (só aparece pra menor de 18 em evento que pede) +
  // aceites próprios do evento. ⚠️ Quem decide se são obrigatórios é o SERVIDOR.
  const [resp, setResp] = useState<Record<string, string>>({});
  const [consentMenor, setConsentMenor] = useState(false);
  const [aceites, setAceites] = useState<Record<string, boolean>>({});
  const [textos, setTextos] = useState<any>(TEXTOS_FALLBACK);
  const [dados, setDados] = useState<Record<string, string>>({});
  const [website, setWebsite] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Forma escolhida ANTES do formulário, quando o cartão é cobrado por uma
  // plataforma externa (e-Inscrição). null = ainda não escolheu · 'proprio' =
  // escolheu pagar por aqui (o formulário abre). Quem escolhe cartão sai da
  // página, então não há um terceiro estado.
  const [formaPropria, setFormaPropria] = useState(false);
  const [subindoImg, setSubindoImg] = useState(0);
  const [resultado, setResultado] = useState<{ numero: number | null; jaInscrito?: boolean; temSorteio?: boolean; comprovanteToken?: string | null; isento?: boolean } | null>(null);
  const marcarBusy = (b: boolean) => setSubindoImg(n => Math.max(0, n + (b ? 1 : -1)));

  useEffect(() => {
    eventoPublico.get(slug).then(setEvento).catch(e => setErro(e.message || 'Evento não encontrado')).finally(() => setCarregando(false));
    eventoPublico.textos().then((t: any) => { if (t?.termos_lgpd) setTextos(t); }).catch(() => { /* fallback local */ });
  }, [slug]);

  // ⚠️ Visibilidade das perguntas condicionais — MESMA régua do servidor. Campo
  // escondido não é exigido e a resposta dele é DESCARTADA lá; aqui ele só não
  // aparece. Recalcula a cada resposta (é o que faz "Qual medicamento?" surgir
  // no instante em que a pessoa marca "Sim").
  const visiveis = useMemo(() => keysVisiveis(evento?.campos || [], dados), [evento?.campos, dados]);
  const camposVisiveis = (evento?.campos || []).filter((c: any) => c.key && visiveis.has(String(c.key)));
  const temCampoImagem = camposVisiveis.some((c: any) => c.tipo === 'imagem');
  // Bloco do responsável: evento marcado + nascimento de menor de 18 HOJE.
  const precisaResponsavel = exigeResponsavel(evento, nascimento);
  // ⚠️ Aceite `so_menor` aparece só junto do bloco do responsável — a MESMA
  // condição que o servidor usa. Exigir de adulto seria pedir que ele aceite um
  // termo sobre si mesmo como menor de idade.
  const termosEvento: any[] = (Array.isArray(evento?.termos_extra) ? evento.termos_extra : [])
    .filter((t: any) => !t.so_menor || precisaResponsavel);

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
    // Endereço é opcional por padrão; retiro/viagem ligam a exigência.
    if (evento?.exigir_endereco && !endereco.trim()) { setErro('Informe o endereço completo.'); return; }
    if (!aceitaTermos) { setErro('É preciso aceitar os termos para se inscrever.'); return; }
    if (subindoImg > 0) { setErro('Aguarde o envio da imagem terminar.'); return; }
    // ⚠️ Só os campos VISÍVEIS são exigidos — a MESMA régua do servidor. Exigir
    // pergunta escondida deixaria o formulário insubmissível.
    for (const c of camposVisiveis) {
      if (c.obrigatorio && !String(dados[c.key] || '').trim()) { setErro(`Preencha: ${c.label}`); return; }
    }
    if (precisaResponsavel) {
      if (!nomeCompletoValido(resp.nome || '')) { setErro('Informe o nome completo do responsável, sem abreviações.'); return; }
      if (!cpfValido(resp.cpf || '')) { setErro('Informe um CPF válido do responsável.'); return; }
      if (!String(resp.parentesco || '').trim()) { setErro('Informe o grau de parentesco com o menor.'); return; }
      if (!telefoneValido(resp.telefone || '')) { setErro('Informe o celular do responsável, com DDD.'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(resp.email || '').trim())) { setErro('Informe um e-mail válido do responsável.'); return; }
      if (!consentMenor) { setErro('É preciso a autorização do responsável para inscrever menor de idade.'); return; }
    }
    for (const t of termosEvento) {
      if (!aceites[t.chave]) { setErro(`É preciso aceitar: ${t.titulo || 'termo do evento'}.`); return; }
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
        // ⚠️ Só manda o bloco do responsável quando ele foi EXIBIDO: enviar
        // campos que a pessoa não viu (de um estado antigo, se ela corrigiu o
        // nascimento pra maior) gravaria contato de responsável em inscrição de
        // adulto. Quem decide se é obrigatório continua sendo o servidor.
        ...(precisaResponsavel ? {
          responsavel_nome: (resp.nome || '').trim(),
          responsavel_cpf: soDigitos(resp.cpf || ''),
          responsavel_parentesco: (resp.parentesco || '').trim(),
          responsavel_telefone: resp.telefone || '',
          responsavel_email: (resp.email || '').trim(),
          responsavel_autoriza_batismo: resp.autoriza_batismo || undefined,
          consent_menor: consentMenor,
        } : {}),
        // Aceites próprios do evento, na chave estável de cada termo.
        ...(termosEvento.length ? {
          aceites: Object.fromEntries(termosEvento.map((t) => [t.chave, !!aceites[t.chave]])),
        } : {}),
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
      setResultado({
        numero: r.numero_sorte, jaInscrito: r.ja_inscrito, temSorteio: r.tem_sorteio,
        comprovanteToken: r.comprovante_token || null,
        // Evento PAGO em que este CPF tinha gratuidade autorizada: caiu aqui (e
        // não na tela de pagamento) porque não há nada a pagar. Sem dizer isso,
        // a pessoa ficaria esperando um link que não vem.
        isento: r.beneficio === 'integral',
      });
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
              {(periodoLongo(evento?.data, evento?.data_fim) || evento?.hora) && (
                <div style={{ display: 'inline-block', marginTop: 10, padding: '6px 16px', borderRadius: 999, background: 'rgba(0,179,157,0.12)', border: '1px solid rgba(0,179,157,0.3)', color: '#00B39D', fontSize: 14, fontWeight: 700 }}>
                  {[periodoLongo(evento?.data, evento?.data_fim), evento?.hora].filter(Boolean).join(' · ')}
                </div>
              )}
              {evento?.local && <p style={{ fontSize: 13, color: C.text3, marginTop: 8 }}>{evento.local}</p>}
              {evento?.descricao && <p style={{ fontSize: 13, color: C.text3, marginTop: 8, lineHeight: 1.5, whiteSpace: 'pre-line' }}>{evento.descricao}</p>}
              {/* Grupo de dúvidas (21/08): fica no CABEÇALHO de propósito —
                  aparece na escolha Pix×cartão, no formulário e na tela de
                  sucesso, que dividem esta página. Link real (<a>), nova aba. */}
              {evento?.whatsapp_duvidas && (
                <a href={evento.whatsapp_duvidas} target="_blank" rel="noopener noreferrer" style={{
                  display: 'inline-block', marginTop: 10, padding: '7px 14px', borderRadius: 999,
                  background: 'rgba(37,211,102,0.10)', border: '1px solid rgba(37,211,102,0.35)',
                  color: '#1da851', fontSize: 12.5, fontWeight: 700, textDecoration: 'none',
                }}>
                  Dúvidas? Entre no grupo do WhatsApp
                </a>
              )}
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
              {resultado.isento && (
                <p style={{ fontSize: 13, color: '#00B39D', fontWeight: 600, marginTop: 8 }}>
                  Sua inscrição foi liberada pela liderança — você não precisa pagar nada.
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
              {/* Instruções gerais do evento — a inscrição CONCLUIU (este bloco
                  só existe na tela de sucesso; quem foi pagar recebe o mesmo
                  convite na página de pagamento, quando o Pix confirma). */}
              <BaixarInstrucoes instrucoes={evento.instrucoes} C={C} />
            </div>
          ) : (evento.inscricoes_encerradas ?? !evento.form_ativo) ? (
            <p style={{ textAlign: 'center', color: C.text3, fontSize: 14, padding: '20px 0' }}>{evento.aviso || 'As inscrições deste evento estão encerradas.'}</p>
          ) : evento.checkout_externo && !formaPropria ? (
            /* ⚠️ A PERGUNTA VEM ANTES DO FORMULÁRIO (pedido do Matheus · 11/08):
               quem vai pagar no cartão se inscreve na OUTRA plataforma, então
               pedir CPF, nascimento e endereço aqui seria coletar dado de gente
               que não vai se inscrever aqui — e ainda deixaria a pessoa preencher
               tudo pra só no fim descobrir que precisa recomeçar lá fora. */
            <EscolhaPagamento
              C={C}
              evento={evento}
              onProprio={() => setFormaPropria(true)}
            />
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
                  <div style={{ fontSize: 12, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    {evento.lote_atual ? `Valor da inscrição · ${evento.lote_atual.nome}` : 'Valor da inscrição'}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#00B39D', marginTop: 2 }}>
                    {(evento.valor_centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                  {/* O lote vira SOZINHO quando as vagas dele esgotam — dizer
                      quanto falta e quanto vai custar depois é o que faz a
                      pessoa entender por que o preço de hoje é este. */}
                  {evento.lote_atual?.proximo && (
                    <p style={{ fontSize: 12, color: C.text3, margin: '6px 0 0', lineHeight: 1.5 }}>
                      {typeof evento.lote_atual.restantes_no_lote === 'number'
                        ? `Restam ${evento.lote_atual.restantes_no_lote} inscrições neste valor — depois vai a `
                        : 'Quando este lote esgotar, o valor vai a '}
                      {(evento.lote_atual.proximo.valor_centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      {` (${evento.lote_atual.proximo.nome})`}.
                    </p>
                  )}
                  <div style={{ fontSize: 12, color: C.text3, marginTop: 4 }}>
                    {rotuloMetodos(evento)}
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
                <Field id="endereco"
                  label={evento.exigir_endereco ? 'Endereço completo' : 'Endereço (opcional)'}
                  value={endereco} onChange={e => setEndereco(e.target.value)}
                  required={!!evento.exigir_endereco} span={!!evento.exigir_endereco} />

                {/* Campos específicos deste evento (form-builder) ·
                    ⚠️ só os VISÍVEIS pela régua condicional — a mesma do servidor. */}
                {camposVisiveis.map((c: any) => (
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

              {/* Bloco do RESPONSÁVEL — aparece só quando o nascimento informado
                  é de menor de 18 e o evento pede (LGPD art. 14 §1º).
                  ⚠️ A tela DIZ por que apareceu: um bloco de 6 campos surgindo do
                  nada depois de digitar a data se lê como bug. */}
              {precisaResponsavel && (
                <div style={{
                  marginTop: 18, padding: '14px 16px', borderRadius: 14,
                  background: '#f59e0b12', border: '1px solid #f59e0b40',
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Dados do responsável</div>
                  <p style={{ fontSize: 12.5, color: C.text3, marginTop: 4, lineHeight: 1.5 }}>
                    A data de nascimento informada é de menor de 18 anos, então precisamos dos dados de
                    quem é responsável legal — é ele quem autoriza a inscrição e quem procuramos em caso
                    de emergência.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12, marginTop: 12 }}>
                    <Field id="resp_nome" label="Nome completo do responsável" required span
                      value={resp.nome || ''} onChange={e => setResp(r => ({ ...r, nome: e.target.value }))} />
                    <Field id="resp_cpf" label="CPF do responsável" required inputMode="numeric" maxLength={14}
                      value={resp.cpf || ''} onChange={e => setResp(r => ({ ...r, cpf: mascaraCpf(e.target.value) }))} />
                    <SelectBox id="resp_parentesco" label="Grau de parentesco com o menor" required
                      opcoes={Array.isArray(evento.parentescos) && evento.parentescos.length ? evento.parentescos : PARENTESCOS}
                      value={resp.parentesco || ''} onChange={e => setResp(r => ({ ...r, parentesco: e.target.value }))} />
                    <Field id="resp_telefone" label="Celular do responsável" required inputMode="tel" maxLength={16}
                      value={resp.telefone || ''} onChange={e => setResp(r => ({ ...r, telefone: mascaraTelefone(e.target.value) }))} />
                    <Field id="resp_email" label="E-mail do responsável" required inputMode="email"
                      value={resp.email || ''} onChange={e => setResp(r => ({ ...r, email: e.target.value }))} />
                    {/* Autorização de batismo · NÃO é obrigatória: a pergunta é
                        sobre INTERESSE em batizar, e quem não pretende não
                        precisa responder. Sem resposta ≠ autorizado. */}
                    <PillSelect label="Se o menor quiser se batizar no evento, você autoriza?"
                      opcoes={['Sim', 'Não']} value={resp.autoriza_batismo || ''}
                      onPick={(v) => setResp(r => ({ ...r, autoriza_batismo: v }))} />
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <ConsentBox checked={consentMenor} onChange={setConsentMenor}>
                      <b style={{ color: C.text }}>Autorização do responsável *</b><br />
                      {textos.menor_responsavel || TEXTOS_FALLBACK.menor_responsavel}
                    </ConsentBox>
                  </div>
                </div>
              )}

              {/* Consentimentos (Contrato de Inscrição) */}
              <div style={{ marginTop: 18 }}>
                <ConsentBox checked={aceitaTermos} onChange={setAceitaTermos}>
                  <b style={{ color: C.text }}>Li e aceito os termos *</b><br />{textos.termos_lgpd}
                </ConsentBox>
                {temCampoImagem && (
                  <ConsentBox checked={consentImagem} onChange={setConsentImagem}>{textos.imagem}</ConsentBox>
                )}
                {/* Aceites PRÓPRIOS do evento (regulamento, termo de
                    responsabilidade). Todos obrigatórios — a lista existe pra o
                    que a igreja precisa que a pessoa leia; aceite opcional não
                    prova nada. O link abre em nova aba pra não perder o
                    formulário preenchido. */}
                {termosEvento.map((t: any) => (
                  <ConsentBox key={t.chave} checked={!!aceites[t.chave]}
                    onChange={(v) => setAceites(a => ({ ...a, [t.chave]: v }))}>
                    <b style={{ color: C.text }}>Confirmo que li e aceito: {t.titulo} *</b><br />
                    {t.texto}
                    {t.url ? (
                      <>
                        {' '}
                        <a href={t.url} target="_blank" rel="noreferrer" style={{ color: '#00B39D', textDecoration: 'underline' }}>
                          Ler o documento completo
                        </a>
                      </>
                    ) : null}
                  </ConsentBox>
                ))}

                <ConsentBox checked={optin} onChange={setOptin}>
                  📲 <b style={{ color: C.text }}>Quero receber avisos deste evento no WhatsApp</b><br />
                  {textos.aviso_optin || AVISO_OPTIN}
                </ConsentBox>

                {/* Só em evento PAGO: em evento gratuito não há o que reembolsar,
                    e o link viraria ruído. O CDC exige informação PRÉVIA — por
                    isso o link fica ANTES do botão de enviar, não na tela de
                    sucesso. Abre em nova aba pra não perder o formulário
                    preenchido. */}
                {evento?.pagamento_ativo && (
                  <p style={{ fontSize: 12.5, color: C.text3, margin: '10px 0 0', lineHeight: 1.5 }}>
                    Inscrição paga. Antes de continuar, veja como funcionam
                    cancelamento e devolução na{' '}
                    <a href="/politica-reembolso" target="_blank" rel="noreferrer"
                      style={{ color: '#00B39D', textDecoration: 'underline' }}>
                      Política de Reembolso
                    </a>.
                  </p>
                )}
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
