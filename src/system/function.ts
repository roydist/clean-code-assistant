export function getParameters(fn: Function): string[] {
	const match = fn.toString().match(/^\s*function\s*\w*\s*\(([^)]*)\)/) ??
		fn.toString().match(/^\s*\(([^)]*)\)\s*=>/) ??
		fn.toString().match(/^\s*\w+\s*\(([^)]*)\)/);

	if (match == null) return [];

	return match[1]
		.split(',')
		.map(p => p.trim())
		.filter(p => p.length > 0)
		.map(p => p.split('=')[0].trim())
		.map(p => p.split(':')[0].trim());
}