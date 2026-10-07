FROM node:22-alpine AS build
WORKDIR /app
COPY backend/package.json ./
RUN npm install
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npx tsc

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY backend/package.json ./
COPY db ./db
EXPOSE 3001
CMD ["sh", "-c", "node dist/scripts/migrate.js && node dist/scripts/seed.js && node dist/index.js"]
