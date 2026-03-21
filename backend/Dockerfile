FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright Chromium and its system dependencies
RUN playwright install --with-deps chromium

COPY . .

ENV PYTHONPATH=/app

CMD ["bash", "entrypoint.sh"]
