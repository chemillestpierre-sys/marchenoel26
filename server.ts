import 'dotenv/config';
import crypto from 'crypto';
import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { db, getSettingsMap, initDatabase } from './server/db.ts';
import {
  dispatchEmail,
  getAppBaseUrl,
  isSmtpConfigured,
  sendConfirmedReceiptEmail,
  sendReminderJ3Email,
  sendVerificationEmail,
} from './server/email.ts';

initDatabase();

const app = express();
const PORT = 3000;

app.use(express.json());

function getOrganizerPin(): string {
  return process.env.ORGANIZER_PIN || 'STPIERRE2026';
}

function requireOrganizer(req: Request, res: Response, next: NextFunction) {
  const pin = req.header('x-organizer-pin');
  if (!pin || pin !== getOrganizerPin()) {
    res.status(401).json({ error: 'Code organisateur invalide.' });
    return;
  }
  next();
}

function getRequestOrigin(req: Request): string {
  const proto = req.header('x-forwarded-proto') || req.protocol || 'http';
  const host = req.header('x-forwarded-host') || req.get('host') || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function getTodayParisDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function cleanupExpiredPendingRegistrations() {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  db.prepare(
    "UPDATE registrations SET status = 'cancelled' WHERE status = 'pending' AND created_at < ?"
  ).run(cutoff);
}

async function runDueReminders(baseUrl: string, forceAllConfirmed = false) {
  const settings = getSettingsMap();
  const reminderDate = settings.reminder_date || '2026-12-01';
  const eventDate = settings.event_date || '2026-12-04';
  const todayParis = getTodayParisDate();

  if (!forceAllConfirmed && (todayParis < reminderDate || todayParis > eventDate)) {
    return { sentCount: 0, skippedReason: `Date actuelle (${todayParis}) hors fenêtre de rappel (${reminderDate} -> ${eventDate}).` };
  }

  const rows = db
    .prepare(
      `
      SELECT r.id, r.first_name, r.last_name, r.email, r.cancel_token,
             m.title as mission_title, s.time_label
      FROM registrations r
      JOIN slots s ON s.id = r.slot_id
      JOIN missions m ON m.id = s.mission_id
      WHERE r.status = 'confirmed'
        AND r.email NOT LIKE '%.local'
        AND (${forceAllConfirmed ? '1=1' : 'r.reminder_sent_at IS NULL'})
      ORDER BY s.start_time ASC
    `
    )
    .all() as Array<{
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    cancel_token: string;
    mission_title: string;
    time_label: string;
  }>;

  if (rows.length === 0) {
    return { sentCount: 0, skippedReason: 'Aucun bénévole confirmé éligible au rappel.' };
  }

  const byEmail = new Map<
    string,
    {
      firstName: string;
      lastName: string;
      email: string;
      missions: Array<{
        registrationId: string;
        missionTitle: string;
        timeLabel: string;
        cancelToken: string;
      }>;
    }
  >();

  for (const row of rows) {
    const key = row.email.toLowerCase();
    if (!byEmail.has(key)) {
      byEmail.set(key, {
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        missions: [],
      });
    }
    byEmail.get(key)!.missions.push({
      registrationId: row.id,
      missionTitle: row.mission_title,
      timeLabel: row.time_label,
      cancelToken: row.cancel_token,
    });
  }

  let sentCount = 0;
  const markSent = db.prepare('UPDATE registrations SET reminder_sent_at = ? WHERE id = ?');

  for (const group of byEmail.values()) {
    const result = await sendReminderJ3Email({
      email: group.email,
      firstName: group.firstName,
      lastName: group.lastName,
      missions: group.missions,
      baseUrl,
    });
    if (result.status === 'sent') {
      const now = new Date().toISOString();
      for (const m of group.missions) {
        markSent.run(now, m.registrationId);
      }
      sentCount++;
    }
  }

  return { sentCount, skippedReason: null };
}

// Public API
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/settings', (_req, res) => {
  const s = getSettingsMap();
  res.json({
    eventDate: s.event_date || '2026-12-04',
    eventLabel: s.event_label || 'Vendredi 4 décembre 2026',
    reminderDate: s.reminder_date || '2026-12-01',
    helloassoUrl: s.helloasso_url || '',
    schoolName: s.school_name || 'École Saint-Pierre',
    replyDeadlineCantine: s.reply_deadline_cantine || '2026-11-27',
    mealOrderDeadline: s.meal_order_deadline || '2026-11-21',
    smtpConfigured: isSmtpConfigured(),
  });
});

