import { ServerContentBlock } from '@pterodactyl/sdk';
import ContentBrowser from '../components/content/ContentBrowser';
import PatchBukkitCard from '../components/content/PatchBukkitCard';
import { useMcInfo } from '../hooks/useMcInfo';
import { featureEnabled } from '../config';

export default function PluginsScreen() {
    const { identifier, info } = useMcInfo();

    return (
        <ServerContentBlock title={'Plugins'}>
            <div className={'mcs:flex mcs:flex-col mcs:gap-4'}>
                {info?.software === 'pumpkin' && featureEnabled('patchbukkit') && <PatchBukkitCard server={identifier} />}
                <ContentBrowser kind={'plugins'} />
            </div>
        </ServerContentBlock>
    );
}
