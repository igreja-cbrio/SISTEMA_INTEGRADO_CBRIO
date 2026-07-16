// ============================================================================
// /inscricao-grupos — formulário público para inscrição em grupo de conexão.
//
// Acessado via QR code distribuído nos cultos / redes sociais durante
// período de inscrição, ou num TOTEM (navegador quiosque no lounge). Usa o
// GrupoSelector em modo "full" (todos os filtros: líder, categoria, bairro,
// CEP, lista, mapa) e um form de identificação (nome, telefone, nascimento,
// sexo e CPF obrigatórios · e-mail e foto opcionais). Erros de validação são
// apontados campo a campo (borda vermelha + mensagem). ÚNICA trava (Marcos ·
// 14/07): gênero oposto em grupo de homens/mulheres. Idade fora da faixa,
// vários grupos e grupos no mesmo horário são permitidos (idade vira aviso).
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
import { BirthDatePicker } from '../../components/ui/birth-date-picker';
import { CheckCircle2, ArrowLeft, Users, Camera, X, HelpCircle } from 'lucide-react';

const TEXTO_CONSENTIMENTO = `Ao enviar este formulário, você autoriza a CBRio a utilizar seus dados pessoais para fins de comunicacao com a igreja e participação em grupo de conexão, conforme a LGPD.`;

const IDLE_MS = 90_000; // totem: volta ao início após ~90s sem interação

const FORM_VAZIO = {
  nome: '', cpf: '', email: '', telefone: '',
  data_nascimento: '', genero: '', observacao: '', website: '', foto_url: '',
};

function soDigitos(v) { return (v || '').toString().replace(/\D+/g, ''); }

