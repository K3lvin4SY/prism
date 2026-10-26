import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';
import ProviderButtons from './components/ProviderButtons';
import SignupLink from './components/SignupLink';
import { configStore, setConfig } from './config';
import { captureStatus } from './lib/messages';

export default definePterodactylExtension({
    setup({ config, slots, screens }) {
        // Runs for guests too: the sign-in page reads the public settings.
        setConfig(config);
        captureStatus();

        slots.register('auth.login.form.after', configStore.live(ProviderButtons));
        slots.register('auth.login.after', configStore.live(SignupLink));
        screens.register('sign-in-methods', () => import('./screens/SignInMethodsScreen').then(configStore.liveModule));
    },
});
