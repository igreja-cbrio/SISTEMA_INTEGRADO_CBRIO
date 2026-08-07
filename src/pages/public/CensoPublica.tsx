// Página pública do censo — o que a pessoa abre pelo QR no culto.
//
// Três coisas defendem a coleta aqui, e todas nasceram de incidente real:
//
// 1. FILA OFFLINE (padrão de NpsPublica): a resposta é gravada no aparelho e
//    sobe em segundo plano com re-tentativa. Wi-Fi de templo cheio cai; sem a
//    fila, 90 campos preenchidos evaporam e a pessoa não responde de novo.
// 2. SALVAR-E-RETOMAR: o rascunho vai para o servidor conforme ela avança. Quem
//    for interrompido no meio volta de onde parou, inclusive em outro aparelho.
// 3. IDEMPOTÊNCIA: o `envio_id` é gerado aqui e viaja em toda re-tentativa, para
//    o servidor devolver a resposta que já existe em vez de criar outra. Sem
//    isso o total do censo vem inflado — e número inflado é pior que faltando.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { censoPublico } from '../../api';
import type { Pergunta, Respostas } from '@/lib/censoForm';
import { limparInvisiveis } from '@/lib/censoForm';
import CensoForm from '@/components/censo/CensoForm';
import { PublicPaletteCtx, PublicThemeToggle, usePublicTheme } from './publicTheme';
import AnimatedBackground from './AnimatedBackground';

type Pesquisa = {
  slug: string; titulo: string; subtitulo?: string | null;
  perguntas: Pergunta[]; consentimento_texto?: string | null;
  config?: Record<string, unknown>;
};

