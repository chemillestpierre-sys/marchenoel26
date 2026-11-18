import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import {
  DEFAULT_SETTINGS,
  SEED_MISSIONS,
  SEED_SLOTS,
  SEED_VOLUNTEERS,
} from './seedData';

export interface DbRegistrationRow {
  id: string;
  slotId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  verificationCode: string;
  verificationToken: string;
  cancelToken: string;
  verifiedAt: string | null;
  reminderSentAt: string | null;
  createdAt: string;
}

export interface DbEmailLogRow {
  id: string;
  registrationId: string | null;
  recipientEmail: string;
  recipientName: string;
  emailType: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  deliveryMode: 'smtp' | 'preview';
  status: 'sent' | 'failed';
  errorMessage: string | null;
  createdAt: string;
}

interface JsonStore {
  settings: Record<string, string>;
  missions: Array<{
    id: string;
    title: string;
    description: string;
    period: 'matin' | 'apres_midi' | 'soiree';
    note: string | null;
    sortOrder: number;
  }>;
  slots: Array<{
    id: string;
    missionId: string;
    timeLabel: string;
    startTime: string;
    endTime: string;
    capacity: number;
    sortOrder: number;
  }>;
  registrations: DbRegistrationRow[];
  emailLogs: DbEmailLogRow[];
}

function getPostgresConnectionString(): string | null {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    null
  );
}

export function getDatabaseMode(): 'postgres' | 'local_file' | 'ephemeral_tmp' {
  if (getPostgresConnectionString()) return 'postgres';
  if (process.env.VERCEL === '1') return 'ephemeral_tmp';
  return 'local_file';
}

let pgPool: Pool | null = null;
function getPool(): Pool {
  if (!pgPool) {
    const connStr = getPostgresConnectionString()!;
    pgPool = new Pool({
      connectionString: connStr,
      max: 5,
      ssl:
        connStr.includes('localhost') || connStr.includes('127.0.0.1')
          ? undefined
          : { rejectUnauthorized: false },
    });
  }
  return pgPool;
}

function getJsonStorePath(): string {
  if (process.env.VERCEL === '1') {
    return '/tmp/marche_noel_store.json';
  }
  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, 'store.json');
}

function createInitialJsonStore(): JsonStore {
  const now = new Date().toISOString();
  return {
    settings: { ...DEFAULT_SETTINGS },
    missions: SEED_MISSIONS.map((m) => ({ ...m })),
    slots: SEED_SLOTS.map((s) => ({ ...s })),
    registrations: SEED_VOLUNTEERS.map((v) => ({
      id: crypto.randomUUID(),
      slotId: v.slotId,
      firstName: v.firstName,
      lastName: v.lastName,
      email: v.email,
      phone: '',
      status: 'confirmed',
      verificationCode: '000000',
      verificationToken: crypto.randomBytes(24).toString('hex'),
      cancelToken: crypto.randomBytes(24).toString('hex'),
      verifiedAt: now,
      reminderSentAt: null,
      createdAt: now,
    })),
    emailLogs: [],
  };
}

