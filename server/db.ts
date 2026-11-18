import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'marche_noel.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS missions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      period TEXT NOT NULL CHECK(period IN ('matin', 'apres_midi', 'soiree')),
      note TEXT,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS slots (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
      time_label TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK(capacity >= 1),
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS registrations (
      id TEXT PRIMARY KEY,
      slot_id TEXT NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK(status IN ('pending', 'confirmed', 'cancelled')),
      verification_code TEXT NOT NULL,
      verification_token TEXT NOT NULL UNIQUE,
      cancel_token TEXT NOT NULL UNIQUE,
      verified_at TEXT,
      reminder_sent_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_registrations_slot_status ON registrations(slot_id, status);
    CREATE INDEX IF NOT EXISTS idx_registrations_email ON registrations(email);

    CREATE TABLE IF NOT EXISTS email_logs (
      id TEXT PRIMARY KEY,
      registration_id TEXT,
      recipient_email TEXT NOT NULL,
      recipient_name TEXT NOT NULL,
      email_type TEXT NOT NULL,
      subject TEXT NOT NULL,
      html_body TEXT NOT NULL,
      text_body TEXT NOT NULL,
      delivery_mode TEXT NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT,
      created_at TEXT NOT NULL
    );
  `);

  const defaultSettings: Record<string, string> = {
    event_date: '2026-12-04',
    event_label: 'Vendredi 4 décembre 2026',
    reminder_date: '2026-12-01',
    helloasso_url: '',
    school_name: 'École Saint-Pierre',
    reply_deadline_cantine: '2026-11-27',
    meal_order_deadline: '2026-11-21',
  };

  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  for (const [key, value] of Object.entries(defaultSettings)) {
    insertSetting.run(key, value);
  }

  const existingMissionsCount = db
    .prepare('SELECT COUNT(*) as count FROM missions')
    .get() as { count: number };

  if (existingMissionsCount.count === 0) {
    seedInitialTableauData();
  }
}

function seedInitialTableauData() {
  const insertMission = db.prepare(`
    INSERT INTO missions (id, title, description, period, note, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertSlot = db.prepare(`
    INSERT INTO slots (id, mission_id, time_label, start_time, end_time, capacity, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRegistration = db.prepare(`
    INSERT INTO registrations (
      id, slot_id, first_name, last_name, email, phone, status,
      verification_code, verification_token, cancel_token, verified_at, created_at
    ) VALUES (?, ?, ?, ?, ?, '', 'confirmed', ?, ?, ?, ?, ?)
  `);

  const seedVolunteer = (slotId: string, firstName: string, lastName: string, email: string) => {
    const now = new Date().toISOString();
    insertRegistration.run(
      crypto.randomUUID(),
      slotId,
      firstName,
      lastName,
      email,
      '000000',
      crypto.randomBytes(24).toString('hex'),
      crypto.randomBytes(24).toString('hex'),
      now,
      now
    );
  };

  const tx = db.transaction(() => {
    // 1. Décoration des cours (Col C: 1 inscrit + 19 cases rouges = 20)
    insertMission.run(
      'm-deco-cours',
      'Décoration des cours',
      'Installation des guirlandes, sapins et décors festifs dans les cours de l’école.',
      'matin',
      null,
      1
    );
    insertSlot.run('s-deco-cours-1', 'm-deco-cours', 'À partir de 9h00', '09:00', '11:30', 20, 1);
    seedVolunteer('s-deco-cours-1', 'Pierre', 'Berder', 'pierre.berder@saint-pierre.local');

    // 2. Installation bricolages (Col H: 1 inscrit + 19 cases rouges = 20)
    insertMission.run(
      'm-install-bricolages',
      'Installation bricolages',
      'Mise en place et étiquetage des bricolages réalisés par les parents et les classes.',
      'matin',
      null,
      2
    );
    insertSlot.run('s-install-bricolages-1', 'm-install-bricolages', '9h à 11h30', '09:00', '11:30', 20, 1);
    seedVolunteer('s-install-bricolages-1', 'Elodie', 'FEUVRIER', 'elodie.feuvrier@saint-pierre.local');

    // 3. Installation Stands restauration et bar, guirlandes, déco, sono (Col J & K: 1 inscrit + 19 rouges chacun = 20)
    insertMission.run(
      'm-install-stands',
      'Installation Stands restauration et bar, guirlandes, déco, sono',
      'Montage des stands restauration/buvette, sonorisation pour les chants et décoration intérieure.',
      'matin',
      null,
      3
    );
    insertSlot.run('s-install-stands-1', 'm-install-stands', '9h à 11h30', '09:00', '11:30', 20, 1);
    seedVolunteer('s-install-stands-1', 'Pierre', 'Berder', 'pierre.berder@saint-pierre.local');
    insertSlot.run('s-install-stands-2', 'm-install-stands', '13h30 à 16h30', '13:30', '16:30', 20, 2);
    seedVolunteer('s-install-stands-2', 'Pierre', 'Berder', 'pierre.berder@saint-pierre.local');

    // 4. Déjeuner à la cantine (Col M: 2 inscrits + 17 cases rouges = 19)
    insertMission.run(
      'm-dejeuner-cantine',
      'Déjeuner à la cantine',
      'Repas convivial partagé à la cantine entre parents bénévoles participant à la préparation.',
      'matin',
      'Réponse avant le 27/11',
      4
    );
    insertSlot.run('s-dejeuner-cantine-1', 'm-dejeuner-cantine', '11h30 à 13h', '11:30', '13:00', 19, 1);
    seedVolunteer('s-dejeuner-cantine-1', 'Elodie', 'FEUVRIER', 'elodie.feuvrier@saint-pierre.local');
    seedVolunteer('s-dejeuner-cantine-1', 'Pierre', 'Berder', 'pierre.berder@saint-pierre.local');

    // 5. Vente des bricolages aux élèves (Col O & P: 1 inscrit + 12 cases rouges chacun = 13)
    insertMission.run(
      'm-vente-eleves',
      'Vente des bricolages aux élèves',
      'Accueil des classes et accompagnement des élèves pour l’achat de petits bricolages.',
      'apres_midi',
      null,
      5
    );
    insertSlot.run('s-vente-eleves-1', 'm-vente-eleves', '13h30 à 15h', '13:30', '15:00', 13, 1);
    seedVolunteer('s-vente-eleves-1', 'Elodie', 'FEUVRIER', 'elodie.feuvrier@saint-pierre.local');
    insertSlot.run('s-vente-eleves-2', 'm-vente-eleves', '15h à 16h30', '15:00', '16:30', 13, 2);
    seedVolunteer('s-vente-eleves-2', 'Elodie', 'FEUVRIER', 'elodie.feuvrier@saint-pierre.local');

    // 6. Montage des praticables (Col D: À partir de 17h30, 1 inscrit + 19 cases rouges = 20)
    insertMission.run(
      'm-praticables',
      'Montage des praticables',
      'Mise en place des estrades pour les chants de Noël des classes (maternelle, cycle 2, cycle 3).',
      'soiree',
      null,
      6
    );
    insertSlot.run('s-praticables-1', 'm-praticables', 'À partir de 17h30', '17:30', '18:15', 20, 1);
    seedVolunteer('s-praticables-1', 'Pierre', 'Berder', 'pierre.berder@saint-pierre.local');

    // 7. Vente des bricolages aux familles (Col R, S, T, U: 15 places par créneau)
    insertMission.run(
      'm-vente-familles',
      'Vente des bricolages aux familles',
      'Tenue des stands de vente pendant le marché de Noël (paiement par CB et espèces possible).',
      'soiree',
      '8-10 bénévoles souhaités par créneau',
      7
    );
    insertSlot.run('s-vente-familles-1', 'm-vente-familles', '17h30 à 18h15', '17:30', '18:15', 15, 1);
    seedVolunteer('s-vente-familles-1', 'Sarah', 'POTTIER', 'sarah.pottier@saint-pierre.local');
    insertSlot.run('s-vente-familles-2', 'm-vente-familles', '18h15 à 19h', '18:15', '19:00', 15, 2);
    insertSlot.run('s-vente-familles-3', 'm-vente-familles', '19h à 19h45', '19:00', '19:45', 15, 3);
    insertSlot.run('s-vente-familles-4', 'm-vente-familles', '19h45 à 20h30', '19:45', '20:30', 15, 4);

    // 8. Pop Corn et distribution des repas (Col X, Y...)
    insertMission.run(
      'm-popcorn-repas',
      'Pop Corn et distribution des repas',
      'Préparation et service du pop corn au bar et remise des plats à emporter pré-commandés (à partir de 18h30).',
      'soiree',
      'Distribution des repas à partir de 18h30',
      8
    );
    insertSlot.run('s-popcorn-1', 'm-popcorn-repas', '17h30 à 18h15', '17:30', '18:15', 3, 1);
    insertSlot.run('s-popcorn-2', 'm-popcorn-repas', '18h15 à 19h', '18:15', '19:00', 4, 2);
    insertSlot.run('s-popcorn-3', 'm-popcorn-repas', '19h à 19h45', '19:00', '19:45', 4, 3);

    // 9. Rangement des bricolages (Col V: 1 inscrit + 16 cases rouges = 17)
    insertMission.run(
      'm-rangement',
      'Rangement des bricolages',
      'Tri, mise en cartons des invendus et rangement des tables après la fermeture du marché.',
      'soiree',
      null,
      9
    );
    insertSlot.run('s-rangement-1', 'm-rangement', 'À partir de 20h30', '20:30', '21:30', 17, 1);
    seedVolunteer('s-rangement-1', 'Elodie', 'FEUVRIER', 'elodie.feuvrier@saint-pierre.local');
  });

  tx();
}

export function getSettingsMap(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{
    key: string;
    value: string;
  }>;
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}
