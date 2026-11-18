import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

interface TokenActionModalProps {
  verifyToken: string | null;
  cancelToken: string | null;
  onClose: () => void;
  onDataChanged: () => void;
}

export function TokenActionModal({
  verifyToken,
  cancelToken,
  onClose,
  onDataChanged,
}: TokenActionModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifiedInfo, setVerifiedInfo] = useState<{
    firstName: string;
    lastName: string;
    missionTitle: string;
    timeLabel: string;
  } | null>(null);

  const [cancelInfo, setCancelInfo] = useState<{
    firstName: string;
    lastName: string;
    status: string;
    missionTitle: string;
    timeLabel: string;
  } | null>(null);
  const [cancelledDone, setCancelledDone] = useState(false);

  useEffect(() => {
    if (verifyToken) {
      setLoading(true);
      setError(null);
      fetch('/api/registrations/verify-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: verifyToken }),
      })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Lien invalide.');
          return data;
        })
        .then((data) => {
          setVerifiedInfo(data.registration);
          onDataChanged();
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [verifyToken]);

  useEffect(() => {
    if (cancelToken) {
      setLoading(true);
      setError(null);
      fetch(`/api/registrations/cancel-preview?token=${encodeURIComponent(cancelToken)}`)
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Lien introuvable.');
          return data;
        })
        .then((data) => {
          setCancelInfo(data);
          if (data.status === 'cancelled') {
            setCancelledDone(true);
          }
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [cancelToken]);

  if (!verifyToken && !cancelToken) return null;

  const handleConfirmCancel = async () => {
    if (!cancelToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/registrations/cancel-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: cancelToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Impossible d'annuler.");
      setCancelledDone(true);
      onDataChanged();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4 mb-4">
          <h3 className="text-lg font-bold text-slate-900">
            {verifyToken ? 'Validation de votre inscription' : "Annulation d'une mission"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading && (
          <p className="py-6 text-center text-sm text-slate-600">Traitement en cours...</p>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 mb-4">
            {error}
          </div>
        )}

        {verifyToken && verifiedInfo && !loading && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
              <CheckCircle2 className="w-6 h-6 text-emerald-700 shrink-0" />
              <div className="text-sm">
                <p className="font-semibold">
                  Inscription confirmée pour {verifiedInfo.firstName} {verifiedInfo.lastName}
                </p>
                <p className="mt-1 text-emerald-800">
                  {verifiedInfo.missionTitle} · {verifiedInfo.timeLabel}
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Un e-mail récapitulatif avec votre lien d’agenda (.ics) vient d’être envoyé. Vous recevrez un rappel 3 jours avant le vendredi 4 décembre.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-blue-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Voir le planning
            </button>
          </div>
        )}

        {cancelToken && cancelInfo && !loading && !cancelledDone && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
              <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold">
                  Souhaitez-vous libérer votre place ?
                </p>
                <p className="mt-1 text-amber-900">
                  {cancelInfo.firstName} {cancelInfo.lastName} — <strong>{cancelInfo.missionTitle}</strong> ({cancelInfo.timeLabel})
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Garder ma place
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Confirmer l’annulation
              </button>
            </div>
          </div>
        )}

        {cancelToken && cancelledDone && !loading && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Votre place sur <strong>{cancelInfo?.missionTitle}</strong> ({cancelInfo?.timeLabel}) a bien été libérée pour un autre parent bénévole.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Retour au planning
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
