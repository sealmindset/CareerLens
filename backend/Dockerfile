FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright Chromium and its system dependencies
# Skip TLS verification for corporate proxy environments
RUN NODE_TLS_REJECT_UNAUTHORIZED=0 playwright install --with-deps chromium

# ffmpeg for audio extraction from video recordings
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

COPY . .

ENV PYTHONPATH=/app

CMD ["bash", "entrypoint.sh"]
