# CLAUDE.md

## UI/Frontend

After implementing UI changes, always check for CSS overflow clipping, dialog width, and table layout impacts. Test that new buttons/elements don't break existing layouts.

## Meta Ads API

When editing any code that touches the Meta Marketing API (`src/lib/meta-*.ts`,
`src/app/api/meta/**`), **invoke the `meta-ads-api` skill first**:

- Skill entry point: `.claude/skills/meta-ads-api/SKILL.md`
- Deep references: `.claude/skills/meta-ads-api/references/`
- Human-readable long-form docs: `docs/meta-ads-api-docs-md/`
  (start at `README.md`; critical areas are `10-cross-channel-omnichannel.md`,
  `11-catalogo-erros-subcodes.md`, `13-adcreative-payloads.md`).

The skill encodes validated payload structures, the cross-channel field-position
matrix, error subcode catalog, and war-story commits. Most Meta API bugs in this
repo were caused by ignoring one of those patterns.
