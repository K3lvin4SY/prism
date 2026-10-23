import type { ViewProps } from '@pterodactyl/sdk/theme';
import { getConfig } from '../config';
import { join } from '../lib/paths';
import { PrismFilesPage } from './FilesPage';

/**
 * The panel's edit page, opened from links elsewhere in the panel, shows the same workbench
 * with the file open. A new file stays with the panel's own page, which asks for its name.
 */
export default function EditorPage({ model, Default }: ViewProps<'page.server.files.editor'>) {
    const config = getConfig();
    if (!config.enabled || !config.workbench || !config.monacoEditPage || !model.file) return <Default />;

    const directory = model.breadcrumbs[model.breadcrumbs.length - 1]?.path ?? '/';

    return <PrismFilesPage initialPath={join(directory, model.file)} />;
}
