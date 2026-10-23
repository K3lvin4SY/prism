import { ServerContentBlock } from '@pterodactyl/sdk';

export default function ComingSoonScreen() {
    return (
        <ServerContentBlock title={'Prism MC'}>
            <p className={'mcs:text-sm mcs:text-muted-foreground'}>This page is not available yet.</p>
        </ServerContentBlock>
    );
}