const TEAL = '#00B39D';
const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export default function CensoPublica() {
  const { slug = '' } = useParams();
  const [searchParams] = useSearchParams();
  // ⚠️ `usePublicTheme()` devolve { isDark, toggle, C } — a PALETA vem em `C`.
  // Eu tinha passado o objeto inteiro para o contexto, então `optionBg`,
  // `inputBorder` e `text` chegavam como undefined nos campos: o seletor de data
  // virava um retângulo cinza sem texto, os botões de opção perdiam a moldura e
  // "Sim"/"Não" ficavam idênticos (o estado selecionado não pintava nada).
  // Todo o resto do sistema desestrutura `C` — é a convenção, e ela existe.
  const { C: palette } = usePublicTheme();

  const [pesquisa, setPesquisa] = useState<Pesquisa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [respostas, setRespostas] = useState<Respostas>({});
  const [consentimento, setConsentimento] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState<null | { cuidados: string[] }>(null);
  const [jaRespondeu, setJaRespondeu] = useState(false);
  const [preenchido, setPreenchido] = useState(false);
  const [retomado, setRetomado] = useState(false);

  // Identidade: `?t=` (link pessoal) ou o token que o /prefill devolve.
  const [identidade, setIdentidade] = useState<string | null>(searchParams.get('t'));
  const canal = searchParams.get('canal') === 'app' ? 'app' : searchParams.get('t') ? 'link' : 'qr';

  const iniciadaEm = useRef(new Date().toISOString());
  const envioId = useRef<string>('');

  // ── chaves locais ──
  const FILA = `censo_fila_${slug}`;
  const RASCUNHO = `censo_rascunho_${slug}`;
  // Rascunho LOCAL, gravado a cada toque. O rascunho do servidor vai a cada
  // bloco (para não fazer 300 mil requisições num culto), então sozinho ele
  // perde o que foi digitado no meio de um bloco — e não salva nada offline.
  // Este aqui é síncrono, funciona sem rede e sobrevive a recarregar a página.
  const LOCAL = `censo_respostas_${slug}`;

  const lerLocal = useCallback((): { respostas: Respostas; iniciada_em?: string } | null => {
    try { return JSON.parse(localStorage.getItem(LOCAL) || 'null'); } catch { return null; }
  }, [LOCAL]);
  const gravarLocal = useCallback((r: Respostas) => {
    try {
      localStorage.setItem(LOCAL, JSON.stringify({
        respostas: r, iniciada_em: iniciadaEm.current, em: new Date().toISOString(),
      }));
    } catch { /* quota / modo privado: o formulário continua funcionando */ }
  }, [LOCAL]);

  const lerFila = useCallback((): { payload: unknown }[] => {
    try { return JSON.parse(localStorage.getItem(FILA) || '[]'); } catch { return []; }
  }, [FILA]);
  const salvarFila = useCallback((arr: unknown[]) => {
    try { localStorage.setItem(FILA, JSON.stringify(arr)); } catch { /* quota / modo privado */ }
  }, [FILA]);

  const subirFila = useCallback(async function subir() {
    const fila = lerFila();
    if (!fila.length) return;
    const restante: unknown[] = [];
    for (const item of fila) {
      try { await censoPublico.responder(slug, item.payload); }   // 2xx → não re-enfileira
      catch { restante.push(item); }
    }
    salvarFila(restante);
    if (restante.length) setTimeout(subir, 8000);                // re-tenta até zerar
  }, [slug, lerFila, salvarFila]);

  // ── carrega o questionário e tenta retomar ──
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const p: Pesquisa = await censoPublico.obter(slug);
        if (!vivo) return;
        setPesquisa(p);

        // (a) Local primeiro: aparece na hora, mesmo sem rede.
        const local = lerLocal();
        if (vivo && local?.respostas && Object.keys(local.respostas).length) {
          setRespostas(local.respostas);
          if (local.iniciada_em) iniciadaEm.current = local.iniciada_em;
          setRetomado(true);
        }

        // (b) Depois o servidor, que pode ter rascunho de OUTRO aparelho.
        // Fica o que tiver mais resposta; empate fica com o local, que é o mais
        // novo num recarregamento.
        try {
          const salvo = JSON.parse(localStorage.getItem(RASCUNHO) || 'null');
          if (salvo?.rascunho_id && salvo?.retomar) {
            const r = await censoPublico.retomar(slug, salvo);
            if (vivo && r?.ok && !r.concluida && r.respostas) {
              const doServidor = Object.keys(r.respostas).length;
              const doAparelho = Object.keys(local?.respostas || {}).length;
              if (doServidor > doAparelho) { setRespostas(r.respostas); setRetomado(true); }
            }
            if (r?.concluida) { localStorage.removeItem(RASCUNHO); localStorage.removeItem(LOCAL); }
          }
        } catch { /* rascunho velho ou inválido: começa do zero, sem alarme */ }
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : 'Pesquisa indisponível');
      }
      if (vivo) setCarregando(false);
    })();

    subirFila();   // sobe o que sobrou de uma visita anterior
    const aoOcultar = () => { for (const it of lerFila()) censoPublico.responderBeacon(slug, it.payload); };
    const onVis = () => { if (document.visibilityState === 'hidden') aoOcultar(); };
    window.addEventListener('pagehide', aoOcultar);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      vivo = false;
      window.removeEventListener('pagehide', aoOcultar);
      document.removeEventListener('visibilitychange', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // ── salva o rascunho no servidor ──
  //
  // ⚠️ Gravamos por MUDANÇA DE BLOCO, não por tempo. A primeira versão salvava a
  // cada 4s de digitação: com 2.500 pessoas preenchendo por ~8 minutos isso dava
  // 300 mil requisições (≈1.250 queries/s SUSTENTADOS) — muito mais carga que o
  // pico dos envios. Por bloco são 13 gravações por pessoa: 32 mil no total,
  // 9x menos, e no momento que faz sentido (o fim de um bloco é o checkpoint
  // natural). O piso de 15s protege de quem vai e volta entre blocos.
  const ultimoSalvo = useRef(0);
  const salvarRascunho = useCallback(async (novas: Respostas) => {
    if (Object.keys(novas).length === 0) return;
    if (Date.now() - ultimoSalvo.current < 15000) return;
    ultimoSalvo.current = Date.now();
    try {
      const salvo = JSON.parse(localStorage.getItem(RASCUNHO) || 'null');
      const r = await censoPublico.parcial(slug, {
        respostas: novas, canal,
        rascunho_id: salvo?.rascunho_id, retomar: salvo?.retomar,
      });
      if (r?.rascunho_id && r?.retomar) {
        localStorage.setItem(RASCUNHO, JSON.stringify({ rascunho_id: r.rascunho_id, retomar: r.retomar }));
      }
    } catch { /* best-effort: o aparelho tem a própria cópia na fila */ }
  }, [slug, canal, RASCUNHO]);

  // Busca no catálogo (igrejas do RJ, grupos ativos). Fica aqui porque é a
  // página que conhece a API; o campo só recebe a função.
  const buscarCatalogo = useCallback(async (catalogo: string, q: string) => {
    try {
      const r = await censoPublico.catalogo(catalogo, q);
      return r?.itens || [];
    } catch { return []; }
  }, []);

  function aoMudar(novas: Respostas) {
    setRespostas(novas);
    gravarLocal(novas);            // a cada toque, sem rede
  }

  const perguntas = pesquisa?.perguntas || [];

  function enviar() {
    if (!pesquisa) return;
    setEnviando(true);
    // Um envio_id por resposta, reusado em toda re-tentativa.
    if (!envioId.current) envioId.current = uuid();
    const salvo = (() => { try { return JSON.parse(localStorage.getItem(RASCUNHO) || 'null'); } catch { return null; } })();
    const payload = {
      // Limpa resposta de pergunta que ficou invisível no caminho: o servidor
      // descartaria de todo jeito, e mandar sujeira só atrasa o envio.
      respostas: limparInvisiveis(perguntas, respostas),
      consentimento: true,
      envio_id: envioId.current,
      canal,
      identidade,
      iniciada_em: iniciadaEm.current,
      rascunho_id: salvo?.rascunho_id,
      retomar: salvo?.retomar,
    };

    // Enfileira e agradece NA HORA. O upload roda em segundo plano — a pessoa no
    // culto não fica olhando um spinner enquanto a borda decide responder.
    salvarFila([...lerFila(), { payload }]);
    localStorage.removeItem(RASCUNHO);
    localStorage.removeItem(LOCAL);
    setPronto({ cuidados: [] });
    setEnviando(false);
    subirFila();
  }

  const conteudo = useMemo(() => {
    if (carregando) return <Aviso texto="Carregando…" />;
    if (erro) return <Aviso texto={erro} tom="erro" />;
    if (!pesquisa) return <Aviso texto="Pesquisa indisponível" tom="erro" />;
    if (jaRespondeu) {
      return <Aviso titulo="Você já respondeu" texto="Obrigado! Sua resposta está registrada." />;
    }
    if (pronto) {
      return (
        <Aviso
          titulo="Obrigado!"
          texto="Sua resposta foi registrada. Se você pediu contato, alguém da equipe vai falar com você."
        />
      );
    }
    return (
      <>
        {/* Confirmação de identidade: dispara do CPF que a pessoa já respondeu
            como pergunta 1 — sem caixa separada pedindo CPF de novo. */}
        {!identidade && !preenchido && <ConfirmarIdentidade />}
        <CensoForm
          perguntas={perguntas}
          respostas={respostas}
          onChange={aoMudar}
          onBlocoConcluido={salvarRascunho}
          buscarCatalogo={buscarCatalogo}
          onEnviar={enviar}
          enviando={enviando}
          consentimentoTexto={pesquisa.consentimento_texto}
          consentimento={consentimento}
          onConsentimento={setConsentimento}
        />
      </>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregando, erro, pesquisa, pronto, jaRespondeu, respostas, enviando, consentimento, identidade, preenchido]);

  return (
    <PublicPaletteCtx.Provider value={palette}>
      <div style={{ minHeight: '100vh', background: palette.pageBg, color: palette.text, position: 'relative' }}>
        {palette.shapes && <AnimatedBackground />}
        <div style={{ position: 'relative', maxWidth: 620, margin: '0 auto', padding: '28px 18px 64px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <PublicThemeToggle />
          </div>

          {retomado && !pronto && !jaRespondeu && (
            <div style={{
              marginBottom: 16, padding: '10px 14px', borderRadius: 10, fontSize: 13,
              background: 'color-mix(in srgb, #00B39D 12%, transparent)',
              border: '1px solid color-mix(in srgb, #00B39D 35%, transparent)',
              color: palette.text2,
            }}>
              Recuperamos o que você já havia preenchido — pode continuar de onde parou.
            </div>
          )}

          {pesquisa && !pronto && !jaRespondeu && (
            <header style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: 23, fontWeight: 700, margin: 0, lineHeight: 1.25 }}>{pesquisa.titulo}</h1>
              {pesquisa.subtitulo && (
                <p style={{ fontSize: 14, color: palette.text3, margin: '8px 0 0', lineHeight: 1.5 }}>
                  {pesquisa.subtitulo}
                </p>
              )}
            </header>
          )}

          <div style={{
            background: palette.card, border: `1px solid ${palette.cardBorder}`,
            borderRadius: 16, padding: '22px 18px',
            backdropFilter: palette.isDark ? 'blur(10px)' : undefined,
          }}>
            {conteudo}
          </div>

          {!pronto && !jaRespondeu && (
            <p style={{ fontSize: 12, color: palette.textDim, textAlign: 'center', marginTop: 18, lineHeight: 1.5 }}>
              Suas respostas ficam salvas neste aparelho — se algo acontecer, você
              volta de onde parou.
            </p>
          )}
        </div>
      </div>
    </PublicPaletteCtx.Provider>
  );

  /**
   * Confirmação de identidade, disparada pelo CPF que a pessoa JÁ respondeu na
   * pergunta 1 — sem pedir CPF numa caixa separada (era redundante).
   *
   * Duas etapas, e a divisão é de propósito:
   *   1. só com o CPF, o servidor devolve o nome MASCARADO ("Matheus R. T.") e a
   *      tela pergunta "é você?". Nome inteiro a partir de CPF sozinho faria
   *      deste endereço um consultor de CPF → nome, e CPF vaza e se compra.
   *   2. ao confirmar, pede o NASCIMENTO — que é a pergunta 3 do censo. A pessoa
   *      responde uma vez e serve para as duas coisas: confirmar quem é e
   *      responder a pergunta.
   *
   * Quem não é encontrado segue normalmente: o cadastro é criado no envio.
   */
  function ConfirmarIdentidade() {
    const pCpf = perguntas.find((q) => q.formato === 'cpf');
    const pNasc = perguntas.find((q) => q.preenche_de === 'data_nascimento');
    const cpfDigitado = String(pCpf ? respostas[pCpf.id] ?? '' : '').replace(/\D/g, '');
    const nascDigitado = String(pNasc ? respostas[pNasc.id] ?? '' : '');

    const [etapa, setEtapa] = useState<'buscando' | 'confirmar' | 'nascimento' | 'nao_achou' | 'recusou'>('buscando');
    const [confirmacao, setConfirmacao] = useState<{ nome_mascarado?: string; telefone_mascarado?: string } | null>(null);
    const cpfConsultado = useRef('');

    // Etapa 1 — assim que o CPF fica completo e válido no formato.
    useEffect(() => {
      if (cpfDigitado.length !== 11 || cpfConsultado.current === cpfDigitado) return;
      cpfConsultado.current = cpfDigitado;
      setEtapa('buscando');
      censoPublico.prefill(slug, { cpf: cpfDigitado })
        .then((r) => {
          if (r?.encontrado && r.confirmar?.nome_mascarado) {
            setConfirmacao(r.confirmar);
            setEtapa('confirmar');
          } else {
            setEtapa('nao_achou');
          }
        })
        .catch(() => setEtapa('nao_achou'));
    }, [cpfDigitado]);

    // Etapa 2 — com o nascimento respondido, tenta trazer os dados.
    useEffect(() => {
      if (etapa !== 'nascimento' || !/^\d{4}-\d{2}-\d{2}$/.test(nascDigitado)) return;
      censoPublico.prefill(slug, { cpf: cpfDigitado, data_nascimento: nascDigitado })
        .then((r) => {
          if (!r?.encontrado) { setEtapa('nao_achou'); return; }
          if (r.ja_respondeu) { setJaRespondeu(true); return; }
          setIdentidade(r.identidade);
          const novas: Respostas = { ...respostas, ...(r.valores || {}) };
          setRespostas(novas);
          gravarLocal(novas);
          setPreenchido(true);
        })
        .catch(() => setEtapa('nao_achou'));
    }, [etapa, nascDigitado, cpfDigitado]);

    if (cpfDigitado.length !== 11 || etapa === 'recusou') return null;

    const caixa: React.CSSProperties = {
      marginBottom: 20, padding: 14, borderRadius: 11,
      border: `1px solid ${palette.cardBorder}`, background: palette.optionBg,
    };
    const botao = (primario: boolean): React.CSSProperties => ({
      padding: '10px 16px', borderRadius: 9, fontSize: 14, cursor: 'pointer',
      fontFamily: 'inherit', fontWeight: primario ? 600 : 400,
      border: primario ? 'none' : `1px solid ${palette.inputBorder}`,
      background: primario ? TEAL : 'transparent',
      color: primario ? '#062b26' : palette.text3,
    });

    if (etapa === 'buscando') {
      return <div style={caixa}><p style={{ fontSize: 13, color: palette.text3, margin: 0 }}>Procurando seu cadastro…</p></div>;
    }

    if (etapa === 'nao_achou') {
      return (
        <div style={caixa}>
          <p style={{ fontSize: 13, color: palette.text3, margin: 0, lineHeight: 1.5 }}>
            Não encontramos um cadastro com esse CPF — sem problema. Preencha as
            perguntas abaixo que a gente cria o seu cadastro ao receber o censo.
          </p>
        </div>
      );
    }

    if (etapa === 'confirmar') {
      return (
        <div style={caixa}>
          <p style={{ fontSize: 15, color: palette.text, margin: '0 0 4px', fontWeight: 600 }}>
            Você é {confirmacao?.nome_mascarado}?
          </p>
          {confirmacao?.telefone_mascarado && (
            <p style={{ fontSize: 12, color: palette.textDim, margin: '0 0 12px' }}>
              telefone terminando em {confirmacao.telefone_mascarado}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" style={botao(true)} onClick={() => setEtapa('nascimento')}>
              Sim, sou eu
            </button>
            <button type="button" style={botao(false)} onClick={() => setEtapa('recusou')}>
              Não sou
            </button>
          </div>
        </div>
      );
    }

    // etapa === 'nascimento'
    return (
      <div style={caixa}>
        <p style={{ fontSize: 13, color: palette.text2, margin: '0 0 10px', lineHeight: 1.5 }}>
          Para confirmar que é você e já trazer seus dados, responda a
          <strong> data de nascimento</strong> logo abaixo — é a terceira pergunta.
        </p>
        <p style={{ fontSize: 12, color: palette.textDim, margin: 0 }}>
          Assim você não digita nada duas vezes.
        </p>
      </div>
    );
  }

  function Aviso({ titulo, texto, tom }: { titulo?: string; texto: string; tom?: 'erro' }) {
    return (
      <div style={{ padding: '26px 4px', textAlign: 'center' }}>
        {titulo && (
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', color: tom === 'erro' ? '#ef4444' : TEAL }}>
            {titulo}
          </h2>
        )}
        <p style={{ fontSize: 15, color: tom === 'erro' ? '#ef4444' : palette.text2, margin: 0, lineHeight: 1.5 }}>
          {texto}
        </p>
      </div>
    );
  }
}
