import * as vscode from 'vscode';

import { Logger } from './logger';

export interface NotificationOptions {
	/**
	 * The message to display
	 */
	message: string;

	/**
	 * Additional details for logging
	 */
	details?: string;

	/**
	 * Actions to show in the notification
	 */
	actions?: Array<{
		title: string;
		action: () => void | Promise<void>;
		isCloseAffordance?: boolean;
	}>;

	/**
	 * Whether this is a modal notification
	 */
	modal?: boolean;

	/**
	 * Auto-hide timeout in milliseconds (only for non-modal notifications)
	 */
	timeout?: number;
}

export class NotificationManager {
	private static instance: NotificationManager;
	private activeNotifications = new Map<string, vscode.Disposable>();

	static getInstance(): NotificationManager {
		if (!NotificationManager.instance) {
			NotificationManager.instance = new NotificationManager();
		}
		return NotificationManager.instance;
	}

	/**
	 * Show an information notification
	 */
	async showInfo(options: NotificationOptions): Promise<void> {
		Logger.log(`Notification (info): ${options.message}`, options.details);

		const actions = options.actions?.map(a => a.title) || [];
		const result = options.modal
			? await vscode.window.showInformationMessage(options.message, { modal: true }, ...actions)
			: await vscode.window.showInformationMessage(options.message, ...actions);

		if (result && options.actions) {
			const action = options.actions.find(a => a.title === result);
			if (action) {
				try {
					await action.action();
				} catch (error) {
					Logger.error(error, `Failed to execute notification action: ${action.title}`);
				}
			}
		}
	}

	/**
	 * Show a warning notification
	 */
	async showWarning(options: NotificationOptions): Promise<void> {
		Logger.warn(`Notification (warning): ${options.message}`, options.details);

		const actions = options.actions?.map(a => a.title) || [];
		const result = options.modal
			? await vscode.window.showWarningMessage(options.message, { modal: true }, ...actions)
			: await vscode.window.showWarningMessage(options.message, ...actions);

		if (result && options.actions) {
			const action = options.actions.find(a => a.title === result);
			if (action) {
				try {
					await action.action();
				} catch (error) {
					Logger.error(error, `Failed to execute notification action: ${action.title}`);
				}
			}
		}
	}

	/**
	 * Show an error notification
	 */
	async showError(options: NotificationOptions): Promise<void> {
		Logger.error(`Notification (error): ${options.message}`, options.details);

		const actions = options.actions?.map(a => a.title) || [];
		const result = options.modal
			? await vscode.window.showErrorMessage(options.message, { modal: true }, ...actions)
			: await vscode.window.showErrorMessage(options.message, ...actions);

		if (result && options.actions) {
			const action = options.actions.find(a => a.title === result);
			if (action) {
				try {
					await action.action();
				} catch (error) {
					Logger.error(error, `Failed to execute notification action: ${action.title}`);
				}
			}
		}
	}

	/**
	 * Show a progress notification with a task
	 */
	async showProgress<T>(
		title: string,
		task: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<T>,
		options: { location?: vscode.ProgressLocation; cancellable?: boolean } = {}
	): Promise<T> {
		Logger.log(`Starting progress notification: ${title}`);

		const location = options.location || vscode.ProgressLocation.Notification;
		const cancellable = options.cancellable ?? true;

		return vscode.window.withProgress(
			{
				location,
				title,
				cancellable,
			},
			async (progress, token) => {
				try {
					const result = await task(progress);
					Logger.log(`Progress notification completed: ${title}`);
					return result;
				} catch (error) {
					Logger.error(error, `Progress notification failed: ${title}`);
					throw error;
				}
			}
		);
	}

	/**
	 * Show a status bar notification (temporary)
	 */
	showStatusBar(message: string, timeout = 3000): void {
		Logger.log(`Status bar notification: ${message}`);
		vscode.window.setStatusBarMessage(message, timeout);
	}

	/**
	 * Show a notification once per session for a given key
	 */
	async showOnce(key: string, notificationFn: () => Promise<void>): Promise<void> {
		if (this.activeNotifications.has(key)) {
			return;
		}

		try {
			await notificationFn();
			// Mark as shown for this session
			this.activeNotifications.set(key, {
				dispose: () => this.activeNotifications.delete(key)
			});
		} catch (error) {
			Logger.error(error, `Failed to show one-time notification: ${key}`);
		}
	}

	/**
	 * Clear all active notifications
	 */
	clearAll(): void {
		for (const disposable of this.activeNotifications.values()) {
			disposable.dispose();
		}
		this.activeNotifications.clear();
		Logger.log('Cleared all active notifications');
	}
}

// Export singleton instance
export const notifications = NotificationManager.getInstance();