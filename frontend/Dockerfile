FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm i -g npm@12.2.1 && npm ci

FROM node:22-alpine AS build
WORKDIR /app
# next.config rewrites() and NEXT_PUBLIC_* are baked in at build time
ARG BACKEND_URL=http://backend:4000
ARG NEXT_PUBLIC_API_URL=
ARG NEXT_PUBLIC_WS_URL=
ARG NEXT_PUBLIC_KEYCLOAK_URL=
ARG NEXT_PUBLIC_KEYCLOAK_REALM=royalknot
ARG NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=royalknot-web
ARG NEXT_PUBLIC_DEMO_MODE=true
ENV BACKEND_URL=$BACKEND_URL \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL \
    NEXT_PUBLIC_KEYCLOAK_URL=$NEXT_PUBLIC_KEYCLOAK_URL \
    NEXT_PUBLIC_KEYCLOAK_REALM=$NEXT_PUBLIC_KEYCLOAK_REALM \
    NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=$NEXT_PUBLIC_KEYCLOAK_CLIENT_ID \
    NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE \
    NEXT_TELEMETRY_DISABLED=1
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
