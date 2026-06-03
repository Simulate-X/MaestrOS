from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from app.db import SessionMaker
from app.models import Skill

router = APIRouter(prefix="/skills", tags=["skills"])


class SkillCreate(BaseModel):
    name: str
    version: str = "1.0"
    markdown_body: str


class SkillRead(BaseModel):
    id: int
    name: str
    version: str
    markdown_body: str
    model_config = ConfigDict(from_attributes=True)


@router.post("", response_model=SkillRead, status_code=201)
async def create_skill(data: SkillCreate):
    async with SessionMaker() as s:
        async with s.begin():
            skill = Skill(**data.model_dump())
            s.add(skill)
            await s.flush()
    return skill


@router.get("", response_model=list[SkillRead])
async def list_skills():
    async with SessionMaker() as s:
        result = await s.execute(select(Skill))
        return result.scalars().all()


@router.get("/{skill_id}", response_model=SkillRead)
async def get_skill(skill_id: int):
    async with SessionMaker() as s:
        skill = await s.get(Skill, skill_id)
    if skill is None:
        raise HTTPException(404, "skill not found")
    return skill
