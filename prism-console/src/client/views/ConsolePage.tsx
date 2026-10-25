import { useState, type ReactNode } from 'react';
import { Alert, ServerContentBlock, cn } from '@pterodactyl/sdk';
import { Slot, View, type ViewProps } from '@pterodactyl/sdk/theme';
import { useConsoleData, usePreferences, type Area, type WidgetId } from '../api';
import SettingsDialog from '../components/SettingsDialog';
import TerminalWidget from '../components/TerminalWidget';
import { Charts, Info, PullCard, QuickCommands, Tiles } from '../components/Widgets';
import { applyConfig, getConfig, type TerminalSettings } from '../config';
import { LAYOUTS, normaliseCustom } from '../layouts';
import { storeFor, useStore } from '../store';

/** How much of a stretched column's spare height a widget takes, by how many boxes it has. */
const GROW: Partial<Record<WidgetId, number>> = { terminal: 1, tiles: 5, charts: 3, info: 1, quick: 1 };

const NOTICES = {
    maintenance: 'This node is under maintenance, so the server cannot be controlled.',
    installing: 'The server is installing; most actions wait until it finishes.',
    transferring: 'The server is moving to another node.',
};

/** Prism Console: the console as a grid of widgets in the layout each person picks. */
export default function ConsolePage({ model, active, Default }: ViewProps<'page.server.console'>) {
    const data = useConsoleData(model.server.attributes.identifier);
    applyConfig(data.data?.config);
    const config = getConfig();
    if (!config.enabled) return <Default />;

    return <PrismConsole model={model} active={active} />;
}

function PrismConsole({ model, active }: Pick<ViewProps<'page.server.console'>, 'model' | 'active'>) {
    const config = getConfig();
    const server = model.server;
    const store = useStore(storeFor(server.attributes.uuid, config.maxLines));
    const { preferences, update } = usePreferences(server.attributes.identifier);
    const [settingsOpen, setSettingsOpen] = useState(false);
    // Changes made from the toolbar when the admin does not let people keep their own settings.
    const [local, setLocal] = useState<Partial<TerminalSettings>>({});

    const layoutId = config.allow.layouts && preferences.layout ? preferences.layout : config.defaultLayout;
    const preset = LAYOUTS[layoutId === 'custom' ? config.defaultLayout : layoutId];
    const widgets = layoutId === 'custom' ? normaliseCustom(preferences.custom, preset.widgets) : preset.widgets;
    const terminal: TerminalSettings = { ...config.terminal, ...(config.allow.terminal ? preferences.terminal : {}), ...local };
    const highlights = [config.highlights, ...(config.allow.highlights && preferences.highlights ? [preferences.highlights] : [])];
    const quick = config.features.quickCommands ? [...config.quickCommands, ...(config.allow.quickCommands ? (preferences.quickCommands ?? []) : [])] : [];

    const setTerminal = (patch: Partial<TerminalSettings>) => (config.allow.terminal ? update({ terminal: { ...preferences.terminal, ...patch } }) : setLocal({ ...local, ...patch }));

    const render = (widget: WidgetId, area: Area): ReactNode => {
        const vertical = area === 'side';
        switch (widget) {
            case 'terminal':
                return (
                    <TerminalWidget
                        server={server}
                        store={store}
                        settings={terminal}
                        onSettings={setTerminal}
                        highlights={highlights}
                        hiddenLevels={preferences.hiddenLevels ?? []}
                        onHiddenLevels={(hiddenLevels) => update({ hiddenLevels })}
                        onOpenSettings={() => setSettingsOpen(true)}
                        tall={preset.tall && layoutId !== 'custom'}
                        compact={preset.compact && layoutId !== 'custom'}
                    />
                );
            case 'power':
                return <View name={'server.power'} />;
            case 'tiles':
                return <Tiles server={server} store={store} vertical={vertical} compact={preset.compact && layoutId !== 'custom'} sparklines={!showsCharts} />;
            case 'charts':
                return config.features.charts ? <Charts server={server} store={store} vertical={vertical} /> : null;
            case 'info':
                return <Info server={server} store={store} />;
            case 'quick':
                return <QuickCommands server={server} commands={quick} compact={preset.compact && layoutId !== 'custom'} />;
        }
    };

    // With the chart cards on screen, the tiles leave out their own small graphs.
    const showsCharts = config.features.charts && widgets.some((entry) => entry.widget === 'charts' && entry.area !== 'hidden');
    /*
     * Beside each other, the main and side columns are as tall as the taller one: the terminal
     * grows, and in the side column the boxes share what is left, a widget with more boxes taking
     * more. The power buttons keep their size.
     */
    const area = (name: Area) =>
        widgets
            .filter((entry) => entry.area === name)
            .map((entry) => {
                const grow = (name === 'main' || name === 'side') && entry.widget !== 'power' ? (GROW[entry.widget] ?? 1) : 0;

                return (
                    <div key={entry.widget} className={grow ? 'pcn:flex pcn:min-h-0 pcn:flex-col' : undefined} style={grow ? { flexGrow: grow } : undefined}>
                        {render(entry.widget, name)}
                    </div>
                );
            });
    const side = area('side');
    const bottom = area('bottom');

    return (
        <ServerContentBlock title={active ? 'Console' : undefined} className={cn(config.fullWidth && 'pcn:[--layout-content-width:100%]')}>
            <div className={'pcn-console pcn:flex pcn:flex-col pcn:gap-4'}>
                {config.keepHeader && (
                    <div>
                        <h1 className={'pcn:text-xl pcn:font-semibold'}>{model.name}</h1>
                        {model.description && <p className={'pcn:text-sm pcn:text-muted-foreground'}>{model.description}</p>}
                    </div>
                )}
                {model.notice && <Alert type={'warning'}>{NOTICES[model.notice]}</Alert>}
                <Slot name={'server.console.before'} data={model.server} />
                {config.features.pullProgress && store.pullProgress && <PullCard store={store} />}
                {area('top')}
                <div className={cn('pcn:grid pcn:gap-4', side.length > 0 && (preset.compact ? 'pcn:lg:grid-cols-[minmax(0,1fr)_16rem]' : 'pcn:lg:grid-cols-[minmax(0,1fr)_19rem]'))}>
                    <div className={'pcn:flex pcn:min-w-0 pcn:flex-col pcn:gap-4'}>{area('main')}</div>
                    {side.length > 0 && <div className={'pcn:flex pcn:min-w-0 pcn:flex-col pcn:gap-3'}>{side}</div>}
                </div>
                {bottom.length > 0 && <div className={cn('pcn:flex pcn:flex-col pcn:gap-3', preset.compact && 'pcn:lg:flex-row pcn:lg:flex-wrap pcn:lg:items-start [&>*]:pcn:min-w-0')}>{bottom}</div>}
                <Slot name={'server.console.after'} data={model.server} />
                {model.features.map((name) => (
                    <View key={name} name={name} />
                ))}
            </div>
            {settingsOpen && (
                <SettingsDialog
                    preferences={preferences}
                    terminal={terminal}
                    layout={layoutId}
                    onChange={(patch) => {
                        if ('terminal' in patch) setLocal({});
                        update(patch);
                    }}
                    onClose={() => setSettingsOpen(false)}
                />
            )}
        </ServerContentBlock>
    );
}
