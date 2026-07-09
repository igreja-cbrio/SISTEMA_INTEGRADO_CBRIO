// Página pública · confirmação de presença de um evento externo (Celebra etc.).
// Segue o layout dos outros formulários públicos (AnimatedBackground + tema).
// Se o evento tem sorteio, revela o "número da sorte" com confete.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { eventoPublico } from '../../api';
import AnimatedBackground from './AnimatedBackground';
import { usePublicTheme, PublicThemeToggle } from './publicTheme';

function soDigitos(v: string) { return (v || '').toString().replace(/\D+/g, ''); }
function mascaraTelefone(v: string) {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function dataLonga(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

function Field({ id, label, value, onChange, required, as = 'input', inputMode }: {
  id: string; label: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  required?: boolean; as?: 'input' | 'textarea'; inputMode?: any;
}) {
  const [focused, setFocused] = useState(false);
  const active = focused || (value && String(value).length > 0);
  const Tag: any = as;
  return (
    <div style={{ position: 'relative', marginBottom: 22 }}>
      <Tag
        id={id} name={id} value={value} inputMode={inputMode} rows={as === 'textarea' ? 3 : undefined}
        onChange={onChange} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} required={required}
        style={{
          display: 'block', width: '100%', padding: '10px 0', fontSize: 14, color: 'var(--cbrio-text)',
          background: 'transparent', border: 'none', borderBottom: `2px solid ${focused ? '#00B39D' : 'var(--cbrio-border)'}`,
          outline: 'none', resize: 'vertical', transition: 'border-color .2s',
        }}
      />
      <label htmlFor={id} style={{
        position: 'absolute', left: 0, pointerEvents: 'none', transition: 'all .2s',
        top: active ? -14 : 10, fontSize: active ? 11 : 14,
        color: focused ? '#00B39D' : 'var(--cbrio-text3)',
      }}>{label}{required ? ' *' : ''}</label>
    </div>
  );
}

// Lista suspensa (dropdown) · label flutuante + seta ▾.
function SelectFloat({ id, label, value, onChange, required, opcoes }: {
  id: string; label: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; required?: boolean; opcoes: string[];
}) {
  const [focused, setFocused] = useState(false);
  const active = focused || (value && String(value).length > 0);
  return (
    <div style={{ position: 'relative', marginBottom: 22 }}>
      <select id={id} name={id} value={value || ''} onChange={onChange} required={required}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{
          display: 'block', width: '100%', padding: '10px 0', fontSize: 14, color: 'var(--cbrio-text)',
          background: 'transparent', border: 'none', borderBottom: `2px solid ${focused ? '#00B39D' : 'var(--cbrio-border)'}`,
          outline: 'none', appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer', transition: 'border-color .2s',
        }}>
        <option value=""></option>
        {opcoes.map((o, i) => <option key={i} value={o} style={{ background: 'var(--cbrio-modal-bg)', color: 'var(--cbrio-text)' }}>{o}</option>)}
      </select>
      <label htmlFor={id} style={{ position: 'absolute', left: 0, pointerEvents: 'none', transition: 'all .2s', top: active ? -14 : 10, fontSize: active ? 11 : 14, color: focused ? '#00B39D' : 'var(--cbrio-text3)' }}>{label}{required ? ' *' : ''}</label>
      <span style={{ position: 'absolute', right: 4, bottom: 12, pointerEvents: 'none', color: 'var(--cbrio-text3)', fontSize: 12 }}>▾</span>
    </div>
  );
}

