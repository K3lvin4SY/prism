import map from './data/map.json';

/**
 * Reads Terraria .wld files (1.4 and newer) in the browser: the header for the World tab and
 * the tiles for the map. The layout follows TEdit's World.FileV2.cs.
 */

export interface WorldHeader {
    version: number;
    name: string;
    seed: string;
    width: number;
    height: number;
    /** 0 classic, 1 expert, 2 master, 3 journey. */
    gameMode: number;
    secretSeeds: string[];
    created: Date | null;
    lastPlayed: Date | null;
    spawn: { x: number; y: number };
    dungeon: { x: number; y: number };
    surface: number;
    rock: number;
    crimson: boolean;
    hardMode: boolean;
    bloodMoon: boolean;
    eclipse: boolean;
    raining: boolean;
    /** Boss name → defeated, in the order bosses are usually beaten. */
    bosses: [string, boolean][];
    /** Events and invasions → beaten. */
    events: [string, boolean][];
    /** The header could only be read up to the world's basics. */
    partial: boolean;
}

export interface ParsedWorld {
    header: WorldHeader;
    tileFrameImportant: boolean[];
    tileSection: number;
    /** Where the tiles end: the next section, the chests. */
    chestSection: number;
}

class Reader {
    private readonly view: DataView;
    private readonly bytes: Uint8Array;
    pos = 0;

    constructor(readonly buffer: ArrayBuffer) {
        this.view = new DataView(buffer);
        this.bytes = new Uint8Array(buffer);
    }

    byte(): number {
        return this.view.getUint8(this.pos++);
    }

    bool(): boolean {
        return this.byte() !== 0;
    }

    int16(): number {
        const value = this.view.getInt16(this.pos, true);
        this.pos += 2;

        return value;
    }

    uint16(): number {
        const value = this.view.getUint16(this.pos, true);
        this.pos += 2;

        return value;
    }

    int32(): number {
        const value = this.view.getInt32(this.pos, true);
        this.pos += 4;

        return value;
    }

    uint32(): number {
        const value = this.view.getUint32(this.pos, true);
        this.pos += 4;

        return value;
    }

    int64(): bigint {
        const value = this.view.getBigInt64(this.pos, true);
        this.pos += 8;

        return value;
    }

    float(): number {
        const value = this.view.getFloat32(this.pos, true);
        this.pos += 4;

        return value;
    }

    double(): number {
        const value = this.view.getFloat64(this.pos, true);
        this.pos += 8;

        return value;
    }

    skip(count: number): void {
        this.pos += count;
    }

    /** A .NET BinaryWriter string: a 7-bit encoded length, then UTF-8. */
    string(): string {
        let length = 0;
        let shift = 0;
        let part: number;
        do {
            part = this.byte();
            length |= (part & 0x7f) << shift;
            shift += 7;
        } while (part & 0x80);

        const text = new TextDecoder().decode(this.bytes.subarray(this.pos, this.pos + length));
        this.pos += length;

        return text;
    }
}

/** .NET DateTime.ToBinary(): ticks since year 1 in the low 62 bits. */
function dotnetDate(value: bigint): Date | null {
    const ticks = value & 0x3fffffffffffffffn;
    if (ticks === 0n) return null;

    const date = new Date(Number((ticks - 621355968000000000n) / 10000n));

    return Number.isNaN(date.getTime()) ? null : date;
}

export function parseWorld(buffer: ArrayBuffer): ParsedWorld {
    const r = new Reader(buffer);
    const version = r.int32();
    if (version < 194) throw new Error('This world was saved by Terraria before 1.4, which the map cannot read.');

    const magic = new TextDecoder().decode(new Uint8Array(buffer, 4, 7));
    r.skip(7);
    if (magic !== 'relogic' && magic !== 'xindong') throw new Error('This is not a Terraria world file.');
    if (r.byte() !== 2) throw new Error('This is not a Terraria world file.');
    r.uint32(); // revision
    r.skip(8); // favourite flags

    const sections: number[] = [];
    for (let count = r.int16(), i = 0; i < count; i++) sections.push(r.int32());

    // The tiles whose frame is stored per tile, as a bit array with the lowest bit first.
    const bits = r.int16();
    const tileFrameImportant: boolean[] = [];
    let current = 0;
    for (let i = 0; i < bits; i++) {
        if (i % 8 === 0) current = r.byte();
        tileFrameImportant.push((current & (1 << i % 8)) !== 0);
    }

    r.pos = sections[0];
    const header = readHeader(r, version);

    return { header, tileFrameImportant, tileSection: sections[1], chestSection: sections[2] };
}

