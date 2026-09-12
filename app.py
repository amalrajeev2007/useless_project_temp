from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import cv2
import numpy as np
import pytesseract
import re
import os

# ---------------------------------------------------------
# TESSERACT SYSTEM PATH (For Windows)
# ---------------------------------------------------------
tesseract_path = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
if os.path.exists(tesseract_path):
    pytesseract.pytesseract.tesseract_cmd = tesseract_path

app = FastAPI()

# ---------------------------------------------------------
# CORS CONFIGURATION
# ---------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------
# IMAGE PREPROCESSING ENGINE
# ---------------------------------------------------------
def preprocess_image(image_bytes: bytes):
    """
    Converts uploaded image bytes into a clean, high-contrast
    grayscale image optimized for Tesseract OCR.
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        return None

    # 1. Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 2. Upscale image if width is less than 1800px
    height, width = gray.shape[:2]
    if width < 1800:
        scale = 1800 / width
        gray = cv2.resize(
            gray,
            (int(width * scale), int(height * scale)),
            interpolation=cv2.INTER_CUBIC
        )

    # 3. Enhance contrast using CLAHE
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    # 4. Light Gaussian Blur to smooth print dots
    enhanced = cv2.GaussianBlur(enhanced, (3, 3), 0)

    return enhanced


# ---------------------------------------------------------
# AGE EXTRACTION ENGINE (PURE ENGLISH REGEX)
# ---------------------------------------------------------
def extract_ages(text: str):
    """
    Extracts age numbers associated with keywords like:
    (Age 87), Age 78, Age: 84, Age-92, aged 71, (Age: 81)
    """
    patterns = [
        # Matches "(Age 87)", "Age 87", "Age: 87", "Age-87"
        r'\(?\s*\bAge\b\s*[:\-]?\s*(\d{2,3})\s*\)?',

        # Matches "(aged 87)", "aged 87", "aged: 87"
        r'\(?\s*\baged\b\s*[:\-]?\s*(\d{2,3})\s*\)?'
    ]

    detected = []

    for pattern in patterns:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        for match in matches:
            try:
                age = int(match.group(1))

                # Human lifespan filter
                if 1 <= age <= 118:
                    detected.append({
                        "age": age,
                        "snippet": match.group(0).strip()
                    })
            except ValueError:
                continue

    return detected


# ---------------------------------------------------------
# MAIN API ENDPOINT
# ---------------------------------------------------------
@app.post("/api/scan-obituary")
async def scan_obituaries(files: List[UploadFile] = File(...)):

    if not files:
        raise HTTPException(
            status_code=400,
            detail="No files uploaded."
        )

    all_detected_records = []

    # Process every uploaded image file
    for index, file in enumerate(files):
        contents = await file.read()
        processed_img = preprocess_image(contents)

        if processed_img is None:
            continue

        # Run Tesseract with Sparse Text Page Segmentation (--psm 11)
        custom_config = r'--oem 3 --psm 11'
        extracted_text = pytesseract.image_to_string(
            processed_img,
            config=custom_config
        )

        print(f"\n===================================")
        print(f"PAGE {index + 1}: {file.filename}")
        print("RAW OCR TEXT EXTRACTED:")
        print(extracted_text)
        print("===================================\n")

        # Find ages in extracted text
        detected_ages = extract_ages(extracted_text)

        for record in detected_ages:
            all_detected_records.append({
                "age": record["age"],
                "file_name": file.filename,
                "page_number": index + 1,
                "snippet": record["snippet"]
            })

    # If no valid age patterns were found across all uploaded pages
    if not all_detected_records:
        return {
            "success": False,
            "winner_age": None,
            "snippet": None,
            "page_number": None,
            "file_name": None,
            "total_pages_scanned": len(files),
            "total_ages_found": 0,
            "note": "No valid age keywords detected on the page."
        }

    # Deduplicate extracted entries
    unique_records = []
    seen = set()

    for record in all_detected_records:
        key = (record["age"], record["page_number"], record["snippet"])
        if key not in seen:
            seen.add(key)
            unique_records.append(record)

    all_detected_records = unique_records

    # Calculate champion maximum age
    champion = max(all_detected_records, key=lambda x: x["age"])

    return {
        "success": True,
        "winner_age": champion["age"],
        "snippet": champion["snippet"],
        "page_number": champion["page_number"],
        "file_name": champion["file_name"],
        "total_pages_scanned": len(files),
        "total_ages_found": len(all_detected_records),
        "all_detected_ages": all_detected_records
    }


# ---------------------------------------------------------
# RUN SERVER
# ---------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app:app",
        host="127.0.0.1",
        port=8000,
        reload=True
    )