// Política de Reembolso e Cancelamento · página PÚBLICA (sem login) · 2026-07-31
//
// Decisões do Marcos (31/07): devolução INTEGRAL de 100% até 4 dias antes do
// evento · a 3 dias ou menos, sem devolução · a igreja absorve a taxa do
// provedor SEMPRE · transferência permitida até 48h antes · canal
// financeiro@cbrio.com.br.
//
// ⚠️ O direito de arrependimento de 7 dias (CDC art. 49) PREVALECE sobre o corte
// de 3 dias. Quem comprou há menos de 7 dias tem devolução integral mesmo
// pedindo na véspera — política não revoga lei, e escrever o contrário aqui é o
// que gera reclamação no Procon. É por isso que a ordem dos blocos abaixo
// importa: o prazo legal vem primeiro e é dito como prevalente.
//
// Esta página é a FONTE do texto publicado. O documento em
// docs/politica-reembolso-inscricoes.md guarda as decisões e o porquê — não
// duplicar o texto lá.
import { useEffect } from 'react';

const C = {
  bg: 'var(--cbrio-bg, #0b0f14)',
  card: 'var(--cbrio-card, #131a22)',
  text: 'var(--cbrio-text, #e8eef5)',
  text2: 'var(--cbrio-text2, #b3c0cf)',
  text3: 'var(--cbrio-text3, #8595a8)',
  border: 'var(--cbrio-border, #223040)',
  primary: '#00B39D',
};

