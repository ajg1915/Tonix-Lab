FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libsndfile1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
ENV MODELS_DIR=/models WORK_DIR=/work PORT=8765
VOLUME ["/models", "/work"]
EXPOSE 8765
CMD ["python", "app.py"]
