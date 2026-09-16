import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guarda: nenhuma tela do Kids manda imagem de ARQUIVO como base64 cru.
 *
 * ⚠️⚠️ POR QUE ISTO EXISTE
 * As rotas de foto/logo do Kids recebem dataURL em JSON, e `/api/totem-kids`
 * cai no `express.json` GLOBAL de 1mb (`backend/server.js`). Base64 engorda
 * ~33%: o teto real é ~750KB de arquivo, e as telas prometiam 5MB. Acima disso
 * o corpo morre NO PARSER, antes da rota — 413 com corpo que não é o nosso, e
 * a pessoa lê um erro genérico.
 *
 * ⚠️ MEDIDO em 16/09/2026: das 98 fotos no bucket, a MAIOR tem 68KB e a mediana
 * 43KB — a assinatura da webcam do totem (640×480). O caminho do
 * `<input type="file">` nunca produziu um sucesso sequer.
 *
 * O defeito que importa é a AUSÊNCIA da redução: tirar `arquivoParaDataUrl` e
 * voltar pro `readAsDataURL` cru não quebra build, não loga — só volta a
 * falhar em silêncio pra qualquer foto de celular.
 *
 * ⚠️ A webcam (`TotemKidsCheckin`) NÃO entra aqui: ela captura 640×480 por
 * canvas e nunca chega perto do teto. Exigir a régua dela seria cerimônia.
 */

const TELAS = [
  'src/pages/ministerial/totemKids/GestaoCriancas.tsx',
  'src/pages/ministerial/totemKids/EditarEtiquetaModal.tsx',
  'src/pages/ministerial/totemKids/TotemKidsTesteEtiqueta.tsx',
];

function semComentarios(js: string): string {
  return js
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

describe('telas do Kids que mandam imagem de arquivo', () => {
  for (const rel of TELAS) {
    const src = semComentarios(readFileSync(resolve(__dirname, '../../', rel), 'utf8'));

    it(`${rel.split('/').pop()} usa a régua de redução`, () => {
      expect(src).toContain('arquivoParaDataUrl');
    });

    // ⚠️⚠️ O mutante: voltar o FileReader cru.
    it(`${rel.split('/').pop()} não lê o arquivo direto como base64`, () => {
      expect(src).not.toContain('readAsDataURL');
    });

    // ⚠️ O aviso "máx 5MB" era MENTIRA: a rota parava em ~750KB. Com a redução
    // o teto passa a ser o que o navegador decodifica, e o texto tem de mudar
    // junto — número na tela que não corresponde ao comportamento é pior que
    // número nenhum.
    it(`${rel.split('/').pop()} não promete mais o limite antigo de 5MB`, () => {
      expect(src).not.toContain('máx 5MB');
    });
  }
});
