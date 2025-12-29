import * as assert from 'assert';
// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';

// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	// helper to wait for diagnostics matching predicate
	async function waitForDiagnostics(uri: vscode.Uri, predicate: (diags: vscode.Diagnostic[]) => boolean, timeout = 5000) {
		const start = Date.now();
		while (Date.now() - start < timeout) {
			const diags = vscode.languages.getDiagnostics(uri);
			if (predicate(diags)) return diags;
			await new Promise(r => setTimeout(r, 200));
		}
		return null;
	}

	test('SRP diagnostics are reported and mention violating methods', function (this: Mocha.Context, done) {
		this.timeout(10000);
		(async () => {
			const text = `class UserService {
				createUser(data: any) {
					this.userRepo.save(data);
				}

				sendWelcomeEmail(email: string) {
					this.emailService.sendWelcomeEmail(email);
				}
			}`;

			const doc = await vscode.workspace.openTextDocument({ content: text, language: 'typescript' });
			await vscode.window.showTextDocument(doc);

			const diags = await waitForDiagnostics(doc.uri, (d) => d.some(x => x.source === 'clean-code-assistant' && String(x.code) === 'clean-code-assistant.srp'));
			assert.ok(diags, 'Expected SRP diagnostic to be reported');

			// ensure SRP diagnostic mentions multiple responsibilities
			const msgs = diags.map(d => d.message).join('\n');
			assert.ok(msgs.includes('data'), `Expected diagnostic message to mention 'data' but got:\n${msgs}`);
			assert.ok(msgs.includes('communication'), `Expected diagnostic message to mention 'communication' but got:\n${msgs}`);
			done();
		})().catch(done);
	});

	test('SRP code action available', function (this: Mocha.Context, done) {
		this.timeout(10000);
		(async () => {
			const text = `class UserService {
				createUser(data: any) {
					this.userRepo.save(data);
				}

				sendWelcomeEmail(email: string) {
					this.emailService.sendWelcomeEmail(email);
				}
			}`;

			const doc = await vscode.workspace.openTextDocument({ content: text, language: 'typescript' });
			await vscode.window.showTextDocument(doc);

			// wait for diagnostics first
			await waitForDiagnostics(doc.uri, (d) => d.some(x => x.source === 'clean-code-assistant' && String(x.code) === 'clean-code-assistant.srp'));

			const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
			// request code actions for the document range
			const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>('vscode.executeCodeActionProvider', doc.uri, fullRange);
			const found = (actions || []).some(a => a.title === 'Extract responsibility into helper class');
			assert.ok(found, 'Expected Extract responsibility code action to be available');
			done();
		})().catch(done);
	});

	test('SRP extractResponsibility modifies document', async () => {
		const text = `class UserService {
			createUser(data: any) {
				this.userRepo.save(data);
			}

			sendWelcomeEmail(email: string) {
				this.emailService.sendWelcomeEmail(email);
			}
		}`;

		const doc = await vscode.workspace.openTextDocument({ content: text, language: 'typescript' });
		await vscode.window.showTextDocument(doc);

		// wait for diagnostics
		await waitForDiagnostics(doc.uri, (d) => d.some(x => x.source === 'clean-code-assistant' && String(x.code) === 'clean-code-assistant.srp'));

		// Execute the extract command
		await vscode.commands.executeCommand('clean-code-assistant.extractResponsibility', doc.uri);

		// allow edits to be applied
		await new Promise(r => setTimeout(r, 500));

		const updated = await vscode.workspace.openTextDocument(doc.uri);
		const newText = updated.getText();
		assert.ok(newText.includes('class UserServicePart') || newText.includes('class UserServicePart'), 'Expected a helper class to be added');
		assert.ok(newText.includes('new UserServicePart()') || newText.includes('helper = new UserServicePart'), 'Expected delegation to helper class');
	});

	test('Duplication diagnostics are reported', function (this: Mocha.Context, done) {
		this.timeout(10000);
		(async () => {
			const text = `class DuplicatedClass {
				method1() {
					console.log('This is a duplicated line');
					console.log('This is a duplicated line');
					console.log('This is a duplicated line');
					console.log('This is a duplicated line');
					console.log('This is a duplicated line');
				}

				method2() {
					console.log('This is a duplicated line');
					console.log('This is a duplicated line');
					console.log('This is a duplicated line');
					console.log('This is a duplicated line');
					console.log('This is a duplicated line');
				}
			}`;

			const doc = await vscode.workspace.openTextDocument({ content: text, language: 'typescript' });
			await vscode.window.showTextDocument(doc);

			const diags = await waitForDiagnostics(doc.uri, (d) => d.some(x => x.source === 'clean-code-assistant' && String(x.code) === 'clean-code-assistant.duplication'));
			assert.ok(diags, 'Expected duplication diagnostic to be reported');

			const msgs = diags.map(d => d.message).join('\n');
			assert.ok(msgs.includes('duplication'), `Expected diagnostic message to mention 'duplication' but got:\n${msgs}`);
			done();
		})().catch(done);
	});

	test('Readability diagnostics are reported', function (this: Mocha.Context, done) {
		this.timeout(10000);
		(async () => {
			const text = `class a {
				b() {
					if(true)console.log('bad');for(let i=0;i<10;i++)console.log(i);
				}
			}`;

			const doc = await vscode.workspace.openTextDocument({ content: text, language: 'typescript' });
			await vscode.window.showTextDocument(doc);

			const diags = await waitForDiagnostics(doc.uri, (d) => d.some(x => x.source === 'clean-code-assistant' && String(x.code) === 'clean-code-assistant.readability'));
			assert.ok(diags, 'Expected readability diagnostic to be reported');

			const msgs = diags.map(d => d.message).join('\n');
			assert.ok(msgs.includes('readability'), `Expected diagnostic message to mention 'readability' but got:\n${msgs}`);
			done();
		})().catch(done);
	});

	test('SRP shows notification', function (this: Mocha.Context, done) {
		this.timeout(10000);
		(async () => {
			const origWarn = (vscode.window as any).showWarningMessage;
			const origInfo = (vscode.window as any).showInformationMessage;
			let called = false;
			let message = '';
			(vscode.window as any).showWarningMessage = async (msg: string, ...items: string[]) => { called = true; message = String(msg); return undefined; };
			(vscode.window as any).showInformationMessage = async (msg: string, ...items: string[]) => { called = true; message = String(msg); return undefined; };

			try {
				const text = `class UserService {
					createUser(data: any) {
						this.userRepo.save(data);
					}

					sendWelcomeEmail(email: string) {
						this.emailService.sendWelcomeEmail(email);
					}
				}`;

				const doc = await vscode.workspace.openTextDocument({ content: text, language: 'typescript' });
				await vscode.window.showTextDocument(doc);

				await waitForDiagnostics(doc.uri, (d) => d.some(x => x.source === 'clean-code-assistant' && String(x.code) === 'clean-code-assistant.srp'));
				// allow notification to be shown
				await new Promise(r => setTimeout(r, 500));
				assert.ok(called, 'Expected a notification to be shown');
				assert.ok(message.includes("duplication") || message.includes("violation") || message.includes("readability"), `Unexpected notification message: ${message}`);
			} finally {
				(vscode.window as any).showWarningMessage = origWarn;
				(vscode.window as any).showInformationMessage = origInfo;
			}
			done();
		})().catch(done);
	});

	test('UserManager class with multiple responsibilities', function (this: Mocha.Context, done) {
		this.timeout(10000);
		(async () => {
			const text = `class UserManager {
				constructor(userData: any) {
					this.userData = userData;
				}

				validateUser() {
					if (!this.userData.email || !this.userData.password) {
						throw new Error("Invalid user data");
					}
				}

				saveToDatabase() {
					// Simulate DB save
					console.log("Saving to DB:", this.userData);
					return true;
				}

				sendWelcomeEmail() {
					// Simulate email
					console.log("Sending email to:", this.userData.email);
				}

				processUser() {
					this.validateUser();
					this.saveToDatabase();
					this.sendWelcomeEmail();
				}
			}`;

			const doc = await vscode.workspace.openTextDocument({ content: text, language: 'typescript' });
			await vscode.window.showTextDocument(doc);

			const diags = await waitForDiagnostics(doc.uri, (d) => d.some(x => x.source === 'clean-code-assistant'));
			assert.ok(diags, 'Expected diagnostics to be reported');
			assert.ok(diags!.length > 0, 'Expected diagnostics to be reported');

			const msgs = diags!.map(d => d.message).join('\n');
			assert.ok(msgs.includes('SRP Violation'), `Expected SRP violation for UserManager class: ${msgs}`);
			assert.ok(msgs.includes('data') && msgs.includes('communication'), `Expected data and communication responsibilities: ${msgs}`);
			done();
		})().catch(done);
	});

	test('classify_number function with complex nested conditionals', function (this: Mocha.Context, done) {
		this.timeout(10000);
		(async () => {
			const text = `function classifyNumber(num: number): string {
				if (num < 0) {
					return "Negative";
				} else if (num === 0) {
					return "Zero";
				} else if (num % 2 === 0) {
					if (num % 3 === 0) {
						return "Even and multiple of 3";
					} else if (num % 5 === 0) {
						return "Even and multiple of 5";
					} else {
						return "Even";
					}
				} else {
					if (num % 3 === 0) {
						return "Odd and multiple of 3";
					} else if (num % 5 === 0) {
						return "Odd and multiple of 5";
					} else if (num % 7 === 0) {
						return "Odd and multiple of 7";
					} else {
						return "Odd";
					}
				}
			}`;

			const doc = await vscode.workspace.openTextDocument({ content: text, language: 'typescript' });
			await vscode.window.showTextDocument(doc);

			const diags = await waitForDiagnostics(doc.uri, (d) => d.some(x => x.source === 'clean-code-assistant'));
			assert.ok(diags, 'Expected diagnostics to be reported');
			assert.ok(diags!.length > 0, 'Expected diagnostics to be reported');

			const msgs = diags!.map(d => d.message).join('\n');

			// Expected detections for complex nested conditionals:
			// High complexity: Cyclomatic ~10 (many if/elif)
			assert.ok(msgs.includes('High complexity') && msgs.includes('Cyclomatic'),
				`Expected high complexity warning (cyclomatic ~10): ${msgs}`);

			// Line count >15
			assert.ok(msgs.includes('Large function') && msgs.includes('lines'),
				`Expected line count warning (>15 lines): ${msgs}`);

			// Suggestions: Refactor into smaller functions or use a strategy pattern
			assert.ok(msgs.includes('smaller functions') || msgs.includes('strategy pattern'),
				`Expected refactoring suggestions (smaller functions/strategy pattern): ${msgs}`);

			// Additional detections: readability and duplication
			assert.ok(msgs.includes('readability') || msgs.includes('Poor readability'),
				`Expected readability issues: ${msgs}`);

			assert.ok(msgs.includes('duplication') || msgs.includes('Code duplication'),
				`Expected code duplication detection: ${msgs}`);

			done();
		})().catch(done);
	});
});
