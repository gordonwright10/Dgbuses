#!/usr/bin/env python3
"""
D&G Bus Finder — Live Data Pipeline (ETL)

Fetches live Dumfries & Galloway bus stops from DfT NaPTAN (ATCO area 680)
and live Scottish bus timetables from Traveline TNDS (S.zip via FTP),
compiling them into compact static JSON files in public/data/.

Uses Python 3 standard library only for zero-dependency execution in GitHub Actions.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import ftplib
import io
import json
import os
import re
import sys
import tempfile
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Any

NAPTAN_URL_TEMPLATE = (
    "https://naptan.api.dft.gov.uk/v1/access-nodes"
    "?atcoAreaCodes={codes}&dataFormat=csv"
)
DG_ATCO_PREFIX = "680"
NAPTAN_URL = NAPTAN_URL_TEMPLATE.format(codes=DG_ATCO_PREFIX)
TNDS_FTP_HOST = "ftp.tnds.basemap.co.uk"
TNDS_ZIP_NAME = "S.zip"

BUS_STOP_TYPES = {
    "",
    "BCT",  # Bus/Coach/Tram on-street stop
    "BCS",  # Bus/Coach bay
    "BCQ",  # Variable bay
    "BCE",  # Bus/Coach station entrance
    "BST",  # Bus/Coach station access area
    "BCP",  # Bus/Coach stop point
    "MKD",  # Marked bus stop
    "CUS",  # Customary stop
    "HAR",  # Hail and ride
    "FLX",  # Flexible zone
}

DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
DAY_TAG_MAP = {
    "Monday": ["Mon"],
    "Tuesday": ["Tue"],
    "Wednesday": ["Wed"],
    "Thursday": ["Thu"],
    "Friday": ["Fri"],
    "Saturday": ["Sat"],
    "Sunday": ["Sun"],
    "MondayToFriday": ["Mon", "Tue", "Wed", "Thu", "Fri"],
    "MondayToSaturday": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    "MondayToSunday": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    "Weekend": ["Sat", "Sun"],
}
NOT_DAY_TAG_MAP = {
    "NotMonday": "Mon",
    "NotTuesday": "Tue",
    "NotWednesday": "Wed",
    "NotThursday": "Thu",
    "NotFriday": "Fri",
    "NotSaturday": "Sat",
    "NotSunday": "Sun",
}

DURATION_RE = re.compile(
    r"^-?P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$"
)


def log(msg: str) -> None:
    print(f"[ingest] {msg}", flush=True)


def parse_iso_duration(value: str | None) -> int:
    """Parse an ISO-8601 duration string (e.g. PT4M, PT1H15M, PT30S) into seconds."""
    if not value:
        return 0
    text = value.strip()
    match = DURATION_RE.match(text)
    if not match:
        return 0
    days = int(match.group(1) or 0)
    hours = int(match.group(2) or 0)
    minutes = int(match.group(3) or 0)
    seconds = int(round(float(match.group(4) or 0)))
    total = days * 86400 + hours * 3600 + minutes * 60 + seconds
    return -total if text.startswith("-") else total


def parse_time_to_seconds(value: str | None, day_shift: int = 0) -> int | None:
    """Parse HH:MM:SS or HH:MM into seconds since midnight (plus day shift)."""
    if not value:
        return None
    parts = value.strip().split(":")
    if len(parts) < 2:
        return None
    try:
        hours = int(parts[0])
        minutes = int(parts[1])
        seconds = int(float(parts[2])) if len(parts) > 2 else 0
    except ValueError:
        return None
    return (hours * 3600 + minutes * 60 + seconds) + (day_shift * 86400)


def format_hhmm(total_seconds: int) -> str:
    """Format seconds since midnight as HH:MM (wrapping at 24h)."""
    wrapped = total_seconds % 86400
    hours = wrapped // 3600
    minutes = (wrapped % 3600) // 60
    return f"{hours:02d}:{minutes:02d}"


def slugify(text: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower()).strip("-")
    return cleaned or "route"


def natural_route_sort_key(line_name: str) -> tuple[int, int, str]:
    """Sort route numbers naturally: 1, 2, 79, 81, 500, D3, X74."""
    match = re.match(r"^(\d+)(.*)$", line_name.strip())
    if match:
        return (0, int(match.group(1)), match.group(2).lower())
    match_prefix = re.match(r"^([A-Za-z]+)(\d+)(.*)$", line_name.strip())
    if match_prefix:
        return (
            1,
            int(match_prefix.group(2)),
            f"{match_prefix.group(1).lower()}{match_prefix.group(3).lower()}",
        )
    return (2, 0, line_name.lower())


def strip_namespaces(root: ET.Element) -> None:
    """Strip XML namespace URIs in-place from every element tag."""
    for elem in root.iter():
        if isinstance(elem.tag, str) and "}" in elem.tag:
            elem.tag = elem.tag.rsplit("}", 1)[1]


def child_text(elem: ET.Element | None, path: str) -> str:
    if elem is None:
        return ""
    node = elem.find(path)
    if node is None or node.text is None:
        return ""
    return " ".join(node.text.split())


def clean_indicator(raw: str) -> str:
    text = " ".join(raw.split())
    if text.lower() in {"", "null", "none", "-"}:
        return ""
    return text


def fetch_naptan_csv_bytes(local_naptan: Path | None = None) -> bytes:
    if local_naptan is not None:
        log(f"Reading local NaPTAN CSV from {local_naptan}")
        return local_naptan.read_bytes()

    log(f"Downloading NaPTAN stops from {NAPTAN_URL}")
    req = urllib.request.Request(
        NAPTAN_URL,
        headers={"User-Agent": "Dgbuses-ETL/1.0 (+https://gordonwright10.github.io/Dgbuses/)"},
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        data = resp.read()
    log(f"Downloaded NaPTAN CSV ({len(data) / 1024:.1f} KB)")
    return data


def parse_naptan_stops(csv_bytes: bytes) -> dict[str, dict[str, Any]]:
    """Parse NaPTAN CSV bytes into a mapping of atcoCode -> stop dict."""
    text = csv_bytes.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise ValueError("NaPTAN CSV has no header row")

    # Case-insensitive column map
    col_map = {name.strip().lower(): name for name in reader.fieldnames if name}

    def get_col(row: dict[str, str], *candidates: str) -> str:
        for cand in candidates:
            actual = col_map.get(cand.lower())
            if actual is not None:
                val = row.get(actual)
                if val is not None and val.strip():
                    return " ".join(val.split())
        return ""

    stops: dict[str, dict[str, Any]] = {}
    total_rows = 0
    skipped_inactive = 0
    skipped_type = 0
    skipped_coords = 0

    for row in reader:
        total_rows += 1
        atco = get_col(row, "ATCOCode", "AtcoCode")
        if not atco:
            continue

        status = get_col(row, "Status").lower()
        if status and status != "active":
            skipped_inactive += 1
            continue

        stop_type = get_col(row, "StopType").upper()
        if stop_type and stop_type not in BUS_STOP_TYPES:
            skipped_type += 1
            continue

        lat_str = get_col(row, "Latitude")
        lng_str = get_col(row, "Longitude")
        try:
            lat = round(float(lat_str), 5)
            lng = round(float(lng_str), 5)
        except ValueError:
            skipped_coords += 1
            continue

        if not (49.0 <= lat <= 62.0 and -10.0 <= lng <= 3.0):
            skipped_coords += 1
            continue

        name = get_col(row, "CommonName") or atco
        locality = get_col(row, "LocalityName", "ParentLocalityName", "Town", "Suburb")
        indicator = clean_indicator(get_col(row, "Indicator"))
        street = get_col(row, "Street")
        landmark = get_col(row, "Landmark")

        if street.lower() in {"-", "---", "not available", "n/a", "none", "null"}:
            street = ""
        if landmark.lower() in {"-", "---", "not available", "n/a", "none", "null"}:
            landmark = ""

        stop_entry: dict[str, Any] = {
            "atcoCode": atco,
            "name": name,
            "locality": locality,
            "indicator": indicator,
            "lat": lat,
            "lng": lng,
        }
        if street and street.lower() != name.lower():
            stop_entry["street"] = street
        if landmark and landmark.lower() not in {name.lower(), street.lower()}:
            stop_entry["landmark"] = landmark

        stops[atco] = stop_entry

    log(
        f"Parsed NaPTAN: {total_rows} rows -> {len(stops)} active bus stops "
        f"(skipped: {skipped_inactive} inactive, {skipped_type} non-bus, {skipped_coords} bad coords)"
    )
    return stops


def download_tnds_zip(dest_path: Path, user: str, password: str) -> Path:
    """Download Traveline TNDS S.zip using FTP passive mode."""
    log(f"Connecting to TNDS FTP ({TNDS_FTP_HOST}) in passive mode...")
    with ftplib.FTP(TNDS_FTP_HOST, timeout=120) as ftp:
        ftp.login(user=user, passwd=password)
        ftp.set_pasv(True)
        log(f"Downloading {TNDS_ZIP_NAME} -> {dest_path}")
        with open(dest_path, "wb") as out_f:
            ftp.retrbinary(f"RETR {TNDS_ZIP_NAME}", out_f.write, blocksize=65536)
    size_mb = dest_path.stat().st_size / (1024 * 1024)
    log(f"Downloaded {TNDS_ZIP_NAME} ({size_mb:.1f} MB)")
    return dest_path


def humanize_bank_holidays(op_elem: ET.Element | None) -> str | None:
    """Convert TransXChange BankHolidayOperation into a plain-English note."""
    if op_elem is None:
        return None
    bh = op_elem.find("BankHolidayOperation")
    if bh is None:
        return None

    non_op = bh.find("DaysOfNonOperation")
    yes_op = bh.find("DaysOfOperation")

    non_tags = [child.tag for child in non_op] if non_op is not None else []
    yes_tags = [child.tag for child in yes_op] if yes_op is not None else []

    if non_tags:
        tag_set = set(non_tags)
        if (
            "AllBankHolidays" in tag_set
            or "HolidayMondays" in tag_set
            or "ScottishBankHolidays" in tag_set
            or len(tag_set) >= 5
        ):
            return "Does not run on bank holidays"
        if tag_set <= {
            "ChristmasDay",
            "BoxingDay",
            "NewYearsDay",
            "Jan2ndScotland",
            "ChristmasEve",
            "NewYearsEve",
            "Christmas",
            "DisplacementHolidays",
            "EarlyRunOff",
        }:
            return "Does not run on Christmas or New Year holidays"
        if "GoodFriday" in tag_set and len(tag_set) <= 3:
            return "Does not run on Good Friday or Christmas holidays"
        return "Does not run on selected bank holidays"

    if yes_tags:
        return "Runs on selected bank holidays"

    return None


def parse_operating_profile(
    op_elem: ET.Element | None,
    base_profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Parse TransXChange OperatingProfile into plain-English flags."""
    result = (
        {
            "days": list(base_profile["days"]),
            "schoolOnly": bool(base_profile["schoolOnly"]),
            "nonSchoolOnly": bool(base_profile["nonSchoolOnly"]),
            "bankHolidays": base_profile["bankHolidays"],
        }
        if base_profile is not None
        else {
            "days": [],
            "schoolOnly": False,
            "nonSchoolOnly": False,
            "bankHolidays": None,
        }
    )

    if op_elem is None:
        return result

    # 1. RegularDayType / DaysOfWeek
    days_elem = op_elem.find("RegularDayType/DaysOfWeek")
    if days_elem is not None:
        active: set[str] = set()
        excluded: set[str] = set()
        for child in days_elem:
            if child.tag in DAY_TAG_MAP:
                active.update(DAY_TAG_MAP[child.tag])
            elif child.tag in NOT_DAY_TAG_MAP:
                excluded.add(NOT_DAY_TAG_MAP[child.tag])
        if excluded and not active:
            active = set(DAY_ORDER) - excluded
        else:
            active -= excluded
        result["days"] = [d for d in DAY_ORDER if d in active]

    # 2. ServicedOrganisationDayType (School / College term dates)
    so_elem = op_elem.find("ServicedOrganisationDayType")
    if so_elem is not None:
        days_of_op = so_elem.find("DaysOfOperation")
        days_of_non_op = so_elem.find("DaysOfNonOperation")

        has_op_working = (
            days_of_op is not None
            and (
                days_of_op.find("WorkingDays") is not None
                or days_of_op.find(".//ServicedOrganisationRef") is not None
                and days_of_op.find("Holidays") is None
            )
        )
        has_op_holidays = days_of_op is not None and days_of_op.find("Holidays") is not None
        has_non_op_working = (
            days_of_non_op is not None
            and (
                days_of_non_op.find("WorkingDays") is not None
                or (
                    days_of_non_op.find(".//ServicedOrganisationRef") is not None
                    and days_of_non_op.find("Holidays") is None
                )
            )
        )

        if has_op_working and not has_op_holidays:
            result["schoolOnly"] = True
            result["nonSchoolOnly"] = False
        elif has_op_holidays or has_non_op_working:
            result["nonSchoolOnly"] = True
            result["schoolOnly"] = False

    # 3. BankHolidayOperation
    bh_note = humanize_bank_holidays(op_elem)
    if bh_note is not None:
        result["bankHolidays"] = bh_note

    return result


