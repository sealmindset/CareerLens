import io
import json
import logging
import re

from PyPDF2 import PdfReader
from docx import Document

from app.ai.provider import get_ai_provider, get_model_for_tier

logger = logging.getLogger(__name__)

RESUME_PARSE_SYSTEM_PROMPT = (
    "You are a resume parser. Given raw text extracted from a resume document, "
    "extract the structured profile information. Return ONLY valid JSON with these fields:\n\n"
    '{\n'
    '  "headline": "Professional headline or title (e.g. Senior Software Engineer)",\n'
    '  "summary": "Professional summary paragraph",\n'
    '  "skills": [\n'
    '    {"skill_name": "Python", "proficiency_level": "expert", "years_experience": 8},\n'
    '    {"skill_name": "React", "proficiency_level": "advanced", "years_experience": 4}\n'
    '  ],\n'
    '  "experiences": [\n'
    '    {\n'
    '      "company": "Acme Corp",\n'
    '      "title": "Software Engineer",\n'
    '      "description": "Led development of microservices platform...",\n'
    '      "start_date": "2020-01-15",\n'
    '      "end_date": "2023-06-30",\n'
    '      "is_current": false\n'
    '    }\n'
    '  ],\n'
    '  "educations": [\n'
    '    {\n'
    '      "institution": "MIT",\n'
    '      "degree": "Bachelor of Science",\n'
    '      "field_of_study": "Computer Science",\n'
    '      "graduation_date": "2019-05-15"\n'
    '    }\n'
    '  ]\n'
    '}\n\n'
    "Rules:\n"
    "- Extract the ACTUAL content from the resume, do not fabricate anything\n"
    "- For proficiency_level use: beginner, intermediate, advanced, or expert\n"
    "- Infer proficiency from context (years mentioned, seniority of roles, etc.)\n"
    "- For dates, use ISO format YYYY-MM-DD. If only year is given, use YYYY-01-01. "
    "If only month and year, use YYYY-MM-01\n"
    "- For current positions, set is_current=true and end_date=null\n"
    "- If you cannot determine a field, set it to null\n"
    "- Return ONLY the JSON object, no markdown fencing, no explanation"
)


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text from a PDF file."""
    reader = PdfReader(io.BytesIO(file_bytes))
    pages = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages.append(text)
    return "\n\n".join(pages)


def extract_text_from_docx(file_bytes: bytes) -> str:
    """Extract text from a Word .docx file."""
    doc = Document(io.BytesIO(file_bytes))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n".join(paragraphs)


def extract_text(file_bytes: bytes, filename: str) -> str:
    """Extract text from a resume file based on extension."""
    lower = filename.lower()
    if lower.endswith(".pdf"):
        return extract_text_from_pdf(file_bytes)
    elif lower.endswith(".docx"):
        return extract_text_from_docx(file_bytes)
    elif lower.endswith(".doc"):
        raise ValueError(
            "Legacy .doc format is not supported. Please save as .docx or .pdf."
        )
    elif lower.endswith(".txt"):
        return file_bytes.decode("utf-8", errors="replace")
    else:
        raise ValueError(
            f"Unsupported file type: {filename}. Please upload a PDF, Word (.docx), or text file."
        )


def _clean_json_response(raw: str) -> str:
    """Strip markdown fencing if the AI wrapped the JSON."""
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


async def parse_resume_with_ai(raw_text: str) -> dict:
    """Use AI to extract structured profile data from resume text."""
    try:
        provider = get_ai_provider()
        model = get_model_for_tier("standard")
        raw = await provider.complete(
            system_prompt=RESUME_PARSE_SYSTEM_PROMPT,
            user_prompt=f"Parse this resume and extract structured profile data:\n\n{raw_text[:50000]}",
            model=model,
            temperature=0.1,
            max_tokens=4096,
        )
        cleaned = _clean_json_response(raw)
        return json.loads(cleaned)
    except json.JSONDecodeError:
        logger.error("AI returned invalid JSON for resume parsing")
        return {}
    except Exception as e:
        logger.error("AI resume parsing failed: %s", str(e))
        return {}


async def parse_resume(file_bytes: bytes, filename: str) -> dict:
    """Full pipeline: extract text -> AI parse -> return structured data + raw text."""
    raw_text = extract_text(file_bytes, filename)

    if not raw_text or len(raw_text.strip()) < 20:
        return {"error": "Could not extract text from the file. The file may be empty or image-based."}

    parsed = await parse_resume_with_ai(raw_text)
    if not parsed:
        return {
            "error": "Could not parse resume content. The raw text has been saved.",
            "raw_text": raw_text,
        }

    parsed["raw_text"] = raw_text
    return parsed
