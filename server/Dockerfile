# syntax=docker/dockerfile:1
# StopWake Cloud. Build from the repository root:
#   docker build -f server/Dockerfile -t stopwake-cloud .
FROM node:22-bookworm-slim
ARG GIT_COMMIT=""
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 DATA_DIR=/data GIT_COMMIT=${GIT_COMMIT} \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning
WORKDIR /app
COPY server/ ./server/
COPY src/lib/pricing.ts ./src/lib/pricing.ts
RUN rm -rf server/test server/data && mkdir -p /data && chown node:node /data && chmod +x server/docker-entrypoint.sh
EXPOSE 8787
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["server/docker-entrypoint.sh"]
