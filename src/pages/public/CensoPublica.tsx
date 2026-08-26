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
import { podeAplicarRascunho, soDigitos } from '@/lib/censoRascunho';
import { useParams, useSearchParams } from 'react-router-dom';
import { censoPublico } from '../../api';
import type { Pergunta, Respostas } from '@/lib/censoForm';
import { limparInvisiveis } from '@/lib/censoForm';
import CensoForm from '@/components/censo/CensoForm';
import { PublicPaletteCtx, PublicThemeToggle, usePublicTheme } from './publicTheme';
import { usePermitirZoom } from '@/lib/viewportZoom';
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
  // Devolve o pinch-zoom nesta página: o index.html do sistema trava o zoom por
  // causa dos elementos fixos do ERP, e quem responde no culto precisa poder
  // aproximar. Restaura a trava ao sair.
  usePermitirZoom();

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

  // Identidade: `?t=` (link pessoal ou app) ou o token que o /prefill devolve.
  const [identidade, setIdentidade] = useState<string | null>(searchParams.get('t'));
  // Guarda o token que veio na URL: `identidade` muda quando o /prefill emite
  // um, e o efeito abaixo não pode disparar de novo por causa disso.
  const tokenDaUrl = useRef<string | null>(searchParams.get('t'));
  const canal = searchParams.get('canal') === 'app' ? 'app' : searchParams.get('t') ? 'link' : 'qr';

  const iniciadaEm = useRef(new Date().toISOString());
  const envioId = useRef<string>('');
  /**
   * O rascunho lido do aparelho, AINDA NÃO aplicado.
   *
   * ⚠️ Fica aqui, fora do estado, de propósito: no estado ele iria pra tela, e
   * é justamente isso que não pode acontecer antes de a pessoa provar que é ela
   * (ver o bloco de restauração). O `retomar` do SERVIDOR usa o mesmo portão.
   */
  const rascunhoGuardado = useRef<{ respostas: Respostas; iniciada_em?: string; dono_cpf?: string | null } | null>(null);
  const rascunhoServidor = useRef<{ respostas: Respostas } | null>(null);

  // ── chaves locais ──
  const FILA = `censo_fila_${slug}`;
  const RASCUNHO = `censo_rascunho_${slug}`;
  // Rascunho LOCAL, gravado a cada toque. O rascunho do servidor vai a cada
  // bloco (para não fazer 300 mil requisições num culto), então sozinho ele
  // perde o que foi digitado no meio de um bloco — e não salva nada offline.
  // Este aqui é síncrono, funciona sem rede e sobrevive a recarregar a página.
  const LOCAL = `censo_respostas_${slug}`;

  const lerLocal = useCallback((): { respostas: Respostas; iniciada_em?: string; dono_cpf?: string | null } | null => {
    try { return JSON.parse(localStorage.getItem(LOCAL) || 'null'); } catch { return null; }
  }, [LOCAL]);
  /** Só os dígitos do CPF que está nas respostas (a pergunta 1 tem chave `cpf`). */
  const cpfDasRespostas = (r: Respostas): string =>
    soDigitos((r as Record<string, unknown>)?.cpf);

  const gravarLocal = useCallback((r: Respostas) => {
    try {
      localStorage.setItem(LOCAL, JSON.stringify({
        respostas: r, iniciada_em: iniciadaEm.current, em: new Date().toISOString(),
        // ⚠️ DONO do rascunho · ver o bloco de restauração abaixo.
        dono_cpf: cpfDasRespostas(r) || null,
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

  /**
   * Aplica o rascunho guardado SE o CPF digitado for o de quem o gerou.
   *
   * ⚠️ Compara só dígitos (o campo tem máscara) e exige CPF completo — comparar
   * prefixo deixaria um rascunho vazar pra quem digitasse os primeiros números.
   *
   * ⚠️ Idempotente: uma vez aplicado, o rascunho sai da memória. Sem isso, a
   * pessoa que apagasse uma resposta veria ela voltar no toque seguinte.
   */
  const aplicarRascunhoSeForDono = useCallback((cpfDigitado: string) => {
    const guardado = rascunhoGuardado.current;
    // ⚠️ A régua vive em `lib/censoRascunho` e está no gate (vitest). Aqui não
    // pode haver uma segunda cópia da comparação pra divergir dela.
    if (!guardado || !podeAplicarRascunho(guardado.dono_cpf, cpfDigitado)) return;
    const doServidor = rascunhoServidor.current?.respostas;
    const escolhido = doServidor && Object.keys(doServidor).length > Object.keys(guardado.respostas).length
      ? doServidor
      : guardado.respostas;
    rascunhoGuardado.current = null;
    rascunhoServidor.current = null;
    if (guardado.iniciada_em) iniciadaEm.current = guardado.iniciada_em;
    // Não sobrescreve o que a pessoa acabou de digitar nesta sessão.
    setRespostas((atuais) => ({ ...escolhido, ...atuais }));
    setRetomado(true);
  }, []);

  // ── carrega o questionário e tenta retomar ──
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const p: Pesquisa = await censoPublico.obter(slug);
        if (!vivo) return;
        setPesquisa(p);

        // ══════════════════════════════════════════════════════════════
        // (a) Rascunho LOCAL · NÃO restaura sozinho (25/08/2026)
        // ══════════════════════════════════════════════════════════════
        //
        // ⚠️⚠️ ISTO ERA UM VAZAMENTO DE DADO PESSOAL EM APARELHO COMPARTILHADO.
        // Até aqui o rascunho era aplicado na abertura, para QUALQUER pessoa, com
        // o aviso "recuperamos o que VOCÊ já havia preenchido". Num tablet na
        // entrada do templo (ou num celular passado de mão em mão) a pessoa
        // seguinte via **cpf, nome, e-mail, telefone e nascimento** de quem
        // preencheu antes — e, se seguisse clicando, enviava a resposta sob o
        // CPF alheio.
        //
        // Medido em produção em 25/08: 5 rascunhos criados via QR em 12 minutos,
        // cada um durando 16 a 54 SEGUNDOS e chegando ao servidor com 18 a 26
        // campos preenchidos. Ninguém digita 25 campos em 26 segundos — era o
        // rascunho anterior sendo reenviado por quem abriu depois.
        //
        // ⇒ O rascunho agora fica GUARDADO e só é aplicado quando a pessoa
        // digitar o MESMO CPF que o gerou (`aplicarRascunhoSeForDono`). Quem
        // volta no próprio aparelho continua de onde parou; quem pega o aparelho
        // de outro começa do zero e não vê nada.
        //
        // ⚠️ Rascunho SEM CPF (abandonado antes da pergunta 1) nunca é aplicado.
        // É pouco dado e nenhum jeito seguro de saber de quem é.
        const local = lerLocal();
        if (vivo && local?.respostas && Object.keys(local.respostas).length && local?.dono_cpf) {
          rascunhoGuardado.current = local;
        }

        // (b) Depois o servidor, que pode ter rascunho de OUTRO aparelho.
        // Fica o que tiver mais resposta; empate fica com o local, que é o mais
        // novo num recarregamento.
        try {
          const salvo = JSON.parse(localStorage.getItem(RASCUNHO) || 'null');
          if (salvo?.rascunho_id && salvo?.retomar) {
            const r = await censoPublico.retomar(slug, salvo);
            if (vivo && r?.ok && !r.concluida && r.respostas) {
              // ⚠️ MESMO PORTÃO do rascunho local: o do servidor também não vai
              // pra tela sozinho. Ele é retomado por um id guardado NESTE
              // aparelho, então numa máquina compartilhada carrega o mesmo risco
              // — e este caminho é ainda pior, porque traz dado de OUTRO
              // aparelho da mesma pessoa... ou de quem usou este antes.
              const doServidor = Object.keys(r.respostas).length;
              const doAparelho = Object.keys(rascunhoGuardado.current?.respostas || {}).length;
              if (doServidor > doAparelho) rascunhoServidor.current = { respostas: r.respostas };
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

  // Chegou por link pessoal ou pelo app: a identidade já está provada, então
  // buscamos o cadastro direto. Pedir CPF + nascimento a quem acabou de fazer
  // login com senha seria atrito sem garantia nenhuma a mais.
  useEffect(() => {
    const t = tokenDaUrl.current;
    if (!t || !slug || !pesquisa) return;
    let vivo = true;
    censoPublico.prefill(slug, { identidade: t })
      .then((r) => {
        if (!vivo || !r?.encontrado) return;
        if (r.ja_respondeu) { setJaRespondeu(true); return; }
        // Não sobrescreve o que a pessoa já digitou nesta sessão (rascunho
        // local): o cadastro é ponto de partida, não a verdade final.
        setRespostas((atuais) => ({ ...(r.valores || {}), ...atuais }));
        setPreenchido(true);
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [slug, pesquisa]);

  function aoMudar(novas: Respostas) {
    setRespostas(novas);
    gravarLocal(novas);            // a cada toque, sem rede
    // ⚠️ O PORTÃO do rascunho: assim que o CPF completo é digitado, e SÓ se for
    // o mesmo que gerou o rascunho guardado, o resto volta pra tela. É o que
    // impede o aparelho compartilhado de mostrar o dado de quem preencheu antes.
    aplicarRascunhoSeForDono(cpfDasRespostas(novas));
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
            <PublicThemeToggle emFluxo />
          </div>

          {retomado && !pronto && !jaRespondeu && (
            <div style={{
              marginBottom: 16, padding: '10px 14px', borderRadius: 10, fontSize: 13,
              background: 'color-mix(in srgb, #00B39D 12%, transparent)',
              border: '1px solid color-mix(in srgb, #00B39D 35%, transparent)',
              color: palette.text2,
            }}>
              Recuperamos o que você já havia preenchido neste aparelho — pode continuar de onde parou.
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
   * Reconhecimento do cadastro, a partir do CPF e do nascimento que a pessoa JÁ
   * responde nas perguntas 1 e 3 — sem caixa separada e sem pergunta extra.
   *
   * ⚠️⚠️ UMA CHAMADA SÓ, E SÓ COM OS DOIS JUNTOS (17/08/2026).
   *
   * Antes eram duas etapas: com o CPF sozinho o servidor devolvia o nome
   * mascarado e a tela perguntava "você é Matheus R. T.?". Aquilo respondia,
   * a qualquer um com um CPF na mão, se a pessoa está na base da CBRio — e
   * estar na base de uma igreja revela CONVICÇÃO RELIGIOSA, que é dado
   * sensível (LGPD art. 5º, II). Esta página é pública, o QR é projetado no
   * telão e o link curto é adivinhável: não havia nada entre um estranho e
   * essa resposta.
   *
   * A etapa de confirmação não se perdeu de verdade — ela pedia que a pessoa
   * confirmasse para si mesma um nome que ela já sabe. O que valia era o
   * nascimento, e ele continua sendo pedido, agora como única prova.
   *
   * ⚠️ Quem não é encontrado segue normalmente: o cadastro nasce no envio.
   */
  function ConfirmarIdentidade() {
    const pCpf = perguntas.find((q) => q.formato === 'cpf');
    const pNasc = perguntas.find((q) => q.preenche_de === 'data_nascimento');
    const cpfDigitado = String(pCpf ? respostas[pCpf.id] ?? '' : '').replace(/\D/g, '');
    const nascDigitado = String(pNasc ? respostas[pNasc.id] ?? '' : '');
    const temNasc = /^\d{4}-\d{2}-\d{2}$/.test(nascDigitado);

    const [etapa, setEtapa] = useState<'nascimento' | 'buscando' | 'nao_achou'>('nascimento');
    const parConsultado = useRef('');

    useEffect(() => {
      if (cpfDigitado.length !== 11 || !temNasc) return;
      const par = `${cpfDigitado}|${nascDigitado}`;
      if (parConsultado.current === par) return;
      parConsultado.current = par;
      setEtapa('buscando');
      censoPublico.prefill(slug, { cpf: cpfDigitado, data_nascimento: nascDigitado })
        .then((r) => {
          // ⚠️ Resposta neutra cobre "não existe" E "nascimento não confere" —
          // a tela não distingue os dois de propósito. Distinguir devolveria,
          // por outro caminho, o oráculo que acabou de ser fechado.
          if (!r?.encontrado) { setEtapa('nao_achou'); return; }
          if (r.ja_respondeu) { setJaRespondeu(true); return; }
          setIdentidade(r.identidade);
          const novas: Respostas = { ...respostas, ...(r.valores || {}) };
          setRespostas(novas);
          gravarLocal(novas);
          setPreenchido(true);
        })
        .catch(() => setEtapa('nao_achou'));
    }, [cpfDigitado, nascDigitado, temNasc]);

    if (cpfDigitado.length !== 11) return null;

    const caixa: React.CSSProperties = {
      marginBottom: 20, padding: 14, borderRadius: 11,
      border: `1px solid ${palette.cardBorder}`, background: palette.optionBg,
    };
    if (etapa === 'buscando') {
      return <div style={caixa}><p style={{ fontSize: 13, color: palette.text3, margin: 0 }}>Procurando seu cadastro…</p></div>;
    }

    if (etapa === 'nao_achou') {
      return (
        <div style={caixa}>
          <p style={{ fontSize: 13, color: palette.text3, margin: 0, lineHeight: 1.5 }}>
            Não achamos um cadastro com esse CPF e essa data de nascimento — sem
            problema, e pode ser só a data. Confira o nascimento acima; se
            estiver certo, é só seguir: a gente cria o seu cadastro ao receber o
            censo.
          </p>
        </div>
      );
    }

    // etapa === 'nascimento' — CPF completo, nascimento ainda não respondido
    return (
      <div style={caixa}>
        <p style={{ fontSize: 13, color: palette.text2, margin: '0 0 10px', lineHeight: 1.5 }}>
          Responda a <strong>data de nascimento</strong> logo abaixo — é a
          terceira pergunta — e a gente traz o que já temos do seu cadastro.
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
