import { cn, useSiteSettings } from '@pterodactyl/sdk';
import { NamedIcon } from './icons';
import Mascot from './Mascot';
import type { SettingField } from './api';

/** How Prism Layout's branding and sign-in settings look, with the unsaved changes. */
export default function BrandingPreview({ schema, draft, tab }: { schema: SettingField[]; draft: Record<string, unknown>; tab: string }) {
    const name = useSiteSettings().name;
    const value = (input: string) => (input in draft ? draft[input] : schema.find((field) => field.input === input)?.value);
    const url = (input: string) => {
        const file = value(input);

        return typeof file === 'string' && file !== '' ? file : null;
    };
    const logo = url('logo');

    if (tab === 'Sign-in page') {
        const style = String(value('login_style') ?? 'backdrop');
        const mark = String(value('login_mark') ?? 'logo');
        const size = Number(value('login_logo_size') ?? 160);
        const title = String(value('login_title') ?? '').trim();
        const subtitle = String(value('login_subtitle') ?? '').trim();
        const image = url('login_image');
        const cssImage = image ? `url("${image.replace(/["\\]/g, '')}") center / cover` : null;
        const picture = { background: `${cssImage ? `${cssImage}, ` : ''}linear-gradient(135deg, var(--primary), color-mix(in oklab, var(--primary) 45%, black))` };
        const split = style === 'split';
        // A split page shows the logo on its left half, so the form stands alone on the right.
        const card = (
            <div className={cn('ppx:flex ppx:w-full ppx:max-w-md ppx:items-center ppx:gap-5', split ? 'ppx:flex-col ppx:items-stretch ppx:gap-3' : 'ppx:rounded-lg ppx:bg-card ppx:p-5 ppx:shadow-lg')}>
                {split ? (
                    <p className={'ppx:text-base ppx:font-extrabold'}>Login to Continue</p>
                ) : mark === 'logo' && logo ? (
                    <img src={logo} alt={''} style={{ width: size / 2.4, height: size / 2.4 }} className={'ppx:shrink-0 ppx:object-contain'} />
                ) : mark !== 'none' ? (
                    <Mascot style={{ width: size / 2.4 }} className={'ppx:h-auto ppx:shrink-0'} />
                ) : null}
                <div className={'ppx:flex ppx:flex-1 ppx:flex-col ppx:gap-2'}>
                    <div className={'ppx:h-6 ppx:rounded ppx:bg-muted'} />
                    <div className={'ppx:h-6 ppx:rounded ppx:bg-muted'} />
                    <div className={'ppx:h-6 ppx:w-20 ppx:rounded ppx:bg-primary'} />
                </div>
            </div>
        );

        return (
            <Frame label={'Sign-in page'}>
                <div className={'ppx:relative ppx:flex ppx:min-h-56 ppx:overflow-hidden ppx:rounded-md ppx:bg-background ppx:shadow-md'}>
                    {style === 'split' ? (
                        <>
                            <div
                                className={cn('ppx:flex ppx:w-1/2 ppx:flex-col ppx:justify-center ppx:gap-3 ppx:border-r ppx:border-border ppx:p-5', cssImage && 'ppx:text-white')}
                                style={{ background: cssImage ? `linear-gradient(to top, rgb(0 0 0 / 0.6), rgb(0 0 0 / 0.15)), ${cssImage}` : 'color-mix(in oklab, var(--primary) 7%, var(--background))' }}
                            >
                                {logo ? <img src={logo} alt={''} style={{ width: size / 3.2, height: size / 3.2 }} className={'ppx:object-contain'} /> : <span className={'ppx:text-lg ppx:font-bold'}>{name}</span>}
                                {title && <p className={'ppx:text-xl ppx:leading-tight ppx:font-extrabold ppx:tracking-tight'}>{title}</p>}
                                {subtitle && <p className={cn('ppx:text-xs', cssImage ? 'ppx:text-white/80' : 'ppx:text-muted-foreground')}>{subtitle}</p>}
                            </div>
                            <div className={'ppx:flex ppx:w-1/2 ppx:items-center ppx:justify-center ppx:p-4'}>{card}</div>
                        </>
                    ) : (
                        <div className={'ppx:relative ppx:flex ppx:w-full ppx:flex-col ppx:items-center ppx:justify-center ppx:gap-2 ppx:p-4'}>
                            {style === 'backdrop' && (
                                <div className={'ppx:absolute ppx:inset-0'} style={picture}>
                                    <div className={'ppx:absolute ppx:inset-0 ppx:bg-black/45'} />
                                </div>
                            )}
                            {(title || subtitle) && (
                                <div className={'ppx:relative ppx:flex ppx:flex-col ppx:items-center ppx:gap-0.5 ppx:text-center'} style={style === 'backdrop' ? { color: '#fff' } : undefined}>
                                    {title && <p className={'ppx:text-lg ppx:font-extrabold ppx:tracking-tight'}>{title}</p>}
                                    {subtitle && <p className={cn('ppx:text-xs', style !== 'backdrop' && 'ppx:text-muted-foreground')}>{subtitle}</p>}
                                </div>
                            )}
                            <div className={'ppx:relative ppx:flex ppx:w-full ppx:justify-center'}>{card}</div>
                        </div>
                    )}
                </div>
                {style === 'split' && <p className={'ppx:mt-2 ppx:text-xs ppx:text-muted-foreground'}>On narrow screens the left half is left out and the card shows alone, with the logo beside the form as set below.</p>}
            </Frame>
        );
    }

    const mode = String(value('logo_mode') ?? 'name');
    const height = Number(value('logo_height') ?? 32);
    const showLogo = logo && mode !== 'name';
    const favicon = url('favicon');

    return (
        <Frame label={'Top bar and browser tab'}>
            <div className={'ppx:inline-flex ppx:max-w-xs ppx:items-center ppx:gap-2 ppx:rounded-t-lg ppx:bg-card ppx:px-3 ppx:py-2 ppx:text-sm'}>
                {favicon ? <img src={favicon} alt={''} className={'ppx:size-4 ppx:object-contain'} /> : <NamedIcon name={'globe'} size={16} className={'ppx:text-muted-foreground'} />}
                <span className={'ppx:truncate'}>{name}</span>
                <NamedIcon name={'x'} size={12} className={'ppx:text-muted-foreground'} />
            </div>
            <div className={'ppx:flex ppx:h-14 ppx:items-center ppx:rounded-md ppx:rounded-tl-none ppx:bg-background ppx:px-4 ppx:shadow-md'}>
                <div className={'ppx:flex ppx:min-w-0 ppx:flex-1 ppx:items-center ppx:gap-2.5 ppx:text-xl ppx:font-medium'}>
                    {showLogo && <img src={logo} alt={''} style={{ height: Math.min(height, 56) }} className={'ppx:w-auto'} />}
                    {(!showLogo || mode === 'beside') && <span className={'ppx:truncate'}>{name}</span>}
                </div>
                <div className={'ppx:flex ppx:gap-4 ppx:text-muted-foreground'}>
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
