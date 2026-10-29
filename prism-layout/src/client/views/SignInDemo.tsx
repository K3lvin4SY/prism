import { useEffect } from 'react';
import { Button, Input } from '@pterodactyl/sdk';
import { Slot } from '@pterodactyl/sdk/theme';
import Mascot from '../mascot';
import { getSettings, signInDemo } from '../settings';
import SignIn from './SignIn';

export { signInDemo };

/**
 * The sign-in page as a guest sees it, for the preview window while signed in: the panel's sign-in
 * card drawn the same way (its mark carries the same label, so the stylesheet's rules for it apply),
 * Prism Layout's picture side and headline, and the providers other extensions add under the form.
 * Nothing here signs anyone in.
 */
export default function SignInDemo() {
    // apply() keeps the sign-in style on <html> while this shows; leaving it takes the style off.
    useEffect(() => {
        document.documentElement.dataset.plaSignin = getSettings().login_style;

        return () => {
            delete document.documentElement.dataset.plaSignin;
        };
    }, []);

    return (
        <div className='pla:fixed pla:inset-0 pla:z-[60] pla:overflow-y-auto pla:bg-background'>
            <p className='pla:fixed pla:top-3 pla:right-3 pla:z-[61] pla:rounded-full pla:bg-primary pla:px-3 pla:py-1 pla:text-xs pla:font-medium pla:text-primary-foreground pla:shadow'>Sign-in page preview</p>
            <div className='pla:pt-8 pla:xl:pt-32'>
                <main className='pla:mx-auto pla:w-full pla:max-w-panel pla:px-4'>
                    <SignIn page='login' />
                    <div className='pla:sm:mx-auto pla:sm:w-4/5 pla:md:p-10 pla:lg:w-3/5 pla:xl:w-full pla:xl:max-w-auth'>
                        <h2 className='pla:py-4 pla:text-center pla:text-3xl pla:font-medium pla:text-foreground'>Login to Continue</h2>
                        <form className='pla:flex pla:w-full' onSubmit={(event) => event.preventDefault()}>
                            <div className='pla:mx-1 pla:w-full pla:rounded-lg pla:bg-card pla:p-6 pla:text-card-foreground pla:shadow-lg pla:md:flex pla:md:pl-0'>
                                <div className='pla:mb-6 pla:flex-none pla:self-center pla:select-none pla:md:mb-0'>
                                    <Mascot className='pla:mx-auto pla:block pla:h-auto pla:w-32 pla:md:w-56 pla:md:px-12' />
                                </div>
                                <div className='pla:flex-1'>
                                    <label className='pla:mb-1 pla:block pla:text-xs pla:font-medium pla:tracking-wide pla:text-muted-foreground pla:uppercase'>Username or Email</label>
                                    <Input readOnly tabIndex={-1} className='pla:w-full' />
                                    <label className='pla:mt-6 pla:mb-1 pla:block pla:text-xs pla:font-medium pla:tracking-wide pla:text-muted-foreground pla:uppercase'>Password</label>
                                    <Input readOnly tabIndex={-1} type='password' className='pla:w-full' />
                                    <div className='pla:mt-6'>
                                        <Button type='button' size='xlarge' className='pla:w-full'>
                                            Login
                                        </Button>
                                    </div>
                                    <Slot name='auth.login.form.after' data={{ pathname: '/auth/login', params: {}, search: {} } as never} />
                                    <p className='pla:mt-6 pla:text-center pla:text-xs pla:tracking-wide pla:text-muted-foreground pla:uppercase'>Forgot password?</p>
                                </div>
                            </div>
                        </form>
                    </div>
                </main>
            </div>
        </div>
    );
}
