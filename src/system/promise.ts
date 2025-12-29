export function isPromise<T>(obj: T | Promise<T>): obj is Promise<T> {
	return obj != null && typeof (obj as Promise<T>).then === 'function';
}

export function getSettledValue<T>(result: PromiseSettledResult<T>): T | undefined {
	return result.status === 'fulfilled' ? result.value : undefined;
}