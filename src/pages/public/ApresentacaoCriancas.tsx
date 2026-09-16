// Formulário público · Apresentação de Crianças (2º domingo do mês).
//
// PORTA 2 do Contrato de Inscrição (F3.1 · docs/modulo-inscricoes/): por
// criança pede nome completo + data de nascimento + sexo; do responsável pede
// pai/mãe (ao menos um), WhatsApp, CPF, e-mail e endereço opcional; e como é
// PII de MENOR, o consentimento específico do responsável (LGPD art. 14 §1º)
// é obrigatório + consentimento de imagem opcional + opt-in explícito (D4).
// Validações de src/lib/inscricao (fonte única). Os textos exibidos vêm do
// backend (GET /textos) — o snapshot gravado é sempre o canônico.
import { useEffect, useRef, useState } from 'react';
import { apresentacaoCriancasPublico } from '../../api';
import { AVISO_PAIS_IGUAIS, exigeConfirmacaoPaisIguais } from '../../lib/apresentacaoPais';
import AnimatedBackground from './AnimatedBackground';
import { usePublicTheme, PublicThemeToggle } from './publicTheme';
import { BirthDatePicker } from '../../components/ui/birth-date-picker';
import {
  soDigitos, mascaraTelefone, mascaraCpf, cpfValido, telefoneValido,
  nomeCompletoValido, temAbreviacaoNome, validarNascimento, SEXOS, AVISO_OPTIN,
} from '../../lib/inscricao';

function Field({
  id, label, value, onChange, required, placeholder, as = 'input', rows, autoComplete, inputMode,
}: {
  id: string; label: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  required?: boolean; placeholder?: string;
  as?: 'input' | 'textarea'; rows?: number;
  autoComplete?: string; inputMode?: any;
}) {
  const [focused, setFocused] = useState(false);
  const active = focused || (value !== undefined && value !== null && String(value).length > 0);
  const Tag: any = as;
  return (
    <div style={{ position: 'relative', marginBottom: 20 }}>
      <Tag
        id={id} name={id}
        type={as === 'input' ? 'text' : undefined}
        value={value} rows={rows}
        autoComplete={autoComplete} inputMode={inputMode}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        required={required}
        placeholder={placeholder && !active ? '' : ''}
        style={{
          display: 'block', width: '100%',
          padding: as === 'textarea' ? '14px 0 8px' : '10px 0',
          fontSize: 14, color: 'var(--cbrio-text)',
          background: 'transparent', border: 'none',
          borderBottom: `2px solid ${focused ? '#00B39D' : 'var(--cbrio-border)'}`,
          outline: 'none', transition: 'border-color 0.3s',
          boxSizing: 'border-box', fontFamily: 'inherit',
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

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
      {children}
    </div>
  );
}

// Sexo da criança em 2 pills (contrato: sempre e somente masculino/feminino)
function SexoMini({ value, onPick }: { value: string; onPick: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {SEXOS.map((o) => {
        const sel = value === o;
        return (
          <button key={o} type="button" onClick={() => onPick(o)} aria-pressed={sel}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 999, fontSize: 12.5, cursor: 'pointer',
              border: `1.5px solid ${sel ? '#00B39D' : 'var(--cbrio-border)'}`,
              background: sel ? 'linear-gradient(90deg,#00B39D,#00d9bd)' : 'transparent',
              color: sel ? '#fff' : 'var(--cbrio-text)', fontWeight: sel ? 700 : 500,
              textTransform: 'capitalize', transition: 'all .15s', whiteSpace: 'nowrap',
            }}>{o}</button>
        );
      })}
    </div>
  );
}

function ConsentBox({ checked, onChange, children }: {
  checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ marginTop: 3, width: 16, height: 16, accentColor: '#00B39D', flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: 'var(--cbrio-text3)', lineHeight: 1.5 }}>{children}</span>
    </label>
  );
}

const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function formatDataLonga(iso: string) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return `${d.getDate()} de ${MESES_PT[d.getMonth()]} de ${d.getFullYear()}`;
}

