FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsdown.config.ts ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

ENV NODE_ENV=production

EXPOSE 80

CMD [ "node", "dist/server.mjs" ]
