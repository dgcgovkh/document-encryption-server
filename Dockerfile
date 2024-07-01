FROM node:20-alpine3.18 as deps
WORKDIR /app

COPY package.json .
COPY package-lock.json .
RUN npm ci

COPY . .

ENV NODE_ENV=production

EXPOSE 80

CMD [ "node", "server.js" ]