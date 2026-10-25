# Pin an explicit patch, not the floating `24-alpine` tag, so builds stay
# reproducible (the GHA buildx layer cache also froze an old Node 24 once).
# Bump this deliberately.
#
# Node 24.22.1 rejects the base URL `thismessage::/` that jsonschema@1.5.0
# passes to `new URL()`, which made `@adonisjs/ace` throw "Invalid URL" while
# validating command metadata (`node ace ...` could not boot). We fix it with
# patches/jsonschema+1.5.0.patch, applied by the `postinstall` script
# (patch-package) — hence `ADD patches` before every `npm ci` below.
ARG NODE_IMAGE=node:24.22.1-alpine

FROM ${NODE_IMAGE} AS base

# All dependencies (including dev), used to run the TypeScript build
FROM base AS deps
WORKDIR /app
ADD package.json package-lock.json ./
ADD patches ./patches
RUN npm ci

# Production-only dependencies, installed from the source manifest so the
# lockfile is honored (kept separate from `deps` to avoid shipping devDeps)
FROM base AS production-deps
WORKDIR /app
ADD package.json package-lock.json ./
ADD patches ./patches
RUN npm ci --omit=dev

# Compile TypeScript -> build/ (server, ace commands, Vue/Inertia assets)
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules /app/node_modules
ADD . .
RUN node ace build

FROM base
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-deps /app/node_modules /app/node_modules
COPY --from=build /app/build /app
COPY docker/entrypoint.sh /app/docker/entrypoint.sh
RUN chmod +x /app/docker/entrypoint.sh

EXPOSE 3333
ENTRYPOINT ["/app/docker/entrypoint.sh"]
