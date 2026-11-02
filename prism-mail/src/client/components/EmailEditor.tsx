import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Input, Spinner, TextArea, httpErrorToHuman, toast, useDebouncedCallback } from '@pterodactyl/sdk';
import { emailsKey, previewEmail, saveEmail, testEmail, type Email, type Field, type Wording } from '../api';
import { NamedIcon } from '../icons';
import { EMPTY, changed, customised, unknownPlaceholders } from '../lib/template';

const eyebrow = 'pml:font-mono pml:text-xs pml:font-medium pml:uppercase pml:tracking-[0.18em] pml:text-muted-foreground';

const LABELS: Record<Field, string> = {
    subject: 'Subject',
    greeting: 'Greeting',
    intro: 'Text above the button',
    action: 'Button',
    outro: 'Text below the button',
};

/** One email's wording, with a live preview and a test send to the admin. */
export default function EmailEditor({ email }: { email: Email }) {
    const client = useQueryClient();
    const [wording, setWording] = useState<Wording>(email.template);
    const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [busy, setBusy] = useState<'save' | 'test' | null>(null);

    const load = useDebouncedCallback((draft: Wording) => {
        previewEmail(email.key, draft)
            .then((result) => {
                setPreview(result);
                setPreviewError(null);
            })
            .catch((error) => setPreviewError(httpErrorToHuman(error)));
    }, 400);

    useEffect(() => load(wording), [wording]);

    const dirty = changed(wording, email.template);
    const fields: Field[] = email.panel.action ? ['subject', 'greeting', 'intro', 'action', 'outro'] : ['subject', 'greeting', 'intro', 'outro'];
    const unknown = unknownPlaceholders(fields.map((field) => wording[field]).join(' '), email.placeholders);

    const save = async () => {
        setBusy('save');
        try {
            await saveEmail(email.key, wording);
            await client.invalidateQueries({ queryKey: emailsKey });
            toast.success(customised(wording) ? `Saved the wording of "${email.label}".` : `"${email.label}" uses the panel's wording again.`);
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(null);
        }
    };

    const test = async () => {
        setBusy('test');
        try {
            const { to } = await testEmail(email.key);
            toast.success(`Sent "${email.label}" to ${to}, with made-up details. Check the delivery log if it does not arrive.`);
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(null);
        }
    };

    return (
        <section className={'pt-surface pml:flex pml:min-w-0 pml:flex-col pml:overflow-hidden pml:rounded-xl pml:border pml:border-border pml:bg-card'}>
            <header className={'pml:flex pml:flex-wrap pml:items-center pml:gap-3 pml:border-b pml:border-border pml:px-5 pml:py-4'}>
                <div className={'pml:min-w-0 pml:flex-1'}>
                    <h2 className={'pml:font-header pml:text-lg pml:font-semibold'}>{email.label}</h2>
                    <p className={'pml:text-sm pml:text-muted-foreground'}>{email.about}</p>
                </div>
                <Button.Text size={'small'} disabled={busy !== null || dirty} title={dirty ? 'Save first: the test uses the saved wording.' : undefined} onClick={() => void test()}>
                    <NamedIcon name={'send'} size={14} className={'pml:mr-1'} /> Send me a test
                </Button.Text>
            </header>

            <div className={'pml:grid pml:gap-5 pml:p-5 pml:xl:grid-cols-2'}>
                <div className={'pml:flex pml:min-w-0 pml:flex-col pml:gap-4'}>
                    <p className={'pml:text-sm pml:text-muted-foreground'}>
                        Leave a field empty to keep the panel's own text, shown greyed in it. You can use {email.placeholders.map((name) => `{${name}}`).join(', ')}. One paragraph per line.
                    </p>
                    {fields.map((field) => (
                        <label key={field} className={'pml:flex pml:flex-col pml:gap-1.5'}>
                            <span className={eyebrow}>{LABELS[field]}</span>
                            {field === 'intro' || field === 'outro' ? (
                                <TextArea rows={4} maxLength={5000} value={wording[field]} placeholder={email.panel[field] || 'Nothing'} onChange={(event) => setWording((all) => ({ ...all, [field]: event.target.value }))} />
                            ) : (
                                <Input value={wording[field]} maxLength={field === 'action' ? 64 : 191} placeholder={email.panel[field] || 'Nothing'} onChange={(event) => setWording((all) => ({ ...all, [field]: event.target.value }))} />
                            )}
                        </label>
                    ))}
                    {unknown.length > 0 && (
                        <Alert type={'warning'}>
                            This email does not fill {unknown.map((name) => `{${name}}`).join(', ')}, so it would be sent as typed.
                        </Alert>
                    )}
                    {email.key === 'account-created' && wording.intro.trim() !== '' && !wording.intro.includes('{username}') && <Alert type={'info'}>The panel's text tells people their username. Add {'{username}'} so they still know it.</Alert>}
                    <div className={'pml:flex pml:flex-wrap pml:justify-end pml:gap-2'}>
                        <Button.Text disabled={busy !== null || !customised(wording)} onClick={() => setWording(EMPTY)}>
                            Use the panel's wording
                        </Button.Text>
                        <Button disabled={!dirty || busy !== null} isLoading={busy === 'save'} onClick={() => void save()}>
                            Save
                        </Button>
                    </div>
                </div>

                <div className={'pml:flex pml:min-w-0 pml:flex-col pml:gap-2'}>
                    <span className={eyebrow}>Preview</span>
                    {previewError && <Alert type={'danger'}>{previewError}</Alert>}
                    {!preview && !previewError && <Spinner centered />}
                    {preview && (
                        <div className={'pt-solid pml:flex pml:flex-col pml:overflow-hidden pml:rounded-lg pml:border pml:border-border'}>
                            <p className={'pml:truncate pml:border-b pml:border-border pml:px-3 pml:py-2 pml:text-sm'}>
                                <span className={'pml:text-muted-foreground'}>Subject: </span>
                                <span className={'pml:font-semibold'}>{preview.subject}</span>
                            </p>
                            {/* No scripts, forms or navigation: the preview only shows the email. */}
                            <iframe title={`${email.label} preview`} sandbox={''} srcDoc={preview.html} className={'pml:h-[34rem] pml:w-full pml:bg-white'} />
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
