# Charlie: Window Watch — Agent Rules

## Source of truth

- This repository root is the authoritative development and deployment checkout.
- GitHub Pages serves `main` from the repository root at <https://pineapplestrikesback.github.io/charlie-window-watch/>.
- Do not develop or deploy from the legacy nested checkout under `publish/`; it is ignored and retained only as local historical evidence.
- Keep `.nojekyll`, `robots.txt`, and the robots `noindex` meta tag in `index.html`. They prevent accidental indexing but are not access control.
- `dist/` and `assets/generated/` are generated artifacts and must remain untracked.

## Completion contract

For every completed feature, bug fix, or other code change, unless the user explicitly asks for local-only work:

1. Reproduce the issue or establish a concrete acceptance check before editing.
2. Add or update a regression test when the behavior is automatable.
3. Run the complete verification commands from this file and inspect their output.
4. Commit all in-scope source, tests, and documentation with a descriptive message.
5. Push the commit to `origin/main`.
6. Wait for the GitHub Pages deployment associated with that commit to complete successfully.
7. Verify the deployed HTTPS site itself, including the changed behavior and browser console state.

Do not describe work as finished, shipped, deployed, or live until the corresponding evidence exists. If commit, push, deployment, or live verification is blocked, investigate it and report the exact blocked boundary.

## Verification

Run from the repository root:

```bash
node --check game.js
node --check herding.js
node --test tests/*.test.mjs
bun scripts/build-share.mjs
```

After pushing, verify that the Pages run for the pushed commit succeeds, then test the public URL in a real browser. Local success is not a substitute for live success.

## Evidence and scope

- Unexpected output is a debugging signal: stop and verify it instead of explaining it away.
- Preserve unrelated user changes in a dirty working tree.
- Prefer the smallest root-cause fix that explains the reproduced failure.
- Never overwrite or clean the legacy `publish/` checkout without explicit user approval.
