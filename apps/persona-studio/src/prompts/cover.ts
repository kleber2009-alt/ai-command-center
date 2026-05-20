export function coverPrompt(opts: {
  title: string;
  subtitle: string;
  cta: string;
}) {
  const { title, subtitle, cta } = opts;
  return `Create a premium Instagram carousel cover.

Use the provided AI avatar as the subject.

Headline:
${title}

Subtitle:
${subtitle}

CTA:
${cta}

Requirements:
- viral 4:5 composition
- bold typography (headline dominant)
- realistic face, preserve identity
- cinematic lighting
- premium modern aesthetic
- legible at thumbnail size
- leave bottom-right space for swipe affordance
- Instagram 4:5 (1080x1350)`;
}
