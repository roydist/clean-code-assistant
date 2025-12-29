import { BufferedLogChannel, Logger } from '../system/logger';

import { LoggableScope } from '../system/loggable';
import assert from 'node:assert/strict';
import { getNewLogScope } from '../system/logger.scope';

suite('Logger System Tests', () => {
	let mockChannel: any;
	let loggedMessages: string[];
	let bufferedChannel: BufferedLogChannel;

	setup(() => {
		loggedMessages = [];
		mockChannel = {
			name: 'test-channel',
			append: (message: string) => loggedMessages.push(message),
			appendLine: (message: string) => loggedMessages.push(message),
			dispose: () => {},
			show: () => {}
		};

		bufferedChannel = new BufferedLogChannel(mockChannel, 0);

		// Configure logger for testing
		Logger.configure({
			name: 'Test Logger',
			createChannel: () => bufferedChannel
		}, 'debug', false);
	});

	teardown(() => {
		// Reset logger
		Logger.configure({
			name: 'Test Logger',
			createChannel: () => ({ name: 'test', append: () => {}, appendLine: () => {}, dispose: () => {}, show: () => {} })
		}, 'off', false);
	});

	suite('Basic Logger Functionality', () => {
		test('should log info messages', () => {
			Logger.log('Test info message');
			bufferedChannel.flush();
			assert(loggedMessages.some(msg => msg.includes('Test info message')));
		});

		test('should log debug messages', () => {
			Logger.debug('Test debug message');
			bufferedChannel.flush();
			assert(loggedMessages.some(msg => msg.includes('Test debug message')));
		});

		test('should log warning messages', () => {
			Logger.warn('Test warning message');
			bufferedChannel.flush();
			assert(loggedMessages.some(msg => msg.includes('Test warning message')));
		});

		test('should log error messages', () => {
			const error = new Error('Test error');
			Logger.error(error, 'Test error message');
			bufferedChannel.flush();
			assert(loggedMessages.some(msg => msg.includes('Test error message')));
		});

		test('should respect log levels', () => {
			// Set to error only
			Logger.configure({
				name: 'Test Logger',
				createChannel: () => mockChannel
			}, 'error', false);

			loggedMessages = [];
			Logger.log('Should not appear');
			Logger.error('Should appear');

			assert(!loggedMessages.some(msg => msg.includes('Should not appear')));
			assert(loggedMessages.some(msg => msg.includes('Should appear')));
		});
	});

	suite('Log Scopes', () => {
		test('should create log scopes', () => {
			const scope = getNewLogScope('test-operation', undefined);
			assert(scope.prefix === 'test-operation');
			assert(scope.scopeId != null);
		});

		test('should log with scopes', () => {
			const scope = getNewLogScope('test-scope', undefined);
			Logger.log(scope, 'Scoped message');
			bufferedChannel.flush();
			assert(loggedMessages.some(msg => msg.includes('test-scope') && msg.includes('Scoped message')));
		});
	});

	suite('LoggableScope', () => {
		test('should create and dispose loggable scope', () => {
			const scope = new LoggableScope('test-operation');
			scope.log('Starting operation');

			// Check that the scope has the dispose symbol
			assert(typeof scope[Symbol.dispose] === 'function');

			// Dispose the scope
			scope[Symbol.dispose]();
		});

		test('should handle errors in loggable scope', () => {
			const scope = new LoggableScope('error-test');
			const error = new Error('Test error');

			scope.error(error, 'Operation failed');
			bufferedChannel.flush();
			assert(loggedMessages.some(msg => msg.includes('Operation failed')));
		});

		test('should log completion status', () => {
			const scope = new LoggableScope('completion-test');
			scope.setExit('completed successfully');

			// Force disposal to trigger completion logging
			if (scope[Symbol.dispose]) {
				scope[Symbol.dispose]();
			}

			bufferedChannel.flush();
			assert(loggedMessages.some(msg => msg.includes('completed successfully')));
		});
	});

	suite('Logger Configuration', () => {
		test('should configure logger with custom provider', () => {
			loggedMessages = []; // Clear messages
			const customChannel = {
				name: 'custom',
				appendLine: (msg: string) => loggedMessages.push(`CUSTOM: ${msg}`),
				dispose: () => {},
				show: () => {}
			};

			Logger.configure({
				name: 'Custom Logger',
				createChannel: () => customChannel
			}, 'info', false);

			Logger.log('Test message');
			assert(loggedMessages.some(msg => msg.startsWith('CUSTOM:')));
		});

		test('should sanitize sensitive data', () => {
			const testObject = {
				user: 'testuser',
				password: 'secret123',
				token: 'abc123',
				normalField: 'normal'
			};

			Logger.log('Object with sensitive data', testObject);
			bufferedChannel.flush();
			const loggedMessage = loggedMessages.find(msg => msg.includes('Object with sensitive data'));
			assert(loggedMessage);
			assert(!loggedMessage!.includes('secret123'));
			assert(!loggedMessage!.includes('abc123'));
			assert(loggedMessage!.includes('normal'));
		});
	});

	suite('BufferedLogChannel', () => {
		test('should buffer and flush messages', (done) => {
			loggedMessages = []; // Clear messages
			const bufferChannel = new BufferedLogChannel(mockChannel, 100); // 100ms buffer
			bufferChannel.appendLine('Buffered message 1');
			bufferChannel.appendLine('Buffered message 2');

			// Messages should not be logged immediately
			assert(loggedMessages.length === 0);

			// Wait for buffer flush
			setTimeout(() => {
				// Since append joins with \n, we need to check the content
				assert(loggedMessages.length >= 1);
				const allMessages = loggedMessages.join('\n');
				assert(allMessages.includes('Buffered message 1'));
				assert(allMessages.includes('Buffered message 2'));
				bufferChannel.dispose();
				done();
			}, 150);
		});

		test('should flush immediately when buffer is full', () => {
			// Create a custom channel with small buffer for testing
			const smallBufferChannel = {
				name: 'test-small-buffer',
				appendLine: (message: string) => loggedMessages.push(message),
				append: (message: string) => {
					// Split the joined messages
					const messages = message.trim().split('\n');
					loggedMessages.push(...messages);
				},
				dispose: () => {},
				show: () => {}
			};

			loggedMessages = []; // Clear messages
			const bufferChannel = new BufferedLogChannel(smallBufferChannel, 1000, 2); // Buffer size of 2
			bufferChannel.appendLine('Message 1');
			bufferChannel.appendLine('Message 2');
			bufferChannel.appendLine('Message 3'); // Should trigger flush

			assert(loggedMessages.length >= 2); // At least first two should be flushed
			bufferChannel.dispose();
		});
	});
});