def parse_txc_xml(
    xml_bytes: bytes,
    reference_date: str | None = None,
) -> dict[str, Any] | None:
    """
    Parse a single TransXChange XML document.
    Returns None if the file does not serve any Dumfries & Galloway (680*) stop.
    """
    # Fast byte pre-filter before XML parsing
    if DG_ATCO_PREFIX.encode("ascii") not in xml_bytes:
        return None

    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return None

    strip_namespaces(root)

    # Verify at least one StopPointRef actually starts with "680"
    serves_dg = False
    for ref in root.iter("StopPointRef"):
        if ref.text and ref.text.strip().startswith(DG_ATCO_PREFIX):
            serves_dg = True
            break
    if not serves_dg:
        return None

    # Capture AnnotatedStopPointRef fallback metadata (for cross-border stops like Carlisle/Glasgow)
    xml_stops: dict[str, dict[str, Any]] = {}
    for asp in root.findall(".//StopPoints/AnnotatedStopPointRef"):
        atco = child_text(asp, "StopPointRef")
        if not atco:
            continue
        common_name = child_text(asp, "CommonName")
        locality = child_text(asp, "LocalityName")
        indicator = clean_indicator(child_text(asp, "Indicator"))
        lat_text = child_text(asp, "Location/Latitude")
        lng_text = child_text(asp, "Location/Longitude")
        lat: float | None = None
        lng: float | None = None
        if lat_text and lng_text:
            try:
                lat = round(float(lat_text), 5)
                lng = round(float(lng_text), 5)
            except ValueError:
                lat = lng = None
        if common_name:
            xml_stops[atco] = {
                "atcoCode": atco,
                "name": common_name,
                "locality": locality,
                "indicator": indicator,
                "lat": lat,
                "lng": lng,
            }

    # Operators
    operators: dict[str, str] = {}
    for op in root.findall(".//Operators/Operator"):
        op_id = op.attrib.get("id", "").strip()
        op_name = (
            child_text(op, "TradingName")
            or child_text(op, "OperatorShortName")
            or child_text(op, "OperatorNameOnLicence")
            or child_text(op, "NationalOperatorCode")
            or "Local Operator"
        )
        if op_id:
            operators[op_id] = op_name
    default_operator = next(iter(operators.values()), "Local Operator")

    # JourneyPatternSections -> list of timing links
    jps_map: dict[str, list[dict[str, Any]]] = {}
    for jps in root.findall(".//JourneyPatternSections/JourneyPatternSection"):
        jps_id = jps.attrib.get("id", "").strip()
        if not jps_id:
            continue
        links: list[dict[str, Any]] = []
        for link in jps.findall("JourneyPatternTimingLink"):
            link_id = link.attrib.get("id", "").strip()
            from_el = link.find("From")
            to_el = link.find("To")
            if from_el is None or to_el is None:
                continue
            from_stop = child_text(from_el, "StopPointRef")
            to_stop = child_text(to_el, "StopPointRef")
            if not from_stop or not to_stop:
                continue
            links.append(
                {
                    "id": link_id,
                    "from_stop": from_stop,
                    "to_stop": to_stop,
                    "run_sec": parse_iso_duration(child_text(link, "RunTime")),
                    "from_wait_sec": parse_iso_duration(child_text(from_el, "WaitTime")),
                    "to_wait_sec": parse_iso_duration(child_text(to_el, "WaitTime")),
                    "from_activity": child_text(from_el, "Activity").lower(),
                    "to_activity": child_text(to_el, "Activity").lower(),
                }
            )
        if links:
            jps_map[jps_id] = links

    # Services & JourneyPatterns
    services: dict[str, dict[str, Any]] = {}
    jp_to_service: dict[str, str] = {}
    journey_patterns: dict[str, dict[str, Any]] = {}

    for svc in root.findall(".//Services/Service"):
        # Check operating period end date (skip clearly expired schedules)
        end_date = child_text(svc, "OperatingPeriod/EndDate")
        if reference_date and end_date and len(end_date) >= 10:
            if end_date[:10] < reference_date:
                continue

        svc_code = child_text(svc, "ServiceCode") or "default"
        op_ref = child_text(svc, "RegisteredOperatorRef")
        operator_name = operators.get(op_ref, default_operator)

        lines: dict[str, str] = {}
        for line in svc.findall("Lines/Line"):
            line_id = line.attrib.get("id", "").strip()
            line_name = child_text(line, "LineName")
            if line_name:
                lines[line_id or line_name] = line_name

        default_line = next(iter(lines.values()), svc_code)
        description = child_text(svc, "Description")
        origin = child_text(svc, "StandardService/Origin")
        destination = child_text(svc, "StandardService/Destination")
        svc_profile = parse_operating_profile(svc.find("OperatingProfile"))

        services[svc_code] = {
            "serviceCode": svc_code,
            "operator": operator_name,
            "lines": lines,
            "defaultLine": default_line,
            "description": description,
            "origin": origin,
            "destination": destination,
            "profile": svc_profile,
        }

        for jp in svc.findall("StandardService/JourneyPattern"):
            jp_id = jp.attrib.get("id", "").strip()
            if not jp_id:
                continue
            raw_dir = child_text(jp, "Direction").lower()
            direction = (
                "inbound"
                if raw_dir in {"inbound", "anticlockwise", "inboundandoutbound"}
                else "outbound"
            )
            dest_display = child_text(jp, "DestinationDisplay")
            section_refs = [
                ref.text.strip()
                for ref in jp.findall("JourneyPatternSectionRefs")
                if ref.text and ref.text.strip()
            ]
            journey_patterns[jp_id] = {
                "id": jp_id,
                "serviceCode": svc_code,
                "direction": direction,
                "destinationDisplay": dest_display,
                "sectionRefs": section_refs,
            }
            jp_to_service[jp_id] = svc_code

    if not services:
        return None

    # VehicleJourneys (two-pass to resolve VehicleJourneyRef inheritance)
    raw_vjs: list[tuple[ET.Element, str]] = []
    vj_by_code: dict[str, ET.Element] = {}
    for vj in root.findall(".//VehicleJourneys/VehicleJourney"):
        vj_code = child_text(vj, "VehicleJourneyCode")
        if vj_code:
            vj_by_code[vj_code] = vj
        raw_vjs.append((vj, vj_code))

    def resolve_vj_field(vj: ET.Element, tag: str, depth: int = 0) -> str:
        val = child_text(vj, tag)
        if val or depth > 5:
            return val
        ref_code = child_text(vj, "VehicleJourneyRef")
        if ref_code and ref_code in vj_by_code:
            return resolve_vj_field(vj_by_code[ref_code], tag, depth + 1)
        return ""

    def resolve_vj_profile(
        vj: ET.Element,
        svc_profile: dict[str, Any],
        depth: int = 0,
    ) -> dict[str, Any]:
        ref_code = child_text(vj, "VehicleJourneyRef")
        base = svc_profile
        if ref_code and ref_code in vj_by_code and depth <= 5:
            base = resolve_vj_profile(vj_by_code[ref_code], svc_profile, depth + 1)
        return parse_operating_profile(vj.find("OperatingProfile"), base_profile=base)

    extracted_trips: list[dict[str, Any]] = []

    for vj, vj_code in raw_vjs:
        jp_ref = resolve_vj_field(vj, "JourneyPatternRef")
        if not jp_ref or jp_ref not in journey_patterns:
            continue
        jp = journey_patterns[jp_ref]

        svc_ref = resolve_vj_field(vj, "ServiceRef") or jp["serviceCode"]
        svc = services.get(svc_ref)
        if svc is None:
            continue

        line_ref = resolve_vj_field(vj, "LineRef")
        line_name = svc["lines"].get(line_ref, svc["defaultLine"])
        if not line_name:
            continue

        # Parse departure time (+ optional day shift)
        day_shift_text = child_text(vj, "DepartureDayShift")
        try:
            day_shift = int(day_shift_text) if day_shift_text else 0
        except ValueError:
            day_shift = 0
        dep_sec = parse_time_to_seconds(child_text(vj, "DepartureTime"), day_shift)
        if dep_sec is None:
            continue

        # Operating profile
        profile = resolve_vj_profile(vj, svc["profile"])
        if not profile["days"]:
            # If a TXC file omits RegularDayType on a special/bank-holiday trip, skip unless days present
            continue

        # Gather timing link overrides from VehicleJourneyTimingLink
        overrides: dict[str, dict[str, int | None]] = {}
        for vjtl in vj.findall("VehicleJourneyTimingLink"):
            tl_ref = child_text(vjtl, "JourneyPatternTimingLinkRef")
            if not tl_ref:
                continue
            run_text = child_text(vjtl, "RunTime")
            from_wait_text = child_text(vjtl, "From/WaitTime")
            to_wait_text = child_text(vjtl, "To/WaitTime")
            overrides[tl_ref] = {
                "run_sec": parse_iso_duration(run_text) if run_text else None,
                "from_wait_sec": parse_iso_duration(from_wait_text) if from_wait_text else None,
                "to_wait_sec": parse_iso_duration(to_wait_text) if to_wait_text else None,
            }

        # Build full chain of timing links across all JourneyPatternSectionRefs
        chain: list[dict[str, Any]] = []
        for sec_ref in jp["sectionRefs"]:
            chain.extend(jps_map.get(sec_ref, []))
        if not chain:
            continue

        # Determine departure times (single trip or Frequency-based expansion)
        departure_times = [dep_sec]
        freq_el = vj.find("Frequency")
        if freq_el is not None:
            end_time_sec = parse_time_to_seconds(child_text(freq_el, "EndTime"), day_shift)
            interval_sec = parse_iso_duration(
                child_text(freq_el, "Interval/ScheduledFrequency")
            )
            if end_time_sec is not None and interval_sec >= 60:
                if end_time_sec < dep_sec:
                    end_time_sec += 86400
                t = dep_sec + interval_sec
                count = 0
                while t <= end_time_sec and count < 200:
                    departure_times.append(t)
                    t += interval_sec
                    count += 1

        headsign = child_text(vj, "DestinationDisplay") or jp["destinationDisplay"]

        for trip_dep_sec in departure_times:
            current_sec = trip_dep_sec
            stop_times: list[list[str]] = []

            first_link = chain[0]
            first_ov = overrides.get(first_link["id"], {})
            first_from_wait = (
                first_ov["from_wait_sec"]
                if first_ov.get("from_wait_sec") is not None
                else first_link["from_wait_sec"]
            )
            if first_link["from_activity"] != "pass":
                stop_times.append([first_link["from_stop"], format_hhmm(current_sec)])
            if first_from_wait > 0:
                current_sec += first_from_wait

            prev_to_wait = 0
            for idx, link in enumerate(chain):
                ov = overrides.get(link["id"], {})
                run_sec = (
                    ov["run_sec"] if ov.get("run_sec") is not None else link["run_sec"]
                )
                from_wait = (
                    ov["from_wait_sec"]
                    if ov.get("from_wait_sec") is not None
                    else link["from_wait_sec"]
                )
                to_wait = (
                    ov["to_wait_sec"]
                    if ov.get("to_wait_sec") is not None
                    else link["to_wait_sec"]
                )

                # Avoid double-counting wait time if both previous link To and current link From specify it
                if idx > 0 and from_wait > 0 and prev_to_wait == 0:
                    current_sec += from_wait

                current_sec += run_sec
                if link["to_activity"] != "pass":
                    arr_str = format_hhmm(current_sec)
                    if not stop_times or stop_times[-1][0] != link["to_stop"]:
                        stop_times.append([link["to_stop"], arr_str])

                if to_wait > 0:
                    current_sec += to_wait
                prev_to_wait = to_wait

            if len(stop_times) < 2:
                continue

            # Keep trip only if it actually touches at least one D&G stop (680*)
            if not any(s[0].startswith(DG_ATCO_PREFIX) for s in stop_times):
                continue

            extracted_trips.append(
                {
                    "lineName": line_name,
                    "operator": svc["operator"],
                    "origin": svc["origin"],
                    "destination": svc["destination"],
                    "description": svc["description"],
                    "direction": jp["direction"],
                    "depSec": trip_dep_sec,
                    "dep": stop_times[0][1],
                    "arr": stop_times[-1][1],
                    "headsign": headsign,
                    "days": profile["days"],
                    "schoolOnly": profile["schoolOnly"],
                    "nonSchoolOnly": profile["nonSchoolOnly"],
                    "bankHolidays": profile["bankHolidays"],
                    "stops": stop_times,
                }
            )

    if not extracted_trips:
        return None

    return {
        "trips": extracted_trips,
        "xmlStops": xml_stops,
    }


