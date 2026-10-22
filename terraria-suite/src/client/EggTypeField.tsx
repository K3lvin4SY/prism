import { Label, Select, type FormExtension } from '@pterodactyl/sdk';

const OPTIONS = [
    { value: 'auto', label: 'Detect automatically' },
    { value: 'off', label: 'Not Terraria: hide Terraria Suite' },
    { value: 'vanilla', label: 'Terraria (vanilla server)' },
    { value: 'tshock', label: 'TShock' },
    { value: 'tmodloader', label: 'tModLoader' },
];

/** "Terraria Suite server type" on the admin egg form. */
const EggTypeField: FormExtension<{ type: string | null }, 'admin.egg'> = ({ field }) => {
    const type = field('type');

    return (
        <div>
            <Label htmlFor={type.id}>Terraria Suite server type</Label>
            <Select id={type.id} value={type.value ?? 'auto'} onChange={(value) => type.setValue(String(value))} options={OPTIONS} />
            <p className={'input-help'}>Which Terraria tabs servers using this egg get. Detection reads the server files when this is automatic.</p>
            {type.error && <p className={'input-help error'}>{type.error}</p>}
        </div>
    );
};

export default EggTypeField;
