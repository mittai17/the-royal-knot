FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm i -g npm@12.2.1 && npm ci

FROM node:22-alpine AS build
WORKDIR /app
# next.config rewrites() are resolved at build time, so the internal backend URL is a build arg.
ARG BACKEND_URL=http://backend:4000
ENV BACKEND_URL=$BACKEND_URL NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
