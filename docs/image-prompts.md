# Image prompts for the Oriki Homes landing page

All property images on the site must be **AI-generated**, so that no real home, estate or listing is shown as being for sale by Oriki Homes. Generate each image below, save it with the exact filename in `web/img/`, and the page picks it up automatically. Until an image exists, its slot shows an "Image coming soon" placeholder.

**Tools:** Midjourney, DALL·E / ChatGPT, Ideogram, Flux or Gemini all work.
**Size:** landscape, **16:10** (e.g. 1600×1000). Export as JPG under about 400 KB.

## Shared style (paste at the end of every prompt)

> Photorealistic architectural photography, contemporary West African residential design, warm late-afternoon sunlight, soft long shadows, lush tropical landscaping (palms, bougainvillea, frangipani), clean paved roads, subtle warm earthy palette (terracotta, sand, off-white, charcoal accents), shot on a full-frame camera with a 24mm lens, natural colour grading. No people's faces, no text, no signage, no logos, no watermarks, no recognisable real buildings or landmarks.

## Estate images

| File | Prompt (add the shared style) |
|---|---|
| `estate-oriki-gardens.jpg` | Aerial drone view of a newly laid-out residential land estate in coastal Lagos, Nigeria: freshly graded red-earth plots divided by neat paved roads and kerbs, streetlights, a gated entrance arch without text, young palm trees along the boulevard, a few completed modern houses at the edge, green bush beyond, a distant lagoon glimpse. |
| `estate-adire-court.jpg` | Street-level view of a row of modern two-storey terrace houses in a gated estate in Ajah, Lagos: off-white render with terracotta brick feature walls, geometric screen panels inspired by adire textile patterns, small balconies with glass railings, interlocking-paved driveways, tidy front gardens, one house still with scaffolding to suggest ongoing construction. |
| `estate-ayo-residences.jpg` | Low-angle view of an elegant six-storey luxury apartment building in Lekki, Lagos: white and sand-coloured facade, deep wraparound balconies with timber soffits and planters spilling greenery, floor-to-ceiling glass, a rooftop terrace, a landscaped entrance court with a water feature, blue sky with light clouds. |
| `estate-zuma-heights.jpg` | A contemporary four-bedroom semi-detached duplex in an upscale Abuja neighbourhood on a gentle hillside: flat roofs, cantilevered upper floor, charcoal and cream facade with vertical timber louvres, large windows, a double carport with a gleaming SUV, manicured lawn, rocky green hills in the background. |

## Lifestyle and article images

| File | Prompt (add the shared style) |
|---|---|
| `life-rooftop.jpg` | Rooftop infinity pool of a modern Lagos apartment building at golden hour, loungers and potted palms, warm sunset sky over an out-of-focus city skyline. |
| `insight-offplan.jpg` | A modern residential building under construction in Lagos: concrete frame, scaffolding, a tower crane, workers in hard hats seen from behind at a distance, bright daylight. |
| `insight-diaspora.jpg` | A bright, stylish living room in a new Lagos home with a large window view of palm trees; a laptop on the coffee table shows a blurred video call, suggesting a virtual inspection. |
| `insight-landbank.jpg` | Aerial view of the Lekki-Epe corridor at golden hour: a highway running through green land with new estates appearing along it, the ocean on the horizon. |

## After generating

1. Put the files in `web/img/` using the exact names above.
2. Check each image for obvious AI artefacts (warped windows, melted railings) and anything that looks like a real, identifiable property. Regenerate if in doubt.
3. Keep the footer line "Property images are AI-generated and don't show real homes." on the page.
