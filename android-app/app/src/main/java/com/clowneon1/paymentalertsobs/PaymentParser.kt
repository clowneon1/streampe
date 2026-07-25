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
 *  PhonePe  — multiple formats across app versions:
 *   P1. "<NAME> has sent Rs.<AMT> to your bank account"   (old)
 *   P2. "<NAME> sent ₹<AMT> to your account"              (mid)
 *   P3. "Received ₹<AMT> from <NAME>"                     (new)
 *   P4. Title = "₹<AMT> received"  +  body starts with "From <NAME>"  (title-split)
 *   P5. "₹<AMT> from <NAME>"                              (compact, newer devices)
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
     *
     * Handles: ₹500  Rs.500  Rs. 500  rs500  RS500  500  1.00  1,000.00
     *
     * NOTE: We match currency tokens as whole units (₹ | Rs.? with optional space)
     * rather than stripping individual characters — stripping chars like 'r','s','.'
     * would corrupt amounts like "1.00" → "1" or leave empty strings.
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

    /** A1a — Title: "1.00 received" or "₹1.00 received" or "Rs.1.00 received" */
    private val AMAZON_AMOUNT_IN_TITLE = Regex(
        """(?:₹|[Rr][Ss]\.?\s*)?(\d[\d,.]*(?:\.\d{1,2})?)\s+received""",
        RegexOption.IGNORE_CASE
    )

    /** A1b — Body: "Money received from RAJSHRI MAJHI on amazon pay" */
    private val AMAZON_SENDER_IN_TEXT = Regex(
        """money\s+rec(?:ei)?ved\s+from\s+(.+?)\s+on\s+amazon\s+pay""",
        RegexOption.IGNORE_CASE
    )

    /** A2 — Body: "₹500 received from <name>" */
    private val AMOUNT_RECEIVED_FROM = Regex(
        """(?:₹|[Rr][Ss]\.?\s*)(\d[\d,.]*(?:\.\d{1,2})?)\s+received\s+from\s+(.+)""",
        RegexOption.IGNORE_CASE
    )

    // ── PhonePe patterns ──────────────────────────────────────────────────────

    /**
     * P1 — Old format:
     *   "D SINGH has sent rs1 to your bank account"
     *   "D SINGH has sent Rs. 500.00 to your bank account"
     */
    private val PHONEPE_HAS_SENT_BANK = Regex(
        """(.+?)\s+has\s+sent\s+(?:₹|[Rr][Ss]\.?\s*)(\d[\d,.]*(?:\.\d{1,2})?)\s+to\s+your\s+(?:bank\s+)?account""",
        RegexOption.IGNORE_CASE
    )

    /**
     * P2 — Mid format:
     *   "D SINGH sent ₹500 to your account"
     *   "D SINGH sent Rs. 1,000 to your account"
     */
    private val PHONEPE_NAME_SENT_ACCOUNT = Regex(
        """^(.+?)\s+sent\s+(?:₹|[Rr][Ss]\.?\s*)(\d[\d,.]*(?:\.\d{1,2})?)\s+to\s+your""",
        RegexOption.IGNORE_CASE
    )

    /**
     * P3 — New format:
     *   "Received ₹500 from D SINGH"
     *   "Received Rs. 1,000.00 from D SINGH"
     */
    private val PHONEPE_RECEIVED_FROM = Regex(
        """[Rr]eceived\s+(?:₹|[Rr][Ss]\.?\s*)(\d[\d,.]*(?:\.\d{1,2})?)\s+from\s+(.+)""",
        RegexOption.IGNORE_CASE
    )

    /**
     * P4a — Title-split, title:
     *   "₹500 received"  or  "Rs. 500 received"
     */
    private val PHONEPE_TITLE_AMOUNT = Regex(
        """(?:₹|[Rr][Ss]\.?\s*)(\d[\d,.]*(?:\.\d{1,2})?)\s+received""",
        RegexOption.IGNORE_CASE
    )

    /**
     * P4b — Title-split, body:
     *   "From D SINGH"  (body when title carries the amount)
     */
    private val PHONEPE_FROM_NAME = Regex(
        """^[Ff]rom\s+(.+)""",
        RegexOption.IGNORE_CASE
    )

    /**
     * P5 — Compact format (newer devices):
     *   "₹500 from D SINGH"
     */
    private val PHONEPE_COMPACT = Regex(
        """(?:₹|[Rr][Ss]\.?\s*)(\d[\d,.]*(?:\.\d{1,2})?)\s+from\s+(.+)""",
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
     * @param text        Notification.EXTRA_TEXT
     * @param bigText     Notification.EXTRA_BIG_TEXT (may equal text if absent)
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

        // Use the richest text available for body matching.
        val body = bigText.ifBlank { text }

        // ── 1. Amazon Pay ─────────────────────────────────────────────────────
        if (isAmazon) {
            // A1: title carries amount, body carries sender
            val amtMatch    = AMAZON_AMOUNT_IN_TITLE.find(title)
            val senderMatch = AMAZON_SENDER_IN_TEXT.find(body)
            if (amtMatch != null && senderMatch != null) {
                return ParsedPayment(
                    sender    = cleanSender(senderMatch.groupValues[1]),
                    amount    = normaliseAmount(amtMatch.groupValues[1]),
                    sourceApp = "Amazon Pay"
                )
            }
            // A2: generic "₹500 received from <name>" anywhere in body or title
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
            // Search both body and title for each pattern
            for (candidate in listOf(body, title).filter { it.isNotBlank() }) {

                // P1 — "<name> has sent Rs.X to your bank account"
                PHONEPE_HAS_SENT_BANK.find(candidate)?.let {
                    return ParsedPayment(
                        sender    = cleanSender(it.groupValues[1]),
                        amount    = normaliseAmount(it.groupValues[2]),
                        sourceApp = "PhonePe"
                    )
                }

                // P2 — "<name> sent ₹X to your account"
                PHONEPE_NAME_SENT_ACCOUNT.find(candidate)?.let {
                    return ParsedPayment(
                        sender    = cleanSender(it.groupValues[1]),
                        amount    = normaliseAmount(it.groupValues[2]),
                        sourceApp = "PhonePe"
                    )
                }

                // P3 — "Received ₹X from <name>"
                PHONEPE_RECEIVED_FROM.find(candidate)?.let {
                    return ParsedPayment(
                        sender    = cleanSender(it.groupValues[2]),
                        amount    = normaliseAmount(it.groupValues[1]),
                        sourceApp = "PhonePe"
                    )
                }

                // P5 — "₹X from <name>" (compact)
                PHONEPE_COMPACT.find(candidate)?.let {
                    return ParsedPayment(
                        sender    = cleanSender(it.groupValues[2]),
                        amount    = normaliseAmount(it.groupValues[1]),
                        sourceApp = "PhonePe"
                    )
                }
            }

            // P4 — title carries amount, body carries "From <name>"
            val titleAmt  = PHONEPE_TITLE_AMOUNT.find(title)
            val bodyFrom  = PHONEPE_FROM_NAME.find(body)
            if (titleAmt != null && bodyFrom != null) {
                return ParsedPayment(
                    sender    = cleanSender(bodyFrom.groupValues[1]),
                    amount    = normaliseAmount(titleAmt.groupValues[1]),
                    sourceApp = "PhonePe"
                )
            }
        }

        // ── 3. Generic fallbacks (all apps) ───────────────────────────────────
        for (candidate in listOf(body, title).filter { it.isNotBlank() }) {

            // G1 — "<name> has sent ₹<amount>"
            GENERIC_HAS_SENT.find(candidate)?.let {
                return ParsedPayment(
                    sender    = cleanSender(it.groupValues[1]),
                    amount    = normaliseAmount(it.groupValues[2]),
                    sourceApp = if (isPhonePe) "PhonePe" else if (isAmazon) "Amazon Pay" else appName
                )
            }

            // A2 / G2 — "₹<amount> received from <name>"
            AMOUNT_RECEIVED_FROM.find(candidate)?.let {
                return ParsedPayment(
                    sender    = cleanSender(it.groupValues[2]),
                    amount    = normaliseAmount(it.groupValues[1]),
                    sourceApp = if (isAmazon) "Amazon Pay" else appName
                )
            }

            // G3 — "Payment of ₹<amount> received from <name>"
            PAYMENT_OF_RECEIVED.find(candidate)?.let {
                return ParsedPayment(
                    sender    = cleanSender(it.groupValues[2]),
                    amount    = normaliseAmount(it.groupValues[1]),
                    sourceApp = if (isPhonePe) "PhonePe" else appName
                )
            }

            // G4 — "<name> sent ₹<amount>"
            GENERIC_NAME_SENT.find(candidate)?.let {
                return ParsedPayment(
                    sender    = cleanSender(it.groupValues[1]),
                    amount    = normaliseAmount(it.groupValues[2]),
                    sourceApp = if (isPhonePe) "PhonePe" else if (isAmazon) "Amazon Pay" else appName
                )
            }

            // G5 — "You paid ₹<amount> to <name>"
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
