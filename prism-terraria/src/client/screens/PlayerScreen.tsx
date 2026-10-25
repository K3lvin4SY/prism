import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Alert,
    Badge,
    Button,
    Dialog,
    PanelLink,
    Select,
    ServerContentBlock,
    Spinner,
    TitledGreyBox,
    cn,
    formatDate,
    httpErrorToHuman,
    toast,
    type ScreenComponentProps,
} from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { getAccount, playerAction, playerKeys, type CharacterItem, type PlayerAction } from '../api/players';
import { GiveDialog, ReasonDialog } from '../components/players/ActionDialogs';
import ItemSlot from '../components/players/ItemSlot';
import { useTerrariaInfo } from '../hooks/useTerrariaInfo';

/** TShock's slot ranges for a 1.4.5 character (TShockAPI/NetItem.cs). */
const RANGES = {
    inventory: [0, 50],
    coins: [50, 54],
    ammo: [54, 58],
    armour: [59, 62],
    accessories: [62, 69],
    vanity: [69, 72],
    vanityAccessories: [72, 79],
    dyes: [79, 89],
    equipment: [89, 94],
    equipmentDyes: [94, 99],
    piggy: [99, 139],
    safe: [139, 179],
    trash: [179, 180],
    forge: [180, 220],
    void: [220, 260],
} as const;

type Storage = 'inventory' | 'equipment' | 'piggy' | 'safe' | 'forge' | 'void';

function Slots({ items, range, columns = 10, accent }: { items: Map<number, CharacterItem>; range: readonly [number, number]; columns?: number; accent?: 'armour' | 'vanity' | 'dye' }) {
    return (
        <div className={'trs:grid trs:gap-1'} style={{ gridTemplateColumns: `repeat(${columns}, 2.75rem)` }}>
            {Array.from({ length: range[1] - range[0] }, (_, index) => (
                <ItemSlot key={index} item={items.get(range[0] + index)} accent={accent} />
            ))}
        </div>
    );
}

