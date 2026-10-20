# syntax=docker/dockerfile:1
# Build from the repo root:  docker build -f deploy/Dockerfile .
FROM node:20.19.2-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --ignore-scripts && npm rebuild esbuild
COPY packages packages
COPY apps apps
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:20.19.2-bookworm-slim
ENV NODE_ENV=production PORT=8080 WEB_DIST=/app/apps/web/dist STORAGE_DIR=/data/docs
WORKDIR /app/apps/api
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/assets ./assets
COPY --from=build /app/apps/api/package.json ./package.json
COPY --from=build /app/apps/web/dist /app/apps/web/dist
RUN mkdir -p /data/docs && chown -R node:node /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
