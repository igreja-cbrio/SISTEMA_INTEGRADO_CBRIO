/**
 * ════════════════════════════════════════════════════════════════════════════
 *  CHECK-IN DO KIDS QUANDO O SISTEMA CAI
 *
 *  Incidente de 02/09/2026: o banco ficou 1h34 fora numa quarta. Num domingo
 *  de manhã (4 cultos, ~220 check-ins, pico de 125 simultâneos) isso é fila de
 *  pais na porta com o totem morto.
 *
 *  ⚠️⚠️ O QUE ESTE ARQUIVO **NÃO** FAZ: gerar código de segurança.
 *  O código de retirada tem 20 bits e a unicidade vem de um TRIGGER NO INSERT.
 *  Offline não há INSERT ⇒ não há garantia. Medido: 50 check-ins offline num
 *  namespace curto dão **70% de colisão**; 100 dão 99%. E colisão significa
 *  duas crianças com a mesma credencial de retirada.
 *  ⇒ O totem SACA de um bloco que o servidor RESERVOU enquanto havia rede
 *  (`kids_codigos_reservados`, PR #2849). Sem bloco, não há check-in offline —
 *  e isso é um NÃO honesto, não uma falha.
 *
 *  ⚠️ NÃO cacheia diagnóstico clínico (LGPD art. 11 · dado de saúde de menor
 *  num tablet de hall compartilhado). Só o BOOLEANO derivado `exige_pager`.
 *  E se ele for desconhecido, o offline entrega pager: errar para mais custa um
 *  pager, errar para menos perde uma criança que não sabe dizer o próprio nome.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { ehFalhaDeRedeOuServidor } from '@/lib/falhaDeRede';
import { createCampusRequest, getCampusHeader, getCampusOwner, isCampusSessionReady } from '@/lib/campusSession';

const K_CONSUMIDOS = 'kids_offline_consumidos';
const K_EXCECOES = 'kids_offline_excecoes';
const K_CODIGOS = 'kids_offline_codigos';
const K_FILA = 'kids_offline_fila';
const K_ESTACAO = 'kids_offline_estacao_ref';
const K_CRIANCAS = 'kids_offline_criancas';
const K_SESSAO = 'kids_offline_sessao';

/** ⚠️ Piso do bloco: abaixo disso, avisa para recarregar enquanto há rede. */
export const PISO_ALERTA_CODIGOS = 15;

export interface CriancaCache {
  id: string;
  nome: string;
  nome_norm: string;
  sala_id: string | null;
  sala_nome?: string | null;
  familia_id?: string | null;
  /** ⚠️ BOOLEANO derivado, nunca o diagnóstico. `null` = não sei → dá pager. */
  exige_pager: boolean | null;
  responsavel_nome?: string | null;
}

export interface ItemFila {
  local_id: string;
  codigo: string;            // ⚠️ SACADO do bloco. Nunca gerado aqui.
  crianca_id: string;
  crianca_nome: string;
  sala_id: string | null;
  sessao_id: string;
  responsavel_id: string;
  responsavel_nome: string;
  cultos_extras?: string[];
  responsavel_telefone?: string | null;
  checkin_at: string;        // quando ACONTECEU, não quando sincronizou
  impresso: boolean;
  tentativas: number;
  erro?: string | null;
}

function escopoAtual(): string {
  const owner=getCampusOwner(),campus=getCampusHeader()['X-Campus-Id'];
  if(!isCampusSessionReady() || !owner || !campus || campus==='consolidado') throw new Error('Selecione um campus autenticado antes de usar o modo offline.');
  return `kids_v2:${encodeURIComponent(owner)}:${encodeURIComponent(campus)}:`;
}
function ler<T>(chave: string, padrao: T, escopo=escopoAtual()): T {
  try { const v = localStorage.getItem(escopo+chave); return v ? (JSON.parse(v) as T) : padrao; }
  catch { return padrao; }
}
function gravar(chave: string, valor: unknown, escopo=escopoAtual()): void {
  // Não imprimir se a custódia não ficou persistida. Falha de quota não pode
  // permitir reusar um código que já saiu na etiqueta.
  localStorage.setItem(escopo+chave, JSON.stringify(valor));
}
export function possuiFilaLegada(): boolean {
  try { const v=JSON.parse(localStorage.getItem(K_FILA)||'[]');return Array.isArray(v)&&v.length>0; } catch { return false; }
}
export function falhaCompativelOffline(error: unknown): boolean {
  const e=error as {code?:string;corpo?:{code?:string}};
  const code=e?.code || e?.corpo?.code || '';
  if(code==='CAMPUS_CONTEXT_CHANGED' || code.startsWith('campus_') || code==='kids_fluxo_pendente') return false;
  return ehFalhaDeRedeOuServidor(error);
}

