import { Input, Select, Switch, TextArea, cn } from '@pterodactyl/sdk';
import type { Condition, Schedule, Step } from '../api';
import { MARKS, short } from '../steps';
import ConditionFields from './ConditionFields';

const VARIABLES = ['{server}', '{players}', '{max_players}', '{uptime}', '{date}', '{schedule}'];

function Field({ label, help, children }: { label: string; help?: React.ReactNode; children: React.ReactNode }) {
    return (
        <label className={'psc:flex psc:flex-col psc:gap-1 psc:text-sm'}>
            <span className={'psc:font-medium'}>{label}</span>
            {children}
            {help && <span className={'psc:text-xs psc:text-muted-foreground'}>{help}</span>}
        </label>
    );
}

const Variables = ({ extra = [] }: { extra?: string[] }) => (
    <>
        You can use{' '}
        {[...extra, ...VARIABLES].map((variable, index) => (
            <span key={variable}>
                {index > 0 && ', '}
                <code className={'psc:font-mono'}>{variable}</code>
            </span>
        ))}
        . Player counts work on Minecraft servers.
    </>
);

/** Seconds as a number with a unit picker. */
function Duration({ value, onChange, disabled, max }: { value: number; onChange: (seconds: number) => void; disabled: boolean; max: number }) {
    const unit = value % 3600 === 0 && value >= 3600 ? 3600 : value % 60 === 0 && value >= 60 ? 60 : 1;

    return (
        <div className={'psc:flex psc:items-center psc:gap-2'}>
            <Input type={'number'} min={1} value={value / unit} disabled={disabled} onChange={(event) => onChange(Math.min(max, Math.max(1, Math.round(Number(event.target.value) * unit))))} className={'psc:w-28'} />
            <div className={'psc:w-32'}>
                <Select
                    value={String(unit)}
                    disabled={disabled}
                    onChange={(next) => onChange(Math.min(max, Math.max(1, Math.round((value / unit) * Number(next)))))}
                    options={[
                        { value: '1', label: 'seconds' },
                        { value: '60', label: 'minutes' },
                        { value: '3600', label: 'hours' },
                    ]}
                />
            </div>
        </div>
    );
}

