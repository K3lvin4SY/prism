import { http } from '@pterodactyl/sdk';

export type ProviderType = 'google' | 'discord' | 'github' | 'steam' | 'oidc';

/** A provider as the sign-in page and account page see it: never its credentials. */
export interface PublicProvider {
    slug: string;
    type: ProviderType;
    name: string;
    label: string;
    icon: string | null;
    color: string | null;
}

export type LoginData = { complete: true; intended: string } | { complete: false; confirmation_token: string };

export interface Pending {
    provider: PublicProvider;
    email: string | null;
    email_verified: boolean;
    name: string | null;
    username: string;
    avatar: string | null;
}

export interface SignupInput {
    email: string;
    username?: string;
    name_first?: string;
    name_last?: string;
    password?: string;
    terms?: boolean;
    website?: string;
    elapsed?: number;
    turnstile?: string;
}

export type SignupResult = { status: 'sent'; email: string } | { status: 'signed-in'; result: LoginData };

/** What an emailed confirmation link is for. */
export interface Confirmation {
    email: string;
    username: string;
    provider: PublicProvider | null;
    provider_account: string | null;
}

export type ConfirmResult = { status: 'signed-in'; result: LoginData } | { status: 'expired' | 'taken-account' | 'create' };

export interface MethodIdentity {
    id: number;
    name: string | null;
    email: string | null;
    avatar: string | null;
    linked_at: string;
    last_used_at: string | null;
}

export interface Methods {
    password: boolean;
    methods: number;
    providers: (PublicProvider & { enabled: boolean; identity: MethodIdentity | null })[];
}

const ROOT = '/prism-auth';
const CLIENT = '/api/client/extensions/prism-auth';

export const redirectUrl = (slug: string, intent: 'login' | 'link') => `${ROOT}/${encodeURIComponent(slug)}/redirect${intent === 'link' ? '?intent=link' : ''}`;

export const providersQuery = { queryKey: ['prism-auth', 'providers'], queryFn: async () => (await http.get<{ data: PublicProvider[] }>(`${ROOT}/providers`)).data.data, staleTime: 60_000 };

export const loginResult = async () => (await http.get<{ data: LoginData | null }>(`${ROOT}/result`)).data.data;

export const pending = async () => (await http.get<{ data: Pending | null }>(`${ROOT}/pending`)).data.data;

export const forgetPending = () => http.delete(`${ROOT}/pending`);

export const signup = async (input: SignupInput) => (await http.post<{ data: SignupResult }>(`${ROOT}/signup`, input)).data.data;

export const resend = (email: string) => http.post(`${ROOT}/resend`, { email });

export const confirmation = async (token: string) => (await http.post<{ data: Confirmation | null }>(`${ROOT}/verify/preview`, { token })).data.data;

export const confirm = async (token: string) => (await http.post<{ data: ConfirmResult }>(`${ROOT}/verify`, { token })).data.data;

export const methodsQuery = { queryKey: ['prism-auth', 'methods'], queryFn: async () => (await http.get<{ data: Methods }>(`${CLIENT}/identities`)).data.data };

export const unlink = (id: number) => http.delete(`${CLIENT}/identities/${id}`);
