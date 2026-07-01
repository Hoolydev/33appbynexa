from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_JS = ROOT / "data.js"
OUT = ROOT / "supabase" / "migrations" / "202606230002_seed_current_spreadsheets.sql"


def sql(value):
    if value is None or value == "":
        return "null"
    return "'" + str(value).replace("'", "''") + "'"


def sql_date(value):
    if not value:
        return "null"
    return sql(value)


def load_data():
    text = DATA_JS.read_text(encoding="utf-8")
    match = re.search(r"window\.FRANCHISE_DATA\s*=\s*(\{.*\});\s*$", text, re.S)
    if not match:
        raise RuntimeError("data.js não está no formato esperado")
    return json.loads(match.group(1))


def main():
    data = load_data()
    lines = [
        "-- Dados gerados a partir das planilhas atuais.",
        "-- Regerar com: python3 scripts/generate_supabase_seed.py",
        "begin;",
        "",
    ]

    for index, task in enumerate(data["modelTasks"], start=1):
        lines.append(
            "insert into public.roadmap_task_templates (sort_order, item, phase, process) "
            f"values ({index}, {sql(task.get('item'))}, {sql(task['phase'])}, {sql(task['process'])}) "
            "on conflict (phase, item, process) do update set sort_order = excluded.sort_order;"
        )

    lines.append("")
    for index, item in enumerate(data["purchaseItems"], start=1):
        lines.append(
            "insert into public.purchase_item_templates (sort_order, item) "
            f"values ({index}, {sql(item)}) "
            "on conflict (item) do update set sort_order = excluded.sort_order;"
        )

    lines.append("")
    for unit in data["units"]:
        lines.append(
            "insert into public.units (id, name, city, state, franchisee, opening_date, source_file) "
            f"values ({sql(unit['id'])}, {sql(unit['name'])}, {sql(unit['city'])}, {sql(unit.get('state'))}, "
            f"{sql(unit.get('franchisee'))}, {sql_date(unit.get('openingDate'))}, {sql(unit.get('sourceFile'))}) "
            "on conflict (id) do update set "
            "name = excluded.name, city = excluded.city, state = excluded.state, franchisee = excluded.franchisee, "
            "opening_date = excluded.opening_date, source_file = excluded.source_file;"
        )

        for task_index, task in enumerate(unit["tasks"], start=1):
            lines.append(
                "insert into public.roadmap_tasks (id, unit_id, template_id, item, phase, process, status, deadline, actual_date, notes, sort_order) "
                "values ("
                f"{sql(task['id'])}, {sql(unit['id'])}, "
                "(select id from public.roadmap_task_templates where phase = "
                f"{sql(task['phase'])} and item is not distinct from {sql(task.get('item'))} and process = {sql(task['process'])} limit 1), "
                f"{sql(task.get('item'))}, {sql(task['phase'])}, {sql(task['process'])}, {sql(task.get('status'))}, "
                f"{sql_date(task.get('deadline'))}, {sql_date(task.get('actualDate'))}, {sql(task.get('notes'))}, {task_index}) "
                "on conflict (id) do update set "
                "status = excluded.status, deadline = excluded.deadline, actual_date = excluded.actual_date, notes = excluded.notes, "
                "sort_order = excluded.sort_order;"
            )

        for purchase_index, purchase in enumerate(unit["purchases"], start=1):
            lines.append(
                "insert into public.purchase_items (id, unit_id, template_id, item, status, notes, sort_order) "
                "values ("
                f"{sql(purchase['id'])}, {sql(unit['id'])}, "
                f"(select id from public.purchase_item_templates where item = {sql(purchase['item'])} limit 1), "
                f"{sql(purchase['item'])}, {sql(purchase.get('status'))}, {sql(purchase.get('notes'))}, {purchase_index}) "
                "on conflict (id) do update set status = excluded.status, notes = excluded.notes, sort_order = excluded.sort_order;"
            )
        lines.append("")

    for acc_unit in data["accreditation"]["units"]:
        lines.append(
            "insert into public.accreditation_units (id, name, owner_name) "
            f"values ({sql(acc_unit['id'])}, {sql(acc_unit['name'])}, {sql(acc_unit.get('owner'))}) "
            "on conflict (id) do update set name = excluded.name, owner_name = excluded.owner_name;"
        )

    lines.append("")
    for proc_index, procedure in enumerate(data["accreditation"]["procedures"], start=1):
        lines.append(
            "insert into public.accreditation_procedures (id, group_name, name, sort_order) "
            f"values ({sql(procedure['id'])}, {sql(procedure['group'])}, {sql(procedure['name'])}, {proc_index}) "
            "on conflict (id) do update set group_name = excluded.group_name, name = excluded.name, sort_order = excluded.sort_order;"
        )
        for unit_id, status in procedure["statuses"].items():
            lines.append(
                "insert into public.accreditation_statuses (procedure_id, unit_id, status) "
                f"values ({sql(procedure['id'])}, {sql(unit_id)}, {sql(status)}) "
                "on conflict (procedure_id, unit_id) do update set status = excluded.status;"
            )

    lines.extend(["", "commit;", ""])
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(OUT)


if __name__ == "__main__":
    main()
