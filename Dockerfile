FROM node:22-bookworm AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY src ./src
COPY web ./web
COPY public ./public
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends r-base r-base-dev libgdal-dev libgeos-dev libproj-dev libudunits2-dev libcurl4-openssl-dev libssl-dev libxml2-dev cmake && rm -rf /var/lib/apt/lists/*
RUN Rscript -e 'install.packages(c("geocodebr", "sf", "jsonlite"), repos="https://cloud.r-project.org", Ncpus=1); stopifnot(requireNamespace("geocodebr"), requireNamespace("sf"), requireNamespace("jsonlite"))'
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY package.json ./
COPY scripts/geocode-reverse.R ./scripts/geocode-reverse.R
RUN mkdir -p /home/node/.cache && chown -R node:node /home/node/.cache
ENV HOST=0.0.0.0 PORT=3000 NODE_ENV=production RSCRIPT_PATH=/usr/bin/Rscript R_LIBS_USER=/usr/local/lib/R/site-library XDG_CACHE_HOME=/home/node/.cache
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
