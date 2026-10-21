import { ServerContentBlock } from '@pterodactyl/sdk';
import ContentBrowser from '../components/content/ContentBrowser';

export default function PluginsScreen() {
    return (
        <ServerContentBlock title={'Plugins'}>
            <ContentBrowser kind={'plugins'} />
        </ServerContentBlock>
    );
}
