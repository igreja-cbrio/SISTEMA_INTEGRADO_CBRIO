#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
//  Teste de carga do censo · simula pessoas reais respondendo no culto
//
//  POR QUÊ: o censo vai ser aplicado ao vivo, num culto, com milhares de
//  pessoas ao mesmo tempo. Descobrir o teto DEPOIS é descobrir com a igreja
//  cheia e sem como voltar atrás.
//
//  O QUE ISTO MEDE (e o que NÃO mede — a diferença importa):
//   ✔ a camada de aplicação: CPU por resposta (validar 106 perguntas, montar
//     ~90 itens), latência por percentil, memória sob concorrência, e se algo
//     quebra ou vaza com 2.500 pessoas simultâneas;
//   ✔ quantas IDAS AO BANCO cada operação custa — é o número que decide a
//     capacidade real, porque o gargalo num culto é round trip, não CPU;
//   ✘ NÃO mede o Postgres nem a borda da Vercel. O banco aqui é simulado, com
//     latência artificial configurável. Medir o banco de verdade exigiria
//     escrever milhares de respostas falsas na tabela do censo REAL — e dado
//     de pesquisa sujo é pior que dado ausente.
//
//  USO
//    node backend/scripts/censo_carga.cjs                    # 2500 pessoas
//    node backend/scripts/censo_carga.cjs --pessoas 500
//    node backend/scripts/censo_carga.cjs --latencia-banco 25 # ms por query
//    node backend/scripts/censo_carga.cjs --rampa 60          # chegam em 60s
//    node backend/scripts/censo_carga.cjs --na-base 60         # % já cadastrada
//
//  ⚠️⚠️ ESTE SCRIPT MEDIU 400 EM 100% DAS PESSOAS DE 07/08 A 11/09/2026.
//  Quando o CPF virou obrigatório (decisão do Matheus, 07/08), o gerador
//  continuou escrevendo "Pessoa Numero 42" no campo de CPF — que tem
//  `formato: 'cpf'` e dígito verificador cobrado em `montarItens`. Resultado:
//  toda simulação parava no 400 ANTES do insert, e as 500 "respostas" do
//  relatório eram rascunhos. O caminho de gravação (itens, cuidado, UNIQUE,
//  idempotência) ficou um mês sem ser exercitado, e nada acusou — o script
//  imprimia "✔ nenhum erro 5xx" com orgulho, porque 400 não é 5xx.
//  LEI: teste de carga tem que AFIRMAR o status esperado, não só a ausência de
//  5xx. Ver a checagem no fim do relatório.
// ════════════════════════════════════════════════════════════════════════════

const path = require('path');
const crypto = require('crypto');

const arg = (nome, def) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : def;
};
const PESSOAS = arg('pessoas', 2500);
const LATENCIA_BANCO = arg('latencia-banco', 8);   // ms simulados por query
const RAMPA_S = arg('rampa', 0);                   // 0 = todos de uma vez
const PORTA = arg('porta', 3899);
// --jornada: simula a JORNADA COMPLETA de cada pessoa (abrir o questionário,
// salvar rascunho a cada bloco, enviar) em vez de só o envio. É o que de fato
// acontece no culto: o envio é o último de ~15 requisições por pessoa.
const JORNADA = process.argv.includes('--jornada');
// Quantos rascunhos a pessoa salva no caminho = quantos BLOCOS o questionário
// tem. ⚠️ Configurável porque o questionário VIVO encurtou: o seed do repo tem
// 13 seções, a pesquisa em produção em 11/09 tem 3 — e a diferença muda a carga
// em 4x. Rode os dois: 13 é o pior caso, 3 é o domingo que vem.
//   node backend/scripts/censo_carga.cjs --pessoas 500 --jornada --blocos 3
const BLOCOS = arg('blocos', 13);
// Fatia que JÁ está na base (os outros caem no criador de pessoa, que é o
// caminho mais caro do envio). A base viva tem 3.972 cadastros para uma igreja
// de ~2.500 no culto, mas boa parte de quem escaneia o QR é visitante.
const NA_BASE_PCT = arg('na-base', 60);