def ingest_tnds_zip(
    zip_path: Path,
    reference_date: str | None = None,
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]], dict[str, int]]:
    """Scan every .xml file in S.zip and extract Dumfries & Galloway trips."""
    all_trips: list[dict[str, Any]] = []
    fallback_stops: dict[str, dict[str, Any]] = {}
    stats = {"files_scanned": 0, "dg_files_matched": 0}

    with zipfile.ZipFile(zip_path, "r") as zf:
        xml_names = [n for n in zf.namelist() if n.lower().endswith(".xml")]
        log(f"Scanning {len(xml_names)} XML files inside {zip_path.name}...")

        for name in xml_names:
            stats["files_scanned"] += 1
            try:
                xml_bytes = zf.read(name)
            except Exception as exc:
                log(f"Warning: could not read {name}: {exc}")
                continue

            parsed = parse_txc_xml(xml_bytes, reference_date=reference_date)
            if parsed is None:
                continue

            stats["dg_files_matched"] += 1
            all_trips.extend(parsed["trips"])
            for atco, info in parsed["xmlStops"].items():
                if atco not in fallback_stops:
                    fallback_stops[atco] = info

            if stats["files_scanned"] % 500 == 0:
                log(
                    f"  ...scanned {stats['files_scanned']}/{len(xml_names)} files "
                    f"({stats['dg_files_matched']} D&G matched, {len(all_trips)} trips)"
                )

    log(
        f"TNDS scan complete: {stats['files_scanned']} XML files scanned, "
        f"{stats['dg_files_matched']} D&G files matched, {len(all_trips)} raw trips"
    )
    return all_trips, fallback_stops, stats


