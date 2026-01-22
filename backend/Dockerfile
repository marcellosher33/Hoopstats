FROM python:3.12-slim

WORKDIR /app

# Force cache invalidation with timestamp
ARG CACHEBUST=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Ensure critical packages are installed
RUN pip install --no-cache-dir PyJWT==2.10.1 email-validator>=2.0.0

COPY . .
EXPOSE 8001

CMD ["bash", "-lc", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8001} --log-level debug"]
