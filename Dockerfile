# Rolling Mintless Jetton — backend only (SQLite + native better-sqlite3).
# Build from repository root: docker build -t rmj-backend .

FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY contracts/package.json contracts/
COPY sdk/package.json sdk/

RUN npm install --no-audit --no-fund

COPY backend backend
COPY contracts contracts
COPY sdk sdk

WORKDIR /app/backend

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "run", "start:tsx"]