def enrich_cross_border_stops_from_naptan(
    stops_map: dict[str, dict[str, Any]],
    referenced_stop_ids: set[str],
) -> int:
    """
    Fetch NaPTAN metadata (locality, indicator, lat/lng) for neighbouring ATCO areas
    only for the specific cross-border stops actually called at by D&G (680*) buses.
    """
    missing_ids = {s for s in referenced_stop_ids if s not in stops_map}
    if not missing_ids:
        return 0

    area_codes = sorted(
        {
            s[:3]
            for s in missing_ids
            if len(s) >= 3 and s[:3].isdigit() and s[:3] != DG_ATCO_PREFIX
        }
    )
    if not area_codes:
        return 0

    # Cap to a reasonable number of neighbouring areas
    codes_param = ",".join(area_codes[:15])
    url = NAPTAN_URL_TEMPLATE.format(codes=codes_param)
    log(
        f"Enriching {len(missing_ids)} cross-border stops from NaPTAN "
        f"(neighbouring ATCO areas: {codes_param})..."
    )
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Dgbuses-ETL/1.0 (+https://gordonwright10.github.io/Dgbuses/)"},
        )
        with urllib.request.urlopen(req, timeout=90) as resp:
            csv_bytes = resp.read()
        neighbour_stops = parse_naptan_stops(csv_bytes)
    except Exception as exc:
        log(f"Warning: cross-border NaPTAN enrichment skipped ({exc}); falling back to TXC annotations")
        return 0

    added = 0
    for s_id in missing_ids:
        if s_id in neighbour_stops:
            stops_map[s_id] = neighbour_stops[s_id]
            added += 1
    log(f"Enriched {added} cross-border stops with full NaPTAN coordinates and locality names")
    return added


