import type { Area, CustomLayout, WidgetId } from './api';
import type { LayoutId } from './config';

export const WIDGETS: Record<WidgetId, string> = {
    terminal: 'Terminal, quick commands and command line',
    power: 'Power buttons',
    info: 'Server info',
    tiles: 'Usage tiles',
    charts: 'Live charts',
};

export const AREAS: Record<Area, string> = { top: 'Top', main: 'Main', side: 'Side column', bottom: 'Bottom', hidden: 'Hidden' };

export const LAYOUTS: Record<LayoutId, { label: string; description: string; widgets: CustomLayout; compact?: boolean }> = {
    classic: {
        label: 'Classic',
        description: 'terminal with a stats column',
        widgets: [
            { widget: 'terminal', area: 'main' },
            { widget: 'power', area: 'side' },
            { widget: 'tiles', area: 'side' },
            { widget: 'info', area: 'side' },
            { widget: 'charts', area: 'bottom' },
        ],
    },
    dashboard: {
        label: 'Dashboard',
        description: 'usage tiles across the top',
        widgets: [
            { widget: 'tiles', area: 'top' },
            { widget: 'terminal', area: 'main' },
            { widget: 'power', area: 'side' },
            { widget: 'info', area: 'side' },
            { widget: 'charts', area: 'bottom' },
        ],
    },
    side: {
        label: 'Side panel',
        description: 'controls and usage on the right',
        widgets: [
            { widget: 'terminal', area: 'main' },
            { widget: 'power', area: 'side' },
            { widget: 'info', area: 'side' },
            { widget: 'tiles', area: 'side' },
            { widget: 'charts', area: 'side' },
        ],
    },
    monitor: {
        label: 'Monitor',
        description: 'live charts first',
        widgets: [
            { widget: 'charts', area: 'top' },
            { widget: 'tiles', area: 'top' },
            { widget: 'terminal', area: 'main' },
            { widget: 'power', area: 'side' },
            { widget: 'info', area: 'side' },
        ],
    },
    focus: {
        label: 'Focus',
        description: 'the power buttons, a large terminal and the live charts below',
        widgets: [
            { widget: 'power', area: 'top' },
            { widget: 'terminal', area: 'main' },
            { widget: 'charts', area: 'bottom' },
        ],
    },
    compact: {
        label: 'Compact',
        description: 'everything small and close',
        compact: true,
        widgets: [
            { widget: 'terminal', area: 'main' },
            { widget: 'power', area: 'bottom' },
            { widget: 'tiles', area: 'bottom' },
            { widget: 'charts', area: 'bottom' },
        ],
    },
};

/** Completes a custom layout with any widget it leaves out, hidden. */
export function normaliseCustom(custom: CustomLayout | undefined, fallback: CustomLayout): CustomLayout {
    const list = (custom ?? fallback).filter((entry, index, all) => entry.widget in WIDGETS && all.findIndex((other) => other.widget === entry.widget) === index);
    for (const widget of Object.keys(WIDGETS) as WidgetId[]) {
        if (!list.some((entry) => entry.widget === widget)) list.push({ widget, area: 'hidden' });
    }

    return list;
}
