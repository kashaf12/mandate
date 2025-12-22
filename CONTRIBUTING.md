# Contributing to Mandate SDK

Thank you for your interest in contributing to Mandate SDK! This document provides guidelines and information for contributors.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Testing Requirements](#testing-requirements)
- [Documentation](#documentation)
- [Areas We Need Help](#areas-we-need-help)
- [License](#license)

---

## Code of Conduct

### Our Standards

- **Be respectful** - Treat everyone with respect and kindness
- **Be collaborative** - Work together toward better solutions
- **Be constructive** - Provide helpful feedback
- **Be patient** - Remember that everyone is learning

### What We Don't Tolerate

- Harassment or discriminatory behavior
- Trolling or inflammatory comments
- Personal attacks
- Publishing others' private information

---

## Getting Started

### Prerequisites

- **Node.js** 18+
- **pnpm** (recommended) or npm
- **TypeScript** knowledge
- **Git** for version control

### Local Setup

```bash
# Clone the repository
git clone https://github.com/kashaf12/mandate.git
cd mandate

# Install dependencies
pnpm install

# Run tests
pnpm test

# Build packages
pnpm build
```

### Project Structure

```
mandate/
├── packages/
│   ├── sdk/          # Core SDK
│   └── examples/     # Example implementations
├── docs/             # Documentation
├── VISION.md         # Project vision
├── ARCHITECTURE.md   # Technical architecture
└── INVARIANTS.md     # Core problems we solve
```

---

## Development Workflow

### 1. Create a Branch

```bash
# Feature branches
git checkout -b feature/your-feature-name

# Bug fix branches
git checkout -b fix/bug-description

# Documentation branches
git checkout -b docs/what-you-are-documenting
```

### 2. Make Changes

- Write code following our [style guide](#code-style)
- Add tests for new functionality
- Update documentation as needed
- Keep commits atomic and well-described

### 3. Test Your Changes

```bash
# Run all tests
pnpm test

# Run tests for specific package
cd packages/sdk
pnpm test

# Type check
pnpm type-check

# Run examples (if applicable)
cd packages/examples
pnpm example:all
```

### 4. Commit Your Changes

We use conventional commits:

```bash
# Features
git commit -m "feat(sdk): add argument validation for tools"

# Bug fixes
git commit -m "fix(policy): correct rate limit window calculation"

# Documentation
git commit -m "docs(readme): add custom pricing examples"

# Tests
git commit -m "test(executor): add replay protection tests"

# Refactoring
git commit -m "refactor(state): simplify commit logic"
```

**Commit message format:**

```
type(scope): subject

[optional body]

[optional footer]
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `test`: Adding or updating tests
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Performance improvement
- `chore`: Build process or auxiliary tool changes

---

## Pull Request Process

### Before Submitting

1. ✅ All tests pass (`pnpm test`)
2. ✅ Type checking passes (`pnpm type-check`)
3. ✅ Code follows style guidelines
4. ✅ Documentation updated (if applicable)
5. ✅ Examples added/updated (if applicable)

### PR Template

```markdown
## Description

Brief description of what this PR does.

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing

Describe the tests you ran and how to reproduce them.

## Checklist

- [ ] My code follows the style guidelines
- [ ] I have performed a self-review
- [ ] I have commented my code where needed
- [ ] I have updated the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally
```

### Review Process

1. **Automated checks** - CI runs tests and type checking
2. **Code review** - Maintainers review your code
3. **Revisions** - Address feedback if needed
4. **Merge** - Once approved, we'll merge your PR

---

## Code Style

### TypeScript Guidelines

**Use strict TypeScript:**

```typescript
// ✅ Good - explicit types
function calculateCost(usage: TokenUsage, pricing: ModelPricing): number {
  return usage.tokens * pricing.rate;
}

// ❌ Bad - implicit any
function calculateCost(usage, pricing) {
  return usage.tokens * pricing.rate;
}
```

**Prefer interfaces over types for objects:**

```typescript
// ✅ Good
interface Mandate {
  id: string;
  agentId: string;
}

// ❌ Avoid (for objects)
type Mandate = {
  id: string;
  agentId: string;
};
```

**Use const assertions for literal types:**

```typescript
// ✅ Good
const POLICY_TYPES = ["ALLOW", "BLOCK"] as const;
type PolicyType = (typeof POLICY_TYPES)[number];

// ❌ Bad
const POLICY_TYPES = ["ALLOW", "BLOCK"];
```

**Document public APIs:**

````typescript
/**
 * Evaluate an action against a mandate.
 *
 * This is a pure function - no side effects.
 *
 * @param action - The action to evaluate
 * @param mandate - The authority envelope
 * @param state - Current agent state
 * @returns Authorization decision (ALLOW or BLOCK)
 *
 * @example
 * ```typescript
 * const decision = engine.evaluate(action, mandate, state);
 * if (decision.type === 'BLOCK') {
 *   throw new MandateBlockedError(...);
 * }
 * ```
 */
evaluate(action: Action, mandate: Mandate, state: AgentState): Decision
````

### Formatting

We use Prettier (if configured). Key rules:

- **2 spaces** for indentation
- **Single quotes** for strings
- **Semicolons** required
- **Max line length**: 100 characters

---

## Testing Requirements

### Test Coverage

- **New features** - Must include tests
- **Bug fixes** - Must include regression tests
- **Edge cases** - Test boundary conditions

### Test Structure

```typescript
describe('ComponentName', () => {
  describe('methodName', () => {
    it('does something specific', () => {
      // Arrange
      const input = ...;

      // Act
      const result = ...;

      // Assert
      expect(result).toBe(...);
    });

    it('handles edge case', () => {
      // ...
    });
  });
});
```

### What to Test

**✅ DO test:**

- Public API behavior
- Edge cases and error conditions
- Integration between components
- Pure functions (determinism)

**❌ DON'T test:**

- Implementation details
- Private methods
- External dependencies (use mocks)

---

## Documentation

### What Needs Documentation

1. **Public APIs** - All exported functions/classes
2. **Examples** - Show how to use new features
3. **Architecture changes** - Update ARCHITECTURE.md
4. **Breaking changes** - Clear migration guide

### Documentation Style

**Be concise and clear:**

```typescript
// ✅ Good
/**
 * Calculate max output tokens from remaining budget.
 *
 * @param budget - Remaining budget in USD
 * @param pricing - Model pricing per 1M tokens
 * @returns Max output tokens
 */

// ❌ Bad - too verbose
/**
 * This function takes a budget and pricing information
 * and calculates how many output tokens can be generated
 * before the budget is exhausted by performing a division
 * operation and multiplying by one million...
 */
```

**Include examples:**

````typescript
/**
 * @example
 * ```typescript
 * const maxTokens = calculateMaxOutputTokens(5.0, {
 *   inputTokenPrice: 2.0,
 *   outputTokenPrice: 10.0
 * });
 * console.log(maxTokens); // 500000
 * ```
 */
````

---

## Areas We Need Help

### High Priority

1. **LLM Provider Integrations**

   - Add pricing for new models (Gemini, Mistral, etc.)
   - Test with different providers
   - Document provider-specific quirks

2. **Example Implementations**

   - Real-world use cases
   - Framework integrations (LangChain, LlamaIndex)
   - Production patterns

3. **Documentation**
   - Tutorials for common scenarios
   - Video walkthroughs
   - API reference improvements

### Future Features (Phase 2+)

These are **not** in scope for Phase 1, but we welcome discussions:

1. **Argument Validation** (Phase 2)

   - Validate tool arguments against schema
   - Block dangerous argument patterns
   - Example: Block `path: /etc/passwd` even if `read_file` is allowed

2. **Distributed State** (Phase 3)

   - Redis-backed StateManager
   - Global per-agent limits
   - Consensus protocols

3. **Cryptographic Signatures** (Phase 5)
   - Signed mandates
   - Verifiable credentials
   - Cross-system trust

---

## License

By contributing to Mandate SDK, you agree that your contributions will be licensed under the MIT License.

---

## Questions?

- **GitHub Issues**: [Report bugs or request features](https://github.com/kashaf12/mandate/issues)
- **GitHub Discussions**: [Ask questions or discuss ideas](https://github.com/kashaf12/mandate/discussions)
- **Email**: kashaf@mandate.dev (for sensitive matters)

---

## Thank You!

Every contribution helps make AI agents safer and more accountable. We appreciate your time and effort! 🙏
