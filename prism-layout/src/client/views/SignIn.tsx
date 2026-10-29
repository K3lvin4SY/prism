import Mascot from '../mascot';
import { useSettings } from '../settings';

const siteName = () => (window as unknown as { SiteConfiguration?: { name?: string } }).SiteConfiguration?.name ?? '';

/**
 * Above the sign-in form, through the panel's auth slots, which are the one place an extension can
 * add to the sign-in pages: the picture beside or behind the form, the logo or mascot on a split page,
 * and the headline and tagline. The stylesheet moves the panel's own card to make room (see
 * styles.css, "Sign-in pages").
 */
export default function SignIn({ page }: { page?: 'login' }) {
    const settings = useSettings();
    const title = settings.login_title.trim();
    const subtitle = settings.login_subtitle.trim();

    if (settings.login_style === 'split') {
        // What "Beside the form" picks (the mascot when there is no logo), then the headline and the
        // tagline, each only when set, centered on the picture side.
        const mark = settings.login_mark === 'logo' && !settings.logo ? 'mascot' : settings.login_mark;

        return (
            <div className='pla-signin-art' data-image={settings.login_image ? 'true' : 'false'} aria-hidden={!title && !subtitle}>
                {mark === 'logo' && settings.logo && <img src={settings.logo} alt={siteName()} className='pla-signin-logo pla:object-contain' />}
                {mark === 'mascot' && <Mascot label='Pterodactyl mascot' className='pla-signin-logo' />}
                {(title || subtitle) && (
                    <div className='pla:flex pla:max-w-lg pla:flex-col pla:gap-4'>
                        {title && <p className='pla:font-header pla:text-5xl pla:leading-[1.05] pla:font-extrabold pla:tracking-tight pla:text-balance'>{title}</p>}
                        {subtitle && <p className='pla-signin-subtitle pla:text-lg pla:text-pretty'>{subtitle}</p>}
                    </div>
                )}
            </div>
        );
    }

    return (
        <>
            {/* The sign-in page's own title gives way to the headline on the card and backdrop styles. */}
            {page === 'login' && <span className='pla-signin-login' hidden />}
            {settings.login_style === 'backdrop' && <div className='pla-signin-backdrop' aria-hidden />}
            {(title || subtitle) && (
                <div className='pla-signin-tagline pla:mx-auto pla:mb-2 pla:flex pla:max-w-xl pla:flex-col pla:gap-1.5 pla:px-4 pla:text-center'>
                    {title && <p className='pla:font-header pla:text-3xl pla:leading-tight pla:font-extrabold pla:tracking-tight pla:text-balance'>{title}</p>}
                    {subtitle && <p className='pla-signin-subtitle pla:text-base pla:text-pretty'>{subtitle}</p>}
                </div>
            )}
        </>
    );
}
