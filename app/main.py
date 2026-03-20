print("MAIN FILE LOADED")

from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session

from app.database import engine, Base, SessionLocal
from app import models

app = FastAPI()

# Create tables
Base.metadata.create_all(bind=engine)

# DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/")
def root():
    return {"message": "working"}

@app.post("/categories/")
def create_category(db: Session = Depends(get_db)):
    return {"message": "category endpoint working"}