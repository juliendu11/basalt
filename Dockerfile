# Pin an explicit patch, not the floating `24-alpine` tag: the GHA buildx
# layer cache (cache-from/to: type=gha) was freezing an early Node 24 whose
# WHATWG URL parser rejects the non-special base URLs jsonschema uses
# (`resolve://`, `thismessage::/`), which made `@adonisjs/ace` throw
# "Invalid URL" while validating command metadata — `node ace queue:work`
# could not boot. Bump this deliberately.
ARG NODE_IMAGE=node:24.15.0-alpine

FROM ${NODE_IMAGE} AS base

# All dependencies (including dev), used to run the TypeScript build
FROM base AS deps
WORKDIR /app
ADD package.json package-lock.json ./
RUN npm ci

# Production-only dependencies, installed from the source manifest so the
# lockfile is honored (kept separate from `deps` to avoid shipping devDeps)
FROM base AS production-deps
WORKDIR /app
ADD package.json package-lock.json ./
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
