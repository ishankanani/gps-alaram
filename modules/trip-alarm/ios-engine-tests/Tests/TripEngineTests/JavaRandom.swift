import Foundation

/// java.util.Random, bit for bit, so the simulated trips use the same noise as the Kotlin tests
/// (same seeds, same GPS jitter) and both engines can be compared scenario by scenario.
struct JavaRandom {
  private static let multiplier: Int64 = 0x5DEECE66D
  private static let addend: Int64 = 0xB
  private static let mask: Int64 = (1 << 48) - 1

  private var seed: Int64
  private var nextNextGaussian = 0.0
  private var haveNextNextGaussian = false

  init(_ seed: Int64) {
    self.seed = (seed ^ JavaRandom.multiplier) & JavaRandom.mask
  }

  private mutating func next(_ bits: Int) -> Int32 {
    seed = (seed &* JavaRandom.multiplier &+ JavaRandom.addend) & JavaRandom.mask
    // (int)(seed >>> (48 - bits)): the 48-bit seed is non-negative, so >> equals >>>.
    return Int32(truncatingIfNeeded: seed >> Int64(48 - bits))
  }

  mutating func nextInt(_ bound: Int32) -> Int32 {
    precondition(bound > 0)
    var r = next(31)
    let m = bound - 1
    if bound & m == 0 {
      return Int32(truncatingIfNeeded: (Int64(bound) * Int64(r)) >> 31)
    }
    var u = r
    while true {
      r = u % bound
      // Java: u - r + m < 0 with int overflow.
      if u &- r &+ m >= 0 { break }
      u = next(31)
    }
    return r
  }

  mutating func nextDouble() -> Double {
    let high = Int64(next(26)) << 27
    let low = Int64(next(27))
    return Double(high + low) * 0x1.0p-53
  }

  mutating func nextBoolean() -> Bool { next(1) != 0 }

  mutating func nextGaussian() -> Double {
    if haveNextNextGaussian {
      haveNextNextGaussian = false
      return nextNextGaussian
    }
    var v1 = 0.0
    var v2 = 0.0
    var s = 0.0
    repeat {
      v1 = 2 * nextDouble() - 1
      v2 = 2 * nextDouble() - 1
      s = v1 * v1 + v2 * v2
    } while s >= 1 || s == 0
    let multiplier = (-2 * log(s) / s).squareRoot()
    nextNextGaussian = v2 * multiplier
    haveNextNextGaussian = true
    return v1 * multiplier
  }
}
