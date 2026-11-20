#!/usr/bin/env python3
"""
Generates realistic Dumfries & Galloway sample JSON files in public/data/
for local development and preview before the first live GitHub Actions TNDS sync.

Uses real Dumfries & Galloway towns, landmarks, and coordinates.
"""

from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
from typing import Any

STOPS: list[dict[str, Any]] = [
    # Dumfries
    {"atcoCode": "670000101", "name": "Whitesands", "locality": "Dumfries", "indicator": "Stand 1", "lat": 55.06921, "lng": -3.61342},
    {"atcoCode": "670000102", "name": "Whitesands", "locality": "Dumfries", "indicator": "Stand 3", "lat": 55.06885, "lng": -3.61305},
    {"atcoCode": "670000103", "name": "Great King Street", "locality": "Dumfries", "indicator": "o/s Loreburn Centre", "lat": 55.07065, "lng": -3.60985},
    {"atcoCode": "670000104", "name": "Dumfries Railway Station", "locality": "Dumfries", "indicator": "forecourt", "lat": 55.07482, "lng": -3.60612},
    {"atcoCode": "670000105", "name": "DGRI (Dumfries & Galloway Royal Infirmary)", "locality": "Dumfries", "indicator": "Main Entrance", "lat": 55.06192, "lng": -3.64311},
    {"atcoCode": "670000106", "name": "Crichton Campus", "locality": "Dumfries", "indicator": "Easterbrook Hall", "lat": 55.04935, "lng": -3.59315},
    {"atcoCode": "670000107", "name": "Heathhall Industrial Estate", "locality": "Dumfries", "indicator": "opp Tesco", "lat": 55.09145, "lng": -3.56882},
    # Annan & Gretna & Carlisle corridor (Route 79)
    {"atcoCode": "670000201", "name": "Collin Village", "locality": "Collin", "indicator": "opp Post Office", "lat": 55.06112, "lng": -3.52451},
    {"atcoCode": "670000202", "name": "Cummertrees", "locality": "Cummertrees", "indicator": "adj Village Hall", "lat": 54.99124, "lng": -3.33721},
    {"atcoCode": "670000203", "name": "Annan Bus Station", "locality": "Annan", "indicator": "Stand 1", "lat": 54.98691, "lng": -3.26105},
    {"atcoCode": "670000204", "name": "High Street", "locality": "Annan", "indicator": "opp Bank of Scotland", "lat": 54.98732, "lng": -3.25841},
    {"atcoCode": "670000205", "name": "Annan Academy", "locality": "Annan", "indicator": "outside", "lat": 54.99012, "lng": -3.25420},
    {"atcoCode": "670000206", "name": "Eastriggs", "locality": "Eastriggs", "indicator": "opp Museum", "lat": 54.98965, "lng": -3.17315},
    {"atcoCode": "670000207", "name": "Central Avenue", "locality": "Gretna", "indicator": "adj Gretna Gateway", "lat": 54.99491, "lng": -3.06312},
    {"atcoCode": "090012345", "name": "Carlisle Bus Station", "locality": "Carlisle", "indicator": "Bay 6", "lat": 54.89251, "lng": -2.93291},
    # Lockerbie, Moffat, Langholm & Glasgow corridor (81, X74, 382)
    {"atcoCode": "670000301", "name": "Lochmaben High Street", "locality": "Lochmaben", "indicator": "opp Town Hall", "lat": 55.12824, "lng": -3.44085},
    {"atcoCode": "670000302", "name": "Lockerbie High Street", "locality": "Lockerbie", "indicator": "opp Town Hall", "lat": 55.12132, "lng": -3.35418},
    {"atcoCode": "670000303", "name": "Lockerbie Railway Station", "locality": "Lockerbie", "indicator": "outside", "lat": 55.12281, "lng": -3.35122},
    {"atcoCode": "670000304", "name": "Beattock", "locality": "Beattock", "indicator": "Main Street", "lat": 55.31145, "lng": -3.45781},
    {"atcoCode": "670000305", "name": "Moffat High Street", "locality": "Moffat", "indicator": "opp Town Hall", "lat": 55.33322, "lng": -3.44265},
    {"atcoCode": "670000306", "name": "Langholm High Street", "locality": "Langholm", "indicator": "o/s Town Hall", "lat": 55.15172, "lng": -2.99912},
    {"atcoCode": "609000101", "name": "Buchanan Bus Station", "locality": "Glasgow", "indicator": "Stance 42", "lat": 55.86562, "lng": -4.25085},
    # Galloway West: Dalbeattie, Castle Douglas, Kirkcudbright, Gatehouse, Newton Stewart, Stranraer (501, 500, 416)
    {"atcoCode": "670000401", "name": "Crocketford", "locality": "Crocketford", "indicator": "Main Street", "lat": 55.02891, "lng": -3.83512},
    {"atcoCode": "670000402", "name": "Dalbeattie High Street", "locality": "Dalbeattie", "indicator": "opp Town Hall", "lat": 54.93342, "lng": -3.82112},
    {"atcoCode": "670000403", "name": "King Street", "locality": "Castle Douglas", "indicator": "opp Market Hill", "lat": 54.94121, "lng": -3.93021},
    {"atcoCode": "670000404", "name": "Castle Douglas High School", "locality": "Castle Douglas", "indicator": "outside", "lat": 54.94385, "lng": -3.93441},
    {"atcoCode": "670000405", "name": "Harbour Square", "locality": "Kirkcudbright", "indicator": "opp Tolbooth", "lat": 54.83642, "lng": -4.05482},
    {"atcoCode": "670000406", "name": "Gatehouse of Fleet High Street", "locality": "Gatehouse of Fleet", "indicator": "opp Clock Tower", "lat": 54.88081, "lng": -4.18691},
    {"atcoCode": "670000407", "name": "Creetown", "locality": "Creetown", "indicator": "St John Street", "lat": 54.90122, "lng": -4.37715},
    {"atcoCode": "670000408", "name": "Dashwood Square", "locality": "Newton Stewart", "indicator": "Stand A", "lat": 54.96091, "lng": -4.48242},
    {"atcoCode": "670000409", "name": "Glenluce", "locality": "Glenluce", "indicator": "Main Street", "lat": 54.87681, "lng": -4.81242},
    {"atcoCode": "670000410", "name": "Port Rodie", "locality": "Stranraer", "indicator": "Stand 1", "lat": 54.90342, "lng": -5.02791},
    {"atcoCode": "670000411", "name": "Portpatrick Harbour", "locality": "Portpatrick", "indicator": "Main Street", "lat": 54.84192, "lng": -5.11542},
    # Nithsdale: Thornhill, Sanquhar (246)
    {"atcoCode": "670000501", "name": "Auldgirth", "locality": "Auldgirth", "indicator": "Main Road", "lat": 55.17452, "lng": -3.70421},
    {"atcoCode": "670000502", "name": "Drumlanrig Street", "locality": "Thornhill", "indicator": "opp Cross", "lat": 55.24212, "lng": -3.76415},
    {"atcoCode": "670000503", "name": "High Street", "locality": "Sanquhar", "indicator": "opp Tolbooth", "lat": 55.36881, "lng": -3.92421},
]


