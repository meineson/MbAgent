# AGENTS.md - Coding Guidelines for AI Agents

## Project Overview

This is a Node.js AI agent demonstration that interacts with network cameras via RTSP streams using OpenAI-compatible APIs.

## Build/Lint/Test Commands

Since this is a standalone Node.js script without a package.json, use these commands:

```bash
# Run the script (requires OPENAI_API_KEY env var)
node test.js

# Run with environment variable
OPENAI_API_KEY=your_key node test.js

# Syntax check (no actual build needed for pure JS)
node --check test.js
```

**Note:** This project currently has no test framework configured. To add tests, consider:
- `npm init -y && npm install --save-dev jest` for testing
- `npm install --save-dev eslint` for linting

## Code Style Guidelines

### JavaScript Style

- **Language**: Modern ES6+ JavaScript (ES modules)
- **Module System**: Use ES modules (`import`/`export`)
- **Semicolons**: Use semicolons consistently
- **Quotes**: Use single quotes for strings
- **Indentation**: 2 spaces

### Naming Conventions

- **Variables**: Use `camelCase` (e.g., `userInput`, `toolCalls`)
- **Constants**: Use `UPPER_SNAKE_CASE` for true constants (e.g., `MODEL`)
- **Functions**: Use `camelCase` for function names (e.g., `runTool`, `sendMessage`)
- **Files**: Use `kebab-case` or descriptive names (e.g., `test.js`)

### Imports

- Use ES module imports at the top of the file
- Group imports: built-in modules first, then external, then internal
- Example:
```javascript
import { execSync } from 'child_process';
import readline from 'readline';
```

### Error Handling

- Use try/catch for async operations that may fail
- Always handle promise rejections
- Log errors with context for debugging
- Example pattern from codebase:
```javascript
try {
  const output = execSync(command, options);
  return output;
} catch (err) {
  console.error('Operation failed:', err.message);
  return "Error: " + err.message;
}
```

### Async Patterns

- Prefer `async/await` over raw promises
- Use `try/catch` for error handling in async functions
- For readline/prompts, wrap in Promise constructor

### API Calls

- Use `fetch()` for HTTP requests
- Include proper headers (Authorization, Content-Type)
- Handle response parsing with error checking
- Log token usage for debugging

### Tool/Function Design

- Tools should have descriptive names in `camelCase`
- Include clear descriptions for LLM tool selection
- Parameters should have types and descriptions
- Return consistent string formats

### Environment Variables

- Use `process.env` for sensitive configuration (API keys)
- Never hardcode secrets in source code
- Document required environment variables

### Comments

- Use `//` for single-line comments
- Comment complex logic or non-obvious behavior
- Keep comments in English for consistency

### Console Output

- Use `console.log()` for informational output
- Use `console.error()` for errors
- Include context in log messages

## Architecture Patterns

- **Agent Loop**: Implement conversation loops that handle tool calls iteratively
- **Message History**: Maintain message array for context
- **Tool Registry**: Define tools with JSON schema for LLM compatibility

## Dependencies

This project currently has no external dependencies (uses Node.js built-ins only):
- `child_process` - for executing shell commands
- `readline` - for interactive CLI input

## Running the Agent

```bash
# Set your API key
export OPENAI_API_KEY="your-api-key"

# Run the agent
node test.js

# Type queries when prompted, type 'exit' to quit
```

## Security Notes

- Never commit API keys to version control
- Sanitize user inputs before using in shell commands
- Be cautious with `execSync` - validate all inputs
- RTSP URLs should be validated before passing to ffplay
