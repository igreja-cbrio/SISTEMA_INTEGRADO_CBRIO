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
        {/* Atalho da especificação ("nome auto pelo CPF, se já cadastrado").
            É atalho, não catraca: quem não usa preenche tudo à mão e responde
            igual — o próprio formulário pede nome, telefone e e-mail. */}
        {!identidade && !preenchido && <Prefill />}
        <CensoForm
          perguntas={perguntas}
          respostas={respostas}
          onChange={aoMudar}
          onBlocoConcluido={salvarRascunho}
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
   * Bloco opcional de identificação. Manda CPF + nascimento e recebe de volta o
   * token de identidade + os campos que a pessoa acabou de provar que são dela.
   * Nunca diz se o CPF existe: a resposta é a mesma nos dois casos, porque CPF
   * vaza e se compra.
   */
  function Prefill() {
    const [cpf, setCpf] = useState('');
    const [nasc, setNasc] = useState('');
    const [checando, setChecando] = useState(false);
    const [naoAchou, setNaoAchou] = useState(false);

    const inp: React.CSSProperties = {
      width: '100%', padding: '10px 12px', borderRadius: 9, fontSize: 15,
      border: `1px solid ${palette.inputBorder}`, background: palette.optionBg,
      color: palette.text, boxSizing: 'border-box', fontFamily: 'inherit',
    };

    async function checar() {
      const so = cpf.replace(/\D/g, '');
      if (so.length !== 11 || !nasc) return;
      setChecando(true); setNaoAchou(false);
      try {
        const r = await censoPublico.prefill(slug, { cpf: so, data_nascimento: nasc });
        if (!r?.encontrado) { setNaoAchou(true); return; }
        if (r.ja_respondeu) { setJaRespondeu(true); return; }
        setIdentidade(r.identidade);
        // O servidor devolve por PERGUNTA e já casado com as opções (o cadastro
        // guarda 'casado', a opção é 'Casado(a)'). Casar é responsabilidade de
        // quem tem as opções — o servidor —, não de duas réguas paralelas.
        const novas: Respostas = { ...respostas, ...(r.valores || {}) };
        setRespostas(novas);
        gravarLocal(novas);
        setPreenchido(true);
      } catch { setNaoAchou(true); }
      finally { setChecando(false); }
    }

    return (
      <div style={{
        marginBottom: 22, padding: 14, borderRadius: 11,
        border: `1px dashed ${palette.inputBorder}`, background: palette.optionBg,
      }}>
        <p style={{ fontSize: 13, color: palette.text3, margin: '0 0 10px', lineHeight: 1.5 }}>
          Já tem cadastro na CBRio? Informe CPF e data de nascimento para já vir
          preenchido. <span style={{ color: palette.textDim }}>(opcional)</span>
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input style={{ ...inp, flex: '1 1 150px' }} inputMode="numeric" placeholder="CPF"
            value={cpf} onChange={(e) => setCpf(e.target.value.replace(/\D/g, '').slice(0, 11))} />
          <input style={{ ...inp, flex: '1 1 150px' }} type="date" max={new Date().toISOString().slice(0, 10)}
            value={nasc} onChange={(e) => setNasc(e.target.value)} />
          <button type="button" onClick={checar} disabled={checando}
            style={{
              padding: '10px 16px', borderRadius: 9, border: 'none', background: TEAL,
              color: '#062b26', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>
            {checando ? '…' : 'Buscar'}
          </button>
        </div>
        {naoAchou && (
          <p style={{ fontSize: 12, color: palette.textDim, margin: '10px 0 0', lineHeight: 1.5 }}>
            Não encontramos com esses dados — sem problema, siga preenchendo abaixo
            que a gente cuida do resto.
          </p>
        )}
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
