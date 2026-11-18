import { useMemo, useState } from 'react';
import { Check, Clock, LayoutGrid, Search, Table2, UserPlus, Users } from 'lucide-react';
import { Mission, MissionPeriod, MissionSlot } from '../types';

interface MissionsBoardProps {
  missions: Mission[];
  loading: boolean;
  onSelectSlot: (mission: Mission, slot: MissionSlot) => void;
}

const PERIOD_LABELS: Record<MissionPeriod, string> = {
  matin: 'Matin (9h – 13h)',
  apres_midi: 'Après-midi (13h30 – 16h30)',
  soiree: 'Soirée marché (17h30 – 20h30+)',
};

export function MissionsBoard({ missions, loading, onSelectSlot }: MissionsBoardProps) {
  const [periodFilter, setPeriodFilter] = useState<'all' | MissionPeriod>('all');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  const filteredMissions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return missions
      .filter((m) => periodFilter === 'all' || m.period === periodFilter)
      .map((m) => {
        const matchingSlots = m.slots.filter((slot) => {
          if (onlyAvailable && slot.remainingCount <= 0) return false;
          if (!q) return true;
          const inMission =
            m.title.toLowerCase().includes(q) ||
            m.description.toLowerCase().includes(q) ||
            slot.timeLabel.toLowerCase().includes(q);
          const inVolunteers = slot.volunteers.some((v) =>
            `${v.firstName} ${v.lastName}`.toLowerCase().includes(q)
          );
          return inMission || inVolunteers;
        });
        return { ...m, slots: matchingSlots };
      })
      .filter((m) => m.slots.length > 0);
  }, [missions, periodFilter, onlyAvailable, searchQuery]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((idx) => (
          <div
            key={idx}
            className="h-44 rounded-xl border border-slate-200 bg-slate-50 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <section id="missions-board" className="space-y-6">
      {/* Filter & View Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                { id: 'all', label: 'Toutes' },
                { id: 'matin', label: 'Matin' },
                { id: 'apres_midi', label: 'Après-midi' },
                { id: 'soiree', label: 'Soirée marché' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPeriodFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  periodFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setOnlyAvailable((v) => !v)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              onlyAvailable
                ? 'border-blue-900 bg-blue-50 text-blue-900'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span
              className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
                onlyAvailable
                  ? 'border-blue-900 bg-blue-900 text-white'
                  : 'border-slate-300 bg-white'
              }`}
            >
              {onlyAvailable && <Check className="w-3 h-3" />}
            </span>
            Places disponibles uniquement
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher mission ou bénévole..."
              aria-label="Rechercher une mission ou un bénévole"
              className="w-full sm:w-64 rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-900/15"
            />
          </div>

          <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'cards'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Par mission
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'table'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              Vue tableau
            </button>
          </div>
        </div>
      </div>

      {filteredMissions.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 py-12 px-6 text-center">
          <p className="text-sm font-medium text-slate-900">
            Aucune mission ne correspond à votre recherche.
          </p>
          <button
            type="button"
            onClick={() => {
              setPeriodFilter('all');
              setOnlyAvailable(false);
              setSearchQuery('');
            }}
            className="mt-3 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Réinitialiser les filtres
          </button>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="space-y-6">
          {filteredMissions.map((mission) => {
            const totalCap = mission.slots.reduce((acc, s) => acc + s.capacity, 0);
            const totalFilled = mission.slots.reduce(
              (acc, s) => acc + s.volunteers.length,
              0
            );
            const totalRemaining = Math.max(0, totalCap - totalFilled);

            return (
              <article
                key={mission.id}
                className="rounded-xl border border-slate-200 bg-white overflow-hidden"
              >
                <div className="border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/60">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{PERIOD_LABELS[mission.period]}</span>
                      {mission.note && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-medium text-blue-900">{mission.note}</span>
                        </>
                      )}
                    </div>
                    <h3 className="mt-1 text-lg font-bold text-slate-900">
                      {mission.title}
                    </h3>
                    <p className="mt-0.5 text-sm text-slate-600">{mission.description}</p>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <div className="font-mono tabular-nums text-sm font-semibold text-slate-900">
                      {totalFilled} / {totalCap} bénévoles
                    </div>
                    <div
                      className={`text-xs font-medium ${
                        totalRemaining > 0 ? 'text-red-600' : 'text-emerald-700'
                      }`}
                    >
                      {totalRemaining > 0
                        ? `${totalRemaining} place${totalRemaining > 1 ? 's' : ''} restante${totalRemaining > 1 ? 's' : ''}`
                        : 'Mission complète'}
                    </div>
                  </div>
                </div>

                <div className="divide-y divide-slate-200">
                  {mission.slots.map((slot) => {
                    const filledCount = slot.volunteers.length;
                    const fillRatio = Math.min(100, Math.round((filledCount / slot.capacity) * 100));
                    const isFull = slot.remainingCount <= 0;

                    return (
                      <div
                        key={slot.id}
                        className="px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-5"
                      >
                        <div className="flex-1 min-w-0 space-y-3">
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                            <span className="inline-flex items-center gap-1.5 font-mono tabular-nums text-sm font-semibold text-slate-900">
                              <Clock className="w-4 h-4 text-blue-900" />
                              {slot.timeLabel}
                            </span>
                            <span className="text-xs text-slate-500 tabular-nums">
                              {filledCount} inscrit{filledCount > 1 ? 's' : ''} sur {slot.capacity} nécessaires
                            </span>
                            <span
                              className={`text-xs font-semibold tabular-nums ${
                                isFull ? 'text-emerald-700' : 'text-red-600'
                              }`}
                            >
                              {isFull
                                ? 'Complet'
                                : `${slot.remainingCount} case${slot.remainingCount > 1 ? 's' : ''} disponible${slot.remainingCount > 1 ? 's' : ''}`}
                            </span>
                          </div>

                          {/* Progress track */}
                          <div className="h-2 w-full max-w-md rounded-full bg-red-100 overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 ${
                                isFull ? 'bg-emerald-600' : 'bg-blue-900'
                              }`}
                              style={{ width: `${fillRatio}%` }}
                            />
                          </div>

                          {/* Already registered volunteers */}
                          <div>
                            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1.5">
                              <Users className="w-3.5 h-3.5" />
                              <span>Personnes déjà inscrites :</span>
                            </div>
                            {slot.volunteers.length === 0 ? (
                              <p className="text-xs italic text-slate-400">
                                Aucun bénévole inscrit sur ce créneau pour le moment.
                              </p>
                            ) : (
                              <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-slate-800">
                                {slot.volunteers.map((v) => (
                                  <li
                                    key={v.id}
                                    className="inline-flex items-center gap-1.5 text-xs sm:text-sm"
                                  >
                                    <span className="font-medium text-slate-900">
                                      {v.firstName} {v.lastName}
                                    </span>
                                    <span
                                      className={
                                        v.status === 'confirmed'
                                          ? 'text-xs text-emerald-700'
                                          : 'text-xs text-amber-700'
                                      }
                                    >
                                      (
                                      {v.status === 'confirmed'
                                        ? 'confirmé'
                                        : 'en attente e-mail'}
                                      )
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0">
                          <button
                            type="button"
                            disabled={isFull}
                            onClick={() => onSelectSlot(mission, slot)}
                            className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 w-full sm:w-auto ${
                              isFull
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-blue-900 text-white hover:bg-blue-800'
                            }`}
                          >
                            <UserPlus className="w-4 h-4" />
                            {isFull ? 'Créneau complet' : "M'inscrire"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3.5 px-4">Mission</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Créneau horaire</th>
                  <th className="py-3.5 px-4 text-right whitespace-nowrap">Inscrits / Besoin</th>
                  <th className="py-3.5 px-4 text-right whitespace-nowrap">Restantes</th>
                  <th className="py-3.5 px-4">Bénévoles déjà inscrits</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredMissions.flatMap((mission) =>
                  mission.slots.map((slot) => {
                    const isFull = slot.remainingCount <= 0;
                    return (
                      <tr key={slot.id} className="hover:bg-slate-50/70">
                        <td className="py-3.5 px-4 align-top">
                          <div className="font-semibold text-slate-900">{mission.title}</div>
                          {mission.note && (
                            <div className="text-xs text-blue-900 mt-0.5">{mission.note}</div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 align-top font-mono tabular-nums text-xs text-slate-800 whitespace-nowrap">
                          {slot.timeLabel}
                        </td>
                        <td className="py-3.5 px-4 align-top text-right font-mono tabular-nums text-xs text-slate-700 whitespace-nowrap">
                          {slot.volunteers.length} / {slot.capacity}
                        </td>
                        <td
                          className={`py-3.5 px-4 align-top text-right font-mono tabular-nums text-xs font-semibold whitespace-nowrap ${
                            isFull ? 'text-emerald-700' : 'text-red-600'
                          }`}
                        >
                          {slot.remainingCount}
                        </td>
                        <td className="py-3.5 px-4 align-top text-xs text-slate-700 max-w-sm">
                          {slot.volunteers.length === 0 ? (
                            <span className="text-slate-400 italic">Aucun inscrit</span>
                          ) : (
                            slot.volunteers
                              .map(
                                (v) =>
                                  `${v.firstName} ${v.lastName}${v.status === 'pending' ? ' (en attente)' : ''}`
                              )
                              .join(', ')
                          )}
                        </td>
                        <td className="py-3.5 px-4 align-top text-right whitespace-nowrap">
                          <button
                            type="button"
                            disabled={isFull}
                            onClick={() => onSelectSlot(mission, slot)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                              isFull
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-blue-900 text-white hover:bg-blue-800'
                            }`}
                          >
                            {isFull ? 'Complet' : "M'inscrire"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
