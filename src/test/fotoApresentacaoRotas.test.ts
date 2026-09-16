import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guarda das ROTAS da foto da apresentação (16/09/2026).
 *
 * ⚠️⚠️ POR QUE ISTO EXISTE
 * O teste de `backend/utils/fotoApresentacao.js` prova que a régua recusa um
 * caminho de outra pasta do bucket. Não prova que alguém CHAMA a régua — e o
 * defeito que importa é a AUSÊNCIA da chamada, não um operador trocado dentro
 * dela (a lição do mutante fiel). Se o `caminhoFotoValido` sumir do INSERT
 * público, nada quebra, nada loga: a inscrição passa a aceitar o caminho da
 * foto de identificação de QUALQUER criança do Kids, e a ficha serve o arquivo
 * assinado. É exatamente o formato de falha da whitelist de 09/09.
 *
 * ⚠️ COMENTÁRIO SAI ANTES DE CASAR (armadilha de 06/08/2026): os comentários
 * destes arquivos CITAM `caminhoFotoValido` e `kids-documentos` na explicação.
 * Sem remover, o texto explicativo vira a evidência e o teste passa com a
 * guarda ausente.
 */

const PUBLICA = resolve(__dirname, '../../backend/routes/publicApresentacao.js');
const KIDS = resolve(__dirname, '../../backend/routes/totemKids.js');

function semComentarios(js: string): string {
  return js
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

const publica = semComentarios(readFileSync(PUBLICA, 'utf8'));
const kids = semComentarios(readFileSync(KIDS, 'utf8'));

describe('porta pública · o caminho da foto é validado antes de virar coluna', () => {
  it('o normalizador da lista passa `foto_path` pela régua', () => {
    expect(publica).toContain('caminhoFotoValido(c && c.foto_path) ? c.foto_path : null');
  });

  // ⚠️⚠️ O mutante: trocar a linha acima por `fotoPath: c.foto_path`.
  it('`foto_path` do cliente nunca é usado sem passar pela régua', () => {
    const usos = publica.split('c.foto_path').length - 1;
    const guardados = publica.split('caminhoFotoValido(c && c.foto_path) ? c.foto_path : null').length - 1;
    // 2 usos, e os 2 estão DENTRO da única expressão guardada
    expect(usos).toBe(guardados * 2);
    expect(guardados).toBe(1);
  });

  it('a coluna só é MENCIONADA no INSERT quando há foto (lei do 42703)', () => {
    expect(publica).toContain('...(c.fotoPath ? { foto_storage_path: c.fotoPath');
  });

  // ⚠️⚠️ Ordem de deploy: se o código subir antes do SQL, o INSERT COM FOTO
  // morre em 42703 e o `continue` descartaria a inscrição INTEIRA — a família
  // perderia a vaga por causa de uma imagem. Some a foto, nunca a criança.
  it('sem a migration, retenta SEM a foto em vez de perder a inscrição', () => {
    expect(publica).toContain("error.code === '42703'");
    expect(publica).toContain('const { foto_storage_path, foto_enviada_em, ...semFoto } = linhaInsc;');
    expect(publica).toContain('await inserir(semFoto)');
  });

  it('sobe pro bucket PRIVADO, nunca pra um público', () => {
    expect(publica).toContain("from('kids-documentos')");
    expect(publica).not.toContain("from('fotos-membros')");
    expect(publica).not.toContain('getPublicUrl');
  });

  // ⚠️ dataURL aqui morreria no express.json de 1mb, antes de chegar na rota.
  it('recebe MULTIPART, não dataURL', () => {
    expect(publica).toContain("uploadFoto.single('foto')");
    expect(publica).not.toContain('data:image');
  });
});

describe('ficha do Kids · a foto é privada e as rotas têm gate', () => {
  it('upload e remoção passam por authorizeModule', () => {
    expect(kids).toContain("router.post('/apresentacoes/:id/foto', authorizeModule('kids', 2)");
    expect(kids).toContain("router.delete('/apresentacoes/:id/foto', authorizeModule('kids', 3)");
  });

  it('o cliente recebe URL ASSINADA, nunca o caminho cru nem URL pública', () => {
    expect(kids).toContain('createSignedUrl(insc.foto_storage_path, 60 * 30');
    expect(kids).toContain('foto_url: fotoUrl');
    expect(kids).not.toContain("getPublicUrl(insc.foto_storage_path");
  });

  // ⚠️⚠️ Sobrescrever o caminho deixaria a URL assinada VELHA, válida por mais
  // 30 min, apontando pra imagem NOVA.
  it('a troca gera caminho novo em vez de sobrescrever', () => {
    expect(kids).toContain('upload(caminho, req.file.buffer, { contentType: req.file.mimetype, upsert: false })');
  });

  it('a lista tolera a coluna ausente (migration não aplicada)', () => {
    expect(kids).toContain("const OPCIONAIS = ['horario_culto', 'presente_em', 'foto_storage_path'];");
  });

  // ⚠️⚠️ A lista devolve SE tem foto, nunca ONDE ela está: caminho cru numa
  // resposta de lista some com o motivo de o bucket ser privado.
  it('a lista devolve booleano, não o caminho do arquivo', () => {
    expect(kids).toContain('tem_foto: Boolean(foto_storage_path)');
    expect(kids).toContain('const linhas = (data || []).map(({ foto_storage_path, ...r }) => ({');
  });

  it('sem migration devolve 409 dizendo o motivo, nunca 500 genérico', () => {
    expect(kids).toContain('20260916140000');
    expect(kids.split("status(409)").length - 1).toBeGreaterThanOrEqual(2);
  });
});
