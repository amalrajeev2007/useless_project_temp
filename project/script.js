/* =========================================
   DOM ELEMENTS & CONFIGURATION
========================================= */
const text = "BUT FOR THE CURIOUS MIND OF A KID, EMOTIONS ARE USELESS.";
let index = 0;

// Splash & Main Page
const typingElement = document.getElementById("typing-text");
const enterButton = document.getElementById("enter-btn");
const startInvestigationButton = document.getElementById("start-investigation");
const splash = document.getElementById("splash");
const mainPage = document.getElementById("main-page");

// Upload Page
const uploadPage = document.getElementById("upload-page");
const backButton = document.getElementById("back-btn");
const dropZone = document.getElementById("drop-zone");
const imageInput = document.getElementById("image-input");
const imagePreview = document.getElementById("image-preview");
const previewContainer = document.getElementById("preview-container");

// Story Scenes
const continueButton = document.getElementById("continue-btn");
const storyAnimation = document.getElementById("story-animation");
const sceneKerala = document.getElementById("scene-kerala");
const sceneReading = document.getElementById("scene-reading");
const sceneFlipping = document.getElementById("scene-flipping");
const sceneFinal = document.getElementById("scene-final");
const sceneResult = document.getElementById("scene-result");
const storyFinalImage = document.getElementById("story-final-image");

/* =========================================
   TYPEWRITER EFFECT
========================================= */
function typeText() {
    if (index < text.length) {
        typingElement.textContent += text.charAt(index);
        index++;
        setTimeout(typeText, 45);
    }
}
setTimeout(typeText, 1200);

/* =========================================
   PAGE NAVIGATION
========================================= */
enterButton.addEventListener("click", () => {
    splash.classList.add("hide");
    setTimeout(() => {
        mainPage.classList.add("show");
    }, 500);
});

startInvestigationButton.addEventListener("click", () => {
    uploadPage.classList.add("active");
});

backButton.addEventListener("click", () => {
    uploadPage.classList.remove("active");
});

/* =========================================
   IMAGE UPLOAD & FILE HANDLING
========================================= */
imageInput.addEventListener("change", function () {
    const file = this.files[0];
    if (file) showImage(file);
});

function showImage(file) {
    if (!file.type.startsWith("image/")) {
        alert("Please upload a valid image file.");
        return;
    }

    const reader = new FileReader();
    reader.onload = function (event) {
        imagePreview.src = event.target.result;
        previewContainer.classList.add("show");
        dropZone.style.display = "none";
    };
    reader.readAsDataURL(file);
}

dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
});

dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragging");
});

dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");

    const file = event.dataTransfer.files[0];
    if (file) showImage(file);
});

/* =========================================
   IMAGE PREPROCESSING FOR OCR ACCURACY
   Upscales the image and converts it to a high-contrast
   grayscale version, which dramatically improves Tesseract's
   ability to read small/dense text like newspaper captions.
========================================= */
function preprocessImageForOCR(imageSrc) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const scale = 2.5; // upscale factor — bigger text = fewer OCR errors
            const canvas = document.createElement("canvas");
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            const ctx = canvas.getContext("2d");

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            // Grayscale + contrast boost
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            const contrast = 40; // -100 to 100
            const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

            for (let i = 0; i < data.length; i += 4) {
                const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                let adjusted = factor * (gray - 128) + 128;
                adjusted = Math.max(0, Math.min(255, adjusted));
                data[i] = data[i + 1] = data[i + 2] = adjusted;
            }

            ctx.putImageData(imageData, 0, 0);
            resolve(canvas);
        };
        img.onerror = reject;
        img.src = imageSrc;
    });
}

