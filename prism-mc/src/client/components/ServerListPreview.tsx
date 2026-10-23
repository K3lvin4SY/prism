import McText from './McText';

interface Props {
    name: string;
    motd: string;
    icon: string | null;
    online: number;
    max: number;
    onLineClick?: (line: number) => void;
}

function SignalBars() {
    return (
        <span className={'mcs:inline-flex mcs:items-end mcs:gap-[2px] mcs:h-4'} aria-hidden>
            {[5, 8, 11, 14, 16].map((height) => (
                <span key={height} className={'mcs:w-[3px] mcs:bg-[#55FF55]'} style={{ height }} />
            ))}
        </span>
    );
}

/** The server as it appears in the multiplayer screen. */
export default function ServerListPreview({ name, motd, icon, online, max, onLineClick }: Props) {
    const lines = motd.split('\n');

    return (
        <div className={'mcs-serverlist mcs-font mcs-text-shadow mcs:flex mcs:gap-3 mcs:rounded-md mcs:p-3 mcs:overflow-x-auto'}>
            {icon ? (
                <img src={icon} alt={''} width={64} height={64} className={'mcs-pixelated mcs:size-16 mcs:shrink-0'} />
            ) : (
                <div className={'mcs:size-16 mcs:shrink-0 mcs:bg-[#3a3a3a] mcs:flex mcs:items-center mcs:justify-center mcs:text-2xl mcs:text-[#aaa]'}>?</div>
            )}
            <div className={'mcs:min-w-0 mcs:flex-1 mcs:text-[15px] mcs:leading-[20px]'}>
                <div className={'mcs:flex mcs:justify-between mcs:gap-4'}>
                    <span className={'mcs:text-white mcs:truncate'}>{name}</span>
                    <span className={'mcs:flex mcs:items-center mcs:gap-2 mcs:shrink-0'}>
                        <span className={'mcs:text-[#AAAAAA]'}>
                            {online}
                            <span className={'mcs:text-[#555555]'}>/</span>
                            {max}
                        </span>
                        <SignalBars />
                    </span>
                </div>
                {[0, 1].map((line) => (
                    <button
                        key={line}
                        type={'button'}
                        onClick={() => onLineClick?.(line)}
                        className={'mcs:block mcs:w-full mcs:text-left mcs:min-h-[20px] mcs:cursor-text mcs:whitespace-pre mcs:bg-transparent mcs:p-0 mcs:border-0'}
                        title={onLineClick ? `Edit line ${line + 1}` : undefined}
                    >
                        <McText text={lines[line] ?? ''} />
                    </button>
                ))}
            </div>
        </div>
    );
}
