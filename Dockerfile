# OpenDesk — imagem do portal (Vite/React + Express/tRPC).
# Build único (instala deps, builda o client+server e roda o bundle).
FROM node:22-slim

WORKDIR /app
RUN corepack enable

# Instala deps primeiro (cache de camada). Precisa do lockfile + patches (wouter).
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

# Código + build. VITE_APP_ID entra no bundle do client em tempo de build.
COPY . .
ARG VITE_APP_ID=opendesk-portal
ENV VITE_APP_ID=$VITE_APP_ID
RUN pnpm build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
