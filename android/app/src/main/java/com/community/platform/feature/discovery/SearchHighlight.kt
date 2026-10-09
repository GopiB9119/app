package com.community.platform.feature.discovery

import java.util.Locale

private val searchWordPattern = Regex("[\\p{L}\\p{M}\\p{N}]+")

data class HighlightPiece(val text: String, val marked: Boolean)

fun searchWords(value: String): List<String> = searchWordPattern.findAll(value.lowercase(Locale.ROOT))
    .map { it.value }.distinct().sortedByDescending { it.length }.toList()

fun highlightPieces(value: String, words: List<String>): List<HighlightPiece> {
    val pieces = mutableListOf<HighlightPiece>()
    var last = 0
    for (token in searchWordPattern.findAll(value)) {
        val lowered = token.value.lowercase(Locale.ROOT)
        val word = words.firstOrNull { lowered.startsWith(it) } ?: continue
        val start = token.range.first
        val count = word.codePointCount(0, word.length).coerceAtMost(token.value.codePointCount(0, token.value.length))
        val end = start + token.value.offsetByCodePoints(0, count)
        if (start > last) pieces += HighlightPiece(value.substring(last, start), false)
        pieces += HighlightPiece(value.substring(start, end), true)
        last = end
    }
    if (last < value.length) pieces += HighlightPiece(value.substring(last), false)
    return pieces
}