const RAIZ = path.join(__dirname, '..');
process.env.CENSO_TOKEN_SECRET = 'carga-teste';
process.env.NODE_ENV = 'production';

const doc = require(path.join(RAIZ, 'data', 'censoQuestionario2026.json'));

// ── Banco simulado, com contabilidade ─────────────────────────────────────
const metricas = {
  queries: 0, porTabela: {}, respostas: 0, itens: 0, cuidados: 0,
  duplicatas: 0, repetidos: 0, achadas_por_cpf: 0, pessoas_criadas: 0,
};

/** Esta pessoa já está na base? Determinístico pelo CPF. */
function jaEstaNaBase(cpf) {
  const b = crypto.createHash('md5').update(String(cpf)).digest()[0];
  return (b / 255) * 100 < NA_BASE_PCT;
}
const vistos = { envios: new Set(), membros: new Set() };
const espera = () => new Promise((r) => setTimeout(r, LATENCIA_BANCO));

function contar(op, tabela) {
  metricas.queries += 1;
  const k = `${op} ${tabela}`;
  metricas.porTabela[k] = (metricas.porTabela[k] || 0) + 1;
}

const PESQ = {
  id: 'p-carga', slug: doc.slug, titulo: doc.titulo, subtitulo: doc.subtitulo,
  perguntas: doc.perguntas, config: {}, consentimento_texto: 'aviso de privacidade',
  status: 'aberta', abre_em: null, fecha_em: null,
};

const supaPath = require.resolve(path.join(RAIZ, 'utils', 'supabase.js'));
require.cache[supaPath] = { id: supaPath, filename: supaPath, loaded: true, exports: { supabase: {
  from(t) {
    const f = {}; let op = 'select';
    const q = {
      select() { return q; }, eq(c, v) { f[c] = v; return q; }, is() { return q; },
      not() { return q; }, in() { return q; }, order() { return q; }, limit() { return q; },
      delete() { op = 'delete'; return q; }, update() { op = 'update'; return q; },
      async maybeSingle() {
        contar(op, t); await espera();
        if (t === 'cen_pesquisa') return { data: PESQ, error: null };
        if (t === 'cen_resposta' && f.envio_id) {
          return { data: vistos.envios.has(f.envio_id) ? { id: 'ja' } : null, error: null };
        }
        // ⚠️ A busca por CPF tem que ACHAR parte das pessoas: é o que separa o
        // caminho barato (1 query e segue) do caro (criar cadastro). Devolver
        // null para todo mundo fazia o teste medir só o pior caso — e, com o
        // criador de pessoa fora do mock, medir caso nenhum.
        if (t === 'mem_membros' && f.cpf) {
          if (!jaEstaNaBase(f.cpf)) return { data: null, error: null };
          metricas.achadas_por_cpf += 1;
          return { data: { id: crypto.randomUUID() }, error: null };
        }
        return { data: null, error: null };
      },
      insert(payload) {
        const rows = Array.isArray(payload) ? payload : [payload];
        return {
          select: () => ({ single: async () => {
            contar('insert', t); await espera();
            const r = rows[0];
            if (vistos.envios.has(r.envio_id)) { metricas.repetidos += 1; return { data: null, error: { code: '23505' } }; }
            if (r.membro_id && vistos.membros.has(r.membro_id)) {
              metricas.duplicatas += 1; return { data: null, error: { code: '23505' } };
            }
            if (r.envio_id) vistos.envios.add(r.envio_id);
            if (r.membro_id) vistos.membros.add(r.membro_id);
            metricas.respostas += 1;
            return { data: { id: crypto.randomUUID() }, error: null };
          } }),
          then: async (cb) => { contar('insert', t); await espera();
            if (t === 'cen_resposta_item') metricas.itens += rows.length;
            return cb({ error: null }); },
        };
      },
      upsert(payload) {
        const rows = Array.isArray(payload) ? payload : [payload];
        return { then: async (cb) => { contar('upsert', t); await espera();
          metricas.cuidados += rows.length; return cb({ error: null }); } };
      },
      then: async (cb) => { contar(op, t); await espera(); return cb({ data: [], error: null, count: 0 }); },
    };
    return q;
  },
}}};