// Data de nascimento plausível (obrigatória desde 2026-07-10): formato ok,
// não-futura e ano >= 1900. Devolve a idade em anos, ou null se inválida.
function idadeDe(dataNascimento) {
  if (!dataNascimento || !/^\d{4}-\d{2}-\d{2}$/.test(dataNascimento)) return null;
  const nasc = new Date(dataNascimento + 'T12:00:00');
  const hoje = new Date();
  if (Number.isNaN(nasc.getTime()) || nasc.getFullYear() < 1900 || nasc > hoje) return null;
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}
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
// Nascimento agora é escolhido no calendário (BirthDatePicker · Matheus 2026-07-16):
// o campo armazena ISO (YYYY-MM-DD) direto — sem máscara DD/MM/AAAA.

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
  // ?pref=<token da sugestão>: pessoa recusada/encaminhada veio do link do
  // WhatsApp escolher OUTRO grupo — o form nasce preenchido (menos o CPF),
  // então nada é redigitado e o dedup casa com o cadastro certo.
  const prefParam = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('pref') || '';
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
  const [preenchidoViaLink, setPreenchidoViaLink] = useState(false);

  // Pré-preenche com os dados da pessoa do token da sugestão (só campos vazios).
  useEffect(() => {
    if (!prefParam) return;
    let cancelado = false;
    (async () => {
      try {
        const d = await gruposPublic.sugestaoPorToken(prefParam);
        const p = d?.pessoa;
        if (cancelado || !p) return;
        setForm(f => ({
          ...f,
          nome: f.nome || p.nome || '',
          telefone: f.telefone || (p.telefone ? mascaraTelefone(p.telefone) : ''),
          email: f.email || p.email || '',
          // O backend manda ISO; o campo agora armazena ISO (YYYY-MM-DD) direto.
          data_nascimento: f.data_nascimento || (p.data_nascimento ? String(p.data_nascimento).slice(0, 10) : ''),
          genero: f.genero || p.genero || '',
        }));
        setPreenchidoViaLink(true);
      } catch {}
    })();
    return () => { cancelado = true; };
  }, [prefParam]);
  const [errosCampos, setErrosCampos] = useState({}); // { campo: mensagem } — pinta o campo certo de vermelho
  const [bloqueio, setBloqueio] = useState(null);     // { mensagem } — grupo incompatível (confirmado pelo servidor)

  // Quando vem com ?grupo=<id> (QR específico do grupo / clique no mapa),
  // pré-carrega o grupo e pula direto para o passo 1 (dados) — MAS avisa
  // CEDO se as inscrições estão fechadas (grupo pausado ou temporada
  // encerrada): antes a pessoa preenchia tudo e só era recusada no envio.
  const [avisoDeepLink, setAvisoDeepLink] = useState(null); // { grupoNome }
  useEffect(() => {
    if (!grupoParam) return;
    let cancelled = false;
    (async () => {
      try {
        const g = await gruposPublic.getById(grupoParam);
        if (cancelled || !g || !g.id) return;
        // Fechado = por convite do líder (nunca recebe pelo form). Grupo
        // "sempre aberto" ignora a temporada fechada (Marcos · 15/07).
        let fechado = g.aceitando_inscricoes === false || g.modo_inscricao === 'fechado';
        if (!fechado && g.temporada && g.modo_inscricao !== 'sempre_aberto') {
          const ts = await gruposPublic.temporadas().catch(() => []);
          const t = (ts || []).find(x => x.id === g.temporada);
          if (t && !t.inscricoes_abertas) fechado = true;
        }
        if (cancelled) return;
        if (fechado) {
          setAvisoDeepLink({ grupoNome: g.nome });
          return; // fica no passo 0 — o seletor mostra os grupos abertos
        }
        setGrupoEscolhido(g);
        setStep(1);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [grupoParam]);

  const resetForm = useCallback(() => {
    setForm(FORM_VAZIO);
    setAceitaTermos(false);
    setError(''); setDup(null); setResultado(null); setFotoErro('');
    setErrosCampos({}); setBloqueio(null);
    // Deep-link com inscrições fechadas NÃO volta pro passo 1 (o grupo do
    // QR nem foi selecionado — a pessoa fica na escolha dos grupos abertos).
    const deepLinkValido = grupoParam && !avisoDeepLink;
    setStep(deepLinkValido ? 1 : 0);
    if (!deepLinkValido) setGrupoEscolhido(null);
  }, [grupoParam, avisoDeepLink]);

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

  const set = (k, masked) => (e) => {
    setForm(f => ({ ...f, [k]: masked ? masked(e.target.value) : e.target.value }));
    setErrosCampos(p => (p[k] ? { ...p, [k]: '' } : p)); // corrigiu o campo? some o vermelho
  };

  // "Tem certeza?" ao voltar/fechar/recarregar a página COM dados digitados
  // (regra de ouro do repo: sem digitar nada, não pergunta). Depois do envio
  // (step 2) pode sair livre. O navegador mostra o confirm nativo.
  const temDadosDigitados = !!(
    form.nome || soDigitos(form.telefone) || soDigitos(form.cpf)
    || form.email || form.data_nascimento || form.genero || form.observacao || form.foto_url
  );
  useEffect(() => {
    if (!temDadosDigitados || step === 2) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [temDadosDigitados, step]);

  // Validação campo a campo — devolve { campo: mensagem }. Feedback do teste
  // de 13/07: o erro genérico não dizia ONDE estava o problema. Obrigatórios:
  // nome, telefone, nascimento, sexo, CPF (Marcos · 2026-07-13) e aceite.
  const validarCampos = () => {
    const erros = {};
    if (!form.nome || form.nome.trim().length < 3) erros.nome = 'Digite o nome completo.';
    const tel = soDigitos(form.telefone);
    if (tel.length < 10 || tel.length > 11) erros.telefone = 'Digite um celular válido com DDD.';
    if (!form.data_nascimento) {
      erros.data_nascimento = 'Informe a data de nascimento.';
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(form.data_nascimento)) {
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
    if (!aceitaTermos) erros.aceita_termos = 'É necessário aceitar os termos para enviar.';
    return erros;
  };

  // ── Compatibilidade com o grupo (Marcos · 2026-07-14: SÓ GÊNERO bloqueia) ──
  // Grupo de homens/mulheres não aceita o sexo oposto — única trava do form.
  const bloqueioLocal = useMemo(() => {
    if (!grupoEscolhido) return null;
    const cat = (grupoEscolhido.categoria || '').toLowerCase();
    if (form.genero === 'masculino' && cat === 'mulheres') {
      return 'Este é um grupo só de mulheres, então sua inscrição não pode seguir nele.';
    }
    if (form.genero === 'feminino' && cat === 'homens') {
      return 'Este é um grupo só de homens, então sua inscrição não pode seguir nele.';
    }
    return null;
  }, [grupoEscolhido, form.genero]);

  // Idade NÃO bloqueia (Marcos · 14/07): fora da faixa do grupo vira só um
  // aviso — a pessoa segue se quiser e o líder decide na aprovação.
  const avisoFaixa = useMemo(() => {
    if (!grupoEscolhido) return null;
    const idade = idadeDe(form.data_nascimento);
    const min = grupoEscolhido.idade_min;
    const max = grupoEscolhido.idade_max;
    if (idade != null && (min != null || max != null)) {
      if ((min != null && idade < min) || (max != null && idade > max)) {
        const faixaTxt = min != null && max != null
          ? `de ${min} a ${max} anos`
          : (max != null ? `até ${max} anos` : `a partir de ${min} anos`);
        return `Este grupo é voltado para pessoas ${faixaTxt}.`;
      }
      return null; // dentro da faixa — nada a avisar
    }
    const faixa = grupoEscolhido.faixa_etaria;
    if (faixa && faixa !== 'Todas as idades') return `Este grupo é voltado para ${String(faixa).toLowerCase()}.`;
    return null;
  }, [grupoEscolhido, form.data_nascimento]);

  // Trocou de grupo → o bloqueio confirmado pelo servidor não vale mais.
  useEffect(() => { setBloqueio(null); }, [grupoEscolhido]);

  // "Procurar outro grupo": volta pra escolha SEM apagar o que a pessoa digitou
  // (pedido explícito do Marcos — ela não deve reescrever tudo).
  const procurarOutroGrupo = () => {
    setBloqueio(null); setError('');
    setGrupoEscolhido(null);
    setStep(0);
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
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

  const scrollAteCampo = (campo) => {
    try { document.querySelector(`[data-campo="${campo}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
  };

  const doSubmit = async (extra = {}) => {
    if (!grupoEscolhido) { setError('Escolha um grupo primeiro.'); return; }
    if (bloqueioLocal || bloqueio) return; // grupo incompatível — o painel já mostra o caminho
    const erros = validarCampos();
    if (Object.keys(erros).length > 0) {
      setErrosCampos(erros);
      setError('');
      const primeiro = ['nome', 'telefone', 'data_nascimento', 'genero', 'cpf', 'email', 'aceita_termos'].find(k => erros[k]);
      if (primeiro) scrollAteCampo(primeiro);
      return;
    }
    setErrosCampos({});
    if (submittingRef.current) return; // trava re-entrada (duplo-toque antes do re-render)
    submittingRef.current = true;
    setLoading(true); setError('');
    try {
      const r = await gruposPublic.inscrever({
        grupo_id: grupoEscolhido.id,
        nome: form.nome.trim(),
        cpf: soDigitos(form.cpf), // obrigatório (Marcos · 2026-07-13) — validado acima
        email: form.email.trim() || null,
        telefone: form.telefone,
        data_nascimento: form.data_nascimento || null, // já em ISO (validado acima)
        genero: form.genero || null,
        observacao: form.observacao || null,
        foto_url: form.foto_url || null,
        aceita_termos: aceitaTermos,
        consentimento_texto: TEXTO_CONSENTIMENTO,
        website: form.website,
        ...extra,
      });
      setDup(null);
      setResultado(r && (r.ja_membro || r.ja_pedido) ? { mensagem: r.mensagem, renovado: r.renovado === true } : null);
      setStep(2);
    } catch (e) {
      if (e.status === 409 && e.codigo === 'possivel_duplicado') {
        setDup({ onde: e.onde || 'pedido_pendente' });
      } else if (e.codigo === 'grupo_incompativel') {
        // O servidor confirmou a trava de gênero/idade — painel com saída clara.
        setDup(null);
        setBloqueio({ mensagem: e.message });
      } else if (e.campo) {
        // Erro de validação do servidor aponta o campo — pinta e rola até ele.
        setDup(null);
        setErrosCampos(p => ({ ...p, [e.campo]: e.message }));
        scrollAteCampo(e.campo);
      } else {
        setError(e.message || 'Não foi possível enviar. Tente novamente.');
      }
    } finally { setLoading(false); submittingRef.current = false; }
  };

  const submit = () => doSubmit();

  return (
    <PublicPaletteCtx.Provider value={C}>
    <div style={{
      // 100dvh (viewport dinâmico do iOS) + rolagem livre + cartão centralizado
      // via margin:auto. O antigo 100vh + overflow:hidden + alignItems:center
      // cortava o rodapé do cartão no iPhone (bug do teste de 13/07).
      minHeight: '100dvh', display: 'flex',
      position: 'relative',
      padding: 'clamp(20px, 5vw, 40px) clamp(10px, 3vw, 16px)',
      paddingBottom: 'calc(clamp(20px, 5vw, 40px) + env(safe-area-inset-bottom, 0px))',
      background: C.pageBg,
    }}>
      {/* Fundo decorativo num layer próprio: o clip saiu do container da página
          pra não engolir conteúdo maior que a tela. */}
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <AnimatedBackground />
      </div>
      <PublicThemeToggle />

      <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 720, margin: 'auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 'clamp(14px, 3vw, 24px)' }}>
          <h1 style={{
            fontSize: 'clamp(22px, 6vw, 28px)', fontWeight: 800, margin: 0, letterSpacing: -0.5,
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
          borderRadius: 20, padding: 'clamp(14px, 3.5vw, 24px)', backdropFilter: 'blur(16px)',
        }}>
          {step === 2 ? (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <CheckCircle2 size={56} style={{ color: '#10b981', margin: '0 auto 16px' }} />
              <h2 style={{ color: C.text, fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
                {resultado ? (resultado.renovado ? 'Inscrição renovada!' : 'Tudo certo!') : 'Pedido enviado!'}
              </h2>
              <p style={{ color: C.text3, fontSize: 14, lineHeight: 1.6 }}>
                {resultado ? (
                  resultado.mensagem
                ) : (
                  <>
                    Seu pedido para entrar no grupo <strong style={{ color: C.text }}>{grupoEscolhido?.nome}</strong> foi
                    enviado. O líder vai analisar e você recebe a confirmação no seu WhatsApp em breve.
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
              {avisoDeepLink && (
                <div style={{
                  padding: '10px 12px', marginBottom: 14, borderRadius: 10,
                  background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.5)',
                  fontSize: 12.5, color: C.isDark ? '#fbbf24' : '#92400e', lineHeight: 1.55,
                }}>
                  O grupo <strong>{avisoDeepLink.grupoNome}</strong> não está recebendo inscrições no momento.
                  Veja abaixo os grupos com inscrições abertas.
                </div>
              )}
              <h2 style={{ color: C.text, fontSize: 16, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={18} style={{ color: '#00B39D' }} /> 1. Escolha o grupo
              </h2>
              <GrupoSelector
                mode="full"
                usePublicApi
                temporadaId={temporadaParam || undefined}
                preferirAberta
                selectedGrupoId={grupoEscolhido?.id}
                onSelect={setGrupoEscolhido}
                onInscrever={(g) => { setGrupoEscolhido(g); setStep(1); }}
              />
            </div>
          ) : (
            <div>
              <button onClick={() => setStep(0)} style={{
                background: 'none', border: 'none', color: '#00B39D', display: 'flex', alignItems: 'center',
                gap: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, marginBottom: 8, padding: '8px 0', minHeight: 40,
              }}>
                <ArrowLeft size={16} /> Voltar à escolha do grupo
              </button>
              <h2 style={{ color: C.text, fontSize: 16, fontWeight: 700, marginBottom: 4 }}>2. Seus dados</h2>
              <p style={{ color: C.text3, fontSize: 12, marginBottom: preenchidoViaLink ? 8 : 16 }}>
                Para o grupo <strong style={{ color: C.text }}>{grupoEscolhido?.nome}</strong>
              </p>
              {preenchidoViaLink && (
                <div style={{
                  padding: '8px 12px', marginBottom: 14, borderRadius: 10,
                  background: 'rgba(0,179,157,0.10)', border: '1px solid rgba(0,179,157,0.45)',
                  fontSize: 12.5, color: C.isDark ? '#5eead4' : '#0f766e', lineHeight: 1.5,
                }}>
                  Seus dados já vieram preenchidos — confira, complete o CPF e envie.
                </div>
              )}

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
              </div>

              {/* Grupo de outro gênero (única trava · 14/07) — BLOQUEIA com
                  saída clara, preservando tudo que a pessoa digitou. */}
              {(bloqueio?.mensagem || bloqueioLocal) ? (
                <div style={{
                  padding: '12px 14px', marginBottom: 12, borderRadius: 10,
                  background: 'rgba(239, 68, 68, 0.10)', border: '1px solid rgba(239, 68, 68, 0.55)',
                  fontSize: 13, color: C.isDark ? '#fca5a5' : '#991b1b', lineHeight: 1.55,
                }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>{bloqueio?.mensagem || bloqueioLocal}</p>
                  <p style={{ margin: '6px 0 10px', opacity: 0.9 }}>
                    Procure um grupo que combine com você — seus dados ficam guardados, não precisa digitar de novo.
                  </p>
                  <button type="button" onClick={procurarOutroGrupo} style={{
                    padding: '10px 18px', borderRadius: 8, background: '#00B39D', color: '#fff',
                    border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: 13,
                  }}>
                    Procurar outro grupo
                  </button>
                </div>
              ) : avisoFaixa ? (
                <div style={{
                  padding: '10px 12px', marginBottom: 12, borderRadius: 10,
                  background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.5)',
                  fontSize: 12.5, color: C.isDark ? '#fbbf24' : '#92400e', lineHeight: 1.55,
                }}>
                  <p style={{ margin: 0 }}>⚠ {avisoFaixa} Siga em frente se for pra você, ou volte e escolha outro grupo.</p>
                </div>
              ) : null}

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
                    color: C.text, fontSize: 16, fontFamily: 'inherit', boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* honeypot */}
              <input type="text" value={form.website} onChange={set('website')} style={{ position: 'absolute', left: -9999, opacity: 0 }} tabIndex={-1} autoComplete="off" />

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

              {/* Botão sempre clicável (só trava durante o envio): clicar com
                  campo inválido PINTA o campo e explica o que falta — botão
                  apagado sem motivo era parte da confusão do teste de 13/07.
                  Some quando o grupo é incompatível (o painel acima dá o caminho). */}
              {!(bloqueio?.mensagem || bloqueioLocal) && (
                <button onClick={submit} disabled={loading} style={{
                  width: '100%', padding: '12px', borderRadius: 10,
                  background: loading ? 'rgba(0,179,157,0.3)' : '#00B39D',
                  color: '#fff', fontWeight: 700, border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer', fontSize: 14,
                }}>
                  {loading ? 'Enviando...' : 'Enviar pedido'}
                </button>
              )}
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
          padding: '8px 14px', minHeight: 44, boxSizing: 'border-box', borderRadius: 8, border: `1px solid #00B39D`, color: '#00B39D',
          fontWeight: 600, fontSize: 13, cursor: uploading ? 'wait' : 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent',
        }}>
          <Camera size={15} />
          {uploading ? 'Enviando...' : (fotoUrl ? 'Trocar foto' : 'Tirar foto ou escolher da galeria')}
          {/* SEM `capture`: com ele o celular forçava a câmera — sem, o seletor
              nativo oferece câmera E galeria (pedido do teste de 13/07). */}
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

function Field({ label, error, campo, ...rest }) {
  const C = usePublicPalette();
  return (
    <div data-campo={campo}>
      <label style={{ fontSize: 12, color: C.text3, display: 'block', marginBottom: 4 }}>{label}</label>
      <input {...rest} aria-invalid={!!error} style={{
        width: '100%', padding: '9px 12px', borderRadius: 8,
        border: `1px solid ${error ? '#ef4444' : C.inputBorder}`,
        background: C.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
        // ≥16px: abaixo disso o iOS dá zoom automático ao focar o campo.
        color: C.text, fontSize: 16, boxSizing: 'border-box',
      }} />
      {error && <p style={{ fontSize: 11.5, color: '#ef4444', margin: '4px 0 0' }}>{error}</p>}
    </div>
  );
}
