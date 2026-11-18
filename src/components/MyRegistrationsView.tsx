import { FormEvent, useState } from 'react';
import { Mail, Search, ShieldCheck } from 'lucide-react';

interface MyRegistrationsViewProps {
  onOpenEmailPreview: (emailId: string) => void;
}

interface LookupResult {
  count: number;
  deliveryMode: 'smtp' | 'preview';
  previewEmailId: string | null;
  items: Array<{
    id: string;
    missionTitle: string;
    timeLabel: string;
    status: 'pending' | 'confirmed';
  }>;
}

export function MyRegistrationsView({ onOpenEmailPreview }: MyRegistrationsViewProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/my-registrations/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Recherche impossible.');
      }
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-blue-900 shrink-0 mt-1" />
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Retrouver ou modifier mes inscriptions
            </h2>
            <p className="mt-1 text-sm text-slate-600 leading-relaxed">
              Pour éviter qu’un bénévole n’efface une inscription par erreur, la modification ou l’annulation passe uniquement par un lien personnel envoyé sur votre adresse e-mail.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Saisissez votre adresse e-mail d’inscription"
            aria-label="Adresse e-mail"
            className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-900/15"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Search className="w-4 h-4" />
            {loading ? 'Recherche...' : 'Recevoir mon récapitulatif'}
          </button>
        </form>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </section>

      {result && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          {result.count === 0 ? (
            <p className="text-sm text-slate-600">
              Aucune inscription active n’a été trouvée avec l’adresse <strong>{email}</strong>.
            </p>
          ) : (
            <>
              <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50/70 p-4">
                <Mail className="w-5 h-5 text-blue-900 shrink-0 mt-0.5" />
                <div className="text-sm text-slate-800">
                  <p className="font-semibold">
                    {result.count} mission{result.count > 1 ? 's' : ''} associée{result.count > 1 ? 's' : ''} à votre adresse
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Un e-mail contenant vos liens personnels (ajout à l’agenda .ics, validation ou annulation) vient d’être envoyé à <strong>{email}</strong>.
                  </p>
                </div>
              </div>

              {result.deliveryMode === 'preview' && result.previewEmailId && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3.5">
                  <p className="text-xs text-amber-900">
                    Mode test sans serveur SMTP : ouvrez l’e-mail généré pour accéder à vos liens personnels.
                  </p>
                  <button
                    type="button"
                    onClick={() => onOpenEmailPreview(result.previewEmailId!)}
                    className="rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 whitespace-nowrap shrink-0"
                  >
                    Ouvrir l’e-mail
                  </button>
                </div>
              )}

              <ul className="divide-y divide-slate-200 border-t border-slate-200">
                {result.items.map((item) => (
                  <li
                    key={item.id}
                    className="py-3 flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <div>
                      <span className="font-semibold text-slate-900">
                        {item.missionTitle}
                      </span>
                      <span className="mx-2 text-slate-300">·</span>
                      <span className="font-mono tabular-nums text-xs text-slate-600">
                        {item.timeLabel}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-semibold ${
                        item.status === 'confirmed'
                          ? 'text-emerald-700'
                          : 'text-amber-700'
                      }`}
                    >
                      {item.status === 'confirmed'
                        ? 'Confirmée'
                        : 'En attente de validation'}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
