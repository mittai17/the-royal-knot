FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm i -g npm@12.2.1 && npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
# Full node_modules is kept on purpose: the entrypoint needs the prisma CLI and ts-node (seed).
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/tsconfig*.json ./
COPY deploy-entrypoint.sh ./deploy-entrypoint.sh
RUN chmod +x deploy-entrypoint.sh
EXPOSE 4000
ENTRYPOINT ["./deploy-entrypoint.sh"]