function readHeader(r: Reader, version: number): WorldHeader {
    const name = r.string();
    const seed = r.string();
    r.skip(8); // world generator version
    r.skip(16); // world GUID
    r.int32(); // world id
    r.skip(16); // world bounds in pixels
    const height = r.int32();
    const width = r.int32();

    const gameMode = r.int32();
    const flags: [string, boolean][] = [];
    if (version >= 222) flags.push(['Drunk world', r.bool()]);
    if (version >= 227) flags.push(['For the worthy', r.bool()]);
    if (version >= 238) flags.push(['Celebrationmk10', r.bool()]);
    if (version >= 239) flags.push(['The Constant', r.bool()]);
    if (version >= 241) flags.push(['Not the bees', r.bool()]);
    if (version >= 249) flags.push(["Don't dig up", r.bool()]);
    if (version >= 266) flags.push(['No traps', r.bool()]);
    if (version >= 267) flags.push(['Get fixed boi', r.bool()]);
    if (version >= 302) flags.push(['Skyblock', r.bool()]);

    const created = dotnetDate(r.int64());
    const lastPlayed = version >= 284 ? dotnetDate(r.int64()) : null;

    r.byte(); // moon type
    r.skip(4 * 3 + 4 * 4 + 4 * 3 + 4 * 4 + 4 * 3); // tree and cave background positions and styles
    const spawn = { x: r.int32(), y: r.int32() };
    const surface = r.double();
    const rock = r.double();
    r.double(); // time
    r.bool(); // day time
    r.int32(); // moon phase
    const bloodMoon = r.bool();
    const eclipse = r.bool();
    const dungeon = { x: r.int32(), y: r.int32() };
    const crimson = r.bool();

    const basics = {
        version,
        name,
        seed,
        width,
        height,
        gameMode,
        secretSeeds: flags.filter(([, on]) => on).map(([label]) => label),
        created,
        lastPlayed,
        spawn,
        dungeon,
        surface,
        rock,
        crimson,
        bloodMoon,
        eclipse,
    };

    try {
        return { ...basics, ...readProgress(r, version, crimson), partial: false };
    } catch {
        return { ...basics, hardMode: false, raining: false, bosses: [], events: [], partial: true };
    }
}

function readProgress(r: Reader, version: number, crimson: boolean) {
    const downed: Record<string, boolean> = {};
    const flag = (key: string) => (downed[key] = r.bool());

    ['eye', 'evil', 'skeletron', 'queenBee', 'destroyer', 'twins', 'prime', 'anyMech', 'plantera', 'golem', 'kingSlime'].forEach(flag);
    ['savedGoblin', 'savedWizard', 'savedMechanic', 'goblins', 'clown', 'frostLegion', 'pirates'].forEach(flag);
    r.bool(); // shadow orb smashed
    r.bool(); // spawn meteor
    r.byte(); // shadow orb count
    r.int32(); // altar count
    const hardMode = r.bool();
    if (version >= 257) r.bool(); // party of doom
    r.skip(4 * 3); // invasion delay, size, type
    r.double(); // invasion x
    r.double(); // slime rain time
    r.byte(); // sundial cooldown
    const raining = r.bool();
    r.int32(); // rain time
    r.float(); // max rain
    r.skip(4 * 3); // hardmode ore tiers
    r.skip(8); // background styles
    r.int32(); // cloud background
    r.int16(); // clouds
    r.float(); // wind
    for (let anglers = r.int32(); anglers > 0; anglers--) r.string();
    r.bool(); // angler saved
    r.int32(); // angler quest
    r.bool(); // stylist saved
    r.bool(); // tax collector saved
    r.bool(); // golfer saved
    r.int32(); // invasion size start
    r.int32(); // cultist delay
    r.skip(r.int16() * 4); // banner kill counts
    if (version >= 289) r.skip(r.int16() * 2); // claimable banners
    r.bool(); // fast forward time
    ['fishron', 'martians', 'cultist', 'moonLord', 'pumpking', 'mourningWood', 'iceQueen', 'santaNk1', 'everscream'].forEach(flag);
    ['solar', 'vortex', 'nebula', 'stardust'].forEach(flag);
    r.skip(4); // pillars active
    r.bool(); // apocalypse
    r.bool(); // party manual
    r.bool(); // party genuine
    r.int32(); // party cooldown
    r.skip(r.int32() * 4); // partying NPCs
    r.bool(); // sandstorm
    r.int32();
    r.float();
    r.float();
    r.bool(); // bartender saved
    ['oldOnes1', 'oldOnes2', 'oldOnes3'].forEach(flag);
    r.byte(); // mushroom background
    r.byte(); // underworld background
    r.skip(3); // tree backgrounds
    r.bool(); // combat book
    r.int32(); // lantern night cooldown
    r.skip(3);
    r.skip(r.int32() * 4); // tree top variations
    r.skip(2); // forced halloween and christmas
    r.skip(4 * 4); // pre-hardmode ore tiers
    r.skip(3); // pets bought
    ['empress', 'queenSlime'].forEach(flag);
    if (version >= 240) flag('deerclops');

    const bosses: [string, boolean][] = [
        ['King Slime', downed.kingSlime],
        ['Eye of Cthulhu', downed.eye],
        [crimson ? 'Brain of Cthulhu' : 'Eater of Worlds', downed.evil],
        ['Queen Bee', downed.queenBee],
        ['Skeletron', downed.skeletron],
        ...(version >= 240 ? ([['Deerclops', downed.deerclops]] as [string, boolean][]) : []),
        ['Wall of Flesh', hardMode],
        ['Queen Slime', downed.queenSlime],
        ['The Twins', downed.twins],
        ['The Destroyer', downed.destroyer],
        ['Skeletron Prime', downed.prime],
        ['Plantera', downed.plantera],
        ['Golem', downed.golem],
        ['Duke Fishron', downed.fishron],
        ['Empress of Light', downed.empress],
        ['Lunatic Cultist', downed.cultist],
        ['Moon Lord', downed.moonLord],
    ];

    const events: [string, boolean][] = [
        ['Goblin Army', downed.goblins],
        ['Frost Legion', downed.frostLegion],
        ['Pirate Invasion', downed.pirates],
        ['Martian Madness', downed.martians],
        ['Pumpkin Moon', downed.pumpking],
        ['Frost Moon', downed.iceQueen],
        ["Old One's Army", downed.oldOnes3 || downed.oldOnes2 || downed.oldOnes1],
        ['Celestial Pillars', downed.solar && downed.vortex && downed.nebula && downed.stardust],
    ];

    return { hardMode, raining, bosses, events };
}

