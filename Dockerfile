# Stage 1: Build React frontend
FROM node:20-alpine AS builder
WORKDIR /app/react-frontend
COPY react-frontend/package*.json ./
RUN npm ci
COPY react-frontend/ ./
RUN npm run build
# vite outDir is '../frontend-react-dist' → output lands at /app/frontend-react-dist

# Stage 2: Python runtime
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY *.py ./
COPY db ./db
COPY prompts ./prompts
COPY --from=builder /app/frontend-react-dist ./frontend-react-dist
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
