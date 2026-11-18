import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { insertEmailLog } from './db';

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
  );
}

function getTransporter() {
  if (!isSmtpConfigured()) {
    return null;
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function getFromAddress(): string {
  return (
    process.env.SMTP_FROM ||
    'Marché de Noël École Saint-Pierre <no-reply@ecole-saint-pierre.fr>'
  );
}

export function getAppBaseUrl(reqOrigin?: string): string {
  if (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL') {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  if (reqOrigin) {
    return reqOrigin.replace(/\/$/, '');
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return 'http://localhost:3000';
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapEmailLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:24px 28px;border-bottom:1px solid #e2e8f0;background-color:#ffffff;">
              <div style="font-size:13px;font-weight:600;color:#1e3a8a;letter-spacing:0.02em;">ÉCOLE SAINT-PIERRE · CHEMILLÉ</div>
              <h1 style="margin:6px 0 0;font-size:20px;line-height:1.3;color:#0f172a;">${escapeHtml(title)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;line-height:1.5;">
              Marché de Noël de l’École Saint-Pierre · Vendredi 4 décembre 2026<br />
              La Christmas Team — Association des parents d’élèves (APEL)
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function dispatchEmail(params: {
  registrationId?: string | null;
  recipientEmail: string;
  recipientName: string;
  emailType: 'verification' | 'confirmation' | 'reminder_j3' | 'cancellation' | 'lookup';
  subject: string;
  htmlBody: string;
  textBody: string;
}): Promise<{ id: string; deliveryMode: 'smtp' | 'preview'; status: 'sent' | 'failed'; errorMessage: string | null }> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const transporter = getTransporter();

  const deliveryMode: 'smtp' | 'preview' = transporter ? 'smtp' : 'preview';
  let status: 'sent' | 'failed' = 'sent';
  let errorMessage: string | null = null;

  if (transporter) {
    try {
      await transporter.sendMail({
        from: getFromAddress(),
        to: params.recipientEmail,
        subject: params.subject,
        text: params.textBody,
        html: params.htmlBody,
      });
    } catch (err) {
      status = 'failed';
      errorMessage = err instanceof Error ? err.message : String(err);
      console.error('SMTP send error:', errorMessage);
    }
  }

  await insertEmailLog({
    id,
    registrationId: params.registrationId ?? null,
    recipientEmail: params.recipientEmail,
    recipientName: params.recipientName,
    emailType: params.emailType,
    subject: params.subject,
    htmlBody: params.htmlBody,
    textBody: params.textBody,
    deliveryMode,
    status,
    errorMessage,
    createdAt: now,
  });

  return { id, deliveryMode, status, errorMessage };
}

export async function sendVerificationEmail(params: {
  registrationId: string;
  firstName: string;
  lastName: string;
  email: string;
  missionTitle: string;
  timeLabel: string;
  verificationCode: string;
  verificationToken: string;
  baseUrl: string;
}) {
  const verifyUrl = `${params.baseUrl}/?verify=${encodeURIComponent(params.verificationToken)}`;
  const fullName = `${params.firstName} ${params.lastName}`;
  const subject = `[École Saint-Pierre] Confirmez votre inscription bénévole — ${params.missionTitle}`;

  const htmlBody = wrapEmailLayout(
    'Confirmez votre inscription bénévole',
    `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Bonjour <strong>${escapeHtml(params.firstName)}</strong>,</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">
      Nous avons bien enregistré votre demande d’inscription pour le Marché de Noël de l’École Saint-Pierre (<strong>vendredi 4 décembre</strong>).
      Pour sécuriser les inscriptions et éviter qu’une personne ne s’inscrive sous un autre nom, merci de confirmer votre adresse e-mail :
    </p>
    <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:0 0 22px;">
      <div style="font-size:13px;color:#475569;margin-bottom:4px;">Mission sélectionnée</div>
      <div style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:10px;">${escapeHtml(params.missionTitle)}</div>
      <div style="font-size:14px;color:#334155;">Créneau : <strong>${escapeHtml(params.timeLabel)}</strong> · Vendredi 4 décembre</div>
    </div>
    <p style="margin:0 0 20px;text-align:center;">
      <a href="${verifyUrl}" style="display:inline-block;background-color:#1e3a8a;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px;">
        Confirmer mon inscription
      </a>
    </p>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155;text-align:center;">
      Ou saisissez ce code de vérification sur le site :<br />
      <span style="display:inline-block;margin-top:8px;font-family:monospace;font-size:24px;font-weight:700;letter-spacing:0.2em;color:#1e3a8a;background:#eff6ff;padding:8px 16px;border-radius:6px;border:1px solid #bfdbfe;">${escapeHtml(params.verificationCode)}</span>
    </p>
    <p style="margin:20px 0 0;font-size:13px;color:#64748b;line-height:1.5;">
      Si vous n’êtes pas à l’origine de cette inscription, ignorez simplement ce message : aucune place ne sera bloquée sans votre validation.
    </p>
    `
  );

  const textBody = `Bonjour ${params.firstName},\n\nMerci de confirmer votre inscription bénévole pour le Marché de Noël de l'École Saint-Pierre (vendredi 4 décembre) :\nMission : ${params.missionTitle}\nCréneau : ${params.timeLabel}\n\nCode de vérification : ${params.verificationCode}\nLien de confirmation directe : ${verifyUrl}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`;

  return dispatchEmail({
    registrationId: params.registrationId,
    recipientEmail: params.email,
    recipientName: fullName,
    emailType: 'verification',
    subject,
    htmlBody,
    textBody,
  });
}

export async function sendConfirmedReceiptEmail(params: {
  registrationId: string;
  firstName: string;
  lastName: string;
  email: string;
  missionTitle: string;
  timeLabel: string;
  cancelToken: string;
  baseUrl: string;
}) {
  const cancelUrl = `${params.baseUrl}/?cancel=${encodeURIComponent(params.cancelToken)}`;
  const icsUrl = `${params.baseUrl}/api/registrations/ics?token=${encodeURIComponent(params.cancelToken)}`;
  const fullName = `${params.firstName} ${params.lastName}`;
  const subject = `[Confirmé] Votre mission bénévole du 4 décembre — ${params.missionTitle}`;

  const htmlBody = wrapEmailLayout(
    'Inscription confirmée !',
    `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Bonjour <strong>${escapeHtml(params.firstName)}</strong>,</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">
      Un grand merci pour votre engagement ! Votre inscription bénévole pour le Marché de Noël est désormais <strong>validée</strong>.
    </p>
    <div style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:0 0 22px;">
      <div style="font-size:13px;color:#166534;font-weight:600;margin-bottom:4px;">Mission confirmée</div>
      <div style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:8px;">${escapeHtml(params.missionTitle)}</div>
      <div style="font-size:14px;color:#334155;">Date : <strong>Vendredi 4 décembre 2026</strong> · Créneau : <strong>${escapeHtml(params.timeLabel)}</strong></div>
    </div>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#334155;">
      Vous recevrez automatiquement un <strong>e-mail de rappel 3 jours avant l’événement</strong> (le mardi 1er décembre).
    </p>
    <p style="margin:0 0 22px;">
      <a href="${icsUrl}" style="display:inline-block;background-color:#1e3a8a;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px;">
        Ajouter à mon agenda (.ics)
      </a>
    </p>
    <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5;border-top:1px solid #e2e8f0;padding-top:14px;">
      En cas d’empêchement, vous seul(e) pouvez libérer votre place via ce lien personnel et confidentiel :<br />
      <a href="${cancelUrl}" style="color:#dc2626;">Annuler cette inscription</a>
    </p>
    `
  );

  const textBody = `Bonjour ${params.firstName},\n\nVotre inscription bénévole pour le Marché de Noël de l'École Saint-Pierre (vendredi 4 décembre) est confirmée !\nMission : ${params.missionTitle}\nCréneau : ${params.timeLabel}\n\nUn rappel automatique vous sera envoyé 3 jours avant l'événement (mardi 1er décembre).\nAjouter à votre agenda : ${icsUrl}\nEn cas d'empêchement (lien personnel) : ${cancelUrl}`;

  return dispatchEmail({
    registrationId: params.registrationId,
    recipientEmail: params.email,
    recipientName: fullName,
    emailType: 'confirmation',
    subject,
    htmlBody,
    textBody,
  });
}

export async function sendReminderJ3Email(params: {
  email: string;
  firstName: string;
  lastName: string;
  missions: Array<{
    registrationId: string;
    missionTitle: string;
    timeLabel: string;
    cancelToken: string;
  }>;
  baseUrl: string;
}) {
  const fullName = `${params.firstName} ${params.lastName}`;
  const subject = `[Rappel J-3] Votre engagement bénévole — Marché de Noël vendredi 4 décembre`;

  const itemsHtml = params.missions
    .map(
      (m) => `
      <li style="margin-bottom:10px;padding:12px 14px;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;list-style:none;">
        <div style="font-weight:700;color:#0f172a;font-size:15px;">${escapeHtml(m.missionTitle)}</div>
        <div style="font-size:14px;color:#334155;margin-top:4px;">Créneau : <strong>${escapeHtml(m.timeLabel)}</strong></div>
        <div style="font-size:12px;margin-top:6px;">
          <a href="${params.baseUrl}/?cancel=${encodeURIComponent(m.cancelToken)}" style="color:#64748b;">Signaler un empêchement sur ce créneau</a>
        </div>
      </li>`
    )
    .join('');

  const htmlBody = wrapEmailLayout(
    'Rappel : Marché de Noël dans 3 jours !',
    `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Bonjour <strong>${escapeHtml(params.firstName)}</strong>,</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Le Marché de Noël de l’École Saint-Pierre approche ! Il aura lieu ce <strong>vendredi 4 décembre</strong> (ouverture des portes au public à 17h30).
      Voici le récapitulatif de votre engagement bénévole :
    </p>
    <ul style="padding:0;margin:0 0 20px;">
      ${itemsHtml}
    </ul>
    <p style="margin:0 0 12px;font-size:14px;color:#334155;line-height:1.6;">
      Un immense merci pour votre aide précieuse qui permet la réussite de cette belle soirée pour les enfants et les familles !
    </p>
    `
  );

  const textBody = `Bonjour ${params.firstName},\n\nRappel : le Marché de Noël de l'École Saint-Pierre a lieu dans 3 jours, le vendredi 4 décembre !\nVoici vos missions confirmées :\n${params.missions
    .map((m) => `- ${m.missionTitle} (${m.timeLabel})`)
    .join('\n')}\n\nMerci pour votre aide précieuse !\nLa Christmas Team`;

  return dispatchEmail({
    registrationId: params.missions[0]?.registrationId ?? null,
    recipientEmail: params.email,
    recipientName: fullName,
    emailType: 'reminder_j3',
    subject,
    htmlBody,
    textBody,
  });
}
