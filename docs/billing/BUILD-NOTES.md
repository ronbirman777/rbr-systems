# Build notes (TASK 032)

## Fresh-worktree "Module not found … internal/font/google/…" build failure

- **Observed (2026-10-09):** one clean worktree build failed with Turbopack `Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'` (8 errors). The same commit built fine on Vercel and in the main checkout.
- **Reproduced:** with outbound HTTPS blocked (`HTTPS_PROXY=http://127.0.0.1:9`), a fresh-worktree build fails with the same class of error (`… internal/font/google/cssmodule.module.css`, 7 errors).
- **Cleared:** with network available, two fresh-worktree builds of the same SHA, from `npm ci` and an empty `.next`, passed (exit 0). The final candidate also built cleanly from scratch.
- **Explanation:** `next/font/google` downloads the font files at build time. When fonts.googleapis.com / fonts.gstatic.com cannot be reached, Turbopack reports a module-resolution error instead of a network error. The earlier failure was a transient font-download failure, not a code defect.
- **Mitigation, if it recurs in CI:** retry the build, allow egress to the Google Fonts hosts, or self-host the fonts with `next/font/local`. That would be a separate, explicitly approved change.
