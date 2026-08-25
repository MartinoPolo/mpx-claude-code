# Obsidian registration branch

Read this branch only when `MPX_OBSIDIAN_VAULT` resolves to a vault the user uses.

## Procedure

1. Read `<vault>/task-system.md` in full, then inspect the current project blocks in
   `<vault>/Tasks.md` and current project-tag rules in
   `<vault>/.obsidian/snippets/tagColors.css`. Identify the project's registry convention,
   heading level, query shape, and tag-color pattern from these authoritative format and
   copy sources before continuing.
2. Resolve whether the project uses a standalone dashboard or a MiniProjekty dashboard
   anchor from the registry convention and existing notes. When evidence does not decide,
   ask with `AskUserQuestion`; record a missing dashboard as a forward reference. Resolve
   the exact dashboard target and lowercase folder-name tag, or an existing daily-note tag,
   before continuing.
3. Following the current examples exactly, add one project section in the Projects lens,
   extend the General project registry so projectless tasks exclude the new tag, and add
   matching tag-pill rules using the `peacock.color` written in Step 7. Preserve the
   ordering and heading hierarchy documented by the vault. Before returning, verify that
   all three registrations appear exactly once and their queries and styles match the
   authoritative current examples.

Skip this branch only when the user keeps no such vault, and record that reason in the
final report.
