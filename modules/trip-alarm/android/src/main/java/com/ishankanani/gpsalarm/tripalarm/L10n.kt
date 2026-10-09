package com.ishankanani.gpsalarm.tripalarm

import android.content.Context

/**
 * Native strings (notifications, the alarm screen) in the language picked in the app. The app
 * calls setLanguage(); the choice is saved so the service and receivers use it after a restart.
 */
object L10n {
  private const val PREFS = "trip_alarm_l10n"
  private const val KEY_LANG = "lang"
  val SUPPORTED = setOf("en", "de", "hi", "fr", "nl", "it", "sv", "nb", "da", "fi", "ja")
  private val DECIMAL_COMMA = setOf("de", "fr", "nl", "it", "sv", "nb", "da", "fi")

  @Volatile
  var lang: String = "en"
    private set

  fun set(context: Context, code: String) {
    lang = if (code in SUPPORTED) code else "en"
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_LANG, lang).apply()
  }

  /** Loads the saved language; cheap, call it from every entry point (service, receivers). */
  fun load(context: Context) {
    val saved = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_LANG, null)
    lang = if (saved != null && saved in SUPPORTED) saved else "en"
  }

  /** German, French, Dutch, Italian and the Nordic languages write 1,2 km. */
  val decimalSeparator: Char get() = if (lang in DECIMAL_COMMA) ',' else '.'

  operator fun get(key: String): String = (TABLES[lang] ?: EN)[key] ?: EN[key] ?: key

  fun format(key: String, vararg values: Pair<String, String>): String {
    var text = get(key)
    for ((name, value) in values) text = text.replace("{$name}", value)
    return text
  }

  private val EN = mapOf(
    "yourStop" to "your stop",
    "tripTo" to "To {label}",
    "demoTitle" to "Demo ride to {label}",
    "tripLeaving" to "Leaving {label}",
    "ringsWithin" to "Rings within {radius}",
    "ringsBefore" to "Rings {minutes} min before or within {radius}",
    "ringsLeave" to "Rings when you are more than {radius} away",
    "waitingGps" to "Waiting for GPS…",
    "waitingInside" to "Waiting until you are inside the area",
    "gpsGood" to "GPS good",
    "gpsWeak" to "GPS weak",
    "gpsLost" to "GPS lost, estimating",
    "alarmRinging" to "Alarm ringing",
    "snoozed" to "Snoozed, rings again in a minute",
    "autoSilenced" to "The alarm rang for 10 minutes and stopped.",
    "wakeUp" to "Wake up!",
    "arrived" to "You are {distance} from {label}.",
    "arrivedNoDistance" to "You are almost at {label}.",
    "passedThrough" to "You are at {label}.",
    "eta" to "About {eta} to {label}.",
    "closestTitle" to "Check where you are",
    "closest" to "This is the closest you get to {label}. Your route does not pass the pin itself.",
    "estimated" to "GPS signal lost. By our estimate you are near {label} now.",
    "leftTitle" to "You left the area",
    "left" to "You are outside {label}.",
    "stoppedTitle" to "Tracking stopped",
    "stopped" to "Your phone stopped the trip to {label}. Check where you are, then open the app to start it again.",
    "testTitle" to "Test alarm",
    "test" to "This is how your alarm will sound and look.",
    "slide" to "Slide to dismiss  ›››",
    "stopTrip" to "Stop trip",
    "dismiss" to "Dismiss",
    "snooze" to "Snooze 1 min",
    "notYet" to "Not yet",
    "notYetLong" to "Not yet, keep tracking",
    "gpsLostTitle" to "GPS signal lost",
    "gpsLostNear" to "The alarm will ring by estimate if the signal does not come back.",
    "gpsLostFar" to "Still tracking with what the phone can see.",
    "locationOffTitle" to "Location is turned off",
    "locationOff" to "Your trip cannot be tracked. Tap to turn location back on.",
    "permissionTitle" to "Location permission removed",
    "permission" to "Open the app to allow location so the trip can continue.",
    "shareLog" to "Share trip log",
    "channelTrip" to "Active trip",
    "channelTripDesc" to "Distance and arrival time while a trip is running",
    "channelAlarm" to "Arrival alarm",
    "channelAlarmDesc" to "The alarm when you reach your stop",
    "channelFallback" to "Tracking stopped alarm",
    "channelFallbackDesc" to "Rings if your phone stops a trip before you arrive",
    "channelWarning" to "Trip warnings",
    "channelWarningDesc" to "GPS signal lost or location turned off during a trip",
  )

  private val DE = mapOf(
    "yourStop" to "deine Haltestelle",
    "tripTo" to "Nach {label}",
    "demoTitle" to "Probefahrt nach {label}",
    "tripLeaving" to "Verlassen von {label}",
    "ringsWithin" to "Klingelt im Umkreis von {radius}",
    "ringsBefore" to "Klingelt {minutes} Min. vorher oder im Umkreis von {radius}",
    "ringsLeave" to "Klingelt, wenn du mehr als {radius} entfernt bist",
    "waitingGps" to "Warte auf GPS …",
    "waitingInside" to "Warte, bis du im Bereich bist",
    "gpsGood" to "GPS gut",
    "gpsWeak" to "GPS schwach",
    "gpsLost" to "Kein GPS, Schätzung",
    "alarmRinging" to "Alarm klingelt",
    "snoozed" to "Schlummern, klingelt in einer Minute erneut",
    "autoSilenced" to "Der Alarm hat 10 Minuten geklingelt und wurde beendet.",
    "wakeUp" to "Aufwachen!",
    "arrived" to "Du bist {distance} von {label} entfernt.",
    "arrivedNoDistance" to "Du bist fast bei {label}.",
    "passedThrough" to "Du bist bei {label}.",
    "eta" to "Noch etwa {eta} bis {label}.",
    "closestTitle" to "Prüfe, wo du bist",
    "closest" to "Näher kommst du {label} nicht. Deine Strecke führt nicht direkt an der Markierung vorbei.",
    "estimated" to "Kein GPS-Signal. Nach unserer Schätzung bist du jetzt bei {label}.",
    "leftTitle" to "Bereich verlassen",
    "left" to "Du bist außerhalb von {label}.",
    "stoppedTitle" to "Verfolgung gestoppt",
    "stopped" to "Dein Handy hat die Fahrt nach {label} beendet. Prüfe, wo du bist, und starte sie in der App neu.",
    "testTitle" to "Testalarm",
    "test" to "So klingt und sieht dein Alarm aus.",
    "slide" to "Zum Beenden wischen  ›››",
    "stopTrip" to "Fahrt beenden",
    "dismiss" to "Beenden",
    "snooze" to "1 Min. schlummern",
    "notYet" to "Noch nicht",
    "notYetLong" to "Noch nicht, weiter verfolgen",
    "gpsLostTitle" to "GPS-Signal verloren",
    "gpsLostNear" to "Kommt das Signal nicht zurück, klingelt der Alarm nach Schätzung.",
    "gpsLostFar" to "Verfolgung läuft mit dem, was das Handy empfängt.",
    "locationOffTitle" to "Standort ist ausgeschaltet",
    "locationOff" to "Deine Fahrt kann nicht verfolgt werden. Tippe, um den Standort einzuschalten.",
    "permissionTitle" to "Standortberechtigung entfernt",
    "permission" to "Öffne die App und erlaube den Standort, damit die Fahrt weiterläuft.",
    "shareLog" to "Fahrtprotokoll teilen",
    "channelTrip" to "Aktive Fahrt",
    "channelTripDesc" to "Entfernung und Ankunftszeit während einer Fahrt",
    "channelAlarm" to "Ankunftsalarm",
    "channelAlarmDesc" to "Der Alarm, wenn du deine Haltestelle erreichst",
    "channelFallback" to "Alarm bei gestoppter Verfolgung",
    "channelFallbackDesc" to "Klingelt, wenn dein Handy eine Fahrt vor der Ankunft beendet",
    "channelWarning" to "Fahrtwarnungen",
    "channelWarningDesc" to "GPS-Signal verloren oder Standort während der Fahrt ausgeschaltet",
  )

  private val HI = mapOf(
    "yourStop" to "आपका स्टॉप",
    "tripTo" to "{label} की ओर",
    "demoTitle" to "{label} तक डेमो यात्रा",
    "tripLeaving" to "{label} से निकल रहे हैं",
    "ringsWithin" to "{radius} के अंदर बजेगा",
    "ringsBefore" to "{minutes} मिनट पहले या {radius} के अंदर बजेगा",
    "ringsLeave" to "{radius} से ज़्यादा दूर जाने पर बजेगा",
    "waitingGps" to "GPS का इंतज़ार…",
    "waitingInside" to "इलाके के अंदर आने का इंतज़ार",
    "gpsGood" to "GPS अच्छा है",
    "gpsWeak" to "GPS कमज़ोर है",
    "gpsLost" to "GPS नहीं, अनुमान से",
    "alarmRinging" to "अलार्म बज रहा है",
    "snoozed" to "स्नूज़, एक मिनट बाद फिर बजेगा",
    "autoSilenced" to "अलार्म 10 मिनट बजकर बंद हो गया।",
    "wakeUp" to "जागिए!",
    "arrived" to "आप {label} से {distance} दूर हैं।",
    "arrivedNoDistance" to "आप {label} के लगभग पास हैं।",
    "passedThrough" to "आप {label} पर हैं।",
    "eta" to "{label} तक लगभग {eta}।",
    "closestTitle" to "देखिए आप कहाँ हैं",
    "closest" to "आप {label} के इससे ज़्यादा पास नहीं जाते। आपका रास्ता पिन से होकर नहीं जाता।",
    "estimated" to "GPS सिग्नल नहीं है। हमारे अनुमान से आप अब {label} के पास हैं।",
    "leftTitle" to "आप इलाके से बाहर हैं",
    "left" to "आप {label} से बाहर हैं।",
    "stoppedTitle" to "ट्रैकिंग रुक गई",
    "stopped" to "आपके फ़ोन ने {label} की यात्रा रोक दी। देखिए आप कहाँ हैं, फिर ऐप में दोबारा शुरू करें।",
    "testTitle" to "टेस्ट अलार्म",
    "test" to "आपका अलार्म ऐसा सुनाई और दिखाई देगा।",
    "slide" to "बंद करने के लिए खिसकाएँ  ›››",
    "stopTrip" to "यात्रा रोकें",
    "dismiss" to "बंद करें",
    "snooze" to "1 मिनट स्नूज़",
    "notYet" to "अभी नहीं",
    "notYetLong" to "अभी नहीं, ट्रैक करते रहें",
    "gpsLostTitle" to "GPS सिग्नल नहीं मिल रहा",
    "gpsLostNear" to "सिग्नल वापस न आया तो अलार्म अनुमान से बजेगा।",
    "gpsLostFar" to "फ़ोन को जो मिल रहा है, उससे ट्रैकिंग जारी है।",
    "locationOffTitle" to "लोकेशन बंद है",
    "locationOff" to "आपकी यात्रा ट्रैक नहीं हो सकती। लोकेशन चालू करने के लिए टैप करें।",
    "permissionTitle" to "लोकेशन की अनुमति हटा दी गई",
    "permission" to "यात्रा जारी रखने के लिए ऐप खोलकर लोकेशन की अनुमति दें।",
    "shareLog" to "यात्रा लॉग शेयर करें",
    "channelTrip" to "चल रही यात्रा",
    "channelTripDesc" to "यात्रा के दौरान दूरी और पहुँचने का समय",
    "channelAlarm" to "पहुँचने का अलार्म",
    "channelAlarmDesc" to "स्टॉप पर पहुँचने का अलार्म",
    "channelFallback" to "ट्रैकिंग रुकने का अलार्म",
    "channelFallbackDesc" to "फ़ोन यात्रा पहले ही रोक दे तो बजता है",
    "channelWarning" to "यात्रा चेतावनियाँ",
    "channelWarningDesc" to "यात्रा के दौरान GPS सिग्नल या लोकेशन बंद होने पर",
  )

  private val TABLES = mapOf("en" to EN, "de" to DE, "hi" to HI)

  /** For tests: every language has every key. */
  internal fun missingKeys(): Map<String, Set<String>> =
    TABLES.mapValues { (_, table) -> EN.keys - table.keys }.filterValues { it.isNotEmpty() }
}
