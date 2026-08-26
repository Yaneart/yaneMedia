FROM oven/bun:1.3.14

WORKDIR /frontend

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --network-concurrency 8

COPY . . 

EXPOSE 5173

CMD ["bun", "run", "dev", "--", "--host", "0.0.0.0" ]