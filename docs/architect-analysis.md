## Features
- **On-demand unit analysis**: Analysis triggers only when a function or class editing is complete (debounced 1.5s after last edit or when cursor moves away), reducing performance overhead compared to real-time analysis.
- Real-time code analysis for TypeScript and JavaScript files, detecting clean code violations such as poor readability, large functions, high complexity, SRP violations, code duplication, poor testability, side effects, and dependency cycles.
- Diagnostic reporting with configurable severity levels (warning or info) and source attribution.
- User notifications for detected violations, with options to go to the violation, show problems panel, apply suggestions, or ignore.
- Code actions for refactoring, specifically extracting responsibilities into helper classes.
- Commands for navigating to violations, applying SRP suggestions, and running analysis.
- Configuration settings for enabling/disabling analysis, severity, notifications, auto-apply mode, and Go-to-violation feature.
- Fallback basic analysis for large files or when AST parsing fails.
- Dependency graph analysis to detect circular dependencies across code units.
- Cross-unit duplication detection using text similarity measures.
- **Runtime logging system**: Comprehensive logging of all extension activities to a single log file for monitoring and debugging, stored in VS Code's global storage location. Uses single-line format: `LEVEL TIMESTAMP TYPE NAME MESSAGE ADDITIONALINFO`.
- Utility functions for high-resolution timing, scoped counters, function parameter extraction, promise handling, and string manipulation.

## Business Logic
- **Smart analysis triggering**: Unit-based analysis with debouncing (1.5s delay) and cursor-aware triggering - analysis occurs when editing pauses or cursor moves outside the current unit, improving performance and user experience.
- Document analysis using AST parsing with ts-morph to identify classes and functions as code units.
- Readability evaluation based on naming conventions (length, case, regex patterns) and indentation consistency.
- Metric computation including line count, method count, and cyclomatic complexity via control flow statements.
- Responsibility identification through keyword matching for domains like data, UI, business logic, validation, and communication.
- Duplication detection using normalized text similarity with Levenshtein distance, both within units and across functions.
- Testability assessment by checking for globals, console usage, bare assignments, and object instantiation.
- Side effect detection via modifications to 'this' properties, console I/O, and bare identifier assignments.
- Dependency graph construction by analyzing references between code units, followed by cycle detection using DFS.
- Responsibility extraction by identifying methods with disjoint field usage and creating new helper classes with delegation.
- Diagnostic generation and mapping for tracking violations per document, with notification deduplication.
- **Comprehensive logging**: All extension operations logged to a single log file in VS Code's global storage using single-line format (`LEVEL TIMESTAMP TYPE NAME MESSAGE ADDITIONALINFO`), including analysis events, command executions, and user interactions for monitoring and debugging.
- Event handling for document open, change, and save to trigger analysis, with initial analysis on all open documents.

## Technical Implementation
- **Single-file logging**: All logs written to a single `extension.log` file using structured single-line format (`LEVEL TIMESTAMP TYPE NAME MESSAGE ADDITIONALINFO`) for easy monitoring and parsing.
- **Fallback logging**: Console logging for development alongside file logging.
- **Log levels**: INFO for normal operations, ERROR for exceptions and failures.
- **Log types**: analysis, command, document, unit, notification, error for categorizing log entries.
- **Incremental diagnostics**: Updates only the diagnostics for the modified unit instead of re-analyzing the entire document.