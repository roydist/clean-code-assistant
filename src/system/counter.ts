export function getScopedCounter(): { current: number; next(): number } {
	let counter = 0;
	return {
		get current(): number {
			return counter;
		},
		next(): number {
			return ++counter;
		}
	};
}