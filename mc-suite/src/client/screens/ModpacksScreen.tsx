import { ServerContentBlock } from '@pterodactyl/sdk';
import ContentBrowser from '../components/content/ContentBrowser';

export default function ModpacksScreen() {
    return (
        <ServerContentBlock title={'Modpacks'}>
            <ContentBrowser kind={'modpacks'} />
        </ServerContentBlock>
    );
}