def add_mins(hhmm: str, mins: int) -> str:
    h, m = map(int, hhmm.split(":"))
    total = (h * 60 + m + mins) % (24 * 60)
    return f"{total // 60:02d}:{total % 60:02d}"


def build_trips(
    prefix: str,
    departures: list[str],
    stop_offsets: list[tuple[str, int]],
    headsign: str,
    days: list[str],
    school_only: bool = False,
    non_school_only: bool = False,
    bank_holidays: str | None = "Does not run on bank holidays",
) -> list[dict[str, Any]]:
    trips = []
    for idx, dep in enumerate(departures, start=1):
        stops = [[stop_id, add_mins(dep, offset)] for stop_id, offset in stop_offsets]
        trips.append(
            {
                "id": f"{prefix}-{idx}",
                "dep": stops[0][1],
                "arr": stops[-1][1],
                "headsign": headsign,
                "days": days,
                "schoolOnly": school_only,
                "nonSchoolOnly": non_school_only,
                "bankHolidays": bank_holidays,
                "stops": stops,
            }
        )
    return trips


def main() -> None:
    out_dir = Path(__file__).resolve().parent.parent / "public" / "data"
    schedules_dir = out_dir / "schedules"
    schedules_dir.mkdir(parents=True, exist_ok=True)
    for f in schedules_dir.glob("*.json"):
        f.unlink()

    mon_sat = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    mon_fri = ["Mon", "Tue", "Wed", "Thu", "Fri"]
    sun = ["Sun"]

    route_defs = [
        {
            "id": "79-stagecoach-west-scotland",
            "lineName": "79",
            "operator": "Stagecoach West Scotland",
            "origin": "Dumfries",
            "destination": "Carlisle",
            "description": "Dumfries – Collin – Annan – Eastriggs – Gretna – Carlisle",
            "outboundLabel": "Towards Carlisle",
            "inboundLabel": "Towards Dumfries",
            "outbound": (
                build_trips(
                    "out-mf",
                    ["06:45", "07:45", "08:45", "09:45", "10:45", "11:45", "12:45", "13:45", "14:45", "15:45", "16:45", "17:45", "19:15", "20:45"],
                    [("670000101", 0), ("670000103", 3), ("670000201", 11), ("670000202", 24), ("670000203", 31), ("670000204", 33), ("670000206", 42), ("670000207", 51), ("090012345", 74)],
                    "Carlisle Bus Station",
                    mon_sat,
                )
                + build_trips(
                    "out-sch",
                    ["08:05"],
                    [("670000101", 0), ("670000201", 11), ("670000203", 31), ("670000205", 36), ("670000207", 54)],
                    "Annan Academy & Gretna",
                    mon_fri,
                    school_only=True,
                )
                + build_trips(
                    "out-sun",
                    ["09:45", "11:45", "13:45", "15:45", "17:45"],
                    [("670000101", 0), ("670000103", 3), ("670000201", 11), ("670000203", 30), ("670000204", 32), ("670000207", 49), ("090012345", 72)],
                    "Carlisle Bus Station",
                    sun,
                    bank_holidays="Runs on selected bank holidays",
                )
            ),
            "inbound": (
                build_trips(
                    "in-mf",
                    ["07:10", "08:10", "09:10", "10:10", "11:10", "12:10", "13:10", "14:10", "15:10", "16:10", "17:10", "18:10", "19:40", "21:10"],
                    [("090012345", 0), ("670000207", 23), ("670000206", 32), ("670000204", 41), ("670000203", 43), ("670000202", 50), ("670000201", 63), ("670000103", 71), ("670000101", 75)],
                    "Dumfries Whitesands",
                    mon_sat,
                )
                + build_trips(
                    "in-sun",
                    ["10:10", "12:10", "14:10", "16:10", "18:10"],
                    [("090012345", 0), ("670000207", 22), ("670000204", 40), ("670000203", 42), ("670000201", 61), ("670000101", 73)],
                    "Dumfries Whitesands",
                    sun,
                    bank_holidays="Runs on selected bank holidays",
                )
            ),
        },
        {
            "id": "81-stagecoach-west-scotland",
            "lineName": "81",
            "operator": "Stagecoach West Scotland",
            "origin": "Dumfries",
            "destination": "Moffat",
            "description": "Dumfries – Lochmaben – Lockerbie – Beattock – Moffat",
            "outboundLabel": "Towards Lockerbie & Moffat",
            "inboundLabel": "Towards Dumfries",
            "outbound": build_trips(
                "out-ms",
                ["07:20", "08:35", "10:05", "11:35", "13:05", "14:35", "16:05", "17:35", "19:05"],
                [("670000102", 0), ("670000104", 5), ("670000107", 11), ("670000301", 22), ("670000302", 31), ("670000303", 33), ("670000304", 52), ("670000305", 58)],
                "Moffat High Street",
                mon_sat,
            ),
            "inbound": build_trips(
                "in-ms",
                ["07:15", "08:30", "09:50", "11:20", "12:50", "14:20", "15:50", "17:20", "18:50"],
                [("670000305", 0), ("670000304", 6), ("670000303", 25), ("670000302", 27), ("670000301", 36), ("670000107", 47), ("670000104", 53), ("670000102", 58)],
                "Dumfries Whitesands",
                mon_sat,
            ),
        },
        {
            "id": "x74-stagecoach-west-scotland",
            "lineName": "X74",
            "operator": "Stagecoach West Scotland",
            "origin": "Dumfries",
            "destination": "Glasgow",
            "description": "Express: Dumfries – Moffat – Glasgow Buchanan Bus Station",
            "outboundLabel": "Towards Moffat & Glasgow",
            "inboundLabel": "Towards Dumfries",
            "outbound": build_trips(
                "out-all",
                ["06:55", "08:55", "10:55", "12:55", "14:55", "16:55", "18:55"],
                [("670000101", 0), ("670000104", 4), ("670000305", 34), ("609000101", 112)],
                "Glasgow Buchanan Bus Station",
                mon_sat + sun,
                bank_holidays="Does not run on Christmas or New Year holidays",
            ),
            "inbound": build_trips(
                "in-all",
                ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00"],
                [("609000101", 0), ("670000305", 76), ("670000104", 107), ("670000101", 112)],
                "Dumfries Whitesands",
                mon_sat + sun,
                bank_holidays="Does not run on Christmas or New Year holidays",
            ),
        },
        {
            "id": "501-stagecoach-west-scotland",
            "lineName": "501",
            "operator": "Stagecoach West Scotland",
            "origin": "Dumfries",
            "destination": "Kirkcudbright",
            "description": "Dumfries – DGRI – Dalbeattie – Castle Douglas – Kirkcudbright",
            "outboundLabel": "Towards Castle Douglas & Kirkcudbright",
            "inboundLabel": "Towards DGRI & Dumfries",
            "outbound": (
                build_trips(
                    "out-ms",
                    ["07:30", "08:30", "09:30", "10:30", "11:30", "12:30", "13:30", "14:30", "15:30", "16:30", "17:30", "18:45"],
                    [("670000102", 0), ("670000105", 8), ("670000402", 31), ("670000403", 45), ("670000405", 66)],
                    "Kirkcudbright Harbour Square",
                    mon_sat,
                )
                + build_trips(
                    "out-sch",
                    ["08:10"],
                    [("670000102", 0), ("670000402", 28), ("670000403", 40), ("670000404", 44)],
                    "Castle Douglas High School",
                    mon_fri,
                    school_only=True,
                )
            ),
            "inbound": build_trips(
                "in-ms",
                ["07:15", "08:15", "09:15", "10:15", "11:15", "12:15", "13:15", "14:15", "15:15", "16:15", "17:15", "18:30"],
                [("670000405", 0), ("670000403", 21), ("670000402", 35), ("670000105", 58), ("670000102", 66)],
                "Dumfries Whitesands",
                mon_sat,
            ),
        },
        {
            "id": "500-stagecoach-west-scotland",
            "lineName": "500",
            "operator": "Stagecoach West Scotland",
            "origin": "Dumfries",
            "destination": "Stranraer",
            "description": "Dumfries – DGRI – Crocketford – Castle Douglas – Gatehouse – Newton Stewart – Stranraer",
            "outboundLabel": "Towards Newton Stewart & Stranraer",
            "inboundLabel": "Towards Castle Douglas & Dumfries",
            "outbound": build_trips(
                "out-ms",
                ["07:05", "09:05", "11:05", "13:05", "15:05", "17:05"],
                [("670000102", 0), ("670000105", 8), ("670000401", 22), ("670000403", 36), ("670000406", 58), ("670000407", 75), ("670000408", 87), ("670000409", 112), ("670000410", 128)],
                "Stranraer Port Rodie",
                mon_sat,
            ),
            "inbound": build_trips(
                "in-ms",
                ["07:00", "09:00", "11:00", "13:00", "15:00", "17:00"],
                [("670000410", 0), ("670000409", 16), ("670000408", 41), ("670000407", 53), ("670000406", 70), ("670000403", 92), ("670000401", 106), ("670000105", 120), ("670000102", 128)],
                "Dumfries Whitesands",
                mon_sat,
            ),
        },
        {
            "id": "246-stagecoach-west-scotland",
            "lineName": "246",
            "operator": "Stagecoach West Scotland",
            "origin": "Dumfries",
            "destination": "Sanquhar",
            "description": "Dumfries – Auldgirth – Thornhill – Sanquhar",
            "outboundLabel": "Towards Thornhill & Sanquhar",
            "inboundLabel": "Towards Dumfries",
            "outbound": build_trips(
                "out-ms",
                ["07:50", "09:50", "11:50", "13:50", "15:50", "17:50"],
                [("670000101", 0), ("670000104", 5), ("670000501", 19), ("670000502", 29), ("670000503", 49)],
                "Sanquhar High Street",
                mon_sat,
            ),
            "inbound": build_trips(
                "in-ms",
                ["07:45", "09:45", "11:45", "13:45", "15:45", "17:45"],
                [("670000503", 0), ("670000502", 20), ("670000501", 30), ("670000104", 44), ("670000101", 49)],
                "Dumfries Whitesands",
                mon_sat,
            ),
        },
        {
            "id": "d3-houstons-coaches",
            "lineName": "D3",
            "operator": "Houstons Coaches",
            "origin": "Crichton Campus",
            "destination": "DGRI Hospital",
            "description": "Dumfries Town Service: Crichton Campus – Whitesands – Railway Station – DGRI Hospital",
            "outboundLabel": "Towards DGRI Hospital",
            "inboundLabel": "Towards Whitesands & Crichton",
            "outbound": build_trips(
                "out-all",
                ["07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "19:00", "20:00"],
                [("670000106", 0), ("670000103", 7), ("670000101", 10), ("670000104", 14), ("670000105", 22)],
                "DGRI Main Entrance",
                mon_sat + sun,
                bank_holidays=None,
            ),
            "inbound": build_trips(
                "in-all",
                ["07:35", "08:05", "08:35", "09:05", "09:35", "10:05", "10:35", "11:05", "11:35", "12:05", "12:35", "13:05", "13:35", "14:05", "14:35", "15:05", "15:35", "16:05", "16:35", "17:05", "17:35", "18:05", "19:05", "20:05"],
                [("670000105", 0), ("670000104", 8), ("670000101", 12), ("670000103", 15), ("670000106", 22)],
                "Crichton Campus",
                mon_sat + sun,
                bank_holidays=None,
            ),
        },
        {
            "id": "382-telfords-coaches",
            "lineName": "382",
            "operator": "Telfords Coaches",
            "origin": "Lockerbie",
            "destination": "Langholm",
            "description": "Lockerbie – Langholm High Street",
            "outboundLabel": "Towards Langholm",
            "inboundLabel": "Towards Lockerbie",
            "outbound": build_trips(
                "out-mf",
                ["08:15", "11:15", "14:15", "17:15"],
                [("670000303", 0), ("670000302", 3), ("670000306", 34)],
                "Langholm High Street",
                mon_fri,
            ),
            "inbound": build_trips(
                "in-mf",
                ["09:00", "12:00", "15:00", "17:55"],
                [("670000306", 0), ("670000302", 31), ("670000303", 34)],
                "Lockerbie Railway Station",
                mon_fri,
            ),
        },
        {
            "id": "416-stagecoach-west-scotland",
            "lineName": "416",
            "operator": "Stagecoach West Scotland",
            "origin": "Stranraer",
            "destination": "Portpatrick",
            "description": "Stranraer Port Rodie – Portpatrick Harbour",
            "outboundLabel": "Towards Portpatrick",
            "inboundLabel": "Towards Stranraer",
            "outbound": build_trips(
                "out-ms",
                ["08:30", "10:30", "12:30", "14:30", "16:30", "18:00"],
                [("670000410", 0), ("670000411", 20)],
                "Portpatrick Harbour",
                mon_sat,
                non_school_only=False,
            ),
            "inbound": build_trips(
                "in-ms",
                ["08:55", "10:55", "12:55", "14:55", "16:55", "18:25"],
                [("670000411", 0), ("670000410", 20)],
                "Stranraer Port Rodie",
                mon_sat,
            ),
        },
    ]

    routes_index = []
    total_trips = 0
    day_order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    for r in route_defs:
        stop_ids = []
        seen_stops = set()
        days_set = set()
        for t in r["outbound"] + r["inbound"]:
            days_set.update(t["days"])
            for s_id, _ in t["stops"]:
                if s_id not in seen_stops:
                    seen_stops.add(s_id)
                    stop_ids.append(s_id)

        trip_count = len(r["outbound"]) + len(r["inbound"])
        total_trips += trip_count

        schedule = {
            "routeId": r["id"],
            "lineName": r["lineName"],
            "operator": r["operator"],
            "origin": r["origin"],
            "destination": r["destination"],
            "description": r["description"],
            "outboundLabel": r["outboundLabel"],
            "inboundLabel": r["inboundLabel"],
            "outbound": sorted(r["outbound"], key=lambda x: x["dep"]),
            "inbound": sorted(r["inbound"], key=lambda x: x["dep"]),
        }
        (schedules_dir / f"{r['id']}.json").write_text(
            json.dumps(schedule, separators=(",", ":"), ensure_ascii=False),
            encoding="utf-8",
        )

        routes_index.append(
            {
                "id": r["id"],
                "lineName": r["lineName"],
                "operator": r["operator"],
                "origin": r["origin"],
                "destination": r["destination"],
                "description": r["description"],
                "stopIds": stop_ids,
                "tripCount": trip_count,
                "days": [d for d in day_order if d in days_set],
            }
        )

    sorted_stops = sorted(
        STOPS, key=lambda s: (s["locality"].lower(), s["name"].lower(), s["atcoCode"])
    )
    (out_dir / "stops.json").write_text(
        json.dumps(sorted_stops, separators=(",", ":"), ensure_ascii=False),
        encoding="utf-8",
    )
    (out_dir / "routes.json").write_text(
        json.dumps(routes_index, separators=(",", ":"), ensure_ascii=False),
        encoding="utf-8",
    )
    metadata = {
        "lastUpdated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "stopCount": len(sorted_stops),
        "routeCount": len(routes_index),
        "tripCount": total_trips,
        "source": "sample",
    }
    (out_dir / "metadata.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Generated sample dataset: {metadata}")


if __name__ == "__main__":
    main()
