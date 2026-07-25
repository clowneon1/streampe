package com.clowneon1.paymentalertsobs

/**
 * Extracts (sender, amount, sourceApp) from UPI payment notification text.
 *
 * Supported apps / patterns (in priority order):
 *  - Amazon Pay : title "1.00 received", text "Money received from RAJSHRI MAJHI on amazon pay"
 *  - PhonePe    : "D SINGH has sent rs1 to your bank account"
 *  - Generic    : "<name> has sent rs<amt> ...", "<amt> received from <name>", "<name> sent ₹<amt>"
 *
 * Amount is always normalised to "₹<number>" (e.g. "₹1.00", "₹500").
 * Sender names have trailing contextual phrases stripped.
 */
object PaymentParser {

    data class ParsedPayment(
        val sender: String,
        val amount: String,
        val sourceApp: String
    )

    // ── Amount normalisation ──────────────────────────────────────────────────

    /** Strips existing currency prefix and returns "₹<raw_digits>". */
    private fun normaliseAmount(raw: String): String {
        val digits = raw.trim().replace(Regex("^[₹rRsS.\\s]+"), "").trimStart()
        return "₹$digits"
    }

    // ── Sender name cleaning ──────────────────────────────────────────────────

    private val STRIP_SUFFIXES = listOf(
        Regex("\\s+on\\s+amazon\\s+pay", RegexOption.IGNORE_CASE),
        Regex("\\s+to\\s+your\\s+bank\\s+account", RegexOption.IGNORE_CASE),
        Regex("\\s+via\\s+\\w+", RegexOption.IGNORE_CASE)
    )

    private fun cleanSender(name: String): String {
        var s = name.trim()
        for (rx in STRIP_SUFFIXES) s = rx.replace(s, "")
        return s.trim()
    }

    // ── Amazon Pay patterns ───────────────────────────────────────────────────

    /**
     * Title: "1.00 received"  →  amount
     * Covers optional ₹ / Rs prefix and comma-separated digits.
     */
    private val AMAZON_AMOUNT_IN_TITLE = Regex(
        """(?:₹|[rR][sS]\.?\s*)?(\d+(?:[.,]\d{1,2})?)\s+received""",
        RegexOption.IGNORE_CASE
    )

    /**
     * Text: "Money received from RAJSHRI MAJHI on amazon pay"  →  sender
     */
    private val AMAZON_SENDER_IN_TEXT = Regex(
        """money\s+rec(?:ei)?ved\s+from\s+(.+?)\s+on\s+amazon\s+pay""",
        RegexOption.IGNORE_CASE
    )

    /**
     * Generic "₹500 received from <name>" or "rs500 received from <name>"
     * (Amazon and others).
     */
    private val AMOUNT_FROM_NAME = Regex(
        """(?:₹|[rR][sS]\.?\s*)(\d+(?:[.,]\d{1,2})?)\s+received\s+from\s+(.+)""",
        RegexOption.IGNORE_CASE
    )

    // ── PhonePe patterns ──────────────────────────────────────────────────────

    /**
     * "D SINGH has sent rs1 to your bank account"
     * Captures sender name and amount; trailing phrase is stripped by cleanSender.
     */
    private val PHONEPE_HAS_SENT = Regex(
        """(.+?)\s+has\s+sent\s+(?:₹|[rR][sS]\.?\s*)(\d+(?:[.,]\d{1,2})?)\s+to\s+your\s+bank\s+account""",
        RegexOption.IGNORE_CASE
    )

    // ── Generic fallback patterns ─────────────────────────────────────────────

    /** "<name> has sent rs<amount> ..." (no bank-account suffix required) */
    private val GENERIC_HAS_SENT = Regex(
        """(.+?)\s+has\s+sent\s+(?:₹|[rR][sS]\.?\s*)(\d+(?:[.,]\d{1,2})?)""",
        RegexOption.IGNORE_CASE
    )

    /** "<name> sent ₹<amount>" */
    private val GENERIC_NAME_SENT = Regex(
        """^(.+?)\s+sent\s+(?:₹|[rR][sS]\.?\s*)(\d+(?:[.,]\d{1,2})?)""",
        RegexOption.IGNORE_CASE
    )

    /** "You paid ₹<amount> to <name>" */
    private val GENERIC_YOU_PAID = Regex(
        """[Yy]ou\s+(?:have\s+)?paid\s+(?:₹|[rR][sS]\.?\s*)(\d+(?:[.,]\d{1,2})?)\s+to\s+(.+)""",
        RegexOption.IGNORE_CASE
    )

    /** "Payment of ₹<amount> received from <name>" */
    private val PAYMENT_OF_RECEIVED = Regex(
        """[Pp]ayment\s+of\s+(?:₹|[rR][sS]\.?\s*)(\d+(?:[.,]\d{1,2})?)\s+received\s+from\s+(.+)""",
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

        // ── 1. Amazon Pay: title-amount + body-sender ─────────────────────────
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
            // Also try generic "₹500 received from <name>" in body for Amazon
            AMOUNT_FROM_NAME.find(body)?.let {
                return ParsedPayment(
                    sender    = cleanSender(it.groupValues[2]),
                    amount    = normaliseAmount(it.groupValues[1]),
                    sourceApp = "Amazon Pay"
                )
            }
        }

        // ── 2. PhonePe: "has sent rs<amount> to your bank account" ────────────
        if (isPhonePe) {
            PHONEPE_HAS_SENT.find(body)?.let {
                return ParsedPayment(
                    sender    = cleanSender(it.groupValues[1]),
                    amount    = normaliseAmount(it.groupValues[2]),
                    sourceApp = "PhonePe"
                )
            }
            PHONEPE_HAS_SENT.find(title)?.let {
                return ParsedPayment(
                    sender    = cleanSender(it.groupValues[1]),
                    amount    = normaliseAmount(it.groupValues[2]),
                    sourceApp = "PhonePe"
                )
            }
        }

        // ── 3. Generic fallbacks (all apps, search both body and title) ────────
        for (candidate in listOf(body, title).filter { it.isNotBlank() }) {

            GENERIC_HAS_SENT.find(candidate)?.let {
                val source = if (isPhonePe) "PhonePe" else if (isAmazon) "Amazon Pay" else appName
                return ParsedPayment(
                    sender    = cleanSender(it.groupValues[1]),
                    amount    = normaliseAmount(it.groupValues[2]),
                    sourceApp = source
                )
            }

            AMOUNT_FROM_NAME.find(candidate)?.let {
                val source = if (isAmazon) "Amazon Pay" else appName
                return ParsedPayment(
                    sender    = cleanSender(it.groupValues[2]),
                    amount    = normaliseAmount(it.groupValues[1]),
                    sourceApp = source
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
                val source = if (isPhonePe) "PhonePe" else if (isAmazon) "Amazon Pay" else appName
                return ParsedPayment(
                    sender    = cleanSender(it.groupValues[1]),
                    amount    = normaliseAmount(it.groupValues[2]),
                    sourceApp = source
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
