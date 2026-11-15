FROM oven/bun:1.3.14 AS dependencies

WORKDIR /backend

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --network-concurrency 8

FROM node:24.18.0-bookworm-slim AS source
WORKDIR /backend
COPY --from=dependencies /backend/node_modules ./node_modules
COPY . .

FROM source AS build-public
RUN npm run build:public

FROM node:24.18.0-bookworm-slim AS public
WORKDIR /backend
COPY --from=dependencies /backend/node_modules ./node_modules
COPY --from=build-public /backend/dist-public ./dist
COPY package.json bun.lock drizzle.config.ts ./
COPY drizzle ./drizzle
COPY scripts ./scripts
EXPOSE 3000
CMD ["node", "dist/main.public"]

FROM source AS build-home
RUN npm run build

FROM node:24.18.0-bookworm-slim AS home
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /backend
COPY --from=dependencies /backend/node_modules ./node_modules
COPY . .
COPY --from=build-home /backend/dist ./dist

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
