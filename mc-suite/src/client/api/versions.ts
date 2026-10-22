import { http } from '@pterodactyl/sdk';
import { base, type McInfo } from './client';

export interface SoftwareType {
    name: string;
    icon: string;
    color: string;
    homepage: string;
    deprecated: boolean;
    experimental: boolean;
    description: string;
    categories: string[];
    compatibility: string[];
    builds: number;
    versions: { minecraft: number; project: number };
}

export type SoftwareGroups = Record<string, Record<string, SoftwareType>>;

export interface BuildSummary {
    id: number;
    type: string;
    versionId: string | null;
    projectVersionId: string | null;
    name: string | null;
    buildNumber: number | null;
    experimental: boolean;
    size: number | null;
    changes: string[];
    created: string | null;
}

export interface VersionSummary {
    id: string;
    type: 'RELEASE' | 'SNAPSHOT' | string;
    supported: boolean;
    java: number | null;
    builds: number;
    created: string | null;
    latest: BuildSummary;
}

export interface BedrockVersions {
    stable: string | null;
    latestPreview: string | null;
    versions: string[];
    preview: string[];
}

export interface VersionsOverview {
    info: McInfo;
    types: SoftwareGroups | null;
    job: string | null;
    dockerImage: string;
    dockerImages: Record<string, string>;
    canChangeImage: boolean;
    /** The egg starts the Pumpkin binary, so it can only run Pumpkin builds. */
    pumpkinEgg: boolean;
}

export async function getOverview(server: string): Promise<VersionsOverview> {
    const { data } = await http.get<VersionsOverview>(`${base(server)}/versions`);

    return data;
}

export async function getVersions(server: string, type: string): Promise<VersionSummary[]> {
    const { data } = await http.get<{ versions: VersionSummary[] }>(`${base(server)}/versions/${type}`);

    return data.versions;
}

export async function getBedrockVersions(server: string): Promise<BedrockVersions> {
    const { data } = await http.get<{ versions: BedrockVersions }>(`${base(server)}/versions/BEDROCK`);

    return data.versions;
}

export async function getBuilds(server: string, type: string, version: string): Promise<BuildSummary[]> {
    const { data } = await http.get<{ builds: BuildSummary[] }>(`${base(server)}/versions/${type}/${encodeURIComponent(version)}`);

    return data.builds;
}

export async function installBuild(server: string, build: number, start: boolean, type?: string): Promise<string> {
    const { data } = await http.post<{ job: string }>(`${base(server)}/versions/install`, { build, start, type });

    return data.job;
}

export async function installBedrock(server: string, version: string, preview: boolean, start: boolean): Promise<string> {
    const { data } = await http.post<{ job: string }>(`${base(server)}/versions/install`, { bedrock: version, preview, start });

    return data.job;
}

/** The Java major version a Docker image provides, read from tags like `java_21` or `:21-jre`. */
export function imageJava(image: string): number | null {
    const match = image.match(/java[_-]?(\d{1,2})\b/i) ?? image.match(/:(\d{1,2})(?:[-.][\w.-]*)?$/);

    return match ? Number(match[1]) : null;
}
