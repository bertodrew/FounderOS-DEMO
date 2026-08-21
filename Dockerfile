# Founder OS — production image.
#
# Multi-stage so the runtime layer carries no compiler and no dev dependencies.
# better-sqlite3 is a native addon: it is compiled in the build stage and the
# resulting binary is traced into the standalone output by Next.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
# Toolchain for better-sqlite3 when no prebuilt binary matches this platform.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build against a throwaway store so no seeded db is baked into the image.
ENV FOUNDER_OS_DB=:memory:
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=4100
# poppler-utils provides pdftotext, used by the bank-statement import.
RUN apt-get update && apt-get install -y --no-install-recommends \
      poppler-utils ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 1001 --create-home founderos

COPY --from=builder --chown=founderos:founderos /app/.next/standalone ./
COPY --from=builder --chown=founderos:founderos /app/.next/static ./.next/static

# The store must outlive the container. Mount a volume here and point
# FOUNDER_OS_DB at it, or /api/health will report `durable: false`.
ENV FOUNDER_OS_DB=/data/founder-os.db
RUN mkdir -p /data && chown founderos:founderos /data
VOLUME ["/data"]

USER founderos
EXPOSE 4100

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4100)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
