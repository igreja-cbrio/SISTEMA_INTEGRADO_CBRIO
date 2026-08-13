import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { cadastroPublico } from '../../api';
import { useHomeScreenMeta } from '@/hooks/useHomeScreenMeta';
import AnimatedBackground from './AnimatedBackground';
import { usePublicTheme, PublicThemeToggle, PublicPaletteCtx, usePublicPalette } from './publicTheme';
import { MultistepFormShell } from '../../components/ui/multistep-form';
import { BirthDatePicker } from '../../components/ui/birth-date-picker';
import MemberWalletPass from '../../components/membresia/MemberWalletPass';
import MemberWalletDialog from '../../components/membresia/MemberWalletDialog';
import { QRCodeSVG } from 'qrcode.react';

// ── Helpers de máscara ──
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
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function mascaraCep(v) {
  const d = soDigitos(v).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

// ViaCEP · usado só pra sugerir o bairro a partir do CEP (fail-open · nunca bloqueia).
async function buscarCep(cep) {
  const d = soDigitos(cep);
  if (d.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.erro) return null;
    return { bairro: data.bairro || '', cidade: data.localidade || '', uf: data.uf || '' };
  } catch {
    return null;
  }
}

function cpfValido(v) {
  const d = soDigitos(v);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  const calc = (base, fator) => {
    let soma = 0;
    for (let i = 0; i < base.length; i += 1) soma += parseInt(base[i], 10) * (fator - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const dv1 = calc(d.slice(0, 9), 10);
  const dv2 = calc(d.slice(0, 10), 11);
  return dv1 === parseInt(d[9], 10) && dv2 === parseInt(d[10], 10);
}

// ── Input reutilizável com label flutuante ──
function Field({ id, label, type = 'text', value, onChange, required, placeholder, as = 'input', rows, maxLength, autoComplete, inputMode }) {
  const [focused, setFocused] = useState(false);
  const active = focused || type === 'date' || (value !== undefined && value !== null && String(value).length > 0);
  const Tag = as;

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
          display: 'block', width: '100%', minWidth: 0, maxWidth: '100%',
          padding: as === 'textarea' ? '14px 0 8px' : '10px 0',
          fontSize: 16, // 16px evita zoom automático do iOS ao focar o campo
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

function SelectField({ id, label, value, onChange, options, required }) {
  const C = usePublicPalette();
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
          display: 'block', width: '100%', minWidth: 0, maxWidth: '100%', padding: '10px 0', fontSize: 16, // 16px evita zoom automático do iOS
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

// ── Texto de consentimento LGPD ──
const TEXTO_CONSENTIMENTO =
  'Declaro que li e concordo com o tratamento dos meus dados pessoais pela CBRio para fins de acolhimento e acompanhamento pastoral, conforme a Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018). Meus dados serão mantidos em ambiente seguro e não serão compartilhados com terceiros sem minha autorização.';

// Consentimento único de comunicação (grava aceita_contato E whatsapp_optin —
// o texto precisa nomear os canais pro opt-in de WhatsApp ter lastro).
const TEXTO_COMUNICACAO =
  'Autorizo a CBRio a entrar em contato comigo por WhatsApp e e-mail sobre minha caminhada na igreja (inscrições, eventos, avisos e felicitações). Posso cancelar quando quiser.';

const ESTADO_CIVIL_OPTS = [
  { value: 'solteiro', label: 'Solteiro(a)' },
  { value: 'casado', label: 'Casado(a)' },
  { value: 'divorciado', label: 'Divorciado(a)' },
  { value: 'viuvo', label: 'Viúvo(a)' },
  { value: 'uniao_estavel', label: 'União estável' },
];

// ⚠️ Sexo: só `masculino|feminino`, NUNCA "outro" — é a lei do Contrato de
// Inscrição desta casa (a opção "Outro" foi removida das outras portas de
// propósito, porque a coluna do banco e os KPIs por sexo não a aceitam).
const SEXO_OPTS = [
  { value: 'masculino', label: 'Masculino' },
  { value: 'feminino', label: 'Feminino' },
];

// Vínculo AUTODECLARADO do censo. ⚠️ Os `value` espelham o CHECK da migration
// 20260803160000 e são identificadores persistidos — NÃO acentuar (a regra de
// acentuação vale pro `label`, que é o texto exibido).
// ⚠️ Responder "membro" NÃO torna ninguém membro: o status de membresia continua
// vindo de batismo/curso/carta. Isto é declaração da pessoa, não decisão nossa.
const VINCULO_OPTS = [
  { value: 'membro', label: 'Sou membro da CBRio' },
  { value: 'congregado', label: 'Frequento, mas não sou membro' },
  { value: 'visitante', label: 'É a minha primeira vez / estou conhecendo' },
];

const STEPS = [
  { id: 'pessoal', title: 'Dados Pessoais' },
  { id: 'info', title: 'Informações' },
  { id: 'termos', title: 'Termos' },
];

// Bairros da região da igreja (Barra e adjacências): seleção rápida no totem em
// vez de digitar endereço (2026-07-23). "Outro" abre campo livre — não trava
// quem mora fora da região. Endereço completo saiu; o bairro basta pra
// agrupar por região e a distância do mapa vem do GPS do aparelho.
const BAIRROS = [
  'Barra', 'Recreio', 'Freguesia', 'Anil', 'Pechincha', 'Taquara',
  'Barra Olímpica', 'Curicica', 'Camorim', 'Vargem Grande', 'Vargem Pequena',
];
const BAIRRO_OUTRO = '__outro__';
// Normaliza p/ casar o bairro devolvido pelo ViaCEP com a lista fixa (sem acento/caixa).
const normBairro = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function Row({ children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
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

function CheckboxField({ id, checked, onChange, label }) {
  return (
    <label htmlFor={id} style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      fontSize: 13, color: '#d4d4d4', cursor: 'pointer',
      padding: '6px 0',
    }}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{
          marginTop: 2, width: 16, height: 16,
          accentColor: '#00B39D', cursor: 'pointer',
        }}
      />
      <span style={{ lineHeight: 1.5 }}>{label}</span>
    </label>
  );
}

export default function CadastroMembresia() {
  const { C } = usePublicTheme();
  const navigate = useNavigate();
  useHomeScreenMeta('membresia');
  const searchParams = new URLSearchParams(window.location.search);
  const fromTotem = searchParams.get('from') === 'totem';
  const fromDevocional = searchParams.get('from') === 'devocional';
  // ── Censo / recadastramento (2026-08-03) ──
  // O QR do censo aponta pra `/cadastro-membresia?censo=1`. É o MESMO formulário
  // (decisão do Marcos: um formulário só, com mais tempo pra preencher — não
  // dividir em duas etapas), com duas diferenças: marca a submissão como censo
  // e pede o vínculo declarado.
  const ehCenso = searchParams.get('censo') === '1';
  // ── Link PESSOAL do convite do censo (?t=<token>) ──
  // Resolve a pergunta "como o sistema acha a pessoa se ela não tem CPF?": não
  // acha — o link foi emitido pra ela, com o membro_id assinado dentro. O
  // formulário abre PREENCHIDO e marca o que falta. Sem token, segue cadastro
  // normal (é o caso do QR impresso, que não sabe quem vai escanear).
  const censoToken = (searchParams.get('t') || '').trim();
  // "Completar cadastro" vindo do totem já traz CPF + nascimento (a pessoa
  // digitou no totem e não achamos o cadastro) — pré-preenche pra não redigitar.
  const prefCpf = fromTotem ? soDigitos(searchParams.get('cpf')) : '';
  const prefNasc = fromTotem && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.get('nasc') || '')
    ? searchParams.get('nasc') : '';
  const [currentStep, setCurrentStep] = useState(0);
  const [form, setForm] = useState({
    nome: '', sobrenome: '', cpf: prefCpf ? mascaraCpf(prefCpf) : '', email: '', confirmar_email: '', telefone: '',
    senha: '', confirmar_senha: '',
    // ⚠️ `genero` passou a ser coletado aqui em 04/08. Estava faltando: o
    // Contrato de Inscrição exige sexo em toda porta de pessoa, e sem ele um
    // cadastro novo por este formulário nunca ficava completo — então nunca
    // entrava na aprovação em massa e voltava pra fila humana pra sempre.
    // Canônico `masculino|feminino`, NUNCA "outro" (lei do contrato).
    genero: '',
    data_nascimento: prefNasc || '', estado_civil: '', bairro: '',
    cep: '', profissao: '', como_conheceu: '',
    website: '', // honeypot
  });
  const [aceitaTermos, setAceitaTermos] = useState(false);
  const [aceitaComunicacao, setAceitaComunicacao] = useState(false);
  const [converteuCbrio, setConverteuCbrio] = useState(false);
  // Vínculo AUTODECLARADO no censo. ⚠️ NÃO define membresia: responder o censo
  // não faz ninguém membro (isso é batismo/curso/carta, decisão da igreja). Só
  // separa quem já se considera membro de quem frequenta ou está chegando.
  const [vinculoDeclarado, setVinculoDeclarado] = useState('');
  // Bairro: guarda a chave da seleção; se "Outro", o valor real vem de bairroOutro.
  const [bairroSel, setBairroSel] = useState('');
  const [bairroOutro, setBairroOutro] = useState('');
  const [cepBuscando, setCepBuscando] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  // Censo: o servidor diz se ATUALIZOU um cadastro que já existia (sem revelar
  // qual, nem quais campos) — só pra a tela não prometer "entraremos em contato"
  // pra quem só confirmou os próprios dados.
  const [censoAtualizado, setCensoAtualizado] = useState(false);
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);

  // ── Modo ATUALIZAÇÃO (link pessoal do convite) ──
  // `faltando` vem do servidor pela MESMA régua da fila de aprovação
  // (utils/prontidaoCadastro.js), então a pessoa completa exatamente o que a
  // equipe cobraria dela depois — não uma lista inventada aqui.
  const [modoAtualizacao, setModoAtualizacao] = useState(false);
  const [faltando, setFaltando] = useState([]);
  const [carregandoMeusDados, setCarregandoMeusDados] = useState(!!censoToken);

  // Marca no PRÓPRIO rótulo o que está faltando (o pedido era "aparecer marcado
  // os campos que estão incompletos"). Só no modo atualização: num cadastro novo
  // tudo está vazio e marcar tudo não informa nada.
  const rotulo = useCallback((texto, chave) => (
    modoAtualizacao && faltando.includes(chave) ? `${texto} · falta preencher` : texto
  ), [modoAtualizacao, faltando]);

  useEffect(() => {
    if (!censoToken) return;
    let vivo = true;
    (async () => {
      try {
        const r = await cadastroPublico.censoMeusDados(censoToken);
        if (!vivo || !r?.ok) return;
        const d = r.dados || {};
        // Nome vem inteiro do banco e o formulário tem dois campos: 1º token vai
        // pra `nome`, o resto pra `sobrenome` (mesma régua do split do servidor).
        const partes = String(d.nome || '').trim().split(/\s+/);
        setForm((f) => ({
          ...f,
          nome: partes[0] || '',
          sobrenome: partes.slice(1).join(' '),
          cpf: d.cpf ? mascaraCpf(d.cpf) : f.cpf,
          email: d.email || '',
          confirmar_email: d.email || '',
          telefone: d.telefone ? mascaraTelefone(d.telefone) : '',
          data_nascimento: d.data_nascimento || '',
          genero: d.genero || '',
          estado_civil: d.estado_civil || '',
          cep: d.cep || '',
          profissao: d.profissao || '',
        }));
        if (d.bairro) setBairroSel(d.bairro);
        if (d.foto_url) setFotoPreview(d.foto_url);
        setFaltando(Array.isArray(r.faltando) ? r.faltando : []);
        setModoAtualizacao(true);
      } catch { /* link ruim cai no cadastro normal, sem tela de erro */ }
      finally { if (vivo) setCarregandoMeusDados(false); }
    })();
    return () => { vivo = false; };
  }, [censoToken]);

  // ── Loop com o totem (from=totem) ──
  // O QR do membro sai NA HORA (o form já tem CPF + nascimento) e a volta pro
  // totem nunca cai na tela de PIN do operador: flags one-shot em sessionStorage
  // que o TotemMembro consome no mount — 'resume' abre a sessão da própria
  // pessoa (via qr-lookup, que aceita cadastro pendente), 'unlocked' só pula o
  // PIN e cai na tela inicial.
  const [totemQr, setTotemQr] = useState(null);
  const [totemQrErro, setTotemQrErro] = useState('');

  const voltarAoTotem = useCallback((resumeToken) => {
    try {
      if (resumeToken) sessionStorage.setItem('cbrio-totem-resume', resumeToken);
      else sessionStorage.setItem('cbrio-totem-unlocked', '1');
    } catch { /* modo privado — cai na tela de PIN como antes */ }
    navigate('/totem');
  }, [navigate]);

  useEffect(() => {
    if (!sent || !fromTotem) return undefined;
    let alive = true;
    cadastroPublico.walletQrToken(soDigitos(form.cpf), form.data_nascimento)
      .then((r) => { if (alive && r?.qr) setTotemQr(r.qr); })
      .catch(() => {
        if (alive) setTotemQrErro('Não foi possível gerar seu QR agora — você pode pegá-lo depois no seu celular.');
      });
    return () => { alive = false; };
    // form.cpf/data_nascimento não mudam depois do envio
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sent, fromTotem]);

  // Totem abandonado no meio do cadastro não pode ficar preso nesta página:
  // 120s sem interação → volta pro totem destravado (NUNCA com sessão ativa).
  useEffect(() => {
    if (!fromTotem) return undefined;
    let t;
    const arm = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        try { sessionStorage.setItem('cbrio-totem-unlocked', '1'); } catch { /* ok */ }
        navigate('/totem');
      }, 120_000);
    };
    const evs = ['pointerdown', 'keydown', 'touchstart'];
    evs.forEach((e) => document.addEventListener(e, arm, { passive: true }));
    arm();
    return () => { clearTimeout(t); evs.forEach((e) => document.removeEventListener(e, arm)); };
  }, [fromTotem, navigate]);

  // Foto
  const [fotoPreview, setFotoPreview] = useState(null);
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoUploading, setFotoUploading] = useState(false);
  const fotoRef = useRef(null);

  // Sugestão de família
  const [familiaSugerida, setFamiliaSugerida] = useState(null);
  const [familiaOpcoes, setFamiliaOpcoes] = useState([]);
  const [showFamiliaStep, setShowFamiliaStep] = useState(false);
  const [buscouFamilia, setBuscouFamilia] = useState(false);

  // Lookup proativo por CPF (debounced)
  // null = não buscou | { found: false } | { found: true, primeiroNome, ... }
  const [cpfLookup, setCpfLookup] = useState(null);
  const [cpfChecando, setCpfChecando] = useState(false);

  // Lookup proativo por nome + telefone (debounced).
  // Reconhece novos convertidos já cadastrados (importados ou registrados em
  // culto) e oferece vincular automaticamente em vez de criar duplicata.
  // null = não buscou | { found: false } | { found: true, matchId, primeiroNome, telefoneMascarado, ... }
  const [nomeTelLookup, setNomeTelLookup] = useState(null);
  const [nomeTelChecando, setNomeTelChecando] = useState(false);
  // matchConfirmado: id do mem_membros confirmado pelo usuário ("sou eu")
  const [matchConfirmado, setMatchConfirmado] = useState(null);
  const [matchDescartado, setMatchDescartado] = useState(false); // "não sou eu" → para de perguntar

  const origem = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const o = params.get('origem');
      return ['qr_code', 'evento', 'site'].includes(o) ? o : 'site';
    } catch { return 'site'; }
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setMasked = (k, mask) => (e) => setForm((f) => ({ ...f, [k]: mask(e.target.value) }));

  // CEP: máscara + ViaCEP sugere o bairro (casa com a lista fixa ou cai em "Outro").
  const handleCepChange = async (e) => {
    const masked = mascaraCep(e.target.value);
    setForm((f) => ({ ...f, cep: masked }));
    if (soDigitos(masked).length === 8) {
      setCepBuscando(true);
      const result = await buscarCep(masked);
      setCepBuscando(false);
      if (result?.bairro) {
        const match = BAIRROS.find((b) => normBairro(b) === normBairro(result.bairro));
        if (match) { setBairroSel(match); setBairroOutro(''); }
        else { setBairroSel(BAIRRO_OUTRO); setBairroOutro(result.bairro); }
      }
    }
  };

  // Debounce: 600ms após parar de digitar CPF, se CPF for valido, faz lookup
  useEffect(() => {
    const cpf = form.cpf;
    if (!cpfValido(cpf)) {
      setCpfLookup(null);
      setCpfChecando(false);
      return undefined;
    }
    setCpfChecando(true);
    const t = setTimeout(async () => {
      try {
        const r = await cadastroPublico.lookupCpf(soDigitos(cpf));
        setCpfLookup(r);
      } catch {
        setCpfLookup(null);
      } finally {
        setCpfChecando(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [form.cpf]);

  // Debounce: 700ms após parar de digitar nome/telefone — busca cadastro
  // pre-existente (novo convertido importado, etc.) por primeiro nome +
  // telefone exatos. Para de buscar se usuário já confirmou ou descartou.
  useEffect(() => {
    if (matchConfirmado || matchDescartado) {
      setNomeTelChecando(false);
      return undefined;
    }
    const nome = form.nome.trim();
    const tel = soDigitos(form.telefone);
    if (nome.length < 2 || (tel.length !== 10 && tel.length !== 11)) {
      setNomeTelLookup(null);
      setNomeTelChecando(false);
      return undefined;
    }
    setNomeTelChecando(true);
    const t = setTimeout(async () => {
      try {
        const r = await cadastroPublico.lookupNomeTelefone(nome, form.telefone);
        setNomeTelLookup(r);
      } catch {
        setNomeTelLookup(null);
      } finally {
        setNomeTelChecando(false);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [form.nome, form.telefone, matchConfirmado, matchDescartado]);

  const [fotoDragOver, setFotoDragOver] = useState(false);

  const processarFoto = useCallback((file) => {
    if (!file.type.startsWith('image/')) { setError('Selecione um arquivo de imagem (JPG, PNG ou WebP).'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('A imagem deve ter no máximo 5 MB.'); return; }
    setFotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setFotoPreview(ev.target.result);
    reader.readAsDataURL(file);
    setError('');
  }, []);

  const handleFotoSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) processarFoto(file);
  }, [processarFoto]);

  const handleFotoDrop = useCallback((e) => {
    e.preventDefault();
    setFotoDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) processarFoto(file);
  }, [processarFoto]);

  // Step validation
  const isStepValid = () => {
    switch (currentStep) {
      case 0:
        return form.nome.trim() !== '' && form.sobrenome.trim() !== '' && soDigitos(form.telefone).length >= 10 && cpfValido(form.cpf);
      case 1:
        // Passo Informações (+ bairro). Obrigatórios: nascimento e e-mail
        // (2026-07-23 · antes o e-mail só era exigido no devocional). Bairro,
        // estado civil e profissão são opcionais.
        if (!form.data_nascimento) return false;
        // ⚠️ Sexo OBRIGATÓRIO (Matheus · 05/08: "em todos os formulários").
        // Ontem o campo entrou na tela mas não travava nada — `required` no
        // SelectField é decoração, quem bloqueia é esta função.
        if (!['masculino', 'feminino'].includes(form.genero)) return false;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return false;
        if (fromDevocional) {
          if (form.email.trim().toLowerCase() !== form.confirmar_email.trim().toLowerCase()) return false;
          if (!form.senha || form.senha.length < 6) return false;
          if (form.senha !== form.confirmar_senha) return false;
        }
        return true;
      case 2:
        return aceitaTermos; // termos (o passo Endereço virou o seletor de bairro no passo Informações)
      default:
        return true;
    }
  };

  function validarForm() {
    if (!form.nome.trim()) return 'Informe seu nome.';
    if (!form.sobrenome.trim()) return 'Informe seu sobrenome.';
    if (soDigitos(form.telefone).length < 10) return 'Informe um celular válido com DDD.';
    if (!cpfValido(form.cpf)) return 'CPF inválido.';
    if (!form.data_nascimento) return 'Informe sua data de nascimento.';
    if (!['masculino', 'feminino'].includes(form.genero)) return 'Selecione o sexo.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Informe um e-mail válido.';
    if (fromDevocional) {
      if (form.email.trim().toLowerCase() !== form.confirmar_email.trim().toLowerCase()) {
        return 'Os emails informados não conferem.';
      }
      if (!form.senha) return 'Crie uma senha de acesso.';
      if (form.senha.length < 6) return 'A senha precisa ter ao menos 6 caracteres.';
      if (form.senha !== form.confirmar_senha) return 'As senhas não conferem.';
    }
    if (ehCenso && !vinculoDeclarado) return 'Informe seu vínculo com a igreja.';
    if (!aceitaTermos) return 'É necessário aceitar os termos para enviar o cadastro.';
    return null;
  }

  async function verificarFamiliaEEnviar() {
    setError('');
    const erro = validarForm();
    if (erro) { setError(erro); return; }

    if (buscouFamilia) {
      await enviarCadastro(familiaSugerida?.id);
      return;
    }

    setLoading(true);
    try {
      const { familias } = await cadastroPublico.verificarFamilia(form.sobrenome.trim());
      if (familias && familias.length > 0) {
        setFamiliaOpcoes(familias);
        setShowFamiliaStep(true);
        setBuscouFamilia(true);
      } else {
        setBuscouFamilia(true);
        await enviarCadastro();
      }
    } catch {
      setBuscouFamilia(true);
      await enviarCadastro();
    } finally {
      setLoading(false);
    }
  }

  async function enviarCadastro(familiaId) {
    setLoading(true);
    try {
      let foto_url = null;
      if (fotoFile) {
        setFotoUploading(true);
        try {
          const res = await cadastroPublico.uploadFoto(fotoFile);
          foto_url = res.foto_url;
        } catch { /* photo upload failure should not block cadastro */ }
        setFotoUploading(false);
      }

      const { sobrenome, confirmar_email, confirmar_senha, ...rest } = form;
      const bairroFinal = (bairroSel === BAIRRO_OUTRO ? bairroOutro.trim() : bairroSel) || null;
      const resp = await cadastroPublico.enviar({
        ...rest,
        nome: `${form.nome.trim()} ${sobrenome.trim()}`.trim(),
        cpf: soDigitos(form.cpf),
        bairro: bairroFinal,
        origem,
        aceita_termos: aceitaTermos,
        aceita_contato: aceitaComunicacao,
        whatsapp_optin: aceitaComunicacao,
        converteu_na_cbrio: converteuCbrio || undefined,
        censo: ehCenso || undefined,
        // Identifica a pessoa no servidor sem depender de CPF (chave FORTE no
        // censoReconciliar) — é o que faz a submissão ATUALIZAR o cadastro dela
        // em vez de virar cadastro novo.
        censo_token: censoToken || undefined,
        vinculo_declarado: (ehCenso && vinculoDeclarado) || undefined,
        consentimento_texto: aceitaComunicacao
          ? `${TEXTO_CONSENTIMENTO}\n\n${TEXTO_COMUNICACAO}`
          : TEXTO_CONSENTIMENTO,
        familia_sugerida_id: familiaId || null,
        foto_url,
        match_membro_id: matchConfirmado || null,
        senha: form.senha || undefined,
      });

      // Se veio do /devocional/login e a conta foi criada com sucesso,
      // tenta entrar direto e levar pro devocional do dia.
      if (fromDevocional && resp?.account_created && form.email && form.senha) {
        try {
          const { supabase } = await import('../../supabaseClient');
          const { error: signErr } = await supabase.auth.signInWithPassword({
            email: form.email.trim().toLowerCase(),
            password: form.senha,
          });
          if (!signErr) {
            window.location.href = '/devocional';
            return;
          }
        } catch { /* fallback: tela de sucesso normal */ }
      }
      if (ehCenso) setCensoAtualizado(!!resp?.censo_atualizado);
      setSent(true);
    } catch (err) {
      setError(err.message || 'Não foi possível enviar o cadastro. Tente novamente.');
      setShowFamiliaStep(false);
    } finally {
      setLoading(false);
    }
  }

  function selecionarFamilia(fam) {
    setFamiliaSugerida(fam);
    setShowFamiliaStep(false);
    enviarCadastro(fam.id);
  }

  function negarFamilia() {
    setFamiliaSugerida(null);
    setShowFamiliaStep(false);
    enviarCadastro(null);
  }

  const nextStep = () => {
    if (currentStep < STEPS.length - 1) setCurrentStep(s => s + 1);
  };
  const prevStep = () => {
    if (currentStep > 0) setCurrentStep(s => s - 1);
  };

  return (
    <PublicPaletteCtx.Provider value={C}>
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
        {fromTotem && (
          <button
            onClick={() => voltarAoTotem(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'transparent', border: 'none',
              color: C.textDim, fontSize: 13, cursor: 'pointer',
              padding: '0 0 20px', marginBottom: 0,
            }}
          >
            ← Voltar ao Totem
          </button>
        )}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img
            src="/logo-cbrio-icon.png"
            alt="CBRio"
            style={{ width: 72, height: 72, marginBottom: 12, display: 'inline-block' }}
          />
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.5, background: 'linear-gradient(90deg, #00B39D, #00d9bd)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
            {modoAtualizacao ? 'Atualize seu cadastro' : 'Cadastro de Membresia'}
          </h1>
          <p style={{ fontSize: 13, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>
            {modoAtualizacao
              ? (faltando.length
                // Diz QUANTOS campos faltam, não quais: a lista completa está
                // marcada campo a campo no formulário, e repetir aqui só
                // assusta ("faltam 5 coisas") antes de a pessoa ver que é rápido.
                ? 'Confira o que já temos e complete o que está faltando — leva 2 minutos.'
                : 'Seus dados já estão completos. Confira e corrija o que quiser.')
              : 'Preencha seus dados para que nossa equipe de acolhimento entre em contato.'}
          </p>
        </div>

        {/* Enquanto o link pessoal carrega, não mostrar o formulário vazio: a
            pessoa começaria a digitar e o prefill sobrescreveria o que ela
            escreveu. */}
        {carregandoMeusDados && (
          <div style={{
            padding: '28px 20px', textAlign: 'center', fontSize: 13,
            color: C.text3, background: '#00B39D0d',
            border: `1px solid ${C.cardBorder}`, borderRadius: 14, marginBottom: 16,
          }}>
            Carregando seus dados…
          </div>
        )}

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
              {ehCenso
                ? (censoAtualizado ? 'Dados atualizados!' : 'Cadastro recebido!')
                : 'Cadastro enviado!'}
            </h2>
            <p style={{ fontSize: 13, color: C.text3, marginTop: 10, lineHeight: 1.5 }}>
              {ehCenso
                ? (censoAtualizado
                  ? 'Obrigado! Encontramos o seu cadastro e atualizamos suas informações. Não precisa preencher de novo.'
                  : 'Obrigado por participar do censo. Em breve nossa equipe entrará em contato com você.')
                : 'Obrigado por se conectar com a CBRio. Em breve nossa equipe entrará em contato com você.'}
            </p>

            {fromTotem ? (
              /* Modo totem: o QR do membro sai na hora (sem repedir CPF/nascimento)
                 e a volta já ativa a sessão da pessoa no totem. */
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                {totemQr ? (
                  <>
                    <p style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: '0 0 4px' }}>
                      Seu QR de membro está pronto!
                    </p>
                    <p style={{ fontSize: 12, color: C.text3, marginBottom: 16 }}>
                      Ele é a sua carteirinha digital e identifica você no totem.
                    </p>
                    <div style={{ display: 'inline-block', background: '#fff', padding: 12, borderRadius: 12, marginBottom: 12 }}>
                      <QRCodeSVG value={totemQr} size={180} level="M" includeMargin={false} />
                    </div>
                    <p style={{ fontSize: 11, color: C.textDim, marginBottom: 20 }}>
                      No celular, acesse {window.location.origin}/wallet para guardar na sua carteira digital.
                    </p>
                  </>
                ) : (
                  <p style={{ fontSize: 12, color: C.text3, marginBottom: 20 }}>
                    {totemQrErro || 'Gerando seu QR de membro...'}
                  </p>
                )}
                <button
                  onClick={() => voltarAoTotem(totemQr)}
                  style={{
                    padding: '14px 28px', borderRadius: 12, border: 'none',
                    background: '#00B39D', color: '#fff',
                    fontSize: 15, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  {totemQr ? 'Continuar no totem já identificado' : '← Voltar ao Totem'}
                </button>
              </div>
            ) : (
              /* Modo normal: exibe wallet pass inline */
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <MemberWalletPass
                  cpf={soDigitos(form.cpf)}
                  dataNascimento={form.data_nascimento}
                  title="Seu QR de membro CBRio"
                  inline
                />
              </div>
            )}
          </div>
        ) : showFamiliaStep ? (
          <div style={{
            padding: '28px 20px', textAlign: 'center',
            background: 'rgba(0,179,157,0.06)', border: '1px solid rgba(0,179,157,0.25)',
            borderRadius: 14,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: '#00B39D30', color: '#00B39D',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, marginBottom: 14,
            }}>&#x1F3E0;</div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>
              Encontramos uma família!
            </h2>
            <p style={{ fontSize: 13, color: C.text3, lineHeight: 1.5, marginBottom: 20 }}>
              {familiaOpcoes.length === 1
                ? `Existe a família "${familiaOpcoes[0].nome}" cadastrada. Você faz parte dessa família?`
                : `Encontramos famílias com sobrenome parecido. Você faz parte de alguma delas?`}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360, margin: '0 auto' }}>
              {familiaOpcoes.map((fam) => (
                <button
                  key={fam.id}
                  type="button"
                  onClick={() => selecionarFamilia(fam)}
                  disabled={loading}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: 8, padding: '12px 20px',
                    background: 'rgba(0,179,157,0.12)', border: '1px solid rgba(0,179,157,0.35)',
                    borderRadius: 10, color: '#00B39D', fontSize: 14, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}
                >
                  Sim, sou da família {fam.nome}
                </button>
              ))}
              <button
                type="button"
                onClick={negarFamilia}
                disabled={loading}
                style={{
                  padding: '12px 20px', background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
                  color: C.text3, fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', transition: 'all 0.2s',
                }}
              >
                {loading ? 'Enviando...' : 'Não, não faço parte de nenhuma dessas famílias'}
              </button>
            </div>
          </div>
        ) : carregandoMeusDados ? null : (
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
                value={form.website} onChange={set('website')} />
            </div>

            <MultistepFormShell
              steps={STEPS}
              currentStep={currentStep}
              onNext={nextStep}
              onPrev={prevStep}
              onSubmit={verificarFamiliaEEnviar}
              isSubmitting={loading}
              isStepValid={isStepValid()}
              submitLabel="Enviar cadastro"
            >
              {/* Step 1: Dados Pessoais */}
              {currentStep === 0 && (
                <div>
                  <SectionTitle>Dados pessoais</SectionTitle>

                  {/* Foto */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20, gap: 8 }}>
                    <div
                      onClick={() => fotoRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setFotoDragOver(true); }}
                      onDragLeave={() => setFotoDragOver(false)}
                      onDrop={handleFotoDrop}
                      style={{
                        width: 96, height: 96, borderRadius: '50%',
                        background: fotoPreview ? 'transparent' : fotoDragOver ? 'rgba(0,179,157,0.25)' : 'rgba(0,179,157,0.12)',
                        border: `2px dashed ${fotoDragOver ? '#00B39D' : fotoPreview ? '#00B39D' : 'var(--cbrio-border)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', overflow: 'hidden', position: 'relative',
                        transition: 'border-color 0.3s, background 0.3s',
                      }}
                    >
                      {fotoPreview ? (
                        <img src={fotoPreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ textAlign: 'center', color: fotoDragOver ? '#00B39D' : '#a3a3a3' }}>
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                            <circle cx="12" cy="13" r="4" />
                          </svg>
                          <div style={{ fontSize: 10, marginTop: 2 }}>Foto</div>
                        </div>
                      )}
                      {fotoUploading && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <div style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                        </div>
                      )}
                    </div>
                    <input ref={fotoRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleFotoSelect} />
                    {!fotoPreview && <span style={{ fontSize: 11, color: C.text3 }}>Clique ou arraste uma foto</span>}
                    {fotoPreview && (
                      <button type="button" onClick={() => { setFotoFile(null); setFotoPreview(null); if (fotoRef.current) fotoRef.current.value = ''; }}
                        style={{ fontSize: 12, color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                        Remover foto
                      </button>
                    )}
                  </div>

                  <Row>
                    <Field id="nome" label={rotulo('Nome', 'nome')} value={form.nome} onChange={set('nome')} required autoComplete="given-name" maxLength={100} />
                    <Field id="sobrenome" label={rotulo('Sobrenome', 'nome')} value={form.sobrenome} onChange={set('sobrenome')} required autoComplete="family-name" maxLength={100} />
                  </Row>
                  <Row>
                    <Field id="cpf" label={rotulo('CPF', 'cpf')} value={form.cpf} onChange={setMasked('cpf', mascaraCpf)} required inputMode="numeric" maxLength={14} />
                    <Field id="telefone" label={rotulo('Celular / WhatsApp', 'telefone')} value={form.telefone} onChange={setMasked('telefone', mascaraTelefone)} required autoComplete="tel" inputMode="tel" maxLength={16} />
                  </Row>
                  {cpfChecando && (
                    <div style={{ marginTop: -10, marginBottom: 14, fontSize: 12, color: 'var(--cbrio-text3)' }}>
                      Verificando se você já está cadastrado...
                    </div>
                  )}
                  {!cpfChecando && cpfLookup?.found && (
                    <div style={{
                      marginTop: -10, marginBottom: 14,
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: 'rgba(0, 179, 157, 0.08)',
                      border: '1px solid rgba(0, 179, 157, 0.3)',
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                    }}>
                      <span style={{ fontSize: 18, lineHeight: 1 }}>{cpfLookup.fonte === 'membro' ? '✓' : '!'}</span>
                      <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                        {cpfLookup.fonte === 'membro' ? (
                          <>
                            <strong>Bem-vindo(a) de volta, {cpfLookup.primeiroNome} {cpfLookup.iniciaisSobrenome}</strong>
                            <div style={{ color: 'var(--cbrio-text3)', marginTop: 2 }}>
                              Encontramos seu cadastro. Continue preenchendo abaixo · seus dados serão atualizados ao enviar.
                            </div>
                          </>
                        ) : (
                          <>
                            <strong>Já existe um cadastro com este CPF</strong>
                            <div style={{ color: 'var(--cbrio-text3)', marginTop: 2 }}>
                              Em nome de {cpfLookup.primeiroNome} {cpfLookup.iniciaisSobrenome} (em análise).
                              Se for você, pode continuar — vamos atualizar.
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Match por nome + telefone — reconhece novos convertidos */}
                  {nomeTelChecando && !matchConfirmado && !matchDescartado && (
                    <div style={{ marginTop: -10, marginBottom: 14, fontSize: 12, color: 'var(--cbrio-text3)' }}>
                      Procurando seu registro...
                    </div>
                  )}
                  {!nomeTelChecando && !matchConfirmado && !matchDescartado && nomeTelLookup?.found && (
                    <div style={{
                      marginTop: -10, marginBottom: 14,
                      padding: '12px 14px',
                      borderRadius: 10,
                      background: 'rgba(0, 179, 157, 0.08)',
                      border: '1px solid rgba(0, 179, 157, 0.35)',
                    }}>
                      <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>
                        <strong>Encontramos um registro com esse nome e celular.</strong>
                        <div style={{ color: 'var(--cbrio-text3)', marginTop: 4 }}>
                          {nomeTelLookup.primeiroNome} {nomeTelLookup.iniciaisSobrenome} · celular {nomeTelLookup.telefoneMascarado}
                        </div>
                        <div style={{ color: 'var(--cbrio-text3)', marginTop: 4, fontSize: 12 }}>
                          {nomeTelLookup.cadastroCompleto
                            ? 'Esse cadastro já existe no sistema. É você mesmo?'
                            : 'Provavelmente você é um novo convertido já registrado no nosso sistema. É você?'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => setMatchConfirmado(nomeTelLookup.matchId)}
                          style={{
                            flex: 1, padding: '8px 12px', borderRadius: 8,
                            border: '1px solid #00B39D', background: '#00B39D',
                            color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                          }}
                        >
                          Sim, sou eu
                        </button>
                        <button
                          type="button"
                          onClick={() => { setMatchDescartado(true); setNomeTelLookup(null); }}
                          style={{
                            flex: 1, padding: '8px 12px', borderRadius: 8,
                            border: '1px solid var(--cbrio-border)', background: 'transparent',
                            color: 'var(--cbrio-text)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                          }}
                        >
                          Não sou eu
                        </button>
                      </div>
                    </div>
                  )}
                  {matchConfirmado && (
                    <div style={{
                      marginTop: -10, marginBottom: 14,
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: 'rgba(0, 179, 157, 0.12)',
                      border: '1px solid #00B39D',
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                      <span style={{ fontSize: 18, lineHeight: 1, color: '#00B39D' }}>✓</span>
                      <div style={{ fontSize: 13, lineHeight: 1.4, flex: 1 }}>
                        <strong>Cadastro reconhecido</strong>
                        <div style={{ color: 'var(--cbrio-text3)', marginTop: 2, fontSize: 12 }}>
                          Vamos vincular ao seu registro existente. Continue preenchendo.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setMatchConfirmado(null); setMatchDescartado(false); }}
                        style={{
                          background: 'none', border: 'none', color: '#ef4444',
                          cursor: 'pointer', fontWeight: 600, fontSize: 12,
                        }}
                      >
                        desfazer
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Informações */}
              {currentStep === 1 && (
                <div>
                  <SectionTitle>Informações</SectionTitle>
                  {ehCenso && (
                    <div style={{ marginBottom: 4 }}>
                      <SelectField
                        id="vinculo_declarado"
                        label="Qual é o seu vínculo com a CBRio? *"
                        value={vinculoDeclarado}
                        onChange={(e) => setVinculoDeclarado(e.target.value)}
                        options={VINCULO_OPTS}
                        required
                      />
                      <p style={{ fontSize: 11, color: 'var(--cbrio-text3)', margin: '-12px 0 20px' }}>
                        Não se preocupe em acertar: isso nos ajuda a organizar o
                        acompanhamento e você pode mudar depois.
                      </p>
                    </div>
                  )}
                  <Row>
                    <div style={{ marginBottom: 20, flex: 1 }}>
                      <label style={{ display: 'block', fontSize: 11, color: 'var(--cbrio-text3)', marginBottom: 6 }}>
                        {rotulo('Data de nascimento', 'nascimento')} <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <BirthDatePicker value={form.data_nascimento} onChange={(v) => setForm((f) => ({ ...f, data_nascimento: v }))} />
                    </div>
                    <Field
                      id="email"
                      type="email"
                      label={`${rotulo('E-mail', 'email')} *`}
                      value={form.email}
                      onChange={set('email')}
                      autoComplete="email"
                      maxLength={200}
                      required
                    />
                  </Row>

                  <Row>
                    <SelectField
                      id="genero"
                      label={`${rotulo('Sexo', 'genero')} *`}
                      value={form.genero}
                      onChange={set('genero')}
                      options={SEXO_OPTS}
                      required
                    />
                    <div style={{ flex: 1 }} />
                  </Row>

                  {fromDevocional && (
                    <div style={{
                      background: 'rgba(0,179,157,0.06)',
                      border: '1px solid rgba(0,179,157,0.25)',
                      borderRadius: 12, padding: 16, marginBottom: 16,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cbrio-text)', marginBottom: 4 }}>
                        Criar acesso ao app
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--cbrio-text3)', marginBottom: 12, lineHeight: 1.5 }}>
                        Pra entrar depois no devocional, na membresia digital e demais ferramentas da CBRio.
                      </div>
                      <Row>
                        <Field
                          id="confirmar_email"
                          type="email"
                          label="Confirmar e-mail *"
                          value={form.confirmar_email}
                          onChange={set('confirmar_email')}
                          autoComplete="off"
                          maxLength={200}
                          required
                        />
                      </Row>
                      <Row>
                        <Field
                          id="senha"
                          type="password"
                          label="Senha * (min 6 caracteres)"
                          value={form.senha}
                          onChange={set('senha')}
                          autoComplete="new-password"
                          maxLength={72}
                          required
                        />
                        <Field
                          id="confirmar_senha"
                          type="password"
                          label="Confirmar senha *"
                          value={form.confirmar_senha}
                          onChange={set('confirmar_senha')}
                          autoComplete="new-password"
                          maxLength={72}
                          required
                        />
                      </Row>
                    </div>
                  )}

                  <Row>
                    <SelectField id="estado_civil" label="Estado civil" value={form.estado_civil} onChange={set('estado_civil')} options={ESTADO_CIVIL_OPTS} />
                    <Field id="profissao" label="Profissão" value={form.profissao} onChange={set('profissao')} maxLength={120} />
                  </Row>
                  <Field
                    id="cep"
                    label={cepBuscando ? 'CEP (buscando bairro...)' : 'CEP (opcional)'}
                    value={form.cep}
                    onChange={handleCepChange}
                    inputMode="numeric"
                    autoComplete="postal-code"
                    maxLength={9}
                  />
                  <SelectField
                    id="bairro"
                    label="Bairro"
                    value={bairroSel}
                    onChange={(e) => setBairroSel(e.target.value)}
                    options={[...BAIRROS.map((b) => ({ value: b, label: b })), { value: BAIRRO_OUTRO, label: 'Outro bairro' }]}
                  />
                  {bairroSel === BAIRRO_OUTRO && (
                    <Field id="bairro_outro" label="Qual bairro?" value={bairroOutro} onChange={(e) => setBairroOutro(e.target.value)} maxLength={80} />
                  )}
                  <Field
                    id="como_conheceu"
                    label="Como conheceu a CBRio? (opcional)"
                    value={form.como_conheceu}
                    onChange={set('como_conheceu')}
                    as="textarea"
                    rows={3}
                    maxLength={500}
                  />
                  <div style={{ marginTop: 4 }}>
                    <CheckboxField
                      id="converteu_na_cbrio"
                      checked={converteuCbrio}
                      onChange={setConverteuCbrio}
                      label="Eu me converti / aceitei Jesus aqui na CBRio."
                    />
                  </div>
                </div>
              )}

              {/* Termos (o passo Endereço virou o seletor de bairro no passo
                  Informações · 2026-07-23; o passo Grupo de Conexão saiu antes) */}
              {currentStep === 2 && (
                <div>
                  <SectionTitle>Termos e consentimento</SectionTitle>
                  <div style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--cbrio-border)',
                    borderRadius: 12, padding: 16, marginBottom: 8,
                  }}>
                    <p style={{ fontSize: 12, color: C.text3, lineHeight: 1.6, margin: 0, marginBottom: 12 }}>
                      {TEXTO_CONSENTIMENTO}
                    </p>
                    <CheckboxField
                      id="aceita_termos"
                      checked={aceitaTermos}
                      onChange={setAceitaTermos}
                      label="Li e concordo com o tratamento dos meus dados pessoais. *"
                    />
                    <CheckboxField
                      id="aceita_comunicacao"
                      checked={aceitaComunicacao}
                      onChange={setAceitaComunicacao}
                      label={TEXTO_COMUNICACAO}
                    />
                  </div>
                </div>
              )}
            </MultistepFormShell>

            {/* ⚠️ O atalho "Já fiz meu cadastro e quero meu QR de membro" SAIU
                daqui (decisão do Matheus · 04/08): a carteirinha/QR de membro
                vive no APP de membros. Numa página cuja tarefa é completar
                cadastro, o atalho competia com a tarefa. O `MemberWalletDialog`
                e as rotas /wallet/* seguem existindo (o app usa) — não apagar. */}
          </>
        )}
      </div>

      <MemberWalletDialog
        open={walletDialogOpen}
        onOpenChange={setWalletDialogOpen}
      />
    </div>
    </PublicPaletteCtx.Provider>
  );
}
