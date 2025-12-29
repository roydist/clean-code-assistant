import { setLogScopeExit, startLogScope } from './logger.scope';

import type { LogScope } from './logger.scope';
import { Logger } from './logger';
import { getDurationMilliseconds } from './string';
import { hrtime } from '../@env/hrtime';

(Symbol as any).dispose ??= Symbol('Symbol.dispose');
(Symbol as any).asyncDispose ??= Symbol('Symbol.asyncDispose');

export class LoggableScope implements Disposable {
	private readonly scope: LogScope & Disposable;
	private readonly start: [number, number];

	constructor(
		prefix: string,
		private readonly options?: { debug?: boolean; enter?: string },
	) {
		this.scope = startLogScope(prefix, true);
		this.start = hrtime();

		(options?.debug ? Logger.debug : Logger.log).call(Logger, this.scope, options?.enter ?? '');
	}

	[Symbol.dispose](): void {
		const duration = getDurationMilliseconds(this.start);
		const timing = ` [${duration}ms]`;
		const exit = this.scope.exitFailed ?? 'completed';

		if (this.scope.exitFailed != null) {
			Logger.error(null, this.scope, `${exit}${this.scope.exitDetails ?? ''}${timing}`);
		} else {
			(this.options?.debug ? Logger.debug : Logger.log).call(
				Logger,
				this.scope,
				`${exit}${this.scope.exitDetails ?? ''}${timing}`,
			);
		}

		this.scope[Symbol.dispose]();
	}

	setExit(details: string | undefined, failed?: string): void {
		setLogScopeExit(this.scope, details, failed);
	}

	error(ex: Error | unknown, message?: string, ...params: any[]): void {
		Logger.error(ex, this.scope, message, ...params);
	}

	log(message: string, ...params: any[]): void {
		(this.options?.debug ? Logger.debug : Logger.log).call(Logger, this.scope, message, ...params);
	}

	warn(message: string, ...params: any[]): void {
		Logger.warn(this.scope, message, ...params);
	}
}

export function maybeStartLoggableScope(
	prefix: string,
	options?: { debug?: boolean; enter?: string },
): LoggableScope | undefined {
	if (!Logger.enabled('debug') && !Logger.isDebugging) return undefined;

	return new LoggableScope(prefix, options);
}