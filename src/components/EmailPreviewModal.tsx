import { useEffect, useState } from 'react';
import { Mail, X } from 'lucide-react';
import { EmailPreview } from '../types';

interface EmailPreviewModalProps {
  emailId: string | null;
  onClose: () => void;
  onVerifiedFromEmail?: () => void;
}

export function EmailPreviewModal({ emailId, onClose }: EmailPreviewModalProps) {
  const [email, setEmail] = useState<EmailPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!emailId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/emails/preview/${encodeURIComponent(emailId)}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Impossible de charger l'aperçu.");
        }
        return res.json();
      })
      .then((data) => setEmail(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [emailId]);

  if (!emailId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Aperçu de l'e-mail envoyé"
    >
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-4 bg-slate-50">
          <div className="flex items-center gap-2.5 min-w-0">
            <Mail className="w-5 h-5 text-blue-900 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 truncate">
                Aperçu de l’e-mail (mode test sans SMTP)
              </h3>
              {email && (
                <p className="text-xs text-slate-500 truncate">
                  À : {email.recipientEmail} · Objet : {email.subject}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 transition-colors"
            aria-label="Fermer l'aperçu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 bg-slate-100 flex-1">
          {loading && (
            <div className="py-12 text-center text-sm text-slate-600">
              Chargement de l’e-mail...
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}
          {email && !loading && (
            <iframe
              title="Aperçu e-mail HTML"
              srcDoc={email.htmlBody}
              className="w-full min-h-[420px] rounded-lg border border-slate-200 bg-white"
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-slate-200 px-6 py-3 bg-white text-xs text-slate-500">
          <span>
            Configurez SMTP dans les variables d’environnement pour un envoi réel.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white font-medium hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
