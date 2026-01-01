# Change Log

All notable changes to the "clean-code-assistant" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.0.2] - 2025-12-24

### Added
- **Comprehensive Logging System**: Implemented GitLens-inspired logger with the following features:
  - Singleton Logger with configurable providers
  - BufferedLogChannel for efficient output buffering with configurable intervals
  - Log scopes and IDs for contextual logging
  - LoggableScope with automatic timing and disposal using `Symbol.dispose`
  - Decorators for automatic method logging (`@log`, `@debug`)
  - Sensitive data sanitization (passwords, tokens, access tokens)
  - Multiple log levels (debug, info, warn, error, off)
  - High-resolution timing using Node.js `process.hrtime()` API

- **Logger Architecture**:
  - `src/system/logger.ts`: Core logger implementation with BufferedLogChannel
  - `src/system/logger.scope.ts`: Log scope management and ID generation
  - `src/system/loggable.ts`: Disposable scoped logging class
  - `src/system/decorators/log.ts`: Automatic method logging decorators
  - `src/system/logger.constants.ts`: Logger configuration constants
  - `src/@env/hrtime.ts`: High-resolution time implementation
  - `src/system/string.ts`: String utilities for logging
  - `src/system/function.ts`: Function parameter extraction utilities
  - `src/system/promise.ts`: Promise detection utilities
  - `src/system/counter.ts`: Scoped counter for unique IDs

- **Comprehensive Test Suite**: Added 22 passing tests covering:
  - Basic logger functionality (log, debug, warn, error)
  - Log level filtering
  - Log scopes and contextual logging
  - LoggableScope creation and disposal
  - Logger configuration with custom providers
  - Sensitive data sanitization
  - BufferedLogChannel buffering and flushing behavior

- **VS Code Integration**: Logger integrated with VS Code Output Channel with proper disposal and subscription management

### Changed
- **Updated hrtime Implementation**: Replaced custom `performance.now()`-based implementation with proper Node.js `process.hrtime()` API for accurate high-resolution timing
- **Logger Configuration**: Fixed channel recreation when providers change
- **Test Infrastructure**: Enhanced BufferedLogChannel testing with configurable buffer sizes and proper flushing

### Removed
- **Logging System**: Removed the comprehensive logging infrastructure to simplify the extension architecture:
  - Deleted `src/system/logger.ts`, `logger.constants.ts`, `logger.scope.ts`, `loggable.ts`, `notification.ts`, `decorators/log.ts`
  - Removed Logger configuration and output channel management from extension activation
  - Eliminated all debug logging calls from code analysis
  - Removed logger test suite (reducing test count from 23 to 9)
  - Notifications for code validation remain functional using direct VS Code API calls

### Technical Details
- **Logger Features**:
  - Automatic method timing with configurable thresholds
  - Hierarchical log scopes with unique IDs
  - Sensitive data masking in logs
  - Buffered output to prevent performance issues
  - TypeScript decorators for seamless integration
  - Proper resource disposal with `Symbol.dispose`

- **Performance Optimizations**:
  - Buffered logging to reduce I/O operations
  - Lazy channel creation
  - Efficient string formatting and sanitization

## [0.0.1] - 2025-12-24

### Added
- Initial release with comprehensive Clean Code analysis
- Readability analysis for naming conventions and code structure
- Single Responsibility Principle (SRP) violation detection
- Code duplication detection
- Testability assessment
- Side effects analysis
- Metrics calculation (complexity, size, cohesion)
- Dependency cycle detection
- Overall Clean Code scoring
- Code actions and refactoring suggestions
- VS Code diagnostics integration
- Configurable severity levels and notifications
- Support for TypeScript and JavaScript files