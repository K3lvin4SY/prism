import { Alert, ServerContentBlock } from '@pterodactyl/sdk';

/** Stands in for tabs that are declared but not built yet; they stay hidden until they are. */
export default function ComingSoonScreen() {
    return (
        <ServerContentBlock title={'Terraria Suite'}>
            <Alert type={'info'}>This part of Terraria Suite is not ready yet.</Alert>
        </ServerContentBlock>
    );
}
