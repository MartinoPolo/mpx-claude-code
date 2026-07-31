# Raycast config reference

Everything here was recovered from Raycast for Windows' own backend bundle
(`<Raycast install>\backend\index.mjs`) and verified against a real export.

## File format

```
file     = gzip(JSON envelope)
envelope = { exportedAt, appVersion, osName, osVersion, osArch,
             schemaVersion, data: <hex>, encryption?: { iv, salt, authTag } }
data     = hex( aes-256-gcm( gzip(JSON payload) ) )   password set
         = hex( gzip(JSON payload) )                  no password
key      = crypto.scrypt(password, salt, 32)          Node defaults: N=16384, r=8, p=1
```

`iv`, `salt` and `authTag` are each 16 bytes, hex-encoded. Accepted `schemaVersion`
values are 1 and 2; write 2.

The export UI requires a password of at least 8 characters, typed twice. The **import**
path checks `isExportEncrypted` first, so a rebuilt file may omit encryption entirely and
still import — convenient, at the cost of a plaintext copy of everything on disk.

## Payload categories

`ai`, `clipboardHistory`, `emoji`, `focusCategories`, `mcpServers`, `nodeExtensions`,
`notes`, `quicklinks`, `settings`, `snippets`, `userActivity`, `windowLayouts`.

Import is per category — the user ticks which ones to apply. Editing quicklinks and
aliases needs `quicklinks` and `settings` only.

`clipboardHistory` holds whatever the user has copied, in clear text once decoded. Keep
decoded configs in the session scratchpad and out of any synced or version-controlled
folder.

## Quicklink record

```jsonc
{
  "id": "01K…",          // ULID; identity across import
  "name": "…",           // searched by fuzzy match over the whole string
  "link": "…",           // URL, filesystem path, custom scheme, or command line
  "rawContent": null,
  "icon": "default",
  "openCount": 0,        // drives ranking; preserved on update
  "openWith": "/Applications/<uuid>",       // optional
  "applicationId": "/Applications/<uuid>",  // always present alongside openWith, same value
  "tags": [],
  "createdAt": "…",
  "updatedAt": "…",
  "pinned": 0            // optional
}
```

A sibling `openWithPlatforms` array repeats the binding per platform:
`{ id, windows?, macos?, ios? }`. Write all three when setting `openWith`.

## Ids — where a rebuild goes wrong

The importer validates `id` as a **real ULID**, not a 26-character string. A ULID-shaped
id that violates the alphabet fails the whole category with:

```
not a valid ULID string on QuickLinkCreate.id
```

The alphabet is Crockford base32 — `0123456789ABCDEFGHJKMNPQRSTVWXYZ`, with **`I`, `L`,
`O` and `U` excluded**. `Date.now().toString(36).toUpperCase()` produces all four and is
therefore not a source of ids. The layout is 10 characters of millisecond timestamp
followed by 16 of randomness, first character `0`–`7`:

```js
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function ulid() {
  let timestamp = "", value = BigInt(Date.now());
  for (let index = 0; index < 10; index += 1) { timestamp = CROCKFORD[Number(value % 32n)] + timestamp; value /= 32n; }
  let randomness = "";
  for (const byte of crypto.getRandomValues(new Uint8Array(16))) randomness += CROCKFORD[byte % 32];
  return timestamp + randomness;
}
```

The failure surfaces only in the import dialog, as a red badge on the affected category —
the file itself decodes and round-trips perfectly. Run `audit.mjs` on the edited payload,
which checks this, before handing anything back.

## Alias and hotkey record

Aliases live in `settings.commands[]`, **not** on the quicklink:

```jsonc
{
  "id": "c:r:quicklinks::*::quicklink::=::<quicklink id>",
  "extensionId": "e:r:quicklinks",
  "enabled": true,
  "alias": "…",
  "customSubtitle": null,
  "windowsHotkey": { "kind": { "type": "SingleStep", "shortcut": { … } }, "locality": "Global" },
  "favoriteOrder": null
}
```

This is why a quicklinks-only JSON import cannot carry aliases — that command surfaces
`name`, `link`, `iconName` and `openWith`, and merges without deleting.

## Import semantics — the part that matters

From the quicklinks importer:

```js
for (let id of existingIds) importedIds.has(id) || await deleteOne(id);
```

- **The file is a mirror, not a patch.** Any quicklink present in Raycast and absent from
  the file is **deleted**. Removing an entry from the JSON is how deletion happens.
- **Matching `id` → update in place**, refreshing `name`, `link`, `rawContent`, `icon`,
  `openWith` and `tags`. `openCount` and `createdAt` survive, so a rename keeps its
  ranking. Preserve ids when editing.
- **New `id` → insert.** A fresh ULID, or any unique string, works.
- Importing `settings` also **deletes themes** absent from the file, so round-trip the
  user's own export rather than composing a settings category from scratch.

## `openWith` application ids

`/Applications/<uuid>` ids come from Raycast's own app index. They are UUIDv5 in shape
but derive from something other than the executable path — probing every standard
namespace against known ids produced no match. Treat them as opaque: **copy an id from an
existing quicklink that opens the same application** rather than constructing one. To
bind an application never used before, have the user set `openWith` once in the Raycast
UI, re-export, and read the new id out of the config.

## Naming rules

1. **Bare alias is the default; a letter prefix selects the project.** `issues` for the
   cross-project view, `<letter>issues` for one project. Aliases beat fuzzy matching, so
   the most-used member of a family earns the bare word.
2. **Name reads `<project> <thing> (<keywords>)`, project first.** Matching ignores word
   order, so this is for the eye: everything for one project clusters as it is typed.
3. **Every member of a family carries the family keyword.** Every meeting link contains
   `zoom`; every port link contains `localhost`, the port number, and what runs there.
4. **A second language goes in the alias, not the name.** An alias in the user's other
   language makes an English-named entry reachable without bloating the name.
5. **`openWith` is copied, never invented** — see above.

Suggested per-project family: `repo`, `prs` (or `mrs`), `issues`, `dash`, `folder`,
`code`, `term`, plus `dev` / `sb` for running servers.

## Link forms that work on Windows

| Target | `link` |
| --- | --- |
| Web | `https://…` |
| Folder or file | `C:\path\to\thing` |
| File, opened with a chosen app | `file:///C:/path` + `openWith` |
| Obsidian note | `obsidian://open?vault=<vault>&file=<url-encoded path within vault>` |
| VS Code folder | `file:///C:/path` + the VS Code `openWith` id |
| Terminal profile | `wt -p "<profile name>"` + the Windows Terminal `openWith` id |
| Parameterised | `https://…/{argument name="query"}` |

Placeholders also cover clipboard, selected text, date and calculator results.
