# صورة تشغيل منصة بيوت مصر — Node 22 (يتضمن node:sqlite)
FROM node:22-slim

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data

WORKDIR /app
COPY package.json ./
# الاعتمادية الوحيدة اختيارية (حزمة Claude الرسمية)؛ فشل تثبيتها لا يوقف البناء
RUN npm install --omit=dev --no-audit --no-fund || true
COPY server.js ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts

RUN mkdir -p /app/data && chown -R node:node /app
USER node
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
