import Foundation

/// Unpacks a downloaded stop pack (.gz). Apple's `.zlib` decompression is raw DEFLATE, so the gzip
/// header and trailer are handled here (RFC 1952). Packs are single-member gzip files of a few MB.
enum Gunzip {
  enum Failure: Error, CustomStringConvertible {
    case notGzip
    case truncated
    case unsupported
    case decompression
    case sizeMismatch

    var description: String {
      switch self {
      case .notGzip: return "Not a gzip file"
      case .truncated: return "The gzip file is truncated"
      case .unsupported: return "Unsupported gzip compression method"
      case .decompression: return "Could not decompress the file"
      case .sizeMismatch: return "The unpacked size does not match the gzip trailer"
      }
    }
  }

  /// The raw DEFLATE stream of a gzip file and the uncompressed size from its trailer (mod 2^32).
  static func deflateRange(_ data: Data) throws -> (range: Range<Int>, isize: UInt32) {
    let bytes = [UInt8](data)
    guard bytes.count >= 18 else { throw Failure.truncated }
    guard bytes[0] == 0x1f, bytes[1] == 0x8b else { throw Failure.notGzip }
    guard bytes[2] == 8 else { throw Failure.unsupported }
    let flags = bytes[3]
    var pos = 10
    if flags & 0x04 != 0 { // FEXTRA
      guard pos + 2 <= bytes.count else { throw Failure.truncated }
      pos += 2 + Int(bytes[pos]) + Int(bytes[pos + 1]) << 8
    }
    if flags & 0x08 != 0 { // FNAME, zero-terminated
      while pos < bytes.count, bytes[pos] != 0 { pos += 1 }
      pos += 1
    }
    if flags & 0x10 != 0 { // FCOMMENT, zero-terminated
      while pos < bytes.count, bytes[pos] != 0 { pos += 1 }
      pos += 1
    }
    if flags & 0x02 != 0 { pos += 2 } // FHCRC
    let end = bytes.count - 8
    guard pos < end else { throw Failure.truncated }
    let isize = UInt32(bytes[end + 4]) | UInt32(bytes[end + 5]) << 8 | UInt32(bytes[end + 6]) << 16 | UInt32(bytes[end + 7]) << 24
    return (pos..<end, isize)
  }

  #if canImport(Darwin)
  /// Unpacks `source` into `destination` and returns the unpacked size in bytes.
  static func unpack(_ source: URL, to destination: URL) throws -> Int {
    let data = try Data(contentsOf: source)
    let (range, isize) = try deflateRange(data)
    let deflate = data.subdata(in: range)
    guard let out = try? (deflate as NSData).decompressed(using: .zlib) as Data else { throw Failure.decompression }
    guard UInt32(truncatingIfNeeded: out.count) == isize else { throw Failure.sizeMismatch }
    try FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
    try out.write(to: destination, options: .atomic)
    return out.count
  }
  #endif
}