app.get('/api/missions', (_req, res) => {
  cleanupExpiredPendingRegistrations();

  const missions = db
    .prepare('SELECT id, title, description, period, note, sort_order FROM missions ORDER BY sort_order ASC')
    .all() as Array<{
    id: string;
    title: string;
    description: string;
    period: 'matin' | 'apres_midi' | 'soiree';
    note: string | null;
    sort_order: number;
  }>;

  const slots = db
    .prepare(
      'SELECT id, mission_id, time_label, start_time, end_time, capacity, sort_order FROM slots ORDER BY sort_order ASC'
    )
    .all() as Array<{
    id: string;
    mission_id: string;
    time_label: string;
    start_time: string;
    end_time: string;
    capacity: number;
    sort_order: number;
  }>;

  const activeRegistrations = db
    .prepare(
      `
      SELECT id, slot_id, first_name, last_name, status, created_at
      FROM registrations
      WHERE status IN ('pending', 'confirmed')
      ORDER BY created_at ASC
    `
    )
    .all() as Array<{
    id: string;
    slot_id: string;
    first_name: string;
    last_name: string;
    status: 'pending' | 'confirmed';
    created_at: string;
  }>;

  const regsBySlot = new Map<string, typeof activeRegistrations>();
  for (const reg of activeRegistrations) {
    if (!regsBySlot.has(reg.slot_id)) {
      regsBySlot.set(reg.slot_id, []);
    }
    regsBySlot.get(reg.slot_id)!.push(reg);
  }

  const slotsByMission = new Map<string, any[]>();
  for (const slot of slots) {
    const regs = regsBySlot.get(slot.id) || [];
    const confirmedCount = regs.filter((r) => r.status === 'confirmed').length;
    const pendingCount = regs.filter((r) => r.status === 'pending').length;
    const remainingCount = Math.max(0, slot.capacity - regs.length);

    const formattedSlot = {
      id: slot.id,
      missionId: slot.mission_id,
      timeLabel: slot.time_label,
      startTime: slot.start_time,
      endTime: slot.end_time,
      capacity: slot.capacity,
      sortOrder: slot.sort_order,
      volunteers: regs.map((r) => ({
        id: r.id,
        firstName: r.first_name,
        lastName: r.last_name,
        status: r.status,
        createdAt: r.created_at,
      })),
      confirmedCount,
      pendingCount,
      remainingCount,
    };

    if (!slotsByMission.has(slot.mission_id)) {
      slotsByMission.set(slot.mission_id, []);
    }
    slotsByMission.get(slot.mission_id)!.push(formattedSlot);
  }

  const payload = missions.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    period: m.period,
    note: m.note,
    sortOrder: m.sort_order,
    slots: slotsByMission.get(m.id) || [],
  }));

  res.json({ missions: payload });
});

