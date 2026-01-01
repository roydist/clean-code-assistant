import * as fs from 'fs';
import * as path from 'path';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import { ClassDeclaration, FunctionDeclaration, MethodDeclaration, Node, Project, PropertyDeclaration, SourceFile, SyntaxKind } from 'ts-morph';

import axios from 'axios';

// Logging utility for extension monitoring
class ExtensionLogger {
	private logFilePath: string;
	private logStream: fs.WriteStream | null = null;

	constructor(context: vscode.ExtensionContext) {
		const logDir = path.join(context.globalStoragePath, 'logs');
		if (!fs.existsSync(logDir)) {
			fs.mkdirSync(logDir, { recursive: true });
		}
		this.logFilePath = path.join(logDir, 'extension.log');
		this.initializeLogStream();
	}

	private initializeLogStream() {
		try {
			this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });
		} catch (error) {
			console.error('Failed to initialize log stream:', error);
		}
	}

	private writeLog(level: string, type: string, name: string, message: string, additionalInfo?: string) {
		const timestamp = new Date().toISOString();
		const logLine = `${level} ${timestamp} ${type} ${name} ${message} ${additionalInfo || ''}`.trim();

		if (this.logStream) {
			this.logStream.write(logLine + '\n');
		}

		// Also log to console for development
		console.log(`[CleanCodeAssistant] ${logLine}`);
	}

	log(level: string, type: string, name: string, message: string, additionalInfo?: any) {
		const additionalInfoStr = additionalInfo ? JSON.stringify(additionalInfo) : '';
		this.writeLog(level, type, name, message, additionalInfoStr);
	}

	logAnalysis(uri: string, unitType: string, unitName: string, violations: number) {
		this.log('INFO', 'analysis', unitName, `Analysis completed for ${unitType}`, `uri=${uri},violations=${violations}`);
	}

	logCommand(command: string, params?: any) {
		const additionalInfo = params ? JSON.stringify(params) : '';
		this.log('INFO', 'command', command, 'Command executed', additionalInfo);
	}

	logEvent(type: string, name: string, message: string, additionalInfo?: any) {
		const additionalInfoStr = additionalInfo ? JSON.stringify(additionalInfo) : '';
		this.log('INFO', type, name, message, additionalInfoStr);
	}

	logError(type: string, name: string, message: string, error?: any) {
		const errorInfo = error ? (error instanceof Error ? error.message : JSON.stringify(error)) : '';
		this.log('ERROR', type, name, message, errorInfo);
	}

	dispose() {
		if (this.logStream) {
			this.logStream.end();
		}
	}
}

