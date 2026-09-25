import os

from flask import Flask

app = Flask(__name__)


@app.get("/")
def index():
    return {"message": "Hello from the Task 4 container", "environment": os.getenv("APP_ENV", "local")}


@app.get("/healthz")
def health():
    return {"status": "ok"}
