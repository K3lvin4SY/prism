import { useQuery } from '@tanstack/react-query';
import { http } from '@pterodactyl/sdk';
import { NamedIcon } from './icons';

/** The picture each installed extension ships as its icon, by id, as the admin extensions page shows it. */
function useExtensionIcons() {
    return useQuery({
        queryKey: ['prism-core', 'extension-icons'],
        queryFn: async () => {
            const { data } = await http.get<{ data: { id: string; icon_url: string | null }[] }>('/api/admin/extensions');

            return Object.fromEntries(data.data.filter((extension) => extension.icon_url).map((extension) => [extension.id, extension.icon_url!])) as Record<string, string>;
        },
        staleTime: 10 * 60_000,
    });
}

/**
 * An extension's own picture in its settings header, as tall as the name and two lines of
 * description beside it; its icon on a tile until the picture is known, or without one.
 */
export default function ExtensionMark({ id, icon }: { id: string; icon: string }) {
    const url = useExtensionIcons().data?.[id];

    return url ? (
        <img src={url} alt={''} className={'ppx:size-17 ppx:shrink-0 ppx:rounded-xl ppx:object-cover'} />
    ) : (
        <div className={'ppx:flex ppx:size-17 ppx:shrink-0 ppx:items-center ppx:justify-center ppx:rounded-xl ppx:bg-primary/15 ppx:text-primary'}>
            <NamedIcon name={icon} size={32} />
        </div>
    );
}
