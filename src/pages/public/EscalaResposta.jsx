import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { publicVoluntariado as api } from '@/api';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * "Vou / não vou poder" — a página que abre pelo link do WhatsApp.
 *
 * Pedido do Matheus (14/08/2026): a mensagem de escala tem que dar à pessoa a
 * opção de dizer que NÃO vai, e a recusa tem que atualizar a escala na hora.
 *
 * ⚠️ SEM LOGIN de propósito: a credencial é o token assinado, que chegou no
 * WhatsApp dela. Exigir login aqui é o mesmo que não ter o botão — a maioria
 * dos voluntários não tem conta no sistema.
 *
 * ⚠️ Mostra o MÍNIMO (área, função, culto, horário). Um link vaza em print e em
 * celular emprestado; ele não pode virar janela pra base de gente.
 *
 * ⚠️⚠️ MODELO OPT-OUT (decisão do Matheus, 14/08: "mas ela já tá como sim").
 * Quem foi escalado VAI — não se pede confirmação. A ação em destaque é a
 * ÚNICA que a pessoa precisa tomar: avisar que não vai. Confirmar continua
 * possível, mas como link discreto: transformar isso em decisão de dois botões
 * iguais faz a pessoa parar pra escolher algo que já estava resolvido.
 */
export default function EscalaResposta() {
  const { token } = useParams();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState('');
  const [confirmarRecusa, setConfirmarRecusa] = useState(false);

  useEffect(() => {
    let vivo = true;
    api.escalaPorToken(token)
      .then(d => { if (vivo) setDados(d); })
      .catch(e => { if (vivo) setErro(e.message || 'Link inválido ou expirado.'); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [token]);

  const responder = async (status) => {
    setEnviando(status);
    try {
      const r = await api.responderEscala(token, status);
      setDados(d => ({ ...d, status: r.status }));
      setConfirmarRecusa(false);
    } catch (e) {
      setErro(e.message || 'Não foi possível registrar sua resposta.');
    } finally {
      setEnviando('');
    }
  };

  const quando = dados?.quando
    ? format(new Date(dados.quando), "EEEE, dd 'de' MMMM 'às' HH:mm", { locale: ptBR })
    : null;

  return (
    <div className="min-h-screen bg-[#0d1117] text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 space-y-5">
        <div className="text-center">
          <div className="text-[#00B39D] text-sm font-semibold tracking-wide">CBRIO · VOLUNTARIADO</div>
        </div>

        {carregando && <p className="text-center text-white/60 py-8">Carregando…</p>}

        {/* ⚠️ Erro NÃO se disfarça de "nada aqui": a pessoa precisa saber se o
            link não vale ou se a nossa conexão falhou. */}
        {!carregando && erro && (
          <div className="text-center py-6 space-y-2">
            <p className="text-white/90">{erro}</p>
            <p className="text-white/50 text-sm">
              Se você recebeu esta mensagem por engano, ou o link não abre, fale com a liderança da sua área.
            </p>
          </div>
        )}

        {!carregando && !erro && dados && (
          <>
            <div className="space-y-1 text-center">
              <h1 className="text-xl font-semibold">
                {dados.primeiro_nome ? `${dados.primeiro_nome}, você está escalado(a)` : 'Você está escalado(a)'}
              </h1>
              <p className="text-white/70">
                {dados.area}{dados.funcao ? ` · ${dados.funcao}` : ''}
              </p>
              {quando && <p className="text-white/90 capitalize">{quando}</p>}
              {dados.culto && <p className="text-white/50 text-sm">{dados.culto}</p>}
            </div>

            {dados.passou ? (
              <p className="text-center text-white/60 text-sm border-t border-white/10 pt-4">
                Este culto já aconteceu.
              </p>
            ) : dados.status === 'confirmed' ? (
              <div className="text-center border-t border-white/10 pt-4 space-y-3">
                <p className="text-[#00B39D] font-medium">Presença confirmada. Até lá!</p>
                <p className="text-white/50 text-sm">Se algo mudar, é só avisar por aqui.</p>
                {/* Mudar de ideia continua possível — a pessoa que confirmou e
                    depois não pode precisa avisar, e sem esta saída ela
                    simplesmente não aparece. */}
                <button
                  onClick={() => setConfirmarRecusa(true)}
                  className="text-white/50 text-sm underline underline-offset-4"
                >
                  Não vou mais poder
                </button>
              </div>
            ) : dados.status === 'declined' ? (
              <div className="text-center border-t border-white/10 pt-4 space-y-3">
                <p className="text-amber-300 font-medium">Avisamos a liderança que você não vai poder.</p>
                <p className="text-white/50 text-sm">Obrigado por avisar — dá tempo de encontrar alguém.</p>
                <button
                  onClick={() => responder('confirmed')}
                  disabled={!!enviando}
                  className="text-white/50 text-sm underline underline-offset-4"
                >
                  Na verdade eu vou poder
                </button>
              </div>
            ) : confirmarRecusa ? (
              <div className="border-t border-white/10 pt-4 space-y-3">
                <p className="text-center text-white/80 text-sm">
                  Vamos avisar a liderança da sua área e a vaga volta a ficar em aberto. Confirma?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmarRecusa(false)}
                    className="flex-1 h-11 rounded-xl border border-white/15 text-white/80"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={() => responder('declined')}
                    disabled={!!enviando}
                    className="flex-1 h-11 rounded-xl bg-amber-500/90 text-black font-medium disabled:opacity-60"
                  >
                    {enviando === 'declined' ? 'Avisando…' : 'Sim, não vou poder'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="border-t border-white/10 pt-4 space-y-3">
                <p className="text-center text-white/70 text-sm">
                  Está tudo certo — você <strong className="text-white/90">não precisa confirmar</strong>.
                  Só avise se não conseguir comparecer.
                </p>
                <button
                  onClick={() => setConfirmarRecusa(true)}
                  disabled={!!enviando}
                  className="w-full h-12 rounded-xl border border-amber-400/40 bg-amber-500/10 text-amber-200 font-medium disabled:opacity-60"
                >
                  Não vou conseguir comparecer
                </button>
                <div className="text-center">
                  <button
                    onClick={() => responder('confirmed')}
                    disabled={!!enviando}
                    className="text-white/45 text-sm underline underline-offset-4 disabled:opacity-60"
                  >
                    {enviando === 'confirmed' ? 'Confirmando…' : 'Quero confirmar mesmo assim'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