export default function StepFields({ step, onChange, schedules, disabled }: { step: Step; onChange: (step: Step) => void; schedules: Schedule[]; disabled: boolean }) {
    const config = step.config;
    const set = (patch: Record<string, unknown>) => onChange({ ...step, config: { ...config, ...patch } });

    switch (step.type) {
        case 'command':
            return (
                <Field label={'Command'} help={<Variables />}>
                    <Input value={config.command ?? ''} disabled={disabled} onChange={(event) => set({ command: event.target.value })} placeholder={'say Hello {server}'} className={'psc:font-mono'} />
                </Field>
            );

        case 'power':
            return (
                <div className={'psc:flex psc:flex-wrap psc:gap-2'}>
                    {(['start', 'stop', 'restart', 'kill'] as const).map((signal) => (
                        <button key={signal} type={'button'} disabled={disabled} onClick={() => set({ signal })} className={cn('psc:cursor-pointer psc:rounded-md psc:border psc:px-4 psc:py-2 psc:text-sm psc:capitalize', config.signal === signal ? 'psc:border-primary psc:bg-primary/15 psc:font-semibold psc:text-primary' : 'psc:border-border')}>
                            {signal}
                        </button>
                    ))}
                    {config.signal === 'kill' && <p className={'psc:w-full psc:text-xs psc:text-destructive'}>Kill ends the server at once, without saving. Use it only when stop does not work.</p>}
                </div>
            );

        case 'backup':
            return (
                <div className={'psc:grid psc:gap-4 psc:md:grid-cols-2'}>
                    <Field label={'Name'} help={'Empty uses the date and time. {date} works too.'}>
                        <Input value={config.name ?? ''} disabled={disabled} onChange={(event) => set({ name: event.target.value })} placeholder={'Nightly {date}'} />
                    </Field>
                    <Field label={'Prism Backups profile'} help={'Empty uses the default profile, or the .pteroignore.'}>
                        <Input value={config.profile ?? ''} disabled={disabled} onChange={(event) => set({ profile: event.target.value })} placeholder={'World only'} />
                    </Field>
                    <Switch checked={!!config.locked} disabled={disabled} onChange={(locked) => set({ locked })} label={'Lock the backup'} description={'Kept until it is unlocked; at the limit the oldest unlocked one is replaced.'} />
                </div>
            );

        case 'wait':
            return (
                <Field label={'Wait for'}>
                    <Duration value={Number(config.seconds ?? 60)} onChange={(seconds) => set({ seconds })} disabled={disabled} max={86400} />
                </Field>
            );

        case 'waitFor':
            return (
                <div className={'psc:flex psc:flex-wrap psc:gap-4'}>
                    <Field label={'Until the server is'}>
                        <div className={'psc:w-40'}>
                            <Select
                                value={config.state}
                                disabled={disabled}
                                onChange={(state) => set({ state })}
                                options={[
                                    { value: 'running', label: 'online' },
                                    { value: 'offline', label: 'offline' },
                                ]}
                            />
                        </div>
                    </Field>
                    <Field label={'Give up after'} help={'Then the step fails.'}>
                        <Duration value={Number(config.timeout ?? 300)} onChange={(timeout) => set({ timeout })} disabled={disabled} max={3600} />
                    </Field>
                </div>
            );

        case 'countdown': {
            const seconds = Number(config.seconds ?? 600);
            const marks: number[] = config.marks ?? [];

            return (
                <div className={'psc:flex psc:flex-col psc:gap-4'}>
                    <Field label={'Count down from'}>
                        <Duration value={seconds} onChange={(next) => set({ seconds: next })} disabled={disabled} max={7200} />
                    </Field>
                    <div className={'psc:flex psc:flex-col psc:gap-1 psc:text-sm'}>
                        <span className={'psc:font-medium'}>Announce at</span>
                        <div className={'psc:flex psc:flex-wrap psc:gap-1'}>
                            {MARKS.map((mark) => {
                                const on = marks.includes(mark);
                                const usable = mark <= seconds;

                                return (
                                    <button
                                        key={mark}
                                        type={'button'}
                                        disabled={disabled || !usable}
                                        onClick={() => set({ marks: on ? marks.filter((item) => item !== mark) : [...marks, mark].sort((a, b) => b - a) })}
                                        className={cn('psc:cursor-pointer psc:rounded-md psc:border psc:px-2 psc:py-1 psc:text-xs psc:tabular-nums psc:disabled:cursor-not-allowed psc:disabled:opacity-30', on && usable ? 'psc:border-primary psc:bg-primary psc:text-primary-foreground' : 'psc:border-border psc:text-muted-foreground')}
                                    >
                                        {short(mark)}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className={'psc:grid psc:gap-4 psc:md:grid-cols-2'}>
                        <Field label={'Message'} help={<Variables extra={['{time}']} />}>
                            <Input value={config.message ?? ''} disabled={disabled} onChange={(event) => set({ message: event.target.value })} placeholder={'The server restarts in {time}'} />
                        </Field>
                        <Field label={'Announce with'} help={<>The command that shows the message: say for Minecraft and Rust, broadcast for ARK. <code className={'psc:font-mono'}>{'{message}'}</code> is the message.</>}>
                            <Input value={config.command ?? 'say {message}'} disabled={disabled} onChange={(event) => set({ command: event.target.value })} className={'psc:font-mono'} />
                        </Field>
                    </div>
                </div>
            );
        }

        case 'discord':
            return (
                <div className={'psc:flex psc:flex-col psc:gap-4'}>
                    <Field label={'Webhook address'} help={config.webhookSet ? 'A webhook is saved. Leave this empty to keep it.' : 'Channel settings → Integrations → Webhooks → Copy webhook URL.'}>
                        <Input type={'password'} autoComplete={'off'} value={config.webhook ?? ''} disabled={disabled} onChange={(event) => set({ webhook: event.target.value })} placeholder={config.webhookSet ? '•••••••• saved' : 'https://discord.com/api/webhooks/…'} />
                    </Field>
                    <Field label={'Message'} help={<Variables />}>
                        <TextArea rows={3} value={config.content ?? ''} disabled={disabled} onChange={(event) => set({ content: event.target.value })} placeholder={'**{server}** restarts in 10 minutes.'} />
                    </Field>
                    <Field label={'Name to post as'} help={'Empty uses the webhook\'s own.'}>
                        <Input value={config.username ?? ''} disabled={disabled} onChange={(event) => set({ username: event.target.value })} className={'psc:max-w-xs'} />
                    </Field>
                </div>
            );

        case 'run':
            return (
                <Field label={'Schedule to start'} help={'It runs on its own; this one carries on straight away.'}>
                    <div className={'psc:max-w-sm'}>
                        <Select value={config.schedule ? String(config.schedule) : ''} disabled={disabled} onChange={(value) => set({ schedule: value ? Number(value) : null })} options={[{ value: '', label: 'Pick a schedule' }, ...schedules.map((item) => ({ value: String(item.id), label: item.name }))]} />
                    </div>
                </Field>
            );

        case 'if':
            return (
                <Field label={'If'} help={'The steps under Then run when it holds, those under Else when it does not.'}>
                    <ConditionFields condition={config as Condition} onChange={(condition) => onChange({ ...step, config: condition })} minecraft disabled={disabled} />
                </Field>
            );
    }
}
