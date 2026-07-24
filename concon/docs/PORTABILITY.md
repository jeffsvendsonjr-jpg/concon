# Portability

ConCon is a self-contained repo. Nothing in it depends on the environment it
was authored in.

## Lift and run anywhere

1. Copy the `concon/` folder to any machine.
2. `cd concon`.
3. Run tests (Node ≥ 18): `node --test tests/`.
4. Serve the dev harness: `python3 -m http.server 8000`, then open
   `http://localhost:8000/dev-harness/`.
5. Load the extension in Chrome: `chrome://extensions` → *Developer mode* →
   *Load unpacked* → select the `extension/` folder.

## No hidden dependencies

- No cloud services.
- No accounts.
- No external APIs at runtime.
- No network calls of any kind at runtime. Verifiable in
  `chrome://extensions` → *details* → *permissions*.
- The only runtime dependency introduced in later phases is a bundled local
  model runtime (Path B in the architecture review). Its weights are checked
  into the repository, versioned, license-declared, and SHA-256-hash-verified
  at load time. If the hashes don't match, the runtime refuses to load and
  the extension falls back to the deterministic-only path.

## Files that are safe to delete

- `dev-harness/` — local development only; not shipped with the extension.
- `tests/` — local development only; not shipped with the extension.
- `package.json` — used by the tests; irrelevant to the extension runtime.

Delete those three and what remains is the shippable extension plus its docs.

## Files that must never be deleted

- `AGENTS.md` — the doctrine. If this is gone, the project's soul is gone.
- `docs/V0_1_BRIEF.md` — the current milestone spec.
- `docs/V0_1_ARCHITECTURE_REVIEW.md` — the architecture the code implements.
- `extension/manifest.json` — Chrome MV3 entry point.
- `extension/src/` — the implementation.

## Git

This repo has no external git remote set. To publish:

```bash
git init                    # if not already
git add .
git commit -m "ConCon v0.1 substrate"
git remote add origin <your-remote>
git push -u origin main
```

Nothing about the repo assumes a specific remote or CI provider.
