// Gera o certificado de Apresentação de Crianças a partir do MESMO arquivo PPTX
// modelo (public/certificado-apresentacao-template.pptx · 1 slide com placeholders).
// Substitui SÓ o nome da criança, os pais, a data e a concordância de gênero —
// layout, fontes e cores ficam idênticos ao modelo.
import JSZip from 'jszip';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function dataPorExtenso(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

// Escapa o que vai pro XML (nomes podem ter & < > " ')
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function baixarBlob(blob, nomeArquivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * @param {object} p
 * @param {string} p.criancaNome
 * @param {string} [p.nomePai]
 * @param {string} [p.nomeMae]
 * @param {string} p.dataApresentacao  ISO yyyy-mm-dd
 * @param {'menino'|'menina'} [p.genero]
 */
export async function gerarCertificadoApresentacao({ criancaNome, nomePai, nomeMae, dataApresentacao, genero = 'menino' }) {
  const fem = genero === 'menina';
  const pais = [nomePai, nomeMae].map(s => (s || '').trim()).filter(Boolean).join(' e ') || '_______________';

  const res = await fetch('/certificado-apresentacao-template.pptx', { cache: 'no-store' });
  if (!res.ok) throw new Error('Não consegui carregar o modelo do certificado.');
  const zip = await JSZip.loadAsync(await res.arrayBuffer());

  const slidePath = 'ppt/slides/slide1.xml';
  let xml = await zip.file(slidePath).async('string');
  xml = xml
    .replace(/\{\{NOME\}\}/g, esc(criancaNome))
    .replace(/\{\{PAIS\}\}/g, esc(pais))
    .replace(/\{\{DATA\}\}/g, esc(dataPorExtenso(dataApresentacao)))
    .replace(/\{\{FILHO\}\}/g, fem ? 'filha' : 'filho')
    .replace(/\{\{DEDICADO\}\}/g, fem ? 'dedicada' : 'dedicado')
    .replace(/\{\{PRONOME\}\}/g, fem ? 'dela' : 'dele');
  zip.file(slidePath, xml);

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
  const safe = (criancaNome || 'crianca').replace(/[\\/:*?"<>|]+/g, ' ').trim();
  baixarBlob(blob, `Certificado - ${safe}.pptx`);
}
