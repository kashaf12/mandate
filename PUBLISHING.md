# Publishing Guide

Step-by-step instructions for publishing Mandate SDK to npm.

---

## Pre-Publish Checklist

### 1. Verify Everything Works

```bash
# Clean install
rm -rf node_modules packages/*/node_modules
pnpm install

# Build SDK
pnpm build

# Run all tests
pnpm test

# Type check
pnpm type-check

# Run examples
pnpm examples
```

### 2. Update Version

```bash
# Update version in packages/sdk/package.json
# Follow semantic versioning:
# - MAJOR: Breaking changes
# - MINOR: New features (backward compatible)
# - PATCH: Bug fixes

# Example: 0.1.0 → 0.1.1 (patch)
cd packages/sdk
npm version patch

# Or use pnpm
pnpm version patch
```

### 3. Update CHANGELOG.md

- Add release date
- Move items from [Unreleased] to new version section
- Update version links at bottom

### 4. Commit Version Bump

```bash
git add packages/sdk/package.json CHANGELOG.md
git commit -m "chore: release v0.1.1"
git tag v0.1.1
```

---

## Publishing to npm

### Option A: Manual Publish (Recommended for first release)

#### 1. Login to npm

```bash
npm login
# Enter credentials
```

#### 2. Dry Run (Test)

```bash
cd packages/sdk
npm publish --dry-run
```

**Check output:**

- ✅ Only `dist/` included
- ✅ README.md included
- ✅ LICENSE included
- ❌ No `src/`, `tests/`, config files

#### 3. Publish

```bash
npm publish --access public
```

**Expected output:**

```
+ @mandate/sdk@0.1.0
```

#### 4. Verify

```bash
# Check on npm
open https://www.npmjs.com/package/@mandate/sdk

# Test installation
mkdir /tmp/test-install
cd /tmp/test-install
npm init -y
npm install @mandate/sdk
node -e "console.log(require('@mandate/sdk'))"
```

---

### Option B: Automated Publishing (GitHub Actions)

Create `.github/workflows/publish.yml`:

```yaml
name: Publish to npm

on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: "18"
          registry-url: "https://registry.npmjs.org"

      - name: Install dependencies
        run: pnpm install

      - name: Build
        run: pnpm build

      - name: Test
        run: pnpm test

      - name: Publish
        run: cd packages/sdk && npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**Setup:**

1. Create npm access token: https://www.npmjs.com/settings/tokens
2. Add to GitHub secrets: `NPM_TOKEN`
3. Create GitHub release → Auto-publishes

---

## Post-Publish

### 1. Push Git Tags

```bash
git push origin main
git push origin v0.1.1
```

### 2. Create GitHub Release

- Go to: https://github.com/kashaf12/mandate/releases/new
- Tag: `v0.1.1`
- Title: `v0.1.1`
- Description: Copy from CHANGELOG.md
- Attach: None needed
- Publish release

### 3. Announce

- Tweet/X
- Reddit (r/LangChain, r/MachineLearning)
- HackerNews (Show HN)
- Discord communities
- LinkedIn

---

## Troubleshooting

### "Package name already exists"

**Error:** `403 Forbidden - PUT https://registry.npmjs.org/@mandate/sdk`

**Solution:**

- Change package name in `package.json`
- Or: Check if you have publish permissions
- Or: Package name might be taken

### "You must verify your email"

**Solution:**

- Check email for verification link
- Resend: https://www.npmjs.com/settings/email

### "Build failed"

**Solution:**

```bash
# Clean everything
rm -rf dist node_modules
pnpm install
pnpm build
```

### "Tests failing in CI"

**Solution:**

- Ensure all dependencies in `package.json`
- Check Node version (need 18+)
- Verify pnpm version

---

## Unpublishing (Emergency Only)

**WARNING:** You can only unpublish within 72 hours.

```bash
npm unpublish @mandate/sdk@0.1.1 --force
```

**Better alternative:** Deprecate instead:

```bash
npm deprecate @mandate/sdk@0.1.1 "Security vulnerability - upgrade to 0.1.2"
```

---

## Version Strategy

### Pre-1.0.0 (Current)

- **0.x.x** = Breaking changes allowed
- **0.1.x** = New features
- **0.1.x** = Bug fixes

### Post-1.0.0

- **x.0.0** = Breaking changes
- **1.x.0** = New features (backward compatible)
- **1.0.x** = Bug fixes

---

## Release Checklist

- [ ] All tests passing
- [ ] Build succeeds
- [ ] Examples work
- [ ] CHANGELOG updated
- [ ] Version bumped
- [ ] Git tag created
- [ ] Dry-run successful
- [ ] Published to npm
- [ ] Installation verified
- [ ] Git pushed
- [ ] GitHub release created
- [ ] Announcement posted

---

## Questions?

- **npm issues:** https://docs.npmjs.com/
- **Semantic versioning:** https://semver.org/
- **Keep a Changelog:** https://keepachangelog.com/
