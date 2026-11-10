
FROM debian:bookworm-slim

ARG DEBIAN_FRONTEND=noninteractive

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install OpenSCAD nightly and Python dependencies
RUN set -eux; \
    \
    # Temporary tools for adding the OpenSCAD repository
    apt-get update; \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        curl; \
    \
    # Configure OpenSCAD nightly repository
    install -d -m 0755 /etc/apt/keyrings; \
    curl -fsSL https://files.openscad.org/OBS-Repository-Key.pub \
        -o /etc/apt/keyrings/obs-openscad-nightly.asc; \
    printf '%s\n' \
        'deb [signed-by=/etc/apt/keyrings/obs-openscad-nightly.asc] https://download.opensuse.org/repositories/home:/t-paul/Debian_12/ ./' \
        > /etc/apt/sources.list.d/openscad-nightly.list; \
    \
    # Install runtime dependencies
    apt-get update; \
    apt-get install -y --no-install-recommends \
        fonts-dejavu-core \
        openscad-nightly \
        python3-flask; \
    \
    # Remove temporary tools and unnecessary packages
    apt-get purge -y --auto-remove curl; \
    \
    # Clean package caches
    apt-get clean; \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

WORKDIR /app

COPY app.py .
COPY static ./static

EXPOSE 5000

CMD ["python3", "app.py"]