app.post('/api/registrations', async (req, res) => {
  const { slotId, firstName, lastName, email, phone } = req.body ?? {};

  const cleanFirst = typeof firstName === 'string' ? firstName.trim().slice(0, 60) : '';
  const cleanLast = typeof lastName === 'string' ? lastName.trim().slice(0, 60) : '';
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase().slice(0, 120) : '';
  const cleanPhone = typeof phone === 'string' ? phone.trim().slice(0, 30) : '';

  if (!slotId || typeof slotId !== 'string') {
    res.status(400).json({ error: 'Créneau manquant.' });
    return;
  }
  if (cleanFirst.length < 2 || cleanLast.length < 2) {
    res.status(400).json({ error: 'Veuillez renseigner votre prénom et votre nom.' });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    res.status(400).json({ error: 'Veuillez saisir une adresse e-mail valide.' });
    return;
  }

  cleanupExpiredPendingRegistrations();

  const registrationId = crypto.randomUUID();
  const verificationCode = String(crypto.randomInt(100000, 1000000));
  const verificationToken = crypto.randomBytes(24).toString('hex');
  const cancelToken = crypto.randomBytes(24).toString('hex');
  const now = new Date().toISOString();

  let slotInfo: { id: string; time_label: string; capacity: number; mission_title: string } | undefined;

  try {
    const createTx = db.transaction(() => {
      const slot = db
        .prepare(
          `
          SELECT s.id, s.time_label, s.capacity, m.title as mission_title
          FROM slots s
          JOIN missions m ON m.id = s.mission_id
          WHERE s.id = ?
        `
        )
        .get(slotId) as
        | { id: string; time_label: string; capacity: number; mission_title: string }
        | undefined;

      if (!slot) {
        throw new Error('SLOT_NOT_FOUND');
      }
      slotInfo = slot;

      const existingSameEmail = db
        .prepare(
          `
          SELECT id, status FROM registrations
          WHERE slot_id = ? AND lower(email) = ? AND status IN ('pending', 'confirmed')
        `
        )
        .get(slotId, cleanEmail) as { id: string; status: string } | undefined;

      if (existingSameEmail) {
        const err: any = new Error('ALREADY_REGISTERED');
        err.existingStatus = existingSameEmail.status;
        err.existingId = existingSameEmail.id;
        throw err;
      }

      const activeCount = db
        .prepare(
          `
          SELECT COUNT(*) as count FROM registrations
          WHERE slot_id = ? AND status IN ('pending', 'confirmed')
        `
        )
        .get(slotId) as { count: number };

      if (activeCount.count >= slot.capacity) {
        throw new Error('SLOT_FULL');
      }

      db.prepare(
        `
        INSERT INTO registrations (
          id, slot_id, first_name, last_name, email, phone, status,
          verification_code, verification_token, cancel_token, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
      `
      ).run(
        registrationId,
        slotId,
        cleanFirst,
        cleanLast,
        cleanEmail,
        cleanPhone,
        verificationCode,
        verificationToken,
        cancelToken,
        now
      );
    });

    createTx();
  } catch (err: any) {
    if (err?.message === 'SLOT_NOT_FOUND') {
      res.status(404).json({ error: 'Ce créneau est introuvable.' });
      return;
    }
    if (err?.message === 'SLOT_FULL') {
      res.status(409).json({ error: 'Toutes les places viennent d’être prises sur ce créneau.' });
      return;
    }
    if (err?.message === 'ALREADY_REGISTERED') {
      res.status(409).json({
        error:
          err.existingStatus === 'confirmed'
            ? 'Cette adresse e-mail est déjà inscrite et confirmée sur ce créneau.'
            : 'Une demande en attente de vérification existe déjà pour cette adresse e-mail sur ce créneau.',
        existingStatus: err.existingStatus,
        existingId: err.existingId,
      });
      return;
    }
    console.error('Create registration error:', err);
    res.status(500).json({ error: 'Erreur lors de l’enregistrement.' });
    return;
  }

  const baseUrl = getAppBaseUrl(getRequestOrigin(req));
  const emailResult = await sendVerificationEmail({
    registrationId,
    firstName: cleanFirst,
    lastName: cleanLast,
    email: cleanEmail,
    missionTitle: slotInfo!.mission_title,
    timeLabel: slotInfo!.time_label,
    verificationCode,
    verificationToken,
    baseUrl,
  });

  if (emailResult.status === 'failed') {
    res.status(502).json({
      error:
        "L'envoi de l'e-mail de vérification a échoué. Vérifiez l'adresse e-mail ou contactez l'école.",
    });
    return;
  }

  res.status(201).json({
    registrationId,
    status: 'pending',
    deliveryMode: emailResult.deliveryMode,
    previewEmailId: emailResult.deliveryMode === 'preview' ? emailResult.id : null,
  });
});

