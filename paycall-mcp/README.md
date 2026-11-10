# paycall-mcp

Stdio MCP server that lets an AI agent pay for x402 (HTTP 402) APIs from your prepaid PayCall balance.

Tools:
- `paid_fetch {url, method?, headers?, body?}`: fetches the URL and pays automatically if it answers 402 with `paycall-prepaid`. Returns the status, the amount paid, and the body (cut at 20k chars).
- `wallet_info {}`: shows the agent pubkey and how much was spent this session.

## Key

PayCall dashboard → Buyer → Add agent. The agent private key is shown once. Keep it secret: anyone holding it can spend your balance, within the agent's limits.

## Claude Code

```sh
claude mcp add paycall -e PAYCALL_AGENT_KEY=<key> -- bun run /Users/roydevelops/Desktop/Dev/Hackathons/paypal/main/paycall-mcp/src/index.ts
```

## Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "paycall": {
      "command": "bun",
      "args": ["run", "/Users/roydevelops/Desktop/Dev/Hackathons/paypal/main/paycall-mcp/src/index.ts"],
      "env": { "PAYCALL_AGENT_KEY": "<key>" }
    }
  }
}
```

(If Claude Desktop can't find `bun`, use its absolute path, e.g. `~/.bun/bin/bun`.)

## Dev

```sh
bun install
bun run scripts/smoke.ts   # live: fresh unfunded owner → expects the "insufficient balance" error
```

Note: `paycall-sdk` comes from `file:../paycall-sdk`. Bun symlinks each file, so edits show up right away. If you add new files to the SDK, run `bun install --force` here.
