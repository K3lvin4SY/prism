import { ServerContentBlock } from '@pterodactyl/sdk';
import ContentBrowser from '../components/content/ContentBrowser';

export default function ModsScreen() {
    return (
        <ServerContentBlock title={'Mods'}>
            <ContentBrowser kind={'mods'} />
        </ServerContentBlock>
    );
}
