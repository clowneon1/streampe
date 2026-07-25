package com.clowneon1.paymentalertsobs

/**
 * Extracts (sender, amount, sourceApp) from UPI payment notification text.
 *
 * Supported apps / patterns (in priority order):
 *
 *  Amazon Pay
 *   A1. Title "1.00 received"  + body "Money received from <NAME> on amazon pay"
 *   A2. Body  "₹500 received from <NAME>"  (generic fallback for Amazon)
 *
 *  PhonePe  — "has sent" is the only format currently in production.
 *   P1. "<NAME> has sent Rs.<AMT> to your bank account"   (primary)
 *   Generic patterns serve as fallback for future format changes.
 *
 *  NOTE: For PhonePe, the payment text is ALWAYS in EXTRA_TEXT (not bigText).
 *  The parse() function passes raw text separately so PhonePe branch searches
 *  it first before falling through to bigText.
 *
 *  Generic fallbacks (any app):
 *   G1. "<NAME> has sent ₹<AMT> ..."
 *   G2. "₹<AMT> received from <NAME>"
 *   G3. "Payment of ₹<AMT> received from <NAME>"
 *   G4. "<NAME> sent ₹<AMT>"
 *   G5. "You paid ₹<AMT> to <NAME>"
 *
 * Amount is always normalised to "₹<digits>" (e.g. "₹1.00", "₹500").
 * Sender names have trailing contextual phrases stripped.
 */
object PaymentParser {

    data class ParsedPayment(
        val sender: String,
        val amount: String,
        val sourceApp: String
    )

    // ── Amount normalisation ──────────────────────────────────────────────────

    /**
     * Strips currency prefix tokens and returns "₹<digits>".
     * Handles: ₹500  Rs.500  Rs. 500  rs500  RS500  500  1.00  1,000.00
     *
     * Strips whole tokens (₹ | Rs.? + optional space), NOT individual chars,
     * so amounts like "1.00" are never corrupted.
     */
    private fun normaliseAmount(raw: String): String {
        val stripped = raw.trim()
            .replace(Regex("^₹\\s*"), "")
            .replace(Regex("^[Rr][Ss]\.?\\s*"), "")
            .trim()
        return "₹$stripped"
    }

    // ── Sender name cleaning ──────────────────────────────────────────────────

    private val STRIP_SUFFIXES = listOf(
        Regex("\\s+on\\s+amazon\\s+pay",                 RegexOption.IGNORE_CASE),
        Regex("\\s+to\\s+your\\s+(?:bank\\s+)?account", RegexOption.IGNORE_CASE),
        Regex("\\s+via\\s+\\w+",                         RegexOption.IGNORE_CASE)
    )

    private fun cleanSender(name: String): String {
        var s = name.trim()
        for (rx in STRIP_SUFFIXES) s = rx.replace(s, "")
        return s.trim()
    }

    // ── Amazon Pay patterns ───────────────────────────────────────────────────

    /** Title: "1.00 received" or "₹1.00 received" or "Rs.1.00 received" */
    private val AMAZON_AMOUNT_IN_TITLE = Regex(
        """(?:₹|[Rr][Ss]\.?\s*)?(\d[\d,.]*(?:\.\d{1,2})?)\s+received""",
        RegexOption.IGNORE_CASE
    )

    /** Body: "Money received from RAJSHRI MAJHI on amazon pay" */
    private val AMAZON_SENDER_IN_TEXT = Regex(
        """money\s+rec(?:ei)?ved\s+from\s+(.+?)\s+on\s+amazon\s+pay""",
        RegexOption.IGNORE_CASE
    )

    /** Generic: "₹500 received from <name>" */
    private val AMOUNT_RECEIVED_FROM = Regex(
        """(?:₹|[Rr][Ss]\.?\s*)(\d[\d,.]*(?:\.\d{1,2})?)\s+received\s+from\s+(.+)""",
        RegexOption.IGNORE_CASE
    )

    // ── PhonePe pattern ────────────────────────────────────────────────────────

    /**
     * P1 — "D SINGH has sent Rs. 500.00 to your bank account"
     *
     * Sender = everything BEFORE " has" (greedy split on first " has ").
     * This is deliberately NOT a lazy (.+?) capture — we split on the literal
     * word " has " so the name is the entire prefix regardless of spaces or
     * special characters in the name.
     *
     * Group 1 = sender name (before " has sent")
     * Group 2 = amount digits
     */
    private val PHONEPE_HAS_SENT = Regex(
        """^(.+?)\s+has\s+sent\s+(?:₹|[Rr][Ss]\.?\s*)(\d[\d,.]*(?:\.\d{1,2})?)(?:\s+to\s+your(?:\s+bank)?\s+account)?""",
        RegexOption.IGNORE_CASE
    )

    // ── Generic fallback patterns ─────────────────────────────────────────────

    /** G1 — "<name> has sent ₹<amount> ..." */
    private val GENERIC_HAS_SENT = Regex(
        """(.+?)\s+has\s+sent\s+(?:₹|[Rr][Ss]\.?\s*)(\d[\d,.]*(?:\.\d{1,2})?)""",
        RegexOption.IGNORE_CASE
    )

    /** G3 — "Payment of ₹<amount> received from <name>" */
    private val PAYMENT_OF_RECEIVED = Regex(
        """[Pp]ayment\s+of\s+(?:₹|[Rr][Ss]\.?\s*)(\d[\d,.]*(?:\.\d{1,2})?)\s+received\s+from\s+(.+)""",
        RegexOption.IGNORE_CASE
    )

