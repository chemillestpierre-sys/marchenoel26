import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmailPreviewModal } from './components/EmailPreviewModal';
import { FlyerProgramView } from './components/FlyerProgramView';
import { MissionsBoard } from './components/MissionsBoard';
import { MyRegistrationsView } from './components/MyRegistrationsView';
import { OrganizerView } from './components/OrganizerView';
import { SignupModal } from './components/SignupModal';
import { TokenActionModal } from './components/TokenActionModal';
import { AppSettings, Mission, MissionSlot } from './types';

type ActiveSection = 'missions' | 'programme' | 'mes-inscriptions' | 'organisateur';

const SCHOOL_LOGO_URL = '/assets/aistudio/180822_Logo_carr__720_f5a9d7f0.jpg';

export default function App() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('missions');
  const [missions, setMissions] = useState<Mission[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedSlot, setSelectedSlot] = useState<{
    mission: Mission;
    slot: MissionSlot;
  } | null>(null);

  const [previewEmailId, setPreviewEmailId] = useState<string | null>(null);

  const [verifyToken, setVerifyToken] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('verify');
  });
  const [cancelToken, setCancelToken] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('cancel');
  });

  const fetchData = useCallback(async () => {
    try {
      setLoadError(null);
      const [missionsRes, settingsRes] = await Promise.all([
        fetch('/api/missions'),
        fetch('/api/settings'),
      ]);
      if (!missionsRes.ok) {
        throw new Error('Impossible de charger les missions.');
      }
      const missionsData = await missionsRes.json();
      setMissions(missionsData.missions || []);
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        setSettings(settingsData);
      }
    } catch (err: any) {
      setLoadError(err.message || 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const stats = useMemo(() => {
    let totalCapacity = 0;
    let totalFilled = 0;
    let openSlots = 0;
    for (const m of missions) {
      for (const s of m.slots) {
        totalCapacity += s.capacity;
        totalFilled += s.volunteers.length;
        if (s.remainingCount > 0) openSlots += 1;
      }
    }
    const remainingPlaces = Math.max(0, totalCapacity - totalFilled);
    return {
      totalCapacity,
      totalFilled,
      remainingPlaces,
      openSlots,
      missionCount: missions.length,
    };
  }, [missions]);

  const clearUrlToken = () => {
    setVerifyToken(null);
    setCancelToken(null);
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const handleQuickSignupClick = () => {
    setActiveSection('missions');
    const el = document.getElementById('missions-board');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col">
      {/* Top Bar Contract: 3 zones, single row */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand */}
          <button
            type="button"
            onClick={() => setActiveSection('missions')}
            className="flex items-center gap-3 text-left whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-900 rounded-md"
          >
            <img
              src={SCHOOL_LOGO_URL}
              alt="Logo École Saint-Pierre"
              className="h-9 w-9 rounded-md object-contain bg-white"
              referrerPolicy="no-referrer"
            />
            <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
              École Saint-Pierre
            </span>
          </button>

          {/* Zone 2: 4 single-line text links */}
          <nav
            aria-label="Navigation principale"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
          >
            {(
              [
                { id: 'missions', label: 'Missions bénévoles' },
                { id: 'programme', label: 'Programme & Repas' },
                { id: 'mes-inscriptions', label: 'Mes inscriptions' },
                { id: 'organisateur', label: 'Espace organisateur' },
              ] as const
            ).map((navItem) => (
              <button
                key={navItem.id}
                type="button"
                onClick={() => setActiveSection(navItem.id)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  activeSection === navItem.id
                    ? 'border-blue-900 text-slate-900 font-semibold'
                    : 'border-transparent hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {navItem.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={handleQuickSignupClick}
              className="rounded-lg bg-blue-900 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
            >
              M’inscrire
            </button>
          </div>
        </div>

        {/* Mobile navigation row */}
        <div className="md:hidden border-t border-slate-100 px-4 py-2 flex items-center gap-4 overflow-x-auto text-xs font-medium text-slate-600">
          {(
            [
              { id: 'missions', label: 'Missions' },
              { id: 'programme', label: 'Programme & Repas' },
              { id: 'mes-inscriptions', label: 'Mes inscriptions' },
              { id: 'organisateur', label: 'Organisateur' },
            ] as const
          ).map((navItem) => (
            <button
              key={navItem.id}
              type="button"
              onClick={() => setActiveSection(navItem.id)}
              className={`py-1 whitespace-nowrap shrink-0 border-b-2 ${
                activeSection === navItem.id
                  ? 'border-blue-900 text-slate-900 font-semibold'
                  : 'border-transparent text-slate-600'
              }`}
            >
              {navItem.label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">
        {/* Hero Header with prominent School Logo */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="shrink-0 flex items-center justify-center rounded-xl border border-slate-200 bg-white p-3 w-28 h-28 sm:w-32 sm:h-32">
              <img
                src={SCHOOL_LOGO_URL}
                alt="École Saint-Pierre"
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="flex-1 min-w-0 space-y-2.5">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs sm:text-sm text-slate-500">
                <span className="font-semibold text-blue-900">
                  Marché de Noël 2026
                </span>
                <span aria-hidden="true">·</span>
                <span>Vendredi 4 décembre (17h30 – 20h30)</span>
                <span aria-hidden="true">·</span>
                <span>Rappel automatique J-3 le mardi 1er décembre</span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
                Inscription des parents bénévoles — École Saint-Pierre
              </h1>

              <p className="text-sm sm:text-base text-slate-600 max-w-3xl leading-relaxed">
                Consultez librement les missions et la liste des parents déjà inscrits, puis réservez votre créneau. Une confirmation par e-mail valide votre identité et protège chaque inscription contre toute suppression accidentelle.
              </p>
            </div>
          </div>

          {/* 4-column KPI strip */}
          <div className="mt-6 pt-6 border-t border-slate-200 grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <div className="text-xs text-slate-500">Créneaux pourvus</div>
              <div className="mt-1 font-mono tabular-nums text-2xl font-bold text-slate-900">
                {stats.totalFilled} / {stats.totalCapacity}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Places encore nécessaires</div>
              <div className="mt-1 font-mono tabular-nums text-2xl font-bold text-red-600">
                {stats.remainingPlaces}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Missions organisées</div>
              <div className="mt-1 font-mono tabular-nums text-2xl font-bold text-slate-900">
                {stats.missionCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Pré-commande repas HelloAsso</div>
              <div className="mt-1 font-mono tabular-nums text-lg sm:text-xl font-bold text-blue-900">
                Jusqu’au 21 nov.
              </div>
            </div>
          </div>
        </section>

        {loadError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between gap-4">
            <span>{loadError}</span>
            <button
              type="button"
              onClick={fetchData}
              className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800"
            >
              Réessayer
            </button>
          </div>
        )}

        {activeSection === 'missions' && (
          <MissionsBoard
            missions={missions}
            loading={loading}
            onSelectSlot={(mission, slot) => setSelectedSlot({ mission, slot })}
          />
        )}

        {activeSection === 'programme' && (
          <FlyerProgramView settings={settings} />
        )}

        {activeSection === 'mes-inscriptions' && (
          <MyRegistrationsView
            onOpenEmailPreview={(id) => setPreviewEmailId(id)}
          />
        )}

        {activeSection === 'organisateur' && (
          <OrganizerView
            missions={missions}
            settings={settings}
            onRefresh={fetchData}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <img
              src={SCHOOL_LOGO_URL}
              alt="Logo École Saint-Pierre"
              className="h-6 w-6 object-contain"
              referrerPolicy="no-referrer"
            />
            <span>
              École Saint-Pierre · Marché de Noël du vendredi 4 décembre 2026 · La Christmas Team (APEL)
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setActiveSection('programme')}
              className="hover:text-slate-900 underline"
            >
              Programme & Repas
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('mes-inscriptions')}
              className="hover:text-slate-900 underline"
            >
              Mes inscriptions
            </button>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <SignupModal
        mission={selectedSlot?.mission ?? null}
        slot={selectedSlot?.slot ?? null}
        onClose={() => setSelectedSlot(null)}
        onSuccess={fetchData}
        onOpenEmailPreview={(id) => setPreviewEmailId(id)}
      />

      <EmailPreviewModal
        emailId={previewEmailId}
        onClose={() => setPreviewEmailId(null)}
      />

      <TokenActionModal
        verifyToken={verifyToken}
        cancelToken={cancelToken}
        onClose={clearUrlToken}
        onDataChanged={fetchData}
      />
    </div>
  );
}