/**
 * Identidade da estação. ⚠️ É o dono do bloco: um bloco NUNCA é compartilhado
 * entre totens, e é isso que impede dois deles sacarem o mesmo código.
 * Persistido no aparelho — limpar o navegador gera outra estação e outro bloco
 * (seguro: blocos distintos nunca colidem).
 */
export function estacaoRef(): string {
  let r = ler<string>(K_ESTACAO, '');
  if (!r) {
    if (!globalThis.crypto?.randomUUID) throw new Error('Este navegador não permite reservar códigos com segurança.');
    r = `totem-${globalThis.crypto.randomUUID()}`;
    gravar(K_ESTACAO, r);
  }
  return r;
}

// ── Bloco de códigos ────────────────────────────────────────────────────────
export function guardarCodigos(codigos: string[]): void {
  // ⚠️ SUBSTITUI, não acumula: o servidor devolve o bloco INTEIRO ainda livre
  // (a RPC é idempotente). Concatenar duplicaria códigos na lista local.
  gravar(K_CODIGOS, Array.isArray(codigos) ? codigos : []);
}
export function codigosDisponiveis(): string[] {
  const consumidos=new Set(ler<string[]>(K_CONSUMIDOS, []));
  return ler<string[]>(K_CODIGOS, []).filter(c=>!consumidos.has(c));
}

/**
 * Saca UM código do bloco. `null` = acabou.
 * ⚠️⚠️ Remove ANTES de devolver: se remover depois da impressão e o navegador
 * fechar no meio, o mesmo código sairia em duas etiquetas — que é exatamente a
 * colisão que a reserva existe para impedir. Perder um código não usado é
 * barato; reusar um impresso não é.
 */
export function sacarCodigo(): string | null {
  const lista = codigosDisponiveis();
  if (!lista.length) return null;
  const codigo = lista[0];
  gravar(K_CONSUMIDOS, [...new Set([...ler<string[]>(K_CONSUMIDOS, []),codigo])]);
  gravar(K_CODIGOS, lista.slice(1));
  return codigo;
}

// ── Cache do dia ────────────────────────────────────────────────────────────
export function guardarCriancas(l: CriancaCache[]): void { gravar(K_CRIANCAS, l || []); }
export function criancasCache(): CriancaCache[] { return ler<CriancaCache[]>(K_CRIANCAS, []); }
export function guardarSessao(s: unknown): void { gravar(K_SESSAO, s); }
export function sessaoCache<T>(): T | null { return ler<T | null>(K_SESSAO, null); }