app.post('/api/registrations/resend-verification', async (req, res) => {
  const { registrationId } = req.body ?? {};
  if (!registrationId || typeof registrationId !== 'string') {
    res.status(400).json({ error: 'Identifiant manquant.' });
    return;
  }

  const row = db
    .prepare(
      `
      SELECT r.id, r.first_name, r.last_name, r.email, r.status,
             r.verification_code, r.verification_token,
             m.title as mission_title, s.time_label
      FROM registrations r
      JOIN slots s ON s.id = r.slot_id
      JOIN missions m ON m.id = s.mission_id
      WHERE r.id = ?
    `
    )
    .get(registrationId) as any;

  if (!row) {
    res.status(404).json({ error: 'Inscription introuvable.' });
    return;
  }
  if (row.status !== 'pending') {
    res.status(400).json({ error: 'Cette inscription n’est plus en attente de validation.' });
    return;
  }

  const baseUrl = getAppBaseUrl(getRequestOrigin(req));
  const emailResult = await sendVerificationEmail({
    registrationId: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    missionTitle: row.mission_title,
    timeLabel: row.time_label,
    verificationCode: row.verification_code,
    verificationToken: row.verification_token,
    baseUrl,
  });

  res.json({
    ok: true,
    deliveryMode: emailResult.deliveryMode,
    previewEmailId: emailResult.deliveryMode === 'preview' ? emailResult.id : null,
  });
});

async function finalizeConfirmation(row: any, baseUrl: string) {
  const now = new Date().toISOString();
  if (row.status !== 'confirmed') {
    db.prepare(
      "UPDATE registrations SET status = 'confirmed', verified_at = ? WHERE id = ?"
    ).run(now, row.id);

    await sendConfirmedReceiptEmail({
      registrationId: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      missionTitle: row.mission_title,
      timeLabel: row.time_label,
      cancelToken: row.cancel_token,
      baseUrl,
    });
  }

  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    missionTitle: row.mission_title,
    timeLabel: row.time_label,
    alreadyConfirmed: row.status === 'confirmed',
  };
}

app.post('/api/registrations/verify-code', async (req, res) => {
  const { registrationId, code } = req.body ?? {};
  const cleanCode = typeof code === 'string' ? code.trim() : '';

  if (!registrationId || !/^\d{6}$/.test(cleanCode)) {
    res.status(400).json({ error: 'Code à 6 chiffres invalide.' });
    return;
  }

  const row = db
    .prepare(
      `
      SELECT r.*, m.title as mission_title, s.time_label
      FROM registrations r
      JOIN slots s ON s.id = r.slot_id
      JOIN missions m ON m.id = s.mission_id
      WHERE r.id = ? AND r.status IN ('pending', 'confirmed')
    `
    )
    .get(registrationId) as any;

  if (!row) {
    res.status(404).json({ error: 'Inscription introuvable ou annulée.' });
    return;
  }
  if (row.verification_code !== cleanCode) {
    res.status(400).json({ error: 'Code de vérification incorrect.' });
    return;
  }

  const baseUrl = getAppBaseUrl(getRequestOrigin(req));
  const summary = await finalizeConfirmation(row, baseUrl);
  res.json({ confirmed: true, registration: summary });
});

app.post('/api/registrations/verify-token', async (req, res) => {
  const { token } = req.body ?? {};
  if (!token || typeof token !== 'string') {
    res.status(400).json({ error: 'Lien de vérification invalide.' });
    return;
  }

  const row = db
    .prepare(
      `
      SELECT r.*, m.title as mission_title, s.time_label
      FROM registrations r
      JOIN slots s ON s.id = r.slot_id
      JOIN missions m ON m.id = s.mission_id
      WHERE r.verification_token = ? AND r.status IN ('pending', 'confirmed')
    `
    )
    .get(token) as any;

  if (!row) {
    res.status(404).json({ error: 'Ce lien de vérification est invalide ou expiré.' });
    return;
  }

  const baseUrl = getAppBaseUrl(getRequestOrigin(req));
  const summary = await finalizeConfirmation(row, baseUrl);
  res.json({ confirmed: true, registration: summary });
});

