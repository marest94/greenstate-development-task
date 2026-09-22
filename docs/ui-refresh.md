# Public portal design refresh

Approved direction: Airbnb-inspired browsing with GreenState branding, illustrated banners, a detail gallery, and property maps. Implemented in `ui/property-browsing`, an isolated local checkout.

## Behavior

- Responsive image-led listing cards with original ratings, capacity, EUR pricing and saved-listing actions.
- Compact search preserves the existing URL filters, date validation and pagination. Back to listings retains the originating public search query.
- Three travel illustrations are assigned deterministically. They are explicitly labelled as illustrative; they are not photographs, location evidence, or representations of a property's amenities.
- Details include a native modal gallery with arrow keys, Escape, focus restoration and touch swipes. Desktop has a sticky summary; mobile has a compact price/date bar.
- A lazy-loaded Leaflet map places its marker at the supplied coordinates. No geocoding or visitor geolocation is used. Attribution and external location links remain visible; unavailable tiles produce a fallback message.
- Public map tiles come from `tile.openstreetmap.org`. The tile image request explicitly sends the site's origin as Referer. Review the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/) before production traffic and select an appropriate provider if needed. No security policy was relaxed.

## Artwork

Generated with the built-in image-generation tool. Project files: `apps/web/public/images/courtyard.jpg`, `townhouse.jpg`, and `alpine.jpg`. JPEG encoding keeps all three assets together under 2 MB. The supplied listing contracts remain unchanged; no upload system is introduced.

## Local preview and verification

Preview: http://localhost:8081/greenstate. The isolated Compose project is `greenstate-ui`, with web port 8081 and database port 54331. It contains the original demo inventory; the public browser tests are read-only.

Rebuild: `COMPOSE_PROJECT_NAME=greenstate-ui DATABASE_PORT=54331 WEB_PORT=8081 APP_ORIGIN=http://localhost:8081 docker compose up --build -d --wait`.

Verified: 236 API/web unit and component tests, repository type checks and lint, production Docker build, and six public portal browser cases across desktop and 375px mobile. Browser checks cover date searches, pagination/history, gallery keyboard/touch events, focus return, search-context restoration, overflow, and unavailable tiles. Live OSM tiles and mobile footer clearance were also inspected. Independent review findings were addressed. PostgreSQL integration and unrelated authenticated browser journeys were not rerun for this frontend change.

Prompts, in asset order:

1. Use case: illustration-story. Create a premium editorial travel illustration for an accommodation website, landscape 3:2. A sunlit Mediterranean courtyard with cream stone arches, olive tree, terracotta pottery, subtle turquoise glimpse of sea. Painterly gouache with paper texture, sophisticated architectural composition, warm cream and muted sage palette. Full bleed artwork, no text, no border, no people, no collage. Clearly an illustration, not a property photograph.
2. Use case: illustration-story. Create a premium editorial travel illustration for an accommodation website, landscape 3:2. A quiet European street with warm terracotta and pale ochre townhouses, tall windows, a corner cafe and leafy plane trees, long afternoon shadows. Painterly gouache with paper texture, sophisticated architectural composition, muted sage and warm peach palette. Full bleed artwork, no text, no border, no people, no collage. Clearly an illustration, not a property photograph.
3. Use case: illustration-story. Create a premium editorial travel illustration for an accommodation website, landscape 3:2. A serene alpine lake beneath layered green mountains, a small warm timber cabin among pines in the foreground and misty peaks beyond. Painterly gouache with paper texture, sophisticated composition, muted evergreen and pale blue palette with warm ochre accents. Full bleed artwork, no text, no border, no people, no collage. Clearly an illustration, not a property photograph.