let jsonMutex: Promise<void> = Promise.resolve();
function withJsonLock<T>(fn: (store: JsonStore) => Promise<T> | T): Promise<T> {
  const run = async () => {
    const storePath = getJsonStorePath();
    let store: JsonStore;
    if (fs.existsSync(storePath)) {
      const raw = fs.readFileSync(storePath, 'utf-8');
      store = JSON.parse(raw) as JsonStore;
    } else {
      store = createInitialJsonStore();
      fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf-8');
    }
    const result = await fn(store);
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf-8');
    return result;
  };
  const next = jsonMutex.then(run, run);
  jsonMutex = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

let initPromise: Promise<void> | null = null;

export async function ensureDbReady(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      if (getPostgresConnectionString()) {
        const pool = getPool();
        await pool.query(`
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

        for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
          await pool.query(
            'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
            [k, v]
          );
        }

        const countRes = await pool.query<{ count: string }>(
          'SELECT COUNT(*)::text as count FROM missions'
        );
        if (Number(countRes.rows[0]?.count || '0') === 0) {
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            for (const m of SEED_MISSIONS) {
              await client.query(
                'INSERT INTO missions (id, title, description, period, note, sort_order) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING',
                [m.id, m.title, m.description, m.period, m.note, m.sortOrder]
              );
            }
            for (const s of SEED_SLOTS) {
              await client.query(
                'INSERT INTO slots (id, mission_id, time_label, start_time, end_time, capacity, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING',
                [s.id, s.missionId, s.timeLabel, s.startTime, s.endTime, s.capacity, s.sortOrder]
              );
            }
            const now = new Date().toISOString();
            for (const v of SEED_VOLUNTEERS) {
              await client.query(
                `INSERT INTO registrations (
                  id, slot_id, first_name, last_name, email, phone, status,
                  verification_code, verification_token, cancel_token, verified_at, created_at
                ) VALUES ($1, $2, $3, $4, $5, '', 'confirmed', '000000', $6, $7, $8, $8)`,
                [
                  crypto.randomUUID(),
                  v.slotId,
                  v.firstName,
                  v.lastName,
                  v.email,
                  crypto.randomBytes(24).toString('hex'),
                  crypto.randomBytes(24).toString('hex'),
                  now,
                ]
              );
            }
            await client.query('COMMIT');
          } catch (err) {
            await client.query('ROLLBACK');
            throw err;
          } finally {
            client.release();
          }
        }
      } else {
        await withJsonLock(() => undefined);
      }
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  await initPromise;
}

export async function getSettingsMap(): Promise<Record<string, string>> {
  await ensureDbReady();
  if (getPostgresConnectionString()) {
    const res = await getPool().query<{ key: string; value: string }>(
      'SELECT key, value FROM settings'
    );
    const out: Record<string, string> = {};
    for (const r of res.rows) out[r.key] = r.value;
    return out;
  }
  return withJsonLock((store) => ({ ...store.settings }));
}

export async function setSetting(key: string, value: string): Promise<void> {
  await ensureDbReady();
  if (getPostgresConnectionString()) {
    await getPool().query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
      [key, value]
    );
    return;
  }
  await withJsonLock((store) => {
    store.settings[key] = value;
  });
}

export async function cleanupExpiredPendingRegistrations(): Promise<void> {
  await ensureDbReady();
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  if (getPostgresConnectionString()) {
    await getPool().query(
      "UPDATE registrations SET status = 'cancelled' WHERE status = 'pending' AND created_at < $1",
      [cutoff]
    );
    return;
  }
  await withJsonLock((store) => {
    for (const r of store.registrations) {
      if (r.status === 'pending' && r.createdAt < cutoff) {
        r.status = 'cancelled';
      }
    }
  });
}

export async function getPublicMissionsPayload() {
  await cleanupExpiredPendingRegistrations();
  if (getPostgresConnectionString()) {
    const pool = getPool();
    const [mRes, sRes, rRes] = await Promise.all([
      pool.query(
        'SELECT id, title, description, period, note, sort_order FROM missions ORDER BY sort_order ASC'
      ),
      pool.query(
        'SELECT id, mission_id, time_label, start_time, end_time, capacity, sort_order FROM slots ORDER BY sort_order ASC'
      ),
      pool.query(
        "SELECT id, slot_id, first_name, last_name, status, created_at FROM registrations WHERE status IN ('pending', 'confirmed') ORDER BY created_at ASC"
      ),
    ]);

    const regsBySlot = new Map<string, any[]>();
    for (const r of rRes.rows) {
      if (!regsBySlot.has(r.slot_id)) regsBySlot.set(r.slot_id, []);
      regsBySlot.get(r.slot_id)!.push({
        id: r.id,
        firstName: r.first_name,
        lastName: r.last_name,
        status: r.status,
        createdAt: r.created_at,
      });
    }

    const slotsByMission = new Map<string, any[]>();
    for (const s of sRes.rows) {
      const volunteers = regsBySlot.get(s.id) || [];
      const confirmedCount = volunteers.filter((v) => v.status === 'confirmed').length;
      const pendingCount = volunteers.filter((v) => v.status === 'pending').length;
      const remainingCount = Math.max(0, s.capacity - volunteers.length);

      if (!slotsByMission.has(s.mission_id)) slotsByMission.set(s.mission_id, []);
      slotsByMission.get(s.mission_id)!.push({
        id: s.id,
        missionId: s.mission_id,
        timeLabel: s.time_label,
        startTime: s.start_time,
        endTime: s.end_time,
        capacity: s.capacity,
        sortOrder: s.sort_order,
        volunteers,
        confirmedCount,
        pendingCount,
        remainingCount,
      });
    }

    return mRes.rows.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      period: m.period,
      note: m.note,
      sortOrder: m.sort_order,
      slots: slotsByMission.get(m.id) || [],
    }));
  }

  return withJsonLock((store) => {
    const missions = [...store.missions].sort((a, b) => a.sortOrder - b.sortOrder);
    const slots = [...store.slots].sort((a, b) => a.sortOrder - b.sortOrder);
    const activeRegs = store.registrations
      .filter((r) => r.status === 'pending' || r.status === 'confirmed')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    return missions.map((m) => ({
      ...m,
      slots: slots
        .filter((s) => s.missionId === m.id)
        .map((s) => {
          const volunteers = activeRegs
            .filter((r) => r.slotId === s.id)
            .map((r) => ({
              id: r.id,
              firstName: r.firstName,
              lastName: r.lastName,
              status: r.status as 'pending' | 'confirmed',
              createdAt: r.createdAt,
            }));
          const confirmedCount = volunteers.filter((v) => v.status === 'confirmed').length;
          const pendingCount = volunteers.filter((v) => v.status === 'pending').length;
          const remainingCount = Math.max(0, s.capacity - volunteers.length);
          return {
            ...s,
            volunteers,
            confirmedCount,
            pendingCount,
            remainingCount,
          };
        }),
    }));
  });
}

export async function createRegistrationAtomic(input: {
  slotId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}) {
  await cleanupExpiredPendingRegistrations();
  const registrationId = crypto.randomUUID();
  const verificationCode = String(crypto.randomInt(100000, 1000000));
  const verificationToken = crypto.randomBytes(24).toString('hex');
  const cancelToken = crypto.randomBytes(24).toString('hex');
  const now = new Date().toISOString();

  if (getPostgresConnectionString()) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const slotRes = await client.query(
        `SELECT s.id, s.time_label, s.capacity, m.title as mission_title
         FROM slots s JOIN missions m ON m.id = s.mission_id
         WHERE s.id = $1 FOR UPDATE`,
        [input.slotId]
      );
      if (slotRes.rows.length === 0) {
        throw new Error('SLOT_NOT_FOUND');
      }
      const slot = slotRes.rows[0];

      const dupRes = await client.query(
        `SELECT id, status FROM registrations
         WHERE slot_id = $1 AND lower(email) = $2 AND status IN ('pending', 'confirmed')`,
        [input.slotId, input.email]
      );
      if (dupRes.rows.length > 0) {
        const err: any = new Error('ALREADY_REGISTERED');
        err.existingStatus = dupRes.rows[0].status;
        err.existingId = dupRes.rows[0].id;
        throw err;
      }

      const cntRes = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM registrations
         WHERE slot_id = $1 AND status IN ('pending', 'confirmed')`,
        [input.slotId]
      );
      if (Number(cntRes.rows[0]?.count || '0') >= slot.capacity) {
        throw new Error('SLOT_FULL');
      }

      await client.query(
        `INSERT INTO registrations (
          id, slot_id, first_name, last_name, email, phone, status,
          verification_code, verification_token, cancel_token, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, $10)`,
        [
          registrationId,
          input.slotId,
          input.firstName,
          input.lastName,
          input.email,
          input.phone,
          verificationCode,
          verificationToken,
          cancelToken,
          now,
        ]
      );
      await client.query('COMMIT');
      return {
        registrationId,
        verificationCode,
        verificationToken,
        cancelToken,
        missionTitle: slot.mission_title as string,
        timeLabel: slot.time_label as string,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  return withJsonLock((store) => {
    const slot = store.slots.find((s) => s.id === input.slotId);
    if (!slot) throw new Error('SLOT_NOT_FOUND');
    const mission = store.missions.find((m) => m.id === slot.missionId);

    const existing = store.registrations.find(
      (r) =>
        r.slotId === input.slotId &&
        r.email.toLowerCase() === input.email &&
        (r.status === 'pending' || r.status === 'confirmed')
    );
    if (existing) {
      const err: any = new Error('ALREADY_REGISTERED');
      err.existingStatus = existing.status;
      err.existingId = existing.id;
      throw err;
    }

    const activeCount = store.registrations.filter(
      (r) => r.slotId === input.slotId && (r.status === 'pending' || r.status === 'confirmed')
    ).length;
    if (activeCount >= slot.capacity) throw new Error('SLOT_FULL');

    store.registrations.push({
      id: registrationId,
      slotId: input.slotId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      status: 'pending',
      verificationCode,
      verificationToken,
      cancelToken,
      verifiedAt: null,
      reminderSentAt: null,
      createdAt: now,
    });

    return {
      registrationId,
      verificationCode,
      verificationToken,
      cancelToken,
      missionTitle: mission?.title || 'Mission',
      timeLabel: slot.timeLabel,
    };
  });
}

export async function getRegistrationWithSlotById(id: string) {
  await ensureDbReady();
  if (getPostgresConnectionString()) {
    const res = await getPool().query(
      `SELECT r.*, m.title as mission_title, m.description as mission_description,
              s.time_label, s.start_time, s.end_time
       FROM registrations r
       JOIN slots s ON s.id = r.slot_id
       JOIN missions m ON m.id = s.mission_id
       WHERE r.id = $1`,
      [id]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      slotId: r.slot_id,
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email,
      phone: r.phone,
      status: r.status,
      verificationCode: r.verification_code,
      verificationToken: r.verification_token,
      cancelToken: r.cancel_token,
      verifiedAt: r.verified_at,
      reminderSentAt: r.reminder_sent_at,
      createdAt: r.created_at,
      missionTitle: r.mission_title,
      missionDescription: r.mission_description,
      timeLabel: r.time_label,
      startTime: r.start_time,
      endTime: r.end_time,
    };
  }

  return withJsonLock((store) => {
    const r = store.registrations.find((x) => x.id === id);
    if (!r) return null;
    const s = store.slots.find((x) => x.id === r.slotId);
    const m = s ? store.missions.find((x) => x.id === s.missionId) : null;
    return {
      ...r,
      missionTitle: m?.title || '',
      missionDescription: m?.description || '',
      timeLabel: s?.timeLabel || '',
      startTime: s?.startTime || '17:30',
      endTime: s?.endTime || '19:00',
    };
  });
}

export async function getRegistrationWithSlotByVerificationToken(token: string) {
  await ensureDbReady();
  if (getPostgresConnectionString()) {
    const res = await getPool().query(
      `SELECT r.*, m.title as mission_title, m.description as mission_description,
              s.time_label, s.start_time, s.end_time
       FROM registrations r
       JOIN slots s ON s.id = r.slot_id
       JOIN missions m ON m.id = s.mission_id
       WHERE r.verification_token = $1 AND r.status IN ('pending', 'confirmed')`,
      [token]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      slotId: r.slot_id,
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email,
      phone: r.phone,
      status: r.status,
      verificationCode: r.verification_code,
      verificationToken: r.verification_token,
      cancelToken: r.cancel_token,
      verifiedAt: r.verified_at,
      reminderSentAt: r.reminder_sent_at,
      createdAt: r.created_at,
      missionTitle: r.mission_title,
      missionDescription: r.mission_description,
      timeLabel: r.time_label,
      startTime: r.start_time,
      endTime: r.end_time,
    };
  }

  return withJsonLock((store) => {
    const r = store.registrations.find(
      (x) => x.verificationToken === token && (x.status === 'pending' || x.status === 'confirmed')
    );
    if (!r) return null;
    const s = store.slots.find((x) => x.id === r.slotId);
    const m = s ? store.missions.find((x) => x.id === s.missionId) : null;
    return {
      ...r,
      missionTitle: m?.title || '',
      missionDescription: m?.description || '',
      timeLabel: s?.timeLabel || '',
      startTime: s?.startTime || '17:30',
      endTime: s?.endTime || '19:00',
    };
  });
}

export async function getRegistrationWithSlotByCancelToken(token: string) {
  await ensureDbReady();
  if (getPostgresConnectionString()) {
    const res = await getPool().query(
      `SELECT r.*, m.title as mission_title, m.description as mission_description,
              s.time_label, s.start_time, s.end_time
       FROM registrations r
       JOIN slots s ON s.id = r.slot_id
       JOIN missions m ON m.id = s.mission_id
       WHERE r.cancel_token = $1`,
      [token]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      slotId: r.slot_id,
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email,
      phone: r.phone,
      status: r.status,
      verificationCode: r.verification_code,
      verificationToken: r.verification_token,
      cancelToken: r.cancel_token,
      verifiedAt: r.verified_at,
      reminderSentAt: r.reminder_sent_at,
      createdAt: r.created_at,
      missionTitle: r.mission_title,
      missionDescription: r.mission_description,
      timeLabel: r.time_label,
      startTime: r.start_time,
      endTime: r.end_time,
    };
  }

  return withJsonLock((store) => {
    const r = store.registrations.find((x) => x.cancelToken === token);
    if (!r) return null;
    const s = store.slots.find((x) => x.id === r.slotId);
    const m = s ? store.missions.find((x) => x.id === s.missionId) : null;
    return {
      ...r,
      missionTitle: m?.title || '',
      missionDescription: m?.description || '',
      timeLabel: s?.timeLabel || '',
      startTime: s?.startTime || '17:30',
      endTime: s?.endTime || '19:00',
    };
  });
}

export async function confirmRegistration(id: string): Promise<void> {
  await ensureDbReady();
  const now = new Date().toISOString();
  if (getPostgresConnectionString()) {
    await getPool().query(
      "UPDATE registrations SET status = 'confirmed', verified_at = $1 WHERE id = $2",
      [now, id]
    );
    return;
  }
  await withJsonLock((store) => {
    const r = store.registrations.find((x) => x.id === id);
    if (r) {
      r.status = 'confirmed';
      r.verifiedAt = now;
    }
  });
}

export async function cancelRegistration(id: string): Promise<void> {
  await ensureDbReady();
  if (getPostgresConnectionString()) {
    await getPool().query("UPDATE registrations SET status = 'cancelled' WHERE id = $1", [id]);
    return;
  }
  await withJsonLock((store) => {
    const r = store.registrations.find((x) => x.id === id);
    if (r) r.status = 'cancelled';
  });
}

export async function lookupRegistrationsByEmail(cleanEmail: string) {
  await ensureDbReady();
  if (getPostgresConnectionString()) {
    const res = await getPool().query(
      `SELECT r.id, r.first_name, r.last_name, r.status, r.cancel_token, r.verification_token,
              m.title as mission_title, s.time_label, s.start_time
       FROM registrations r
       JOIN slots s ON s.id = r.slot_id
       JOIN missions m ON m.id = s.mission_id
       WHERE lower(r.email) = $1 AND r.status IN ('pending', 'confirmed')
       ORDER BY s.start_time ASC`,
      [cleanEmail]
    );
    return res.rows.map((r) => ({
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      status: r.status,
      cancelToken: r.cancel_token,
      verificationToken: r.verification_token,
      missionTitle: r.mission_title,
      timeLabel: r.time_label,
      startTime: r.start_time,
    }));
  }

  return withJsonLock((store) =>
    store.registrations
      .filter(
        (r) =>
          r.email.toLowerCase() === cleanEmail &&
          (r.status === 'pending' || r.status === 'confirmed')
      )
      .map((r) => {
        const s = store.slots.find((x) => x.id === r.slotId);
        const m = s ? store.missions.find((x) => x.id === s.missionId) : null;
        return {
          id: r.id,
          firstName: r.firstName,
          lastName: r.lastName,
          status: r.status,
          cancelToken: r.cancelToken,
          verificationToken: r.verificationToken,
          missionTitle: m?.title || '',
          timeLabel: s?.timeLabel || '',
          startTime: s?.startTime || '17:30',
        };
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
  );
}

export async function getConfirmedDueForReminder(forceAllConfirmed: boolean) {
  await ensureDbReady();
  if (getPostgresConnectionString()) {
    const res = await getPool().query(
      `SELECT r.id, r.first_name, r.last_name, r.email, r.cancel_token,
              m.title as mission_title, s.time_label
       FROM registrations r
       JOIN slots s ON s.id = r.slot_id
       JOIN missions m ON m.id = s.mission_id
       WHERE r.status = 'confirmed'
         AND r.email NOT LIKE '%.local'
         AND (${forceAllConfirmed ? '1=1' : 'r.reminder_sent_at IS NULL'})
       ORDER BY s.start_time ASC`
    );
    return res.rows.map((r) => ({
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email,
      cancelToken: r.cancel_token,
      missionTitle: r.mission_title,
      timeLabel: r.time_label,
    }));
  }

  return withJsonLock((store) =>
    store.registrations
      .filter(
        (r) =>
          r.status === 'confirmed' &&
          !r.email.endsWith('.local') &&
          (forceAllConfirmed || !r.reminderSentAt)
      )
      .map((r) => {
        const s = store.slots.find((x) => x.id === r.slotId);
        const m = s ? store.missions.find((x) => x.id === s.missionId) : null;
        return {
          id: r.id,
          firstName: r.firstName,
          lastName: r.lastName,
          email: r.email,
          cancelToken: r.cancelToken,
          missionTitle: m?.title || '',
          timeLabel: s?.timeLabel || '',
          startTime: s?.startTime || '17:30',
        };
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
  );
}

export async function markReminderSent(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await ensureDbReady();
  const now = new Date().toISOString();
  if (getPostgresConnectionString()) {
    await getPool().query(
      'UPDATE registrations SET reminder_sent_at = $1 WHERE id = ANY($2::text[])',
      [now, ids]
    );
    return;
  }
  await withJsonLock((store) => {
    const idSet = new Set(ids);
    for (const r of store.registrations) {
      if (idSet.has(r.id)) r.reminderSentAt = now;
    }
  });
}

export async function insertEmailLog(entry: DbEmailLogRow): Promise<void> {
  await ensureDbReady();
  if (getPostgresConnectionString()) {
    await getPool().query(
      `INSERT INTO email_logs (
        id, registration_id, recipient_email, recipient_name, email_type,
        subject, html_body, text_body, delivery_mode, status, error_message, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        entry.id,
        entry.registrationId,
        entry.recipientEmail,
        entry.recipientName,
        entry.emailType,
        entry.subject,
        entry.htmlBody,
        entry.textBody,
        entry.deliveryMode,
        entry.status,
        entry.errorMessage,
        entry.createdAt,
      ]
    );
    return;
  }
  await withJsonLock((store) => {
    store.emailLogs.unshift(entry);
    if (store.emailLogs.length > 200) store.emailLogs.length = 200;
  });
}

export async function getPreviewEmailById(id: string): Promise<DbEmailLogRow | null> {
  await ensureDbReady();
  if (getPostgresConnectionString()) {
    const res = await getPool().query(
      "SELECT * FROM email_logs WHERE id = $1 AND delivery_mode = 'preview'",
      [id]
    );
    if (res.rows.length === 0) return null;
    const e = res.rows[0];
    return {
      id: e.id,
      registrationId: e.registration_id,
      recipientEmail: e.recipient_email,
      recipientName: e.recipient_name,
      emailType: e.email_type,
      subject: e.subject,
      htmlBody: e.html_body,
      textBody: e.text_body,
      deliveryMode: e.delivery_mode,
      status: e.status,
      errorMessage: e.error_message,
      createdAt: e.created_at,
    };
  }
  return withJsonLock(
    (store) =>
      store.emailLogs.find((e) => e.id === id && e.deliveryMode === 'preview') || null
  );
}

export async function getAdminRegistrations() {
  await ensureDbReady();
  if (getPostgresConnectionString()) {
    const res = await getPool().query(
      `SELECT r.id, r.slot_id, m.title as mission_title, s.time_label,
              r.first_name, r.last_name, r.email, r.phone, r.status,
              r.verified_at, r.reminder_sent_at, r.created_at
       FROM registrations r
       JOIN slots s ON s.id = r.slot_id
       JOIN missions m ON m.id = s.mission_id
       WHERE r.status != 'cancelled'
       ORDER BY m.sort_order ASC, s.sort_order ASC, r.created_at ASC`
    );
    return res.rows.map((r) => ({
      id: r.id,
      slotId: r.slot_id,
      missionTitle: r.mission_title,
      timeLabel: r.time_label,
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email,
      phone: r.phone,
      status: r.status,
      verifiedAt: r.verified_at,
      reminderSentAt: r.reminder_sent_at,
      createdAt: r.created_at,
    }));
  }

  return withJsonLock((store) => {
    const missionOrder = new Map(store.missions.map((m) => [m.id, m]));
    const slotOrder = new Map(store.slots.map((s) => [s.id, s]));
    return store.registrations
      .filter((r) => r.status !== 'cancelled')
      .map((r) => {
        const s = slotOrder.get(r.slotId);
        const m = s ? missionOrder.get(s.missionId) : undefined;
        return {
          id: r.id,
          slotId: r.slotId,
          missionTitle: m?.title || '',
          timeLabel: s?.timeLabel || '',
          firstName: r.firstName,
          lastName: r.lastName,
          email: r.email,
          phone: r.phone,
          status: r.status,
          verifiedAt: r.verifiedAt,
          reminderSentAt: r.reminderSentAt,
          createdAt: r.createdAt,
          _mOrder: m?.sortOrder ?? 999,
          _sOrder: s?.sortOrder ?? 999,
        };
      })
      .sort(
        (a, b) =>
          a._mOrder - b._mOrder ||
          a._sOrder - b._sOrder ||
          a.createdAt.localeCompare(b.createdAt)
      )
      .map(({ _mOrder, _sOrder, ...rest }) => rest);
  });
}

export async function getAdminEmailLogs(limit = 60): Promise<DbEmailLogRow[]> {
  await ensureDbReady();
  if (getPostgresConnectionString()) {
    const res = await getPool().query(
      'SELECT * FROM email_logs ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return res.rows.map((e) => ({
      id: e.id,
      registrationId: e.registration_id,
      recipientEmail: e.recipient_email,
      recipientName: e.recipient_name,
      emailType: e.email_type,
      subject: e.subject,
      htmlBody: e.html_body,
      textBody: e.text_body,
      deliveryMode: e.delivery_mode,
      status: e.status,
      errorMessage: e.error_message,
      createdAt: e.created_at,
    }));
  }
  return withJsonLock((store) => store.emailLogs.slice(0, limit));
}

export async function createMissionAndSlot(input: {
  title: string;
  description: string;
  period: 'matin' | 'apres_midi' | 'soiree';
  note: string | null;
  timeLabel: string;
  startTime: string;
  endTime: string;
  capacity: number;
}) {
  await ensureDbReady();
  const missionId = `m-${crypto.randomUUID().slice(0, 8)}`;
  const slotId = `s-${crypto.randomUUID().slice(0, 8)}`;

  if (getPostgresConnectionString()) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const maxRes = await client.query<{ max_order: number }>(
        'SELECT COALESCE(MAX(sort_order), 0) as max_order FROM missions'
      );
      const nextOrder = (maxRes.rows[0]?.max_order ?? 0) + 1;
      await client.query(
        'INSERT INTO missions (id, title, description, period, note, sort_order) VALUES ($1, $2, $3, $4, $5, $6)',
        [missionId, input.title, input.description, input.period, input.note, nextOrder]
      );
      await client.query(
        'INSERT INTO slots (id, mission_id, time_label, start_time, end_time, capacity, sort_order) VALUES ($1, $2, $3, $4, $5, $6, 1)',
        [slotId, missionId, input.timeLabel, input.startTime, input.endTime, input.capacity]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return { missionId, slotId };
  }

  return withJsonLock((store) => {
    const maxOrder = store.missions.reduce((acc, m) => Math.max(acc, m.sortOrder), 0);
    store.missions.push({
      id: missionId,
      title: input.title,
      description: input.description,
      period: input.period,
      note: input.note,
      sortOrder: maxOrder + 1,
    });
    store.slots.push({
      id: slotId,
      missionId,
      timeLabel: input.timeLabel,
      startTime: input.startTime,
      endTime: input.endTime,
      capacity: input.capacity,
      sortOrder: 1,
    });
    return { missionId, slotId };
  });
}

export async function createSlot(input: {
  missionId: string;
  timeLabel: string;
  startTime: string;
  endTime: string;
  capacity: number;
}) {
  await ensureDbReady();
  const slotId = `s-${crypto.randomUUID().slice(0, 8)}`;
  if (getPostgresConnectionString()) {
    const maxRes = await getPool().query<{ max_order: number }>(
      'SELECT COALESCE(MAX(sort_order), 0) as max_order FROM slots WHERE mission_id = $1',
      [input.missionId]
    );
    const nextOrder = (maxRes.rows[0]?.max_order ?? 0) + 1;
    await getPool().query(
      'INSERT INTO slots (id, mission_id, time_label, start_time, end_time, capacity, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [slotId, input.missionId, input.timeLabel, input.startTime, input.endTime, input.capacity, nextOrder]
    );
    return { slotId };
  }
  return withJsonLock((store) => {
    const maxOrder = store.slots
      .filter((s) => s.missionId === input.missionId)
      .reduce((acc, s) => Math.max(acc, s.sortOrder), 0);
    store.slots.push({
      id: slotId,
      missionId: input.missionId,
      timeLabel: input.timeLabel,
      startTime: input.startTime,
      endTime: input.endTime,
      capacity: input.capacity,
      sortOrder: maxOrder + 1,
    });
    return { slotId };
  });
}

export async function updateSlot(
  slotId: string,
  updates: { capacity?: number; timeLabel?: string }
): Promise<boolean> {
  await ensureDbReady();
  if (getPostgresConnectionString()) {
    const existing = await getPool().query('SELECT id FROM slots WHERE id = $1', [slotId]);
    if (existing.rows.length === 0) return false;
    if (updates.capacity !== undefined) {
      await getPool().query('UPDATE slots SET capacity = $1 WHERE id = $2', [
        updates.capacity,
        slotId,
      ]);
    }
    if (updates.timeLabel) {
      await getPool().query('UPDATE slots SET time_label = $1 WHERE id = $2', [
        updates.timeLabel,
        slotId,
      ]);
    }
    return true;
  }
  return withJsonLock((store) => {
    const slot = store.slots.find((s) => s.id === slotId);
    if (!slot) return false;
    if (updates.capacity !== undefined) slot.capacity = updates.capacity;
    if (updates.timeLabel) slot.timeLabel = updates.timeLabel;
    return true;
  });
}

export async function deleteSlot(slotId: string): Promise<void> {
  await ensureDbReady();
  if (getPostgresConnectionString()) {
    await getPool().query('DELETE FROM slots WHERE id = $1', [slotId]);
    return;
  }
  await withJsonLock((store) => {
    store.slots = store.slots.filter((s) => s.id !== slotId);
    store.registrations = store.registrations.filter((r) => r.slotId !== slotId);
  });
}

export async function adminAddRegistration(input: {
  slotId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}) {
  await ensureDbReady();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const verificationToken = crypto.randomBytes(24).toString('hex');
  const cancelToken = crypto.randomBytes(24).toString('hex');

  if (getPostgresConnectionString()) {
    await getPool().query(
      `INSERT INTO registrations (
        id, slot_id, first_name, last_name, email, phone, status,
        verification_code, verification_token, cancel_token, verified_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', '000000', $7, $8, $9, $9)`,
      [
        id,
        input.slotId,
        input.firstName,
        input.lastName,
        input.email,
        input.phone,
        verificationToken,
        cancelToken,
        now,
      ]
    );
    return { id };
  }

  return withJsonLock((store) => {
    store.registrations.push({
      id,
      slotId: input.slotId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      status: 'confirmed',
      verificationCode: '000000',
      verificationToken,
      cancelToken,
      verifiedAt: now,
      reminderSentAt: null,
      createdAt: now,
    });
    return { id };
  });
}

export async function getCsvExportRows() {
  await ensureDbReady();
  if (getPostgresConnectionString()) {
    const res = await getPool().query(
      `SELECT m.title as mission_title, s.time_label, s.capacity,
              r.first_name, r.last_name, r.email, r.phone, r.status, r.verified_at, r.reminder_sent_at
       FROM slots s
       JOIN missions m ON m.id = s.mission_id
       LEFT JOIN registrations r ON r.slot_id = s.id AND r.status IN ('pending', 'confirmed')
       ORDER BY m.sort_order ASC, s.sort_order ASC, r.created_at ASC`
    );
    return res.rows;
  }

  return withJsonLock((store) => {
    const missions = [...store.missions].sort((a, b) => a.sortOrder - b.sortOrder);
    const slots = [...store.slots].sort((a, b) => a.sortOrder - b.sortOrder);
    const out: any[] = [];
    for (const m of missions) {
      for (const s of slots.filter((x) => x.missionId === m.id)) {
        const regs = store.registrations
          .filter(
            (r) =>
              r.slotId === s.id && (r.status === 'pending' || r.status === 'confirmed')
          )
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        if (regs.length === 0) {
          out.push({
            mission_title: m.title,
            time_label: s.timeLabel,
            capacity: s.capacity,
            first_name: '',
            last_name: '',
            email: '',
            phone: '',
            status: '',
            verified_at: '',
            reminder_sent_at: '',
          });
        } else {
          for (const r of regs) {
            out.push({
              mission_title: m.title,
              time_label: s.timeLabel,
              capacity: s.capacity,
              first_name: r.firstName,
              last_name: r.lastName,
              email: r.email,
              phone: r.phone,
              status: r.status,
              verified_at: r.verifiedAt,
              reminder_sent_at: r.reminderSentAt,
            });
          }
        }
      }
    }
    return out;
  });
}
