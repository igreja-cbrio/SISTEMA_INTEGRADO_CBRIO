import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { payloadLinkSala } from '@/lib/linkSalaGrupo';

// ⚠️ Comentário removido antes de casar: os dois arquivos CITAM o código na
// explicação, e sem isto a própria explicação vira a evidência (lição 06/08).
function semComentarios(txt: string) {
  return txt
    .split('\n')
    .map(l => l.replace(/\/\/[^\n]*/, ''))          // linha
    .map(l => l.replace(/\/\*[^\n]*?\*\//g, ''))    // bloco de UMA linha só
    .join('\n');
}

const raiz = path.resolve(__dirname, '../..');
const gruposJsx = semComentarios(fs.readFileSync(path.join(raiz, 'src/pages/ministerial/Grupos.jsx'), 'utf8'));
const gruposApi = semComentarios(fs.readFileSync(path.join(raiz, 'backend/routes/grupos.js'), 'utf8'));

describe('payloadLinkSala · o que o formulário diz sobre o link', () => {
  it('leitura OK com texto: manda o link', () => {
    expect(payloadLinkSala({ link_online: 'https://meet.google.com/abc' }))
      .toEqual({ link_online: 'https://meet.google.com/abc' });
  });

  it('leitura OK e vazio: manda vazio — é o pedido de APAGAR', () => {
    expect(payloadLinkSala({ link_online: '' })).toEqual({ link_online: '' });
  });

  it('⚠️⚠️ leitura FALHOU: o campo SAI do corpo (não apaga o que está gravado)', () => {
    const p = payloadLinkSala({ link_online: '', link_indisponivel: true });
    expect(p).toEqual({});
    expect('link_online' in p).toBe(false);
  });

  it('leitura falhou vence até com texto digitado: o form não sabe o estado real', () => {
    expect(payloadLinkSala({ link_online: 'https://x.com', link_indisponivel: true })).toEqual({});
  });

  it('espaço nas pontas é aparado (o que persiste é o que o servidor recebe)', () => {
    expect(payloadLinkSala({ link_online: '  https://x.com  ' })).toEqual({ link_online: 'https://x.com' });
  });

  it('campo ausente/nulo não vira "undefined" no corpo', () => {
    expect(payloadLinkSala({})).toEqual({ link_online: '' });
    expect(payloadLinkSala({ link_online: null })).toEqual({ link_online: '' });
  });
});

describe('guarda estática · as duas pontas usam a régua', () => {
  it('o formulário de grupo decide pela régua, nunca inline', () => {
    expect(gruposJsx).toContain('payloadLinkSala(form)');
    // ⚠️ O default do form (`link_online: ''`) não pode voltar ao corpo por
    // espalhamento: é ele que apagaria o link quando a leitura falha.
    expect(gruposJsx).toContain('link_online: _lo');
  });

  it('⚠️⚠️ o servidor só toca no link quando a chave VEIO no corpo', () => {
    expect(gruposApi).toContain("if (!('link_online' in d)) return null;");
  });

  it('o link é gravado em mem_grupo_link, NUNCA numa coluna de mem_grupos', () => {
    expect(gruposApi).toContain("from('mem_grupo_link')");
    expect(gruposApi).not.toMatch(/from\('mem_grupos'\)[\s\S]{0,400}link_online:/);
  });

  it('⚠️ régua ÚNICA: criar e editar grupo passam pela MESMA função', () => {
    const chamadas = gruposApi.match(/gravarLinkDaSala\(/g) || [];
    // 1 declaração + POST + PUT
    expect(chamadas.length).toBe(3);
  });
});
