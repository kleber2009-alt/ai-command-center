import { GoogleGenerativeAI } from "@google/generative-ai";

const MODEL =
  process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image-preview";

export type GeneratedImage = {
  bytes: Buffer;
  mimeType: string;
};

export interface ImageBackend {
  editImage(input: {
    sourceImage: { bytes: Buffer; mimeType: string };
    prompt: string;
  }): Promise<GeneratedImage>;
  generateImage(input: { prompt: string }): Promise<GeneratedImage>;
}

class GeminiBackend implements ImageBackend {
  private client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async editImage({
    sourceImage,
    prompt,
  }: {
    sourceImage: { bytes: Buffer; mimeType: string };
    prompt: string;
  }): Promise<GeneratedImage> {
    const model = this.client.getGenerativeModel({ model: MODEL });
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: sourceImage.mimeType,
          data: sourceImage.bytes.toString("base64"),
        },
      },
      { text: prompt },
    ]);

    const parts = result.response.candidates?.[0]?.content?.parts ?? [];
    for (const p of parts) {
      const inline = (p as { inlineData?: { data: string; mimeType: string } })
        .inlineData;
      if (inline?.data) {
        return {
          bytes: Buffer.from(inline.data, "base64"),
          mimeType: inline.mimeType || "image/png",
        };
      }
    }
    throw new Error("Gemini returned no inline image data");
  }

  async generateImage({ prompt }: { prompt: string }): Promise<GeneratedImage> {
    const model = this.client.getGenerativeModel({ model: MODEL });
    const result = await model.generateContent([{ text: prompt }]);
    const parts = result.response.candidates?.[0]?.content?.parts ?? [];
    for (const p of parts) {
      const inline = (p as { inlineData?: { data: string; mimeType: string } })
        .inlineData;
      if (inline?.data) {
        return {
          bytes: Buffer.from(inline.data, "base64"),
          mimeType: inline.mimeType || "image/png",
        };
      }
    }
    throw new Error("Gemini returned no inline image data");
  }
}

/** Stub backend for local dev when GEMINI_API_KEY isn't set.
 *  Returns a tiny PNG so the pipeline runs end-to-end. */
class StubBackend implements ImageBackend {
  // 1x1 transparent PNG.
  private static placeholder = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64"
  );

  async editImage(): Promise<GeneratedImage> {
    return { bytes: StubBackend.placeholder, mimeType: "image/png" };
  }
  async generateImage(): Promise<GeneratedImage> {
    return { bytes: StubBackend.placeholder, mimeType: "image/png" };
  }
}

let _backend: ImageBackend | null = null;

export function imageBackend(): ImageBackend {
  if (_backend) return _backend;
  const key = process.env.GEMINI_API_KEY;
  _backend = key ? new GeminiBackend(key) : new StubBackend();
  return _backend;
}
