// /play/video — Specialised studio for Kling 1.6 / 2.1 video tools.
// Routes prompts via /api/tools/{slug}/run where slug is picked dynamically
// based on mode (image-to-video vs text-to-video) and tier (STD / PRO).

import { VideoStudio } from "./VideoStudio";

export const dynamic = "force-dynamic";

export default function VideoStudioPage() {
  return <VideoStudio />;
}
