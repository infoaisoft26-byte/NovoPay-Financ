# NovoPay Finance — Neon Agent Setup

Repository: https://github.com/infoaisoft26-byte/NovoPay-Financ

## Included
- `.cursor/mcp.json`: official hosted Neon MCP server using OAuth; no API key is stored here.
- `.agents/skills/neon/SKILL.md`: project-specific skill entry with safety rules and a link to the official, current Neon skill.
- `AGENTS.md`: repository-wide agent instructions.

## Install
1. Extract these files into the root of the NovoPay-Financ repository, preserving the `.cursor` and `.agents` folders.
2. Commit and push them to GitHub.
3. Open the repository in Cursor and restart/refresh MCP servers.
4. On first Neon MCP use, complete OAuth authorization in the browser.
5. If the Neon project belongs to an organization, specify its exact org_id or project_id in the MCP prompt. OAuth may otherwise default to the personal account.

## Important limits
This setup does not create or modify a Neon database, provision infrastructure, link a project, or write secrets. Those steps require authenticated access and confirmation of the intended Neon organization/project. Inspect existing `.env` files locally; never commit them.

Official MCP docs: https://neon.com/docs/ai/connect-mcp-clients-to-neon
Official skill: https://github.com/neondatabase/agent-skills/blob/main/skills/neon/SKILL.md