function Bar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
    return (
        <div className={'trs:flex trs:flex-col trs:gap-1'}>
            <div className={'trs:flex trs:justify-between trs:text-xs'}>
                <span className={'trs:text-muted-foreground'}>{label}</span>
                <span>
                    {value} / {max}
                </span>
            </div>
            <div className={'trs:h-2 trs:overflow-hidden trs:rounded-full trs:bg-muted'}>
                <div className={'trs:h-full trs:rounded-full'} style={{ width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%`, background: color }} />
            </div>
        </div>
    );
}

export default function PlayerScreen({ data: route }: ScreenComponentProps) {
    const { identifier } = useTerrariaInfo();
    const queryClient = useQueryClient();
    const id = Number(route.params.player ?? 0);
    const details = useQuery({ queryKey: playerKeys.account(identifier, id), queryFn: () => getAccount(identifier, id), refetchInterval: 30_000 });
    const [storage, setStorage] = useState<Storage>('inventory');
    const [pending, setPending] = useState<{ title: string; confirm: string; withDuration?: boolean; build: (reason: string, duration?: string) => PlayerAction } | null>(null);
    const [giving, setGiving] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const refresh = () => queryClient.invalidateQueries({ queryKey: ['prism-terraria', identifier, 'players'] });
    const run = async (action: PlayerAction, success: string) => {
        try {
            await playerAction(identifier, action);
            toast.success(success);
            refresh();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        }
    };

    if (details.isLoading) {
        return (
            <ServerContentBlock title={'Player'}>
                <Spinner centered />
            </ServerContentBlock>
        );
    }

    if (details.isError || !details.data) {
        return (
            <ServerContentBlock title={'Player'}>
                <Alert type={'danger'}>{httpErrorToHuman(details.error)}</Alert>
            </ServerContentBlock>
        );
    }

    const { account, character, groups, bans, online, canManage } = details.data;
    const items = new Map((character?.items ?? []).map((item) => [item.slot, item]));

    return (
        <ServerContentBlock title={account.name}>
            <div className={'trs:flex trs:flex-col trs:gap-4'}>
                <PanelLink
                    destination={{ extension: 'prism-terraria', screen: 'players', params: { id: identifier } }}
                    className={'trs:inline-flex trs:items-center trs:gap-1 trs:text-sm trs:text-muted-foreground trs:hover:text-foreground'}
                >
                    <NamedIcon name={'arrow-left'} size={14} /> All players
                </PanelLink>

                <div className={'trs:grid trs:gap-4 trs:lg:grid-cols-[1fr_320px]'}>
                    <div className={'trs:flex trs:flex-col trs:gap-4 trs:min-w-0'}>
                        <div className={'pt-surface trs:flex trs:flex-wrap trs:items-center trs:gap-4 trs:rounded-md trs:border trs:border-border trs:bg-card trs:p-4'}>
                            <span className={'trs:flex trs:size-12 trs:items-center trs:justify-center trs:rounded-lg trs:bg-primary/15 trs:text-primary'}>
                                <NamedIcon name={'user'} size={22} />
                            </span>
                            <div className={'trs:min-w-0 trs:flex-1'}>
                                <div className={'trs:flex trs:flex-wrap trs:items-center trs:gap-2'}>
                                    <span className={'trs:text-lg trs:font-semibold'}>{account.name}</span>
                                    <Badge size={'sm'} tone={'neutral'}>
                                        {account.group}
                                    </Badge>
                                    {online && (
                                        <Badge size={'sm'} tone={'success'}>
                                            Online
                                        </Badge>
                                    )}
                                    {bans.length > 0 && (
                                        <Badge size={'sm'} tone={'danger'}>
                                            Banned
                                        </Badge>
                                    )}
                                </div>
                                <p className={'trs:text-xs trs:text-muted-foreground'}>
                                    {account.registered && `Registered ${formatDate(account.registered, 'MMM D, YYYY')}`}
                                    {account.lastSeen && ` · last seen ${formatDate(account.lastSeen, 'MMM D, YYYY HH:mm')}`}
                                    {account.ips.length > 0 && ` · ${account.ips.length} known address${account.ips.length === 1 ? '' : 'es'}`}
                                </p>
                            </div>
                        </div>

                        {!character ? (
                            <Alert type={'info'}>This account has no server-side character. Turn on server-side characters in Properties; the character is saved the next time they play.</Alert>
                        ) : (
                            <TitledGreyBox title={'Character'}>
                                <div className={'trs:flex trs:flex-col trs:gap-4'}>
                                    <div className={'trs:grid trs:gap-3 trs:sm:grid-cols-2'}>
                                        <Bar value={character.health} max={character.maxHealth} color={'#e0323c'} label={'Health'} />
                                        <Bar value={character.mana} max={character.maxMana} color={'#3c6ee0'} label={'Mana'} />
                                    </div>
                                    <div className={'trs:flex trs:flex-wrap trs:gap-2 trs:text-xs trs:text-muted-foreground'}>
                                        <span>{character.questsCompleted} angler quests</span>
                                        <span>· {character.deaths.pve} deaths</span>
                                        {character.deaths.pvp > 0 && <span>· {character.deaths.pvp} PvP deaths</span>}
                                        <span>· loadout {character.loadout + 1}</span>
                                        {character.upgrades.length > 0 && <span>· {character.upgrades.join(', ')}</span>}
                                    </div>

                                    <div className={'trs:flex trs:flex-wrap trs:gap-1'}>
                                        {(
                                            [
                                                ['inventory', 'Inventory'],
                                                ['equipment', 'Equipment'],
                                                ['piggy', 'Piggy bank'],
                                                ['safe', 'Safe'],
                                                ['forge', "Defender's Forge"],
                                                ['void', 'Void Vault'],
                                            ] as [Storage, string][]
                                        ).map(([value, label]) => (
                                            <button
                                                key={value}
                                                type={'button'}
                                                onClick={() => setStorage(value)}
                                                className={cn(
                                                    'prism-switch-item trs:rounded-md trs:px-3 trs:py-1.5 trs:text-sm trs:cursor-pointer',
                                                    storage === value ? 'trs:bg-primary trs:text-primary-foreground' : 'trs:hover:bg-muted'
                                                )}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>

                                    <div className={'trs:overflow-x-auto'}>
                                        {storage === 'inventory' && (
                                            <div className={'trs:flex trs:flex-wrap trs:gap-4'}>
                                                <Slots items={items} range={RANGES.inventory} />
                                                <div className={'trs:flex trs:gap-2'}>
                                                    <div className={'trs:flex trs:flex-col trs:gap-1'}>
                                                        <span className={'trs:text-xs trs:text-muted-foreground'}>Coins</span>
                                                        <Slots items={items} range={RANGES.coins} columns={1} />
                                                    </div>
                                                    <div className={'trs:flex trs:flex-col trs:gap-1'}>
                                                        <span className={'trs:text-xs trs:text-muted-foreground'}>Ammo</span>
                                                        <Slots items={items} range={RANGES.ammo} columns={1} />
                                                    </div>
                                                    <div className={'trs:flex trs:flex-col trs:gap-1'}>
                                                        <span className={'trs:text-xs trs:text-muted-foreground'}>Trash</span>
                                                        <Slots items={items} range={RANGES.trash} columns={1} />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {storage === 'equipment' && (
                                            <div className={'trs:flex trs:flex-wrap trs:gap-6'}>
                                                <div className={'trs:flex trs:gap-1'}>
                                                    <div className={'trs:flex trs:flex-col trs:gap-1'}>
                                                        <span className={'trs:text-xs trs:text-muted-foreground'}>Dyes</span>
                                                        <Slots items={items} range={[RANGES.dyes[0], RANGES.dyes[0] + 10]} columns={1} accent={'dye'} />
                                                    </div>
                                                    <div className={'trs:flex trs:flex-col trs:gap-1'}>
                                                        <span className={'trs:text-xs trs:text-muted-foreground'}>Vanity</span>
                                                        <Slots items={items} range={RANGES.vanity} columns={1} accent={'vanity'} />
                                                        <Slots items={items} range={RANGES.vanityAccessories} columns={1} accent={'vanity'} />
                                                    </div>
                                                    <div className={'trs:flex trs:flex-col trs:gap-1'}>
                                                        <span className={'trs:text-xs trs:text-muted-foreground'}>Armour</span>
                                                        <Slots items={items} range={RANGES.armour} columns={1} accent={'armour'} />
                                                        <Slots items={items} range={RANGES.accessories} columns={1} accent={'armour'} />
                                                    </div>
                                                </div>
                                                <div className={'trs:flex trs:gap-1'}>
                                                    <div className={'trs:flex trs:flex-col trs:gap-1'}>
                                                        <span className={'trs:text-xs trs:text-muted-foreground'}>Dyes</span>
                                                        <Slots items={items} range={RANGES.equipmentDyes} columns={1} accent={'dye'} />
                                                    </div>
                                                    <div className={'trs:flex trs:flex-col trs:gap-1'}>
                                                        <span className={'trs:text-xs trs:text-muted-foreground'}>Pet, light, cart, mount, hook</span>
                                                        <Slots items={items} range={RANGES.equipment} columns={1} />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {storage === 'piggy' && <Slots items={items} range={RANGES.piggy} />}
                                        {storage === 'safe' && <Slots items={items} range={RANGES.safe} />}
                                        {storage === 'forge' && <Slots items={items} range={RANGES.forge} />}
                                        {storage === 'void' && <Slots items={items} range={RANGES.void} />}
                                    </div>
                                </div>
                            </TitledGreyBox>
                        )}
                    </div>

                    <div className={'trs:flex trs:flex-col trs:gap-4'}>
                        {canManage && (
                            <TitledGreyBox title={'Account'}>
                                <div className={'trs:flex trs:flex-col trs:gap-3'}>
                                    <label className={'trs:flex trs:flex-col trs:gap-1'}>
                                        <span className={'trs:text-xs trs:uppercase trs:tracking-wide trs:text-muted-foreground'}>Group</span>
                                        <Select
                                            value={account.group}
                                            onChange={(group) => run({ action: 'group', account: account.name, group: String(group) }, `${account.name} is now in ${group}.`)}
                                            options={groups.map((group) => ({ value: group, label: group }))}
                                        />
                                    </label>
                                    {bans.length > 0 ? (
                                        bans.map((ban) => (
                                            <Button key={ban.ticket} isSecondary onClick={() => run({ action: 'unban', ticket: ban.ticket }, 'Ban lifted.')}>
                                                Lift ban: {ban.reason}
                                            </Button>
                                        ))
                                    ) : (
                                        <Button.Danger
                                            onClick={() =>
                                                setPending({
                                                    title: `Ban the account ${account.name}`,
                                                    confirm: 'Ban',
                                                    withDuration: true,
                                                    build: (reason, duration) => ({ action: 'ban', account: account.name, reason, duration }),
                                                })
                                            }
                                        >
                                            Ban account
                                        </Button.Danger>
                                    )}
                                    <Button.Danger isSecondary onClick={() => setDeleting(true)}>
                                        Delete account
                                    </Button.Danger>
                                </div>
                            </TitledGreyBox>
                        )}

                        {canManage && online && (
                            <TitledGreyBox title={'In game'}>
                                <div className={'trs:grid trs:grid-cols-2 trs:gap-2'}>
                                    <Button isSecondary onClick={() => run({ action: 'heal', name: account.name }, 'Healed.')}>
                                        Heal
                                    </Button>
                                    <Button isSecondary onClick={() => setGiving(true)}>
                                        Give item
                                    </Button>
                                    <Button isSecondary onClick={() => run({ action: 'godmode', name: account.name }, 'God mode toggled.')}>
                                        God mode
                                    </Button>
                                    <Button.Danger isSecondary onClick={() => setPending({ title: `Kick ${account.name}`, confirm: 'Kick', build: (reason) => ({ action: 'kick', name: account.name, reason }) })}>
                                        Kick
                                    </Button.Danger>
                                </div>
                            </TitledGreyBox>
                        )}
                    </div>
                </div>
            </div>

            {pending && (
                <ReasonDialog
                    server={identifier}
                    title={pending.title}
                    confirm={pending.confirm}
                    withDuration={pending.withDuration}
                    build={pending.build}
                    onClose={() => setPending(null)}
                    onDone={() => {
                        setPending(null);
                        refresh();
                    }}
                />
            )}
            {giving && <GiveDialog server={identifier} player={account.name} onClose={() => setGiving(false)} />}
            <Dialog.Confirm
                open={deleting}
                onClose={() => setDeleting(false)}
                title={`Delete ${account.name}?`}
                confirm={'Delete account'}
                onConfirmed={async () => {
                    await run({ action: 'delete-account', account: account.name }, 'Account deleted.');
                    setDeleting(false);
                }}
            >
                The account and its server-side character are removed from TShock. The player can register again.
            </Dialog.Confirm>
        </ServerContentBlock>
    );
}
