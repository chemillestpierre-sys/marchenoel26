import crypto from 'crypto';
import express, { NextFunction, Request, Response } from 'express';
import {
  adminAddRegistration,
  cancelRegistration,
  confirmRegistration,
  createMissionAndSlot,
  createRegistrationAtomic,
  createSlot,
  deleteSlot,
  ensureDbReady,
  getAdminEmailLogs,
  getAdminRegistrations,
  getConfirmedDueForReminder,
  getCsvExportRows,
  getDatabaseMode,
  getPreviewEmailById,
  getPublicMissionsPayload,
  getRegistrationWithSlotByCancelToken,
  getRegistrationWithSlotById,
  getRegistrationWithSlotByVerificationToken,
  getSettingsMap,
  lookupRegistrationsByEmail,
  markReminderSent,
  setSetting,
  updateSlot,
} from './db';
import {
  dispatchEmail,
  getAppBaseUrl,
  isSmtpConfigured,
  sendConfirmedReceiptEmail,
  sendReminderJ3Email,
  sendVerificationEmail,
} from './email';

export const app = express();
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
  const host = req.header('x-forwarded-host') || req.get('host') || 'localhost:3000';
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

export async function runDueReminders(baseUrl: string, forceAllConfirmed = false) {
  const settings = await getSettingsMap();
  const reminderDate = settings.reminder_date || '2026-12-01';
  const eventDate = settings.event_date || '2026-12-04';
  const todayParis = getTodayParisDate();

  if (!forceAllConfirmed && (todayParis < reminderDate || todayParis > eventDate)) {
    return {
      sentCount: 0,
      skippedReason: `Date actuelle (${todayParis}) hors fenêtre de rappel (${reminderDate} -> ${eventDate}).`,
    };
  }

  const rows = await getConfirmedDueForReminder(forceAllConfirmed);
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
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        missions: [],
      });
    }
    byEmail.get(key)!.missions.push({
      registrationId: row.id,
      missionTitle: row.missionTitle,
      timeLabel: row.timeLabel,
      cancelToken: row.cancelToken,
    });
  }

  let sentCount = 0;
  for (const group of byEmail.values()) {
    const result = await sendReminderJ3Email({
      email: group.email,
      firstName: group.firstName,
      lastName: group.lastName,
      missions: group.missions,
      baseUrl,
    });
    if (result.status === 'sent') {
      await markReminderSent(group.missions.map((m) => m.registrationId));
      sentCount++;
    }
  }

  return { sentCount, skippedReason: null };
}

async function finalizeConfirmation(row: any, baseUrl: string) {
  if (row.status !== 'confirmed') {
    await confirmRegistration(row.id);

    await sendConfirmedReceiptEmail({
      registrationId: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      missionTitle: row.missionTitle,
      timeLabel: row.timeLabel,
      cancelToken: row.cancelToken,
      baseUrl,
    });
  }

  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    missionTitle: row.missionTitle,
    timeLabel: row.timeLabel,
    alreadyConfirmed: row.status === 'confirmed',
  };
}

// Health & Vercel Cron endpoint
app.get('/api/health', async (_req, res) => {
  await ensureDbReady();
  res.json({ ok: true, databaseMode: getDatabaseMode() });
});

app.get('/api/cron/reminders', async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.header('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      res.status(401).json({ error: 'Unauthorized cron trigger' });
      return;
    }
  }
  try {
    const baseUrl = getAppBaseUrl(getRequestOrigin(req));
    const result = await runDueReminders(baseUrl, false);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('Cron reminder error:', err);
    res.status(500).json({ error: 'Cron execution failed' });
  }
});

// Public API
app.get('/api/settings', async (_req, res) => {
  try {
    const s = await getSettingsMap();
    res.json({
      eventDate: s.event_date || '2026-12-04',
      eventLabel: s.event_label || 'Vendredi 4 décembre 2026',
      reminderDate: s.reminder_date || '2026-12-01',
      helloassoUrl: s.helloasso_url || '',
      schoolName: s.school_name || 'École Saint-Pierre',
      replyDeadlineCantine: s.reply_deadline_cantine || '2026-11-27',
      mealOrderDeadline: s.meal_order_deadline || '2026-11-21',
      smtpConfigured: isSmtpConfigured(),
      databaseMode: getDatabaseMode(),
    });
  } catch (err) {
    console.error('Settings error:', err);
    res.status(500).json({ error: 'Erreur de lecture des paramètres.' });
  }
});

