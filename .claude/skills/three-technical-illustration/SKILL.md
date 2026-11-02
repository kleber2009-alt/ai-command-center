---
name: three-technical-illustration
description: Three.js Technical Exploded Illustration — чистая техническая 3D-иллюстрация в разнесённом виде (exploded view) в стиле инженерных мануалов и каталогов продукта: светлый фон, белый/серебристый металл, тёмно-серый крепёж, редкие оранжевые и зелёные акценты, тонкие выноски, сетка, подписи-карточки. Делает рабочий веб-прототип на HTML/CSS/Three.js. Используй, когда просят «взрыв-схему», «exploded view», «разнесённый вид», «техническую 3D-иллюстрацию», «как в инженерном мануале», «схему устройства в 3D», «продукт в разборе» — для лендинга, карусели, рилса или интерактива.
---

# Skill: Three.js Technical Exploded Illustration

## Purpose
Create a clean, industrial, exploded-view 3D illustration inspired by technical manuals, engineering product sheets, and product cutaway diagrams. The target style is schematic, precise, and mechanically readable rather than photorealistic.

## Visual identity
- Background: off-white, near-white, or pale gray
- Mechanical parts: white, silver, gray materials
- Accent colors: orange and green used sparingly
- Overall look: technical manual / product catalog / exploded assembly sheet
- Avoid cinematic lighting and hyper-realistic materials
- Keep the image precise, minimal, and structured

## Core aesthetic
- Exploded view with parts separated along axes
- Clean, geometric primitives
- Thin helper lines, subtle grids, and technical labels
- Readable engineering composition
- Very light shadows or near-zero shadow contrast
- Design must feel “manufactured” and readable, not artistic or dramatic

## Recommended stack
- Three.js for 3D scene
- CSS overlay for labels and annotation cards
- SVG or canvas for guide lines and diagram details
- React Three Fiber if the project uses React
- Blender optional for concepting or form refinement

## Scene composition rules
1. Build the object from simple primitives:
   - cylinder
   - box
   - torus
   - disc
   - ring
   - capsule if needed
2. Separate large mechanism parts along X/Y/Z axes to create exploded effect
3. Reduce detail clutter; prioritize clean forms and structure
4. Use a near-white background and subtle guide grid
5. Add technical labels in overlay panels or near the object
6. Keep the object's assembly logic obvious and understandable

## Material behavior
- Base metal: white or light silver
- Dark metal: charcoal gray
- Orange accent: for key callouts or active hardware
- Green accent: for secondary status or supportive labels
- Prefer subtle metallic roughness and muted reflections
- Avoid glossy luxury finishes or dark dramatic materials

## Lighting
- Use neutral ambient light
- Add one soft directional light
- Keep shadows minimal and soft
- The model should remain legible and clean rather than dramatic

## Labeling style
- Labels should look like technical callouts
- Use uppercase or compact short labels
- Use white cards with thin borders or accent-colored blocks
- Position labels outside the object when possible
- Connect labels with thin guide lines
- Use small bars, numbers, or tiny shapes only if needed
- Avoid dense paragraph text

## Layout guidance
- Keep the center of the composition occupied by the technical assembly
- Place sidebar or corner labels for notes and callouts
- Use balance and spacing to feel like a product documentation page
- Maintain a “technical sheet” rhythm: object in center, labels around edges

## Implementation notes
### For Three.js
- Use MeshStandardMaterial
- Use GridHelper for subtle floor or reference geometry
- Use OrbitControls if the user wants interaction
- Use groups and `position.set(...)` to create exploded layouts
- Add subtle animation if needed, but keep it minimal

### For React Three Fiber
- Build a 3D group structure from reusable Part components
- Offset positions for exploded assembly
- Use HTML overlay for labels and details

## Good output characteristics
The final result should:
- feel mechanical and engineered
- have a clean exploded view
- use white/silver surfaces with controlled orange/green accents
- read like a technical product sheet
- maintain clear spatial structure
- avoid cinematic realism and over-stylized graphics

## Quality checklist
Before finalizing, verify:
- Background is light and uncluttered
- Object is clearly exploded and readable
- Materials are technical and restrained
- Labels are readable and compact
- The whole scene feels like technical documentation
- There are no excessive shadows or dramatic lighting effects

## Example prompt
"Create a clean exploded-view 3D technical illustration of a mechanical assembly inspired by industrial product manuals. Use a light-gray background, white and metallic parts, subtle orange and green highlight accents, and clean technical labels around the object. Keep the style precise, schematic, and engineered, like a product catalog or assembly diagram. Avoid realistic textures, heavy shadows, and cinematic lighting."

## Final instruction to the agent
Generate a functional 3D demo matching this style. Use a web-based implementation when possible, and prioritize a clean exploded technical illustration aesthetic over realism.

## Bundled resources
- `assets/template.html` — working starting point (Three.js 0.160 via unpkg, no build): 8-part exploded
  assembly, explode slider with intro animation, edge outlines, SVG leader lines from side-panel cards
  to projected anchors, mobile layout with numbered tags. URL flags: `?still=1` (no rotation/controls,
  for screenshot renders), `?explode=0.6` (fixed explode amount). Copy it, then replace `parts` and `labels`.
- `references/style-guide.md` — concrete values (hex colors, metalness/roughness, camera FOV, fonts),
  page layout sketch, and a step-by-step workflow incl. screenshot check via Playwright.
