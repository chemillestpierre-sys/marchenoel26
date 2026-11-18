export interface SeedMission {
  id: string;
  title: string;
  description: string;
  period: 'matin' | 'apres_midi' | 'soiree';
  note: string | null;
  sortOrder: number;
}

export interface SeedSlot {
  id: string;
  missionId: string;
  timeLabel: string;
  startTime: string;
  endTime: string;
  capacity: number;
  sortOrder: number;
}

export interface SeedVolunteer {
  slotId: string;
  firstName: string;
  lastName: string;
  email: string;
}

export const DEFAULT_SETTINGS: Record<string, string> = {
  event_date: '2026-12-04',
  event_label: 'Vendredi 4 décembre 2026',
  reminder_date: '2026-12-01',
  helloasso_url: '',
  school_name: 'École Saint-Pierre',
  reply_deadline_cantine: '2026-11-27',
  meal_order_deadline: '2026-11-21',
};

export const SEED_MISSIONS: SeedMission[] = [
  {
    id: 'm-deco-cours',
    title: 'Décoration des cours',
    description: 'Installation des guirlandes, sapins et décors festifs dans les cours de l’école.',
    period: 'matin',
    note: null,
    sortOrder: 1,
  },
  {
    id: 'm-install-bricolages',
    title: 'Installation bricolages',
    description: 'Mise en place et étiquetage des bricolages réalisés par les parents et les classes.',
    period: 'matin',
    note: null,
    sortOrder: 2,
  },
  {
    id: 'm-install-stands',
    title: 'Installation Stands restauration et bar, guirlandes, déco, sono',
    description: 'Montage des stands restauration/buvette, sonorisation pour les chants et décoration intérieure.',
    period: 'matin',
    note: null,
    sortOrder: 3,
  },
  {
    id: 'm-dejeuner-cantine',
    title: 'Déjeuner à la cantine',
    description: 'Repas convivial partagé à la cantine entre parents bénévoles participant à la préparation.',
    period: 'matin',
    note: 'Réponse avant le 27/11',
    sortOrder: 4,
  },
  {
    id: 'm-vente-eleves',
    title: 'Vente des bricolages aux élèves',
    description: 'Accueil des classes et accompagnement des élèves pour l’achat de petits bricolages.',
    period: 'apres_midi',
    note: null,
    sortOrder: 5,
  },
  {
    id: 'm-praticables',
    title: 'Montage des praticables',
    description: 'Mise en place des estrades pour les chants de Noël des classes (maternelle, cycle 2, cycle 3).',
    period: 'soiree',
    note: null,
    sortOrder: 6,
  },
  {
    id: 'm-vente-familles',
    title: 'Vente des bricolages aux familles',
    description: 'Tenue des stands de vente pendant le marché de Noël (paiement par CB et espèces possible).',
    period: 'soiree',
    note: '8-10 bénévoles souhaités par créneau',
    sortOrder: 7,
  },
  {
    id: 'm-popcorn-repas',
    title: 'Pop Corn et distribution des repas',
    description: 'Préparation et service du pop corn au bar et remise des plats à emporter pré-commandés (à partir de 18h30).',
    period: 'soiree',
    note: 'Distribution des repas à partir de 18h30',
    sortOrder: 8,
  },
  {
    id: 'm-rangement',
    title: 'Rangement des bricolages',
    description: 'Tri, mise en cartons des invendus et rangement des tables après la fermeture du marché.',
    period: 'soiree',
    note: null,
    sortOrder: 9,
  },
];

