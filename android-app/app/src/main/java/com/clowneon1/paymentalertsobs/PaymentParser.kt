package com.clowneon1.paymentalertsobs

/**
 * Extracts (sender, amount, sourceApp) from UPI payment notification text.
 *
 * Supported apps / patterns:
 *  - PhonePe : "Rahul Kumar sent ₹500" or "You paid ₹200 to Rahul Kumar"
 *  - Amazon Pay : "Rahul Kumar paid you ₹500" or "₹500 received from Rahul Kumar"
 */
object PaymentParser {

    data class ParsedPayment(
        val sender: String,
        val amount: String,
        val sourceApp: String
    )

    // ── PhonePe patterns ──────────────────────────────────────────────────────
    // "Rahul Kumar sent ₹500"
    private val PHONEPE_SENT = Regex(
        """^(.+?)\s+sent\s+([₹Rs.]+[\d,]+(?:\.\d{1,2})?)""",
        RegexOption.IGNORE_CASE
    )

    // "You paid ₹200 to Rahul Kumar" / "You have paid ₹200 to Rahul Kumar"
    private val PHONEPE_YOU_PAID = Regex(
        """[Yy]ou\s+(?:have\s+)?paid\s+([₹Rs.]+[\d,]+(?:\.\d{1,2})?)\s+to\s+(.+)""",
        RegexOption.IGNORE_CASE
    )

    // "Payment of ₹500 received from Rahul Kumar"
    private val PHONEPE_RECEIVED_FROM = Regex(
        """[Pp]ayment\s+of\s+([₹Rs.]+[\d,]+(?:\.\d{1,2})?)\s+received\s+from\s+(.+)""",
        RegexOption.IGNORE_CASE
    )

    // ── Amazon Pay patterns ───────────────────────────────────────────────────
    // "Rahul Kumar paid you ₹500"
    private val AMAZON_PAID_YOU = Regex(
        """^(.+?)\s+paid\s+you\s+([₹Rs.]+[\d,]+(?:\.\d{1,2})?)""",
        RegexOption.IGNORE_CASE
    )

    // "₹500 received from Rahul Kumar"
    private val AMAZON_RECEIVED = Regex(
        """([₹Rs.]+[\d,]+(?:\.\d{1,2})?)\s+received\s+from\s+(.+)""",
        RegexOption.IGNORE_CASE
    )

    // "You sent ₹500 to Rahul Kumar" (Amazon / generic)
    private val GENERIC_YOU_SENT = Regex(
        """[Yy]ou\s+sent\s+([₹Rs.]+[\d,]+(?:\.\d{1,2})?)\s+to\s+(.+)""",
        RegexOption.IGNORE_CASE
    )

    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Try to parse the notification from a known payment app.
     * [title] is notification title, [text] is the body/bigText.
     * [packageName] is used to decide which patterns to try first.
     *
     * Returns null if no pattern matches.
     */
    fun parse(title: String, text: String, packageName: String, appName: String): ParsedPayment? {
        val isPhonePe = packageName.contains("phonepe", ignoreCase = true) ||
                        appName.contains("phonepe", ignoreCase = true)
        val isAmazon  = packageName.contains("amazon", ignoreCase = true) ||
                        appName.contains("amazon", ignoreCase = true)

        // Try both title and body text; use whichever matches first.
        val candidates = listOf(text, title).filter { it.isNotBlank() }

        for (raw in candidates) {
            val trimmed = raw.trim()

            if (isPhonePe || (!isAmazon)) {
                PHONEPE_SENT.find(trimmed)?.let {
                    return ParsedPayment(it.groupValues[1].trim(), it.groupValues[2].trim(), "PhonePe")
                }
                PHONEPE_YOU_PAID.find(trimmed)?.let {
                    // payer is "You", receiver is the other person — but we show receiver as sender
                    return ParsedPayment(it.groupValues[2].trim(), it.groupValues[1].trim(), "PhonePe")
                }
                PHONEPE_RECEIVED_FROM.find(trimmed)?.let {
                    return ParsedPayment(it.groupValues[2].trim(), it.groupValues[1].trim(), "PhonePe")
                }
            }

            if (isAmazon || (!isPhonePe)) {
                AMAZON_PAID_YOU.find(trimmed)?.let {
                    return ParsedPayment(it.groupValues[1].trim(), it.groupValues[2].trim(), "Amazon Pay")
                }
                AMAZON_RECEIVED.find(trimmed)?.let {
                    return ParsedPayment(it.groupValues[2].trim(), it.groupValues[1].trim(), "Amazon Pay")
                }
            }

            // Generic fallback (works for most UPI apps)
            GENERIC_YOU_SENT.find(trimmed)?.let {
                return ParsedPayment(it.groupValues[2].trim(), it.groupValues[1].trim(), appName)
            }
        }

        return null
    }
}
