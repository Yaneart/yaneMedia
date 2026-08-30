FROM oven/bun:1.3.14 AS dependencies

WORKDIR /backend

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --network-concurrency 8

FROM node:24.18.0-bookworm-slim

WORKDIR /backend

COPY --from=dependencies /backend/node_modules ./node_modules
COPY . .

EXPOSE 3000

CMD ["npm", "run", "start"]
