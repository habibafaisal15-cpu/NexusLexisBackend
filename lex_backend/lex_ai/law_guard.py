"""Fast law-topic guardrail — keywords first, Qwen only when ambiguous."""

LAW_KEYWORDS = (
    "law", "legal", "court", "judge", "lawyer", "advocate", "sue", "litigation",
    "contract", "agreement", "deed", "lease", "property", "inheritance", "will",
    "company", "secp", "fbr", "tax", "gst", "ntn", "corporate", "registration",
    "compliance", "regulation", "license", "permit", "trademark", "patent",
    "fir", "police", "bail", "criminal", "civil", "family", "divorce", "custody",
    "tenancy", "rent", "eviction", "labour", "employment", "termination",
    "bankruptcy", "insolvency", "arbitration", "mediation", "affidavit", "notary",
    "power of attorney", "partnership", "llp", "private limited", "sole proprietorship",
    "قانون", "عدالت", "وکیل", "کیس", "تھانہ", "ایف", "آئی", "آر", "ٹیکس",
    "کمپنی", "رجسٹریشن", "معاہدہ", "جائیداد", "وراثت", "طلاق", "کرایہ",
    "زمین", "کاغذات", "بیچ", "بیچنا", "فروخت", "خرید", "حق", "دعوی", "مالک",
    "پراپرٹی", "دستاویز", "فرد", "رجسٹر", "تنازع", "فراڈ", "دھوکہ",
)

OFF_TOPIC_KEYWORDS = (
    "weather", "football", "cricket score", "recipe", "movie", "song lyrics",
    "bitcoin price", "stock tip", "medical diagnosis", "write me code",
    "موسم", "کھانا", "فلم",
)


def keyword_law_check(message: str) -> bool | None:
    """
    Returns True (law-related), False (clearly off-topic), or None (ambiguous → ask LLM).
    """
    text = message.lower().strip()
    if not text:
        return False

    if any(kw in text for kw in OFF_TOPIC_KEYWORDS):
        return False

    # Urdu/Roman-Urdu legal queries on this platform — allow unless clearly off-topic
    if any("\u0600" <= c <= "\u06FF" for c in message):
        if any(kw in text for kw in LAW_KEYWORDS):
            return True
        # Question-shaped Urdu text is treated as legal intent
        if "؟" in message or "?" in message or any(w in text for w in ("کیا", "کیسے", "کیوں", "کون")):
            return True

    if any(kw in text for kw in LAW_KEYWORDS):
        return True
    return None
