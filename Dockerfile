FROM node:22.20.0-bookworm-slim AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && npm ci

FROM dependencies AS production-dependencies

RUN npm prune --omit=dev && npm cache clean --force

FROM dependencies AS builder

COPY . .
RUN VIBERENT_DATABASE=postgres \
    POSTGRES_URL=postgresql://build:build@127.0.0.1:5432/build \
    BETTER_AUTH_URL=http://localhost:3000 \
    BETTER_AUTH_SECRET=docker-build-placeholder-32-characters \
    npm run build:web

FROM node:22.20.0-bookworm-slim AS runner

ENV NODE_ENV=production \
    VIBERENT_DATABASE=postgres \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    PRIVATE_FILE_STORAGE_ROOT=/app/.data/private-files

WORKDIR /app

COPY package.json package-lock.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules

COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/drizzle-postgres ./drizzle-postgres
COPY --from=builder --chown=node:node /app/scripts/migrate-postgres.mjs ./scripts/migrate-postgres.mjs
# Encrypted integration credentials (o1 = OpenAI OCR, g1/g1-web = Google Drive OAuth) are read from
# the working directory. package.json keeps the wildcard COPY valid when no .enc file is present.
COPY --from=builder --chown=node:node /app/package.json /app/*.json.enc ./

RUN mkdir -p /app/.data/private-files && chown -R node:node /app/.data

USER node
EXPOSE 3000

CMD ["npm", "start"]
