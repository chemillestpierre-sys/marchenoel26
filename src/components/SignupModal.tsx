import { FormEvent, useState } from 'react';
import { CalendarPlus, CheckCircle2, Mail, ShieldCheck, X } from 'lucide-react';
import { Mission, MissionSlot } from '../types';

interface SignupModalProps {
  mission: Mission | null;
  slot: MissionSlot | null;
  onClose: () => void;
  onSuccess: () => void;
  onOpenEmailPreview: (emailId: string) => void;
}

type Step = 'form' | 'verify' | 'confirmed';

export function SignupModal({
  mission,
  slot,
  onClose,
  onSuccess,
  onOpenEmailPreview,
}: SignupModalProps) {
  const [step, setStep] = useState<Step>('form');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [deliveryMode, setDeliveryMode] = useState<'smtp' | 'preview'>('smtp');
  const [previewEmailId, setPreviewEmailId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [resendNotice, setResendNotice] = useState<string | null>(null);

  if (!mission || !slot) return null;

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotId: slot.id,
          firstName,
          lastName,
          email,
          phone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.existingStatus === 'pending' && data.existingId) {
          setRegistrationId(data.existingId);
          setStep('verify');
          setError(data.error);
        } else {
          setError(data.error || "Impossible d'enregistrer votre demande.");
        }
        return;
      }

      setRegistrationId(data.registrationId);
      setDeliveryMode(data.deliveryMode);
      setPreviewEmailId(data.previewEmailId || null);
      setStep('verify');
      onSuccess();
    } catch {
      setError('Erreur de connexion au serveur.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!registrationId) return;
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/registrations/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationId, code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Code incorrect.');
        return;
      }
      setStep('confirmed');
      onSuccess();
    } catch {
      setError('Erreur lors de la validation.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!registrationId) return;
    setResendNotice(null);
    setError(null);
    try {
      const res = await fetch('/api/registrations/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Impossible de renvoyer l'e-mail.");
        return;
      }
      if (data.previewEmailId) {
        setPreviewEmailId(data.previewEmailId);
      }
      setResendNotice("Un nouvel e-mail de confirmation vient d'être envoyé.");
    } catch {
      setError("Erreur lors de l'envoi.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="signup-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-medium text-blue-900">
              Vendredi 4 décembre · {slot.timeLabel}
            </p>
            <h2
              id="signup-modal-title"
              className="mt-1 text-lg font-bold text-slate-900"
            >
              {mission.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            aria-label="Fermer la fenêtre"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {step === 'form' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="volunteer-firstName"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                  >
                    Prénom <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="volunteer-firstName"
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Ex. Camille"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-900/15"
                  />
                </div>
                <div>
                  <label
                    htmlFor="volunteer-lastName"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                  >
                    Nom <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="volunteer-lastName"
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Ex. Martin"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-900/15"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="volunteer-email"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Adresse e-mail <span className="text-red-600">*</span>
                </label>
                <input
                  id="volunteer-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="camille.martin@exemple.fr"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-900/15"
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Votre e-mail reste confidentiel (seuls votre prénom et votre nom apparaissent sur le planning). Il sert à vérifier votre identité et vous envoyer le rappel 3 jours avant le marché.
                </p>
              </div>

              <div>
                <label
                  htmlFor="volunteer-phone"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Téléphone <span className="text-slate-400 font-normal">(facultatif)</span>
                </label>
                <input
                  id="volunteer-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="06 12 34 56 78"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-900/15"
                />
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-blue-900 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-600 leading-relaxed">
                  Un e-mail de confirmation contenant un code à 6 chiffres et un lien de validation va vous être envoyé. Personne ne peut modifier ni effacer votre inscription à votre place.
                </p>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-blue-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50 transition-colors"
                >
                  {submitting ? 'Envoi en cours...' : "Recevoir l'e-mail de confirmation"}
                </button>
              </div>
            </form>
          )}

          {step === 'verify' && (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4">
                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-blue-900 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Vérifiez votre boîte e-mail
                    </h3>
                    <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                      Un message vient d’être envoyé à <strong>{email}</strong>. Cliquez sur le bouton dans l’e-mail ou saisissez le code à 6 chiffres ci-dessous pour valider définitivement votre place.
                    </p>
                  </div>
                </div>
              </div>

              {deliveryMode === 'preview' && previewEmailId && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 flex items-center justify-between gap-3">
                  <p className="text-xs text-amber-900">
                    Serveur SMTP non configuré : consultez l’e-mail généré pour récupérer le code ou cliquer sur le lien.
                  </p>
                  <button
                    type="button"
                    onClick={() => onOpenEmailPreview(previewEmailId)}
                    className="rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 whitespace-nowrap shrink-0"
                  >
                    Ouvrir l’e-mail
                  </button>
                </div>
              )}

              <div>
                <label
                  htmlFor="verify-code"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Code de vérification (6 chiffres)
                </label>
                <input
                  id="verify-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.35em] text-slate-900 focus:border-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-900/15"
                />
              </div>

              {resendNotice && (
                <p className="text-xs font-medium text-emerald-700">{resendNotice}</p>
              )}
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleResend}
                  className="text-xs font-medium text-slate-600 underline hover:text-slate-900"
                >
                  Renvoyer le code
                </button>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Valider plus tard
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || code.length !== 6}
                    className="rounded-lg bg-blue-900 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                  >
                    {submitting ? 'Validation...' : 'Confirmer mon inscription'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {step === 'confirmed' && (
            <div className="space-y-4 text-center py-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Merci {firstName}, votre inscription est confirmée !
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Votre place sur <strong>{mission.title}</strong> ({slot.timeLabel}) est validée. Vous recevrez automatiquement un e-mail de rappel <strong>3 jours avant le Marché de Noël</strong> (le mardi 1er décembre).
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600 flex items-center justify-center gap-2">
                <CalendarPlus className="w-4 h-4 text-blue-900 shrink-0" />
                <span>
                  Un récapitulatif avec lien d’ajout à l’agenda (.ics) et lien d’annulation personnel vient de vous être envoyé.
                </span>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-lg bg-blue-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 transition-colors"
                >
                  Retour au planning des missions
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