export function activate(context: vscode.ExtensionContext) {
	const srpDiagnostics = vscode.languages.createDiagnosticCollection('srp');
	context.subscriptions.push(srpDiagnostics);

	// Initialize logger for monitoring
	const logger = new ExtensionLogger(context);
	context.subscriptions.push({ dispose: () => logger.dispose() });

	// track which violations we've already notified the user about per document
	const notifiedViolations = new Map<string, Set<string>>();

	// map for per-document violations: uri -> Violation[]
	type Violation = {
		id: string;
		message: string;
		range: vscode.Range;
		severity: vscode.DiagnosticSeverity;
		source?: string;
	};
	const violationMap = new Map<string, Violation[]>();

	const config = () => vscode.workspace.getConfiguration();

	// LLM-based analysis for deeper clean code insights
	async function analyzeWithLLM(document: vscode.TextDocument, existingDiagnostics: vscode.Diagnostic[]): Promise<vscode.Diagnostic[]> {
		const llmEnabled = config().get<boolean>('cleanCodeAssistant.llm.enabled', false);
		const apiKey = config().get<string>('cleanCodeAssistant.llm.apiKey', '');
		const endpoint = config().get<string>('cleanCodeAssistant.llm.endpoint', 'https://api.x.ai/v1/chat/completions');
		const model = config().get<string>('cleanCodeAssistant.llm.model', 'grok-beta');

		if (!llmEnabled || !apiKey) {
			return existingDiagnostics;
		}

		try {
			const codeSnippet = document.getText();
			const prompt = `Analyze the following TypeScript/JavaScript code for clean code violations and provide specific, actionable feedback. Focus on:

1. Code smells and anti-patterns
2. SOLID principle violations
3. Readability and maintainability issues
4. Performance concerns
5. Security vulnerabilities

Format your response as a JSON array of violation objects with the following structure:
[
  {
    "type": "readability|maintainability|performance|security|solid",
    "severity": "low|medium|high",
    "message": "Brief description of the violation",
    "line": 42,
    "suggestion": "How to fix it"
  }
]

Code to analyze:
\\\`\\\`\\\`
${codeSnippet}
\\\`\\\`\\\`

Respond only with the JSON array, no additional text.`;

			const response = await axios.post(endpoint, {
				model: model,
				messages: [{ role: 'user', content: prompt }],
				max_tokens: 2000,
				temperature: 0.3
			}, {
				headers: {
					'Authorization': `Bearer ${apiKey}`,
					'Content-Type': 'application/json'
				},
				timeout: 30000
			});

			const llmResponse = response.data.choices[0].message.content;
			const violations = JSON.parse(llmResponse);

			const llmDiagnostics: vscode.Diagnostic[] = [];
			for (const violation of violations) {
				const line = Math.max(0, Math.min(violation.line - 1, document.lineCount - 1));
				const range = new vscode.Range(line, 0, line, document.lineAt(line).text.length);

				let severity: vscode.DiagnosticSeverity;
				switch (violation.severity) {
					case 'high': severity = vscode.DiagnosticSeverity.Error; break;
					case 'medium': severity = vscode.DiagnosticSeverity.Warning; break;
					case 'low': severity = vscode.DiagnosticSeverity.Information; break;
					default: severity = vscode.DiagnosticSeverity.Warning;
				}

				const diagnostic = new vscode.Diagnostic(
					range,
					`LLM Analysis: ${violation.message}${violation.suggestion ? ` Suggestion: ${violation.suggestion}` : ''}`,
					severity
				);
				diagnostic.code = `llm-${violation.type}`;
				diagnostic.source = 'clean-code-assistant-llm';
				llmDiagnostics.push(diagnostic);
			}

			logger.log('INFO', 'llm', 'analysis', `LLM analysis completed with ${llmDiagnostics.length} violations`, { uri: document.uri.toString() });
			return [...existingDiagnostics, ...llmDiagnostics];

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.log('ERROR', 'llm', 'analysis', 'LLM analysis failed', { error: errorMessage, uri: document.uri.toString() });
			// Return existing diagnostics if LLM fails
			return existingDiagnostics;
		}
	}

	// Analyze a document for Clean Code and SRP issues using the new algorithm
	async function analyzeDocument(document: vscode.TextDocument) {
		logger.logEvent('document', 'analysis', 'Starting full document analysis', { uri: document.uri.toString() });

		const enabled = config().get<boolean>('cleanCodeAssistant.srp.enabled', true);
		if (!enabled) {
			logger.logEvent('document', 'analysis', 'Analysis disabled, clearing diagnostics', { uri: document.uri.toString() });
			srpDiagnostics.delete(document.uri);
			return;
		}

		if (!['typescript', 'javascript', 'typescriptreact', 'javascriptreact'].includes(document.languageId)) {
			logger.logEvent('document', 'analysis', 'Unsupported language, skipping analysis', { languageId: document.languageId });
			return;
		}

		const diagnostics: vscode.Diagnostic[] = [];
		const severitySetting = config().get<string>('cleanCodeAssistant.srp.severity', 'warning');
		const severity = severitySetting === 'info' ? vscode.DiagnosticSeverity.Information : vscode.DiagnosticSeverity.Warning;

		try {
			// Step 1: Preprocess and Parse Code
			const project = new Project();
			const sourceFile = project.createSourceFile('temp.ts', document.getText());

			// Step 2: Identify Code Units
			const classes = sourceFile.getClasses();
			const functions = sourceFile.getFunctions();
			const units = [...classes, ...functions];

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

		// Cross-unit duplication detection (simple similarity measure)
		const functionsOnly = sourceFile.getFunctions();
		for (let i = 0; i < functionsOnly.length; i++) {
			for (let j = i + 1; j < functionsOnly.length; j++) {
				const a = functionsOnly[i];
				const b = functionsOnly[j];
				const sim = textSimilarity(a.getText(), b.getText());
				if (sim > 0.6) {
					const rangeA = new vscode.Range(document.positionAt(a.getStart()), document.positionAt(a.getEnd()));
					const rangeB = new vscode.Range(document.positionAt(b.getStart()), document.positionAt(b.getEnd()));
					const msgA = `Code duplication: Similar logic to function ${b.getName() || 'anonymous'}.`;
					const msgB = `Code duplication: Similar logic to function ${a.getName() || 'anonymous'}.`;
					const diagA = new vscode.Diagnostic(rangeA, msgA, severity);
					diagA.code = 'clean-code-assistant.duplication';
					diagA.source = 'clean-code-assistant';
					const diagB = new vscode.Diagnostic(rangeB, msgB, severity);
					diagB.code = 'clean-code-assistant.duplication';
					diagB.source = 'clean-code-assistant';
					diagnostics.push(diagA, diagB);
					}
				}
			}
		} catch (error) {
			// Fallback to basic analysis if AST parsing fails
			const basicDiags = basicAnalyzeDocument(document, severity);
			diagnostics.push(...basicDiags);
			// also add an error diagnostic so failures are visible
			const errRange = new vscode.Range(new vscode.Position(0,0), new vscode.Position(0,0));
			const errDiag = new vscode.Diagnostic(errRange, `Analysis error: ${String(error)}`, vscode.DiagnosticSeverity.Error);
			errDiag.source = 'clean-code-assistant';
			diagnostics.push(errDiag);
		}

		// Perform LLM-based analysis if enabled
		const finalDiagnostics = await analyzeWithLLM(document, diagnostics);

		// Populate violation map for this document
		const vlist: Violation[] = finalDiagnostics.map(d => ({
			id: `${document.uri.toString()}#${d.range.start.line}#${String(d.code)}`,
			message: d.message,
			range: d.range,
			severity: d.severity,
			source: d.source as string
		}));
		if (vlist.length > 0) violationMap.set(document.uri.toString(), vlist);
		else violationMap.delete(document.uri.toString());

		// Set diagnostics on the document
		srpDiagnostics.set(document.uri, finalDiagnostics);

		// Notify user once per detected violation (if enabled)
		const showNotif = config().get<boolean>('cleanCodeAssistant.srp.showNotification', true);
		const enableGoTo = config().get<boolean>('cleanCodeAssistant.notifications.enableGoToViolation', true);
		if (showNotif) {
			const key = document.uri.toString();
			let set = notifiedViolations.get(key);
			if (!set) { set = new Set<string>(); notifiedViolations.set(key, set); }
			for (const d of finalDiagnostics) {
				const violationKey = `${d.code}-${d.range.start.line}`;
				if (!set.has(violationKey)) {
					(async () => {
						const msg = d.message;
						const goLabel = 'Go to Violation';
						const options = enableGoTo ? [goLabel, 'Show Problems', 'Apply Suggestion', 'Ignore'] : ['Show Problems', 'Apply Suggestion', 'Ignore'];
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
						} else if (choice === goLabel) {
							// invoke goToViolation command with a serializable range
							await vscode.commands.executeCommand('clean-code-assistant.goToViolation', document.uri.toString(), {
								start: { line: d.range.start.line, character: d.range.start.character },
								end: { line: d.range.end.line, character: d.range.end.character }
							});
							// keep the notification visible by showing follow-up options (without Go)
							const followOptions = ['Show Problems', 'Apply Suggestion', 'Ignore'];
							const followChoice = d.severity === vscode.DiagnosticSeverity.Information
								? await vscode.window.showInformationMessage(msg, ...followOptions)
								: await vscode.window.showWarningMessage(msg, ...followOptions);
							if (followChoice === 'Apply Suggestion') {
								await vscode.commands.executeCommand('clean-code-assistant.extractResponsibility', document.uri);
								set.add(violationKey);
							} else if (followChoice === 'Show Problems') {
								vscode.commands.executeCommand('workbench.actions.view.problems');
								set.add(violationKey);
							} else if (followChoice === 'Ignore') {
								set.add(violationKey);
							} else {
								set.add(violationKey);
							}
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

	// Normalize code by replacing identifiers with a placeholder and removing whitespace
	function normalizeForDuplication(s: string) {
		return s.replace(/\b[A-Za-z_]\w*\b/g, 'id').replace(/\s+/g, ' ').trim();
	}

	function levenshtein(a: string, b: string): number {
		const m = a.length, n = b.length;
		const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
		for (let i = 0; i <= m; i++) dp[i][0] = i;
		for (let j = 0; j <= n; j++) dp[0][j] = j;
		for (let i = 1; i <= m; i++) {
			for (let j = 1; j <= n; j++) {
				dp[i][j] = Math.min(
					dp[i-1][j] + 1,
					dp[i][j-1] + 1,
					dp[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1)
				);
			}
		}
		return dp[m][n];
	}

	function textSimilarity(a: string, b: string): number {
		const na = normalizeForDuplication(a);
		const nb = normalizeForDuplication(b);
		// avoid heavy computation on very large functions
		if (na.length > 1000 || nb.length > 1000) return 0;
		if (!na.length && !nb.length) return 1;
		const dist = levenshtein(na, nb);
		return 1 - (dist / Math.max(na.length, nb.length));
	}

	function isTestable(unit: ClassDeclaration | FunctionDeclaration): boolean {
		const text = unit.getText();
		// Simple check: no globals, dependencies injected
		// Also consider console usage and bare identifier assignments as indicators of poor testability
		const hasGlobals = /\bglobal\b|\bwindow\b|\bdocument\b/.test(text);
		const hasConsole = /\bconsole\.(log|error|warn)\b/.test(text);
		const bareAssignment = /(^|[^.])\b([A-Za-z_]\w*)\s*([+\-*/]?=)\s*/m.test(text); // assignment to bare identifier
		return !/\bnew\s+\w+/.test(text) && !hasGlobals && !hasConsole && !bareAssignment;
	}

	function hasSideEffects(unit: ClassDeclaration | FunctionDeclaration): boolean {
		const text = unit.getText();
		// Enhanced check: modifies external state (this.x =, bare identifier assignment), or performs I/O like console.log
		const modifiesThis = /\bthis\.\w+\s*=/.test(text);
		const consoleIo = /\bconsole\.(log|error|warn)\b/.test(text);
		// detect bare identifier assignment (e.g., globalCounter += value)
		const bareAssignment = /(^|[^.])\b([A-Za-z_]\w*)\s*([+\-*/]?=)\s*/m.test(text);
		return modifiesThis || consoleIo || bareAssignment;
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

	// Debounced analysis for functions/classes when editing is complete
	let analysisTimeout: NodeJS.Timeout | null = null;
	let lastAnalyzedUnit: { uri: string; start: number; end: number } | null = null;

	function debounceAnalyzeUnit(document: vscode.TextDocument, unitRange: vscode.Range) {
		logger.logEvent('unit', 'debounce', 'Debounced analysis triggered', { uri: document.uri.toString(), range: unitRange });

		if (analysisTimeout) {
			clearTimeout(analysisTimeout);
		}

		analysisTimeout = setTimeout(() => {
			analyzeUnit(document, unitRange);
			lastAnalyzedUnit = {
				uri: document.uri.toString(),
				start: unitRange.start.line,
				end: unitRange.end.line
			};
		}, 1500); // Wait 1.5 seconds after editing stops
	}

	// Track cursor position to detect when user moves away from a unit
	let lastCursorPosition: vscode.Position | null = null;

	context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(event => {
		const editor = event.textEditor;
		const document = editor.document;

		if (!['typescript', 'javascript', 'typescriptreact', 'javascriptreact'].includes(document.languageId)) {
			return;
		}

		const currentPosition = event.selections[0]?.active;
		if (!currentPosition || currentPosition.isEqual(lastCursorPosition || new vscode.Position(0, 0))) {
			return;
		}

		lastCursorPosition = currentPosition;

		// Find if cursor is now outside the last analyzed unit
		if (lastAnalyzedUnit && lastAnalyzedUnit.uri === document.uri.toString()) {
			const unitRange = new vscode.Range(
				new vscode.Position(lastAnalyzedUnit.start, 0),
				new vscode.Position(lastAnalyzedUnit.end, 0)
			);

			if (!unitRange.contains(currentPosition)) {
				// Cursor moved outside the unit, trigger analysis if there was pending editing
				if (analysisTimeout) {
					clearTimeout(analysisTimeout);
					analyzeUnit(document, unitRange);
					lastAnalyzedUnit = null;
					logger.logEvent('unit', 'cursor', 'Cursor moved away from unit, triggering immediate analysis');
				}
			}
		}
	}));

	// Register diagnostics on events
	const openHandler = (doc: vscode.TextDocument) => {
		logger.logEvent('document', 'open', 'Document opened for analysis', { uri: doc.uri.toString() });
		analyzeDocument(doc);
	};
	context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(openHandler));

	// Changed: Only analyze on document changes when within a unit (debounced)
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => {
		const document = e.document;
		if (!['typescript', 'javascript', 'typescriptreact', 'javascriptreact'].includes(document.languageId)) {
			return;
		}

		// Find the unit being edited
		const unitRange = findUnitAtPosition(document, e.contentChanges[0]?.range.start || new vscode.Position(0, 0));
		if (unitRange) {
			debounceAnalyzeUnit(document, unitRange);
		}
	}));

	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc => {
		logger.logEvent('document', 'save', 'Document saved, running full analysis', { uri: doc.uri.toString() });
		analyzeDocument(doc);
	}));

	// perform initial analysis for all open documents
	for (const doc of vscode.workspace.textDocuments) {
		logger.logEvent('document', 'initial', 'Initial analysis for open document', { uri: doc.uri.toString() });
		analyzeDocument(doc);
	}

	// Helper function to find the function or class at a given position
	function findUnitAtPosition(document: vscode.TextDocument, position: vscode.Position): vscode.Range | null {
		try {
			const project = new Project();
			const sourceFile = project.createSourceFile('temp.ts', document.getText());

			const classes = sourceFile.getClasses();
			const functions = sourceFile.getFunctions();

			const units = [...classes, ...functions];

			for (const unit of units) {
				const start = document.positionAt(unit.getStart());
				const end = document.positionAt(unit.getEnd());

				const unitRange = new vscode.Range(start, end);
				if (unitRange.contains(position)) {
					return unitRange;
				}
			}
		} catch (error) {
			logger.logError('unit', 'position', 'Error finding unit at position', { error: String(error), position });
		}

		return null;
	}

	// Analyze a specific unit (function or class) instead of the whole document
	function analyzeUnit(document: vscode.TextDocument, unitRange: vscode.Range) {
		logger.logEvent('unit', 'analysis', 'Starting unit analysis', {
			uri: document.uri.toString(),
			range: { start: unitRange.start.line, end: unitRange.end.line }
		});

		let unitType = 'unknown';
		let unitName = 'unknown';

		const enabled = config().get<boolean>('cleanCodeAssistant.srp.enabled', true);
		if (!enabled) {
			return;
		}

		if (!['typescript', 'javascript', 'typescriptreact', 'javascriptreact'].includes(document.languageId)) {
			return;
		}

		const diagnostics: vscode.Diagnostic[] = [];
		const severitySetting = config().get<string>('cleanCodeAssistant.srp.severity', 'warning');
		const severity = severitySetting === 'info' ? vscode.DiagnosticSeverity.Information : vscode.DiagnosticSeverity.Warning;

		try {
			const project = new Project();
			const sourceFile = project.createSourceFile('temp.ts', document.getText());

			// Find the specific unit at the range
			const classes = sourceFile.getClasses();
			const functions = sourceFile.getFunctions();
			const units = [...classes, ...functions];

			let targetUnit: ClassDeclaration | FunctionDeclaration | null = null;
			for (const unit of units) {
				const start = document.positionAt(unit.getStart());
				const end = document.positionAt(unit.getEnd());
				const currentRange = new vscode.Range(start, end);

				if (currentRange.start.line === unitRange.start.line && currentRange.end.line === unitRange.end.line) {
					targetUnit = unit;
					break;
				}
			}

			if (!targetUnit) {
				logger.logEvent('unit', 'analysis', 'No unit found at specified range');
				return;
			}

			unitName = targetUnit.getName() || 'anonymous';
			unitType = targetUnit instanceof ClassDeclaration ? 'class' : 'function';

			logger.logEvent('unit', 'analysis', `Analyzing ${unitType}: ${unitName}`);

			// Step 2.1: Check Readability
			const readabilityScore = evaluateReadability(targetUnit);
			if (readabilityScore < 90) {
				const range = new vscode.Range(document.positionAt(targetUnit.getStart()), document.positionAt(targetUnit.getEnd()));
				const diag = new vscode.Diagnostic(range, `Poor readability: Use meaningful names, consistent formatting. Score: ${readabilityScore}/100`, severity);
				diag.code = 'clean-code-assistant.readability';
				diag.source = 'clean-code-assistant';
				diagnostics.push(diag);
			}

			// Step 2.2: Compute Metrics
			const metrics = computeMetrics(targetUnit);
			if (metrics.lineCount > 15) {
				const range = new vscode.Range(document.positionAt(targetUnit.getStart()), document.positionAt(targetUnit.getEnd()));
				const diag = new vscode.Diagnostic(range, `Large ${unitType}: ${metrics.lineCount} lines. Consider breaking into smaller ${unitType === 'class' ? 'classes' : 'functions'}.`, severity);
				diag.code = 'clean-code-assistant.size';
				diag.source = 'clean-code-assistant';
				diagnostics.push(diag);
			}

			if (metrics.complexity > 8) {
				const range = new vscode.Range(document.positionAt(targetUnit.getStart()), document.positionAt(targetUnit.getEnd()));
				const diag = new vscode.Diagnostic(range, `High complexity: Cyclomatic ${metrics.complexity}. Refactor into smaller ${unitType === 'class' ? 'classes' : 'functions'} or use a strategy pattern.`, severity);
				diag.code = 'clean-code-assistant.complexity';
				diag.source = 'clean-code-assistant';
				diagnostics.push(diag);
			}

			if (targetUnit instanceof ClassDeclaration && metrics.methodCount > 10) {
				const range = new vscode.Range(document.positionAt(targetUnit.getStart()), document.positionAt(targetUnit.getEnd()));
				const diag = new vscode.Diagnostic(range, `God class: ${metrics.methodCount} methods. Possible SRP violation.`, severity);
				diag.code = 'clean-code-assistant.god-class';
				diag.source = 'clean-code-assistant';
				diagnostics.push(diag);
			}

			// Step 2.3: Detect SRP Violations
			const responsibilities = identifyResponsibilities(targetUnit);
			if (responsibilities.length > 1) {
				const range = new vscode.Range(document.positionAt(targetUnit.getStart()), document.positionAt(targetUnit.getEnd()));
				const diag = new vscode.Diagnostic(range, `SRP Violation: ${unitType} handles multiple concerns - ${responsibilities.join(', ')}. Split into separate ${unitType === 'class' ? 'classes' : 'functions'}.`, severity);
				diag.code = 'clean-code-assistant.srp';
				diag.source = 'clean-code-assistant';
				diagnostics.push(diag);
			}

			// Step 2.4: Check Other Clean Code Aspects
			if (hasDuplication(targetUnit)) {
				const range = new vscode.Range(document.positionAt(targetUnit.getStart()), document.positionAt(targetUnit.getEnd()));
				const diag = new vscode.Diagnostic(range, 'Code duplication detected. Extract to shared method.', severity);
				diag.code = 'clean-code-assistant.duplication';
				diag.source = 'clean-code-assistant';
				diagnostics.push(diag);
			}

			if (!isTestable(targetUnit)) {
				const range = new vscode.Range(document.positionAt(targetUnit.getStart()), document.positionAt(targetUnit.getEnd()));
				const diag = new vscode.Diagnostic(range, 'Code not easily testable (tight coupling, globals).', severity);
				diag.code = 'clean-code-assistant.testability';
				diag.source = 'clean-code-assistant';
				diagnostics.push(diag);
			}

			if (hasSideEffects(targetUnit)) {
				const range = new vscode.Range(document.positionAt(targetUnit.getStart()), document.positionAt(targetUnit.getEnd()));
				const diag = new vscode.Diagnostic(range, 'Unexpected side effects.', severity);
				diag.code = 'clean-code-assistant.side-effects';
				diag.source = 'clean-code-assistant';
				diagnostics.push(diag);
			}

		} catch (error) {
			logger.logError('unit', 'analysis', 'Error analyzing unit', { error: String(error) });
			// Fallback to basic analysis for the unit
			const basicDiags = basicAnalyzeUnit(document, unitRange, severity);
			diagnostics.push(...basicDiags);
		}

		// Update diagnostics for this document
		const existingDiagnostics = srpDiagnostics.get(document.uri) || [];
		const filteredDiagnostics = existingDiagnostics.filter(diag => !unitRange.contains(diag.range.start));

		// Add new diagnostics for this unit
		filteredDiagnostics.push(...diagnostics);

		srpDiagnostics.set(document.uri, filteredDiagnostics);

		// Log the analysis completion
		logger.logAnalysis(document.uri.toString(), unitType, unitName, diagnostics.length);

		// Populate violation map for this document
		const vlist: Violation[] = diagnostics.map(d => ({
			id: `${document.uri.toString()}#${d.range.start.line}#${String(d.code)}`,
			message: d.message,
			range: d.range,
			severity: d.severity,
			source: d.source as string
		}));

		const existingViolations = violationMap.get(document.uri.toString()) || [];
		const filteredViolations = existingViolations.filter(v => !unitRange.contains(v.range.start));
		filteredViolations.push(...vlist);

		if (filteredViolations.length > 0) {
			violationMap.set(document.uri.toString(), filteredViolations);
		} else {
			violationMap.delete(document.uri.toString());
		}

		// Notify user once per detected violation (if enabled)
		const showNotif = config().get<boolean>('cleanCodeAssistant.srp.showNotification', true);
		const enableGoTo = config().get<boolean>('cleanCodeAssistant.notifications.enableGoToViolation', true);

		if (showNotif && diagnostics.length > 0) {
			const key = document.uri.toString();
			let set = notifiedViolations.get(key);
			if (!set) { set = new Set<string>(); notifiedViolations.set(key, set); }

			for (const d of diagnostics) {
				const violationKey = `${d.code}-${d.range.start.line}`;
				if (!set.has(violationKey)) {
					(async () => {
						const msg = d.message;
						const goLabel = 'Go to Violation';
						const options = enableGoTo ? [goLabel, 'Show Problems', 'Apply Suggestion', 'Ignore'] : ['Show Problems', 'Apply Suggestion', 'Ignore'];
						const choice = d.severity === vscode.DiagnosticSeverity.Information
							? await vscode.window.showInformationMessage(msg, ...options)
							: await vscode.window.showWarningMessage(msg, ...options);

						logger.logEvent('notification', 'response', 'User responded to violation notification', { choice, violation: violationKey });

						if (choice === 'Apply Suggestion') {
							await vscode.commands.executeCommand('clean-code-assistant.extractResponsibility', document.uri);
							set.add(violationKey);
						} else if (choice === 'Show Problems') {
							vscode.commands.executeCommand('workbench.actions.view.problems');
							set.add(violationKey);
						} else if (choice === 'Ignore') {
							set.add(violationKey);
						} else if (choice === goLabel) {
							await vscode.commands.executeCommand('clean-code-assistant.goToViolation', document.uri.toString(), {
								start: { line: d.range.start.line, character: d.range.start.character },
								end: { line: d.range.end.line, character: d.range.end.character }
							});
							set.add(violationKey);
						} else {
							set.add(violationKey);
						}
					})();
				}
			}
		}
	}

	// Basic analysis fallback for a specific unit
	function basicAnalyzeUnit(document: vscode.TextDocument, unitRange: vscode.Range, severity: vscode.DiagnosticSeverity): vscode.Diagnostic[] {
		const diagnostics: vscode.Diagnostic[] = [];
		const text = document.getText(unitRange);

		// Basic checks
		if (text.split('\n').length > 15) {
			const diag = new vscode.Diagnostic(unitRange, 'Large code unit detected. Consider breaking into smaller units.', severity);
			diag.code = 'clean-code-assistant.size';
			diag.source = 'clean-code-assistant';
			diagnostics.push(diag);
		}

		if (text.includes('console.')) {
			const diag = new vscode.Diagnostic(unitRange, 'Console usage detected. Consider proper logging.', severity);
			diag.code = 'clean-code-assistant.side-effects';
			diag.source = 'clean-code-assistant';
			diagnostics.push(diag);
		}

		return diagnostics;
	}

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

	// Command: go to violation (open file and reveal range)
	context.subscriptions.push(vscode.commands.registerCommand('clean-code-assistant.goToViolation', async (uriString: string, rangeObj?: any) => {
		logger.logCommand('goToViolation', { uriString, rangeObj });
		try {
			const uri = vscode.Uri.parse(uriString);
			const doc = await vscode.workspace.openTextDocument(uri);
			const editor = await vscode.window.showTextDocument(doc, { preview: false });
			let range: vscode.Range | undefined;
			if (rangeObj instanceof vscode.Range) range = rangeObj;
			else if (rangeObj && rangeObj.start && rangeObj.end) {
				range = new vscode.Range(new vscode.Position(rangeObj.start.line, rangeObj.start.character), new vscode.Position(rangeObj.end.line, rangeObj.end.character));
			}
			if (!range) {
				// fallback: select start of document
				range = new vscode.Range(new vscode.Position(0,0), new vscode.Position(0,0));
			}
			// clamp to existing document and reduce selection to the specific start line only
			const maxLine = Math.max(0, doc.lineCount - 1);
			const startLine = Math.min(range.start.line, maxLine);
			const line = doc.lineAt(startLine);
			const lineRange = line.range; // full line range
			range = new vscode.Range(lineRange.start, lineRange.end);
			editor.selection = new vscode.Selection(range.start, range.end);
			editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
		} catch (err) {
			logger.logError('command', 'goToViolation', 'Error in goToViolation command', { error: (err as Error).message });
			vscode.window.showErrorMessage('Unable to open file for violation: ' + (err as Error).message);
		}
	}));

	// Command: extract responsibility (very small, safe heuristic)
	context.subscriptions.push(vscode.commands.registerCommand('clean-code-assistant.extractResponsibility', async (uri: vscode.Uri) => {
		logger.logCommand('extractResponsibility', { uri: uri.toString() });
		const document = await vscode.workspace.openTextDocument(uri);
		const text = document.getText();
		const classes = findClasses(text);
		if (classes.length === 0) {
			logger.logEvent('command', 'extractResponsibility', 'No classes found for extraction', { uri: uri.toString() });
			return vscode.window.showInformationMessage('No classes found to extract.');
		}
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
		if (!madeChange) {
			logger.logEvent('command', 'extractResponsibility', 'No safe extraction found', { uri: uri.toString() });
			return vscode.window.showInformationMessage('No safe extraction found.');
		}
		await vscode.workspace.applyEdit(edits);
		logger.logEvent('command', 'extractResponsibility', 'SRP extraction completed', { uri: uri.toString(), madeChanges: true });
		vscode.window.showInformationMessage('SRP extracts applied (basic). Please review changes.');
	}));

	// simple command that runs analysis and (optionally) auto-applies suggestions based on settings
	context.subscriptions.push(vscode.commands.registerCommand('clean-code-assistant.applySrpSuggestions', async () => {
		logger.logCommand('applySrpSuggestions');
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			logger.logEvent('command', 'applySrpSuggestions', 'No active editor for applySrpSuggestions');
			return vscode.window.showInformationMessage('Open a TypeScript or JavaScript file to analyze.');
		}
		await analyzeDocument(editor.document);
		const auto = vscode.workspace.getConfiguration().get<string>('cleanCodeAssistant.srp.autoApply', 'off');
		if (auto === 'safe') {
			logger.logEvent('command', 'applySrpSuggestions', 'Auto-applying SRP suggestions (safe mode)');
			vscode.window.showInformationMessage('Running SRP safe auto-apply (no prompt).');
			// for now, just re-run diagnostics; user can use code-action to apply changes.
		} else {
			logger.logEvent('command', 'applySrpSuggestions', 'SRP analysis completed manually');
			vscode.window.showInformationMessage('SRP analysis complete. Use the lightbulb or the command palette to apply suggestions.');
		}
	}));
}

export function deactivate() {}

