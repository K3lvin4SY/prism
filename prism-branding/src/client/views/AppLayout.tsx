import { useEffect, useMemo } from 'react';
import type { ViewProps } from '@pterodactyl/sdk/theme';
import { cssString, getBranding } from '../branding';

/**
 * The signed-in layout with the admin's logo choice: "Name only" hides any logo, and "Beside the
 * name" adds the company name after it.
 */
export default function AppLayout({ model, Default }: ViewProps<'layout.app'>) {
    const branding = getBranding();
    const name = model.brand.name;

    useEffect(() => {
        document.documentElement.style.setProperty('--pbr-name', cssString(name));
    }, [name]);

    const brand = useMemo(() => ({ ...model.brand, logoUrl: null }), [model.brand]);

    if (branding.logoMode === 'name') return <Default model={{ ...model, brand }} />;

    return <Default />;
}
