package com.clowneon1.paymentalertsobs

/**
 * Extracts (sender, amount, sourceApp) from UPI payment notification text.
 *
 *  Amazon Pay
 *   A1. Title "1.00 received"  + body "Money received from <NAME> on amazon pay"
 *   A2. Body  "Rs.500 received from <NAME>"
 *
 *  PhonePe
 *   P1. "<NAME> has sent rs<AMT> to your bank account"
 *       Sender = everything before the first " has " in the text string.
 *
 *  Generic fallbacks (any app):
 *   G1. "<NAME> has sent Rs.<AMT>"
 *   G2. "Rs.<AMT> received from <NAME>"
 *   G3. "Payment of Rs.<AMT> received from <NAME>"
 *   G4. "<NAME> sent Rs.<AMT>"
 *   G5. "You paid Rs.<AMT> to <NAME>"
 *
 * Amount is always normalised to "\u20B9<digits>" (e.g. "\u20B91.00", "\u20B9500").
 * All input strings are lowercased and trimmed before any matching.
 */
object PaymentParser {

    data class ParsedPayment(
        val sender: String,
        val amount: String,
        val sourceApp: String
    )

    // -- Amount normalisation -------------------------------------------------

    private fun normaliseAmount(raw: String): String {
        val stripped = raw.trim()
            .replace(Regex("^\\u20B9\\s*"), "")
            .replace(Regex("^[Rr][Ss]\\.?\\s*"), "")
            .trim()
        return "\u20B9$stripped"
    }

    // -- Sender name cleaning -------------------------------------------------

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

    // -- Amazon Pay patterns --------------------------------------------------

    private val AMAZON_AMOUNT_IN_TITLE = Regex(
        """(?:\u20B9|[Rr][Ss]\.?\s*)?(\d[\d,.]*(?:\.\d{1,2})?)\s+received""",
        RegexOption.IGNORE_CASE
    )

    private val AMAZON_SENDER_IN_TEXT = Regex(
        """money\s+rec(?:ei)?ved\s+from\s+(.+?)\s+on\s+amazon\s+pay""",
        RegexOption.IGNORE_CASE
    )

    private val AMOUNT_RECEIVED_FROM = Regex(
        """(?:\u20B9|[Rr][Ss]\.?\s*)(\d[\d,.]*(?:\.\d{1,2})?)\s+received\s+from\s+(.+)""",
        RegexOption.IGNORE_CASE
    )

    // -- PhonePe amount pattern -----------------------------------------------

    private val PHONEPE_AMOUNT = Regex(
        """has\s+sent\s+(?:\u20B9|[Rr][Ss]\.?\s*)(\d[\d,.]*(?:\.\d{1,2})?)""",
        RegexOption.IGNORE_CASE
    )

    // -- Generic fallback patterns --------------------------------------------

    private val GENERIC_HAS_SENT = Regex(
        """(.+?)\s+has\s+sent\s+(?:\u20B9|[Rr][Ss]\.?\s*)(\d[\d,.]*(?:\.\d{1,2})?)""",
        RegexOption.IGNORE_CASE
    )

    private val PAYMENT_OF_RECEIVED = Regex(
        """[Pp]ayment\s+of\s+(?:\u20B9|[Rr][Ss]\.?\s*)(\d[\d,.]*(?:\.\d{1,2})?)\s+received\s+from\s+(.+)""",
        RegexOption.IGNORE_CASE
    )

    private val GENERIC_NAME_SENT = Regex(
        """^(.+?)\s+sent\s+(?:\u20B9|[Rr][Ss]\.?\s*)(\d[\d,.]*(?:\.\d{1,2})?)""",
        RegexOption.IGNORE_CASE
    )

    private val GENERIC_YOU_PAID = Regex(
        """[Yy]ou\s+(?:have\s+)?paid\s+(?:\u20B9|[Rr][Ss]\.?\s*)(\d[\d,.]*(?:\.\d{1,2})?)\s+to\s+(.+)""",
        RegexOption.IGNORE_CASE
    )

    // -------------------------------------------------------------------------

    fun parse(
        title: String,
        text: String,
        bigText: String,
        packageName: String,
        appName: String
    ): ParsedPayment? {

        // Normalise ALL inputs: lowercase + trim so case variations never break matching
        val nTitle   = title.trim().lowercase()
        val nText    = text.trim().lowercase()
        val nBigText = bigText.trim().lowercase()
        val nPkg     = packageName.trim().lowercase()
        val nApp     = appName.trim().lowercase()

        val isAmazon  = nPkg.contains("amazon") || nApp.contains("amazon")
        val isPhonePe = nPkg.contains("phonepe") || nApp.contains("phonepe")

        val body = nBigText.ifBlank { nText }

        // -- 1. Amazon Pay ----------------------------------------------------
        if (isAmazon) {
            val amtMatch    = AMAZON_AMOUNT_IN_TITLE.find(nTitle)
            val senderMatch = AMAZON_SENDER_IN_TEXT.find(body)
            if (amtMatch != null && senderMatch != null) {
                return ParsedPayment(
                    sender    = cleanSender(senderMatch.groupValues[1]),
                    amount    = normaliseAmount(amtMatch.groupValues[1]),
                    sourceApp = "Amazon Pay"
                )
            }
            for (candidate in listOf(body, nTitle).filter { it.isNotBlank() }) {
                AMOUNT_RECEIVED_FROM.find(candidate)?.let {
                    return ParsedPayment(
                        sender    = cleanSender(it.groupValues[2]),
                        amount    = normaliseAmount(it.groupValues[1]),
                        sourceApp = "Amazon Pay"
                    )
                }
            }
        }

        // -- 2. PhonePe -------------------------------------------------------
        // Sender = everything before the first " has " (already lowercase so indexOf is safe)
        if (isPhonePe) {
            val candidates = listOf(nText, nBigText, nTitle)
                .filter { it.isNotBlank() }
                .distinct()

            for (candidate in candidates) {
                val hasIdx   = candidate.indexOf(" has ")
                val amtMatch = PHONEPE_AMOUNT.find(candidate)
                if (hasIdx > 0 && amtMatch != null) {
                    val sender = candidate.substring(0, hasIdx).trim()
                    return ParsedPayment(
                        sender    = cleanSender(sender),
                        amount    = normaliseAmount(amtMatch.groupValues[1]),
                        sourceApp = "PhonePe"
                    )
                }
            }
        }

        // -- 3. Generic fallbacks (all apps) ----------------------------------
        for (candidate in listOf(body, nTitle).filter { it.isNotBlank() }) {

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
