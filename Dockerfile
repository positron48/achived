FROM node:20-alpine

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npx prisma generate
RUN npm run build

ENV NODE_ENV=production

EXPOSE 3000

# Миграции при каждом старте пода (k8s реплика = 1; при scale>1 Prisma берёт advisory lock в Postgres).
CMD ["sh", "-c", "npx prisma migrate deploy && exec npm run start -- --hostname 0.0.0.0 --port 3000"]
