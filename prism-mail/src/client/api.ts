import { http } from '@pterodactyl/sdk';

export type Field = 'subject' | 'greeting' | 'intro' | 'action' | 'outro';
export type Wording = Record<Field, string>;

export interface Email {
    key: string;
    label: string;
    about: string;
    placeholders: string[];
    /** The panel's own text, with made-up details. */
    panel: Wording;
    /** The admin's wording; empty fields keep the panel's. */
    template: Wording;
}

export interface LogEntry {
    id: number;
    recipient: string;
    subject: string;
    email: string | null;
    /** unconfirmed: the mail server never took it, most likely it failed. */
    status: 'sending' | 'sent' | 'unconfirmed';
    created_at: string;
    sent_at: string | null;
}

export interface LogPage {
    data: LogEntry[];
    meta: { page: number; pages: number; total: number };
}

const base = '/api/admin/extensions/prism-mail';

export const emailsKey = ['prism-mail', 'emails'] as const;
export const logKey = (search: string, page: number) => ['prism-mail', 'log', search, page] as const;

export const getEmails = async () => (await http.get<{ data: Email[] }>(`${base}/emails`)).data.data;
export const saveEmail = async (key: string, wording: Wording) => (await http.put<{ data: Wording }>(`${base}/emails/${key}`, wording)).data.data;
export const previewEmail = async (key: string, wording: Wording) => (await http.post<{ data: { subject: string; html: string } }>(`${base}/emails/${key}/preview`, wording)).data.data;
export const testEmail = async (key: string) => (await http.post<{ data: { to: string } }>(`${base}/emails/${key}/test`)).data.data;

export const getLog = async (search: string, page: number) => (await http.get<LogPage>(`${base}/log`, { params: { search, page } })).data;
export const clearLog = () => http.delete(`${base}/log`);
