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
//
// ⚠️⚠️ E UMA LEI NOVA (11/09/2026): **"Obrigado" só depois de saber que deu
// certo.** A tela agradecia ANTES de o envio subir, e a fila offline não
// retenta 400 — então resposta recusada pelo servidor (CPF com um dígito
// trocado, por exemplo) morria no localStorage com a pessoa convicta de ter
// respondido. Agora o envio é esperado por até 6s: recusa DEFINITIVA (400/409)
// volta pra tela com o motivo e o formulário INTACTO; só falha de rede, 429 e
// 5xx caem na fila — que é exatamente o que a fila existe para resolver.
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { podeAplicarRascunho, soDigitos } from '@/lib/censoRascunho';
import { useParams, useSearchParams } from 'react-router-dom';
// ⚠️ DIRETO de `lib/censoApi`, NUNCA de `../../api` (11/09/2026): `api.js`
// importa o supabase-js e o Sentry e abre sessão no carregamento do módulo. Esta
// página é pública, aberta por centenas de celulares ao mesmo tempo no culto —
// ela não pode arrastar o ERP. Ver o cabeçalho de `lib/censoApi.js`.
import { censoPublico } from '@/lib/censoApi';
import type { Pergunta, Respostas } from '@/lib/censoForm';
import { cpfValido, limparInvisiveis } from '@/lib/censoForm';
import CensoForm from '@/components/censo/CensoForm';
import { PublicPaletteCtx, PublicThemeToggle, usePublicTheme } from './publicTheme';
import { usePermitirZoom } from '@/lib/viewportZoom';
// ⚠️ LAZY de propósito: o fundo animado traz o `framer-motion`, que não pode
// estar no caminho crítico de quem abriu o QR no culto. A tela é a mesma; a
// decoração entra quando chegar.
const AnimatedBackground = lazy(() => import('./AnimatedBackground'));

type Pesquisa = {
  slug: string; titulo: string; subtitulo?: string | null;
  perguntas: Pergunta[]; consentimento_texto?: string | null;
  config?: Record<string, unknown>;
};

const TEAL = '#00B39D';
const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** Quanto tempo esperamos o servidor antes de cair na fila e agradecer.
 *  ⚠️ Teto, não promessa: no culto ninguém fica olhando spinner, mas 6s
 *  cobrem o retry com backoff do `api.js` no caso normal. */
const ESPERA_ENVIO_MS = 6000;

type ErroHttp = { status?: number; dados?: { faltando?: string[] } };

/** 409 = a pessoa já respondeu. Não é erro: é informação. */
function ehJaRespondeu(e: unknown): boolean {
  return (e as ErroHttp)?.status === 409;
}
/** O servidor recusou o CONTEÚDO. Re-enviar igual dá o mesmo resultado. */
function ehRecusaDefinitiva(e: unknown): boolean {
  const st = (e as ErroHttp)?.status;
  return st === 400 || st === 404 || st === 422;
}
/** Traduz a recusa em algo que a pessoa possa consertar, com o NOME do campo. */
function motivoDaRecusa(e: unknown, perguntas: Pergunta[]): { mensagem: string; campos: string[] } {
  const ids = (e as ErroHttp)?.dados?.faltando || [];
  const nome = (id: string) => perguntas.find((p) => p.id === id)?.texto || id;
  return {
    mensagem: (e instanceof Error && e.message) || 'O servidor não aceitou a resposta.',
    campos: ids.map(nome),
  };
}

/**
 * A caixinha do reconhecimento por CPF + nascimento. SÓ APRESENTAÇÃO.
 *
 * ⚠️⚠️ ELA VIVE AQUI, FORA DO COMPONENTE DA PÁGINA, E ISSO É O CONSERTO
 * (11/09/2026). Antes era uma `function` declarada DENTRO do `CensoPublica` e
 * usada como `<ConfirmarIdentidade />`: a cada render o React via um TIPO NOVO
 * de componente, **remontava** e zerava o `useRef` que impedia consultar o
 * mesmo par CPF+nascimento duas vezes. Medido em produção: **19 POSTs no
 * /prefill para 21 teclas digitadas** no campo "Nome completo" — e só para quem
 * NÃO é achado na base, que num censo é justamente o grupo maior. Com 500
 * pessoas isso passa dos 6.000/15min do balde de lookup.
 *
 * A busca agora é um efeito no PAI (refs estáveis) e espera a digitação PARAR.
 *
 * ⚠️ A resposta neutra cobre "não existe" E "nascimento não confere" — a tela
 * não distingue os dois de propósito. Distinguir devolveria o oráculo de
 * convicção religiosa que foi fechado em 17/08 (LGPD art. 5º, II).
 */
