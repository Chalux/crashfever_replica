export function normalizeCount(value: number): number {
    if (value < 1 || isNaN(value) || !isFinite(value)) {
        return 0;
    }
    return Math.floor(value);
}

export function formatRedDotCount(count: number, maxCount: number = 99): string {
    count = normalizeCount(count);
    if (maxCount < 1 || isNaN(maxCount) || !isFinite(maxCount)) {
        maxCount = 99;
    }
    maxCount = Math.floor(maxCount);
    if (count > maxCount) {
        return `${maxCount}+`;
    }
    return count.toString();
}