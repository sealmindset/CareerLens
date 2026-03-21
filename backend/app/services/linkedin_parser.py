"""LinkedIn data export parser.

Parses the ZIP file from LinkedIn's "Download your data" feature
(Settings → Data Privacy → Get a copy of your data).

The ZIP contains CSV files with profile data:
- Profile.csv: headline, summary, industry
- Positions.csv: work experience entries
- Education.csv: education entries
- Skills.csv: skill names
"""

import csv
import io
import logging
import zipfile
from datetime import date

logger = logging.getLogger(__name__)


def _parse_linkedin_date(date_str: str | None) -> date | None:
    """Parse LinkedIn date formats: 'Jan 2020', '2020', 'Jan 2020' etc."""
    if not date_str or not date_str.strip():
        return None

    date_str = date_str.strip()

    # LinkedIn uses various formats across export versions
    MONTHS = {
        "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
        "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
    }

    # Try "Mon YYYY" format (e.g., "Jan 2020")
    parts = date_str.split()
    if len(parts) == 2:
        month_str, year_str = parts[0].lower()[:3], parts[1]
        if month_str in MONTHS and year_str.isdigit():
            return date(int(year_str), MONTHS[month_str], 1)

    # Try "YYYY" format
    if date_str.isdigit() and len(date_str) == 4:
        return date(int(date_str), 1, 1)

    # Try ISO format "YYYY-MM-DD"
    try:
        return date.fromisoformat(date_str[:10])
    except (ValueError, TypeError):
        pass

    # Try "MM/YYYY" format
    if "/" in date_str:
        parts = date_str.split("/")
        if len(parts) == 2 and all(p.isdigit() for p in parts):
            month, year = int(parts[0]), int(parts[1])
            if 1 <= month <= 12 and 1900 <= year <= 2100:
                return date(year, month, 1)

    logger.debug("Could not parse LinkedIn date: %s", date_str)
    return None


def _read_csv_from_zip(zf: zipfile.ZipFile, filename: str) -> list[dict]:
    """Read a CSV file from the ZIP, trying common path variations."""
    # LinkedIn exports sometimes nest files in a subdirectory
    candidates = [filename, f"linkedin-data/{filename}", filename.lower()]
    # Also check all files in the ZIP for a matching basename
    for name in zf.namelist():
        if name.lower().endswith(filename.lower()) or name.lower().endswith(f"/{filename.lower()}"):
            candidates.insert(0, name)

    for candidate in candidates:
        try:
            with zf.open(candidate) as f:
                text = f.read().decode("utf-8", errors="replace")
                # Handle BOM
                if text.startswith("\ufeff"):
                    text = text[1:]
                reader = csv.DictReader(io.StringIO(text))
                return list(reader)
        except KeyError:
            continue

    return []


def _normalize_header(headers: dict) -> dict:
    """Normalize CSV header keys to handle LinkedIn's varying column names."""
    normalized = {}
    for key, value in headers.items():
        if key:
            normalized[key.strip().lower().replace(" ", "_")] = value
    return normalized


