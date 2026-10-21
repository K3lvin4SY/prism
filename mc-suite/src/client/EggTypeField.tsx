import { Label, Select, type FormExtension } from '@pterodactyl/sdk';

const OPTIONS = [
    { value: 'auto', label: 'Detect automatically' },
    { value: 'off', label: 'Not Minecraft: hide MC Suite' },
    { value: 'vanilla', label: 'Java: vanilla' },
    { value: 'plugins', label: 'Java: plugins (Paper, Spigot, Purpur…)' },
    { value: 'modded', label: 'Java: modded (Fabric, Forge, NeoForge…)' },
    { value: 'hybrid', label: 'Java: plugins and mods (Mohist, Arclight…)' },
    { value: 'proxy', label: 'Java: proxy (Velocity, BungeeCord…)' },
    { value: 'bedrock', label: 'Bedrock Dedicated Server' },
];

/** "MC Suite server type" on the admin egg form. */
const EggTypeField: FormExtension<{ type: string | null }, 'admin.egg'> = ({ field }) => {
    const type = field('type');

    return (
        <div>
            <Label htmlFor={type.id}>MC Suite server type</Label>
            <Select id={type.id} value={type.value ?? 'auto'} onChange={(value) => type.setValue(String(value))} options={OPTIONS} />
            <p className={'input-help'}>Which Minecraft tabs servers using this egg get. Detection reads the server files when this is automatic.</p>
            {type.error && <p className={'input-help error'}>{type.error}</p>}
        </div>
    );
};

export default EggTypeField;
