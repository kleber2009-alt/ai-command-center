import type { AvatarStyle } from "./styles";
import { STYLE_HINTS } from "./styles";

export function avatarPrompt(style: AvatarStyle) {
  return `Create a highly realistic cinematic AI portrait using the uploaded face.

Style: ${style}
Style hints: ${STYLE_HINTS[style]}

Requirements:
- preserve facial identity exactly
- premium lighting
- realistic skin (no plastic AI smoothing)
- cinematic composition
- vertical 4:5
- social-media ready
- no text
- no distortion
- subject centered, eyes to camera`;
}
