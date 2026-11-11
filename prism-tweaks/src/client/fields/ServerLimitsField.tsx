import type { FormExtension } from '@pterodactyl/sdk';
import { RESOURCES, configStore } from '../config';
import { NamedIcon } from '../icons';
import LimitInput from './LimitInput';

/** The server's own create limits on the admin server form. */
const ServerLimitsField: FormExtension<Record<string, number | null>, 'admin.server'> = ({ field }) => {
    const config = configStore.use();

    return (
        <div className={'ptw:flex ptw:flex-col ptw:gap-3'}>
            <div>
                <p className={'ptw:flex ptw:items-center ptw:gap-2 ptw:text-sm ptw:font-semibold'}>
                    <NamedIcon name={'gauge'} size={16} /> Create limits for this server
                </p>
                <p className={'input-help'}>How many of each the server may create in the panel&apos;s time window. Empty uses the number for every server in Prism Properties → Prism Tweaks, or the panel&apos;s.</p>
            </div>
            <div className={'ptw:grid ptw:gap-4 ptw:sm:grid-cols-2 ptw:lg:grid-cols-3'}>
                {RESOURCES.map((resource) => {
                    const everyone = config.resources[resource.key];

                    return (
                        <LimitInput
                            key={resource.key}
                            field={field(resource.key)}
                            label={resource.label}
                            help={everyone ? `Every server: ${everyone}. Panel: ${resource.panel}.` : `Panel: ${resource.panel}.`}
                            min={1}
                            max={1000}
                        />
                    );
                })}
            </div>
        </div>
    );
};

export default ServerLimitsField;