/** Busca offline por nome. ⚠️ Acento normalizado dos DOIS lados (lição 25/08). */
export function buscarOffline(termo: string, limite = 20): CriancaCache[] {
  const q = String(termo || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (q.length < 2) return [];
  return criancasCache().filter((c) => (c.nome_norm || '').includes(q)).slice(0, limite);
}

/**
 * A criança precisa de pager de inclusão?
 * ⚠️⚠️ FAIL-SAFE AO CONTRÁRIO do resto do sistema: desconhecido → **SIM**.
 * O pager de inclusão é obrigatório para autismo/limitação física, e offline
 * o dado pode não estar em cache. Errar para mais custa um pager; errar para
 * menos perde uma criança que não consegue dizer o próprio nome.
 */
export function exigePagerOffline(c: Pick<CriancaCache, 'exige_pager'> | null | undefined): boolean {
  return c?.exige_pager !== false;
}

// ── Fila ────────────────────────────────────────────────────────────────────
export function fila(): ItemFila[] { return ler<ItemFila[]>(K_FILA, []); }
export function filaCount(): number { return fila().length; }
export function excecoes(): ItemFila[] { return ler<ItemFila[]>(K_EXCECOES, []); }

export function enfileirar(item: Omit<ItemFila, 'local_id' | 'tentativas' | 'impresso'>): ItemFila {
  const novo: ItemFila = {
    ...item,
    local_id: globalThis.crypto?.randomUUID?.() || `l-${Date.now()}-${Math.random()}`,
    tentativas: 0,
    impresso: false,
  };
  gravar(K_FILA, [...fila(), novo]);
  return novo;
}

/** Marca que a etiqueta SAIU da impressora — o papel existe no mundo. */
export function marcarImpresso(localId: string): void {
  gravar(K_FILA, fila().map((i) => (i.local_id === localId ? { ...i, impresso: true } : i)));
}

export interface ResultadoSync {
  enviados: number;
  duplicados: number;
  falharam: number;
  conflitoDeCodigo: ItemFila[];
  pendentes: number;
}

/**
 * Sincroniza a fila com o servidor.
 *
 * ⚠️⚠️ O código vai NO PAYLOAD (`codigo_reservado`) e o backend é proibido de
 * trocá-lo (PR #2849). Se ele gerasse outro, o banco ficaria consistente e o
 * PAPEL NO BOLSO DO PAI ficaria inválido — e ninguém perceberia até a retirada.
 */
const sincronizacoesAtivas = new Set<string>();
export async function sincronizar(
  enviar: (payload: Record<string, unknown>) => Promise<unknown>,
): Promise<ResultadoSync> {
  const escopo = escopoAtual();
  if (sincronizacoesAtivas.has(escopo)) return { enviados:0,duplicados:0,falharam:0,conflitoDeCodigo:[],pendentes:filaCount() };
  sincronizacoesAtivas.add(escopo);
  const scope = createCampusRequest();
  try {
  const itens = ler<ItemFila[]>(K_FILA, [], escopo);
  const r: ResultadoSync = { enviados: 0, duplicados: 0, falharam: 0, conflitoDeCodigo: [], pendentes: 0 };
  if (!itens.length) return r;

  const restam: ItemFila[] = [];
  for (const item of itens) {
    try {
      scope.assertCurrent();
      await enviar({
        estacao_ref: estacaoRef(),
        sessao_id: item.sessao_id,
        crianca_id: item.crianca_id,
        sala_id: item.sala_id,
        responsavel_id: item.responsavel_id,
        cultos_extras: item.cultos_extras || [],
        responsavel_nome: item.responsavel_nome,
        responsavel_telefone: item.responsavel_telefone || null,
        codigo_reservado: item.codigo,
        checkin_at: item.checkin_at,
        origem: 'offline',
      });
      scope.assertCurrent();
      r.enviados += 1;
    } catch (e) {
      scope.assertCurrent();
      // ⚠️⚠️ A ORDEM IMPORTA, e este teste pegou o erro: o conflito de CÓDIGO
      // TAMBÉM chega como 409, então `ehDuplicado` o capturaria primeiro e o
      // contaria como SUCESSO — o silêncio exato que a regra de custódia
      // proíbe. O conflito é testado ANTES.
      const erro = e as { codigo_conflito?: boolean; codigo_invalido?: boolean; corpo?: { codigo_conflito?: boolean; codigo_invalido?: boolean } };
      const corpo = erro?.corpo || erro;
      if (corpo?.codigo_conflito || corpo?.codigo_invalido) {
        // Etiqueta já impressa + servidor recusou o código. Não é retry (não
        // resolve) nem silêncio (pior): vai para a fila de EXCEÇÃO que a tela
        // mostra, para gente resolver ANTES de a criança sair.
        r.conflitoDeCodigo.push(item);
        const antigas=ler<ItemFila[]>(K_EXCECOES,[],escopo);
        gravar(K_EXCECOES,[...antigas.filter(i=>i.local_id!==item.local_id),{...item,erro:String((e as Error)?.message || e).slice(0,200)}],escopo);
        continue;
      }

      // ⚠️ Duplicado é SUCESSO: o check-in já chegou (reenvio, ou a rede voltou
      // no meio). Retentar para sempre seria o defeito.
      // Um 409 pode ser capacidade, vínculo ou código diferente. Só uma
      // resposta de sucesso comprovada pelo servidor pode remover a fila.

      if (ehFalhaDeRedeOuServidor(e)) {
        // ainda sem servidor: fica na fila, sem contar como falha
        restam.push({ ...item, tentativas: item.tentativas + 1 });
        continue;
      }
      // Recusa de negócio (4xx): mantém com o motivo à vista, não some.
      r.falharam += 1;
      restam.push({ ...item, tentativas: item.tentativas + 1, erro: String((e as Error)?.message || e).slice(0, 200) });
    }
  }
  scope.assertCurrent();
  const idsIniciais=new Set(itens.map(i=>i.local_id));
  const novos=ler<ItemFila[]>(K_FILA,[],escopo).filter(i=>!idsIniciais.has(i.local_id));
  gravar(K_FILA, [...restam,...novos], escopo);
  r.pendentes = restam.length+novos.length;
  return r;
  } finally { scope.release(); sincronizacoesAtivas.delete(escopo); }
}