app.get('/api/missions', async (_req, res) => {
  try {
    const missions = await getPublicMissionsPayload();
    res.json({ missions });
  } catch (err) {
    console.error('Missions fetch error:', err);
    res.status(500).json({ error: 'Impossible de charger les missions.' });
  }
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

  let created: Awaited<ReturnType<typeof createRegistrationAtomic>>;
  try {
    created = await createRegistrationAtomic({
      slotId,
      firstName: cleanFirst,
      lastName: cleanLast,
      email: cleanEmail,
      phone: cleanPhone,
    });
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
    registrationId: created.registrationId,
    firstName: cleanFirst,
    lastName: cleanLast,
    email: cleanEmail,
    missionTitle: created.missionTitle,
    timeLabel: created.timeLabel,
    verificationCode: created.verificationCode,
    verificationToken: created.verificationToken,
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
    registrationId: created.registrationId,
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

  const row = await getRegistrationWithSlotById(registrationId);
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
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    missionTitle: row.missionTitle,
    timeLabel: row.timeLabel,
    verificationCode: row.verificationCode,
    verificationToken: row.verificationToken,
    baseUrl,
  });

  res.json({
    ok: true,
    deliveryMode: emailResult.deliveryMode,
    previewEmailId: emailResult.deliveryMode === 'preview' ? emailResult.id : null,
  });
});