def build_and_write_outputs(
    output_dir: Path,
    stops_map: dict[str, dict[str, Any]],
    all_trips: list[dict[str, Any]],
    fallback_stops: dict[str, dict[str, Any]],
    source_label: str = "live",
    allow_network_enrichment: bool = False,
) -> dict[str, Any]:
    """Compile stops, routes, per-route schedules, and metadata JSON files."""
    output_dir.mkdir(parents=True, exist_ok=True)
    schedules_dir = output_dir / "schedules"
    schedules_dir.mkdir(parents=True, exist_ok=True)

    # Clear stale schedule JSON files
    for old_file in schedules_dir.glob("*.json"):
        old_file.unlink()

    # Group trips by (lineName, operator)
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for trip in all_trips:
        key = (trip["lineName"].strip(), trip["operator"].strip())
        grouped[key].append(trip)

    # Track all stops referenced by trips to enrich cross-border stops
    referenced_stop_ids: set[str] = set()
    for trip in all_trips:
        for s_id, _ in trip["stops"]:
            referenced_stop_ids.add(s_id)

    if allow_network_enrichment:
        enrich_cross_border_stops_from_naptan(stops_map, referenced_stop_ids)

    cross_border_added = 0
    for s_id in referenced_stop_ids:
        if s_id not in stops_map and s_id in fallback_stops:
            fb = fallback_stops[s_id]
            stops_map[s_id] = {
                "atcoCode": fb["atcoCode"],
                "name": fb["name"],
                "locality": fb["locality"],
                "indicator": fb["indicator"],
                "lat": fb["lat"],
                "lng": fb["lng"],
            }
            cross_border_added += 1

    if cross_border_added:
        log(f"Added {cross_border_added} remaining stops from TXC stop annotations")

    routes_index: list[dict[str, Any]] = []
    total_trips_exported = 0
    used_route_ids: set[str] = set()

    sorted_groups = sorted(
        grouped.items(),
        key=lambda kv: (natural_route_sort_key(kv[0][0]), kv[0][1].lower()),
    )

    for (line_name, operator), trips in sorted_groups:
        base_id = slugify(f"{line_name}-{operator}")
        route_id = base_id
        suffix = 2
        while route_id in used_route_ids:
            route_id = f"{base_id}-{suffix}"
            suffix += 1
        used_route_ids.add(route_id)

        # Deduplicate identical trips within a route
        seen_sigs: set[tuple[Any, ...]] = set()
        outbound: list[dict[str, Any]] = []
        inbound: list[dict[str, Any]] = []
        route_stop_ids: list[str] = []
        route_stop_set: set[str] = set()
        route_days_set: set[str] = set()

        # Pick best origin, destination, description from the route's trips
        origin = next((t["origin"] for t in trips if t["origin"]), "")
        destination = next((t["destination"] for t in trips if t["destination"]), "")
        description = next((t["description"] for t in trips if t["description"]), "")

        for t in sorted(trips, key=lambda x: (x["depSec"], x["arr"])):
            sig = (
                t["direction"],
                t["dep"],
                t["arr"],
                t["stops"][0][0],
                t["stops"][-1][0],
                len(t["stops"]),
                tuple(t["days"]),
                t["schoolOnly"],
                t["nonSchoolOnly"],
                t["bankHolidays"],
            )
            if sig in seen_sigs:
                continue
            seen_sigs.add(sig)

            for s_id, _ in t["stops"]:
                if s_id not in route_stop_set:
                    route_stop_set.add(s_id)
                    route_stop_ids.append(s_id)
            route_days_set.update(t["days"])

            target_list = inbound if t["direction"] == "inbound" else outbound
            trip_obj = {
                "id": f"{'in' if t['direction'] == 'inbound' else 'out'}-{len(target_list) + 1}",
                "dep": t["dep"],
                "arr": t["arr"],
                "headsign": t["headsign"] or (origin if t["direction"] == "inbound" else destination),
                "days": t["days"],
                "schoolOnly": t["schoolOnly"],
                "nonSchoolOnly": t["nonSchoolOnly"],
                "bankHolidays": t["bankHolidays"],
                "stops": t["stops"],
            }
            target_list.append(trip_obj)

        # Derive clean origin/destination if missing from TXC metadata
        if not origin and outbound:
            first_stop = stops_map.get(outbound[0]["stops"][0][0])
            origin = (first_stop["locality"] or first_stop["name"]) if first_stop else ""
        if not destination and outbound:
            last_stop = stops_map.get(outbound[0]["stops"][-1][0])
            destination = (last_stop["locality"] or last_stop["name"]) if last_stop else ""
        if not description and origin and destination:
            description = f"{origin} – {destination}"

        trip_count = len(outbound) + len(inbound)
        if trip_count == 0:
            continue
        total_trips_exported += trip_count

        outbound_label = f"Towards {destination}" if destination else "Outbound"
        inbound_label = f"Towards {origin}" if origin else "Inbound"

        schedule_payload = {
            "routeId": route_id,
            "lineName": line_name,
            "operator": operator,
            "origin": origin,
            "destination": destination,
            "description": description,
            "outboundLabel": outbound_label,
            "inboundLabel": inbound_label,
            "outbound": outbound,
            "inbound": inbound,
        }
        (schedules_dir / f"{route_id}.json").write_text(
            json.dumps(schedule_payload, separators=(",", ":"), ensure_ascii=False),
            encoding="utf-8",
        )

        routes_index.append(
            {
                "id": route_id,
                "lineName": line_name,
                "operator": operator,
                "origin": origin,
                "destination": destination,
                "description": description,
                "stopIds": route_stop_ids,
                "tripCount": trip_count,
                "days": [d for d in DAY_ORDER if d in route_days_set],
            }
        )

    # Sort stops cleanly by locality then name
    sorted_stops = sorted(
        stops_map.values(),
        key=lambda s: ((s.get("locality") or "").lower(), (s.get("name") or "").lower(), s["atcoCode"]),
    )

    (output_dir / "stops.json").write_text(
        json.dumps(sorted_stops, separators=(",", ":"), ensure_ascii=False),
        encoding="utf-8",
    )
    (output_dir / "routes.json").write_text(
        json.dumps(routes_index, separators=(",", ":"), ensure_ascii=False),
        encoding="utf-8",
    )

    metadata = {
        "lastUpdated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "stopCount": len(sorted_stops),
        "routeCount": len(routes_index),
        "tripCount": total_trips_exported,
        "source": source_label,
    }
    (output_dir / "metadata.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    log(
        f"Exported {metadata['stopCount']} stops, {metadata['routeCount']} routes, "
        f"{metadata['tripCount']} trips -> {output_dir}"
    )
    return metadata


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="D&G Bus Finder ETL Pipeline")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "public" / "data",
        help="Output directory for static JSON files (default: public/data)",
    )
    parser.add_argument(
        "--local-naptan",
        type=Path,
        default=None,
        help="Path to local NaPTAN CSV file (skips HTTP download)",
    )
    parser.add_argument(
        "--local-tnds",
        type=Path,
        default=None,
        help="Path to local TNDS S.zip file (skips FTP download)",
    )
    parser.add_argument(
        "--reference-date",
        type=str,
        default=None,
        help="ISO date YYYY-MM-DD for filtering expired services (default: today UTC)",
    )
    parser.add_argument(
        "--include-expired",
        action="store_true",
        help="Do not filter out services whose OperatingPeriod EndDate has passed",
    )
    args = parser.parse_args(argv)

    ref_date = (
        None
        if args.include_expired
        else (args.reference_date or dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d"))
    )

    # Step A: NaPTAN Stops
    csv_bytes = fetch_naptan_csv_bytes(local_naptan=args.local_naptan)
    stops_map = parse_naptan_stops(csv_bytes)

    # Step B: TNDS S.zip
    if args.local_tnds is not None:
        all_trips, fallback_stops, _ = ingest_tnds_zip(
            args.local_tnds, reference_date=ref_date
        )
    else:
        ftp_user = os.environ.get("TNDS_FTP_USER", "").strip()
        ftp_pass = os.environ.get("TNDS_FTP_PASS", "").strip()
        if not ftp_user or not ftp_pass:
            log(
                "ERROR: TNDS_FTP_USER and TNDS_FTP_PASS environment variables must be set "
                "(or pass --local-tnds for local testing)."
            )
            return 1

        with tempfile.TemporaryDirectory(prefix="dgbuses_tnds_") as tmp_dir:
            zip_path = Path(tmp_dir) / TNDS_ZIP_NAME
            download_tnds_zip(zip_path, ftp_user, ftp_pass)
            all_trips, fallback_stops, _ = ingest_tnds_zip(
                zip_path, reference_date=ref_date
            )

    if not all_trips:
        log("ERROR: Zero Dumfries & Galloway trips extracted from TNDS. Aborting write.")
        return 1

    build_and_write_outputs(
        output_dir=args.output_dir,
        stops_map=stops_map,
        all_trips=all_trips,
        fallback_stops=fallback_stops,
        source_label="live",
        allow_network_enrichment=(args.local_naptan is None),
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
