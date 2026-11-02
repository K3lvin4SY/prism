import { useQuery } from '@tanstack/react-query';
import { Alert, PageContentBlock, Spinner, httpErrorToHuman } from '@pterodactyl/sdk';
import { adminRolesKey, adminStore, getAdminRoles } from '../api';
import RoleList from '../components/RoleList';

/** The admin area's "Subuser roles": the panel-wide roles every user can give. */
export default function AdminRolesScreen() {
    const query = useQuery({ queryKey: adminRolesKey, queryFn: getAdminRoles });

    return (
        <PageContentBlock title={'Subuser roles'}>
            <div className={'prl:mx-auto prl:flex prl:max-w-5xl prl:flex-col prl:gap-4'}>
                {query.isLoading && <Spinner centered />}
                {query.isError && <Alert type={'danger'}>{httpErrorToHuman(query.error)}</Alert>}
                {query.data && (
                    <RoleList
                        title={'Panel-wide roles'}
                        intro={'Everyone can pick these on a server\'s subuser form. Changing one changes every subuser who has it, unless their permissions were changed by hand.'}
                        roles={query.data}
                        store={adminStore}
                    />
                )}
            </div>
        </PageContentBlock>
    );
}
