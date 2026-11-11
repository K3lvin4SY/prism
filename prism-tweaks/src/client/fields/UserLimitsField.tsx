import type { FormExtension } from '@pterodactyl/sdk';
import { APIS, configStore, type Api } from '../config';
import { NamedIcon } from '../icons';
import LimitInput from './LimitInput';

type Values = Record<Api, number | null>;

/** "API requests a minute" on the admin user form, kept in the same list as Prism Properties. */
const UserLimitsField: FormExtension<Values, 'admin.user'> = ({ field }) => {
    const config = configStore.use();

    return (
        <div className={'ptw:flex ptw:flex-col ptw:gap-3'}>
            <div>
                <p className={'ptw:flex ptw:items-center ptw:gap-2 ptw:text-sm ptw:font-semibold'}>
                    <NamedIcon name={'gauge'} size={16} /> API requests a minute
                </p>
                <p className={'input-help'}>Empty uses the number for everyone in Prism Properties → Prism Tweaks, or the panel&apos;s.</p>
            </div>
            <div className={'ptw:grid ptw:gap-4 ptw:sm:grid-cols-3'}>
                {APIS.map((api) => (
                    <LimitInput
                        key={api.key}
                        field={field(api.key)}
                        label={api.label}
                        help={`${api.help} For everyone: ${config.api[api.key] ?? "the panel's"}.`}
                        min={30}
                        max={100000}
                    />
                ))}
            </div>
        </div>
    );
};

export default UserLimitsField;
