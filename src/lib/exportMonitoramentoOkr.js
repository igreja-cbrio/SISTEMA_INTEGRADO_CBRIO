// ============================================================================
// Exportação do /monitoramento-okr — PDF (1 folha) + Slides (capa + 3 blocos)
//
// Tudo client-side: lazy-import de jspdf + html2canvas (já no projeto) pra não
// pesar o bundle principal. Não toca backend nem outros módulos — é só leitura
// do DOM já renderizado da vitrine do Juninho.
// ============================================================================

async function loadLibs() {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);
  return { jsPDF, html2canvas };
}

// Cor de fundo do tema atual (claro/escuro) pra o canvas não vir transparente.
function temaBg() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--cbrio-bg').trim();
  return v || '#ffffff';
}

const ignorar = (el) =>
  !!(el && el.getAttribute && el.getAttribute('data-export-ignore') === '1');

// ── PDF · a página inteira escalada pra caber em UMA folha A4 retrato ──
export async function exportarMonitoramentoPdf(el) {
  const { jsPDF, html2canvas } = await loadLibs();
  const bg = temaBg();

  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: bg,
    useCORS: true,
    logging: false,
    ignoreElements: ignorar,
  });

  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const availW = pageW - margin * 2;
  const availH = pageH - margin * 2;

  // min() garante a página inteira numa folha só (limita pela altura).
  const ratio = Math.min(availW / canvas.width, availH / canvas.height);
  const w = canvas.width * ratio;
  const h = canvas.height * ratio;
  const x = (pageW - w) / 2;
  const y = (pageH - h) / 2;

  pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', x, y, w, h);
  pdf.save('monitoramento-okr.pdf');
}

// ── Capa CBRio (DOM off-screen → canvas) ──
async function renderCapa(html2canvas) {
  const div = document.createElement('div');
  div.style.cssText = [
    'position:fixed', 'left:-99999px', 'top:0',
    'width:1188px', 'height:840px', // proporção A4 paisagem (≈1.414)
    'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
    'background:linear-gradient(135deg,#00B39D 0%,#00897B 100%)',
    'font-family:Inter,system-ui,Arial,sans-serif',
  ].join(';');
  div.innerHTML = `
    <div style="background:#ffffff;border-radius:28px;padding:36px 56px;box-shadow:0 18px 50px rgba(0,0,0,0.25)">
      <img src="/logo-cbrio-text.png" alt="CBRio" style="height:96px;display:block" />
    </div>
    <h1 style="color:#ffffff;font-size:62px;font-weight:800;margin:56px 0 0;letter-spacing:-1px">Monitoramento OKR</h1>
    <p style="color:rgba(255,255,255,0.92);font-size:26px;font-weight:600;margin:14px 0 0">Planejamento Estratégico · KPIs 2026</p>
    <p style="color:rgba(255,255,255,0.78);font-size:18px;margin:64px 0 0">${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
  `;
  document.body.appendChild(div);
  try {
    const img = div.querySelector('img');
    if (img && !img.complete) {
      await new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; });
    }
    return await html2canvas(div, { scale: 2, backgroundColor: '#00897B', useCORS: true, logging: false });
  } finally {
    document.body.removeChild(div);
  }
}

// ── Slides · capa + 1 página paisagem por bloco (Ministerial · Criativo · Gestão) ──
export async function exportarMonitoramentoSlides(blocos, titulos) {
  const { jsPDF, html2canvas } = await loadLibs();
  const pdf = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();  // 297
  const pageH = pdf.internal.pageSize.getHeight(); // 210
  const bg = temaBg();

  // Capa
  const capa = await renderCapa(html2canvas);
  pdf.addImage(capa.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageW, pageH);

  for (let i = 0; i < blocos.length; i++) {
    if (!blocos[i]) continue;
    pdf.addPage('a4', 'l');

    // Faixa de título
    const bandH = 22;
    pdf.setFillColor(0, 179, 157);
    pdf.rect(0, 0, pageW, bandH, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(19);
    pdf.text(titulos[i] || `Slide ${i + 1}`, 14, 14.5);

    const canvas = await html2canvas(blocos[i], {
      scale: 2, backgroundColor: bg, useCORS: true, logging: false, ignoreElements: ignorar,
    });

    const margin = 10;
    const top = bandH + 6;
    const availW = pageW - margin * 2;
    const availH = pageH - top - margin;
    const ratio = Math.min(availW / canvas.width, availH / canvas.height);
    const w = canvas.width * ratio;
    const h = canvas.height * ratio;
    const x = (pageW - w) / 2;
    const y = top + (availH - h) / 2;

    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', x, y, w, h);
  }

  pdf.save('monitoramento-okr-slides.pdf');
}