// Escolha em "pills" (botões clicáveis). multi=true permite marcar várias.
function PillSelect({ label, value, onPick, required, opcoes, multi }: {
  label: string; value: string; onPick: (v: string) => void; required?: boolean; opcoes: string[]; multi?: boolean;
}) {
  const sels = multi ? String(value || '').split(',').map(s => s.trim()).filter(Boolean) : [];
  const isSel = (o: string) => multi ? sels.includes(o) : value === o;
  function pick(o: string) {
    if (!multi) { onPick(o); return; }
    const novo = sels.includes(o) ? sels.filter(x => x !== o) : [...sels, o];
    onPick(novo.join(', '));
  }
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 13, color: 'var(--cbrio-text3)', marginBottom: 10 }}>{label}{required ? ' *' : ''}{multi ? ' (pode marcar mais de uma)' : ''}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {opcoes.map((o, i) => {
          const sel = isSel(o);
          return (
            <button key={i} type="button" onClick={() => pick(o)}
              style={{
                padding: '9px 15px', borderRadius: 999, fontSize: 13.5, cursor: 'pointer', lineHeight: 1.1,
                border: `1.5px solid ${sel ? '#00B39D' : 'var(--cbrio-border)'}`,
                background: sel ? 'linear-gradient(90deg,#00B39D,#00d9bd)' : 'transparent',
                color: sel ? '#fff' : 'var(--cbrio-text)', fontWeight: sel ? 700 : 500,
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
  const parse = (v: string) => { const s = String(v || ''); const i = s.indexOf(' · '); return i >= 0 ? [s.slice(0, i), s.slice(i + 3)] : ['', s]; };
  const [rede, setRede] = useState(() => parse(value)[0]);
  const [handle, setHandle] = useState(() => parse(value)[1]);
  const [foco, setFoco] = useState(false);
  function emit(r: string, h: string) {
    const v = r && h ? `${r} · ${h}` : (h || r || '');
    onChange(v);
  }
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 13, color: 'var(--cbrio-text3)', marginBottom: 10 }}>{label}{required ? ' *' : ''}</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '0 0 140px' }}>
          <select value={rede} onChange={e => { setRede(e.target.value); emit(e.target.value, handle); }}
            required={required}
            style={{ display: 'block', width: '100%', padding: '10px 0', fontSize: 14, color: 'var(--cbrio-text)', background: 'transparent', border: 'none', borderBottom: '2px solid var(--cbrio-border)', outline: 'none', appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' }}>
            <option value="">Rede…</option>
            {REDES_SOCIAIS.map((o, i) => <option key={i} value={o} style={{ background: 'var(--cbrio-modal-bg)', color: 'var(--cbrio-text)' }}>{o}</option>)}
          </select>
          <span style={{ position: 'absolute', right: 4, bottom: 12, pointerEvents: 'none', color: 'var(--cbrio-text3)', fontSize: 12 }}>▾</span>
        </div>
        <input value={handle} onChange={e => { setHandle(e.target.value); emit(rede, e.target.value); }}
          onFocus={() => setFoco(true)} onBlur={() => setFoco(false)} placeholder="@usuário ou link"
          style={{ flex: 1, minWidth: 160, padding: '10px 0', fontSize: 14, color: 'var(--cbrio-text)', background: 'transparent', border: 'none', borderBottom: `2px solid ${foco ? '#00B39D' : 'var(--cbrio-border)'}`, outline: 'none' }} />
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
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 13, color: 'var(--cbrio-text3)', marginBottom: 10 }}>{label}{required ? ' *' : ''}</div>
      {value ? (
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <img src={value} alt={label} style={{ maxHeight: 130, maxWidth: '100%', borderRadius: 12, border: '1px solid var(--cbrio-border)', display: 'block', background: '#fff' }} />
          <button type="button" onClick={() => onChange('')} aria-label="Remover imagem"
            style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: 999, width: 26, height: 26, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      ) : (
        <label style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textAlign: 'center',
          cursor: subindo ? 'default' : 'pointer', border: '1.5px dashed var(--cbrio-border)', borderRadius: 12,
          padding: '22px 14px', fontSize: 13.5, color: 'var(--cbrio-text3)',
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

export default function EventoExterno() {
  const { slug = '' } = useParams();
  const { C } = usePublicTheme();
  const [evento, setEvento] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [dados, setDados] = useState<Record<string, string>>({});
  const [website, setWebsite] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [subindoImg, setSubindoImg] = useState(0);
  const [resultado, setResultado] = useState<{ numero: number; jaInscrito?: boolean; temSorteio?: boolean } | null>(null);
  const marcarBusy = (b: boolean) => setSubindoImg(n => Math.max(0, n + (b ? 1 : -1)));

  useEffect(() => {
    eventoPublico.get(slug).then(setEvento).catch(e => setErro(e.message || 'Evento não encontrado')).finally(() => setCarregando(false));
  }, [slug]);

  function confete() {
    const cores = ['#00B39D', '#00d9bd', '#ffd166', '#ef476f', '#118ab2'];
    confetti({ particleCount: 110, spread: 75, startVelocity: 45, origin: { y: 0.6 }, colors: cores });
    setTimeout(() => confetti({ particleCount: 60, angle: 60, spread: 65, origin: { x: 0, y: 0.7 }, colors: cores }), 150);
    setTimeout(() => confetti({ particleCount: 60, angle: 120, spread: 65, origin: { x: 1, y: 0.7 }, colors: cores }), 150);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (nome.trim().length < 2) { setErro('Informe seu nome.'); return; }
    if (soDigitos(telefone).length < 10) { setErro('Informe um telefone válido (com DDD).'); return; }
    if (subindoImg > 0) { setErro('Aguarde o envio da imagem terminar.'); return; }
    for (const c of (evento?.campos || [])) {
      if (c.obrigatorio && !String(dados[c.key] || '').trim()) { setErro(`Preencha: ${c.label}`); return; }
    }
    setEnviando(true);
    try {
      const r = await eventoPublico.inscrever(slug, { nome, telefone, dados, website });
      setResultado({ numero: r.numero_sorte, jaInscrito: r.ja_inscrito, temSorteio: r.tem_sorteio });
      if (r.tem_sorteio) setTimeout(confete, 200);
    } catch (e: any) { setErro(e.message || 'Erro ao confirmar presença.'); }
    finally { setEnviando(false); }
  }

  const setCampo = (key: string) => (e: any) => setDados(d => ({ ...d, [key]: e.target.value }));

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden', padding: '40px 16px', background: C.pageBg,
    }}>
      <AnimatedBackground />
      <PublicThemeToggle />

      <div style={{
        position: 'relative', zIndex: 1, width: '100%', maxWidth: 560,
        background: C.card, backdropFilter: 'blur(24px)',
        border: `1px solid ${C.cardBorder}`, borderRadius: 20,
        padding: 'clamp(28px, 6vw, 40px) clamp(18px, 5vw, 36px)',
      }}>
        {evento?.capa_url && (
          <img src={evento.capa_url} alt={evento?.nome || 'capa'}
            style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 14, marginBottom: 20, display: 'block' }} />
        )}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          {!evento?.capa_url && <img src="/logo-cbrio-icon.png" alt="CBRio" style={{ width: 72, height: 72, marginBottom: 12, display: 'inline-block' }} />}
          {carregando ? (
            <p style={{ color: C.text3, fontSize: 14 }}>Carregando…</p>
          ) : erro && !evento ? (
            <p style={{ color: C.text3, fontSize: 14 }}>{erro}</p>
          ) : (
            <>
              <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: -0.5, background: 'linear-gradient(90deg, #00B39D, #00d9bd)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                {evento?.nome}
              </h1>
              {(dataLonga(evento?.data) || evento?.hora) && (
                <div style={{ display: 'inline-block', marginTop: 12, padding: '6px 16px', borderRadius: 999, background: 'rgba(0,179,157,0.12)', border: '1px solid rgba(0,179,157,0.3)', color: '#00B39D', fontSize: 14, fontWeight: 700 }}>
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
              {/* Texto de agradecimento: custom do evento (se houver) ou o padrão */}
              {evento.msg_sucesso_texto ? (
                <p style={{ fontSize: 13, color: C.text3, marginTop: 8, whiteSpace: 'pre-wrap' }}>{evento.msg_sucesso_texto}</p>
              ) : (
                <p style={{ fontSize: 13, color: C.text3, marginTop: 8 }}>
                  {resultado.jaInscrito ? 'Você já estava confirmado(a).' : resultado.temSorteio ? 'Anota aí o seu número da sorte:' : `Te esperamos${evento?.nome ? ` no ${evento.nome}` : ''}!`}
                </p>
              )}
              {resultado.temSorteio && (
                <>
                  <div style={{ marginTop: 12, fontSize: 13, color: '#00B39D', fontWeight: 600 }}>Seu número da sorte</div>
                  <div style={{ fontSize: 64, fontWeight: 800, color: '#00B39D', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{resultado.numero}</div>
                  <p style={{ fontSize: 12, color: C.text3, marginTop: 6 }}>Guarde este número — vale pro sorteio!</p>
                </>
              )}
            </div>
          ) : (evento.inscricoes_encerradas ?? !evento.form_ativo) ? (
            <p style={{ textAlign: 'center', color: C.text3, fontSize: 14, padding: '20px 0' }}>As inscrições deste evento estão encerradas.</p>
          ) : (
            <form onSubmit={enviar}>
              {erro && <div style={{ background: '#ef444418', border: '1px solid #ef444440', borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#ef4444' }}>{erro}</div>}
              <Field id="nome" label="Qual é o seu nome?" value={nome} onChange={e => setNome(e.target.value)} required />
              <Field id="telefone" label="WhatsApp" value={telefone} onChange={e => setTelefone(mascaraTelefone(e.target.value))} required inputMode="tel" />
              {(evento.campos || []).map((c: any) => (
                c.tipo === 'select' ? (
                  <SelectFloat key={c.key} id={c.key} label={c.label} value={dados[c.key] || ''} onChange={setCampo(c.key)} required={c.obrigatorio} opcoes={c.opcoes || []} />
                ) : (c.tipo === 'escolha' || c.tipo === 'multi') ? (
                  <PillSelect key={c.key} label={c.label} value={dados[c.key] || ''} required={c.obrigatorio} opcoes={c.opcoes || []} multi={c.tipo === 'multi'}
                    onPick={(v) => setDados(d => ({ ...d, [c.key]: v }))} />
                ) : c.tipo === 'rede_social' ? (
                  <RedeSocialField key={c.key} label={c.label} value={dados[c.key] || ''} required={c.obrigatorio}
                    onChange={(v) => setDados(d => ({ ...d, [c.key]: v }))} />
                ) : c.tipo === 'imagem' ? (
                  <ImagemField key={c.key} slug={slug} label={c.label} value={dados[c.key] || ''} required={c.obrigatorio}
                    onChange={(url) => setDados(d => ({ ...d, [c.key]: url }))} onBusy={marcarBusy} />
                ) : (
                  <Field key={c.key} id={c.key} label={c.label} value={dados[c.key] || ''} onChange={setCampo(c.key)}
                    required={c.obrigatorio} as={c.tipo === 'textarea' ? 'textarea' : 'input'}
                    inputMode={c.tipo === 'email' ? 'email' : undefined} />
                )
              ))}
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
