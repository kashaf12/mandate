# Mandate Examples

This directory contains example scenarios demonstrating how to use the Mandate SDK to enforce agent execution governance.

## Examples

### `basic.ts`
Basic example showing how to define a mandate and enforce tool calls.

```bash
pnpm run example:basic
```

### `blocking.ts`
Demonstrates how mandates block unsafe tool calls, preventing dangerous operations.

```bash
pnpm run example:blocking
```

### `ollama-email.ts`
**Ollama Email Agent Example** - Demonstrates:
- Using local Ollama for LLM inference
- Creating an agent that can send emails
- Enforcing Mandate SDK at the tool boundary
- Simulating tool call blocking and rate limiting

```bash
pnpm run example:ollama-email
```

#### Prerequisites (Optional)
To use with actual Ollama:
1. Install Ollama: https://ollama.ai
2. Start Ollama: `ollama serve`
3. Pull a model: `ollama pull llama3.2` (or any other model)
4. Update the `model` variable in `ollama-email.ts` to match your installed model

The example will automatically fall back to simulation mode if Ollama is not available.

#### What it demonstrates:
- ✅ First email is allowed (within mandate limits)
- 🚫 Second email is blocked (exceeds `maxToolCalls` limit)
- 🚫 Third email is blocked (further exceeds limits)
- 📊 Final session summary shows enforcement decisions

This demonstrates the core Mandate principle: **enforcement happens at the tool boundary**, not via prompts.









