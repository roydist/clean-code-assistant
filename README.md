# Clean Code Assistant

A comprehensive VS Code extension that analyzes TypeScript and JavaScript code for Clean Code principles. It detects violations in readability, Single Responsibility Principle (SRP), duplication, testability, side effects, and more, providing diagnostics, code actions, and automated refactorings to improve code quality.

## Quick Start

* Open a TypeScript or JavaScript file.
* Clean Code diagnostics appear automatically in the editor; use the lightbulb for code actions.
* Run the command **Clean Code: Apply SRP suggestions** from the Command Palette to analyze the current file.
* View the overall Clean Code score and detailed feedback on various code quality aspects.

## Features

### Clean Code Analysis 🔧
* **Readability Analysis**: Evaluates naming conventions, formatting, and code structure for better readability.
* **Single Responsibility Principle (SRP) Detection**: Identifies classes and functions handling multiple concerns.
* **Code Duplication Detection**: Flags repeated code blocks that should be extracted.
* **Testability Assessment**: Checks for tight coupling and dependencies that hinder testing.
* **Side Effects Analysis**: Detects unexpected modifications to external state.
* **Metrics Calculation**: Computes complexity, size, and other metrics for code units.
* **Dependency Cycle Detection**: Identifies circular dependencies between code units.
* **Overall Clean Code Score**: Provides a comprehensive score and recommendations.
* **Code Actions**: Offers quick fixes and refactoring suggestions.
* **Notifications**: Shows feedback on detected issues with configurable severity.

### Advanced Logging System 📊
* **GitLens-Inspired Logger**: Comprehensive logging system with professional features:
  - **Multiple Log Levels**: Debug, Info, Warning, Error with configurable filtering
  - **Scoped Logging**: Hierarchical log scopes with unique IDs for contextual tracking
  - **Automatic Method Logging**: TypeScript decorators for seamless method timing and logging
  - **High-Resolution Timing**: Uses Node.js `process.hrtime()` for precise performance measurements
  - **Sensitive Data Sanitization**: Automatically masks passwords, tokens, and access tokens
  - **Buffered Output**: Efficient buffering to prevent performance issues during heavy logging
  - **VS Code Integration**: Direct integration with VS Code Output Channel
  - **Disposable Scopes**: Proper resource management with `Symbol.dispose` support

---

## Clean Code Analysis 🔧

**Short description**  
A comprehensive analyzer that detects various Clean Code violations and suggests refactorings to improve code quality, maintainability, and readability.

## LLM-Powered Analysis

The extension supports advanced analysis using X AI's language models for deeper insights into code quality issues. To enable LLM analysis:

1. Get an X AI API key from [x.ai](https://x.ai)
2. Set the API key in VS Code settings: `cleanCodeAssistant.llm.apiKey`
3. Enable LLM analysis: `cleanCodeAssistant.llm.enabled`
4. Configure the model and endpoint if needed

The LLM analysis provides additional violation types including security vulnerabilities, performance concerns, and advanced SOLID principle violations that static analysis might miss.

### What it does 🔍

* **Analyzes** TypeScript and JavaScript files for multiple Clean Code aspects.
* **Flags** violations as inline diagnostics with configurable severity.
* **Provides code actions** for refactoring suggestions.
* **Calculates metrics** like complexity, size, and cohesion.
* **Detects dependency cycles** and other structural issues.
* **Shows overall score** with recommendations for improvement.

### How to use ▶️

* Diagnostics appear automatically in supported files.
* Use the lightbulb for code actions and quick fixes.
* Access via Command Palette: `Clean Code: Apply SRP suggestions`.
* Configure settings for severity, notifications, and enabled checks.

### Example — TypeScript Analysis ✍️

The extension analyzes code like this:

```ts
class UserService {
  createUser(data: any) {
    this.userRepo.save(data);
  }

  sendWelcomeEmail(email: string) {
    this.emailService.sendWelcomeEmail(email);
  }
}
```

And provides diagnostics such as:
- **SRP Violation**: Unit handles multiple concerns - data, communication. Split into separate units.
- **Duplication**: Code duplication detected. Extract to shared method.
- **Overall Clean Code Score**: 85/100. Prioritize refactoring for SRP and readability.

With code actions to extract responsibilities and improve the code.

## Requirements

* VS Code 1.107.0 or higher
* TypeScript or JavaScript files to analyze
* The extension uses ts-morph for AST parsing and analysis

## Extension Settings

This extension contributes the following settings:

* `cleanCodeAssistant.srp.enabled` (boolean, default: true): Enable/disable Clean Code analysis.
* `cleanCodeAssistant.srp.autoApply` (enum: "off" | "safe" | "always", default: "off"): Automatic application of safe refactorings.
* `cleanCodeAssistant.srp.severity` (enum: "info" | "warning", default: "warning"): Severity level for diagnostics.
* `cleanCodeAssistant.srp.maxSuggestionComplexity` (number, default: 10): Maximum complexity for automatic extraction.
* `cleanCodeAssistant.srp.showNotification` (boolean, default: true): Show notifications for detected issues.

## Known Issues

- Analysis is currently limited to TypeScript and JavaScript files.
- Some advanced refactorings require manual application.

## Release Notes

### 0.0.1

Initial release with comprehensive Clean Code analysis including:
- Readability checks
- SRP violation detection
- Code duplication detection
- Testability assessment
- Side effects analysis
- Metrics calculation
- Dependency cycle detection
- Overall Clean Code scoring
- Code actions and notifications

---

**Enjoy!**
