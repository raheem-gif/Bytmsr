# صورة تشغيل منصة الدعم القانوني — مؤسسة بيوت مصر لدعم الأرامل والأيتام
# Node 22 (يتضمن node:sqlite) — بدون اعتماديات تشغيل إلزامية.
#
#   (هذا الملف في جذر المستودع ويبني من المجلد legal-platform/ — يستخدمه Render وأي منصة تبحث عن Dockerfile في الجذر)
#   docker build -t beyoot-legal .
#   docker run -d --name beyoot-legal -p 127.0.0.1:3000:3000 -v beyoot-data:/app/data --env-file .env beyoot-legal
#   docker build --build-arg MEDIA_TOOLS=0 -t beyoot-legal .   (صورة بحجم 11.0 بلا أدوات المستندات؛ كل شيء يعمل بدونها)
#
# التقوية: الكود مملوك لـ root وغير قابل للتعديل من مستخدم التشغيل؛ التطبيق يعمل بالمستخدم node ويكتب فقط في /app/data.
# الإيقاف الآمن: tini (PID 1) يمرر SIGTERM إلى node فيُغلق الخادم وقاعدة البيانات خلال ثوانٍ، ويحصد أي عملية فرعية
# انتهت (أدوات تنظيف الصور وقراءتها، v12).
FROM node:22-bookworm-slim

LABEL org.opencontainers.image.title="beyoot-legal-platform" \
      org.opencontainers.image.description="Beyoot Misr legal support platform (منصة الدعم القانوني — بيوت مصر)" \
      org.opencontainers.image.version="12.0.0" \
      org.opencontainers.image.licenses="UNLICENSED"

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/app/data \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false

WORKDIR /app

# v12 media (L12-40، L12-68): tini دائمًا (PID 1 يحصد العمليات الفرعية). وأدوات المستندات الاختيارية (MEDIA_TOOLS=1 افتراضيًا):
# ImageMagick لفك الصور وترميزها فقط، Tesseract بالعربية والإنجليزية لقراءة النص، poppler لصفحات PDF (+80–110 ميجابايت).
# MEDIA_TOOLS=0 يبني صورة بحجم 11.0: الماسح على هاتف المرسل و«نظّف المستند» في المتصفح يعملان، ولا قراءة نص على الخادم.
ARG MEDIA_TOOLS=1
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini \
    && if [ "$MEDIA_TOOLS" = "1" ]; then \
         apt-get install -y --no-install-recommends imagemagick tesseract-ocr tesseract-ocr-ara tesseract-ocr-eng poppler-utils; \
       fi \
    && rm -rf /var/lib/apt/lists/*
# سياسة ImageMagick المرفقة (تمنع كل الصيغ عدا JPEG وPNG وWebP وRGBA وGRAY، وكل المفوَّضات، وقوائم @ الملفات، مع حدود الذاكرة):
# ImageMagick 6 يقرؤها من /etc/ImageMagick-6 فقط، والمنصة لا تشغّله إلا إذا ظهرت قاعدة المنع فيها (تفشل مغلقة).
COPY legal-platform/deploy/imagemagick/policy.xml /etc/ImageMagick-6/policy.xml

# الاعتمادية الوحيدة اختيارية (حزمة Claude الرسمية)؛ فشل تثبيتها لا يوقف البناء ولا التشغيل
COPY legal-platform/package.json legal-platform/package-lock.json* ./
RUN (npm install --omit=dev --no-audit --no-fund || echo "optional dependency not installed") \
    && npm cache clean --force >/dev/null 2>&1 || true

COPY legal-platform/server.js ./
COPY legal-platform/src ./src
COPY legal-platform/public ./public
COPY legal-platform/scripts ./scripts
COPY legal-platform/deploy ./deploy

# مجلد البيانات الوحيد القابل للكتابة (قاعدة البيانات، المرفقات، النسخ الاحتياطية، مفتاح التشفير)
RUN mkdir -p /app/data && chown node:node /app/data && chmod 700 /app/data

USER node
# لا نستخدم VOLUME: القرص الدائم يُركَّب من المنصة (Render Disk) أو من docker-compose / docker run -v
EXPOSE 3000
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
