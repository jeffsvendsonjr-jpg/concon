from fastapi import FastAPI, APIRouter
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import shutil
from pathlib import Path


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}


# Serve the packaged ConCon extension zip for one-click download.
#
# Security note (SEC-001 fix): the previous implementation created a
# fresh tempfile.mkdtemp() on every request and never cleaned it up,
# which would eventually exhaust disk. This version caches the zip at
# a fixed path and only rebuilds when the source tree changes.
CONCON_SRC = Path("/app/concon/extension")
CONCON_CACHE = Path("/tmp/concon-latest.zip")


def _latest_source_mtime(root: Path) -> float:
    latest = 0.0
    for p in root.rglob("*"):
        try:
            m = p.stat().st_mtime
            if m > latest:
                latest = m
        except OSError:
            continue
    return latest


def _rebuild_concon_zip() -> None:
    # shutil.make_archive expects a base path without the extension.
    base = str(CONCON_CACHE.with_suffix(""))
    tmp_out = shutil.make_archive(base, "zip", root_dir=str(CONCON_SRC))
    # make_archive returns the created path; move only if needed.
    if Path(tmp_out) != CONCON_CACHE:
        shutil.move(tmp_out, CONCON_CACHE)


@api_router.get("/download/concon")
async def download_concon_zip():
    if not CONCON_SRC.is_dir():
        return {"error": "extension source not available"}
    src_mtime = _latest_source_mtime(CONCON_SRC)
    needs_rebuild = (
        not CONCON_CACHE.exists()
        or CONCON_CACHE.stat().st_mtime < src_mtime
    )
    if needs_rebuild:
        _rebuild_concon_zip()
    return FileResponse(
        path=str(CONCON_CACHE),
        media_type="application/zip",
        filename="concon-latest.zip",
    )


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
