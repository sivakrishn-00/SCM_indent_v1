FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Copy dependency requirements list and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all application code
COPY . .

# Expose API traffic port
EXPOSE 8000

# Wait for DB, run migrations, run initial seed script and spin up Uvicorn ASGI server
CMD ["sh", "-c", "python -c \"import socket, time, os\nhost = os.environ.get('MYSQL_SERVER', 'db')\nport = int(os.environ.get('MYSQL_PORT', 3306))\nprint(f'Waiting for database at {host}:{port}...')\nwhile True:\n    try:\n        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)\n        s.settimeout(2.0)\n        s.connect((host, port))\n        s.close()\n        break\n    except Exception:\n        time.sleep(1)\" && alembic upgrade head && python -m app.seed && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
