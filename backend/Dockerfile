FROM oven/bun:1.3.14

WORKDIR /backend

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --network-concurrency 8

COPY . .

EXPOSE 3000

CMD ["bun", "run", "start"]