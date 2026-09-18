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
import { ehFalhaDeRedeOuServidor, ehDuplicado } from '@/lib/falhaDeRede';

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
  responsavel_nome: string;
  responsavel_telefone?: string | null;
  checkin_at: string;        // quando ACONTECEU, não quando sincronizou
  impresso: boolean;
  tentativas: number;
  erro?: string | null;
}

function ler<T>(chave: string, padrao: T): T {
  try { const v = localStorage.getItem(chave); return v ? (JSON.parse(v) as T) : padrao; }
  catch { return padrao; }
}
function gravar(chave: string, valor: unknown): void {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* cota cheia */ }
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
    r = `totem-${(globalThis.crypto?.randomUUID?.() || String(Date.now())).slice(0, 8)}`;
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
  return ler<string[]>(K_CODIGOS, []);
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
export async function sincronizar(
  enviar: (payload: Record<string, unknown>) => Promise<unknown>,
): Promise<ResultadoSync> {
  const itens = fila();
  const r: ResultadoSync = { enviados: 0, duplicados: 0, falharam: 0, conflitoDeCodigo: [], pendentes: 0 };
  if (!itens.length) return r;

  const restam: ItemFila[] = [];
  for (const item of itens) {
    try {
      await enviar({
        sessao_id: item.sessao_id,
        crianca_id: item.crianca_id,
        sala_id: item.sala_id,
        responsavel_nome: item.responsavel_nome,
        responsavel_telefone: item.responsavel_telefone || null,
        codigo_reservado: item.codigo,
        checkin_at: item.checkin_at,
        origem: 'offline',
      });
      r.enviados += 1;
    } catch (e) {
      // ⚠️⚠️ A ORDEM IMPORTA, e este teste pegou o erro: o conflito de CÓDIGO
      // TAMBÉM chega como 409, então `ehDuplicado` o capturaria primeiro e o
      // contaria como SUCESSO — o silêncio exato que a regra de custódia
      // proíbe. O conflito é testado ANTES.
      const corpo = (e as { corpo?: { codigo_conflito?: boolean; codigo_invalido?: boolean } })?.corpo;
      if (corpo?.codigo_conflito || corpo?.codigo_invalido) {
        // Etiqueta já impressa + servidor recusou o código. Não é retry (não
        // resolve) nem silêncio (pior): vai para a fila de EXCEÇÃO que a tela
        // mostra, para gente resolver ANTES de a criança sair.
        r.conflitoDeCodigo.push(item);
        continue;
      }

      // ⚠️ Duplicado é SUCESSO: o check-in já chegou (reenvio, ou a rede voltou
      // no meio). Retentar para sempre seria o defeito.
      if (ehDuplicado(e)) { r.duplicados += 1; continue; }

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
  gravar(K_FILA, restam);
  r.pendentes = restam.length;
  return r;
}
