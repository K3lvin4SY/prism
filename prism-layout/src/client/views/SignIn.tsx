import { useSettings } from '../settings';

const siteName = () => (window as unknown as { SiteConfiguration?: { name?: string } }).SiteConfiguration?.name ?? '';

/**
 * Above the sign-in form, through the panel's auth slots, which are the one place an extension can
 * add to the sign-in pages: the picture beside or behind the form, and the tagline. The stylesheet
 * moves the panel's own card to make room (see styles.css, "Sign-in pages").
 */
export default function SignIn() {
    const settings = useSettings();
    const tagline = settings.login_tagline.trim();

    if (settings.login_style === 'split') {
        return (
            <div className='pla-signin-art' aria-hidden={!tagline}>
                <div className='pla:flex pla:items-center pla:gap-3'>
                    {settings.logo ? <img src={settings.logo} alt={siteName()} className='pla:h-10 pla:w-auto' /> : <span className='pla:font-header pla:text-2xl pla:font-semibold'>{siteName()}</span>}
                </div>
                {tagline && <p className='pla:max-w-md pla:font-header pla:text-4xl pla:leading-tight pla:font-semibold pla:text-balance'>{tagline}</p>}
            </div>
        );
    }

    return (
        <>
            {settings.login_style === 'backdrop' && <div className='pla-signin-backdrop' aria-hidden />}
            {tagline && <p className='pla-signin-tagline pla:mx-auto pla:mb-2 pla:max-w-xl pla:px-4 pla:text-center pla:font-header pla:text-xl pla:font-medium'>{tagline}</p>}
        </>
    );
}