export default function PoliticaReembolso() {
  useEffect(() => { document.title = 'Política de Reembolso · CBRio'; }, []);

  const h2 = { fontSize: 17, fontWeight: 700, margin: '26px 0 8px', color: C.text } as const;
  const p = { margin: '0 0 12px', lineHeight: 1.6, color: C.text2, fontSize: 15 } as const;

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, padding: '32px 20px' }}>
      <div style={{
        maxWidth: 720, margin: '0 auto', background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 16, padding: '28px 24px', color: C.text,
      }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: 1, color: C.text3, textTransform: 'uppercase' }}>
          Comunidade Batista do Rio de Janeiro
        </p>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '6px 0 4px' }}>
          Política de Reembolso e Cancelamento
        </h1>
        <p style={{ ...p, color: C.text3, fontSize: 13 }}>
          Válida para inscrições em eventos pagos. Atualizada em 31/07/2026.
        </p>

        <h2 style={h2}>1. Desistência em até 7 dias — devolução integral</h2>
        <p style={p}>
          Você pode desistir da inscrição em até <b>7 dias corridos</b> contados da
          confirmação do pagamento, sem precisar justificar, e receber de volta
          <b> 100% do valor pago</b>.
        </p>
        <p style={p}>
          Esse direito é garantido pelo <b>artigo 49 do Código de Defesa do
          Consumidor</b> para compras feitas pela internet e <b>vale mesmo que o
          evento esteja próximo</b> — ele prevalece sobre o prazo do item 2. Se o
          evento acontecer antes de os 7 dias se completarem, o direito vale até
          a data do evento.
        </p>

        <h2 style={h2}>2. Cancelamento depois dos 7 dias</h2>
        <p style={p}>
          Passado o prazo acima, o que vale é a antecedência do seu pedido em
          relação à data do evento:
        </p>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', margin: '0 0 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ color: C.text2, fontSize: 14 }}>Com <b>4 dias ou mais</b> de antecedência</span>
            <b style={{ color: C.primary, whiteSpace: 'nowrap' }}>Devolução de 100%</b>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 14px' }}>
            <span style={{ color: C.text2, fontSize: 14 }}>Com <b>3 dias ou menos</b> de antecedência</span>
            <b style={{ color: C.text3, whiteSpace: 'nowrap' }}>Sem devolução</b>
          </div>
        </div>
        <p style={p}>
          O motivo do corte de 3 dias: nessa altura a igreja já pagou local,
          alimentação, transporte e material com base no número de inscritos, e
          esses custos não voltam. Se você não pode mais ir, veja o item 3 — dá
          para passar sua vaga para outra pessoa.
        </p>

        <h2 style={h2}>3. Passar sua inscrição para outra pessoa</h2>
        <p style={p}>
          Até <b>48 horas antes</b> do evento você pode transferir sua inscrição
          para outra pessoa, <b>sem custo</b>, em vez de cancelar. Basta escrever
          para o contato do item 5 informando <b>nome completo, CPF e telefone</b> de
          quem vai no seu lugar.
        </p>

        <h2 style={h2}>4. Você recebe de volta o valor cheio</h2>
        <p style={p}>
          Quando há devolução, ela é do <b>valor integral que você pagou</b>. A
          taxa cobrada pelo provedor de pagamento é <b>assumida pela igreja</b> — não
          é descontada de você em nenhuma hipótese.
        </p>

        <h2 style={h2}>5. Como pedir</h2>
        <p style={p}>
          Escreva para <a href="mailto:financeiro@cbrio.com.br" style={{ color: C.primary }}>financeiro@cbrio.com.br</a> informando
          o <b>código da sua inscrição</b> (o <code style={{ color: C.text }}>CBR-AAAA-NNNNNN</code> que
          está no e-mail de confirmação) e o motivo. Respondemos em até
          <b> 5 dias úteis</b>.
        </p>

        <h2 style={h2}>6. Prazo para o dinheiro voltar</h2>
        <p style={p}>
          A devolução é feita pelo <b>mesmo meio do pagamento</b>, e o prazo não
          depende só da igreja:
        </p>
        <ul style={{ ...p, paddingLeft: 20 }}>
          <li><b>Pix:</b> até 5 dias úteis após a aprovação do pedido.</li>
          <li><b>Boleto:</b> até 10 dias úteis — precisamos dos seus dados bancários para o depósito.</li>
          <li>
            <b>Cartão de crédito:</b> o estorno é solicitado por nós, mas quem
            executa é a operadora do seu cartão, e pode aparecer em até
            <b> duas faturas</b>. Se você parcelou, as parcelas seguem sendo
            lançadas até a operadora processar o estorno.
          </li>
        </ul>

        <h2 style={h2}>7. Se a igreja cancelar ou adiar</h2>
        <p style={p}>
          Evento <b>cancelado</b> pela igreja: devolução <b>integral</b>, sem prazo
          mínimo e sem necessidade de pedido — procuramos você.
        </p>
        <p style={p}>
          Evento <b>adiado</b>: sua inscrição passa automaticamente para a nova
          data. Se a nova data não servir, você tem <b>7 dias</b> a partir do
          comunicado para pedir devolução integral.
        </p>

        <h2 style={h2}>8. Não comparecimento</h2>
        <p style={p}>
          Quem não avisa e não comparece não tem direito a devolução, porque a
          vaga ficou reservada e os custos foram assumidos.
        </p>

        <h2 style={h2}>9. Inscrições gratuitas e bolsas</h2>
        <p style={p}>
          Inscrição gratuita, ou liberada por bolsa, não gera devolução porque
          não houve pagamento. Se você não vai mais, avise — a vaga vai para
          outra pessoa que está esperando.
        </p>

        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 26, paddingTop: 14 }}>
          {/* "cbrio.org" fica como TEXTO, não link: apontar pra "/" levaria o
              visitante público pra tela de login do ERP, que não é o que ele
              procura numa página informativa. */}
          <p style={{ margin: 0, fontSize: 13, color: C.text3 }}>
            Dúvidas: <a href="mailto:financeiro@cbrio.com.br" style={{ color: C.primary }}>financeiro@cbrio.com.br</a>
            {' · Comunidade Batista do Rio de Janeiro'}
          </p>
        </div>
      </div>
    </div>
  );
}