app.get('/api/registrations/cancel-preview', (req, res) => {
  const token = String(req.query.token || '');
  if (!token) {
    res.status(400).json({ error: 'Jeton manquant.' });
    return;
  }

  const row = db
    .prepare(
      `
      SELECT r.id, r.first_name, r.last_name, r.status, m.title as mission_title, s.time_label
      FROM registrations r
      JOIN slots s ON s.id = r.slot_id
      JOIN missions m ON m.id = s.mission_id
      WHERE r.cancel_token = ?
    `
    )
    .get(token) as any;

  if (!row) {
    res.status(404).json({ error: 'Lien d’annulation introuvable.' });
    return;
  }

  res.json({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    status: row.status,
    missionTitle: row.mission_title,
    timeLabel: row.time_label,
  });
});

app.post('/api/registrations/cancel-token', (req, res) => {
  const { token } = req.body ?? {};
  if (!token || typeof token !== 'string') {
    res.status(400).json({ error: 'Jeton manquant.' });
    return;
  }

  const row = db
    .prepare(
      `
      SELECT r.id, r.status, m.title as mission_title, s.time_label
      FROM registrations r
      JOIN slots s ON s.id = r.slot_id
      JOIN missions m ON m.id = s.mission_id
      WHERE r.cancel_token = ?
    `
    )
    .get(token) as any;

  if (!row) {
    res.status(404).json({ error: 'Lien d’annulation invalide.' });
    return;
  }
  if (row.status === 'cancelled') {
    res.json({ cancelled: true, alreadyCancelled: true, missionTitle: row.mission_title, timeLabel: row.time_label });
    return;
  }

  db.prepare("UPDATE registrations SET status = 'cancelled' WHERE id = ?").run(row.id);
  res.json({ cancelled: true, alreadyCancelled: false, missionTitle: row.mission_title, timeLabel: row.time_label });
});

app.get('/api/registrations/ics', (req, res) => {
  const token = String(req.query.token || '');
  if (!token) {
    res.status(400).send('Token manquant');
    return;
  }

  const row = db
    .prepare(
      `
      SELECT r.first_name, r.last_name, m.title as mission_title, m.description, s.time_label, s.start_time, s.end_time
      FROM registrations r
      JOIN slots s ON s.id = r.slot_id
      JOIN missions m ON m.id = s.mission_id
      WHERE r.cancel_token = ? AND r.status = 'confirmed'
    `
    )
    .get(token) as any;

  if (!row) {
    res.status(404).send('Inscription introuvable');
    return;
  }

  const formatDt = (hhmm: string) => `20261204T${hhmm.replace(':', '')}00`;
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ecole Saint-Pierre//Marche de Noel//FR',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@ecole-saint-pierre.fr`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
    `DTSTART;TZID=Europe/Paris:${formatDt(row.start_time)}`,
    `DTEND;TZID=Europe/Paris:${formatDt(row.end_time)}`,
    `SUMMARY:Bénévole Marché de Noël — ${row.mission_title}`,
    `DESCRIPTION:Mission bénévole à l'École Saint-Pierre (${row.time_label}). ${row.description}`,
    'LOCATION:École Saint-Pierre, Chemillé',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="mission-marche-noel.ics"');
  res.send(ics);
});

