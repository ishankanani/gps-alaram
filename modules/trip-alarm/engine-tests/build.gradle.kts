// Runs the pure-Kotlin trip engine tests on the JVM, without the Android SDK.
// The engine sources live in the Android module and are compiled here as-is.
plugins {
  kotlin("jvm") version "2.1.20"
}

repositories {
  mavenCentral()
}

dependencies {
  testImplementation(kotlin("test"))
}

sourceSets {
  main {
    kotlin.srcDir("../android/src/main/java/com/ishankanani/gpsalarm/tripalarm/engine")
  }
}

tasks.test {
  useJUnitPlatform()
  testLogging {
    events("failed")
    exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
  }
}