function CaixaIdentidade({ etapa, C }: {
  etapa: 'nascimento' | 'buscando' | 'nao_achou';
  C: ReturnType<typeof usePublicTheme>['C'];
}) {
  const caixa: React.CSSProperties = {
    marginBottom: 20, padding: 14, borderRadius: 11,
    border: `1px solid ${C.cardBorder}`, background: C.optionBg,
  };
  if (etapa === 'buscando') {
    return <div style={caixa}><p style={{ fontSize: 13, color: C.text3, margin: 0 }}>Procurando seu cadastro…</p></div>;
  }
  if (etapa === 'nao_achou') {
    return (
      <div style={caixa}>
        <p style={{ fontSize: 13, color: C.text3, margin: 0, lineHeight: 1.5 }}>
          Não achamos um cadastro com esse CPF e essa data de nascimento — sem
          problema, e pode ser só a data. Confira o nascimento acima; se estiver
          certo, é só seguir: a gente cria o seu cadastro ao receber o censo.
        </p>
      </div>
    );
  }
  return (
    <div style={caixa}>
      <p style={{ fontSize: 13, color: C.text2, margin: '0 0 10px', lineHeight: 1.5 }}>
        Responda a <strong>data de nascimento</strong> logo abaixo — é a terceira
        pergunta — e a gente traz o que já temos do seu cadastro.
      </p>
      <p style={{ fontSize: 12, color: C.textDim, margin: 0 }}>
        Assim você não digita nada duas vezes.
      </p>
    </div>
  );
}

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
  /** Recusa DEFINITIVA do servidor (400/404/422). Insistir não resolve: quem
   *  resolve é a pessoa corrigindo o campo, então isto vai pra tela. */
  const [erroEnvio, setErroEnvio] = useState<{ mensagem: string; campos: string[] } | null>(null);
  /** Etapa do reconhecimento por CPF+nascimento. ⚠️ MORA NO PAI — ver o efeito. */
  const [etapaIdent, setEtapaIdent] = useState<'nascimento' | 'buscando' | 'nao_achou'>('nascimento');

  // Identidade: `?t=` (link pessoal ou app) ou o token que o /prefill devolve.
  const [identidade, setIdentidade] = useState<string | null>(searchParams.get('t'));
  // Guarda o token que veio na URL: `identidade` muda quando o /prefill emite
  // um, e o efeito abaixo não pode disparar de novo por causa disso.
  const tokenDaUrl = useRef<string | null>(searchParams.get('t'));
  const canal = searchParams.get('canal') === 'app' ? 'app' : searchParams.get('t') ? 'link' : 'qr';

  const iniciadaEm = useRef(new Date().toISOString());
  const envioId = useRef<string>('');
  /** Enunciados das perguntas para a fila (que roda fora do render) poder
   *  NOMEAR o campo recusado em vez de mostrar um id. */
  const perguntasRef = useRef<Pergunta[]>([]);
  /** As respostas mais recentes, para callbacks assíncronos não lerem closure
   *  velho (o prefill volta 600ms+ depois de o efeito rodar). */
  const respostasRef = useRef<Respostas>({});
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
      catch (e) {
        // ⚠️⚠️ RECUSA DEFINITIVA SAI DA FILA. Antes tudo voltava pra fila e era
        // retentado a cada 8s: um 400 (dado que o servidor nunca vai aceitar)
        // virava laço infinito, e a resposta ficava presa no aparelho sem
        // ninguém saber. Insistir só faz sentido contra rede/429/5xx.
        if (ehJaRespondeu(e)) { setJaRespondeu(true); continue; }
        if (ehRecusaDefinitiva(e)) { setErroEnvio(motivoDaRecusa(e, perguntasRef.current)); continue; }
        restante.push(item);
      }
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

  // ⚠️ AQUI EM CIMA, e não depois do JSX: `const` não é hoisted (TDZ) e o efeito
  // de reconhecimento abaixo usa `perguntas`. Mesma classe de armadilha do
  // `LOTE_MAX` em `routes/censo.js` — erro que só aparece quando a linha roda.
  const perguntas = pesquisa?.perguntas || [];
  // A fila roda fora do render e precisa dos enunciados pra nomear o campo.
  perguntasRef.current = perguntas;
  // O prefill volta depois do debounce: precisa das respostas de AGORA.
  respostasRef.current = respostas;

  // ── Reconhecimento do cadastro por CPF + nascimento ──────────────────────
  //
  // ⚠️⚠️ ESTE EFEITO MORA NO PAI DE PROPÓSITO (11/09/2026). A guarda que impede
  // consultar o mesmo par duas vezes é um `useRef`, e ref só é estável se o
  // componente não remontar — ver o comentário de `CaixaIdentidade`.
  //
  // ⚠️ Só dispara quando a digitação PARA (600ms) e só com CPF de dígito
  // verificador válido. Os dois juntos derrubam a consulta de ~1 por tecla para
  // 1 por pessoa: enquanto ela digita, o `clearTimeout` da limpeza cancela a
  // anterior; CPF pela metade (ou com um dígito trocado) nem sai do aparelho.
  //
  // ⚠️⚠️ EXIGE OS DOIS, SEMPRE. O estágio "só o CPF" — que devolvia nome
  // mascarado para a tela perguntar "é você?" — morreu em 17/08/2026: ele
  // respondia, a qualquer um com um CPF na mão, se a pessoa está na base da
  // CBRio, e estar na base de uma igreja revela CONVICÇÃO RELIGIOSA, que é dado
  // sensível (LGPD art. 5º, II). Esta página é pública e o QR vai ao telão.
  const parConsultado = useRef('');
  const pCpf = perguntas.find((q) => q.formato === 'cpf');
  const pNasc = perguntas.find((q) => q.preenche_de === 'data_nascimento');
  const cpfDigitado = soDigitos(pCpf ? respostas[pCpf.id] : '');
  const nascDigitado = String(pNasc ? respostas[pNasc.id] ?? '' : '');

  useEffect(() => {
    if (identidade || preenchido) return;                       // já reconhecida
    if (cpfDigitado.length !== 11 || !/^\d{4}-\d{2}-\d{2}$/.test(nascDigitado)) return;
    if (!cpfValido(cpfDigitado)) return;                        // o servidor diria o mesmo
    const par = `${cpfDigitado}|${nascDigitado}`;
    if (parConsultado.current === par) return;

    const t = setTimeout(() => {
      parConsultado.current = par;
      setEtapaIdent('buscando');
      censoPublico.prefill(slug, { cpf: cpfDigitado, data_nascimento: nascDigitado })
        .then((r) => {
          if (!r?.encontrado) { setEtapaIdent('nao_achou'); return; }
          if (r.ja_respondeu) { setJaRespondeu(true); return; }
          setIdentidade(r.identidade);
          // ⚠️ O QUE A PESSOA DIGITOU VENCE (11/09/2026). Este caminho fazia o
          // contrário — `{...respostas, ...r.valores}` — e o cadastro
          // sobrescrevia o nome que ela acabou de escrever, sob os dedos dela.
          // O caminho do app (token) já era assim; agora os dois concordam: o
          // cadastro é ponto de partida, não verdade final.
          // ⚠️ Lê do REF, não do closure: entre o efeito e a volta do servidor
          // passam 600ms de debounce + a viagem, e nesse tempo ela digitou mais.
          const novas = { ...(r.valores || {}), ...respostasRef.current };
          setRespostas(novas);
          gravarLocal(novas);
          setPreenchido(true);
        })
        .catch(() => setEtapaIdent('nao_achou'));
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cpfDigitado, nascDigitado, identidade, preenchido, slug]);

  function aoMudar(novas: Respostas) {
    setRespostas(novas);
    gravarLocal(novas);            // a cada toque, sem rede
    // ⚠️ O PORTÃO do rascunho: assim que o CPF completo é digitado, e SÓ se for
    // o mesmo que gerou o rascunho guardado, o resto volta pra tela. É o que
    // impede o aparelho compartilhado de mostrar o dado de quem preencheu antes.
    aplicarRascunhoSeForDono(cpfDasRespostas(novas));
  }


  async function enviar() {
    if (!pesquisa) return;
    setEnviando(true);
    setErroEnvio(null);
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

    /** Deu certo (ou vai dar, pela fila): limpa o aparelho e agradece. */
    const agradecer = (cuidados: string[] = []) => {
      localStorage.removeItem(RASCUNHO);
      localStorage.removeItem(LOCAL);
      setPronto({ cuidados });
      setEnviando(false);
    };

    // ⚠️⚠️ ESPERA O SERVIDOR — até 6s. É a diferença entre "Obrigado" verdadeiro
    // e "Obrigado" que esconde uma resposta recusada. O `api.js` já retenta
    // 403/429/5xx com backoff por dentro, então o que chega aqui como erro com
    // status é veredito, não soluço de rede.
    const tentativa = censoPublico.responder(slug, payload)
      .then((r: { cuidados?: string[] } | undefined) => ({ ok: true as const, r }))
      .catch((e: unknown) => ({ ok: false as const, e }));
    const lento = new Promise<{ lento: true }>((res) => setTimeout(() => res({ lento: true }), ESPERA_ENVIO_MS));
    const corrida = await Promise.race([tentativa, lento]);

    if ('lento' in corrida) {
      // Rede ruim de templo cheio: a fila assume e a pessoa segue a vida. Se a
      // requisição em voo terminar depois, o `envio_id` faz a fila receber
      // "repetido: true" e sair sozinha.
      salvarFila([...lerFila(), { payload }]);
      agradecer();
      subirFila();
      return;
    }
    if (corrida.ok) { agradecer(corrida.r?.cuidados || []); return; }

    const e = corrida.e;
    if (ehJaRespondeu(e)) {
      // Não é perda: a resposta dela já está registrada.
      localStorage.removeItem(RASCUNHO);
      localStorage.removeItem(LOCAL);
      setJaRespondeu(true);
      setEnviando(false);
      return;
    }
    if (ehRecusaDefinitiva(e)) {
      // ⚠️ NÃO limpa nada e NÃO enfileira: o formulário fica na tela, com tudo
      // preenchido, para a pessoa corrigir o campo que o servidor apontou.
      setErroEnvio(motivoDaRecusa(e, perguntas));
      setEnviando(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    // Sobrou falha de rede / 5xx depois do backoff: é o caso da fila.
    salvarFila([...lerFila(), { payload }]);
    agradecer();
    subirFila();
  }

  const conteudo = useMemo(() => {
    if (carregando) return <Aviso texto="Carregando…" />;
    if (erro) return <Aviso texto={erro} tom="erro" />;
    if (!pesquisa) return <Aviso texto="Pesquisa indisponível" tom="erro" />;
    if (jaRespondeu) {
      return <Aviso titulo="Você já respondeu" texto="Obrigado! Sua resposta está registrada." />;
    }
    // ⚠️⚠️ RECUSA VENCE O "OBRIGADO". Se a resposta que estava na fila voltou
    // recusada, a tela DESDIZ o agradecimento — é feio e é honesto: a
    // alternativa é a pessoa sair achando que respondeu.
    if (erroEnvio && pronto) {
      return (
        <Aviso
          tom="erro"
          titulo="Sua resposta não foi registrada"
          texto={`${erroEnvio.mensagem}${erroEnvio.campos.length ? ` Confira: ${erroEnvio.campos.join(', ')}.` : ''} Por favor, abra o QR e responda de novo.`}
        />
      );
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
        {/* Recusa do servidor com o formulário AINDA na tela: a pessoa corrige o
            campo apontado e envia de novo, sem redigitar nada. */}
        {erroEnvio && (
          <div style={{
            marginBottom: 18, padding: '12px 14px', borderRadius: 11, fontSize: 13,
            border: '1px solid rgba(239,68,68,.45)', background: 'rgba(239,68,68,.08)', color: '#ef4444',
            lineHeight: 1.5,
          }}>
            <strong>Não conseguimos registrar sua resposta.</strong> {erroEnvio.mensagem}
            {erroEnvio.campos.length > 0 && <> Confira: <strong>{erroEnvio.campos.join(', ')}</strong>.</>}
            {' '}Corrija e toque em enviar de novo — nada do que você preencheu foi perdido.
          </div>
        )}
        {/* Confirmação de identidade: dispara do CPF que a pessoa já respondeu
            como pergunta 1 — sem caixa separada pedindo CPF de novo. */}
        {!identidade && !preenchido && cpfDigitado.length === 11 && (
          <CaixaIdentidade etapa={etapaIdent} C={palette} />
        )}
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
  }, [carregando, erro, pesquisa, pronto, jaRespondeu, respostas, enviando, consentimento, identidade,
    preenchido, erroEnvio, etapaIdent, cpfDigitado, palette]);

  return (
    <PublicPaletteCtx.Provider value={palette}>
      <div style={{ minHeight: '100vh', background: palette.pageBg, color: palette.text, position: 'relative' }}>
        {palette.shapes && <Suspense fallback={null}><AnimatedBackground /></Suspense>}
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