/* =========================================
   AGE EXTRACTION ENGINE (OCR + MULTI-PATTERN MATCH)
   Finds the HIGHEST age among MULTIPLE people
   detected in the same photo. No hardcoded fallback.
========================================= */
async function processImageAge(imageSrc) {
    const winnerAgeElement = document.getElementById("winner-age");
    const winnerContextElement = document.getElementById("winner-context");

    winnerAgeElement.textContent = "...";
    winnerContextElement.textContent = "Scanning death notices for maximum score...";

    try {
        if (typeof Tesseract === 'undefined') {
            throw new Error("Tesseract.js is not loaded.");
        }

        // ---- PREPROCESSING: upscale + grayscale + contrast boost ----
        // Tesseract.js reads dense newspaper-style text much more reliably
        // on a larger, higher-contrast, grayscale version of the image.
        const preprocessedCanvas = await preprocessImageForOCR(imageSrc);

        const worker = await Tesseract.createWorker('eng');
        const ret = await worker.recognize(preprocessedCanvas);
        await worker.terminate();

        const fullText = ret.data.text;
        console.log("OCR Extracted Text:\n", fullText);

        // Fix common OCR digit confusions, but ONLY inside tokens that are
        // already mostly numeric, so we don't corrupt normal words.
        // e.g. "8O" -> "80", "B7" -> "87", "S8" -> "58"
        const cleanedText = fullText.replace(/\b[\dOolISBbGgZz]{2,3}\b/g, (token) => {
            const digitCount = (token.match(/\d/g) || []).length;
            if (digitCount < 1) return token; // pure letters, leave alone
            return token
                .replace(/O/g, "0")
                .replace(/[lI]/g, "1")
                .replace(/[Ss]/g, "5")
                .replace(/[Bb]/g, "8")
                .replace(/[Gg]/g, "6")
                .replace(/[Zz]/g, "2");
        });

        // Several regexes to catch the different ways an age shows up
        // in obituary / death-notice style text.
        const patterns = [
            /\bAge[d]?\s*[:\-]?\s*(\d{2,3})\b/gi,            // "Age 78", "Aged: 78"
            /\(\s*(\d{2,3})\s*\)/g,                          // "(78)"
            /\b(\d{2,3})\s*[- ]?\s*years?\s*old\b/gi,        // "78 years old", "78-year old"
            /\b(\d{2,3})\s*yrs?\b/gi,                        // "78 yrs", "78 yr"
            /,\s*(\d{2,3})\s*[,.)]/g,                        // "Raman Nair, 78,"  or "...78."
            /,\s*(\d{2,3})\s*$/gm,                           // "...Nair, 78" at end of line
            /\bS\/o\b.*?,\s*(\d{2,3})\b/gi,                  // "S/o ..., 87"
            /\bD\/o\b.*?,\s*(\d{2,3})\b/gi,                  // "D/o ..., 87"
            /\bW\/o\b.*?,\s*(\d{2,3})\b/gi                   // "W/o ..., 87"
        ];

        // Track unique (age, position) matches so we don't double count
        // the same number matched by two different patterns.
        const seenPositions = new Set();
        let detectedEntries = [];

        for (const regex of patterns) {
            let match;
            while ((match = regex.exec(cleanedText)) !== null) {
                const ageVal = parseInt(match[1], 10);
                const posKey = match.index + ":" + match[1]; // dedupe by location+value

                if (ageVal >= 1 && ageVal <= 115 && !seenPositions.has(posKey)) {
                    seenPositions.add(posKey);
                    detectedEntries.push({
                        age: ageVal,
                        snippet: match[0].trim()
                    });
                }
            }
        }

        // DEBUG: log every age found, not just the winner, so you can verify
        // whether the true highest age was actually detected.
        console.log("All detected ages:", detectedEntries);

        if (detectedEntries.length > 0) {
            const champion = detectedEntries.reduce(
                (max, item) => (item.age > max.age ? item : max),
                detectedEntries[0]
            );

            winnerAgeElement.textContent = champion.age;
            winnerContextElement.textContent =
                detectedEntries.length > 1
                    ? `Highest age found: "${champion.snippet}" (out of ${detectedEntries.length} entries detected).`
                    : `Record detected: "${champion.snippet}".`;
            return;
        }

        // Genuine "nothing found" state — no fake hardcoded person/age.
        winnerAgeElement.textContent = "—";
        winnerContextElement.textContent =
            "No age could be read from this image. Try a clearer or higher-resolution photo.";

    } catch (e) {
        console.error("OCR Error:", e);
        winnerAgeElement.textContent = "—";
        winnerContextElement.textContent =
            "Something went wrong scanning this image. Please try again.";
    }
}

/* =========================================
   STORY SCENE SEQUENCE
========================================= */
continueButton.addEventListener("click", () => {
    if (!imagePreview.src) return;

    storyFinalImage.src = imagePreview.src;
    processImageAge(imagePreview.src);

    uploadPage.classList.remove("active");
    storyAnimation.classList.add("active");

    // Scene 1: Kerala Morning (4s)
    sceneKerala.classList.add("active");

    // Scene 2: Reading Paper (4s) — shows the man reading first,
    // then crossfades to the children discovering the newspaper.
    setTimeout(() => {
        sceneKerala.classList.remove("active");
        sceneReading.classList.add("active");
    }, 4000);

    setTimeout(() => {
        const imgOne = document.getElementById("reading-img-one");
        const imgTwo = document.getElementById("reading-img-two");
        if (imgOne && imgTwo) {
            imgOne.classList.remove("active-img");
            imgTwo.classList.add("active-img");
        }
    }, 5600);

    // Scene 3: Page Flip (3s)
    setTimeout(() => {
        sceneReading.classList.remove("active");
        sceneFlipping.classList.add("active");
    }, 7000);

    // Scene 4: Real Uploaded Paper Reveal (3s)
    setTimeout(() => {
        sceneFlipping.classList.remove("active");
        sceneFinal.classList.add("active");
    }, 10000);

    // Scene 5: Reveal Champion High Score
    setTimeout(() => {
        sceneFinal.classList.remove("active");
        sceneResult.classList.add("active");
    }, 13000);
});

/* =========================================
   RESTART BUTTON
========================================= */
const restartBtn = document.getElementById("restart-btn");
if (restartBtn) {
    restartBtn.addEventListener("click", () => {
        storyAnimation.classList.remove("active");
        sceneResult.classList.remove("active");

        dropZone.style.display = "flex";
        previewContainer.classList.remove("show");
        imagePreview.src = "";

        // Reset the reading-scene image sequence for the next run
        const imgOne = document.getElementById("reading-img-one");
        const imgTwo = document.getElementById("reading-img-two");
        if (imgOne && imgTwo) {
            imgTwo.classList.remove("active-img");
            imgOne.classList.add("active-img");
        }

        uploadPage.classList.add("active");
    });
}