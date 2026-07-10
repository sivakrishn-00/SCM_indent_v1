# Stage 1: Build React/Vite Bundle
FROM node:20-alpine AS build

WORKDIR /app

# Cache dependency installations
COPY package*.json ./
RUN npm ci

# Copy code and build production output
COPY . .
RUN npm run build

# Stage 2: Serve bundle with high-performance Nginx web server
FROM nginx:alpine

# Copy built package assets
COPY --from=build /app/dist /usr/share/nginx/html

# Expose web ingress port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
