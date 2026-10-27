import type { PrismId } from './api';

/**
 * How Prism Properties draws each setting beyond what the schema says: slider ranges, the
 * section a field sits in, and the structured editors for settings stored as JSON.
 */
export interface Hint {
    /** A heading the field is grouped under inside its tab. */
    section?: string;
    slider?: { min: number; max: number; step?: number; unit?: string };
    editor?: 'highlights' | 'quickCommands' | 'lines' | 'keybinds' | 'datetime' | 'authProviders';
    /** Draw a select as buttons side by side. */
    segmented?: boolean;
}

export const HINTS: Record<PrismId, Record<string, Hint>> = {
    'prism-layout': {
        enabled: { section: 'Prism Layout' },
        bars: { section: 'Bars' },
        bars_tablet: { section: 'Bars' },
        bars_mobile: { section: 'Bars' },
        sidebar_width: { section: 'Bars', slider: { min: 12, max: 22, unit: ' rem' } },
        dock_magnify: { section: 'Bars' },
        group_nav: { section: 'In the navigation' },
        server_card: { section: 'In the navigation' },
        scheme_switch: { section: 'In the navigation' },
        admin_styled: { section: 'Admin area' },
        dashboard_panel: { section: 'In the navigation' },
        sidebar_collapse: { section: 'Bars' },
        brand_place: { section: 'Top bar', segmented: true },
        width: { segmented: true },
        density: { segmented: true },
        status_style: { segmented: true },
        usage_style: { segmented: true },
        logo: { section: 'Top bar' },
        logo_mode: { section: 'Top bar', segmented: true },
        logo_height: { section: 'Top bar', slider: { min: 16, max: 64, unit: 'px' } },
        logo_square: { section: 'Narrow places' },
        favicon: { section: 'Browser tab' },
        login_style: { section: 'The page', segmented: true },
        login_image: { section: 'The page' },
        login_tagline: { section: 'The page' },
        login_mark: { section: 'On the card', segmented: true },
        login_logo_size: { section: 'On the card', slider: { min: 48, max: 320, step: 4, unit: 'px' } },
        announce_level: { segmented: true },
        announce_style: { segmented: true },
        announce_audience: { segmented: true },
        announce_from: { section: 'When', editor: 'datetime' },
        announce_until: { section: 'When', editor: 'datetime' },
        announce_dismiss: { section: 'When' },
    },
    'prism-console': {
        enabled: { section: 'The console' },
        full_width: { section: 'The console' },
        keep_header: { section: 'The console' },
        floating_progress: { section: 'The console' },
        max_lines: { section: 'Limits', slider: { min: 200, max: 20000, step: 100 } },
        history_limit: { section: 'Limits', slider: { min: 10, max: 500, step: 5 } },
        allow_terminal_settings: { section: 'What people may change' },
        allow_layouts: { section: 'What people may change' },
        allow_highlights: { section: 'What people may change' },
        allow_quick_commands: { section: 'What people may change' },
        default_layout: { segmented: true },
        default_font_size: { slider: { min: 9, max: 24, unit: 'px' } },
        default_line_height: { segmented: true },
        highlights: { editor: 'highlights' },
        quick_commands: { editor: 'quickCommands' },
    },
    'prism-files': {
        enabled: { section: 'Features' },
        workbench: { section: 'Features' },
        monaco_edit_page: { section: 'Features' },
        trash: { section: 'Features' },
        open_on: { section: 'Defaults', segmented: true },
        default_view: { section: 'Defaults', segmented: true },
        editor_theme: { segmented: true },
        editor_font_size: { slider: { min: 9, max: 24, unit: 'px' } },
        editor_tab_size: { slider: { min: 1, max: 8 } },
        editor_autosave: { segmented: true },
        trash_days: { slider: { min: 1, max: 90, unit: ' days' } },
        max_edit_mb: { slider: { min: 1, max: 50, unit: ' MB' } },
        max_upload_mb: { slider: { min: 1, max: 10240, step: 1, unit: ' MB' } },
        parallel_uploads: { slider: { min: 1, max: 8 } },
        hidden_paths: { editor: 'lines' },
        protected_paths: { editor: 'lines' },
        keybinds: { editor: 'keybinds' },
    },
    'prism-database': {
        max_rows_page: { slider: { min: 10, max: 1000, step: 10 } },
        sql_max_rows: { slider: { min: 10, max: 10000, step: 10 } },
        sql_timeout: { slider: { min: 1, max: 300, unit: ' s' } },
        import_max_mb: { slider: { min: 1, max: 2048, unit: ' MB' } },
        export_keep_hours: { slider: { min: 1, max: 168, unit: ' h' } },
        backup_fastest: { segmented: true },
        backup_max_keep: { slider: { min: 1, max: 200 } },
        backup_max_mb: { slider: { min: 10, max: 102400, step: 10, unit: ' MB' } },
    },
    'prism-backups': {
        max_profiles: { slider: { min: 1, max: 50 } },
        browse_max_mb: { slider: { min: 10, max: 102400, step: 10, unit: ' MB' } },
        restore_max_mb: { slider: { min: 1, max: 20480, step: 1, unit: ' MB' } },
        cache_hours: { slider: { min: 1, max: 72, unit: ' h' } },
    },
    'prism-schedules': {
        default_view: { segmented: true },
        max_schedules: { slider: { min: 1, max: 200 } },
        max_steps: { slider: { min: 1, max: 200 } },
        history_days: { slider: { min: 1, max: 90, unit: ' days' } },
    },
    'prism-mc': {
        modpack_max_mb: { slider: { min: 10, max: 4000, step: 10, unit: ' MB' } },
        ping_timeout: { slider: { min: 0.5, max: 10, step: 0.5, unit: ' s' } },
    },
    'prism-terraria': {
        max_world_mb: { slider: { min: 4, max: 512, step: 4, unit: ' MB' } },
    },
    'prism-corekeeper': {
        egg_tags: { section: 'Detection' },
        modio_api_key: { section: 'Where mods come from' },
        steam_api_key: { section: 'Where mods come from' },
        steam_username: { section: 'Steam Workshop downloads' },
        steam_password: { section: 'Steam Workshop downloads' },
    },
    'prism-auth': {
        button_style: { segmented: true },
        link_by_email: { section: 'Existing accounts' },
        link_admins: { section: 'Existing accounts' },
        auto_create: { section: 'New people' },
        signup_enabled: { section: 'The form' },
        signup_username: { section: 'The form', segmented: true },
        signup_names: { section: 'The form' },
        terms_url: { section: 'The form' },
        password_min: { section: 'Passwords', slider: { min: 8, max: 64 } },
        password_mixed: { section: 'Passwords' },
        password_number: { section: 'Passwords' },
        domains_allowed: { section: 'Email domains', editor: 'lines' },
        domains_blocked: { section: 'Email domains', editor: 'lines' },
        bot_trap: { section: 'Bots and limits' },
        turnstile_site_key: { section: 'Bots and limits' },
        turnstile_secret: { section: 'Bots and limits' },
        limit_per_hour: { section: 'Bots and limits', slider: { min: 1, max: 100 } },
        verify_hours: { section: 'Bots and limits', slider: { min: 1, max: 168, unit: ' h' } },
        providers: { editor: 'authProviders' },
    },
};

/** Prism Console's built-in highlight rules, in the order they are listed. */
export const BUILTIN_HIGHLIGHTS: { key: string; label: string; color: string }[] = [
    { key: 'errors', label: 'Errors', color: '#f87171' },
    { key: 'warnings', label: 'Warnings', color: '#fbbf24' },
    { key: 'joins', label: 'Player joins and leaves', color: '#4ade80' },
    { key: 'chat', label: 'Chat', color: '#93c5fd' },
    { key: 'ready', label: 'Server ready', color: '#34d399' },
    { key: 'info', label: 'Info lines', color: '#cbd5e1' },
    { key: 'debug', label: 'Debug lines', color: '#94a3b8' },
    { key: 'ips', label: 'IP addresses', color: '#c084fc' },
];

export const KEYBIND_ACTIONS: Record<string, string> = {
    save: 'Save',
    saveAll: 'Save all',
    quickOpen: 'Quick open',
    commandPalette: 'Command palette',
    closeTab: 'Close tab',
    reopenTab: 'Reopen closed tab',
    toggleExplorer: 'Show or hide the explorer',
    goToLine: 'Go to line',
};
