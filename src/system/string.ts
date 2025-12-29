export function padOrTruncateEnd(s: string, maxLength: number, padWith = ' '): string {
	if (s.length > maxLength) {
		return s.substring(0, maxLength);
	}
	return s.padEnd(maxLength, padWith);
}

export function getDurationMilliseconds(start: [number, number]): number {
	const [secs, nanos] = process.hrtime(start);
	return Math.floor(secs * 1000 + nanos / 1000000);
}