export const SEED_SLOTS: SeedSlot[] = [
  { id: 's-deco-cours-1', missionId: 'm-deco-cours', timeLabel: 'À partir de 9h00', startTime: '09:00', endTime: '11:30', capacity: 20, sortOrder: 1 },
  { id: 's-install-bricolages-1', missionId: 'm-install-bricolages', timeLabel: '9h à 11h30', startTime: '09:00', endTime: '11:30', capacity: 20, sortOrder: 1 },
  { id: 's-install-stands-1', missionId: 'm-install-stands', timeLabel: '9h à 11h30', startTime: '09:00', endTime: '11:30', capacity: 20, sortOrder: 1 },
  { id: 's-install-stands-2', missionId: 'm-install-stands', timeLabel: '13h30 à 16h30', startTime: '13:30', endTime: '16:30', capacity: 20, sortOrder: 2 },
  { id: 's-dejeuner-cantine-1', missionId: 'm-dejeuner-cantine', timeLabel: '11h30 à 13h', startTime: '11:30', endTime: '13:00', capacity: 19, sortOrder: 1 },
  { id: 's-vente-eleves-1', missionId: 'm-vente-eleves', timeLabel: '13h30 à 15h', startTime: '13:30', endTime: '15:00', capacity: 13, sortOrder: 1 },
  { id: 's-vente-eleves-2', missionId: 'm-vente-eleves', timeLabel: '15h à 16h30', startTime: '15:00', endTime: '16:30', capacity: 13, sortOrder: 2 },
  { id: 's-praticables-1', missionId: 'm-praticables', timeLabel: 'À partir de 17h30', startTime: '17:30', endTime: '18:15', capacity: 20, sortOrder: 1 },
  { id: 's-vente-familles-1', missionId: 'm-vente-familles', timeLabel: '17h30 à 18h15', startTime: '17:30', endTime: '18:15', capacity: 15, sortOrder: 1 },
  { id: 's-vente-familles-2', missionId: 'm-vente-familles', timeLabel: '18h15 à 19h', startTime: '18:15', endTime: '19:00', capacity: 15, sortOrder: 2 },
  { id: 's-vente-familles-3', missionId: 'm-vente-familles', timeLabel: '19h à 19h45', startTime: '19:00', endTime: '19:45', capacity: 15, sortOrder: 3 },
  { id: 's-vente-familles-4', missionId: 'm-vente-familles', timeLabel: '19h45 à 20h30', startTime: '19:45', endTime: '20:30', capacity: 15, sortOrder: 4 },
  { id: 's-popcorn-1', missionId: 'm-popcorn-repas', timeLabel: '17h30 à 18h15', startTime: '17:30', endTime: '18:15', capacity: 3, sortOrder: 1 },
  { id: 's-popcorn-2', missionId: 'm-popcorn-repas', timeLabel: '18h15 à 19h', startTime: '18:15', endTime: '19:00', capacity: 4, sortOrder: 2 },
  { id: 's-popcorn-3', missionId: 'm-popcorn-repas', timeLabel: '19h à 19h45', startTime: '19:00', endTime: '19:45', capacity: 4, sortOrder: 3 },
  { id: 's-rangement-1', missionId: 'm-rangement', timeLabel: 'À partir de 20h30', startTime: '20:30', endTime: '21:30', capacity: 17, sortOrder: 1 },
];

export const SEED_VOLUNTEERS: SeedVolunteer[] = [
  { slotId: 's-deco-cours-1', firstName: 'Pierre', lastName: 'Berder', email: 'pierre.berder@saint-pierre.local' },
  { slotId: 's-install-bricolages-1', firstName: 'Elodie', lastName: 'FEUVRIER', email: 'elodie.feuvrier@saint-pierre.local' },
  { slotId: 's-install-stands-1', firstName: 'Pierre', lastName: 'Berder', email: 'pierre.berder@saint-pierre.local' },
  { slotId: 's-install-stands-2', firstName: 'Pierre', lastName: 'Berder', email: 'pierre.berder@saint-pierre.local' },
  { slotId: 's-dejeuner-cantine-1', firstName: 'Elodie', lastName: 'FEUVRIER', email: 'elodie.feuvrier@saint-pierre.local' },
  { slotId: 's-dejeuner-cantine-1', firstName: 'Pierre', lastName: 'Berder', email: 'pierre.berder@saint-pierre.local' },
  { slotId: 's-vente-eleves-1', firstName: 'Elodie', lastName: 'FEUVRIER', email: 'elodie.feuvrier@saint-pierre.local' },
  { slotId: 's-vente-eleves-2', firstName: 'Elodie', lastName: 'FEUVRIER', email: 'elodie.feuvrier@saint-pierre.local' },
  { slotId: 's-praticables-1', firstName: 'Pierre', lastName: 'Berder', email: 'pierre.berder@saint-pierre.local' },
  { slotId: 's-vente-familles-1', firstName: 'Sarah', lastName: 'POTTIER', email: 'sarah.pottier@saint-pierre.local' },
  { slotId: 's-rangement-1', firstName: 'Elodie', lastName: 'FEUVRIER', email: 'elodie.feuvrier@saint-pierre.local' },
];
