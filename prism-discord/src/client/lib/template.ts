/** Discord webhook addresses, as Discord's Copy Webhook URL gives them. */
export const WEBHOOK = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;

/** A Discord role id: right-click the role with Developer Mode on, Copy Role ID. */
export const ROLE_ID = /^\d{5,24}$/;

/** The placeholders a message may use. */
export const PLACEHOLDERS = ['{server}', '{player}', '{backup}', '{event}'] as const;

/** A message as the webhook will post it, for the preview under each text box. */
export function fill(template: string, values: Partial<Record<'server' | 'player' | 'backup' | 'event', string>>): string {
    return template.replace(/\{(server|player|backup|event)\}/g, (_, key: 'server' | 'player' | 'backup' | 'event') => values[key] ?? '');
}

/** The events this hook can post, without the player ones when the administrator turned them off. */
export const usable = <T extends { key: string }>(events: T[], players: boolean) => events.filter((event) => players || !event.key.startsWith('player.'));
