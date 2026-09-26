/**
 * Contrato do check-in offline do Kids. As regras aqui protegem a CUSTÓDIA da
 * criança, não a conveniência da operação.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { beginCampusSession } from '../lib/campusSession';
import * as off from '../pages/ministerial/totemKids/lib/offlineKids';

// ⚠️ Este arquivo roda em ambiente Node (sem jsdom) — o storage é stubado aqui
// de propósito: o alvo do teste é a RÉGUA de saque/fila, não o navegador.
if (typeof globalThis.localStorage === 'undefined') {
  const m = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
  };
}

beforeEach(() => { localStorage.clear(); beginCampusSession('usuario-A','campus-A',true); });

describe('⚠️⚠️ o cliente NUNCA gera código — ele SACA do bloco', () => {
  it('sem bloco, não há check-in offline (e isso é um NÃO honesto)', () => {
    // Gerar aqui daria 70% de colisão com 50 check-ins. Melhor recusar do que
    // emitir credencial de retirada sem garantia de unicidade.
    expect(off.sacarCodigo()).toBe(null);
    expect(off.codigosDisponiveis()).toEqual([]);
  });

  it('saca na ordem e NUNCA repete', () => {
    off.guardarCodigos(['AAAA', 'BBBB', 'CCCC']);
    const sacados = [off.sacarCodigo(), off.sacarCodigo(), off.sacarCodigo()];
    expect(sacados).toEqual(['AAAA', 'BBBB', 'CCCC']);
    expect(off.sacarCodigo()).toBe(null);
    expect(new Set(sacados).size).toBe(3);
  });

  it('⚠️⚠️ remove ANTES de devolver — recarregar a página não repete código', () => {
    // Se removesse depois da impressão e o navegador fechasse no meio, o mesmo
    // código sairia em DUAS etiquetas: a colisão que a reserva evita.
    off.guardarCodigos(['ZZZZ', 'YYYY']);
    const c = off.sacarCodigo();
    expect(off.codigosDisponiveis()).not.toContain(c);
    expect(off.codigosDisponiveis()).toEqual(['YYYY']);
  });

  it('recarregar o bloco SUBSTITUI, não acumula', () => {
    // A RPC é idempotente e devolve o bloco inteiro ainda livre; concatenar
    // duplicaria códigos na lista local.
    off.guardarCodigos(['AAAA', 'BBBB']);
    off.guardarCodigos(['AAAA', 'BBBB', 'CCCC']);
    expect(off.codigosDisponiveis()).toEqual(['AAAA', 'BBBB', 'CCCC']);
  });
});

describe('⚠️⚠️ pager de inclusão · fail-safe AO CONTRÁRIO', () => {
  it('desconhecido → DÁ PAGER', () => {
    // Errar pra mais custa um pager; errar pra menos perde uma criança que não
    // consegue dizer o próprio nome.
    expect(off.exigePagerOffline({ exige_pager: null })).toBe(true);
    expect(off.exigePagerOffline(undefined)).toBe(true);
    expect(off.exigePagerOffline(null)).toBe(true);
  });
  it('só um FALSE explícito dispensa', () => {
    expect(off.exigePagerOffline({ exige_pager: false })).toBe(false);
    expect(off.exigePagerOffline({ exige_pager: true })).toBe(true);
  });
});

describe('busca offline', () => {
  beforeEach(() => {
    off.guardarCriancas([
      { id: '1', nome: 'Mônica Duarte', nome_norm: 'monica duarte', sala_id: 's1', exige_pager: false },
      { id: '2', nome: 'João Pedro', nome_norm: 'joao pedro', sala_id: 's1', exige_pager: null },
    ]);
  });
  it('⚠️ acento normalizado dos DOIS lados (o bug do seletor, 25/08)', () => {
    expect(off.buscarOffline('monica').map((c) => c.id)).toEqual(['1']);
    expect(off.buscarOffline('mônica').map((c) => c.id)).toEqual(['1']);
    expect(off.buscarOffline('JOAO').map((c) => c.id)).toEqual(['2']);
  });
  it('termo curto não devolve a base inteira', () => {
    expect(off.buscarOffline('m')).toEqual([]);
  });
});

describe('fila e sincronização', () => {
  const item = {
    codigo: 'AB12', crianca_id: 'c1', crianca_nome: 'Ana', sala_id: 's1',
    sessao_id: 'x', responsavel_id: 'resp-1', responsavel_nome: 'Mãe', checkin_at: '2026-09-02T13:00:00Z',
  };

  it('enfileira e conta', () => {
    off.enfileirar(item);
    expect(off.filaCount()).toBe(1);
    expect(off.fila()[0].codigo).toBe('AB12');
  });

  it('⚠️⚠️ o código SACADO vai no payload — o servidor não pode trocá-lo', () => {
    // Se o servidor gerasse outro, o banco ficaria certo e o PAPEL no bolso do
    // pai ficaria inválido — ninguém percebe até a retirada.
    off.enfileirar(item);
    const enviados: any[] = [];
    return off.sincronizar(async (p) => { enviados.push(p); }).then((r) => {
      expect(enviados[0].codigo_reservado).toBe('AB12');
      expect(enviados[0].origem).toBe('offline');
      expect(enviados[0].checkin_at).toBe('2026-09-02T13:00:00Z'); // quando ACONTECEU
      expect(r.enviados).toBe(1);
      expect(off.filaCount()).toBe(0);
    });
  });

  it('409 sem prova do mesmo código permanece na fila', async () => {
    off.enfileirar(item);
    const r = await off.sincronizar(async () => { throw Object.assign(new Error('dup'), { status: 409 }); });
    expect(r.duplicados).toBe(0);
    expect(off.filaCount()).toBe(1);
  });

  it('⚠️⚠️ banco fora mantém na fila, sem contar como falha', async () => {
    off.enfileirar(item);
    const r = await off.sincronizar(async () => { throw Object.assign(new Error('down'), { status: 503 }); });
    expect(r.falharam).toBe(0);
    expect(r.pendentes).toBe(1);
    expect(off.filaCount()).toBe(1);
  });

  it('⚠️⚠️ conflito de CÓDIGO vira fila de exceção, não retry nem silêncio', async () => {
    // A etiqueta já está impressa. Retentar não resolve e esconder é pior:
    // tem que chegar em gente ANTES da criança sair.
    off.enfileirar(item);
    const r = await off.sincronizar(async () => {
      throw Object.assign(new Error('conflito'), { status: 409, corpo: { codigo_conflito: true } });
    });
    expect(r.conflitoDeCodigo).toHaveLength(1);
    expect(r.conflitoDeCodigo[0].codigo).toBe('AB12');
    expect(r.duplicados).toBe(0);
    expect(off.filaCount()).toBe(0); // saiu da fila normal — é exceção humana
  });

  it('marca a etiqueta como impressa (o papel existe no mundo)', () => {
    const i = off.enfileirar(item);
    off.marcarImpresso(i.local_id);
    expect(off.fila()[0].impresso).toBe(true);
  });
});

describe('estação', () => {
  it('⚠️ o ref é ESTÁVEL — é o dono do bloco', () => {
    // Bloco nunca compartilhado entre totens é o que impede dois sacarem o
    // mesmo código.
    const a = off.estacaoRef();
    expect(off.estacaoRef()).toBe(a);
    expect(a).toMatch(/^totem-/);
  });
});

describe('campus e identidade da fila offline',()=>{
 const item={codigo:'AB12',crianca_id:'c1',crianca_nome:'Ana',sala_id:'s1',sessao_id:'x',responsavel_id:'r1',responsavel_nome:'Mãe',checkin_at:'2026-09-02T13:00:00Z'};
 it('códigos, sessão, crianças e fila não atravessam campus nem usuário',()=>{
  off.guardarCodigos(['AAAA']);off.guardarSessao({id:'A'});off.guardarCriancas([{id:'c1',nome:'Ana',nome_norm:'ana',sala_id:'s1',exige_pager:false}]);off.enfileirar(item);
  for(const [owner,campus] of [['usuario-A','campus-B'],['usuario-B','campus-A']]){beginCampusSession(owner,campus,true);expect(off.codigosDisponiveis()).toEqual([]);expect(off.sessaoCache()).toBeNull();expect(off.criancasCache()).toEqual([]);expect(off.fila()).toEqual([]);}
  beginCampusSession('usuario-A','campus-A',true);expect(off.fila()).toHaveLength(1);expect(off.codigosDisponiveis()).toEqual(['AAAA']);
 });
 it('fila legada permanece armazenada sem ser assumida pelo campus atual',()=>{
  localStorage.setItem('kids_offline_fila',JSON.stringify([item]));localStorage.setItem('kids_offline_codigos',JSON.stringify(['LEGADO']));
  expect(off.possuiFilaLegada()).toBe(true);expect(off.fila()).toEqual([]);expect(off.codigosDisponiveis()).toEqual([]);expect(localStorage.getItem('kids_offline_fila')).toContain('AB12');
 });
 it('troca durante replay interrompe a sequência e não apaga fila original nem sobrescreve outra',async()=>{
  off.enfileirar(item);off.enfileirar({...item,codigo:'CD34'});
  let resolver!:()=>void;const pendente=new Promise<void>(ok=>{resolver=ok;});let chamadas=0;
  const sync=off.sincronizar(async()=>{chamadas++;await pendente;});
  beginCampusSession('usuario-A','campus-B',true);off.enfileirar({...item,codigo:'OUTRO'});resolver();
  await expect(sync).rejects.toThrow('campus');expect(chamadas).toBe(1);expect(off.fila().map(x=>x.codigo)).toEqual(['OUTRO']);
  beginCampusSession('usuario-A','campus-A',true);expect(off.fila().map(x=>x.codigo)).toEqual(['AB12','CD34']);
 });
 it('não usa códigos sem contexto pronto nem interpreta cobertura pendente como queda de rede',()=>{
  beginCampusSession(null,null,false);expect(()=>off.sacarCodigo()).toThrow('campus');
  expect(off.falhaCompativelOffline({status:503,corpo:{code:'kids_fluxo_pendente'}})).toBe(false);
  expect(off.falhaCompativelOffline({status:503,corpo:{code:'campus_operacao_nao_habilitada'}})).toBe(false);
  expect(off.falhaCompativelOffline({code:'CAMPUS_CONTEXT_CHANGED',name:'AbortError'})).toBe(false);
  expect(off.falhaCompativelOffline({status:503})).toBe(true);
 });
});

it('recarregar bloco reservado não devolve um código já sacado localmente',()=>{
 off.guardarCodigos(['AAAA','BBBB']);expect(off.sacarCodigo()).toBe('AAAA');off.guardarCodigos(['AAAA','BBBB','CCCC']);expect(off.codigosDisponiveis()).toEqual(['BBBB','CCCC']);
});

it('replay mantém novos atendimentos inseridos enquanto aguarda a rede',async()=>{
 const item={codigo:'A1',crianca_id:'c',crianca_nome:'Criança',sessao_id:'s',sala_id:'sala',responsavel_id:'r',responsavel_nome:'Responsável',checkin_at:'2026-09-27T12:00:00Z'};
 off.enfileirar(item);let liberar!:()=>void;const pending=off.sincronizar(()=>new Promise<void>(ok=>{liberar=ok;}));off.enfileirar({...item,codigo:'B2'});liberar();await pending;expect(off.fila().map(i=>i.codigo)).toEqual(['B2']);
});
it('conflito no formato real da API mantém exceção persistida para conferência humana',async()=>{
 off.enfileirar({codigo:'A1',crianca_id:'c',crianca_nome:'Criança',sessao_id:'s',sala_id:'sala',responsavel_id:'r',responsavel_nome:'Responsável',checkin_at:'2026-09-27T12:00:00Z'});
 const result=await off.sincronizar(async()=>{throw Object.assign(new Error('Código de outro atendimento'),{status:409,codigo_conflito:true});});expect(result.conflitoDeCodigo).toHaveLength(1);expect(off.excecoes()).toHaveLength(1);expect(off.fila()).toEqual([]);
});
