from fastapi import APIRouter

from app.api.routes import auth, doctor, health, queue, reception

api_router = APIRouter()

# Register core feature routers
api_router.include_router(auth.router)
api_router.include_router(doctor.router)
api_router.include_router(health.router)
api_router.include_router(queue.router)
api_router.include_router(reception.router)


