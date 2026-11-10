# paycall-mcp

Stdio MCP server that lets an AI agent pay for x402 (HTTP 402) APIs from your prepaid PayCall balance.

Tools:
- `paid_fetch {url, method?, headers?, body?}`: fetches the URL and pays automatically if it answers 402 with `paycall-prepaid`. Returns the status, the amount paid, and the body (cut at 20k chars).
- `login {name?}`: connects this agent to your PayCall wallet. Returns a URL + code to approve in the browser.
- `wallet_info {}`: login status, agent pubkey, spent this session.

## Setup

Add the server once (no key needed):

```sh
claude mcp add paycall -- bun run /Users/roydevelops/Desktop/Dev/Hackathons/paypal/main/paycall-mcp/src/index.ts
```

Claude Desktop, `claude_desktop_config.json`:

```json
{ "mcpServers": { "paycall": { "command": "bun", "args": ["run", "/Users/roydevelops/Desktop/Dev/Hackathons/paypal/main/paycall-mcp/src/index.ts"] } } }
```

(If Claude Desktop can't find `bun`, use its absolute path, e.g. `~/.bun/bin/bun`.)

## Login

Ask Claude to "log in to PayCall", or run:

```sh
bun run /Users/roydevelops/Desktop/Dev/Hackathons/paypal/main/paycall-mcp/src/index.ts login [name]
```

It makes an Ed25519 key on this machine, prints a code and opens the dashboard's connect page. Log in, type the code, approve. The key is saved to `~/.config/paycall/agent.json` (mode 600) and is picked up without restarting the MCP server. Only the public key is ever sent.

Lost the key or switching wallet/machine? Log in again: the new key replaces (pauses) the old one, your balance stays.

Env: `PAYCALL_API` (default the deployed worker), `PAYCALL_KEY_FILE` (key path). Legacy `PAYCALL_AGENT_KEY` still works when no key file exists.

Already added with `-e PAYCALL_AGENT_KEY=…`? `claude mcp remove paycall`, then add it again as above.

## Dev

```sh
bun install
bun run scripts/smoke.ts         # live: fresh unfunded owner → expects the "insufficient balance" error
bun run scripts/login-smoke.ts   # local worker: SK=<service key> PAYCALL_API=http://localhost:8787 KEY_FILE=/tmp/k.json
```

Note: `paycall-sdk` comes from `file:../paycall-sdk`. Bun symlinks each file, so edits show up right away. If you add new files to the SDK, run `bun install --force` here.