def parse_linkedin_export(zip_bytes: bytes) -> dict:
    """Parse a LinkedIn data export ZIP file.

    Returns a dict matching the resume parser output format:
    {
        "headline": str | None,
        "summary": str | None,
        "linkedin_url": str | None,
        "skills": [{"skill_name": str, "proficiency_level": "intermediate", ...}],
        "experiences": [{"company": str, "title": str, ...}],
        "educations": [{"institution": str, "degree": str, ...}],
        "raw_text": str,
        "error": str | None,
    }
    """
    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile:
        return {"error": "The uploaded file is not a valid ZIP archive. Please upload the ZIP file from LinkedIn's 'Download your data' feature."}

    # Log what's in the ZIP for debugging
    file_list = zf.namelist()
    logger.info("LinkedIn ZIP contains: %s", file_list)

    result = {
        "headline": None,
        "summary": None,
        "linkedin_url": None,
        "skills": [],
        "experiences": [],
        "educations": [],
        "raw_text": "",
        "error": None,
    }

    raw_parts = []
    found_any = False

    # --- Profile ---
    profile_rows = _read_csv_from_zip(zf, "Profile.csv")
    if profile_rows:
        found_any = True
        row = _normalize_header(profile_rows[0])
        # LinkedIn Profile.csv columns vary by version:
        # "First Name", "Last Name", "Headline", "Summary", "Industry"
        first = row.get("first_name", "")
        last = row.get("last_name", "")
        headline = row.get("headline", "")
        summary = row.get("summary", "")

        if headline:
            result["headline"] = headline.strip()
        if summary:
            result["summary"] = summary.strip()

        raw_parts.append(f"Profile: {first} {last}")
        if headline:
            raw_parts.append(f"Headline: {headline}")
        if summary:
            raw_parts.append(f"Summary: {summary}")

    # --- Positions (Work Experience) ---
    positions = _read_csv_from_zip(zf, "Positions.csv")
    if positions:
        found_any = True
        for row_raw in positions:
            row = _normalize_header(row_raw)
            company = (row.get("company_name") or row.get("company") or "").strip()
            title = (row.get("title") or "").strip()
            if not company or not title:
                continue

            description = (row.get("description") or "").strip()
            start_date = _parse_linkedin_date(row.get("started_on") or row.get("start_date"))
            end_date = _parse_linkedin_date(row.get("finished_on") or row.get("end_date"))

            # If no end date, likely current position
            is_current = end_date is None and start_date is not None

            result["experiences"].append({
                "company": company,
                "title": title,
                "description": description or None,
                "start_date": start_date.isoformat() if start_date else None,
                "end_date": end_date.isoformat() if end_date else None,
                "is_current": is_current,
            })

            raw_parts.append(f"Position: {title} at {company}")

    # --- Education ---
    educations = _read_csv_from_zip(zf, "Education.csv")
    if educations:
        found_any = True
        for row_raw in educations:
            row = _normalize_header(row_raw)
            institution = (row.get("school_name") or row.get("school") or row.get("institution") or "").strip()
            if not institution:
                continue

            degree = (row.get("degree_name") or row.get("degree") or "").strip()
            field = (row.get("notes") or row.get("field_of_study") or row.get("activities") or "").strip()
            end_date = _parse_linkedin_date(row.get("end_date") or row.get("finished_on"))
            start_date = _parse_linkedin_date(row.get("start_date") or row.get("started_on"))

            result["educations"].append({
                "institution": institution,
                "degree": degree or None,
                "field_of_study": field or None,
                "graduation_date": (end_date or start_date).isoformat() if (end_date or start_date) else None,
            })

            raw_parts.append(f"Education: {degree or 'Degree'} at {institution}")

    # --- Skills ---
    skills = _read_csv_from_zip(zf, "Skills.csv")
    if skills:
        found_any = True
        for row_raw in skills:
            row = _normalize_header(row_raw)
            # LinkedIn Skills.csv has a single column, often named "Name" or "Skill"
            name = (row.get("name") or row.get("skill") or "").strip()
            if not name:
                # Try first column value regardless of header
                values = [v.strip() for v in row_raw.values() if v and v.strip()]
                name = values[0] if values else ""
            if not name:
                continue

            result["skills"].append({
                "skill_name": name,
                "proficiency_level": "intermediate",
                "years_experience": None,
            })

            raw_parts.append(f"Skill: {name}")

    if not found_any:
        return {
            "error": (
                "Could not find LinkedIn data files in the ZIP. "
                "Expected files like Profile.csv, Positions.csv, Education.csv, or Skills.csv. "
                f"Found: {', '.join(file_list[:20])}"
            )
        }

    result["raw_text"] = "\n".join(raw_parts)

    logger.info(
        "LinkedIn import parsed: %d skills, %d experiences, %d educations",
        len(result["skills"]),
        len(result["experiences"]),
        len(result["educations"]),
    )

    return result
