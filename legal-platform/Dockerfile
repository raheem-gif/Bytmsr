# صورة تشغيل منصة الدعم القانوني — مؤسسة بيوت مصر لدعم الأرامل والأيتام
# Node 22 (يتضمن node:sqlite) — بدون اعتماديات تشغيل إلزامية.
#
#   docker build -t beyoot-legal .
#   docker run -d --name beyoot-legal --init -p 127.0.0.1:3000:3000 -v beyoot-data:/app/data --env-file .env beyoot-legal
#
# التقوية: الكود مملوك لـ root وغير قابل للتعديل من مستخدم التشغيل؛ التطبيق يعمل بالمستخدم node ويكتب فقط في /app/data.
# الإيقاف الآمن: يستقبل node إشارة SIGTERM مباشرة (CMD بصيغة exec) فيُغلق الخادم وقاعدة البيانات خلال ثوانٍ.
FROM node:22-bookworm-slim

LABEL org.opencontainers.image.title="beyoot-legal-platform" \
      org.opencontainers.image.description="Beyoot Misr legal support platform (منصة الدعم القانوني — بيوت مصر)" \
      org.opencontainers.image.version="11.0.0" \
      org.opencontainers.image.licenses="UNLICENSED"

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/app/data \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false

WORKDIR /app

# الاعتمادية الوحيدة اختيارية (حزمة Claude الرسمية)؛ فشل تثبيتها لا يوقف البناء ولا التشغيل
COPY package.json package-lock.json* ./
RUN (npm install --omit=dev --no-audit --no-fund || echo "optional dependency not installed") \
    && npm cache clean --force >/dev/null 2>&1 || true

COPY server.js ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts

# مجلد البيانات الوحيد القابل للكتابة (قاعدة البيانات، المرفقات، النسخ الاحتياطية، مفتاح التشفير)
RUN mkdir -p /app/data && chown node:node /app/data && chmod 700 /app/data

USER node
# لا نستخدم VOLUME: القرص الدائم يُركَّب من المنصة (Render Disk) أو من docker-compose / docker run -v
EXPOSE 3000
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
