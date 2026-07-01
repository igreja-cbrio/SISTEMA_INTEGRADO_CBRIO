// Página pública · confirmação de presença de um evento externo.
// Ao enviar, mostra o "número da sorte" (aleatório) que vale pro sorteio.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { eventoPublico } from '../../api';
import { Loader2, PartyPopper, CalendarDays, MapPin } from 'lucide-react';

export default function EventoExterno() {
  const { slug = '' } = useParams();
  const [evento, setEvento] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ numero: number; jaInscrito?: boolean } | null>(null);

  useEffect(() => {
    eventoPublico.get(slug).then(setEvento).catch(e => setErro(e.message || 'Evento não encontrado')).finally(() => setCarregando(false));
  }, [slug]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (nome.trim().length < 2) { setErro('Informe seu nome.'); return; }
    if (telefone.replace(/\D/g, '').length < 10) { setErro('Informe um telefone válido (com DDD).'); return; }
    setEnviando(true);
    try {
      const r = await eventoPublico.inscrever(slug, { nome, telefone, email, website });
      setResultado({ numero: r.numero_sorte, jaInscrito: r.ja_inscrito });
    } catch (e: any) { setErro(e.message || 'Erro ao confirmar presença.'); }
    finally { setEnviando(false); }
  }

  const dataFmt = evento?.data ? new Date(evento.data + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }) : '';

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#0b3b45,#00B39D 140%)' }} className="flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-6 sm:p-8">
        {carregando ? (
          <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-teal-600" /></div>
        ) : erro && !evento ? (
          <div className="text-center py-12 text-gray-600">{erro}</div>
        ) : resultado ? (
          <div className="text-center py-6">
            <PartyPopper className="h-12 w-12 text-teal-600 mx-auto mb-3" />
            <h1 className="text-xl font-bold text-gray-900">Presença confirmada!</h1>
            <p className="text-gray-500 mt-1 text-sm">{resultado.jaInscrito ? 'Você já estava confirmado(a).' : `Te esperamos${evento?.nome ? ` no ${evento.nome}` : ''}.`}</p>
            <div className="mt-6 rounded-xl bg-teal-50 border border-teal-200 py-6">
              <div className="text-sm text-teal-700 font-medium">Seu número da sorte</div>
              <div className="text-6xl font-extrabold text-teal-700 tabular-nums mt-1">{resultado.numero}</div>
              <div className="text-xs text-teal-600 mt-2">Guarde este número — vale pro sorteio!</div>
            </div>
          </div>
        ) : (
          <>
            <div className="text-center mb-6">
              <h1 className="text-2xl font-extrabold text-gray-900">{evento?.nome}</h1>
              {(dataFmt || evento?.hora || evento?.local) && (
                <div className="mt-2 space-y-1 text-sm text-gray-500">
                  {dataFmt && <div className="flex items-center justify-center gap-1.5"><CalendarDays className="h-4 w-4" /> {dataFmt}{evento?.hora ? ` · ${evento.hora}` : ''}</div>}
                  {evento?.local && <div className="flex items-center justify-center gap-1.5"><MapPin className="h-4 w-4" /> {evento.local}</div>}
                </div>
              )}
              {evento?.descricao && <p className="mt-3 text-sm text-gray-600 whitespace-pre-line">{evento.descricao}</p>}
              <p className="mt-4 text-sm font-medium text-teal-700">Confirme sua presença</p>
            </div>

            {!evento?.form_ativo ? (
              <div className="text-center py-8 text-gray-500">As inscrições deste evento estão encerradas.</div>
            ) : (
              <form onSubmit={enviar} className="space-y-3">
                <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo"
                  className="w-full rounded-lg border border-gray-300 px-3 py-3 text-gray-900" />
                <input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="Telefone (WhatsApp, com DDD)" inputMode="tel"
                  className="w-full rounded-lg border border-gray-300 px-3 py-3 text-gray-900" />
                <input value={email} onChange={e => setEmail(e.target.value)} placeholder="E-mail (opcional)" inputMode="email"
                  className="w-full rounded-lg border border-gray-300 px-3 py-3 text-gray-900" />
                <input value={website} onChange={e => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off"
                  className="hidden" aria-hidden="true" />
                {erro && <div className="text-sm text-red-600">{erro}</div>}
                <button type="submit" disabled={enviando}
                  className="w-full rounded-lg bg-teal-600 text-white font-semibold py-3 hover:bg-teal-700 disabled:opacity-60 inline-flex items-center justify-center gap-2">
                  {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Confirmar presença'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
