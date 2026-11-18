import { FormEvent, useEffect, useState } from 'react';
import {
  BellRing,
  Download,
  Lock,
  Mail,
  Plus,
  Settings,
  Trash2,
  UserPlus,
} from 'lucide-react';
import {
  AdminRegistrationRow,
  AppSettings,
  EmailPreview,
  Mission,
  MissionPeriod,
} from '../types';

interface OrganizerViewProps {
  missions: Mission[];
  settings: AppSettings | null;
  onRefresh: () => void;
}

type AdminTab = 'registrations' | 'missions' | 'emails' | 'settings';

export function OrganizerView({
  missions,
  settings,
  onRefresh,
}: OrganizerViewProps) {
  const [pin, setPin] = useState(() => sessionStorage.getItem('organizer_pin') || '');
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [tab, setTab] = useState<AdminTab>('registrations');

  const [registrations, setRegistrations] = useState<AdminRegistrationRow[]>([]);
  const [emails, setEmails] = useState<EmailPreview[]>([]);
  const [selectedEmailHtml, setSelectedEmailHtml] = useState<EmailPreview | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Manual volunteer form
  const [manualSlotId, setManualSlotId] = useState('');
  const [manualFirst, setManualFirst] = useState('');
  const [manualLast, setManualLast] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualPhone, setManualPhone] = useState('');

  // New mission form
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPeriod, setNewPeriod] = useState<MissionPeriod>('soiree');
  const [newTimeLabel, setNewTimeLabel] = useState('');
  const [newCapacity, setNewCapacity] = useState(6);

  // Settings form
  const [helloassoUrl, setHelloassoUrl] = useState(settings?.helloassoUrl || '');

  useEffect(() => {
    setHelloassoUrl(settings?.helloassoUrl || '');
  }, [settings]);

  const loadAdminData = async (currentPin: string) => {
    const headers = { 'x-organizer-pin': currentPin };
    const [regRes, emailRes] = await Promise.all([
      fetch('/api/admin/registrations', { headers }),
      fetch('/api/admin/emails', { headers }),
    ]);

    if (regRes.status === 401) {
      setAuthenticated(false);
      sessionStorage.removeItem('organizer_pin');
      return;
    }

    if (regRes.ok) {
      const data = await regRes.json();
      setRegistrations(data.registrations);
    }
    if (emailRes.ok) {
      const data = await emailRes.json();
      setEmails(data.emails);
    }
  };

  useEffect(() => {
    const saved = sessionStorage.getItem('organizer_pin');
    if (saved) {
      setPin(saved);
      setAuthenticated(true);
      loadAdminData(saved);
    }
  }, []);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const res = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    if (!res.ok) {
      setAuthError('Code organisateur incorrect.');
      return;
    }
    sessionStorage.setItem('organizer_pin', pin);
    setAuthenticated(true);
    await loadAdminData(pin);
  };

  const handleDownloadCsv = async () => {
    const res = await fetch('/api/admin/export-csv', {
      headers: { 'x-organizer-pin': pin },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'benevoles-marche-noel-saint-pierre.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleManualAdd = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const targetSlotId =
      manualSlotId || missions[0]?.slots[0]?.id || '';
    if (!targetSlotId) return;

    const res = await fetch('/api/admin/registrations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-organizer-pin': pin,
      },
      body: JSON.stringify({
        slotId: targetSlotId,
        firstName: manualFirst,
        lastName: manualLast,
        email: manualEmail,
        phone: manualPhone,
      }),
    });
    if (res.ok) {
      setManualFirst('');
      setManualLast('');
      setManualEmail('');
      setManualPhone('');
      setFeedback('Bénévole ajouté avec succès.');
      await loadAdminData(pin);
      onRefresh();
    }
  };

  const handleRemoveRegistration = async (id: string, name: string) => {
    const res = await fetch(`/api/admin/registrations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'x-organizer-pin': pin },
    });
    if (res.ok) {
      setFeedback(`Inscription de ${name} annulée.`);
      await loadAdminData(pin);
      onRefresh();
    }
  };

  const handleUpdateSlotCapacity = async (slotId: string, capacity: number) => {
    const res = await fetch(`/api/admin/slots/${encodeURIComponent(slotId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-organizer-pin': pin,
      },
      body: JSON.stringify({ capacity }),
    });
    if (res.ok) {
      setFeedback('Nombre de places mis à jour.');
      onRefresh();
    }
  };

  const handleCreateMission = async (e: FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/admin/missions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-organizer-pin': pin,
      },
      body: JSON.stringify({
        title: newTitle,
        description: newDesc,
        period: newPeriod,
        timeLabel: newTimeLabel,
        capacity: newCapacity,
      }),
    });
    if (res.ok) {
      setNewTitle('');
      setNewDesc('');
      setNewTimeLabel('');
      setNewCapacity(6);
      setFeedback('Nouvelle mission créée.');
      onRefresh();
    }
  };

  const handleTriggerReminders = async (forceTest: boolean) => {
    setFeedback(null);
    const res = await fetch('/api/admin/reminders/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-organizer-pin': pin,
      },
      body: JSON.stringify({ forceTest }),
    });
    const data = await res.json();
    if (data.sentCount > 0) {
      setFeedback(`${data.sentCount} e-mail(s) de rappel J-3 généré(s) et envoyé(s).`);
    } else {
      setFeedback(data.skippedReason || 'Aucun rappel envoyé.');
    }
    await loadAdminData(pin);
  };

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-organizer-pin': pin,
      },
      body: JSON.stringify({ helloassoUrl }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback(data.error || 'Erreur lors de la sauvegarde.');
      return;
    }
    setFeedback('Paramètres enregistrés.');
    onRefresh();
  };

  if (!authenticated) {
    return (
      <div className="max-w-md mx-auto rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-2.5 text-slate-900">
          <Lock className="w-5 h-5 text-blue-900" />
          <h2 className="text-lg font-bold">Espace organisateur (APEL / École)</h2>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Saisissez le code d’accès organisateur pour consulter les coordonnées des bénévoles, exporter le tableau Excel/CSV, ajuster les créneaux et suivre les rappels J-3.
        </p>
        <form onSubmit={handleLogin} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="organizer-pin"
              className="block text-sm font-medium text-slate-700 mb-1.5"
            >
              Code d’accès
            </label>
            <input
              id="organizer-pin"
              type="password"
              required
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Code organisateur"
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-900/15"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Code par défaut pour la mise en place : <code className="font-mono text-slate-700">STPIERRE2026</code> (modifiable via la variable <code className="font-mono">ORGANIZER_PIN</code>).
            </p>
          </div>
          {authError && (
            <p className="text-sm text-red-600 font-medium">{authError}</p>
          )}
          <button
            type="submit"
            className="w-full rounded-lg bg-blue-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
          >
            Accéder à l’espace organisateur
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
          {(
            [
              { id: 'registrations', label: 'Inscrits & Export' },
              { id: 'missions', label: 'Missions & Capacités' },
              { id: 'emails', label: 'Rappels J-3 & E-mails' },
              { id: 'settings', label: 'Paramètres' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                tab === item.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4 text-blue-900" />
            Exporter CSV (Excel)
          </button>
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem('organizer_pin');
              setAuthenticated(false);
              setPin('');
            }}
            className="text-xs font-medium text-slate-500 hover:text-slate-900 whitespace-nowrap"
          >
            Verrouiller
          </button>
        </div>
      </div>

      {feedback && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
          {feedback}
        </div>
      )}

      {tab === 'registrations' && (
        <div className="space-y-6">
          <form
            onSubmit={handleManualAdd}
            className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-4"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <UserPlus className="w-4 h-4 text-blue-900" />
              <span>Ajouter manuellement un bénévole confirmé</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <select
                value={manualSlotId || missions[0]?.slots[0]?.id || ''}
                onChange={(e) => setManualSlotId(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 lg:col-span-2"
              >
                {missions.flatMap((m) =>
                  m.slots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {m.title} — {s.timeLabel}
                    </option>
                  ))
                )}
              </select>
              <input
                type="text"
                required
                placeholder="Prénom"
                value={manualFirst}
                onChange={(e) => setManualFirst(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              />
              <input
                type="text"
                required
                placeholder="Nom"
                value={manualLast}
                onChange={(e) => setManualLast(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              />
              <button
                type="submit"
                className="rounded-lg bg-blue-900 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
              >
                Ajouter
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="email"
                placeholder="E-mail (optionnel pour saisie manuelle)"
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              />
              <input
                type="tel"
                placeholder="Téléphone (optionnel)"
                value={manualPhone}
                onChange={(e) => setManualPhone(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              />
            </div>
          </form>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Mission & Créneau</th>
                    <th className="py-3 px-4">Bénévole</th>
                    <th className="py-3 px-4">E-mail & Téléphone</th>
                    <th className="py-3 px-4">Statut</th>
                    <th className="py-3 px-4">Rappel J-3</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {registrations.map((reg) => (
                    <tr key={reg.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">
                          {reg.missionTitle}
                        </div>
                        <div className="font-mono text-slate-500 mt-0.5">
                          {reg.timeLabel}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {reg.firstName} {reg.lastName}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        <div>
                          {reg.email.endsWith('.local') ? (
                            <span className="italic text-slate-400">Import tableau initial</span>
                          ) : (
                            reg.email
                          )}
                        </div>
                        {reg.phone && <div className="text-slate-500">{reg.phone}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-semibold ${
                            reg.status === 'confirmed'
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {reg.status === 'confirmed' ? 'Confirmé' : 'En attente e-mail'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {reg.reminderSentAt
                          ? new Date(reg.reminderSentAt).toLocaleDateString('fr-FR')
                          : 'Programmé (01/12)'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            handleRemoveRegistration(
                              reg.id,
                              `${reg.firstName} ${reg.lastName}`
                            )
                          }
                          className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 font-medium"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Retirer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'missions' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-200">
            {missions.map((mission) => (
              <div key={mission.id} className="p-5 space-y-3">
                <h3 className="text-sm font-bold text-slate-900">{mission.title}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {mission.slots.map((slot) => (
                    <div
                      key={slot.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5"
                    >
                      <div>
                        <div className="font-mono text-xs font-semibold text-slate-900">
                          {slot.timeLabel}
                        </div>
                        <div className="text-xs text-slate-500">
                          {slot.volunteers.length} inscrit(s) actuellement
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-slate-700">
                        <span>Besoin :</span>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          defaultValue={slot.capacity}
                          onBlur={(e) => {
                            const val = Number(e.target.value);
                            if (val > 0 && val !== slot.capacity) {
                              handleUpdateSlotCapacity(slot.id, val);
                            }
                          }}
                          className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-right font-mono tabular-nums text-xs"
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <form
            onSubmit={handleCreateMission}
            className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-4"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Plus className="w-4 h-4 text-blue-900" />
              <span>Ajouter une nouvelle mission (ex. Buvette, Crêpes...)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                required
                placeholder="Nom de la mission"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              />
              <select
                value={newPeriod}
                onChange={(e) => setNewPeriod(e.target.value as MissionPeriod)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              >
                <option value="matin">Matin</option>
                <option value="apres_midi">Après-midi</option>
                <option value="soiree">Soirée marché</option>
              </select>
              <input
                type="text"
                required
                placeholder="Créneau horaire (ex. 18h30 à 20h)"
                value={newTimeLabel}
                onChange={(e) => setNewTimeLabel(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              />
              <input
                type="number"
                required
                min={1}
                max={50}
                placeholder="Nombre de bénévoles nécessaires"
                value={newCapacity}
                onChange={(e) => setNewCapacity(Number(e.target.value))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              />
            </div>
            <input
              type="text"
              placeholder="Courte description pour les parents"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            />
            <button
              type="submit"
              className="rounded-lg bg-blue-900 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
            >
              Créer cette mission
            </button>
          </form>
        </div>
      )}

      {tab === 'emails' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <BellRing className="w-4 h-4 text-blue-900" />
                <span>Rappel automatique J-3 (Mardi 1er décembre 2026)</span>
              </div>
              <p className="text-xs text-slate-600">
                Mode d’envoi actuel :{' '}
                <strong>
                  {settings?.smtpConfigured
                    ? 'Serveur SMTP actif (envois réels)'
                    : 'Aperçu local (configurez SMTP_HOST, SMTP_USER et SMTP_PASS pour l’envoi réel)'}
                </strong>
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleTriggerReminders(true)}
              className="rounded-lg bg-blue-900 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap shrink-0"
            >
              Tester l’envoi du rappel J-3 maintenant
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-3 bg-slate-50 flex items-center gap-2 text-xs font-bold text-slate-700">
              <Mail className="w-4 h-4 text-blue-900" />
              <span>Historique des e-mails générés ({emails.length})</span>
            </div>
            {emails.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500">
                Aucun e-mail généré pour l’instant.
              </p>
            ) : (
              <div className="divide-y divide-slate-200">
                {emails.map((em) => (
                  <div
                    key={em.id}
                    className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{em.subject}</div>
                      <div className="text-slate-500 mt-0.5">
                        À : {em.recipientName} ({em.recipientEmail}) ·{' '}
                        {new Date(em.createdAt).toLocaleString('fr-FR')} ·{' '}
                        {em.deliveryMode === 'smtp' ? 'Envoyé via SMTP' : 'Aperçu local'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedEmailHtml(em)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 self-start sm:self-auto"
                    >
                      Voir le contenu
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedEmailHtml && (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="border-b border-slate-200 px-5 py-3 bg-slate-50 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900">
                  {selectedEmailHtml.subject}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedEmailHtml(null)}
                  className="text-xs text-slate-500 hover:text-slate-900"
                >
                  Fermer l’aperçu
                </button>
              </div>
              <iframe
                title="Aperçu e-mail organisateur"
                srcDoc={selectedEmailHtml.htmlBody}
                className="w-full h-[400px] bg-white"
              />
            </div>
          )}
        </div>
      )}

      {tab === 'settings' && (
        <form
          onSubmit={handleSaveSettings}
          className="max-w-xl rounded-xl border border-slate-200 bg-white p-6 space-y-4"
        >
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Settings className="w-4 h-4 text-blue-900" />
            <span>Paramètres du Marché de Noël</span>
          </div>
          <div>
            <label
              htmlFor="helloasso-url"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Lien direct HelloAsso pour la commande des repas
            </label>
            <input
              id="helloasso-url"
              type="url"
              value={helloassoUrl}
              onChange={(e) => setHelloassoUrl(e.target.value)}
              placeholder="https://www.helloasso.com/associations/..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-900/15"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Lorsqu’il est renseigné, un bouton direct « Commander sur HelloAsso » s’affiche dans l’onglet Programme & Repas (en complément du flyer PDF).
            </p>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-blue-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
          >
            Enregistrer les paramètres
          </button>
        </form>
      )}
    </div>
  );
}
