# Releasing

1. Update the version in `package.json` and `package-lock.json`.
2. Run `npm test`, `npm run check`, and `npm run dist:win` on a clean checkout.
3. Inspect the installer, portable build, and diagnostics output.
4. Create and push a tag such as `v0.1.0`.
5. The release workflow builds Windows artifacts and attaches them to a GitHub Release.

Do not release from the private development workspace. Only tag commits in the
clean Syna Live repository after CI and secret scanning pass.
