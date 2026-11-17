# ---- Build stage: produce static files in /app/dist ----
FROM node:22-alpine AS build
WORKDIR /app

# Install dependencies first so they are cached between builds.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Runtime stage: nginx serves the app and proxies /api to the backend ----
FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