const TEXTOS_FALLBACK = {
  menor_responsavel: 'Declaro que sou pai, mãe ou responsável legal da(s) criança(s) e autorizo o tratamento dos dados dela(s) pela Igreja CBRio para a apresentação de crianças, conforme a LGPD (art. 14).',
  imagem: 'Autorizo o uso de fotos do evento em que a criança sob minha responsabilidade apareça nas mídias da Igreja CBRio.',
  aviso_optin: AVISO_OPTIN,
};

type Crianca = {
  nome: string; nascimento: string; sexo: string;
  // FOTO pro telão (16/09/2026): `fotoPath` é o que viaja no envio; o resto
  // só existe na tela. `fotoPreview` é objectURL — revogado ao trocar/remover.
  fotoPath?: string | null; fotoPreview?: string | null;
  fotoEnviando?: boolean; fotoErro?: string | null;
};

export default function ApresentacaoCriancas() {
  const { C } = usePublicTheme();
  const [proximaData, setProximaData] = useState('');
  // Culto previsto pra próxima inscrição (9h30 até o limite, depois 11h30) e o
  // definitivo que veio na resposta do envio. Nulo ⇒ o texto é omitido.
  const [horarioPrevisto, setHorarioPrevisto] = useState<string | null>(null);
  const [horarioFinal, setHorarioFinal] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome_pai: '', nome_mae: '', telefone: '', cpf_responsavel: '', cpf_outro: '', email: '', endereco: '',
    website: '', // honeypot
  });
  const [criancas, setCriancas] = useState<Crianca[]>([{ nome: '', nascimento: '', sexo: '' }]);
  const [aceitaTermos, setAceitaTermos] = useState(false);
  const [consentImagem, setConsentImagem] = useState(false);
  const [optin, setOptin] = useState(false);
  const [textos, setTextos] = useState<any>(TEXTOS_FALLBACK);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // ⚠⚠ 15/09/2026 · mesmo nome em pai e mãe AVISA e deixa seguir (era bloqueio).
  // O "já confirmei" vive num REF, não em estado: o botão de confirmar chama
  // requestSubmit() na sequência, e o estado ainda não teria comitado — a
  // validação leria o valor velho e o painel reabriria em loop.
  const [confirmarPais, setConfirmarPais] = useState(false);
  const paisOkRef = useRef(false);
  // ⚠️ De quem é o CPF (16/09). 'mae' é o padrão porque é o que o sistema já
  // assumia — quem tem o CPF do pai agora diz, em vez de o código adivinhar.
  const [cpfDe, setCpfDe] = useState<'pai' | 'mae'>('mae');
  const [mostrarCpf2, setMostrarCpf2] = useState(false);
  // ⚠️⚠️ O 'já confirmei' vive num REF, não em estado: em estado o painel
  // reabre em loop a cada render (a lição do aviso de pai==mãe, 15/09).
  const [confirmarUmResp, setConfirmarUmResp] = useState(false);
  const umRespOkRef = useRef(false);
  // Quem foi informado. DERIVADO de `form` — estado paralelo aqui dessincroniza
  // do campo e o aviso passaria a falar de um preenchimento que não é o atual.
  const temPai = Boolean(form.nome_pai.trim());
  const temMae = Boolean(form.nome_mae.trim());
  const formRef = useRef<HTMLFormElement>(null);
  const [sent, setSent] = useState(false);
  const [avisoJaInscritas, setAvisoJaInscritas] = useState<string[]>([]);

  const setCriancaCampo = (i: number, k: keyof Crianca, v: string) => {
    setCriancas(cs => cs.map((c, idx) => (idx === i ? { ...c, [k]: v } : c)));
  };
  // ── FOTO pro telão do culto (16/09/2026) ──────────────────────────────────
  // ⚠️ Sobe NA HORA da escolha, não no envio: a inscrição ainda não existe, e
  // fazer a mãe esperar o upload de 8MB depois de apertar "Enviar" é onde as
  // pessoas desistem. O que viaja no envio é só o CAMINHO devolvido aqui.
  // ⚠️ Falha de foto NUNCA derruba a inscrição — vira recado no campo e a
  // família segue sem foto.
  const escolherFoto = async (i: number, file: File | null | undefined) => {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setCriancas(cs => cs.map((c, idx) => (idx === i
      ? { ...c, fotoPreview: preview, fotoPath: null, fotoErro: null, fotoEnviando: true }
      : c)));
    try {
      const r: any = await apresentacaoCriancasPublico.enviarFoto(file);
      setCriancas(cs => cs.map((c, idx) => (idx === i
        ? { ...c, fotoPath: r?.foto_path || null, fotoEnviando: false }
        : c)));
    } catch (e: any) {
      URL.revokeObjectURL(preview);
      setCriancas(cs => cs.map((c, idx) => (idx === i
        ? { ...c, fotoPreview: null, fotoPath: null, fotoEnviando: false, fotoErro: e?.message || 'Não conseguimos enviar a foto.' }
        : c)));
    }
  };
  const removerFoto = (i: number) => setCriancas(cs => cs.map((c, idx) => {
    if (idx !== i) return c;
    if (c.fotoPreview) URL.revokeObjectURL(c.fotoPreview);
    return { ...c, fotoPreview: null, fotoPath: null, fotoEnviando: false, fotoErro: null };
  }));

  const addCrianca = () => setCriancas(cs => [...cs, { nome: '', nascimento: '', sexo: '' }]);
  const removeCrianca = (i: number) => setCriancas(cs => {
    if (cs.length <= 1) return cs;
    // ⚠️ Tirar a criança da lista também solta o objectURL do preview dela —
    // senão o blob fica preso na aba até a pessoa sair da página.
    const alvo = cs[i];
    if (alvo && alvo.fotoPreview) URL.revokeObjectURL(alvo.fotoPreview);
    return cs.filter((_, idx) => idx !== i);
  });

  useEffect(() => {
    apresentacaoCriancasPublico.proximaData()
      .then((r: { data_apresentacao: string; horario_previsto_rotulo?: string | null }) => {
        setProximaData(r.data_apresentacao);
        setHorarioPrevisto(r.horario_previsto_rotulo || null);
      })
      .catch(() => {});
    apresentacaoCriancasPublico.textos()
      .then((t: any) => { if (t?.menor_responsavel) setTextos(t); })
      .catch(() => { /* fallback local */ });
  }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    let v = e.target.value;
    if (k === 'telefone') v = mascaraTelefone(v);
    if (k === 'cpf_responsavel' || k === 'cpf_outro') v = mascaraCpf(v);
    // Mudou o nome de um dos dois? A confirmação anterior deixa de valer — senão
    // trocar para OUTRO par igual passaria sem a pessoa ver o aviso de novo.
    if (k === 'nome_pai' || k === 'nome_mae') {
      paisOkRef.current = false; setConfirmarPais(false);
      umRespOkRef.current = false; setConfirmarUmResp(false);
    }
    setForm(f => ({ ...f, [k]: v }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.nome_pai.trim() && !form.nome_mae.trim()) return setError('Informe o nome do pai ou da mãe.');
    for (const n of [form.nome_pai.trim(), form.nome_mae.trim()]) {
      if (n && !nomeCompletoValido(n)) {
        return setError(temAbreviacaoNome(n) ? 'Escreva o nome do pai/mãe completo, sem abreviações.' : 'Escreva o nome do pai/mãe completo.');
      }
    }
    // ⚠⚠ Mesmo nome nos dois campos: AVISA e deixa seguir (15/09/2026). Não é
    // erro — mãe solo preenchendo os dois campos é 1 em cada 5 inscrições, e a
    // saída antiga ("deixe um em branco") nunca foi usada por ninguém.
    if (exigeConfirmacaoPaisIguais(form.nome_pai, form.nome_mae, paisOkRef.current)) {
      setConfirmarPais(true);
      return;
    }
    const criancasValidas = criancas
      .map(c => ({ nome: c.nome.trim().replace(/\s+/g, ' '), data_nascimento: c.nascimento, sexo: c.sexo, foto_path: c.fotoPath || null }))
      .filter(c => c.nome.length >= 2);
    if (!criancasValidas.length) return setError('Informe o nome completo de ao menos uma criança.');
    for (const c of criancasValidas) {
      if (!nomeCompletoValido(c.nome)) return setError(`Escreva o nome completo da criança, sem abreviações (${c.nome}).`);
      if (!validarNascimento(c.data_nascimento)) return setError(`Informe a data de nascimento de ${c.nome}.`);
      if (!SEXOS.includes(c.sexo)) return setError(`Selecione o sexo de ${c.nome}.`);
    }
    // ⚠️ Enviar com upload em curso perderia a foto em silêncio: o caminho
    // ainda não voltou, e a inscrição entraria sem ela sem ninguém perceber.
    if (criancas.some(c => c.fotoEnviando)) return setError('Aguarde a foto terminar de enviar.');
    if (!telefoneValido(form.telefone)) return setError('Informe um telefone válido com DDD.');
    if (!cpfValido(form.cpf_responsavel)) return setError('Informe um CPF válido do responsável.');
    // ⚠️ O 2º CPF é opcional: só reclama se foi PREENCHIDO e está inválido.
    if (form.cpf_outro.trim() && !cpfValido(form.cpf_outro)) return setError('O CPF do outro responsável não é válido. Corrija ou apague o campo.');
    // ⚠️⚠️ AVISO, não bloqueio: um responsável só é caso real (mãe solo, pai
    // solo) e a porta sempre aceitou. Só garantimos que ninguém deixe em branco
    // por distração sem saber o que acontece com o certificado.
    if (temPai !== temMae && !umRespOkRef.current) {
      setError('');
      setConfirmarUmResp(true);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setError('Informe um e-mail válido.');
    if (!aceitaTermos) return setError('É preciso aceitar a autorização de responsável para inscrever a criança.');

    setLoading(true);
    try {
      const r: any = await apresentacaoCriancasPublico.inscrever({
        nome_pai: form.nome_pai.trim() || null,
        nome_mae: form.nome_mae.trim() || null,
        // A porta recusa o nome dobrado sem esta confirmação explícita.
        pais_iguais_confirmado: paisOkRef.current === true,
        criancas: criancasValidas,
        telefone: form.telefone,
        cpf_responsavel: soDigitos(form.cpf_responsavel),
        // ⚠️ Com um responsável só, o servidor INFERE o dono — mandar mesmo
        // assim não atrapalha, a régua ignora o informado nesse caso.
        cpf_de: cpfDe,
        cpf_outro: form.cpf_outro.trim() ? soDigitos(form.cpf_outro) : null,
        email: form.email.trim(),
        endereco: form.endereco.trim() || null,
        aceita_termos_menor: aceitaTermos,
        consent_imagem: consentImagem,
        whatsapp_optin: optin,
        website: form.website,
      });
      // A resposta DIZ o que aconteceu — mostrar "Inscrição enviada!" pra zero
      // inscrição criada era o mesmo bug já corrigido no batismo. Reenvio com
      // todas as crianças já inscritas NÃO cria nada e a pessoa precisa saber.
      const jaInscritas: string[] = Array.isArray(r?.ja_inscritas) ? r.ja_inscritas : [];
      const criadas: string[] = Array.isArray(r?.ids) ? r.ids : [];
      if (!criadas.length && jaInscritas.length) {
        setError(`${jaInscritas.join(', ')} já ${jaInscritas.length > 1 ? 'estavam inscritas' : 'estava inscrita'} para esta data — não criamos inscrição nova. Nossa equipe do Kids já tem o contato de vocês.`);
      } else {
        if (jaInscritas.length) setAvisoJaInscritas(jaInscritas);
        setHorarioFinal(r?.horario_rotulo || null);
        setSent(true);
      }
    } catch (err: any) {
      setError(err?.message || 'Erro ao enviar inscrição.');
    }
    setLoading(false);
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
        position: 'relative', zIndex: 1, width: '100%', maxWidth: 560,
        background: C.card, backdropFilter: 'blur(24px)',
        border: `1px solid ${C.cardBorder}`, borderRadius: 20,
        padding: 'clamp(28px, 6vw, 40px) clamp(18px, 5vw, 36px)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/logo-cbrio-icon.png" alt="CBRio"
            style={{ width: 72, height: 72, marginBottom: 12, display: 'inline-block' }} />
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.5, background: 'linear-gradient(90deg, #00B39D, #00d9bd)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
            Apresentação de Crianças
          </h1>
          <p style={{ fontSize: 13, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>
            Que bom que você decidiu apresentar seu(sua) filho(a) na CBRio! Preencha abaixo —
            o culto da apresentação é definido na hora e aparece ao final.
          </p>
          {proximaData && (
            <div style={{
              display: 'inline-block', marginTop: 14,
              padding: '8px 16px', borderRadius: 12,
              background: 'rgba(0,179,157,0.12)',
              border: '1px solid rgba(0,179,157,0.3)',
              color: '#00B39D', fontSize: 13, fontWeight: 600,
            }}>
              Próxima apresentação: {formatDataLonga(proximaData)}
              {horarioPrevisto && !sent && <span style={{ fontWeight: 500, opacity: 0.85 }}> · {horarioPrevisto}</span>}
            </div>
          )}
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
              Inscrição enviada!
            </h2>
            <p style={{ fontSize: 13, color: C.text3, marginTop: 10, lineHeight: 1.5 }}>
              {proximaData && <>A apresentação é em <strong>{formatDataLonga(proximaData)}</strong>{horarioFinal && <>, no <strong>{horarioFinal}</strong></>}. </>}
              {horarioFinal
                ? 'Chegue com antecedência e procure a equipe do Kids na entrada. Qualquer mudança, avisaremos pelo telefone informado.'
                : 'Nossa equipe do Kids vai entrar em contato pelo telefone informado para confirmar o horário.'}
            </p>
            {avisoJaInscritas.length > 0 && (
              <p style={{ fontSize: 12, color: '#00B39D', fontWeight: 600, marginTop: 10 }}>
                {avisoJaInscritas.join(', ')} já {avisoJaInscritas.length > 1 ? 'estavam inscritas' : 'estava inscrita'} — mantivemos a inscrição original.
              </p>
            )}
          </div>
        ) : (
          <>
            {/* ⚠️⚠️ UM RESPONSÁVEL SÓ (16/09/2026) · pedido do Marcos ao testar.
                Não é bloqueio: mãe solo e pai solo são caso real, e a porta
                sempre aceitou um nome só. É AVISO, porque o certificado sai com
                o nome de quem foi informado — sozinho.
                ⚠️ O texto diz o que o certificado FAZ de verdade
                (`nomesDosPaisUnicos(...).join(' e ')` com um nome devolve aquele
                nome, não uma lacuna). Prometer "vai sair incompleto" faria a
                família corrigir por motivo falso — a lição do aviso de pai==mãe. */}
            {confirmarUmResp && (
              <div style={{
                background: '#F59E0B18', border: '1px solid #F59E0B55', borderRadius: 10,
                padding: '12px 14px', marginBottom: 20, fontSize: 13, color: 'var(--cbrio-text)',
              }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Só um responsável informado</div>
                <div style={{ opacity: 0.9 }}>
                  O certificado da apresentação sai com o nome de <strong>{(form.nome_pai || form.nome_mae).trim()}</strong> sozinho.
                  Se quiser os dois nomes no certificado, volte e preencha {form.nome_mae ? 'o nome do pai' : 'o nome da mãe'}.
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => { umRespOkRef.current = true; setConfirmarUmResp(false); formRef.current?.requestSubmit(); }}
                    style={{
                      padding: '9px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: 'linear-gradient(90deg, #00B39D, #00d9bd)', color: '#fff', fontWeight: 700, fontSize: 13,
                    }}
                  >
                    Continuar assim
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmarUmResp(false)}
                    style={{
                      padding: '9px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 13,
                      border: '1px solid var(--cbrio-border)', background: 'transparent', color: 'var(--cbrio-text)',
                    }}
                  >
                    Voltar e preencher
                  </button>
                </div>
              </div>
            )}

            {/* ⚠⚠ Confirmação do nome dobrado · NUNCA window.confirm (padrão da
                casa: diálogo nativo trava automação e não é o visual do sistema). */}
            {confirmarPais && (
              <div style={{
                background: '#F59E0B18', border: '1px solid #F59E0B55', borderRadius: 10,
                padding: '12px 14px', marginBottom: 20, fontSize: 13, color: 'var(--cbrio-text)',
              }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Confere o nome dos responsáveis</div>
                <div style={{ opacity: 0.9 }}>{AVISO_PAIS_IGUAIS}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => { paisOkRef.current = true; setConfirmarPais(false); formRef.current?.requestSubmit(); }}
                    style={{
                      padding: '9px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: 'linear-gradient(90deg, #00B39D, #00d9bd)', color: '#fff', fontWeight: 700, fontSize: 13,
                    }}
                  >
                    Sim, é a mesma pessoa — enviar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmarPais(false)}
                    style={{
                      padding: '9px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                      background: 'transparent', color: 'var(--cbrio-text)', border: '1px solid var(--cbrio-border)',
                    }}
                  >
                    Corrigir os nomes
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div style={{
                background: '#ef444418', border: '1px solid #ef444440', borderRadius: 10,
                padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#ef4444',
              }}>{error}</div>
            )}

            {/* Honeypot */}
            <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
              <label htmlFor="website">Website</label>
              <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off"
                value={form.website} onChange={set('website') as any} />
            </div>

            <form ref={formRef} onSubmit={handleSubmit}>
              <Row>
                <Field id="nome_pai" label="Nome completo do pai" value={form.nome_pai} onChange={set('nome_pai')} autoComplete="name" />
                <Field id="nome_mae" label="Nome completo da mãe" value={form.nome_mae} onChange={set('nome_mae')} autoComplete="name" />
              </Row>

              <div style={{ marginBottom: 8, marginTop: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, color: '#00B39D' }}>
                Crianças
              </div>
              {criancas.map((c, i) => (
                <div key={i} style={{ marginBottom: 6 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' }}>
                    <Field id={`crianca_nome_${i}`} label={`Nome completo da criança ${criancas.length > 1 ? i + 1 : ''}`.trim()} value={c.nome} onChange={(e) => setCriancaCampo(i, 'nome', e.target.value)} required={i === 0} />
                    {criancas.length > 1 ? (
                      <button type="button" onClick={() => removeCrianca(i)} title="Remover criança"
                        style={{ marginBottom: 22, background: 'transparent', border: 'none', color: '#ef4444', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
                    ) : <span />}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(170px, 1fr) minmax(180px, 1fr)', gap: 12, alignItems: 'end', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--cbrio-text3)', marginBottom: 6 }}>Data de nascimento *</div>
                      <BirthDatePicker value={c.nascimento} onChange={(v) => setCriancaCampo(i, 'nascimento', v)} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--cbrio-text3)', marginBottom: 6 }}>Sexo *</div>
                      <SexoMini value={c.sexo} onPick={(v) => setCriancaCampo(i, 'sexo', v)} />
                    </div>
                  </div>
                  {/* ⚠️⚠️ FOTO PRO TELÃO (16/09/2026) · NÃO tem caixa de aceite.
                      Decisão do Marcos: o ato de escolher o arquivo, com o texto
                      dizendo pra que serve, É a autorização. Por isso a frase
                      abaixo não é decoração — ela é a única coisa que torna o
                      envio um consentimento informado, e fica ACIMA do botão,
                      onde é lida ANTES de escolher, não depois.
                      A caixa `imagem` lá embaixo continua: aquela é sobre as
                      fotos que a IGREJA tira e publica nas mídias — outro uso. */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--cbrio-text3)', marginBottom: 4 }}>
                      Foto da criança (opcional)
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--cbrio-text3)', marginBottom: 8, lineHeight: 1.45 }}>
                      Se você enviar uma foto, ela será <strong>exibida no telão durante o culto</strong> da apresentação. JPG, PNG ou WEBP, até 8MB.
                    </div>
                    {c.fotoPreview ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <img src={c.fotoPreview} alt="" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--cbrio-border)' }} />
                        <span style={{ fontSize: 12, color: c.fotoPath ? '#00B39D' : 'var(--cbrio-text3)' }}>
                          {c.fotoEnviando ? 'Enviando…' : 'Foto anexada'}
                        </span>
                        <button type="button" onClick={() => removerFoto(i)}
                          style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: 12, cursor: 'pointer', padding: 0 }}>
                          remover
                        </button>
                      </div>
                    ) : (
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => escolherFoto(i, e.target.files && e.target.files[0])}
                        style={{ fontSize: 12, color: 'var(--cbrio-text3)' }}
                      />
                    )}
                    {c.fotoErro && (
                      <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>{c.fotoErro}</div>
                    )}
                  </div>
                </div>
              ))}
              <button type="button" onClick={addCrianca}
                style={{ marginBottom: 20, marginTop: -4, background: 'transparent', border: 'none', color: '#00B39D', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                + Adicionar outra criança
              </button>

              <Field id="telefone" label="Telefone para contato" value={form.telefone} onChange={set('telefone')} required placeholder="(00) 00000-0000" inputMode="tel" autoComplete="tel" />
              <Row>
                <div>
                  <Field id="cpf_responsavel" label="CPF do responsável" value={form.cpf_responsavel} onChange={set('cpf_responsavel')} required placeholder="000.000.000-00" inputMode="numeric" />
                  {/* ⚠️⚠️ DE QUEM É ESTE CPF (16/09/2026). Só aparece quando os DOIS
                      nomes estão preenchidos — com um responsável só, a resposta já
                      se sabe, e perguntar o óbvio é campo a mais no celular.
                      Medido: das 9 inscrições em que dava pra saber o dono, 3 eram
                      do PAI, e o sistema assumia mãe. */}
                  {temPai && temMae && (
                    <div style={{ marginTop: -10, marginBottom: 14 }}>
                      <div style={{ fontSize: 11, color: 'var(--cbrio-text3)', marginBottom: 6 }}>Este CPF é de quem?</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {(['mae', 'pai'] as const).map(d => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setCpfDe(d)}
                            style={{
                              padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 12,
                              fontWeight: cpfDe === d ? 700 : 500,
                              border: `1px solid ${cpfDe === d ? '#00B39D' : 'var(--cbrio-border)'}`,
                              background: cpfDe === d ? '#00B39D18' : 'transparent',
                              color: cpfDe === d ? '#00B39D' : 'var(--cbrio-text3)',
                            }}
                          >
                            {d === 'mae' ? 'Da mãe' : 'Do pai'}
                          </button>
                        ))}
                      </div>
                      {!mostrarCpf2 ? (
                        <button type="button" onClick={() => setMostrarCpf2(true)}
                          style={{ marginTop: 10, background: 'transparent', border: 'none', color: '#00B39D', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                          + Adicionar o CPF {cpfDe === 'mae' ? 'do pai' : 'da mãe'}
                        </button>
                      ) : (
                        <div style={{ marginTop: 10 }}>
                          <Field
                            id="cpf_outro"
                            label={`CPF ${cpfDe === 'mae' ? 'do pai' : 'da mãe'} (opcional)`}
                            value={form.cpf_outro}
                            onChange={set('cpf_outro')}
                            placeholder="000.000.000-00"
                            inputMode="numeric"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <Field id="email" label="E-mail" value={form.email} onChange={set('email')} required inputMode="email" autoComplete="email" />
              </Row>
              <Field id="endereco" label="Endereço (opcional)" value={form.endereco} onChange={set('endereco')} autoComplete="street-address" />

              {/* Consentimentos (Contrato de Inscrição · PII de menor) */}
              <div style={{ marginTop: 4 }}>
                <ConsentBox checked={aceitaTermos} onChange={setAceitaTermos}>
                  <b style={{ color: 'var(--cbrio-text)' }}>Autorização do responsável *</b><br />{textos.menor_responsavel}
                </ConsentBox>
                <ConsentBox checked={consentImagem} onChange={setConsentImagem}>{textos.imagem}</ConsentBox>
                <ConsentBox checked={optin} onChange={setOptin}>
                  📲 <b style={{ color: 'var(--cbrio-text)' }}>Quero receber avisos da apresentação no WhatsApp</b><br />
                  {textos.aviso_optin || AVISO_OPTIN}
                </ConsentBox>
              </div>

              <button type="submit" disabled={loading} style={{
                width: '100%', marginTop: 8, padding: '13px', borderRadius: 12,
                background: loading ? '#00B39D80' : 'linear-gradient(90deg, #00B39D, #00d9bd)',
                color: '#fff', fontSize: 15, fontWeight: 700, border: 'none',
                cursor: loading ? 'default' : 'pointer', transition: 'opacity 0.2s',
              }}>
                {loading ? 'Enviando...' : 'Enviar inscrição'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
