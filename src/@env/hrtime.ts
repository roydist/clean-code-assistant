// High-resolution time implementation using Node.js process.hrtime
export function hrtime(previousTimestamp?: [number, number]): [number, number] {
	if (previousTimestamp) {
		return process.hrtime(previousTimestamp);
	}

	return process.hrtime();
}