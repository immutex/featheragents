import type { FeatherConfig } from '../config/schema.js';

type Role = 'frame' | 'build' | 'critic' | 'sync';

const LINEAR: Record<Role, string> = {
  frame: `- Find the Linear ticket for this task. Set it to **In Progress**.\n- Paste the ticket URL into the task file under \`## Linear\`.`,
  build: `- Update the Linear ticket with brief progress notes as you work.\n- Include the ticket ID in commit messages (e.g., \`FEA-123: implement handler\`).`,
  critic: `- After recording review notes: move the ticket to **In Review** if all criteria are met, or **Blocked** if there are unresolved blockers.`,
  sync: `- If the task is complete, move the Linear ticket to **Done** before writing the handoff.\n- Otherwise update the ticket description with what remains.`,
};

const GITHUB: Record<Role, string> = {
  frame: `- Search for a related GitHub issue. Link it in the task file under \`## GitHub\` (e.g., \`Relates to #123\`).`,
  build: `- Reference the issue in commit messages: \`Fixes #123\` or \`Relates to #456\`.\n- Open a draft PR when the implementation is ready for early review.`,
  critic: `- If a PR exists for this task, post your review findings as a PR review comment in addition to calling \`record_review_notes\`.`,
  sync: `- Update the linked GitHub issue or PR with the current task status.`,
};

const CONTEXT7: Record<'frame' | 'build', string> = {
  frame: `- Before writing the task file, use Context7 to look up docs for any library or framework you are planning to work with.`,
  build: `- Before implementing with any external library, call Context7 (\`mcp__context7__resolve-library-id\` → \`mcp__context7__query-docs\`) for current docs. Prefer this over training knowledge for version-specific APIs.`,
};

const WEBSEARCH: Record<'frame' | 'build', string> = {
  frame: `- For research-heavy decisions, use web search to validate your technical approach before writing it into the task file.`,
  build: `- Use web search to investigate unfamiliar errors or library behaviours before spending time on guesswork.`,
};

const PLAYWRIGHT: Record<'build' | 'critic', string> = {
  build: `- After implementing UI changes, use Playwright to verify the affected pages render correctly:
  1. \`mcp__playwright__browser_navigate\` to the relevant page
  2. \`mcp__playwright__browser_snapshot\` to inspect the accessibility tree
  3. \`mcp__playwright__browser_click\` / \`mcp__playwright__browser_fill\` to exercise interactive elements
  Include a brief note in your progress log confirming the browser check passed.`,
  critic: `- Smoke-test the implementation in the browser before approving:
  1. \`mcp__playwright__browser_navigate\` to the affected page(s)
  2. \`mcp__playwright__browser_snapshot\` — confirm key elements are present and correct
  3. Exercise any changed interactions (forms, buttons, navigation)
  Add a "Browser verified" or "Browser: <issue>" line to your review notes.`,
};

/**
 * Returns an "## Integration steps" section for the given role, populated
 * only with the integrations that are actually enabled in config.
 * Returns an empty string when no integrations are enabled — no noise.
 */
export function integrationSteps(config: FeatherConfig, role: Role): string {
  const blocks: string[] = [];

  if (config.integrations.linear) {
    blocks.push(`**Linear**\n${LINEAR[role]}`);
  }
  if (config.integrations.github) {
    blocks.push(`**GitHub**\n${GITHUB[role]}`);
  }
  if (config.integrations.context7 && (role === 'frame' || role === 'build')) {
    blocks.push(`**Context7**\n${CONTEXT7[role]}`);
  }
  if (config.integrations.webSearch && (role === 'frame' || role === 'build')) {
    blocks.push(`**Web search**\n${WEBSEARCH[role]}`);
  }

  if (config.integrations.playwright && (role === 'build' || role === 'critic')) {
    blocks.push(`**Playwright**\n${PLAYWRIGHT[role]}`);
  }

  if (blocks.length === 0) return '';

  return `\n---\n\n## Integration steps\n\n${blocks.join('\n\n')}\n`;
}

/**
 * One-liner hint used in CLAUDE.md's integration list.
 */
export function integrationHint(name: string): string {
  const hints: Record<string, string> = {
    linear: '**Linear** — update ticket status at each phase (In Progress → In Review → Done)',
    github: '**GitHub** — link issues in commits, post findings on PRs',
    context7: '**Context7** — fetch live library docs during frame and build',
    webSearch: '**Web search (Tavily)** — validate technical decisions during frame and build',
    playwright: '**Playwright** — browser-verify UI changes during build; smoke-test during critic',
  };
  return hints[name] ?? `- ${name}`;
}
