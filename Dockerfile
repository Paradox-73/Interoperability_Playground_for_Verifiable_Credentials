# syntax=docker/dockerfile:1
#
# Playground image: the playground server (API, WebSocket, recording proxy, reference roles) and the
# built UI, in one Node 24 process on port 28100.
#
#   docker build -t ps02-playground:dev .
#   docker run --rm -p 28100:28100 ps02-playground:dev
#
# Run-time state (SQLite database, generated test keys) goes to /data; mount a volume there to keep it.

# ---- build: install every dependency, compile the TypeScript packages and bundle the UI ----
FROM node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS build
WORKDIR /app

# Manifests first, so the dependency layer is reused while only source files change.
COPY package.json package-lock.json ./
COPY packages/protocol/package.json packages/protocol/
COPY packages/formats/package.json packages/formats/
COPY packages/scenarios/package.json packages/scenarios/
COPY packages/oid4vci/package.json packages/oid4vci/
COPY packages/oid4vp/package.json packages/oid4vp/
COPY packages/server/package.json packages/server/
COPY packages/cli/package.json packages/cli/
COPY packages/web/package.json packages/web/
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY tsconfig.base.json tsconfig.build.json ./
COPY packages packages
RUN npm run build

# ---- runtime: production dependencies of the server and CLI only, plus the compiled output ----
FROM node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PLAYGROUND_HOST=0.0.0.0 \
    PLAYGROUND_PORT=28100 \
    PLAYGROUND_RUN_DIR=/data \
    PLAYGROUND_WEB_DIST=/app/packages/web/dist

COPY package.json package-lock.json ./
COPY --from=build /app/packages/protocol/package.json packages/protocol/
COPY --from=build /app/packages/formats/package.json packages/formats/
COPY --from=build /app/packages/scenarios/package.json packages/scenarios/
COPY --from=build /app/packages/oid4vci/package.json packages/oid4vci/
COPY --from=build /app/packages/oid4vp/package.json packages/oid4vp/
COPY --from=build /app/packages/server/package.json packages/server/
COPY --from=build /app/packages/cli/package.json packages/cli/
COPY --from=build /app/packages/web/package.json packages/web/
# The UI's libraries are bundled into packages/web/dist at build time, so the web workspace
# contributes no run-time dependencies.
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
      --workspace @inji-playground/server --workspace @inji-playground/cli \
    && npm cache clean --force

COPY --from=build /app/packages/protocol/dist packages/protocol/dist
COPY --from=build /app/packages/formats/dist packages/formats/dist
COPY --from=build /app/packages/scenarios/dist packages/scenarios/dist
COPY --from=build /app/packages/oid4vci/dist packages/oid4vci/dist
COPY --from=build /app/packages/oid4vp/dist packages/oid4vp/dist
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/cli/dist packages/cli/dist
COPY --from=build /app/packages/web/dist packages/web/dist
# The Gaps page and /api/gaps read the register from here (gapsFile in packages/server/src/config).
COPY docs/gaps/gaps.json docs/gaps/
COPY LICENSE ./

RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 28100
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:28100/api/health || exit 1
CMD ["node", "packages/server/dist/main.js"]
