FROM python:3.13-slim-bookworm@sha256:2325bb286ec344af3e5898cc224b5844e2707ac6e26b1632516fd3edc84a5e26
ARG REVISION=unknown
LABEL org.opencontainers.image.source="https://github.com/MudabbirulSaad/swe40006-task4" \
      org.opencontainers.image.revision=$REVISION
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN useradd --uid 10001 --create-home app && mkdir /output && chown app:app /output
COPY notes_export.py .
USER app
ENTRYPOINT ["python", "/app/notes_export.py"]
