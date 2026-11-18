export type MissionPeriod = 'matin' | 'apres_midi' | 'soiree';

export type RegistrationStatus = 'pending' | 'confirmed' | 'cancelled';

export interface PublicVolunteer {
  id: string;
  firstName: string;
  lastName: string;
  status: 'pending' | 'confirmed';
  createdAt: string;
}

export interface MissionSlot {
  id: string;
  missionId: string;
  timeLabel: string;
  startTime: string;
  endTime: string;
  capacity: number;
  sortOrder: number;
  volunteers: PublicVolunteer[];
  confirmedCount: number;
  pendingCount: number;
  remainingCount: number;
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  period: MissionPeriod;
  note: string | null;
  sortOrder: number;
  slots: MissionSlot[];
}

export interface AppSettings {
  eventDate: string;
  eventLabel: string;
  reminderDate: string;
  helloassoUrl: string;
  schoolName: string;
  replyDeadlineCantine: string;
  mealOrderDeadline: string;
  smtpConfigured: boolean;
}

export interface EmailPreview {
  id: string;
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

export interface AdminRegistrationRow {
  id: string;
  slotId: string;
  missionTitle: string;
  timeLabel: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: RegistrationStatus;
  verifiedAt: string | null;
  reminderSentAt: string | null;
  createdAt: string;
}
