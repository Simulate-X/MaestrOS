from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.db import SessionMaker
from app.models import Company
from app.services import budget

router = APIRouter(prefix="/companies", tags=["companies"])


class CompanyCreate(BaseModel):
    name: str
    budget_usd_limit: Optional[Decimal] = None
    budget_period: str = "monthly"


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    budget_usd_limit: Optional[Decimal] = None
    budget_period: Optional[str] = None


class CompanyRead(BaseModel):
    id: int
    name: str
    budget_usd_limit: Optional[float] = None  # Decimal → float: frontend number beklediği için
    budget_period: str = "monthly"
    # Faz 4.5: computed field — period spend for roster budget gauge
    cost_spent_period: float = 0.0
    model_config = ConfigDict(from_attributes=True)


@router.post("", response_model=CompanyRead, status_code=201)
async def create_company(data: CompanyCreate):
    async with SessionMaker() as s:
        async with s.begin():
            company = Company(**data.model_dump())
            s.add(company)
            await s.flush()
    return company


@router.get("", response_model=list[CompanyRead])
async def list_companies():
    async with SessionMaker() as s:
        companies = (await s.execute(select(Company))).scalars().all()
        result = []
        for c in companies:
            spent = await budget.compute_company_spent(s, c)
            obj = CompanyRead.model_validate(c)
            result.append(obj.model_copy(update={"cost_spent_period": float(spent)}))
    return result


@router.get("/{company_id}", response_model=CompanyRead)
async def get_company(company_id: int):
    async with SessionMaker() as s:
        company = await s.get(Company, company_id)
    if company is None:
        raise HTTPException(404, "company not found")
    return company


@router.patch("/{company_id}", response_model=CompanyRead)
async def update_company(company_id: int, data: CompanyUpdate):
    async with SessionMaker() as s:
        async with s.begin():
            company = await s.get(Company, company_id)
            if company is None:
                raise HTTPException(404, "company not found")
            for field, value in data.model_dump(exclude_unset=True).items():
                setattr(company, field, value)
    return company
