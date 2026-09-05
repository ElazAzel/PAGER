# syntax=docker/dockerfile:1
FROM node:24.19.0-bookworm-slim AS dependencies
WORKDIR /app
RUN npm install --global pnpm@11.19.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV PAGER_DEMO=false
RUN pnpm build

FROM node:24.19.0-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV PAGER_DEMO=false
RUN groupadd --system --gid 1001 pager && useradd --system --uid 1001 --gid pager pager
COPY --from=build --chown=pager:pager /app/.next/standalone ./
COPY --from=build --chown=pager:pager /app/.next/static ./.next/static
COPY --from=build --chown=pager:pager /app/public ./public
USER pager
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["node", "server.js"]