app.post('/api/registrations/verify-code', async (req, res) => {
  const { registrationId, code } = req.body ?? {};
  const cleanCode = typeof code === 'string' ? code.trim() : '';

  if (!registrationId || !/^\d{6}$/.test(cleanCode)) {
    res.status(400).json({ error: 'Code à 6 chiffres invalide.' });
    return;
  }

  const row = await getRegistrationWithSlotById(registrationId);
  if (!row || row.status === 'cancelled') {
    res.status(404).json({ error: 'Inscription introuvable ou annulée.' });
    return;
  }
  if (row.verificationCode !== cleanCode) {
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

  const row = await getRegistrationWithSlotByVerificationToken(token);
  if (!row) {
    res.status(404).json({ error: 'Ce lien de vérification est invalide ou expiré.' });
    return;
  }

  const baseUrl = getAppBaseUrl(getRequestOrigin(req));
  const summary = await finalizeConfirmation(row, baseUrl);
  res.json({ confirmed: true, registration: summary });
});

app.get('/api/registrations/cancel-preview', async (req, res) => {
  const token = String(req.query.token || '');
  if (!token) {
    res.status(400).json({ error: 'Jeton manquant.' });
    return;
  }

  const row = await getRegistrationWithSlotByCancelToken(token);
  if (!row) {
    res.status(404).json({ error: 'Lien d’annulation introuvable.' });
    return;
  }

  res.json({
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    status: row.status,
    missionTitle: row.missionTitle,
    timeLabel: row.timeLabel,
  });
});

app.post('/api/registrations/cancel-token', async (req, res) => {
  const { token } = req.body ?? {};
  if (!token || typeof token !== 'string') {
    res.status(400).json({ error: 'Jeton manquant.' });
    return;
  }

  const row = await getRegistrationWithSlotByCancelToken(token);
  if (!row) {
    res.status(404).json({ error: 'Lien d’annulation invalide.' });
    return;
  }
  if (row.status === 'cancelled') {
    res.json({
      cancelled: true,
      alreadyCancelled: true,
      missionTitle: row.missionTitle,
      timeLabel: row.timeLabel,
    });
    return;
  }

  await cancelRegistration(row.id);
  res.json({
    cancelled: true,
    alreadyCancelled: false,
    missionTitle: row.missionTitle,
    timeLabel: row.timeLabel,
  });
});

app.get('/api/registrations/ics', async (req, res) => {
  const token = String(req.query.token || '');
  if (!token) {
    res.status(400).send('Token manquant');
    return;
  }

  const row = await getRegistrationWithSlotByCancelToken(token);
  if (!row || row.status !== 'confirmed') {
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
    `DTSTART;TZID=Europe/Paris:${formatDt(row.startTime)}`,
    `DTEND;TZID=Europe/Paris:${formatDt(row.endTime)}`,
    `SUMMARY:Bénévole Marché de Noël — ${row.missionTitle}`,
    `DESCRIPTION:Mission bénévole à l'École Saint-Pierre (${row.timeLabel}). ${row.missionDescription}`,
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

  const rows = await lookupRegistrationsByEmail(cleanEmail);
  let previewEmailId: string | null = null;
  let deliveryMode: 'smtp' | 'preview' = isSmtpConfigured() ? 'smtp' : 'preview';

  if (rows.length > 0 && !cleanEmail.endsWith('.local')) {
    const baseUrl = getAppBaseUrl(getRequestOrigin(req));
    const listHtml = rows
      .map((r) => {
        const actionLink =
          r.status === 'pending'
            ? `<a href="${baseUrl}/?verify=${encodeURIComponent(r.verificationToken)}" style="color:#1e3a8a;font-weight:600;">Valider mon inscription</a>`
            : `<a href="${baseUrl}/api/registrations/ics?token=${encodeURIComponent(r.cancelToken)}" style="color:#1e3a8a;">Ajouter à l'agenda (.ics)</a> · <a href="${baseUrl}/?cancel=${encodeURIComponent(r.cancelToken)}" style="color:#dc2626;">Annuler cette mission</a>`;

        return `<li style="margin-bottom:10px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;list-style:none;">
          <div style="font-weight:700;color:#0f172a;">${r.missionTitle}</div>
          <div style="font-size:13px;color:#334155;margin:4px 0;">Créneau : <strong>${r.timeLabel}</strong> · Statut : ${r.status === 'confirmed' ? 'Confirmée' : 'En attente de validation'}</div>
          <div style="font-size:13px;">${actionLink}</div>
        </li>`;
      })
      .join('');

    const htmlBody = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
        <h2 style="margin-top:0;color:#0f172a;">Vos missions — Marché de Noël (4 décembre)</h2>
        <p style="font-size:15px;color:#334155;">Bonjour ${rows[0].firstName}, voici le récapitulatif sécurisé de vos inscriptions bénévoles :</p>
        <ul style="padding:0;">${listHtml}</ul>
      </div>
    `;

    const mailRes = await dispatchEmail({
      recipientEmail: cleanEmail,
      recipientName: `${rows[0].firstName} ${rows[0].lastName}`,
      emailType: 'lookup',
      subject: '[École Saint-Pierre] Récapitulatif de vos missions bénévoles',
      htmlBody,
      textBody: rows
        .map((r) => `- ${r.missionTitle} (${r.timeLabel}) : ${r.status}`)
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
      missionTitle: r.missionTitle,
      timeLabel: r.timeLabel,
      status: r.status,
    })),
  });
});

app.get('/api/emails/preview/:id', async (req, res) => {
  if (isSmtpConfigured()) {
    res.status(403).json({ error: 'Aperçu désactivé lorsque SMTP est actif.' });
    return;
  }
  const email = await getPreviewEmailById(req.params.id);
  if (!email) {
    res.status(404).json({ error: 'E-mail introuvable.' });
    return;
  }
  res.json(email);
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

app.get('/api/admin/registrations', requireOrganizer, async (_req, res) => {
  const registrations = await getAdminRegistrations();
  res.json({ registrations });
});

app.get('/api/admin/emails', requireOrganizer, async (_req, res) => {
  const emails = await getAdminEmailLogs(60);
  res.json({ emails });
});

app.post('/api/admin/settings', requireOrganizer, async (req, res) => {
  const { helloassoUrl } = req.body ?? {};
  if (typeof helloassoUrl === 'string') {
    const trimmed = helloassoUrl.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      res.status(400).json({ error: 'Le lien HelloAsso doit commencer par https:// ou http://.' });
      return;
    }
    await setSetting('helloasso_url', trimmed);
  }
  res.json({ ok: true });
});

app.post('/api/admin/missions', requireOrganizer, async (req, res) => {
  const { title, description, period, note, timeLabel, startTime, endTime, capacity } =
    req.body ?? {};
  if (!title || !timeLabel || !capacity) {
    res.status(400).json({ error: 'Titre, horaire et nombre de bénévoles requis.' });
    return;
  }
  const validPeriod = ['matin', 'apres_midi', 'soiree'].includes(period) ? period : 'soiree';
  const result = await createMissionAndSlot({
    title: String(title).trim(),
    description: String(description || '').trim(),
    period: validPeriod,
    note: note ? String(note).trim() : null,
    timeLabel: String(timeLabel).trim(),
    startTime: String(startTime || '17:30'),
    endTime: String(endTime || '19:00'),
    capacity: Math.max(1, Number(capacity) || 1),
  });
  res.status(201).json(result);
});

app.post('/api/admin/slots', requireOrganizer, async (req, res) => {
  const { missionId, timeLabel, startTime, endTime, capacity } = req.body ?? {};
  if (!missionId || !timeLabel || !capacity) {
    res.status(400).json({ error: 'Mission, horaire et capacité requis.' });
    return;
  }
  const result = await createSlot({
    missionId: String(missionId),
    timeLabel: String(timeLabel).trim(),
    startTime: String(startTime || '17:30'),
    endTime: String(endTime || '18:30'),
    capacity: Math.max(1, Number(capacity) || 1),
  });
  res.status(201).json(result);
});

app.patch('/api/admin/slots/:slotId', requireOrganizer, async (req, res) => {
  const { capacity, timeLabel } = req.body ?? {};
  const updated = await updateSlot(req.params.slotId, {
    capacity: capacity !== undefined ? Math.max(1, Number(capacity) || 1) : undefined,
    timeLabel: typeof timeLabel === 'string' && timeLabel.trim() ? timeLabel.trim() : undefined,
  });
  if (!updated) {
    res.status(404).json({ error: 'Créneau introuvable.' });
    return;
  }
  res.json({ ok: true });
});

app.delete('/api/admin/slots/:slotId', requireOrganizer, async (req, res) => {
  await deleteSlot(req.params.slotId);
  res.json({ ok: true });
});

app.post('/api/admin/registrations', requireOrganizer, async (req, res) => {
  const { slotId, firstName, lastName, email, phone } = req.body ?? {};
  if (!slotId || !firstName || !lastName) {
    res.status(400).json({ error: 'Créneau, prénom et nom requis.' });
    return;
  }
  const cleanFirst = String(firstName).trim();
  const cleanLast = String(lastName).trim();
  const cleanEmail = String(
    email || `${cleanFirst.toLowerCase()}.${cleanLast.toLowerCase()}@saint-pierre.local`
  ).trim();
  const result = await adminAddRegistration({
    slotId: String(slotId),
    firstName: cleanFirst,
    lastName: cleanLast,
    email: cleanEmail,
    phone: String(phone || '').trim(),
  });
  res.status(201).json(result);
});

app.delete('/api/admin/registrations/:id', requireOrganizer, async (req, res) => {
  await cancelRegistration(req.params.id);
  res.json({ ok: true });
});

app.post('/api/admin/reminders/send', requireOrganizer, async (req, res) => {
  const forceAllConfirmed = Boolean(req.body?.forceTest);
  const baseUrl = getAppBaseUrl(getRequestOrigin(req));
  const result = await runDueReminders(baseUrl, forceAllConfirmed);
  res.json(result);
});

app.get('/api/admin/export-csv', requireOrganizer, async (_req, res) => {
  const rows = await getCsvExportRows();

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
        r.status === 'confirmed'
          ? 'Confirmé'
          : r.status === 'pending'
          ? 'En attente'
          : 'Disponible',
        r.verified_at || '',
        r.reminder_sent_at || '',
      ]
        .map(escapeCsv)
        .join(';')
    ),
  ];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="benevoles-marche-noel-saint-pierre.csv"'
  );
  res.send('\uFEFF' + lines.join('\r\n'));
});
