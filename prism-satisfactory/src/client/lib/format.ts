/** "2 h 5 min" */
export function duration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}
