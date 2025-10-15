FROM node:20-alpine AS build
WORKDIR /app

# Copy entire frontend context so vite can find index.html and other files
COPY . /app

RUN npm ci --silent
RUN npm run build

# Serve with caddy (small, zero-config)
FROM caddy:2-alpine
COPY --from=build /app/dist /usr/share/caddy
EXPOSE 3000
CMD ["caddy", "file-server", "--root", "/usr/share/caddy", "--listen", ":3000"]