// Matcher e reconciliação com o CUSTO REAL em número de queries: é onde o
// caminho de quem já está na base fica mais caro.
const mmPath = require.resolve(path.join(RAIZ, 'services', 'membroMatch.js'));
require.cache[mmPath] = { id: mmPath, filename: mmPath, loaded: true, exports: {
  acharMembroGuardado: async ({ nome }) => {
    for (let i = 0; i < 3; i += 1) { contar('select', 'mem_membros(matcher)'); await espera(); }
    // ~60% da base é gente já cadastrada; o resto entra como lead.
    const achou = crypto.createHash('md5').update(String(nome)).digest()[0] < 153;
    return achou ? { membro_id: crypto.randomUUID(), matched_by: 'nome+nascimento' } : null;
  },
  // ⚠️⚠️ ESTA FALTAVA (11/09/2026), e é o caminho MAIS CARO do envio: quem não
  // está na base tem o cadastro criado na hora (decisão do Matheus, 07/08).
  // Sem o mock, `acharOuCriarGuardado is not a function` era engolido pelo
  // try/catch da rota e o teste media o envio como se ninguém fosse novo.
  // Custo real medido no serviço: busca por cpf + candidatos por e-mail +
  // candidatos por telefone + insert do cadastro + observação do contato.
  acharOuCriarGuardado: async () => {
    for (let i = 0; i < 4; i += 1) { contar('select', 'mem_membros(criar)'); await espera(); }
    contar('insert', 'mem_membros'); await espera();
    contar('insert', 'mem_contatos'); await espera();
    metricas.pessoas_criadas += 1;
    return { membro_id: crypto.randomUUID(), criado: true };
  },
}};
const recPath = require.resolve(path.join(RAIZ, 'services', 'censoReconciliar.js'));
require.cache[recPath] = { id: recPath, filename: recPath, loaded: true, exports: {
  reconciliarCenso: async () => {
    for (let i = 0; i < 4; i += 1) { contar('rw', 'reconciliar'); await espera(); }
    return { conflitos: [] };
  },
}};

// ── App ───────────────────────────────────────────────────────────────────
const express = require('express');
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/api/public/censo', require(path.join(RAIZ, 'routes', 'publicCenso.js')));

const { validarPerguntas, visivel } = require(path.join(RAIZ, 'utils', 'censoPerguntas.js'));
const { perguntas } = validarPerguntas(doc.perguntas);

const TEXTO = 'Resposta escrita no celular, com o tamanho que uma pessoa realmente escreve quando está com pressa mas quer ser sincera.';

/** CPF VÁLIDO e determinístico por pessoa.
 *  ⚠️ Sem isto o envio morre em `400 {faltando:['cpf']}` e o teste não mede
 *  NADA do caminho de gravação — foi exatamente o que aconteceu por um mês. */
