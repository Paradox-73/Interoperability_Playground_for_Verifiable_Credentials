# 0007. Pin React 18 for the Inji Verify SDK

- Status: Accepted
- Date: 2026-10-04

## Context

- The UI embeds the official Inji Verify web component, `@injistack/react-inji-verify-sdk`. Version 0.18.1 matches verify-service 0.18.2 and needs React 18; the npm `latest` tag is a 1.0 pre-release that calls endpoints verify-service 0.18.2 does not have.
- Libraries that accept React 18 or later pulled React 19 next to React 18, and the UI tests failed with two React copies.

## Decision

- React 18.3.1 for the whole tree through an npm `overrides` entry, and the SDK pinned at exactly 0.18.1. The SDK is loaded lazily into its own chunk (it brings about 2 MB of JavaScript).

## Alternatives considered

- **React 19 and the 1.0 SDK pre-release:** needs a verify-service that is not released with the other Inji modules used here.
- **An iframe with the Inji Verify UI:** would not show the component as an integrator uses it, and its traffic could not be attributed to a run.

## Consequences

- Moving to React 19 waits for an SDK release that matches a released verify-service.
