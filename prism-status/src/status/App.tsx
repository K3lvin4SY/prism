import { useEffect, useState } from 'react';
import { getSummary, type Component, type Incident, type Summary } from './api';
import { IMPACTS, OVERALL, STATES, STATUSES, barTone, dayAt, grouped, uptimeText } from './lib';

/** How often the page refreshes itself while open. */
const REFRESH_MS = 60_000;

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export default function App() {
    const [summary, setSummary] = useState<Summary | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let stopped = false;
        const load = () =>
            getSummary()
                .then((data) => {
                    if (stopped) return;
                    setSummary(data);
                    setError(null);
                    document.title = data.title;
                })
                .catch((caught: Error) => !stopped && setError(caught.message));
        void load();
        const timer = window.setInterval(() => document.visibilityState === 'visible' && void load(), REFRESH_MS);

        return () => {
            stopped = true;
            window.clearInterval(timer);
        };
    }, []);

    if (!summary) {
        return <main className={'pst-page'}>{error ? <p className={'pst-error'}>{error}</p> : <p className={'pst-muted'}>Loading…</p>}</main>;
    }

    const labels = Object.fromEntries(summary.components.map((component) => [component.id, component.label]));

    return (
        <main className={'pst-page'}>
            <header className={'pst-header'}>
                {summary.logo && <img className={'pst-logo'} src={summary.logo} alt={''} />}
                <h1>{summary.title}</h1>
                {summary.intro && <p className={'pst-muted pst-intro'}>{summary.intro}</p>}
            </header>

            <section className={`pst-overall pst-overall-${summary.overall}`} role={'status'}>
                <span className={'pst-dot'} aria-hidden />
                {OVERALL[summary.overall]}
            </section>

            {error && <p className={'pst-error'}>{error} Showing what was loaded before.</p>}

            {summary.incidents.active.map((incident) => (
                <IncidentCard key={incident.id} incident={incident} labels={labels} />
            ))}

            {summary.components.length > 0 && (
                <section className={'pst-card'}>
                    {grouped(summary.components).map((group) => (
                        <div key={group.name || 'ungrouped'} className={'pst-group'}>
                            {group.name && <h2>{group.name}</h2>}
                            {group.components.map((component) => (
                                <Row key={component.id} component={component} first={summary.first_day} />
                            ))}
                        </div>
                    ))}
                </section>
            )}

            {summary.incidents.recent.length > 0 && (
                <section className={'pst-past'}>
                    <h2>Recently resolved</h2>
                    {summary.incidents.recent.map((incident) => (
                        <IncidentCard key={incident.id} incident={incident} labels={labels} />
                    ))}
                </section>
            )}

            <footer className={'pst-muted pst-footer'}>Updated {dateTime.format(new Date(summary.updated_at))}. Refreshes every minute.</footer>
        </main>
    );
}

function Row({ component, first }: { component: Component; first: string }) {
    return (
        <div className={'pst-row'}>
            <div className={'pst-row-head'}>
                <span className={'pst-label'}>{component.label}</span>
                <span className={`pst-state pst-state-${component.state}`}>{STATES[component.state]}</span>
            </div>
            <div className={'pst-bars'} role={'img'} aria-label={`${component.label}: ${uptimeText(component.uptime)} up over ${component.days.length} days`}>
                {component.days.map((share, index) => (
                    <span key={index} className={`pst-bar pst-bar-${barTone(share)}`} title={`${dateOnly.format(dayAt(first, index))}: ${share === null ? 'no data' : uptimeText(Math.round(share * 10000) / 100) + ' up'}`} />
                ))}
            </div>
            <div className={'pst-row-foot pst-muted'}>
                <span>{component.days.length} days ago</span>
                <span>{uptimeText(component.uptime)} up</span>
                <span>Today</span>
            </div>
        </div>
    );
}

function IncidentCard({ incident, labels }: { incident: Incident; labels: Record<number, string> }) {
    const affected = incident.components.map((id) => labels[id]).filter(Boolean);

    return (
        <article className={`pst-card pst-incident pst-impact-${incident.impact} ${incident.resolved_at ? 'pst-resolved' : ''}`}>
            <header>
                <h2>{incident.title}</h2>
                <span className={'pst-muted'}>
                    {IMPACTS[incident.impact]}
                    {affected.length > 0 && ` · ${affected.join(', ')}`}
                </span>
            </header>
            <ol className={'pst-updates'}>
                {incident.updates.map((update) => (
                    <li key={update.id}>
                        <strong>{STATUSES[update.status]}</strong> <span className={'pst-muted'}>{dateTime.format(new Date(update.created_at))}</span>
                        <p>{update.body}</p>
                    </li>
                ))}
            </ol>
        </article>
    );
}