function cpfDaPessoa(n) {
  const base = String(10000000000 + (n * 7919) % 88888888).slice(0, 9);
  const d = base.split('').map(Number);
  const dv = (arr, peso) => {
    const soma = arr.reduce((a, v, i) => a + v * (peso - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(d, 10);
  const d2 = dv([...d, d1], 11);
  return `${base}${d1}${d2}`;
}

/** Uma pessoa preenchendo: percorre em ordem e só responde o que está visível. */
function pessoa(n) {
  const R = {};
  const dado = (k) => crypto.createHash('md5').update(`${n}:${k}`).digest()[0];
  for (const p of perguntas) {
    if (p.tipo === 'secao' || !visivel(p, R)) continue;
    const d = dado(p.id);
    switch (p.tipo) {
      case 'sim_nao': R[p.id] = d % 2 ? 'Sim' : 'Não'; break;
      case 'opcao_unica': R[p.id] = p.opcoes[d % p.opcoes.length]; break;
      case 'multipla': R[p.id] = [p.opcoes[d % p.opcoes.length]]; break;
      case 'nps': R[p.id] = d % 11; break;
      case 'escala_5': case 'estrelas_5':
        R[p.id] = p.permite_nao_se_aplica && d % 5 === 0 ? 'Não se aplica' : (d % 5) + 1; break;
      case 'numero': R[p.id] = (d % 4) + 1; break;
      case 'data': R[p.id] = `19${70 + (d % 30)}-0${1 + (d % 9)}-1${d % 9}`; break;
      case 'texto_curto': R[p.id] = p.formato === 'email' ? `pessoa${n}@exemplo.com`
        : p.formato === 'telefone' ? `2199${String(900000 + n).slice(0, 6)}`
        : p.formato === 'cpf' ? cpfDaPessoa(n)
        : p.formato === 'cep' ? '20000-000'
        : `Pessoa Numero ${n}`; break;
      default: R[p.id] = TEXTO;
    }
  }
  return R;
}

const fmt = (n) => n.toLocaleString('pt-BR');
const pct = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0;

const srv = app.listen(PORTA, async () => {
  // Sob carga, a conexão espera na fila antes de o Express atendê-la. Com o
  // keepAliveTimeout padrão de 5s, o próprio servidor fecha o socket de quem
  // esperou demais — e o cliente vê "fetch failed" sem nunca ter sido atendido.
  srv.keepAliveTimeout = arg('keepalive', 5) * 1000;
  srv.headersTimeout = (arg('keepalive', 5) + 5) * 1000;
  const base = `http://127.0.0.1:${PORTA}/api/public/censo/${doc.slug}`;

  console.log('═'.repeat(70));
  console.log(`CARGA DO CENSO · ${fmt(PESSOAS)} pessoas · ${LATENCIA_BANCO}ms por query simulada`
    + (RAMPA_S ? ` · chegando em ${RAMPA_S}s` : ' · todas de uma vez'));
  console.log('═'.repeat(70));

  const amostra = pessoa(1);
  const bytes = Buffer.byteLength(JSON.stringify({ respostas: amostra, consentimento: true }));
  console.log(`payload por resposta: ${(bytes / 1024).toFixed(1)} KB · ${Object.keys(amostra).length} perguntas respondidas\n`);

  const memInicial = process.memoryUsage().heapUsed;
  const latencias = [];
  const status = {};
  const erros = [];
  const t0 = Date.now();

  let reqs = 0;
  await Promise.all(Array.from({ length: PESSOAS }, async (_, i) => {
    if (RAMPA_S) await new Promise((r) => setTimeout(r, Math.random() * RAMPA_S * 1000));

    let rascunho = null;
    if (JORNADA) {
      // (a) abre o questionário — na produção isto vem do cache de borda em 30s,
      //     então aqui medimos o pior caso: todos batendo na função.
      try { reqs += 1; await fetch(base); } catch { status.rede_get = (status.rede_get || 0) + 1; }
      // (b) salva o rascunho ao concluir cada bloco
      const parciais = {};
      for (let b = 0; b < BLOCOS; b += 1) {
        parciais[`campo_${b}`] = 'valor';
        try {
          reqs += 1;
          const r = await fetch(`${base}/parcial`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ respostas: parciais, canal: 'qr', ...(rascunho || {}) }),
          });
          const j = await r.json().catch(() => ({}));
          if (j.rascunho_id && j.retomar) rascunho = { rascunho_id: j.rascunho_id, retomar: j.retomar };
        } catch { status.rede_parcial = (status.rede_parcial || 0) + 1; }
      }
    }
    const corpo = {
      respostas: pessoa(i + 1), consentimento: true,
      envio_id: `carga-${i + 1}`, canal: 'qr',
      iniciada_em: new Date(Date.now() - 300000).toISOString(),
      ...(rascunho || {}),   // o rascunho VIRA a resposta, não cria outra linha
    };
    const inicio = Date.now();
    try {
      reqs += 1;
      const r = await fetch(`${base}/responder`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo),
      });
      latencias.push(Date.now() - inicio);
      status[r.status] = (status[r.status] || 0) + 1;
      if (r.status >= 500) erros.push(await r.text());
    } catch (e) {
      const cod = e?.cause?.code || e?.code || e.message;
      status[`rede:${cod}`] = (status[`rede:${cod}`] || 0) + 1;
      erros.push(`${cod} — ${e.message}`);
    }
  }));

  const dur = (Date.now() - t0) / 1000;
  const memFinal = process.memoryUsage().heapUsed;
  latencias.sort((a, b) => a - b);

  console.log('RESULTADO');
  console.log(`  tempo total:        ${dur.toFixed(1)}s`);
  console.log(`  vazão:              ${(PESSOAS / dur).toFixed(0)} respostas/s`);
  console.log(`  requisições HTTP:   ${fmt(reqs)} (${(reqs / PESSOAS).toFixed(1)} por pessoa) · ${(reqs / dur).toFixed(0)} req/s`);
  console.log(`  status:             ${JSON.stringify(status)}`);
  console.log(`  latência p50/p95/p99/max: ${pct(latencias, 0.5)} / ${pct(latencias, 0.95)} / ${pct(latencias, 0.99)} / ${latencias[latencias.length - 1]} ms`);
  console.log(`  memória do processo: ${(memInicial / 1e6).toFixed(0)} → ${(memFinal / 1e6).toFixed(0)} MB`);
  console.log(`\nGRAVADO`);
  console.log(`  respostas: ${fmt(metricas.respostas)} · itens: ${fmt(metricas.itens)} · pedidos de cuidado: ${fmt(metricas.cuidados)}`);
  console.log(`  duplicatas barradas: ${metricas.duplicatas} · reenvios devolvidos: ${metricas.repetidos}`);
  console.log(`  vínculo por CPF na hora: ${fmt(metricas.achadas_por_cpf)} · cadastros CRIADOS no envio: ${fmt(metricas.pessoas_criadas)}`);
  console.log(`\nIDAS AO BANCO`);
  console.log(`  total: ${fmt(metricas.queries)} · por resposta: ${(metricas.queries / PESSOAS).toFixed(1)} · pico: ${(metricas.queries / dur).toFixed(0)} queries/s`);
  for (const [k, v] of Object.entries(metricas.porTabela).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(fmt(v)).padStart(7)}  ${k}`);
  }
  if (erros.length) {
    console.log(`\n⚠️  ${erros.length} ERRO(S) 5xx/rede — primeiros 3:`);
    for (const e of erros.slice(0, 3)) console.log(`    ${String(e).slice(0, 160)}`);
  } else {
    console.log('\n✔ nenhum erro 5xx nem falha de rede');
  }

  // ⚠️⚠️ A AFIRMAÇÃO QUE FALTAVA. "Nenhum 5xx" era verdade enquanto 100% das
  // pessoas tomavam 400 e nada era gravado. O teste agora FALHA (exit 1) quando
  // o envio não é aceito, e diz o que veio no lugar.
  const aceitas = status['201'] || 0;
  const ok = aceitas === PESSOAS && metricas.itens > 0;
  console.log(ok
    ? `
✔ VEREDITO: ${fmt(aceitas)}/${fmt(PESSOAS)} respostas ACEITAS (201) · ${fmt(metricas.itens)} itens gravados`
    : `
✘ VEREDITO: só ${fmt(aceitas)} de ${fmt(PESSOAS)} envios aceitos (201) · itens gravados: ${fmt(metricas.itens)}`
      + `
  status recebidos: ${JSON.stringify(status)}`
      + `
  ⚠️ Envio recusado não mede carga de gravação. Conserte o gerador antes de acreditar nos números.`);
  if (!ok) process.exitCode = 1;
  srv.close();
});