    /** G4 — "<name> sent ₹<amount>" */
    private val GENERIC_NAME_SENT = Regex(
        """^(.+?)\s+sent\s+(?:₹|[Rr][Ss]\.?\s*)(\d[\d,.]*(?:\.\d{1,2})?)""",
        RegexOption.IGNORE_CASE
    )

    /** G5 — "You paid ₹<amount> to <name>" */
    private val GENERIC_YOU_PAID = Regex(
        """[Yy]ou\s+(?:have\s+)?paid\s+(?:₹|[Rr][Ss]\.?\s*)(\d[\d,.]*(?:\.\d{1,2})?)\s+to\s+(.+)""",
        RegexOption.IGNORE_CASE
    )

    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Parse a payment notification.
     *
     * @param title       Notification.EXTRA_TITLE
     * @param text        Notification.EXTRA_TEXT   ← PhonePe payment info lives here
     * @param bigText     Notification.EXTRA_BIG_TEXT (may be a summary/ticker, not payment text)
     * @param packageName Package name of the source app
     * @param appName     Human-readable app label
     * @return [ParsedPayment] on success, null if no pattern matches.
     */
    fun parse(
        title: String,
        text: String,
        bigText: String,
        packageName: String,
        appName: String
    ): ParsedPayment? {

        val isAmazon  = packageName.contains("amazon", ignoreCase = true) ||
                        appName.contains("amazon", ignoreCase = true)
        val isPhonePe = packageName.contains("phonepe", ignoreCase = true) ||
                        appName.contains("phonepe", ignoreCase = true)

        // bigText is richer than text for Amazon, but for PhonePe it may be
        // a summary string that does NOT contain the payment details.
        // We keep a generic body for Amazon/generic and search text-first for PhonePe.
        val body = bigText.ifBlank { text }

        // ── 1. Amazon Pay ─────────────────────────────────────────────────────
        if (isAmazon) {
            val amtMatch    = AMAZON_AMOUNT_IN_TITLE.find(title)
            val senderMatch = AMAZON_SENDER_IN_TEXT.find(body)
            if (amtMatch != null && senderMatch != null) {
                return ParsedPayment(
                    sender    = cleanSender(senderMatch.groupValues[1]),
                    amount    = normaliseAmount(amtMatch.groupValues[1]),
                    sourceApp = "Amazon Pay"
                )
            }
            for (candidate in listOf(body, title).filter { it.isNotBlank() }) {
                AMOUNT_RECEIVED_FROM.find(candidate)?.let {
                    return ParsedPayment(
                        sender    = cleanSender(it.groupValues[2]),
                        amount    = normaliseAmount(it.groupValues[1]),
                        sourceApp = "Amazon Pay"
                    )
                }
            }
        }

        // ── 2. PhonePe ────────────────────────────────────────────────────────
        if (isPhonePe) {
            // Search text FIRST (payment info is always in EXTRA_TEXT for PhonePe),
            // then bigText, then title as last resort.
            val phonePeCandidates = listOf(text, bigText, title)
                .filter { it.isNotBlank() }
                .distinct()

            for (candidate in phonePeCandidates) {
                PHONEPE_HAS_SENT.find(candidate)?.let {
                    return ParsedPayment(
                        sender    = cleanSender(it.groupValues[1]),
                        amount    = normaliseAmount(it.groupValues[2]),
                        sourceApp = "PhonePe"
                    )
                }
            }
        }

        // ── 3. Generic fallbacks (all apps) ───────────────────────────────────
        for (candidate in listOf(body, title).filter { it.isNotBlank() }) {

            GENERIC_HAS_SENT.find(candidate)?.let {
                return ParsedPayment(
                    sender    = cleanSender(it.groupValues[1]),
                    amount    = normaliseAmount(it.groupValues[2]),
                    sourceApp = if (isPhonePe) "PhonePe" else if (isAmazon) "Amazon Pay" else appName
                )
            }

            AMOUNT_RECEIVED_FROM.find(candidate)?.let {
                return ParsedPayment(
                    sender    = cleanSender(it.groupValues[2]),
                    amount    = normaliseAmount(it.groupValues[1]),
                    sourceApp = if (isAmazon) "Amazon Pay" else appName
                )
            }

            PAYMENT_OF_RECEIVED.find(candidate)?.let {
                return ParsedPayment(
                    sender    = cleanSender(it.groupValues[2]),
                    amount    = normaliseAmount(it.groupValues[1]),
                    sourceApp = if (isPhonePe) "PhonePe" else appName
                )
            }

            GENERIC_NAME_SENT.find(candidate)?.let {
                return ParsedPayment(
                    sender    = cleanSender(it.groupValues[1]),
                    amount    = normaliseAmount(it.groupValues[2]),
                    sourceApp = if (isPhonePe) "PhonePe" else if (isAmazon) "Amazon Pay" else appName
                )
            }

            GENERIC_YOU_PAID.find(candidate)?.let {
                return ParsedPayment(
                    sender    = cleanSender(it.groupValues[2]),
                    amount    = normaliseAmount(it.groupValues[1]),
                    sourceApp = if (isPhonePe) "PhonePe" else appName
                )
            }
        }

        return null
    }
}
