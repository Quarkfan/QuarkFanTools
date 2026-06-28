import Foundation
import Vision
import AppKit
import ImageIO

let args = CommandLine.arguments
guard args.count >= 2 else {
  fputs("usage: qft-vision-ocr <image>\n", stderr)
  exit(2)
}

let url = URL(fileURLWithPath: args[1])
guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
      let cgImage = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
  fputs("failed to load image\n", stderr)
  exit(1)
}

let request = VNRecognizeTextRequest { request, error in
  if let error {
    fputs(String(describing: error) + "\n", stderr)
    exit(1)
  }
  let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
  for observation in observations {
    guard let candidate = observation.topCandidates(1).first else { continue }
    print(candidate.string)
  }
}

request.recognitionLevel = .accurate
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
  try handler.perform([request])
} catch {
  fputs(String(describing: error) + "\n", stderr)
  exit(1)
}
