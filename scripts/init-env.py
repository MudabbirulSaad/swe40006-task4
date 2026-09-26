"""Create local configuration without replacing an existing secret."""

import os
import secrets
from pathlib import Path

destination = Path(__file__).resolve().parents[1] / ".env"
try:
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
except FileExistsError:
    print(".env already exists; left unchanged.")
else:
    with os.fdopen(descriptor, "w") as stream:
        stream.write(f"SECRET_KEY={secrets.token_hex(32)}\nAPP_TITLE=Pinboard\n")
    print("Created .env. Keep this file private.")
