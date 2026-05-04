<!-- Thanks for the PR. Please fill in the sections below. -->

## What

<!-- One paragraph: what does this change do? -->

## Why

<!-- The motivation. Link the issue if there is one. -->

## How

<!-- Implementation notes: which ports / adapters / screens are touched,
     any non-obvious decisions. -->

## Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] No new platform import (`expo-*`, `react-native-*`, `node:*`) leaked
      into `src/core/`
- [ ] If a new model URL was added, it is pinned to a commit SHA in
      `src/core/config/HttpModelSources.ts`
- [ ] If Android UI changed, validated on a real device with the
      release-APK workflow from AGENTS.md

## Screenshots / recordings

<!-- For UI changes only. -->
