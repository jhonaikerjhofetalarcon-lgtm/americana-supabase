ARG NODE_IMAGE=node:22-alpine
ARG NGINX_IMAGE=nginx:1.30-alpine
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV NG_BUILD_MAX_WORKERS=1
ENV NG_BUILD_PARALLEL_TS=0
ENV NODE_OPTIONS=--max-old-space-size=1536
RUN npm run build -- --configuration=production --no-progress

FROM ${NGINX_IMAGE}
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/dental-americana-supabase/browser /usr/share/nginx/html
EXPOSE 80
