import { NamedIcon, useSiteSettings } from '@pterodactyl/sdk';
import type { SettingField } from './api';

/** How Prism Branding's settings look, with the unsaved changes: the top bar, or the sign-in card. */
export default function BrandingPreview({ schema, draft, tab }: { schema: SettingField[]; draft: Record<string, unknown>; tab: string }) {
    const name = useSiteSettings().name;
    const value = (input: string) => (input in draft ? draft[input] : schema.find((field) => field.input === input)?.value);
    const url = (input: string) => {
        const file = value(input);

        return typeof file === 'string' && file !== '' ? file : null;
    };
    const logo = url('logo');
    const mode = String(value('logo_mode') ?? 'instead');
    const height = Number(value('logo_height') ?? 32);

    if (tab === 'Sign-in pages') {
        const mark = String(value('login_mark') ?? 'logo');
        const size = Number(value('login_logo_size') ?? 160);

        return (
            <Frame label={'Sign-in page'}>
                <div className={'ppx:mx-auto ppx:flex ppx:max-w-xl ppx:items-center ppx:gap-6 ppx:rounded-lg ppx:bg-card ppx:p-6 ppx:shadow-lg'}>
                    {mark === 'logo' && logo ? (
                        <img src={logo} alt={''} style={{ width: size / 1.6, height: size / 1.6 }} className={'ppx:shrink-0 ppx:object-contain'} />
                    ) : mark !== 'none' ? (
                        <NamedIcon name={'bird'} size={64} className={'ppx:shrink-0 ppx:text-primary'} />
                    ) : null}
                    <div className={'ppx:flex ppx:flex-1 ppx:flex-col ppx:gap-2'}>
                        <div className={'ppx:h-8 ppx:rounded ppx:bg-muted'} />
                        <div className={'ppx:h-8 ppx:rounded ppx:bg-muted'} />
                        <div className={'ppx:h-8 ppx:w-24 ppx:rounded ppx:bg-primary'} />
                    </div>
                </div>
            </Frame>
        );
    }

    if (tab === 'Favicon') {
        const favicon = url('favicon');

        return (
            <Frame label={'Browser tab'}>
                <div className={'ppx:inline-flex ppx:max-w-xs ppx:items-center ppx:gap-2 ppx:rounded-t-lg ppx:bg-card ppx:px-3 ppx:py-2 ppx:text-sm'}>
                    {favicon ? <img src={favicon} alt={''} className={'ppx:size-4 ppx:object-contain'} /> : <NamedIcon name={'globe'} size={16} className={'ppx:text-muted-foreground'} />}
                    <span className={'ppx:truncate'}>{name}</span>
                    <NamedIcon name={'x'} size={12} className={'ppx:text-muted-foreground'} />
                </div>
            </Frame>
        );
    }

    const showLogo = logo && mode !== 'name';

    return (
        <Frame label={'Top bar'}>
            <div className={'ppx:flex ppx:h-14 ppx:items-center ppx:rounded-md ppx:bg-background ppx:px-4 ppx:shadow-md'}>
                <div className={'ppx:flex ppx:min-w-0 ppx:flex-1 ppx:items-center ppx:gap-2.5 ppx:text-xl ppx:font-medium'}>
                    {showLogo && <img src={logo} alt={''} style={{ height: Math.min(height, 56) }} className={'ppx:w-auto'} />}
                    {(!showLogo || mode === 'beside') && <span className={'ppx:truncate'}>{name}</span>}
                </div>
                <div className={'ppx:flex ppx:gap-4 ppx:text-muted-foreground'}>
                    <NamedIcon name={'search'} size={18} />
                    <NamedIcon name={'layers'} size={18} />
                    <NamedIcon name={'user'} size={18} />
                </div>
            </div>
        </Frame>
    );
}

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <section className={'ppx:rounded-lg ppx:border ppx:border-border ppx:bg-card'}>
            <h3 className={'ppx:border-b ppx:border-border ppx:px-4 ppx:py-3 ppx:text-sm ppx:font-semibold'}>Preview · {label}</h3>
            <div className={'ppx:bg-muted/30 ppx:p-4'}>{children}</div>
        </section>
    );
}
