import { getScopedCounter } from './counter';

export const logScopeIdGenerator = getScopedCounter();

const scopes = new Map<number, LogScope>();

export interface LogScope {
	readonly scopeId?: number;
	readonly prevScopeId?: number;
	readonly prefix: string;
	exitDetails?: string;
	exitFailed?: string;
}

export function clearLogScope(scopeId: number): void {
	scopes.delete(scopeId);
}

export function getLoggableScopeBlock(scopeId: number, prevScopeId?: number): string {
	return prevScopeId == null
		? `[${scopeId.toString(16).padStart(13)}]`
		: `[${prevScopeId.toString(16).padStart(5)} \u2192 ${scopeId.toString(16).padStart(5)}]`;
}

export function getLoggableScopeBlockOverride(prefix: string, suffix?: string): string {
	if (suffix == null) return `[${prefix.padEnd(13)}]`;

	return `[${prefix}${suffix.padStart(13 - prefix.length)}]`;
}

export function getLogScope(): LogScope | undefined {
	return scopes.get(logScopeIdGenerator.current);
}

export function getNewLogScope(prefix: string, scope: LogScope | boolean | undefined): LogScope {
	if (scope === false) return { prefix };
	if (scope === true) return { scopeId: logScopeIdGenerator.next(), prefix };
	if (scope != null) return { ...scope, scopeId: logScopeIdGenerator.next() };

	return { scopeId: logScopeIdGenerator.next(), prefix };
}

export function startLogScope(prefix: string, scope: LogScope | boolean | undefined): LogScope & Disposable {
	const logScope = getNewLogScope(prefix, scope);
	scopes.set(logScope.scopeId!, logScope);

	return {
		...logScope,
		[Symbol.dispose](): void {
			scopes.delete(logScope.scopeId!);
		}
	};
}

export function setLogScope(scopeId: number, scope: LogScope): LogScope {
	scope = { prevScopeId: logScopeIdGenerator.current, ...scope };
	scopes.set(scopeId, scope);
	return scope;
}

export function setLogScopeExit(scope: LogScope | undefined, details: string | undefined, failed?: string): void {
	if (scope == null) return;

	if (scope.exitDetails != null && details != null) {
		scope.exitDetails += details;
	} else {
		scope.exitDetails = details;
	}

	if (failed != null) {
		if (scope.exitFailed != null) {
			scope.exitFailed += failed;
		} else {
			scope.exitFailed = failed;
		}
	}
}