app.post('/api/my-registrations/lookup', async (req, res) => {
  const cleanEmail =
    typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    res.status(400).json({ error: 'Veuillez saisir une adresse e-mail valide.' });
    return;
  }

  const rows = db
    .prepare(
      `
      SELECT r.id, r.first_name, r.last_name, r.status, r.cancel_token, r.verification_token,
             m.title as mission_title, s.time_label, s.start_time
      FROM registrations r
      JOIN slots s ON s.id = r.slot_id
      JOIN missions m ON m.id = s.mission_id
      WHERE lower(r.email) = ? AND r.status IN ('pending', 'confirmed')
      ORDER BY s.start_time ASC
    `
    )
    .all(cleanEmail) as any[];

  let previewEmailId: string | null = null;
  let deliveryMode: 'smtp' | 'preview' = isSmtpConfigured() ? 'smtp' : 'preview';

  if (rows.length > 0 && !cleanEmail.endsWith('.local')) {
    const baseUrl = getAppBaseUrl(getRequestOrigin(req));
    const listHtml = rows
      .map((r) => {
        const actionLink =
          r.status === 'pending'
            ? `<a href="${baseUrl}/?verify=${encodeURIComponent(r.verification_token)}" style="color:#1e3a8a;font-weight:600;">Valider mon inscription</a>`
            : `<a href="${baseUrl}/api/registrations/ics?token=${encodeURIComponent(r.cancel_token)}" style="color:#1e3a8a;">Ajouter à l'agenda (.ics)</a> · <a href="${baseUrl}/?cancel=${encodeURIComponent(r.cancel_token)}" style="color:#dc2626;">Annuler cette mission</a>`;

        return `<li style="margin-bottom:10px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;list-style:none;">
          <div style="font-weight:700;color:#0f172a;">${r.mission_title}</div>
          <div style="font-size:13px;color:#334155;margin:4px 0;">Créneau : <strong>${r.time_label}</strong> · Statut : ${r.status === 'confirmed' ? 'Confirmée' : 'En attente de validation'}</div>
          <div style="font-size:13px;">${actionLink}</div>
        </li>`;
      })
      .join('');

    const htmlBody = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
        <h2 style="margin-top:0;color:#0f172a;">Vos missions — Marché de Noël (4 décembre)</h2>
        <p style="font-size:15px;color:#334155;">Bonjour ${rows[0].first_name}, voici le récapitulatif sécurisé de vos inscriptions bénévoles :</p>
        <ul style="padding:0;">${listHtml}</ul>
      </div>
    `;

    const mailRes = await dispatchEmail({
      recipientEmail: cleanEmail,
      recipientName: `${rows[0].first_name} ${rows[0].last_name}`,
      emailType: 'lookup',
      subject: '[École Saint-Pierre] Récapitulatif de vos missions bénévoles',
      htmlBody,
      textBody: rows
        .map((r) => `- ${r.mission_title} (${r.time_label}) : ${r.status}`)
        .join('\n'),
    });
    deliveryMode = mailRes.deliveryMode;
    if (mailRes.deliveryMode === 'preview') {
      previewEmailId = mailRes.id;
    }
  }

  res.json({
    count: rows.length,
    deliveryMode,
    previewEmailId,
    items: rows.map((r) => ({
      id: r.id,
      missionTitle: r.mission_title,
      timeLabel: r.time_label,
      status: r.status,
    })),
  });
});

app.get('/api/emails/preview/:id', (req, res) => {
  if (isSmtpConfigured()) {
    res.status(403).json({ error: 'Aperçu désactivé lorsque SMTP est actif.' });
    return;
  }
  const email = db
    .prepare(
      "SELECT id, recipient_email, recipient_name, email_type, subject, html_body, text_body, delivery_mode, status, error_message, created_at FROM email_logs WHERE id = ? AND delivery_mode = 'preview'"
    )
    .get(req.params.id) as any;

  if (!email) {
    res.status(404).json({ error: 'E-mail introuvable.' });
    return;
  }

  res.json({
    id: email.id,
    recipientEmail: email.recipient_email,
    recipientName: email.recipient_name,
    emailType: email.email_type,
    subject: email.subject,
    htmlBody: email.html_body,
    textBody: email.text_body,
    deliveryMode: email.delivery_mode,
    status: email.status,
    errorMessage: email.error_message,
    createdAt: email.created_at,
  });
});

// Organizer / Admin API
app.post('/api/admin/auth', (req, res) => {
  const { pin } = req.body ?? {};
  if (typeof pin === 'string' && pin === getOrganizerPin()) {
    res.json({ ok: true });
    return;
  }
  res.status(401).json({ error: 'Code organisateur incorrect.' });
});

app.get('/api/admin/registrations', requireOrganizer, (_req, res) => {
  const rows = db
    .prepare(
      `
      SELECT r.id, r.slot_id, m.title as mission_title, s.time_label,
             r.first_name, r.last_name, r.email, r.phone, r.status,
             r.verified_at, r.reminder_sent_at, r.created_at
      FROM registrations r
      JOIN slots s ON s.id = r.slot_id
      JOIN missions m ON m.id = s.mission_id
      WHERE r.status != 'cancelled'
      ORDER BY m.sort_order ASC, s.sort_order ASC, r.created_at ASC
    `
    )
    .all() as any[];

  res.json({
    registrations: rows.map((r) => ({
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
    })),
  });
});

app.get('/api/admin/emails', requireOrganizer, (_req, res) => {
  const rows = db
    .prepare(
      `
      SELECT id, recipient_email, recipient_name, email_type, subject,
             html_body, text_body, delivery_mode, status, error_message, created_at
      FROM email_logs
      ORDER BY created_at DESC
      LIMIT 60
    `
    )
    .all() as any[];

  res.json({
    emails: rows.map((e) => ({
      id: e.id,
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
    })),
  });
});

app.post('/api/admin/settings', requireOrganizer, (req, res) => {
  const { helloassoUrl } = req.body ?? {};
  if (typeof helloassoUrl === 'string') {
    const trimmed = helloassoUrl.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      res.status(400).json({ error: 'Le lien HelloAsso doit commencer par https:// ou http://.' });
      return;
    }
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'helloasso_url',
      trimmed
    );
  }
  res.json({ ok: true });
});

app.post('/api/admin/missions', requireOrganizer, (req, res) => {
  const { title, description, period, note, timeLabel, startTime, endTime, capacity } =
    req.body ?? {};
  if (!title || !timeLabel || !capacity) {
    res.status(400).json({ error: 'Titre, horaire et nombre de bénévoles requis.' });
    return;
  }
  const missionId = `m-${crypto.randomUUID().slice(0, 8)}`;
  const slotId = `s-${crypto.randomUUID().slice(0, 8)}`;
  const maxOrder = (
    db.prepare('SELECT COALESCE(MAX(sort_order), 0) as maxOrder FROM missions').get() as {
      maxOrder: number;
    }
  ).maxOrder;

  const validPeriod = ['matin', 'apres_midi', 'soiree'].includes(period) ? period : 'soiree';

  db.transaction(() => {
    db.prepare(
      'INSERT INTO missions (id, title, description, period, note, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      missionId,
      String(title).trim(),
      String(description || '').trim(),
      validPeriod,
      note ? String(note).trim() : null,
      maxOrder + 1
    );
    db.prepare(
      'INSERT INTO slots (id, mission_id, time_label, start_time, end_time, capacity, sort_order) VALUES (?, ?, ?, ?, ?, ?, 1)'
    ).run(
      slotId,
      missionId,
      String(timeLabel).trim(),
      String(startTime || '17:30'),
      String(endTime || '19:00'),
      Math.max(1, Number(capacity) || 1)
    );
  })();

  res.status(201).json({ missionId, slotId });
});

app.post('/api/admin/slots', requireOrganizer, (req, res) => {
  const { missionId, timeLabel, startTime, endTime, capacity } = req.body ?? {};
  if (!missionId || !timeLabel || !capacity) {
    res.status(400).json({ error: 'Mission, horaire et capacité requis.' });
    return;
  }
  const slotId = `s-${crypto.randomUUID().slice(0, 8)}`;
  const maxOrder = (
    db
      .prepare('SELECT COALESCE(MAX(sort_order), 0) as maxOrder FROM slots WHERE mission_id = ?')
      .get(missionId) as { maxOrder: number }
  ).maxOrder;

  db.prepare(
    'INSERT INTO slots (id, mission_id, time_label, start_time, end_time, capacity, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    slotId,
    missionId,
    String(timeLabel).trim(),
    String(startTime || '17:30'),
    String(endTime || '18:30'),
    Math.max(1, Number(capacity) || 1),
    maxOrder + 1
  );
  res.status(201).json({ slotId });
});

app.patch('/api/admin/slots/:slotId', requireOrganizer, (req, res) => {
  const { capacity, timeLabel } = req.body ?? {};
  const existing = db.prepare('SELECT id FROM slots WHERE id = ?').get(req.params.slotId);
  if (!existing) {
    res.status(404).json({ error: 'Créneau introuvable.' });
    return;
  }
  if (capacity !== undefined) {
    const cap = Math.max(1, Number(capacity) || 1);
    db.prepare('UPDATE slots SET capacity = ? WHERE id = ?').run(cap, req.params.slotId);
  }
  if (typeof timeLabel === 'string' && timeLabel.trim()) {
    db.prepare('UPDATE slots SET time_label = ? WHERE id = ?').run(
      timeLabel.trim(),
      req.params.slotId
    );
  }
  res.json({ ok: true });
});

app.delete('/api/admin/slots/:slotId', requireOrganizer, (req, res) => {
  db.prepare('DELETE FROM slots WHERE id = ?').run(req.params.slotId);
  res.json({ ok: true });
});

app.post('/api/admin/registrations', requireOrganizer, (req, res) => {
  const { slotId, firstName, lastName, email, phone } = req.body ?? {};
  if (!slotId || !firstName || !lastName) {
    res.status(400).json({ error: 'Créneau, prénom et nom requis.' });
    return;
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  db.prepare(
    `
    INSERT INTO registrations (
      id, slot_id, first_name, last_name, email, phone, status,
      verification_code, verification_token, cancel_token, verified_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'confirmed', '000000', ?, ?, ?, ?)
  `
  ).run(
    id,
    slotId,
    String(firstName).trim(),
    String(lastName).trim(),
    String(email || `${String(firstName).trim().toLowerCase()}.${String(lastName).trim().toLowerCase()}@saint-pierre.local`).trim(),
    String(phone || '').trim(),
    crypto.randomBytes(24).toString('hex'),
    crypto.randomBytes(24).toString('hex'),
    now,
    now
  );
  res.status(201).json({ id });
});

app.delete('/api/admin/registrations/:id', requireOrganizer, (req, res) => {
  db.prepare("UPDATE registrations SET status = 'cancelled' WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/admin/reminders/send', requireOrganizer, async (req, res) => {
  const forceAllConfirmed = Boolean(req.body?.forceTest);
  const baseUrl = getAppBaseUrl(getRequestOrigin(req));
  const result = await runDueReminders(baseUrl, forceAllConfirmed);
  res.json(result);
});

app.get('/api/admin/export-csv', requireOrganizer, (_req, res) => {
  const rows = db
    .prepare(
      `
      SELECT m.title as mission_title, s.time_label, s.capacity,
             r.first_name, r.last_name, r.email, r.phone, r.status, r.verified_at, r.reminder_sent_at
      FROM slots s
      JOIN missions m ON m.id = s.mission_id
      LEFT JOIN registrations r ON r.slot_id = s.id AND r.status IN ('pending', 'confirmed')
      ORDER BY m.sort_order ASC, s.sort_order ASC, r.created_at ASC
    `
    )
    .all() as any[];

  const escapeCsv = (val: any) => {
    const str = String(val ?? '');
    return `"${str.replace(/"/g, '""')}"`;
  };

  const headers = [
    'Mission',
    'Créneau',
    'Places prévues',
    'Prénom',
    'Nom',
    'E-mail',
    'Téléphone',
    'Statut',
    'Validé le',
    'Rappel J-3 envoyé le',
  ];

  const lines = [
    headers.map(escapeCsv).join(';'),
    ...rows.map((r) =>
      [
        r.mission_title,
        r.time_label,
        r.capacity,
        r.first_name || '',
        r.last_name || '',
        r.email || '',
        r.phone || '',
        r.status === 'confirmed' ? 'Confirmé' : r.status === 'pending' ? 'En attente' : 'Disponible',
        r.verified_at || '',
        r.reminder_sent_at || '',
      ]
        .map(escapeCsv)
        .join(';')
    ),
  ];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="benevoles-marche-noel-saint-pierre.csv"');
  res.send('\uFEFF' + lines.join('\r\n'));
});

// Automatic J-3 reminder scheduler (checks every hour)
setInterval(() => {
  const baseUrl = getAppBaseUrl();
  runDueReminders(baseUrl, false).catch((err) => {
    console.error('Scheduled reminder check error:', err);
  });
}, 60 * 60 * 1000);

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build missing');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    // Run initial J-3 check on startup
    runDueReminders(getAppBaseUrl(), false).catch(() => {});
  });
}

startServer();
