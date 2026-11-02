import { useQuery } from '@tanstack/react-query';
import { Alert, PageContentBlock, Spinner, httpErrorToHuman } from '@pterodactyl/sdk';
import { getMyRoles, myRolesKey, myStore } from '../api';
import RoleList from '../components/RoleList';

/** The account's "Subuser roles": your own roles, and the panel-wide ones beside them. */
export default function AccountRolesScreen() {
    const query = useQuery({ queryKey: myRolesKey, queryFn: getMyRoles });
    const data = query.data;
    const mine = data?.roles.filter((role) => role.scope === 'mine') ?? [];
    const panel = data?.roles.filter((role) => role.scope === 'panel') ?? [];

    return (
        <PageContentBlock title={'Subuser roles'}>
            <div className={'prl:mx-auto prl:flex prl:max-w-5xl prl:flex-col prl:gap-4'}>
                {query.isLoading && <Spinner centered />}
                {query.isError && <Alert type={'danger'}>{httpErrorToHuman(query.error)}</Alert>}
                {data && data.personal && (
                    <RoleList
                        title={'Your roles'}
                        intro={'Pick one on the subuser form of any server you can manage users on. Your helpers on your own servers can pick them too.'}
                        roles={mine}
                        store={myStore}
                        canAdd={mine.length < data.max}
                        addHint={`You have ${data.max} roles, the most you may save.`}
                    />
                )}
                {data && <RoleList title={'Panel-wide roles'} intro={'Made by your administrator, for everyone.'} roles={panel} store={null} />}
            </div>
        </PageContentBlock>
    );
}
