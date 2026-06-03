"""
YAML workflow tanımını DB'ye yükler.

Kurallar:
  - Aynı (company_id, name) çifti varsa mevcut workflow güncellenir (upsert).
  - Phase'ler her yüklemede silinip yeniden yazılır (basit reload, Faz 3'te versiyona geçilir).
  - 2-pass: Pass-1 Phase nesneleri yaratır, Pass-2 next_phase_id'leri bağlar.
"""

import yaml
from sqlalchemy import select, delete

from app.models import Workflow, Phase, Skill


def _role_id_for_phase(p: dict, data: dict) -> str:
    """Phase dict'inden role id'yi çıkar.
    Önce explicit 'role' alanına bakar, yoksa 'id'yi kullanır."""
    if "role" in p:
        return str(p["role"])
    return str(p.get("id", ""))


async def load_workflow_from_yaml(session, company_id: int, yaml_text: str) -> Workflow:
    """YAML metnini parse edip Workflow + Phase satırlarını upsert eder.
    Çağrıldığında oturumun açık olduğu varsayılır; kendi transaction'ını başlatır.
    """
    data = yaml.safe_load(yaml_text)

    async with session.begin():
        # ── 1) Workflow upsert ────────────────────────────────────────────────
        wf = (await session.execute(
            select(Workflow).where(
                Workflow.company_id == company_id,
                Workflow.name == data["name"],
            )
        )).scalar_one_or_none()

        version = str(data.get("version", "0.1"))
        description = data.get("description")

        if wf is None:
            wf = Workflow(
                company_id=company_id,
                name=data["name"],
                version=version,
                yaml_source=yaml_text,
                description=description,
            )
            session.add(wf)
            await session.flush()   # id üret
        else:
            wf.version = version
            wf.yaml_source = yaml_text
            wf.description = description

        # ── 2) Eski Phase'leri sil ────────────────────────────────────────────
        # Uyarı: aktif ticket'lar current_phase_id=NULL olacak (FK ON DELETE SET NULL).
        await session.execute(delete(Phase).where(Phase.workflow_id == wf.id))
        await session.flush()

        # ── 3) Role → default context refs haritası ───────────────────────────
        roles_ctx: dict[str, list[str]] = {
            r["id"]: r.get("default_context_refs", [])
            for r in data.get("roles", [])
        }

        # ── 4) Pass-1: Phase nesneleri yarat (next_phase_id henüz None) ───────
        phases_by_name: dict[str, tuple[Phase, str | None]] = {}
        for ord_i, p in enumerate(data["phases"]):
            phase_name = str(p.get("id") or p.get("name") or p.get("skill") or ord_i)

            # Skill ismiyle eşleştir (aynı isimde birden fazla varsa ilkini al)
            skill = (await session.execute(
                select(Skill).where(Skill.name == p["skill"]).limit(1)
            )).scalar_one_or_none()
            if skill is None:
                raise ValueError(
                    f"Workflow loader: '{p['skill']}' adlı skill DB'de bulunamadı. "
                    "Önce skill'i seed edin."
                )

            # Role'ün ve phase'in context ref'lerini birleştir
            role_id = _role_id_for_phase(p, data)
            role_refs = roles_ctx.get(role_id, [])
            phase_refs = p.get("context_refs_add", [])
            merged_refs = list(dict.fromkeys(role_refs + phase_refs))  # sıra koruyarak deduplicate

            phase = Phase(
                workflow_id=wf.id,
                ordinal=ord_i,
                name=phase_name,
                skill_id=skill.id,
                gate=p["gate"],
                next_phase_id=None,                 # Pass-2'de doldurulacak
                default_context_doc_names=merged_refs,
                max_reworks=p.get("max_reworks"),                       # Faz 2.5
                branch_on_verdict=p.get("branch_on_verdict") or {},     # Faz 2.5
                default_verdict=p.get("default_verdict", "approve"),   # Faz 2.6
            )
            session.add(phase)
            await session.flush()                   # id üret

            next_name = p.get("next")
            phases_by_name[phase_name] = (phase, None if next_name in (None, "null") else str(next_name))

        # ── 5) Pass-2: next_phase_id bağla + branch_on_verdict validasyonu ──
        all_phase_names = set(phases_by_name.keys())

        for name, (phase, next_name) in phases_by_name.items():
            if next_name is not None:
                if next_name not in phases_by_name:
                    raise ValueError(
                        f"Workflow loader: '{name}' phase'inin next'i '{next_name}' "
                        "bulunamadı. YAML'ı kontrol edin."
                    )
                phase.next_phase_id = phases_by_name[next_name][0].id

        # Load-time validasyon: branch_on_verdict + default_verdict tutarlılığı
        for p in data["phases"]:
            phase_id = str(p.get("id") or p.get("name") or p.get("skill"))
            bov = p.get("branch_on_verdict") or {}
            dv = p.get("default_verdict", "approve")

            # default_verdict boş olamaz
            if not dv:
                raise ValueError(
                    f"default_verdict cannot be empty for phase {phase_id!r}"
                )

            # default_verdict branch_on_verdict anahtarlarıyla çakışmamalı
            if dv in bov:
                raise ValueError(
                    f"default_verdict {dv!r} cannot also be a branch verdict "
                    f"in phase {phase_id!r}"
                )

            # branch_on_verdict hedefleri mevcut phase adlarına referans etmeli
            for verdict_key, target_name in bov.items():
                if target_name not in all_phase_names:
                    raise ValueError(
                        f"branch_on_verdict references unknown phase {target_name!r} "
                        f"from phase {phase_id!r}/{verdict_key!r}"
                    )

    return wf
