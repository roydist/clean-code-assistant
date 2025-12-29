// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import { BufferedLogChannel, Logger } from './system/logger';
import { ClassDeclaration, FunctionDeclaration, MethodDeclaration, Node, Project, PropertyDeclaration, SourceFile, SyntaxKind } from 'ts-morph';

export function activate(context: vscode.ExtensionContext) {
	// Configure logger
	const outputChannel = vscode.window.createOutputChannel('Clean Code Assistant', { log: true });
	context.subscriptions.push({
		dispose: () => outputChannel.dispose()
	});

	Logger.configure({
		name: 'Clean Code Assistant',
		createChannel: () => new BufferedLogChannel(outputChannel, 500)
	}, 'info', false);

	Logger.log('Clean Code Assistant activated');

	const srpDiagnostics = vscode.languages.createDiagnosticCollection('srp');
	context.subscriptions.push(srpDiagnostics);

	// track which violations we've already notified the user about per document
	const notifiedViolations = new Map<string, Set<string>>();

	const config = () => vscode.workspace.getConfiguration();

	// Analyze a document for Clean Code and SRP issues using the new algorithm
	function analyzeDocument(document: vscode.TextDocument) {
		const enabled = config().get<boolean>('cleanCodeAssistant.srp.enabled', true);
		if (!enabled) {
			Logger.debug(`Analysis disabled for ${document.uri.fsPath}`);
			srpDiagnostics.delete(document.uri);
			return;
		}

		if (!['typescript', 'javascript', 'typescriptreact', 'javascriptreact'].includes(document.languageId)) {
			Logger.debug(`Skipping non-TypeScript/JavaScript file: ${document.uri.fsPath}`);
			return;
		}

		Logger.debug(`Analyzing document: ${document.uri.fsPath}`);

		const diagnostics: vscode.Diagnostic[] = [];
		const severitySetting = config().get<string>('cleanCodeAssistant.srp.severity', 'warning');
		const severity = severitySetting === 'info' ? vscode.DiagnosticSeverity.Information : vscode.DiagnosticSeverity.Warning;

		try {
			// Step 1: Preprocess and Parse Code
			Logger.debug('Parsing source code with ts-morph');
			const project = new Project();
			const sourceFile = project.createSourceFile('temp.ts', document.getText());

			// Step 2: Identify Code Units
			const classes = sourceFile.getClasses();
			const functions = sourceFile.getFunctions();
			const units = [...classes, ...functions];
			Logger.debug(`Found ${classes.length} classes and ${functions.length} functions to analyze`);

			for (const unit of units) {
				// Step 2.1: Check Readability
				const readabilityScore = evaluateReadability(unit);
				if (readabilityScore < 90) {
					const range = new vscode.Range(document.positionAt(unit.getStart()), document.positionAt(unit.getEnd()));
					const diag = new vscode.Diagnostic(range, `Poor readability: Use meaningful names, consistent formatting. Score: ${readabilityScore}/100`, severity);
					diag.code = 'clean-code-assistant.readability';
					diag.source = 'clean-code-assistant';
					diagnostics.push(diag);
				}

				// Step 2.2: Compute Metrics
				const metrics = computeMetrics(unit);
				if (metrics.lineCount > 15) {
					const range = new vscode.Range(document.positionAt(unit.getStart()), document.positionAt(unit.getEnd()));
					const diag = new vscode.Diagnostic(range, `Large function: ${metrics.lineCount} lines. Consider breaking into smaller functions.`, severity);
					diag.code = 'clean-code-assistant.size';
					diag.source = 'clean-code-assistant';
					diagnostics.push(diag);
				}

				if (metrics.complexity > 8) {
					const range = new vscode.Range(document.positionAt(unit.getStart()), document.positionAt(unit.getEnd()));
					const diag = new vscode.Diagnostic(range, `High complexity: Cyclomatic ${metrics.complexity}. Refactor into smaller functions or use a strategy pattern.`, severity);
					diag.code = 'clean-code-assistant.complexity';
					diag.source = 'clean-code-assistant';
					diagnostics.push(diag);
				}

				if (unit instanceof ClassDeclaration && metrics.methodCount > 10) {
					const range = new vscode.Range(document.positionAt(unit.getStart()), document.positionAt(unit.getEnd()));
					const diag = new vscode.Diagnostic(range, `God class: ${metrics.methodCount} methods. Possible SRP violation.`, severity);
					diag.code = 'clean-code-assistant.god-class';
					diag.source = 'clean-code-assistant';
					diagnostics.push(diag);
				}

				// Step 2.3: Detect SRP Violations
				const responsibilities = identifyResponsibilities(unit);
				if (responsibilities.length > 1) {
					const range = new vscode.Range(document.positionAt(unit.getStart()), document.positionAt(unit.getEnd()));
					const diag = new vscode.Diagnostic(range, `SRP Violation: Unit handles multiple concerns - ${responsibilities.join(', ')}. Split into separate units.`, severity);
					diag.code = 'clean-code-assistant.srp';
					diag.source = 'clean-code-assistant';
					diagnostics.push(diag);
				}

				// Step 2.4: Check Other Clean Code Aspects
				if (hasDuplication(unit)) {
					const range = new vscode.Range(document.positionAt(unit.getStart()), document.positionAt(unit.getEnd()));
					const diag = new vscode.Diagnostic(range, 'Code duplication detected. Extract to shared method.', severity);
					diag.code = 'clean-code-assistant.duplication';
					diag.source = 'clean-code-assistant';
					diagnostics.push(diag);
				}

				if (!isTestable(unit)) {
					const range = new vscode.Range(document.positionAt(unit.getStart()), document.positionAt(unit.getEnd()));
					const diag = new vscode.Diagnostic(range, 'Code not easily testable (tight coupling, globals).', severity);
					diag.code = 'clean-code-assistant.testability';
					diag.source = 'clean-code-assistant';
					diagnostics.push(diag);
				}

				if (hasSideEffects(unit)) {
					const range = new vscode.Range(document.positionAt(unit.getStart()), document.positionAt(unit.getEnd()));
					const diag = new vscode.Diagnostic(range, 'Unexpected side effects.', severity);
					diag.code = 'clean-code-assistant.side-effects';
					diag.source = 'clean-code-assistant';
					diagnostics.push(diag);
				}
			}

			// Step 3: Analyze Dependencies Across Units
			const dependencyGraph = buildDependencyGraph(units);
			const cycles = detectCycles(dependencyGraph);
			for (const cycle of cycles) {
				const cycleRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
				const cycleMessage = `Dependency cycle detected: ${cycle.join(' -> ')}. Refactor to break loops.`;
				const cycleDiag = new vscode.Diagnostic(cycleRange, cycleMessage, severity);
				cycleDiag.code = 'clean-code-assistant.dependency-cycle';
				cycleDiag.source = 'clean-code-assistant';
				diagnostics.push(cycleDiag);
			}

		} catch (error) {
			Logger.error(error, `Error analyzing document ${document.uri.fsPath}`);
			// Fallback to basic analysis if AST parsing fails
			const basicDiags = basicAnalyzeDocument(document, severity);
			diagnostics.push(...basicDiags);
		}

		srpDiagnostics.set(document.uri, diagnostics);
		Logger.debug(`Analysis complete for ${document.uri.fsPath}: ${diagnostics.length} issues found`);

		// Notify user once per detected violation (if enabled)
		const showNotif = config().get<boolean>('cleanCodeAssistant.srp.showNotification', true);
		if (showNotif) {
			const key = document.uri.toString();
			let set = notifiedViolations.get(key);
			if (!set) { set = new Set<string>(); notifiedViolations.set(key, set); }
			for (const d of diagnostics) {
				const violationKey = `${d.code}-${d.range.start.line}`;
				if (!set.has(violationKey)) {
					(async () => {
						const msg = d.message;
						const options = ['Show Problems', 'Apply Suggestion', 'Ignore'];
						const choice = d.severity === vscode.DiagnosticSeverity.Information
							? await vscode.window.showInformationMessage(msg, ...options)
							: await vscode.window.showWarningMessage(msg, ...options);
						if (choice === 'Apply Suggestion') {
							await vscode.commands.executeCommand('clean-code-assistant.extractResponsibility', document.uri);
							set.add(violationKey);
						} else if (choice === 'Show Problems') {
							vscode.commands.executeCommand('workbench.actions.view.problems');
							set.add(violationKey);
						} else if (choice === 'Ignore') {
							set.add(violationKey);
						} else {
							set.add(violationKey);
						}
					})();
				}
			}
		}
	}

	// Helper functions for the algorithm
	function evaluateReadability(unit: ClassDeclaration | FunctionDeclaration): number {
		let score = 100;

		// Check naming conventions
		const name = unit.getName() || '';
		if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(name)) {
			score -= 20;
		}
		if (name.length < 3) {
			score -= 10;
		}
		if (/^[a-z]/.test(name)) {
			score -= 20; // Classes and functions should start with uppercase
		}

		// Check formatting (basic: consistent indentation)
		const text = unit.getText();
		const lines = text.split('\n');
		const indentLevels = lines.map(line => line.length - line.trimStart().length);
		const avgIndent = indentLevels.reduce((a, b) => a + b, 0) / indentLevels.length;
		if (avgIndent < 2 || avgIndent > 4) {
			score -= 15;
		}

		return Math.max(0, score);
	}

	function computeMetrics(unit: ClassDeclaration | FunctionDeclaration): { lineCount: number; methodCount: number; complexity: number } {
		const text = unit.getText();
		const lineCount = text.split('\n').length;

		let methodCount = 0;
		let complexity = 1; // Base complexity

		if (unit instanceof ClassDeclaration) {
			methodCount = unit.getMethods().length;
			// Simple complexity: sum complexities of methods
			for (const method of unit.getMethods()) {
				const body = method.getBody();
				if (body) {
					complexity += body.getDescendantsOfKind(SyntaxKind.IfStatement).length;
					complexity += body.getDescendantsOfKind(SyntaxKind.ForStatement).length;
					complexity += body.getDescendantsOfKind(SyntaxKind.WhileStatement).length;
				}
			}
		} else if (unit instanceof FunctionDeclaration) {
			methodCount = 1; // Functions are single methods
			const body = unit.getBody();
			if (body) {
				complexity += body.getDescendantsOfKind(SyntaxKind.IfStatement).length;
				complexity += body.getDescendantsOfKind(SyntaxKind.ForStatement).length;
				complexity += body.getDescendantsOfKind(SyntaxKind.WhileStatement).length;
			}
		}

		return { lineCount, methodCount, complexity };
	}

	function identifyResponsibilities(unit: ClassDeclaration | FunctionDeclaration): string[] {
		const text = unit.getText().toLowerCase();
		const responsibilities: string[] = [];

		const keywords = {
			'data': ['data', 'database', 'query', 'save', 'load'],
			'ui': ['ui', 'view', 'render', 'display', 'button'],
			'business': ['business', 'logic', 'calculate', 'process'],
			'validation': ['validate', 'check', 'error', 'invalid'],
			'communication': ['email', 'send', 'http', 'api', 'network']
		};

		for (const [resp, words] of Object.entries(keywords)) {
			if (words.some(word => text.includes(word))) {
				responsibilities.push(resp);
			}
		}

		return responsibilities;
	}

	function hasDuplication(unit: ClassDeclaration | FunctionDeclaration): boolean {
		const text = unit.getText();
		const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
		const uniqueLines = new Set(lines);
		return uniqueLines.size < lines.length * 0.8; // If less than 80% unique, likely duplication
	}

	function isTestable(unit: ClassDeclaration | FunctionDeclaration): boolean {
		const text = unit.getText();
		// Simple check: no globals, dependencies injected
		return !/\bnew\s+\w+/.test(text) && !/\bglobal\b|\bwindow\b|\bdocument\b/.test(text);
	}

	function hasSideEffects(unit: ClassDeclaration | FunctionDeclaration): boolean {
		const text = unit.getText();
		// Simple check: modifies external state
		return /\bthis\.\w+\s*=/.test(text) || /\bset\w+/.test(text);
	}



	function buildDependencyGraph(units: (ClassDeclaration | FunctionDeclaration)[]): Map<string, string[]> {
		const graph = new Map<string, string[]>();

		for (const unit of units) {
			const name = unit.getName() || 'anonymous';
			const deps: string[] = [];

			// Detect references to other units
			const text = unit.getText();
			for (const otherUnit of units) {
				const otherName = otherUnit.getName();
				if (otherName && otherName !== name && text.includes(otherName)) {
					deps.push(otherName);
				}
			}

			graph.set(name, deps);
		}

		return graph;
	}

	function detectCycles(graph: Map<string, string[]>): string[][] {
		const cycles: string[][] = [];
		const visited = new Set<string>();
		const recStack = new Set<string>();

		function dfs(node: string, path: string[]) {
			if (recStack.has(node)) {
				const cycleStart = path.indexOf(node);
				cycles.push(path.slice(cycleStart));
				return;
			}

			if (visited.has(node)) return;

			visited.add(node);
			recStack.add(node);
			path.push(node);

			for (const neighbor of graph.get(node) || []) {
				dfs(neighbor, path);
			}

			path.pop();
			recStack.delete(node);
		}

		for (const node of graph.keys()) {
			if (!visited.has(node)) {
				dfs(node, []);
			}
		}

		return cycles;
	}

	// Fallback basic analysis
	function basicAnalyzeDocument(document: vscode.TextDocument, severity: vscode.DiagnosticSeverity) {
		const diagnostics: vscode.Diagnostic[] = [];
		const text = document.getText();

		// Basic checks
		if (text.length > 1000) {
			const range = new vscode.Range(document.positionAt(0), document.positionAt(text.length));
			const diag = new vscode.Diagnostic(range, 'Large file detected. Consider splitting into smaller modules.', severity);
			diag.code = 'clean-code-assistant.large-file';
			diag.source = 'clean-code-assistant';
			diagnostics.push(diag);
		}

		return diagnostics;
	}

	// Helper: find classes and their body ranges (basic brace matching)
	function findClasses(text: string) {
		const results: Array<{name: string; start: number; end: number; bodyText: string}> = [];
		const classRegex = /class\s+([A-Za-z0-9_]+)/g;
		let match: RegExpExecArray | null;
		while ((match = classRegex.exec(text))) {
			const name = match[1];
			let idx = match.index + match[0].length;
			const braceIdx = text.indexOf('{', idx);
			if (braceIdx === -1) continue;
			let depth = 0;
			let i = braceIdx;
			for (; i < text.length; i++) {
				const ch = text[i];
				if (ch === '{') depth++;
				else if (ch === '}') {
					depth--;
					if (depth === 0) break;
				}
			}
			const start = match.index;
			const end = i + 1;
			const bodyText = text.substring(braceIdx + 1, i);
			results.push({name, start, end, bodyText});
		}
		return results;
	}

	// Helper: extract simple methods (name, signature, body) from class body
	function extractMethods(bodyText: string) {
		const results: Array<any> = [];
		// regex to find method signature up to opening brace
		const methodRegex = /(^\s*(?:public|private|protected|static|async|\s)*\s*([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{)/gm;
		let match: RegExpExecArray | null;
		while ((match = methodRegex.exec(bodyText))) {
			const name = match[2];
			const sigIndex = match.index;
			const braceIndex = bodyText.indexOf('{', sigIndex + match[0].length - 1);
			if (braceIndex === -1) continue;
			let depth = 0;
			let i = braceIndex;
			for (; i < bodyText.length; i++) {
				const ch = bodyText[i];
				if (ch === '{') depth++;
				else if (ch === '}') {
					depth--;
					if (depth === 0) break;
				}
			}
			const methodStart = sigIndex;
			const methodEnd = i + 1; // inclusive
			const bodyStart = braceIndex + 1;
			const bodyEnd = i;
			const methodText = bodyText.substring(methodStart, methodEnd);
			const methodBodyText = bodyText.substring(bodyStart, bodyEnd);
			results.push({name, start:methodStart, end:methodEnd, bodyStart, bodyEnd, text: methodText, bodyText: methodBodyText});
		}
		return results;
	}

	// Helper: find this.property occurrences
	function extractThisFields(text: string) {
		const set = new Set<string>();
		const re = /this\.([A-Za-z0-9_]+)/g;
		let m: RegExpExecArray | null;
		while ((m = re.exec(text))) set.add(m[1]);
		return set;
	}

	// Register diagnostics on events
	const openHandler = (doc: vscode.TextDocument) => analyzeDocument(doc);
	context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(openHandler));
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => analyzeDocument(e.document)));
	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc => analyzeDocument(doc)));

	// perform initial analysis for all open documents
	for (const doc of vscode.workspace.textDocuments) analyzeDocument(doc);

	// CodeAction provider for applying a simple extract-refactor
	context.subscriptions.push(vscode.languages.registerCodeActionsProvider(['typescript', 'javascript', 'typescriptreact', 'javascriptreact'], {
		provideCodeActions(document, range, context, token) {
			const actions: vscode.CodeAction[] = [];
			for (const diag of context.diagnostics) {
				if (diag.code === 'clean-code-assistant.srp') {
					const action = new vscode.CodeAction('Extract responsibility into helper class', vscode.CodeActionKind.Refactor);
					action.command = { command: 'clean-code-assistant.extractResponsibility', title: 'Extract responsibility', arguments: [document.uri] };
					action.diagnostics = [diag];
					actions.push(action);
				}
			}
			return actions;
		}
	}));

	// Command: extract responsibility (very small, safe heuristic)
	context.subscriptions.push(vscode.commands.registerCommand('clean-code-assistant.extractResponsibility', async (uri: vscode.Uri) => {
		const document = await vscode.workspace.openTextDocument(uri);
		const text = document.getText();
		const classes = findClasses(text);
		if (classes.length === 0) return vscode.window.showInformationMessage('No classes found to extract.');
		const edits = new vscode.WorkspaceEdit();
		let madeChange = false;
		for (const cls of classes) {
			const methods = extractMethods(cls.bodyText);
			for (const m of methods) {
				m.start = cls.start + m.start;
				m.end = cls.start + m.end;
				m.bodyStart = cls.start + m.bodyStart;
				m.bodyEnd = cls.start + m.bodyEnd;
				m.bodyText = m.bodyText;
				m.fields = extractThisFields(m.bodyText);
			}
			// find a pair with disjoint fields
			let pair: any = null;
			for (let i = 0; i < methods.length; i++) {
				for (let j = i + 1; j < methods.length; j++) {
					const a = methods[i];
					const b = methods[j];
					if (a.name === 'constructor' || b.name === 'constructor') continue;
					const overlap = new Set([...a.fields].filter(x => b.fields.has(x)));
					if (overlap.size === 0 && (a.fields.size > 0 || b.fields.size > 0)) {
						pair = {a, b};
						break;
					}
				}
				if (pair) break;
			}
			if (!pair) continue;

			// choose methods that share fields with pair.b to move
			const toMove = methods.filter(m => m !== pair.a && (m.fields.size > 0) && [...m.fields].every(f => pair.b.fields.has(f)));
			// ensure we move at least one method
			if (toMove.length === 0) toMove.push(pair.b);

			// build new class text
			const newClassName = `${cls.name}Part`;
			let newClassText = `\n\nclass ${newClassName} {\n`;
			for (const m of toMove) {
				// extract the method signature and body as text from the original document
				const methodText = document.getText(new vscode.Range(document.positionAt(m.start), document.positionAt(m.end)));
				newClassText += methodText + '\n';
			}
			newClassText += `}`;

			// replace original methods with delegation
			for (const m of toMove) {
				const originalRange = new vscode.Range(document.positionAt(m.start), document.positionAt(m.end));
				// extract method signature to reuse parameters
				const signatureMatch = /([A-Za-z0-9_]+\s*\([^)]*\))\s*\{/.exec(document.getText(originalRange));
				const signature = signatureMatch ? signatureMatch[1] : m.name + '()';
				const delegated = `${signature} {\n\tconst helper = new ${newClassName}();\n\treturn helper.${m.name}.apply(helper, arguments);\n}`;
				edits.replace(document.uri, originalRange, delegated);
				madeChange = true;
			}

			// append new class at the end of the document
			edits.insert(document.uri, document.positionAt(text.length), newClassText);
		}
		if (!madeChange) return vscode.window.showInformationMessage('No safe extraction found.');
		await vscode.workspace.applyEdit(edits);
		vscode.window.showInformationMessage('SRP extracts applied (basic). Please review changes.');
	}));

	// simple command that runs analysis and (optionally) auto-applies suggestions based on settings
	context.subscriptions.push(vscode.commands.registerCommand('clean-code-assistant.applySrpSuggestions', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) return vscode.window.showInformationMessage('Open a TypeScript or JavaScript file to analyze.');
		await analyzeDocument(editor.document);
		const auto = vscode.workspace.getConfiguration().get<string>('cleanCodeAssistant.srp.autoApply', 'off');
		if (auto === 'safe') {
			vscode.window.showInformationMessage('Running SRP safe auto-apply (no prompt).');
			// for now, just re-run diagnostics; user can use code-action to apply changes.
		} else {
			vscode.window.showInformationMessage('SRP analysis complete. Use the lightbulb or the command palette to apply suggestions.');
		}
	}));
}

export function deactivate() {}

