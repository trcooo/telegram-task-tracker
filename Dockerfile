# Railway-friendly Dockerfile for a TS monorepo (npm workspaces)
# - Installs dev deps in build stage (Railway often sets NPM_CONFIG_PRODUCTION=true)
# - Builds all workspaces
# - Prunes dev deps for runtime

FROM node:20-alpine AS builder
WORKDIR /app

# Copy manifests first for better caching
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

# Install all deps (including dev) for build tools (tsc, prisma)
RUN npm install --include=dev

# Copy the rest of the repo
COPY . .

# Prisma client
RUN npm -w apps/api run prisma:generate

# Build
RUN npm run build

# Remove dev deps for smaller runtime image
RUN npm prune --omit=dev


FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app /app

# Default to API server. Railway worker service should override CMD to `npm run worker`.
CMD ["npm", "run", "start"]