function rgb(hex: string): [number, number, number] {
    const value = parseInt(hex.slice(1, 7), 16);

    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

const TILES = (map.tiles as string[]).map(rgb);
const WALLS = (map.walls as string[]).map(rgb);
const GLOBAL = Object.fromEntries(Object.entries(map.global as Record<string, string>).map(([key, value]) => [key, rgb(value)]));
const LIQUIDS = [null, GLOBAL.Water, GLOBAL.Lava, GLOBAL.Honey];

/**
 * Draws the tiles into RGBA pixels, one per tile, a few hundred columns at a time so the
 * page stays responsive. Tiles are stored column by column, with runs of identical tiles.
 */
export async function renderTiles(buffer: ArrayBuffer, world: ParsedWorld, onProgress?: (fraction: number) => void): Promise<ImageData> {
    const { width, height, surface, rock, version } = { ...world.header, version: world.header.version };
    const pixels = new Uint8ClampedArray(width * height * 4);
    const bytes = new Uint8Array(buffer);
    const important = world.tileFrameImportant;
    let pos = world.tileSection;

    const background = (y: number): [number, number, number] =>
        y < surface ? GLOBAL.Sky : y < rock ? GLOBAL.Earth : y < height - 200 ? GLOBAL.Rock : GLOBAL.Hell;

    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            const header1 = bytes[pos++];
            let header2 = 0;
            let header3 = 0;
            let header4 = 0;
            if (header1 & 1) {
                header2 = bytes[pos++];
                if (header2 & 1) {
                    header3 = bytes[pos++];
                    if (version >= 269 && header3 & 1) header4 = bytes[pos++];
                }
            }

            let tile = -1;
            if (header1 & 2) {
                tile = header1 & 0x20 ? bytes[pos] | (bytes[pos + 1] << 8) : bytes[pos];
                pos += header1 & 0x20 ? 2 : 1;
                if (tile >= important.length || important[tile]) pos += 4;
                if (header3 & 8) pos++; // paint
            }

            let wall = 0;
            if (header1 & 4) {
                wall = bytes[pos++];
                if (header3 & 0x10) pos++; // wall paint
            }

            let liquid: [number, number, number] | null = null;
            const liquidType = (header1 & 0x18) >> 3;
            if (liquidType !== 0) {
                pos++; // amount
                liquid = version >= 269 && header3 & 0x80 ? GLOBAL.Shimmer : LIQUIDS[liquidType];
            }

            if (header3 & 0x40) wall |= bytes[pos++] << 8;

            const run = header1 >> 6;
            let repeat = 0;
            if (run === 1) repeat = bytes[pos++];
            else if (run >= 2) {
                repeat = bytes[pos] | (bytes[pos + 1] << 8);
                pos += 2;
            }

            const invisibleTile = (header4 & 2) !== 0;
            const invisibleWall = (header4 & 4) !== 0;

            for (let i = 0; i <= repeat && y < height; i++, y++) {
                let colour: [number, number, number];
                if (tile >= 0 && !invisibleTile) colour = TILES[tile] ?? GLOBAL.Rock;
                else if (liquid) colour = liquid;
                else if (wall > 0 && !invisibleWall) colour = WALLS[wall] ?? GLOBAL.Rock;
                else colour = background(y);

                const index = (y * width + x) * 4;
                pixels[index] = colour[0];
                pixels[index + 1] = colour[1];
                pixels[index + 2] = colour[2];
                pixels[index + 3] = 255;
            }
            y--;
        }

        if (x % 200 === 199) {
            onProgress?.(x / width);
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }

    // A newer file format would leave the reader out of step; better no map than a wrong one.
    if (pos !== world.chestSection) throw new Error('this world version stores its tiles in a way the map does not understand yet.');

    onProgress?.(1);

    return new ImageData(pixels, width, height);
}
