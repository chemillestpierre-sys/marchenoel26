import { Calendar, ExternalLink, FileText, Utensils } from 'lucide-react';
import { AppSettings } from '../types';

interface FlyerProgramViewProps {
  settings: AppSettings | null;
}

const FLYER_PDF_URL =
  '/assets/aistudio/261012_Repas_march__de_No_lflyer-BDC_2026_A5_53b2f367.pdf';

const SCHEDULE_ITEMS = [
  { time: '17h30', label: 'Ouverture des portes du marché' },
  { time: '18h00', label: 'Chants des classes de maternelle (cycle 1)' },
  { time: '18h30', label: 'Début de la distribution des repas à emporter' },
  { time: '18h45', label: 'Chants des classes de cycle 2' },
  { time: '19h15', label: 'Chants des classes de cycle 3' },
  { time: '20h30', label: 'Clôture du marché de Noël (horaire indicatif)' },
];

const MEAL_OPTIONS = [
  { name: 'Tartiflette', note: 'Classique' },
  { name: 'Tartiflette végétarienne', note: 'Végétarien' },
  { name: 'Rougail-saucisses', note: 'Traditionnel' },
  { name: 'Curry de lentilles, patates douces, épinards et coco', note: 'Végétarien' },
];

export function FlyerProgramView({ settings }: FlyerProgramViewProps) {
  const helloassoUrl = settings?.helloassoUrl?.trim() || '';

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Programme de la soirée */}
        <section className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-blue-900">
              <Calendar className="w-4 h-4" />
              <span>Vendredi 4 décembre 2026 · 17h30 à 20h30</span>
            </div>
            <h2 className="mt-2 text-xl font-bold text-slate-900">
              Programme du Marché de Noël
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Retrouvez les horaires des chants des classes et des animations organisées par l’APEL (La Christmas Team).
            </p>

            <div className="mt-6 border-t border-slate-200 divide-y divide-slate-200">
              {SCHEDULE_ITEMS.map((item) => (
                <div
                  key={item.time}
                  className="py-3.5 flex items-baseline gap-4"
                >
                  <span className="font-mono tabular-nums text-sm font-bold text-blue-900 w-16 shrink-0">
                    {item.time}
                  </span>
                  <span className="text-sm text-slate-800">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-slate-200 space-y-2 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Sur place tout au long de la soirée :</p>
            <ul className="space-y-1.5 list-disc list-inside">
              <li>Vente des bricolages réalisés par les parents et les enfants (paiement par CB possible)</li>
              <li>Bar, pop corn et snacks sur place (paiement par CB possible)</li>
              <li>Distribution des plats à emporter dès 18h30</li>
            </ul>
          </div>
        </section>

        {/* Commande des repas à emporter */}
        <section className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-blue-900">
              <Utensils className="w-4 h-4" />
              <span>Pré-commande jusqu’au samedi 21 novembre</span>
            </div>
            <h2 className="mt-2 text-xl font-bold text-slate-900">
              Repas à emporter — « Comme à la maison »
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Plats cuisinés par « Comme à la maison » (Mauges-sur-Loire), à réserver à l’avance sur HelloAsso. Quelques parts de dernière minute seront disponibles sur place, mais il est impératif de pré-commander pour prévoir les quantités.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div>
                <div className="text-xs text-slate-500">Part adulte</div>
                <div className="mt-0.5 font-mono tabular-nums text-xl font-bold text-slate-900">
                  9,50 €
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Part enfant</div>
                <div className="mt-0.5 font-mono tabular-nums text-xl font-bold text-slate-900">
                  5,50 €
                </div>
              </div>
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-2.5">
                Menu proposé (uniquement à emporter) :
              </h3>
              <ul className="divide-y divide-slate-200 border-y border-slate-200">
                {MEAL_OPTIONS.map((dish) => (
                  <li
                    key={dish.name}
                    className="py-2.5 flex items-center justify-between gap-4 text-sm"
                  >
                    <span className="font-medium text-slate-800">{dish.name}</span>
                    <span className="text-xs text-slate-500 shrink-0">{dish.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-slate-200 flex flex-col sm:flex-row gap-3">
            {helloassoUrl ? (
              <a
                href={helloassoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 transition-colors"
              >
                <span>Commander sur HelloAsso</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            ) : (
              <a
                href={FLYER_PDF_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 transition-colors"
              >
                <FileText className="w-4 h-4" />
                <span>Ouvrir le flyer et le QR code HelloAsso</span>
              </a>
            )}
            <a
              href={FLYER_PDF_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <FileText className="w-4 h-4" />
              <span>Télécharger le flyer (PDF)</span>
            </a>
          </div>
        </section>
      </div>

      {/* Aperçu intégré du flyer officiel */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Flyer officiel de l’APEL (avec QR code HelloAsso au verso)
            </h3>
            <p className="text-xs text-slate-500">
              Scannez le QR code en page 2 du document pour accéder directement à la billetterie HelloAsso.
            </p>
          </div>
          <a
            href={FLYER_PDF_URL}
            download="Flyer_Repas_Marche_Noel_Ecole_St_Pierre.pdf"
            className="text-xs font-semibold text-blue-900 hover:underline whitespace-nowrap"
          >
            Télécharger le PDF
          </a>
        </div>
        <div className="bg-slate-100 p-4">
          <iframe
            title="Flyer Marché de Noël École Saint-Pierre"
            src={FLYER_PDF_URL}
            className="w-full h-[640px] rounded-lg border border-slate-200 bg-white"
          />
        </div>
      </section>
    </div>
  );
}
