// ⚠️⚠️ A PEÇA DE MAIOR RISCO DO BACKEND.
//
// `fetchQueAnotaFalha` é o `global.fetch` do cliente do Supabase — está no
// caminho de **TODA** consulta ao banco, em 298 arquivos. Se ela consumir o
// corpo, atrasar ou lançar, o sistema inteiro cai. Ela existe pra capturar o
// motivo real de um erro de PostgREST e alimentar o agente de incidente (caminho
// 3, 27/08/2026), e o preço disso não pode ser o sistema.
//
// O que estes testes garantem, em ordem de dano:
//   1. a RESPOSTA e o CORPO chegam intactos a quem chamou (inclusive no erro);
//   2. exceção interna da anotação NUNCA vaza pra quem chamou;
//   3. corpo não-JSON e corpo vazio não quebram nada;
//   4. resposta OK não é clonada nem anotada (custo zero no caminho felizb).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import http from 'node:http';

const req = createRequire(import.meta.url);
const { fetchQueAnotaFalha } = req('../../backend/utils/supabase.js');
const contexto = req('../../backend/utils/contextoFalha.js');

let servidor: http.Server;
let base = '';

function subir(handler: http.RequestListener) {
  servidor = http.createServer(handler);
  return new Promise<void>((r) => {
    servidor.listen(0, () => {
      base = `http://127.0.0.1:${(servidor.address() as any).port}`;
      r();
    });
  });
}

afterEach(async () => {
  if (servidor) await new Promise((r) => servidor.close(r));
  vi.restoreAllMocks();
});

beforeEach(() => { vi.restoreAllMocks(); });

describe('fetchQueAnotaFalha · o corpo chega intacto', () => {
  it('resposta OK: o corpo é legível por quem chamou (não foi consumido)', async () => {
    await subir((_q, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('[{"id":1}]'); });
    const r = await fetchQueAnotaFalha(`${base}/rest/v1/pat_bens`, { method: 'GET' });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual([{ id: 1 }]);
  });

  it('⚠️⚠️ resposta de ERRO: o corpo TAMBÉM chega intacto (é o clone que lemos)', async () => {
    await subir((_q, res) => {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end('{"code":"42703","message":"column x does not exist","hint":"talvez y"}');
    });
    const r = await fetchQueAnotaFalha(`${base}/rest/v1/x`, { method: 'GET' });
    expect(r.status).toBe(400);
    // Se a leitura da anotação tivesse consumido o corpo, isto lançaria.
    const corpo = await r.json();
    expect(corpo.code).toBe('42703');
  });

  it('anota o motivo do PostgREST no contexto da requisição', async () => {
    await subir((_q, res) => {
      res.writeHead(409, { 'content-type': 'application/json' });
      res.end('{"code":"23505","message":"duplicate key","details":"Key (cpf) exists"}');
    });
    await contexto.comContextoDeFalha(async () => {
      const r = await fetchQueAnotaFalha(`${base}/rest/v1/mem_membros`, { method: 'POST' });
      await r.text();
      await new Promise((x) => setTimeout(x, 20)); // a anotação é assíncrona
      const f = contexto.falhaDbDaRequisicao();
      expect(f?.codigo).toBe('23505');
      expect(f?.motivo).toContain('duplicate key');
      expect(f?.motivo).toContain('Key (cpf) exists');
      // ⚠️ Só o CAMINHO, nunca a query string (ela carrega valor de filtro).
      expect(f?.rota).toBe('/rest/v1/mem_membros');
    });
  });

  it('⚠️ a query string NÃO é guardada (ela leva cpf/e-mail no filtro)', async () => {
    await subir((_q, res) => { res.writeHead(400); res.end('{"message":"x"}'); });
    await contexto.comContextoDeFalha(async () => {
      const r = await fetchQueAnotaFalha(`${base}/rest/v1/mem_membros?cpf=eq.12345678901`, {});
      await r.text();
      await new Promise((x) => setTimeout(x, 20));
      expect(contexto.falhaDbDaRequisicao()?.rota).toBe('/rest/v1/mem_membros');
      expect(JSON.stringify(contexto.falhaDbDaRequisicao())).not.toContain('12345678901');
    });
  });
});

describe('fetchQueAnotaFalha · nunca derruba quem chamou', () => {
  it('corpo não-JSON no erro não quebra (guarda o texto cru)', async () => {
    await subir((_q, res) => { res.writeHead(502, { 'content-type': 'text/html' }); res.end('<html>bad gateway</html>'); });
    await contexto.comContextoDeFalha(async () => {
      const r = await fetchQueAnotaFalha(`${base}/rest/v1/x`, {});
      expect(r.status).toBe(502);
      expect(await r.text()).toContain('bad gateway');
      await new Promise((x) => setTimeout(x, 20));
      expect(contexto.falhaDbDaRequisicao()?.motivo).toContain('bad gateway');
    });
  });

  it('corpo VAZIO no erro não quebra', async () => {
    await subir((_q, res) => { res.writeHead(500); res.end(); });
    const r = await fetchQueAnotaFalha(`${base}/rest/v1/x`, {});
    expect(r.status).toBe(500);
    expect(await r.text()).toBe('');
  });

  it('⚠️⚠️ exceção DENTRO da anotação não vaza: a resposta ainda chega', async () => {
    await subir((_q, res) => { res.writeHead(400, { 'content-type': 'application/json' }); res.end('{"message":"boom"}'); });
    vi.spyOn(contexto, 'registrarFalhaDb').mockImplementation(() => { throw new Error('telemetria explodiu'); });
    const r = await fetchQueAnotaFalha(`${base}/rest/v1/x`, {});
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ message: 'boom' });
  });

  it('fora de requisição (cron, script) a anotação é no-op silenciosa', async () => {
    await subir((_q, res) => { res.writeHead(400, { 'content-type': 'application/json' }); res.end('{"message":"x"}'); });
    // Sem `comContextoDeFalha` em volta — é o caso de todo cron.
    const r = await fetchQueAnotaFalha(`${base}/rest/v1/x`, {});
    expect(r.status).toBe(400);
    expect(contexto.falhaDbDaRequisicao()).toBeNull();
  });

  it('erro de REDE propaga como antes (não é engolido)', async () => {
    await expect(
      fetchQueAnotaFalha('http://127.0.0.1:1/rest/v1/x', {}),
    ).rejects.toThrow();
  });
});
