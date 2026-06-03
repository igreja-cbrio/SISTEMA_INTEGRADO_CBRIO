// ============================================================================
// CBRio · Pager Bridge · agente local da recepcao do Totem Kids
// ============================================================================
// Roda num PC/Raspberry da recepcao, na MESMA REDE do transmissor LRS Freedom
// (porta RJ-45). Faz polling na fila do backend (bearer token) e, pra cada
// chamada de pager pendente, dispara o comando LRSN (XML sobre TCP) pro
// transmissor, fazendo o pager da familia vibrar. Reporta o resultado de volta.
//
// NAO precisa de chave de service_role nem abre porta de entrada · so faz
// conexoes de SAIDA (HTTPS pro backend + TCP pro transmissor na LAN).
//
// Uso:
//   cp .env.example .env  &&  editar  &&  npm start
// Requer Node 18+ (usa fetch global).
// ============================================================================

const net = require('net');

const CFG = {
  apiBase:    (process.env.API_BASE_URL || '').replace(/\/$/, ''),   // ex: https://app.cbrio.org/api
  token:      process.env.PAGER_BRIDGE_TOKEN || '',
  lrsHost:    process.env.LRS_HOST || '',                            // IP do Freedom na LAN
  lrsPort:    Number(process.env.LRS_PORT || 5000),                 // porta NetPage/LRSN (confirmar)
  lrsMessage: process.env.LRS_MESSAGE || 'Flash5Min',               // alerta padrao do coaster
  pollMs:     Number(process.env.POLL_MS || 3000),
  tcpTimeout: Number(process.env.LRS_TCP_TIMEOUT_MS || 5000),
  dryRun:     /^(1|true|yes)$/i.test(process.env.DRY_RUN || ''),
};

let seq = 0;

function log(...a) { console.log(new Date().toISOString(), ...a); }

function checarConfig() {
  const faltando = [];
  if (!CFG.apiBase) faltando.push('API_BASE_URL');
  if (!CFG.token)   faltando.push('PAGER_BRIDGE_TOKEN');
  if (!CFG.dryRun && !CFG.lrsHost) faltando.push('LRS_HOST');
  if (faltando.length) {
    console.error('[pager-bridge] faltam variaveis de ambiente:', faltando.join(', '));
    process.exit(1);
  }
}

// Monta o XML LRSN (formato curto) pra um pager guest.
//   pager="<tipo>;<numero>"  · tipo 2 = LRS Guest pager
function montarXml(envio) {
  seq = (seq + 1) % 100000;
  const tipo = envio.tipo_lrs ?? 2;
  const cor = (envio.cor || 'R').toUpperCase();
  return `<PageRequest id="${seq}" pager="${tipo};${envio.pager_numero}" color="${cor}" message="${CFG.lrsMessage}" />\n`;
}

// Envia o XML pro transmissor via TCP. Resolve { ok, erro? }.
function enviarLrs(envio) {
  if (CFG.dryRun) {
    log(`[DRY_RUN] tocaria pager ${envio.pager_numero} (cor ${envio.cor}) · ${montarXml(envio).trim()}`);
    return Promise.resolve({ ok: true });
  }
  return new Promise((resolve) => {
    const xml = montarXml(envio);
    let resposta = '';
    let resolvido = false;
    const done = (r) => { if (!resolvido) { resolvido = true; try { socket.destroy(); } catch {} resolve(r); } };

    const socket = net.createConnection({ host: CFG.lrsHost, port: CFG.lrsPort });
    socket.setTimeout(CFG.tcpTimeout);

    socket.on('connect', () => socket.write(xml));
    socket.on('data', (buf) => {
      resposta += buf.toString();
      // Resposta do NetPage chega como <PageRequestStatus .../>
      // ret indica EINPROGRESS (enfileirado) ou ESUCCESS (transmitido).
      if (/PageRequestStatus/i.test(resposta)) {
        const erroDeclarado = /ret="(?:[1-8])"/i.test(resposta) && !/ESUCCESS|EINPROGRESS/i.test(resposta);
        done(erroDeclarado ? { ok: false, erro: `transmissor: ${resposta.trim()}` } : { ok: true });
      }
    });
    socket.on('timeout', () => {
      // Sem resposta mas escreveu: muitos transmissores nao respondem · trata como ok.
      done(resposta ? { ok: true } : { ok: true, erro: null });
    });
    socket.on('error', (e) => done({ ok: false, erro: `tcp: ${e.message}` }));
    socket.on('close', () => done({ ok: true }));
  });
}

async function apiGet(path) {
  const r = await fetch(`${CFG.apiBase}${path}`, {
    headers: { Authorization: `Bearer ${CFG.token}` },
  });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
  return r.json();
}

async function apiPost(path, body) {
  const r = await fetch(`${CFG.apiBase}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CFG.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!r.ok) throw new Error(`POST ${path} → ${r.status}`);
  return r.json();
}

async function ciclo() {
  let fila;
  try {
    fila = await apiGet('/totem-kids/pager/bridge/fila?max=20');
  } catch (e) {
    log('[poll] erro ao buscar fila:', e.message);
    return;
  }
  const envios = fila?.envios || [];
  if (!envios.length) return;
  log(`[poll] ${envios.length} envio(s) pendente(s)`);

  for (const envio of envios) {
    const r = await enviarLrs(envio);
    try {
      await apiPost(`/totem-kids/pager/bridge/envios/${envio.id}/resultado`, { ok: r.ok, erro: r.erro || null });
      log(`[envio ${envio.id}] pager ${envio.pager_numero} · ${r.ok ? 'OK' : 'ERRO: ' + r.erro}`);
    } catch (e) {
      log(`[envio ${envio.id}] falha ao reportar resultado:`, e.message);
    }
  }
}

async function main() {
  checarConfig();
  log('[pager-bridge] iniciando', {
    apiBase: CFG.apiBase, lrs: CFG.dryRun ? 'DRY_RUN' : `${CFG.lrsHost}:${CFG.lrsPort}`, pollMs: CFG.pollMs,
  });
  // loop simples · um ciclo por vez (evita sobreposicao)
  for (;;) {
    await ciclo();
    await new Promise((res) => setTimeout(res, CFG.pollMs));
  }
}

main().catch((e) => { console.error('[pager-bridge] fatal:', e); process.exit(1); });
