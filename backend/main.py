from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, doctor

app = FastAPI(title="CampusCare API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_origin_regex=r"https://.*\.ngrok.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(doctor.router, prefix="/api")


@app.get("/")
def root():
    return {"status": "CampusCare API is running"}
