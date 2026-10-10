# StopWake 1.0 design spec: Direction A, calm transit utility

This spec goes with `docs/design/decisions.md` and must be followed. Every screen uses only the tokens and components defined here, and that includes the admin area. Sizes are in dp (React Native units) and colours are sRGB hex. When this spec and the current code disagree, follow this spec.

---

## 0. What changes from today

| Today (`docs/screenshots`) | 1.0 |
|---|---|
| Round floating back buttons and 30 px titles on every screen | `TopBar` on pushed screens, `LargeHeader` on tab roots |
| Settings: one shadowed card per setting, all 11 languages listed inline | Grouped `Section`s of rows. A value row opens a picker |
| Welcome: 11 language buttons squeezed into one row (broken layout) | A language chip that opens the Language list |
| Liberty base map with yellow roads, 3D buildings and POI icons | A calm recolour of the same style. Only stops and the trip carry colour |
| Search pill at the top, a static "Tap a stop" card, a cog as the only navigation | One `MapSheet` at the bottom (search, favourites, nearby stops, stop details) plus 4 tabs |
| Coloured glow shadows, radii from 10 to 28, chips 44+ tall | Flat buttons, 6 radii, 36 dp chips, 3 elevation levels |
| UPPERCASE letter-spaced labels | Sentence-case section headers. `PlanBadge` is the only uppercase text |
| `Alert.alert` | `Dialog` / `ConfirmDialog` |
| System font (Samsung and Xiaomi swap in their own fonts) | Inter, embedded at build time |
| Expo template app icon | StopWake icon (section 2.9) |

---

## 1. Design principles

1. **Map first, one thumb.** The map is home. Search, picking a stop, choosing when to wake and starting the alarm all happen inside the bottom 45 % of the screen, in the MapSheet. A rider holding a pole can do all of it with one thumb. The top of the screen is for reading (status, banners), never for primary actions.
2. **Two taps to sleep.** Tap a stop, then tap Start alarm. Defaults are smart: trains and S-Bahn wake by minutes, everything else by distance, and the last choice is remembered. Other options sit behind one disclosure row and never become a form.
3. **Readable half asleep.** Trip state can be read in one second at arm's length: one huge number, one status line, one colour. Numbers use tabular figures, are never truncated and never animate like tickers.
4. **Colour means something.** The chrome is ink on white, or graphite at night.
   - **Indigo** = you and your actions.
   - **Amber** = waking (the wake zone, ringing, Pro, favourites).
   - **Transport colours** = modes.
   - **Green, orange, red** = status only.

   Nothing else gets colour.
5. **Honest about reliability.** Say exactly what the alarm will do ("Rings about 2 min before you arrive") and show GPS health truthfully. Never promise certainty, and never show red unless something is actually wrong.
6. **Offline is normal.** Stops, search and alarms work without internet. Offline is shown once, quietly, and everything that can still work keeps working.
7. **One system, admin included.** One row, one sheet, one dialog, one button set. Admin screens are the same components, denser. Every admin change is confirmed, needs a reason and is logged.

---

## 2. Tokens

**Files**
- `src/ui/tokens.ts`: pure TypeScript with no `react-native` import. Holds colour (light and dark), type, space, radius, motion and layout values.
- `src/ui/colors.ts`: transport and map colours, still imported by `src/map/geo.ts` and the tests.
- `src/ui/theme.tsx`: `ThemeProvider` and `useTheme()`, which returns `{ scheme, color, type, space, radius, elevation(level), motion }`. The scheme is the system setting, overridden by Settings › Appearance.
- Hex literals appear only in these files.

### 2.1 Colour

#### Core tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#F4F6F9` | `#0B0F16` | Screen background behind grouped lists |
| `surface1` | `#FFFFFF` | `#131924` | Sections, cards, stat tiles |
| `surface2` | `#FFFFFF` | `#1A2130` | MapSheet, TabBar, scrolled TopBar, map controls, destination card |
| `surface3` | `#FFFFFF` | `#222A3A` | Dialogs, modal sheets |
| `fill` | `#EDF0F4` | `#222A39` | Inputs, segmented track, unselected choice chips, skeletons, icon circles |
| `fillPressed` | `#E2E6EC` | `#2B3445` | iOS pressed state of `fill` controls |
| `segmentThumb` | `#FFFFFF` | `#313B4D` | Selected segment |
| `inverseSurface` | `#1B2433` | `#E6EAF0` | Toast background |
| `onInverse` | `#F1F4F8` | `#121826` | Toast text and icons |
| `inversePrimary` | `#A9AEFF` | `#4146D8` | Toast action label |
| `scrim` | `rgba(11,15,22,0.48)` | `rgba(0,0,0,0.60)` | Behind dialogs and modal sheets |
| `text` | `#0E1726` | `#EDF1F7` | Primary text and icons |
| `textSecondary` | `#4D5B70` | `#A8B3C3` | Subtitles, values, **placeholders**, inactive tabs |
| `textTertiary` | `#646F82` | `#8C97A9` | Meta, timestamps, footnotes, chevrons (never on `fill`) |
| `textDisabled` | `#A3ADBB` | `#566274` | Disabled labels |
| `onColor` | `#FFFFFF` | `#FFFFFF` | Text and icons on transport colours and KindIcons |
| `border` | `#E3E7ED` | `#283141` | Hairline dividers, outlined cards |
| `borderStrong` | `#C5CCD6` | `#3A4558` | Outline buttons, filter chips, switch track when off, sheet grabber |
| `fieldBorder` | `#E3E7ED` | `#3A4558` | Resting TextField border |
| `focus` | `#4146D8` | `#8E94FF` | Focused field border, keyboard focus ring |
| `primary` | `#4146D8` | `#8E94FF` | StopWake indigo: primary buttons, links, selection, your position |
| `primaryPressed` | `#3539C2` | `#7C83F5` | iOS pressed primary |
| `onPrimary` | `#FFFFFF` | `#0B0F16` | Label on primary |
| `primarySoft` | `#E9EAFE` | `#262C5C` | Tonal buttons, tab indicator, info banners, avatar fill |
| `primarySoftPressed` | `#DCDEFD` | `#30376E` | iOS pressed tonal |
| `onPrimarySoft` | `#2F33B8` | `#C9CCFF` | Text and icons on `primarySoft` |
| `accent` | `#FFB020` | `#FFB547` | Amber: ringing, Pro badge, filled favourite star, wake zone |
| `onAccent` | `#2A1B00` | `#2A1B00` | Text on amber |
| `accentSoft` | `#FFF3D6` | `#3A2C0C` | Promo banner, Pro hero circle |
| `accentInk` | `#8A5300` | `#FFC56B` | Amber text and icons on surfaces and on `accentSoft` |
| `success` | `#16803C` | `#5BD38A` | OK states, "On time" |
| `successSoft` / `onSuccessSoft` | `#E7F5EC` / `#0F5F2C` | `#12301F` / `#8FE5B0` | Success badges and banners |
| `warning` | `#C2410C` | `#FF9A57` | Weak GPS, estimates, recommended fixes (orange, deliberately different from amber) |
| `warningSoft` / `onWarningSoft` | `#FFEFE5` / `#8F2F08` | `#3D2112` / `#FFC9A3` | Warning badges and banners |
| `danger` | `#D92D20` | `#FF6B5E` | Errors, destructive actions |
| `dangerPressed` / `onDanger` | `#BE2A1E` / `#FFFFFF` | `#F2584B` / `#0B0F16` | Filled danger button |
| `dangerSoft` / `onDangerSoft` | `#FDECEA` / `#A3231A` | `#3B1614` / `#FFB4AB` | Danger badges and banners |
| `ripple` | `rgba(14,23,38,0.12)` | `rgba(237,241,247,0.16)` | `android_ripple.color` |
| `pressed` | `rgba(14,23,38,0.06)` | `rgba(237,241,247,0.08)` | iOS pressed overlay on transparent controls |
| `shadow` | `#0E1726` | `#000000` | iOS `shadowColor` |
| `overlayBorder` | `transparent` | `rgba(255,255,255,0.08)` | 1 px border on elevated items over the map (dark mode only) |

**Measured contrast (WCAG)**
- `text` on `bg`: 16.6 light, 16.9 dark.
- `textSecondary`: at least 6.0 on every surface and on `fill`.
- `textTertiary`: at least 4.7 on `bg` and surfaces in light, at least 4.9 in dark. It drops to 4.4 on light `fill`, which is why placeholders use `textSecondary`.
- White on `primary`: 6.8. `onPrimary` on dark `primary`: 7.2.
- White on every transport colour below: at least 4.7.
- `accentInk` on `accentSoft`: 5.7. `warning` on white: 5.2. `danger` on white: 4.8.

#### Transport colours (identical in light and dark, so riders recognise them)

| Mode | Badge text | Fill | Kind | Kind icon (MDI) | Spoken label |
|---|---|---|---|---|---|
| ICE | `ICE` | `#E3001B` | train | `train` | "ICE" |
| IC / EC | `IC` | `#E3001B` | train | `train` | "IC" |
| RE / RB | `RE` | `#9E1B32` | train | `train` | "Regional train" |
| Train (outside DE) | `mode.train` (i18n) | `#E3001B` | train | `train` | "Train" |
| S-Bahn | `S` (circle) | `#00854A` | sbahn | `train-variant` | "S-Bahn" |
| U-Bahn | `U` (square) | `#1565C0` | ubahn | `subway-variant` | "U-Bahn" |
| Metro (outside DE/AT/CH/LU) | `mode.metro` (i18n) | `#1565C0` | metro | `subway-variant` | "Metro" |
| Tram | `mode.tram` (i18n) | `#C9480A` | tram | `tram` | "Tram" |
| Bus | `mode.bus` (i18n) | `#8E24AA` | bus | `bus` | "Bus" |
| Ferry | `mode.ferry` (i18n) | `#007D8A` | ferry | `ferry` | "Ferry" |
| Other stop | — | `#546E7A` | other | `map-marker` | "Stop" |
| Address or pin | — | `primary` (theme) | place | `map-marker` | "Place" |

Three colours change slightly from today so that white badge text reaches 4.5:1. S-Bahn goes from `#008D4F` to `#00854A`, tram from `#E8590C` to `#C9480A` and ferry from `#0097A7` to `#007D8A`. Update both `KIND_COLOR` and `BADGE_COLOR`.

#### Map palette (for the base-map recolour in 2.1.1)

| Token | Light | Dark |
|---|---|---|
| `map.land` (background) | `#F2F3F5` | `#121821` |
| `map.landuse` | `#ECEEF1` | `#151C26` |
| `map.park` | `#DCEBD8` | `#15251D` |
| `map.water` | `#C4DCF4` | `#0D2136` |
| `map.building` / `map.buildingLine` | `#E2E5EA` / `#D5D9E0` | `#1B2230` / `#232B38` |
| `map.road` (minor, street, service) | `#FFFFFF` | `#222A36` |
| `map.roadMajor` (trunk, primary, secondary, tertiary, link) | `#FFFFFF` | `#2A3342` |
| `map.motorway` | `#FFFFFF` | `#333D4F` |
| `map.casing` / `map.casingMajor` | `#D9DDE3` / `#C8CED7` | `#0F141C` / `#0B1017` |
| `map.rail` / `map.railTunnel` | `#9AA2AE` / `#C3C9D2` | `#4A5466` / `#343C4C` |
| `map.path` | `#FFFFFF` | `#252E3C` |
| `map.boundary` | `#A3A9B3` | `#4A5568` |
| `map.labelPlace` / `map.labelMinor` | `#27303F` / `#556070` | `#D6DCE5` / `#A3AEBD` |
| `map.labelRoad` / `map.labelWater` | `#6B7480` / `#4E74A0` | `#8A95A5` / `#6F93BC` |
| `map.halo` | `#FFFFFF` | `#0E131A` |
| `map.stopStroke` (width) | `#FFFFFF` (2) | `#E8ECF2` (1.5) |
| `map.stopLabelMajor` / `Mid` / `Minor` | `#111827` / `#263041` / `#3A4556` | `#F1F4F8` / `#D5DCE6` / `#B8C2CF` |
| `map.zoneFill` | `rgba(255,176,32,0.16)` | `rgba(255,181,71,0.20)` |
| `map.zoneLine` (3.4:1 on land) | `#B87400` | `#FFB547` |
| `map.trail` | `primary` at 0.85 opacity | `primary` at 0.9 opacity |
| `map.ahead` (dotted line to the stop) | `#646F82` at 0.7 | `#8C97A9` at 0.7 |
| `map.placeholder` (before tiles load) | `#EEF0F3` | `#121821` |

##### 2.1.1 Calm map recolour

**Where it lives:** `prepareStyle(style, lang, scheme)` in `src/map/style.ts`. It stays a pure function and gets a Vitest snapshot.

**How it works:** the source style URL stays Liberty, so offline packs and caches keep working. Only `paint`, `layout.visibility` and `filter` change. The rules match OpenFreeMap Liberty layer ids. Any id that matches no rule is left untouched.

| Layer ids | Override |
|---|---|
| `background` | `background-color: map.land` |
| `natural_earth` | Light: `raster-opacity` capped at 0.25. Dark: `visibility: none` |
| `park`, `landcover_wood`, `landcover_grass`, `landuse_pitch`, `landuse_track`, `landuse_cemetery` | `fill-color: map.park`, `fill-outline-color: map.park` (wood and grass keep `fill-opacity` 0.6) |
| `landuse_residential`, `landuse_hospital`, `landuse_school`, `landcover_sand`, `landcover_ice`, `aeroway_fill` | `fill-color: map.landuse` |
| `water`, `waterway_*` | `fill-color` / `line-color: map.water` |
| `building` | `fill-color: map.building`, `fill-outline-color: map.buildingLine` |
| `building-3d`, `park_outline`, `road_one_way_arrow*`, `poi_r20`, `poi_r7` | `visibility: none` |
| `landcover_wetland`, `road_area_pattern` | Dark only: `visibility: none` |
| `*_casing` whose id contains `motorway`, `trunk_primary`, `secondary_tertiary` or `link` | `line-color: map.casingMajor` |
| All other `*_casing` | `line-color: map.casing` |
| `*_motorway`, `*_motorway_link` (not casings) | `line-color: map.motorway` |
| `*_trunk_primary`, `*_secondary_tertiary`, `*_link` | `line-color: map.roadMajor` |
| `*_minor`, `*_street`, `*_service_track`, `aeroway_runway`, `aeroway_taxiway` | `line-color: map.road` |
| `*_path_pedestrian` | `line-color: map.path` |
| `*_major_rail*`, `*_transit_rail*` | `line-color: map.rail` (`tunnel_*`: `map.railTunnel`) |
| `boundary_*` | `line-color: map.boundary` |
| `label_city*`, `label_town`, `label_state`, `label_country_*` | `text-color: map.labelPlace`, `text-halo-color: map.halo`, `text-halo-width: 1.5` |
| `label_village`, `label_other`, `poi_r1`, `airport` | `text-color: map.labelMinor`, halo as above. POIs also get `icon-opacity: 0.7` |
| `highway-name-*` | `text-color: map.labelRoad`, halo |
| `water_name_*`, `waterway_line_label` | `text-color: map.labelWater`, halo |
| `poi_transit` | Keep the existing filter (airports only) |

**StopWake's own layers**
- Stop circles: `circle-stroke-color` and `circle-stroke-width` come from `map.stopStroke`.
- Stop labels: `map.stopLabel*` with halo `map.halo`, width 1.6.
- Home map: rotation and pitch are disabled (`rotateEnabled={false}`, `pitchEnabled={false}`), so no compass is needed.
- Trip map: rotation and pitch are also off.
- The map style switches when the colour scheme changes.

#### Chart colours (admin only)

| Series | Light | Dark |
|---|---|---|
| Free | `#A3ADBB` | `#566274` |
| Monthly | `#A5A8F0` | `#4F55B8` |
| Yearly | `#4146D8` | `#8E94FF` |
| Lifetime | `#FFB020` | `#FFB547` |
| Granted (grants and codes) | `#16803C` | `#5BD38A` |

Segments of a stacked bar are separated by a 2 px gap in the surface colour. Every chart has a legend with numbers, so colour is never the only cue.

#### Colour rules

- At most one filled `primary` button per screen region (screen body, sheet, dialog).
- Transport colours appear only in `ModeBadge`, `KindIcon`, `StopPin` and map stop dots.
- The wake zone is always amber, both the home preview and the live trip. Your trail and position are always indigo.
- Status colours are never decorative.

### 2.2 Typography

**Font: Inter 4.1 (SIL OFL 1.1)**
- Use the static TTFs from the official release (github.com/rsms/inter, `extras/ttf/`). Their family name is `Inter`. Do not use the Google Fonts "Inter 18pt" instances, whose family name differs.
- Files: `assets/fonts/Inter-Regular.ttf`, `Inter-Medium.ttf`, `Inter-SemiBold.ttf`, `Inter-Bold.ttf` (about 1.2 MB in total). Add the OFL to Licences.
- Why embed a font: Samsung, Xiaomi and OPPO replace the system font, and users can pick novelty fonts. Without our own font, layouts, number widths and screenshots differ on every phone.

`app.json` → `plugins`:

```json
["expo-font", {
  "android": { "fonts": [{ "fontFamily": "Inter", "fontDefinitions": [
    { "path": "./assets/fonts/Inter-Regular.ttf", "weight": 400 },
    { "path": "./assets/fonts/Inter-Medium.ttf", "weight": 500 },
    { "path": "./assets/fonts/Inter-SemiBold.ttf", "weight": 600 },
    { "path": "./assets/fonts/Inter-Bold.ttf", "weight": 700 }
  ] }] },
  "ios": { "fonts": [
    "./assets/fonts/Inter-Regular.ttf", "./assets/fonts/Inter-Medium.ttf",
    "./assets/fonts/Inter-SemiBold.ttf", "./assets/fonts/Inter-Bold.ttf"
  ] }
}]
```

- The expo-font 57 plugin turns the Android entry into an XML font family registered with `ReactFontManager`. `fontFamily: 'Inter'` plus `fontWeight: '600'` then picks the right file on both platforms.
- There is no runtime `useFonts` call and no splash-screen wait.
- The native `AlarmActivity` loads `resources.getIdentifier("xml_inter", "font", packageName)` through `ResourcesCompat.getFont` and falls back to `Typeface.DEFAULT_BOLD`.
- Map labels keep the map's own Noto glyphs.

**Type scale** (letter spacing follows Inter's dynamic metrics, in dp)

| Token | Size | Line height | Weight | Tracking | maxFontSizeMultiplier | Use |
|---|---|---|---|---|---|---|
| `display` | 32 | 38 | 700 | -0.7 | 1.5 | Onboarding, Paywall, Arrived and Redeem headlines |
| `titleL` | 26 | 32 | 700 | -0.5 | 1.6 | LargeHeader titles (Saved, Activity, Account) |
| `titleM` | 20 | 26 | 600 | -0.3 | 1.8 | Stop name in the sheet, dialog titles, profile name in admin |
| `titleS` | 17 | 22 | 600 | -0.2 | 2.0 | TopBar title, card titles, sheet section titles |
| `bodyL` | 16 | 22 | 400 | -0.2 | 2.0 | Row titles (at weight 500), key sentences |
| `bodyM` | 15 | 20 | 400 | -0.1 | 2.0 | Default text, row subtitles, banners |
| `bodyS` | 13 | 18 | 400 | 0 | 2.0 | Captions, helper and error text, legal, meta |
| `labelL` | 16 | 20 | 600 | -0.2 | 1.6 | Button L and M labels |
| `labelM` | 14 | 18 | 600 | -0.1 | 1.4 | Chips, segments, Button S, SectionHeader |
| `labelS` | 12 | 16 | 600 | 0 | 1.3 | Tab labels, badges, overlines |
| `numXL` | 44 | 48 | 700 | -1.0 | 1.2 | Trip distance |
| `numL` | 30 | 36 | 700 | -0.6 | 1.3 | ETA, StatTile value |
| `numM` | 20 | 24 | 600 | -0.3 | 1.4 | Prices, KPI values, compact stats |

**Rules**
- Tabular figures: `fontVariant: ['tabular-nums']` on every `num*` token and on any number that updates live or sits in a column (distance, ETA, clock times, accuracy, countdowns, table prices, admin counts, user IDs).
- Android vertical metrics: `includeFontPadding: false` on every `AppText`. Inside fixed-height controls, also set `textAlignVertical: 'center'`.
- Hindi: line height × 1.25 and letter spacing 0. Japanese: line height × 1.15 and letter spacing 0. Both scripts fall back to the system Noto fonts. `AppText` applies this centrally from `useI18n().lang`.
- Font scale: everything must work at a system font scale of 1.3, and body text at 2.0. Rows and cards grow. Only controls have fixed sizes, set as `minHeight`.
- Truncation:
  - Stop names: up to 2 lines in headers, 1 line with a tail ellipsis in rows and chips.
  - Numbers never truncate. `numXL` and `numL` may shrink (`adjustsFontSizeToFit`, `minimumFontScale` 0.8).
- Sentence case everywhere. `textTransform: 'uppercase'` is allowed only in `PlanBadge`, for Latin scripts.
- English copy uses British spelling (favourites, kilometres), as today.

### 2.3 Spacing and layout

`space` follows a 4-point scale with Tailwind-style keys: `space[0.5]=2, [1]=4, [2]=8, [3]=12, [4]=16, [5]=20, [6]=24, [8]=32, [10]=40, [12]=48, [16]=64`. No other spacing values are allowed.

| Layout constant | Value |
|---|---|
| Screen gutter (left and right) | 16 |
| Gap between grouped sections | 24 (SectionHeader top padding) |
| Card and section inner padding | 16 |
| Row padding | 12 vertical, 16 horizontal |
| Gaps: leading to text / text to trailing / icon to label | 16 / 12 / 8 |
| TopBar height (below the status bar) | 56 |
| TabBar height (above the bottom inset) | 64 |
| MapSheet grabber zone | 24 |
| Control heights: Button L, M, S / TextField / SearchField / Chip / Segmented | 56, 48, 36 / 52 / 48 / 36 / 44 |
| IconButton: visual / hit area | 40 / 48. Map control 48 / 48 |
| Content max width (tablets, foldables) | 600, centred |
| StickyFooter | Padding 16, plus the bottom inset when no tab bar is visible |

### 2.4 Radius

| Token | Value | Use |
|---|---|---|
| `xs` | 4 | ModeBadge (rectangles), progress track, skeleton text lines |
| `sm` | 8 | Button S, ID chip, inner segment shapes, skeleton blocks |
| `md` | 12 | Buttons L and M, TextField, SearchField, Banner, Toast, rule pill |
| `lg` | 16 | Cards, Sections, PlanCards, StatTiles, TripBar, destination card |
| `xl` | 24 | MapSheet top corners, Dialog, modal sheets (iOS `sheetCornerRadius`), onboarding panels |
| `pill` | 999 | Chips, Badges, PlanBadge, avatars, map controls, tab indicator, offline pill |

### 2.5 Elevation

Use `elevation(level)` from the theme. It returns Android `elevation` or the iOS shadow props, and in dark mode adds a border. Do not use `boxShadow`, so there is only one recipe. Android elevation needs an opaque `backgroundColor` on the same view.

| Level | Android | iOS (`shadowColor: shadow`) | Dark-mode addition | Used for |
|---|---|---|---|---|
| 0 | 0 | none | — | Everything on `bg`: Sections, Cards, StatTiles |
| 1 | 2 | opacity 0.08, radius 4, offset (0, 1) | `overlayBorder` 1 px | Map banners and pills, segmented thumb (light only) |
| 2 | 6 | opacity 0.14, radius 10, offset (0, 3) | `overlayBorder` 1 px | Map controls, destination card, TripBar |
| 3 | 16 | opacity 0.18, radius 24, offset (0, 8). MapSheet uses offset (0, -4) | Top hairline `border` | MapSheet, Dialog, Toast |

In dark mode, depth comes from the surface steps (`surface1` → `surface2` → `surface3`), because Android shadows barely show.

### 2.6 Icons

- **Set:** MaterialCommunityIcons only, through the existing direct import. Every icon name used in this spec exists in `@expo/vector-icons` 15.1.
- **Style:** outline glyphs by default. Use the filled glyph only for on or selected states: active tab, favourite on, selected radio.
- **Sizes:** `icon.xs` 16 (inside chips, badges, captions), `sm` 20 (Buttons M and S, row trailing items, banners), `md` 24 (default: TopBar, TabBar, IconButton, row leading), `lg` 32 (headers, empty states), `xl` 48 (success screens).
- **Glyph names**
  - Tabs: `map-outline` / `map`, `star-outline` / `star`, `timeline-clock-outline` / `timeline-clock`, `account-circle-outline` / `account-circle`.
  - Kinds: as in the transport table.
  - Actions:
    - Navigation: `arrow-left`, `close`, `chevron-right`, `chevron-down`, `chevron-up`, `magnify`, `dots-vertical`.
    - Location: `crosshairs`, `crosshairs-gps`, `crosshairs-off`.
    - Alarm: `alarm`, `bell-ring-outline`, `alarm-light`, `alarm-snooze`.
    - Plan and admin: `crown`, `crown-outline`, `lock-outline`, `gift-outline`, `swap-horizontal`, `calendar-clock`, `ticket-percent-outline`, `cash-multiple`, `application-cog-outline`, `shield-crown-outline`, `shield-account-outline`, `account-cancel-outline`, `delete-forever-outline`, `note-text-outline`.
    - Status: `wifi-off`, `check-circle`, `alert-circle-outline`, `alert-outline`, `information-outline`, `bullhorn-outline`.
    - Other: `content-copy`, `share-variant-outline`, `play-circle-outline`, `stop-circle-outline`, `flag-checkered`.

### 2.7 Touch targets and ergonomics

- Every tappable element is at least 48 × 48. Extend small visuals with `hitSlop` up to 48.
- Trip-critical actions are full-width and at least 56 tall: Start alarm, the alarm's dismiss and snooze, "Not yet, keep tracking". Exception: End trip is a 48-tall M button, kept deliberately weaker.
- Adjacent targets are at least 8 apart. Destructive actions are never directly next to the primary action: at least 16 apart, or in a different row or section.
- Primary actions live in the bottom 45 % of the screen. Top corners hold only back, close, Restore and overflow menus.
- Map stop dots: `hitbox` 16 on each side, up from 14. Long-press is never the only way to do something; dropping a pin is also in search mode.
- Nothing time-critical depends on a gesture. Every drag action (sheets) has a tap or back-button equivalent.

### 2.8 Motion and haptics

| Token | Value | Use |
|---|---|---|
| `duration.fast` | 120 ms | Pressed states, toggles, colour changes |
| `duration.base` | 200 ms | Fades, segment thumb, chip selection, toast in, tab bar hide and show |
| `duration.slow` | 280 ms | Sheet mode changes, banner slide-in, onboarding page change |
| `duration.camera` | 600 ms | Map `flyTo`. Trip camera refit 800 ms (unchanged) |
| `easing.standard` | `Easing.bezier(0.2, 0, 0, 1)` | Everything that moves within the screen |
| `easing.enter` | `Easing.bezier(0, 0, 0, 1)` | Things appearing |
| `easing.exit` | `Easing.bezier(0.3, 0, 1, 1)` | Things leaving (about 150 ms) |
| `spring.sheet` | `{ damping: 26, stiffness: 300, mass: 1 }`, using the gesture's release velocity | MapSheet snaps |

- Use `useNativeDriver: true` for every animation. Animate only `transform` and `opacity`. Progress bars use `scaleX` with `transformOrigin: 'left'`.
- No scale-on-press, no bounce and no number tickers. Live values simply change.
- Reduced motion (`AccessibilityInfo.isReduceMotionEnabled()` plus its change listener): every duration becomes 0, springs become instant, skeletons are static at 0.8 opacity and `flyTo` uses duration 0.
- Haptics (expo-haptics):
  - `selectionAsync` on segment, chip and tab changes.
  - `impactAsync(Medium)` when an alarm starts.
  - `notificationAsync(Success)` on Arrived, purchase success, redeem success and admin save.
  - `notificationAsync(Warning)` on validation errors and when a required permission is missing.
  - Never on scroll or on map pans.

### 2.9 App icon and splash

- **Adaptive icon:** background `#4146D8`. Foreground: a white rounded map pin (66 % of the safe zone) holding an amber `#FFB020` half-sun (a sunrise arc) whose flat edge sits on a white 6 % stroke "horizon". Monochrome: the pin silhouette with the arc cut out.
- **Splash:** background `#4146D8` in light and `#0B0F16` in dark, with the white pin glyph at 96 dp.
- Replace `assets/icon.png`, `android-icon-*` and `splash-icon.png`, and set `adaptiveIcon.backgroundColor` to `#4146D8`.

---

## 3. Components (`src/ui/components/*`)

Shared rules for every component:
- **Pressed feedback:** on Android, `android_ripple={{ color: ripple, foreground: true }}` (borderless for standard IconButtons). On iOS, swap to the `*Pressed` colour or the `pressed` overlay.
- **Accessibility:** every interactive component takes `accessibilityLabel` (required for icon-only controls), `accessibilityRole` and `accessibilityState`.
- **Retiring today's components:** `Title`, `Heading`, `Label` and `Body` become `AppText` variants. `Row` becomes `ListItem`, `Segmented` becomes `SegmentedControl` and `ModeBadges` becomes `ModeBadgeRow`. `StatusDot` and `Divider` disappear; their roles move into `Badge` and `Section`.

### 3.1 AppText
- **Props:** `variant` (token, default `bodyM`), `color` (token name, default `text`), `weight?` (`regular | medium | semibold | bold`), `align`, `numberOfLines`, `tabular?` (default true for `num*`), `selectable?`.
- **Style:** `fontFamily: 'Inter'` with the token's size, line height, weight and tracking, `includeFontPadding: false`, `maxFontSizeMultiplier` from the table, and the Hindi and Japanese adjustments.
- **Accessibility:** `display` and `title*` set `accessibilityRole="header"`.

### 3.2 Button
**Anatomy:** a container with an optional leading icon and a label. The label allows `numberOfLines={2}`, is centred and grows the button (`minHeight`, never a fixed height).

**Sizes**

| Size | Height | Horizontal padding | Radius | Label | Icon | Gap |
|---|---|---|---|---|---|---|
| L | 56 | 24 | `md` 12 | `labelL` | 22 | 8 |
| M | 48 | 20 | `md` 12 | `labelL` | 20 | 8 |
| S | 36 (hit area 48) | 14 | `sm` 8 | `labelM` | 18 | 6 |

**Variants**

| Variant | Background | Label | Border | Used for |
|---|---|---|---|---|
| `primary` | `primary` | `onPrimary` | — | One per region: Start alarm, Continue, Save |
| `secondary` (tonal) | `primarySoft` | `onPrimarySoft` | — | Supporting actions: Allow, Play, Manage subscription |
| `outline` | transparent | `text` | 1 px `borderStrong` | Neutral alternatives |
| `ghost` | transparent | `primary` | — | Cancel, See all, Restore, links |
| `danger` | `danger` | `onDanger` | — | Final destructive confirmations |
| `dangerOutline` | transparent | `danger` | 1 px `borderStrong` | End trip, Revoke |
| `onAccent` | `#0E1726` | `#FFFFFF` (both themes) | — | Only on amber surfaces (AlarmCard, ringing TripBar) |

**States**
- Pressed: ripple on Android. On iOS, `primaryPressed`, `primarySoftPressed` or `dangerPressed`, or the `pressed` overlay for transparent variants.
- Disabled: background `fill` (transparent variants keep a transparent background), label `textDisabled`, border `border`, no ripple. Never use opacity for disabled.
- Loading: an `ActivityIndicator` (20, in the label colour) replaces the content. The button keeps the width it measured on layout, sets `accessibilityState.busy` and ignores presses.
- Keyboard focus: a 2 px `focus` ring, offset 2.

**Layout**
- Buttons are full width (`block`) in footers, sheets and cards.
- Inline pairs: secondary on the left, primary on the right.
- Labels start with a verb and are at most 3 words where possible.
- No coloured shadows.

### 3.3 IconButton
**Variants**
- `standard`: transparent, 24 icon in `text` or `textSecondary`.
- `tonal`: `fill` circle, 40 visual.
- `filled`: `primary` circle with an `onPrimary` icon.
- `map`: `surface2` circle, 48 visual, elevation 2.

**Sizes:** 40 visual with `hitSlop` 4 (48 hit). `map` is 48.

**States**
- Pressed: borderless ripple of radius 24 for `standard`, a bounded ripple for the others.
- Selected toggle: filled glyph, for example the favourite star becomes `star` in `accent`, with `accessibilityState.selected`.
- Disabled: icon `textDisabled`.
- Loading: a 20 spinner in `primary`.
- Badge: an 8 dp `danger` dot at the top right with a 2 px ring in the surface colour.

`accessibilityLabel` is required.

### 3.4 Card
- **Style:** `surface1`, radius `lg`, padding 16, gap 12, elevation 0, no border.
- **Variants:** `outlined` (1 px `border`), `raised` (elevation 1, only over the map), `pressable` (the whole card is one target with a ripple and an optional trailing chevron).
- **Slots:** header (`titleS` plus an optional trailing Badge or IconButton), body (`bodyM`, `textSecondary`), actions (Buttons M, gap 8, either `block` or right-aligned).

### 3.5 ListItem (row)
**Anatomy**
- Leading slot: a 24 icon in `textSecondary`, a 40 `KindIcon` or `Avatar`, a 28 flag in a 40 box, or a 24 radio or check.
- Text column:
  - Title: `bodyL`, weight 500, 1 or 2 lines.
  - Subtitle: `bodyM`, `textSecondary`, 1 or 2 lines.
  - Optional meta row: ModeBadges and town or time in `bodyS` `textTertiary`, gap 4.
- Trailing slot: `chevron-right` 20 in `textTertiary`, a value (`bodyM` `textSecondary`, at most 40 % of the width, ellipsis), a Switch, a Badge, an IconButton, a numeric value (`labelM` tabular `textSecondary`) or a 20 spinner.

**Sizes:** the default has a minimum height of 56 (one line), 64 (two lines) or 72 or more (with a badge row), with 12/16 padding. `dense` (admin lists and pickers) has a minimum height of 48, 8/16 padding and the title in `bodyM` at weight 500.

**States**
- Pressed: a full-bleed ripple, clipped by the Section.
- Disabled: title and subtitle in `textDisabled`, leading at 0.5 opacity.
- Selected: a trailing `radiobox-marked` or `check` in `primary` (no background change).
- Destructive: title and icon in `danger`.
- Pro-locked: a trailing `PlanBadge sm`. Tapping opens the Paywall.

**Dividers:** a hairline `border`, inset from 16 + leading width + 16 to the right edge. No divider after the last row.

**Accessibility:** the whole row is one element. Its label is title, subtitle and trailing value. Its role is button, switch or radio.

### 3.6 SectionHeader
- **Text:** `labelM`, `textSecondary`, sentence case. Optional count: "Favourites · 2 of 3".
- **Padding:** 24 top (16 for the first one on a screen), 8 bottom, 32 on the left (aligned with the section's inner padding).
- **Optional trailing action:** a ghost Button S ("Clear", "See all", "Edit").
- **Inside the MapSheet:** headers use `titleS` in `text` with 16 left padding, because the sheet itself is the surface.

### 3.7 Section (grouped list)
- **Style:** `surface1` container, radius `lg`, 16 horizontal margin, `overflow: 'hidden'` (clips ripples), no shadow. Rows sit inside it with inset dividers.
- **Footer note:** `bodyS` `textTertiary`, 8 top padding, 32 horizontal.
- **Loading:** 3 SkeletonRows inside the container.
- **Empty:** an inline EmptyState inside the container.
- **Inside the MapSheet and modal sheets:** sections are full-bleed (no container) and rows sit directly on the sheet.

### 3.8 TextField
**Anatomy**
- Label: `labelM` `textSecondary`, always visible above the field with a 6 gap. No floating labels.
- Field: minimum height 52, radius `md`, background `fill`, 1 px `fieldBorder`, 16 horizontal padding. With a leading 20 icon in `textSecondary`, the padding is 12 and the gap 8.
- Input text: `bodyL` in `text`. Placeholder: `textSecondary`.
- Trailing: `close-circle` 20 to clear, a secure eye toggle (`eye-outline` / `eye-off-outline`, a standard IconButton with the label "Show password" / "Hide password"), or a unit (`bodyM` `textSecondary`, for example "CHF").
- Helper or error line, 6 below: `bodyS` `textTertiary`, or `danger` with an `alert-circle-outline` 16 icon.

**States**
- Focused: 2 px `focus` border, background `surface1`.
- Error: 2 px `danger` border, the error line, and the error is announced.
- Disabled: `textDisabled` text on `fill`.
- Read-only: transparent background, 1 px `border`, optional copy button.

**Variants**
- `multiline`: minimum height 104, up to 5 visible lines, counter "84/140" (`bodyS` `textTertiary`) at the right.
- `decimal`: `keyboardType="decimal-pad"`, tabular figures.
- `code`: `autoCapitalize="characters"`, `autoCorrect={false}`, letter spacing 1, tabular figures.
- `DateField`: see 3.29.

**Behaviour**
- Set `textContentType` and `autoComplete`: email `emailAddress` / `email`; password `password` / `current-password`; new password `newPassword` / `new-password`; reset code `oneTimeCode` / `one-time-code`.
- `returnKeyType` is `next`, or `done` on the last field.
- Validate on blur and on submit, not on every keystroke. An error clears as soon as the user edits the field.

### 3.9 SearchField
- **`sheet` variant (MapSheet):** height 48, radius `md`, background `fill`, `magnify` 22 in `textSecondary` at 12, placeholder `bodyL` `textSecondary` ("Where are you going?"). In browse mode it is a button that switches the sheet to search mode. In search mode it is a focused `TextInput` with a clear button, and an `arrow-left` IconButton replaces the magnifier.
- **`inline` variant (Countries, admin lists):** height 44, radius `md`, `fill`, `magnify` 20, placeholder `bodyM`, clear button, 250 ms debounce. Pinned under the TopBar.

### 3.10 Badge
- **Style:** pill, height 20 (`sm` 18), 8 horizontal padding (6 for counts, minimum width 20), `labelS`. Optional leading 6 dp dot in the strong tone colour, or a 12 icon.
- **Tones** (background / text): `neutral` `fill` / `textSecondary`, `primary` `primarySoft` / `onPrimarySoft`, `success`, `warning`, `danger` (each its soft / on-soft pair), `accent` `accentSoft` / `accentInk`.
- **Dot badge:** 8 × 8 `danger` with a 2 px ring in the surface colour, used on tab icons and avatars.

### 3.11 Chip
- **Style:** height 36 (`hitSlop` 6 vertical, giving 48), radius `pill`, 14 horizontal padding (12 with a leading element), gap 6, `labelM`, 16 icon or 20 KindIcon.

**Variants**

| Variant | Unselected | Selected | Used for |
|---|---|---|---|
| `choice` (single-select) | `fill` / `text` | `primary` / `onPrimary` | Minutes and distance choices, feedback answers, admin duration presets |
| `filter` (multi-select) | transparent, 1 px `borderStrong`, `text` | `primarySoft` / `onPrimarySoft` with a leading `check` 16 | Activity filters, admin filters |
| `assist` (action) | `fill` (on a sheet) or `surface2` with elevation 1 (on the map), `text` | — | Favourite chips, "Paste SPRING26", language chip |

- **States:** ripple when pressed. Disabled: `textDisabled`. Locked: a trailing `lock-outline` 14 in `textTertiary`; tapping opens the Paywall.
- **Chip rows:** a horizontal `ScrollView` with 16 content padding and an 8 gap. The first chip lines up with the gutter.

### 3.12 ModeBadge and ModeBadgeRow
| Size | Height | Horizontal padding | Text | Radius |
|---|---|---|---|---|
| `sm` (dense, admin) | 16 | 4 | 10/12, weight 700 | 3 |
| `md` (rows, default) | 18 | 5 | `labelS`, weight 700, tracking 0.2 | 4 |
| `lg` (stop sheet header) | 22 | 6 | `labelM`, weight 700 | 5 |

- **Shape:** `S` is a circle (width equals height) and `U` is a square (width equals height, radius 3), matching German station signs. Everything else is a rounded rectangle with a minimum width equal to the height.
- **Colours:** text `onColor`, fill from the transport table, the same in both themes.
- **Row:** gap 4, wraps, in `modeBadges()` order. After 5 badges, add a neutral "+N" Badge `sm`.
- **Accessibility:** one label for the row, using the spoken labels ("ICE, IC, Regional train, S-Bahn").

### 3.13 KindIcon
- **Style:** a circle of 24, 32, 40, 48 or 64 in the kind colour (`place` uses `primary`), with a white glyph at 0.55 × its size.
- **Over the map:** add a 2 px ring in `surface2`.

### 3.14 Avatar
- **Sizes:** 32, 36 (MapSheet), 40, 64.
- **Signed in:** initials (up to 2, from the name or the email's local part) in `onPrimarySoft` on `primarySoft`. The text is `labelM` at 32/36, `labelL` at 40 and `titleM` at 64.
- **Guest:** `account-outline` at 0.55 × size, `textSecondary` on `fill`.
- **Pro ring:** a 2 px `accent` ring with a 2 px gap (outer size + 8).
- **Admin lists only:**
  - Disabled user: a `fill` avatar with a 16 `danger` badge showing `cancel`.
  - Admin: a 16 `primary` badge showing `shield-crown` 10 in white at the bottom right.

### 3.15 SwitchRow
- **Structure:** a ListItem with a trailing React Native `Switch`: `trackColor={{ false: borderStrong, true: primary }}`, `thumbColor="#FFFFFF"` (Android), `ios_backgroundColor={borderStrong}`.
- **Behaviour:** pressing anywhere on the row toggles the switch. `accessibilityRole="switch"` with `accessibilityState.checked`.
- **Pro-locked variant:** shows `PlanBadge sm` instead of the switch. Tapping opens the Paywall.

### 3.16 SegmentedControl
- **Track:** `fill`, radius `md`, padding 3, height 44.
- **Segments:** equal width, height 38, radius 9, 2 to 3 options (4 at most).
- **Labels:** `labelM`. Selected: `text` at weight 600. Unselected: `textSecondary` at weight 500. Optional 18 icon with a 6 gap. Labels are one line (`adjustsFontSizeToFit`, `minimumFontScale` 0.85).
- **Thumb:** `segmentThumb` with elevation 1 (light only). It moves with `translateX` over 200 ms `standard`.
- **Locked option:** label plus `lock-outline` 14. Tapping it opens the Paywall and does not change the selection.
- **Feedback:** `selectionAsync` haptic on change.
- **Accessibility:** the track has `accessibilityRole="radiogroup"` and each segment is a `radio`.

### 3.17 Sheets
**MapSheet** (non-modal, built in-house with `Animated` and `PanResponder`; no gesture-handler dependency)

*Container*
- `surface2`, top radius `xl`, elevation 3 (shadow upward). Dark mode adds a top hairline.
- Grabber: 36 × 4, radius 2, `borderStrong`, centred 8 from the top.
- The drag zone is the grabber zone plus the header.

*Snap points* (heights above the tab bar, or above the bottom inset when the tab bar is hidden)
- `peek` = 160.
- `half` = round(0.45 × available).
- `expanded` = available − 72.
- `available` = window height − top inset − tab bar height (− TripBar 64 when it is showing).

*Gesture*
- On release, if |vy| > 0.6 the sheet goes to the next snap in that direction. Otherwise it goes to the nearest snap, using `spring.sheet`.
- Content can scroll only at `half` and `expanded`.
- At `expanded`, with the content scrolled to the top, dragging the header down collapses the sheet.

*Modes:* a stack of `browse` → `search` → `stop`. Android back pops one mode at a time.

*Sticky footer slot:* used by stop mode. Padding 16 (plus the bottom inset when the tab bar is hidden). A top hairline appears when content scrolls underneath.

*Map controls:* their `translateY` is linked to the sheet top, and they fade out between `half` and `expanded`.

*Accessibility:* the grabber has `accessibilityRole="adjustable"` with `increment` / `decrement` actions that move one snap. Announce "Sheet expanded" or "Sheet collapsed".

**ModalSheet** (a native route)
- Native-stack `presentation: 'formSheet'` with `sheetAllowedDetents: 'fitToContents'`. iOS also gets `sheetCornerRadius: 24` and `sheetGrabberVisible: true`. Android uses the default `sheetElevation` and needs our own grabber drawn in the content.
- **Content:** title `titleS` (padding 8/16/8), optional `bodyM` `textSecondary`, then options as dense `ListItem` radio rows or action rows (24 icon plus `bodyL`; destructive rows in `danger`). An optional footer has a Button L.
- **Behaviour:** single-choice sheets apply the choice on tap and close.
- **Hard rule:** a ModalSheet never contains a text input. Anything that needs typing is a full-screen modal screen with a TopBar.

### 3.18 Dialog and ConfirmDialog
- **Container:** React Native `Modal` with `transparent`, `statusBarTranslucent`, `navigationBarTranslucent` and `animationType="none"`. We animate it ourselves: the scrim fades in over 200 ms, and the card goes from opacity 0 and scale 0.96 to 1 over 200 ms with `enter` easing.
- **Card:** width min(window − 48, 400), `surface3`, radius `xl`, padding 24, gap 16, elevation 3.
- **Content:** optional 24 icon in a 48 circle in the soft tone, title `titleM`, body `bodyM` `textSecondary`, optional content (a TextField or a key-value summary).
- **Actions:** right-aligned with a gap of 8: ghost Button M Cancel, then a primary or danger Button M. If the two labels don't fit side by side, stack them full width with the confirm button on top.
- **ConfirmDialog props:**
  - `title`, `message`, `confirmLabel`, `cancelLabel = "Cancel"`, `tone: 'default' | 'danger'`.
  - `requireText?` (type-to-confirm; confirm stays disabled until the text matches).
  - `reasonRequired?` (adds a multiline field "Reason (shown in the audit log)", minimum 3 characters).
  - `requirePassword?` (adds a secure field "Your password").
  - `onConfirm: () => Promise<void>`. While it runs, the confirm button shows a spinner and the dialog stays open. On failure, show an inline `bodyS` `danger` error.
- **Keyboard:** when a field is focused, move the card up so its bottom sits 16 above the keyboard (Keyboard events, 200 ms).
- **Dismissal:** a scrim tap or back press means Cancel, except while loading.
- Replaces every `Alert.alert`.

### 3.19 Toast (snackbar)
- **Position:** 12 above the highest bottom element (TabBar, TripBar, StickyFooter or MapSheet footer), 16 side margins.
- **Style:** `inverseSurface`, radius `md`, minimum height 48, padding 12/16, gap 12, elevation 3. Text `bodyM` `onInverse`, up to 2 lines. Optional leading 20 icon in `onInverse`. Optional action as a ghost Button S in `inversePrimary` ("Undo", "Retry", "View").
- **Timing:** 4 s, or 6 s with an action. Errors that offer Retry stay for 10 s or until tapped.
- **Motion:** in with `translateY` 24 → 0 plus opacity over 200 ms `enter`. Out with opacity over 150 ms `exit`.
- **Queue:** one at a time. A toast with the same `id` replaces the current one.
- **Hosting:** `ToastHost` is mounted after `NavigationContainer` and again inside every modal screen container, because iOS modals render above the root view.
- **Accessibility:** each toast calls `AccessibilityInfo.announceForAccessibility`.

### 3.20 EmptyState
- **`full`:** centred, maximum width 320, 48 vertical padding. A 32 icon in a 72 `fill` circle (icon in `textSecondary`), then a 16 gap, title `titleS`, body `bodyM` `textSecondary` (up to 3 lines), a 20 gap, then Button M primary and an optional ghost button.
- **`inline`** (in sections and sheets): a 24 icon in a 48 circle, title `bodyL` at weight 500, body `bodyM` `textSecondary`, optional Button S secondary, padding 16.
- **Copy:** the title says what is missing, the body says how to fill it, and the button does it.

### 3.21 Skeleton
- **Style:** `fill` blocks. Radius 4 for text lines, 8 for blocks, `pill` for circles. Line height equals the font size of the text it replaces, with widths of 70 % and 45 %.
- **Pulse:** opacity 1 → 0.55 → 1 over 1100 ms, ease-in-out, looping.
- **Presets:** `SkeletonRow` (40 circle plus 2 lines), `SkeletonTile`, `SkeletonCard` (72 tall).
- **Timing:** show a skeleton only after 150 ms of loading, and keep it at least 300 ms once shown.

### 3.22 ProgressBar
- **Determinate:** height 4 (6 on the trip screen), radius `pill`, track `fill`, indicator `primary`. Use `success` when complete and `danger` for a failed download. Animate `scaleX` over 300 ms `standard`.
- **Indeterminate:** an indicator 32 % wide slides across over 1200 ms, linear, looping.
- **Trip variant:** a 10 × 10 `accent` dot with a 2 px `surface2` ring at 100 %, marking the wake point.
- **Accessibility:** `accessibilityRole="progressbar"` with `accessibilityValue {min 0, max 100, now}`.
- **Circular progress:** `ActivityIndicator` only (20 inline, 32 for a page), in `primary`.

### 3.23 StatTile
- **Style:** `surface1`, radius `lg`, padding 16, minimum height 96.
- **Content:**
  - Label: `labelS` `textSecondary`, 1 line.
  - Value: `numL` (`numM` in the admin area and on Arrived) with the unit inline in `bodyL` `textSecondary` (value "184", unit "km").
  - Caption: `bodyS`. `success` for "+12 %", `danger` for "−3 %", otherwise `textTertiary`.
  - Optional 20 icon at the top right in `textTertiary`.
- **Grid:** 2 columns with a 12 gap. Arrived uses 3 compact tiles.
- **Interaction:** optional `onPress`, for example to open a filtered admin list.

### 3.24 TopBar and LargeHeader
**TopBar** (pushed and modal screens)
- Height 56 below the status bar. Its background matches the screen background until the content scrolls more than 4, then it fades over 150 ms to `surface2` with a bottom hairline (light mode) or to `surface2` (dark mode).
- Leading: `arrow-left` (stack) or `close` (modal) as a standard IconButton at x = 4.
- Title: `titleS`, one line, ellipsis. It starts at x = 56, or x = 16 without a leading button.
- Trailing: up to 2 IconButtons, or 1 ghost Button S ("Save", "Restore"). Admin screens append a neutral Badge "Admin".
- Status bar: dark content in light mode, light content in dark mode (`expo-status-bar` style `auto`).

**LargeHeader** (tab roots: Saved, Activity, Account)
- Padding: status inset + 12 on top, 16 horizontal, 8 bottom.
- Title: `titleL`. Trailing actions are aligned with the title.
- After 40 of scroll, a compact TopBar (no back button, title `titleS`) fades in over 150 ms.

### 3.25 TabBar
- **Navigator:** `createBottomTabNavigator` with a custom `tabBar`, identical on Android and iOS.
- **Positioning:** `tabBarStyle.position = 'absolute'`. The Map screen is full height; other tabs pad their content with `useBottomTabBarHeight()`.
- **Style:** height 64 plus the bottom inset, `surface2`, a top hairline `border`, no shadow.
- **Items:** 4 of equal width, with 8 top padding. Each item is a 56 × 30 indicator pill (radius 15; `primarySoft` when active) holding a 24 icon (filled glyph in `onPrimarySoft` when active, outline glyph in `textSecondary` when inactive), then a 4 gap, then the label in `labelS` (`text` at weight 600 when active, `textSecondary` at weight 500 when not).
- **Icons:** see 2.6.
- **Badge:** a dot on Account when the Setup checklist needs action or the store reports a billing problem.
- **Behaviour**
  - Hides with `translateY` over 200 ms in MapSheet `search` and `stop` modes and while the keyboard is open.
  - Re-tapping Map recentres on the user and collapses the sheet to `peek`. Re-tapping another tab scrolls it to the top.
  - `selectionAsync` haptic on change. The indicator scales from 0.8 to 1 and fades in over 150 ms.
- **Labels:** at most 12 characters in every language (German: Karte, Gespeichert, Aktivität, Konto).

### 3.26 TripBar (minimised trip)
- **When:** a trip is running and the Trip screen is closed. It docks 8 above the tab bar with 12 side margins, on every tab.
- **Style:** height 56, radius `lg`, background `primary`, elevation 2.
- **Content:**
  - A 32 KindIcon with a 2 px white ring.
  - Title: `labelL` in `onPrimary`, the stop name, 1 line.
  - Subtitle: `bodyS` in `onPrimary` at 85 % opacity: "1.3 km · 6 min · GPS good". When estimated: "≈ 2.4 km · No GPS".
  - Trailing `chevron-up`. The whole bar opens the Trip screen.
- **Ringing:** background `accent`, text `onAccent`, title "Wake up! München Hbf", trailing Button S `onAccent` "I'm awake".
- **Snoozed:** background `accentSoft`, text `accentInk`, "Snoozed · rings again in 0:42".
- **Accessibility:** `accessibilityLiveRegion="polite"`.

### 3.27 Banner
- **Style:** radius `md`, padding 12/16, gap 12. Leading 20 icon. Text column with an optional title (`labelM`) and a body (`bodyM`, up to 3 lines). Trailing optional ghost Button S in the tone colour and an optional `close` IconButton (20 icon, 48 hit).
- **Tones** (background / text and icon / default icon)

| Tone | Background | Text and icon | Default icon |
|---|---|---|---|
| `info` | `primarySoft` | `onPrimarySoft` | `information-outline` (announcements: `bullhorn-outline`) |
| `warning` | `warningSoft` | `onWarningSoft` | `alert-outline` |
| `danger` | `dangerSoft` | `onDangerSoft` | `alert-circle-outline` |
| `success` | `successSoft` | `onSuccessSoft` | `check-circle-outline` |
| `promo` | `accentSoft` | `accentInk` | `crown-outline` |
| `neutral` | `fill` | `text` | `information-outline` |

- **Map variant:** `surface2` with elevation 1. The tone shows only in the icon colour, so the map stays calm. 16 side margins, top at status inset + 8.
- **Offline pill (map):** height 32, `pill`, `surface2`, elevation 1, `wifi-off` 16 in `warning`, `labelM` "Offline · stops and alarms still work", centred.
- **Priority:** only one banner on the map, in this order: trip stopped by the phone > offline > country pack suggestion > admin announcement > zoom hint.
- **Dismissal:** remembered per banner `id` (announcement ids come from remote config).

### 3.28 PlanBadge
- **Style:** pill. Heights `sm` 18, `md` 22, `lg` 28, with horizontal padding 6, 8 and 10. Label `labelS` (`labelM` at `lg`), weight 700, tracking 0.6, uppercase in Latin scripts.
- **Variants:**
  - `FREE`: `fill` / `textSecondary`.
  - `PRO`: `accent` / `onAccent` with a 12 `crown` icon at `md` and `lg`.
  - `PRO · LIFETIME`: same colours, `infinity` icon, `lg` only.
- **Admin lists:** add a neutral Badge for the type or source: "Monthly", "Yearly", "Store", "Grant", "Code".

### 3.29 Specialised components
**PlanCard** (Paywall plan choice)
- Radio card: minimum height 76, radius `lg`, padding 16, 1 px `borderStrong`. Selected: 2 px `primary` border on `surface1`.
- Leading radio icon 24: `radiobox-marked` in `primary` or `radiobox-blank` in `textTertiary`.
- Title `bodyL` at weight 600, followed by Badges (accent "7 days free", success "Save 58 %").
- Subtitle `bodyS` `textSecondary`: "€0.83 a month, billed yearly".
- Trailing: price in `numM` (tabular) over the period in `bodyS` `textSecondary` ("/ year").
- `accessibilityRole="radio"`.

**ComparisonTable**
- A Section with a header row: an empty feature column, "Free" in `labelS` `textSecondary`, and `PlanBadge md` PRO.
- Rows 48 tall: feature in `bodyM` (flexible width), then two 72-wide centred cells.
- Cells: `check` 20 in `success`, `minus` 20 in `textTertiary`, or text in `labelM` ("3", "Unlimited").

**TrialTimeline**
- Two rows, each with a 12 dot joined by a 2 px `primary` line.
  - "Today: Pro unlocks, free for 7 days."
  - "17 Oct: €9.99 a year starts, unless you cancel before."
- Text in `bodyM`, dates in tabular figures.

**KeyValueRow**
- A dense row: key in `bodyM` `textSecondary` (40 % width), value in `bodyM` `text`, right-aligned and tabular when numeric. Optional `content-copy` IconButton.

**Stepper**
- A tonal IconButton `minus`, the value in `numM` (minimum width 48, centred), a tonal IconButton `plus`. The buttons disable at the minimum and maximum.

**DateField**
- Three `decimal` TextFields for day, month and year, ordered by locale, widths 56 / 56 / 80, with a gap of 8.
- Preview line in `bodyS` `textSecondary`: "Thu, 31 Dec 2026 · in 82 days".
- Errors: "Pick a date in the future." No date-picker library.

**StopPin** (map)
- An SVG teardrop, 44 × 56: `M22 0C9.85 0 0 9.85 0 22c0 15.6 22 34 22 34s22-18.4 22-34C44 9.85 34.15 0 22 0z`.
- Fill in the kind colour with a 2.5 white stroke. An inner white circle (r 13) holds the kind glyph (18, in the kind colour).
- `anchor="bottom"`. Enters with a scale from 0.6 to 1 using `spring.sheet`.

**MapControl**
- An IconButton `map`.
- Glyphs: `crosshairs` (position unknown), `crosshairs-gps` (located and centred), a 20 spinner while locating, `crosshairs-off` when permission is denied (tap opens the system prompt or Setup).
- Trip screen recentre button: `crosshairs-gps`.

**AlarmCard** (in-app ringing)
- Background `accent`, radius `lg`, padding 20, gap 12.
- `alarm-light` 28 in `onAccent`, then `display` "Wake up!", then `bodyL` "München Hbf in about 2 min", all in `onAccent`.
- Buttons:
  - Button L `onAccent` "I'm awake" (dismiss).
  - Button M outline (1.5 px border and label in `onAccent`) "Snooze 1 min".
  - When the trigger is uncertain (`CLOSEST_POINT_PASSED`, `ESTIMATED`): Button M ghost (label `onAccent`) "Not yet, keep tracking".

**Screen and StickyFooter**
- `Screen` handles safe-area insets, the `bg` background, the scroll view (`keyboardShouldPersistTaps="handled"`) and `KeyboardAvoidingView` for forms.
- `StickyFooter`: `surface2`, a top hairline when content scrolls beneath it, padding 16 plus the bottom inset. It holds a Button L and an optional helper line above it in `bodyS` `textSecondary`, centred.

**DestinationCard** (trip map overlay)
- `surface2`, radius `lg`, elevation 2, padding 12/16, 16 margins.
- A 40 KindIcon, then a column with the overline in `labelS` `textSecondary` and the stop name in `titleS` (1 line).
- Trailing standard IconButton `chevron-down` labelled "Minimise".

---

## 4. Navigation and screens

### 4.1 Navigator

```
NavigationContainer (theme from tokens: background=bg, card=surface2, text=text,
                     border=border, primary=primary, notification=danger)
└─ RootStack (native-stack, headerShown:false, contentStyle {backgroundColor: bg})
   ├─ Onboarding         card, gestureEnabled:false   (first launch only)
   ├─ Permissions        card
   ├─ Setup              card    (also from Settings and when starting a trip)
   ├─ Tabs               BottomTabs: MapTab · SavedTab · ActivityTab · AccountTab
   ├─ Trip               fullScreenModal, gestureEnabled:false, animation slide_from_bottom
   ├─ Arrived            fullScreenModal, gestureEnabled:false, animation fade
   ├─ TripDetail         card
   ├─ Paywall            modal (Android: slide_from_bottom, full screen)
   ├─ Redeem             modal
   ├─ SignIn · SignUp · ForgotPassword          modal group
   ├─ EditProfile · ChangePassword · DeleteAccount · RenameFavourite · CountryPicker
   ├─ Settings · AlarmDefaults · Language · Countries · OfflineMaps
   │  Help · HelpArticle · Legal · Licences · About                       card
   ├─ ModalSheet         formSheet, fitToContents (pickers and action menus)
   └─ Admin group (guard role==='admin')
      AdminHome · AdminUsers · AdminUser · AdminPromos · AdminPromo · AdminPricing
      AdminSettings · AdminAudit                                          card
      AdminGrant · AdminChangePlan · AdminExtend · AdminNote · AdminPromoNew · AdminPrice   modal
```

- **Search and Stop are MapSheet modes, not routes.** "Show on map" from anywhere does `navigate('Tabs', { screen: 'MapTab', params: { stopId } })`, which opens stop mode.
- **Linking:** add `"scheme": "stopwake"` to `app.json`. Links: `stopwake://stop/{id}`, `stopwake://redeem/{code}`, `stopwake://pro`, `stopwake://admin/user/{id}` (admins only).
- **Theme:** on every theme change, call `expo-system-ui` `setBackgroundColorAsync(bg)` so screen transitions never flash white.
- **Trip presentation:**
  - When a running status arrives, present `Trip`, unless the user minimised this trip.
  - `onTripEnded` replaces `Trip` with `Arrived`. If the app was closed, `Arrived` shows on the next foreground.
- **Android back:**
  - Map: pops MapSheet modes, then collapses an expanded sheet to `half`, then exits.
  - Trip: minimises to the TripBar.
  - Arrived: goes to Map.
  - Onboarding: goes to the previous page.
  - A dialog or sheet closes first.
- **Admin guard:** the admin role is checked on focus from the cached session. Anyone else is sent back to `Tabs` with the toast "Admin only".

### 4.2 Tabs

| Tab | Root | Icon | Contents |
|---|---|---|---|
| Map | MapHome | `map` | Map, MapSheet (browse, search, stop), banners, TripBar |
| Saved | Saved | `star` | Favourites (rename, reorder, remove) and recents |
| Activity | Activity | `timeline-clock` | Monthly stats and trip history with outcomes |
| Account | Account | `account-circle` | Identity, plan, purchases, settings, admin entry |

### 4.3 Screens

#### Onboarding (3 pages, route `Onboarding`)

*Mechanics:* a horizontal `ScrollView` with `pagingEnabled`. Each page is one window wide.

*Layout, top to bottom*
1. Top row: the language chip (assist: `translate` 16, the native name of the current language, `chevron-down` 16) at 16 on the left. On pages 1 and 2, a ghost "Skip" Button S on the right; it jumps to Permissions.
2. Illustration panel: 46 % of the window height, 16 margin, radius `xl`, background `primarySoft` (light) or `surface1` (dark). Illustrations are built from real components at 0.8 scale, never stock art.
3. Text block (24 horizontal padding, 24 above): title in `display` (2 lines at most), body in `bodyL` `textSecondary` (3 lines at most).
4. Page dots: 8 × 8 in `fill`; the active dot is 24 × 8 in `primary`; gap 6; centred.
5. StickyFooter: Button L "Continue". On page 3: "Set up StopWake".

*Pages*
1. **"Never miss your stop"** / "Fall asleep on the train or bus. StopWake wakes you just before you arrive." Illustration: a 6 dp `primary` route line with 5 stop nodes carrying ModeBadges U, S and Tram, ending in a red ICE StopPin inside an amber wake ring. A mini ringing TripBar overlaps it: "Wake up! München Hbf".
2. **"Pick a stop. Choose when."** / "Every stop in Germany and 16 more countries, even offline. Wake 2 minutes or 300 metres before." Illustration: a mini stop sheet (KindIcon, "München Hbf", badges, segmented control on Minutes, chips 1 / **2** / 3 min, a Start alarm button).
3. **"Sleep. It rings on silent."** / "Lock your phone. The alarm fills the screen and gets louder until you're awake." Illustration: a lock-screen mock (a `#0B0F16` rectangle with radius 24) showing "Wake up!", the destination and an amber slide-to-dismiss track, with an assist chip `volume-off` "Rings in silent mode".

*Language:* the chip opens `Language` as a modal. A choice applies immediately and the whole app re-renders in that language. If the phone's language isn't supported, English is the default.

#### Permissions priming (route `Permissions`)

*Layout, top to bottom*
1. TopBar with back.
2. `titleL` "Three things StopWake needs".
3. `bodyM` `textSecondary` "Only used while a trip is running. StopWake never tracks you in the background."
4. A Section with 3 rows, each with a 24 icon in `primary`:
   - `map-marker-radius-outline` "Precise location" / "To know how far you are from your stop."
   - `bell-ring-outline` "Notifications" / "To show your trip and ring the alarm."
   - `cellphone-lock` "Alarm over the lock screen" / "So the alarm can fill the screen when your phone is locked."
5. Footer note: "You can change this any time in Settings."
6. StickyFooter: Button L "Allow access", then a ghost Button M "Not now" below it.

*Behaviour:* "Allow access" asks for precise location, then notifications, then opens the full-screen intent settings page if needed, then goes to Setup. "Not now" goes to the Map; starting a trip later opens Setup.

#### Setup, "Alarm reliability" (route `Setup`)

*Title:* "Almost ready" when coming from onboarding, "Alarm reliability" from Settings, "Before you go" when starting a trip.

*Layout, top to bottom*
1. TopBar.
2. Status Card:
   - A 32 icon: `check-decagram` in `success`, or `alert-circle-outline` in `warning`.
   - `titleS`: "Ready to wake you" or "2 things to fix".
   - `bodyM` `textSecondary`: "The required items are done. The recommended ones make the alarm even more reliable."
   - ProgressBar showing n of 6.
3. SectionHeader "Required" and a Section with Precise location, Location turned on and Notifications.
   - Each row has a 24 leading icon: `check-circle` in `success` or `alert-circle-outline` in `danger`.
   - Subtitle: "Allowed" when done, otherwise the reason sentence.
   - Trailing: a secondary Button S "Allow", "Turn on" or "Switch to precise", shown only when the item isn't done.
4. SectionHeader "Recommended" and a Section with Alarm over the lock screen, Alarms and reminders, and No battery restrictions.
   - The battery row's subtitle shows the brand-specific path (the existing `OEM_HINT` strings).
   - Trailing: Button S "Open settings".
5. SectionHeader "Check" and a row `volume-high` "Test the alarm" / "Plays your alarm for 5 seconds", trailing Button S "Play" (with a spinner while playing).
6. StickyFooter: Button L "Continue", or "Start alarm" when a trip is waiting. It stays disabled until the required items are done, with the helper "Allow the 3 required items to continue."

*States*
- The checklist refreshes on `AppState` `active`. When an item turns OK, show the toast "Notifications allowed".
- When the native module is missing: `EmptyState full` "Trip alarms run on Android for now" with a Back button.

#### Map home (MapTab root)

*Layers, from top of the z-order down*
1. Status-bar scrim: an `expo-linear-gradient` from `bg` at 85 % to transparent, height = top inset + 24.
2. Banner slot (map variant) at top inset + 8. The zoom hint pill sits below it ("Zoom in to see all stops", `magnify-plus-outline`, shown when 8.5 ≤ zoom < 13.5).
3. MapControl column: right 16, bottom = sheet top + 12. It holds the locate button.
4. MapSheet (described below).
5. TabBar, with the TripBar when a trip is minimised.

*Map*
- The calm style. Stop dots and names come from the existing stop layers. The user puck is `NativeUserLocation` tinted `primary`.
- The selected stop shows a StopPin. When waking by distance (or in leave mode), the amber wake-zone preview shows too.
- Long-press: the nearest stop within 60 m, otherwise an address pin. Both open stop mode.
- Initial camera: the user's position at zoom 14, otherwise the phone's region country (Germany: zoom 5.2). Camera bottom padding equals the sheet height.

*MapSheet, browse mode (the default)*

Starts at `half` when the location is known, otherwise at `peek`.
1. Grabber.
2. Search row: SearchField `sheet` with "Where are you going?", then a 36 Avatar with a 48 hit area that opens the Account tab. The Avatar shows the Pro ring for Pro users and the guest icon for guests.
3. Favourite chips (assist chips with a 20 KindIcon and the name, up to 8). With no favourites, show recent chips with a `history` 16 icon. With neither, hide the row.
4. Header `titleS` "Nearby stops", with trailing `bodyS` `textTertiary` "Within 1.5 km".
5. Nearby list: up to 8 nearest stops within 1.5 km, sorted by distance. It needs a new `nearestStopsAll(sources, point, limit, maxKm)` helper. Each row:
   - Leading: a 40 KindIcon.
   - Title: the stop title (`splitName`).
   - Meta: ModeBadgeRow `md` and the town in `bodyS` `textTertiary`.
   - Trailing: the distance in `labelM` tabular `textSecondary` ("360 m").
   - Tap: stop mode.
6. Footer hint (`bodyS` `textTertiary`, centred): "Long-press the map to drop a pin anywhere."

*Browse-mode states*
- **Location not allowed:** an inline EmptyState instead of the list: `crosshairs-gps`, "See stops near you" / "Allow location to list the stops around you.", button "Allow location".
- **Locating:** 3 SkeletonRows.
- **No stops nearby:** inline "No stops nearby" / "Search for your destination instead."
- **Country pack missing where you are or where you're looking:** an info Banner above the list: "Stops for Austria · 1.5 MB" with a Download button. During the download, a ProgressBar and "Downloading 42 %" replace the button.
- **Offline:** the offline pill shows on the map. The nearby list still works.
- **First launch offline (no map style yet):** the map area shows `map.placeholder` with the centred line "The map needs internet the first time. Search and alarms work offline."

*MapSheet, search mode (replaces today's SearchOverlay)*

Opening: tapping the field expands the sheet over 280 ms, hides the tab bar and opens the keyboard.
- **Empty query:**
  - Row "Use my current location" with `crosshairs-gps` in a 40 `primarySoft` circle.
  - Row "Drop a pin on the map" with `map-marker-plus-outline`. It collapses the sheet to `peek` and shows the toast "Long-press where you want to go".
  - Section "Favourites".
  - Section "Recent", with the header action "Clear".
  - Tip in `bodyS` `textTertiary`: "Tip: paste coordinates or a Google Maps link."
- **Two or more characters:**
  - Section "Stops": offline, 120 ms debounce, up to 12 rows. The matched part of the title is weight 700. Meta shows badges and the town. Trailing shows the distance from you.
  - Section "Addresses and places": three or more characters, 400 ms debounce. Rows have a leading `map-marker-outline` in a 40 `fill` circle. A 20 spinner sits in the section header while results load.

*Search-mode states*
- **Offline:** the addresses section shows a neutral inline note: "Addresses need internet. Stops work offline."
- **No results:** inline "No matches for “Hbf Ulmm”" / "Check the spelling or add the town, like “Bahnhofstraße Ulm”."
- **Possible pack hint:** a row "Looking for Austria? Download its stops (1.5 MB)" with Button S "Download".
- **Picking a result:** the keyboard closes first (existing `leave()` logic), then stop mode opens.

*MapSheet, stop mode (the stop sheet)*

The sheet fits its content, up to 80 % of the window. The tab bar is hidden. The camera flies to the stop at zoom 15 or more, with bottom padding equal to the sheet height.
1. Grabber.
2. Header row:
   - A 48 KindIcon.
   - Title `titleM` (2 lines).
   - Subtitle `bodyM` `textSecondary`: "Train station · München · 1.4 km away".
   - Trailing IconButtons: the star toggle (`star-outline`, or `star` in `accent` when saved) and `close`.
3. ModeBadgeRow `lg`.
4. SegmentedControl: "Minutes before" (`clock-outline`) and "Distance before" (`map-marker-distance`). The default depends on the stop's kind.
5. Choice chips: 1, 2, 3, 5, 10 and 15 min, or 100 m, 200 m, 300 m, 500 m, 1 km and 2 km, using the unit setting.
6. A warning Banner when 200 m or less is chosen for a train or S-Bahn stop: "200 m is only seconds on a train. Wake 2 min before instead?" with the action "Use 2 min".
7. Rule line: `bell-ring-outline` 20 in `primary`, then `bodyM`: "Rings about 2 min before you arrive", "Rings 300 m before the stop" or "Rings when you're 500 m away".
8. Disclosure row "Alarm options", value "Arrive · Normal", `chevron-down` / `chevron-up`. It expands inline to show:
   - A SegmentedControl "When I arrive" / "When I leave".
   - A SegmentedControl Gentle / Normal / Heavy sleeper (locked for Free users), with the strength description below in `bodyS` `textSecondary`.
   - A row `play-circle-outline` "Try a demo trip" / "A 1-minute simulation to see and hear the alarm."
9. Sticky footer: Button L "Start alarm" with the `alarm` icon. It shows a spinner while the trip starts.

*Stop-mode states*
- **Dropped pin:** a `place` KindIcon and the title "Dropped pin". The subtitle shows a skeleton line until the address resolves. Offline, the subtitle shows the coordinates.
- **Starring at the Free limit:** opens the Paywall with reason `favourites`.
- **Heavy sleeper on Free:** opens the Paywall with reason `heavy`.
- **Setup incomplete:** "Start alarm" goes through Setup with the trip waiting. The button label doesn't change.

#### Trip, live (route `Trip`)

*Layout*
- **Map** (top part): the trail (`map.trail`, 5 dp), the dotted `map.ahead` line, the amber wake zone, the StopPin and your puck. Your puck is a 32 `primary` circle with a 3 px white border and the `navigation` arrow. When estimated it uses `warning` with a dashed ring and a "≈" mark.
- **DestinationCard** overlay at the top. Its overline is "On the way to", "Demo trip to" or "Leaving".
- **Recentre MapControl:** appears 16 above the panel after the user pans. Tapping it refits the camera and resumes following.
- **Map padding:** top = destination card bottom + 16, bottom = panel height + 16.

*Panel* (`surface2`, top radius `xl`, elevation 3, padding 20/16/16, gap 16), top to bottom:
1. GPS Badge:
   - Good: `success` dot, "GPS good · ±5 m".
   - Weak: `warning`, "GPS weak".
   - Waiting: neutral with a pulsing dot, "Searching for GPS…".
   - Estimating: `warning`, "No GPS · estimating".
   - A demo trip also shows a primary Badge "Demo".
2. Stats row (columns 1.3 : 1):
   - Left: `labelS` "Distance", then `numXL` "1.3 km".
   - Right: `labelS` "Arrives", then `numL` "6 min", then `bodyS` `textSecondary` "at 08:21". The clock time is now + `etaSec`, in the locale's time format.
   - Leave mode: the right column is "Rings at" with "500 m".
   - Estimated values get a "≈ " prefix.
3. Trip ProgressBar (6 dp), from the first fix's distance to the wake point.
4. Rule pill (`fill`, radius `md`, padding 12): `bell-ring-outline` in `primary`, then `bodyM` "Rings about 2 min before you arrive", then the strength in `bodyS` `textSecondary` ("Normal").
5. Info line in `bodyS` `textTertiary` with `lock-outline` 16: "You can lock your phone. It rings even on silent." The far tier adds "Saving battery while you're far away."
6. Button M `dangerOutline` "End trip" (`stop-circle-outline`, full width). It opens a ConfirmDialog: "End this trip?" / "The alarm won't ring." with the actions "Keep going" and a danger "End trip".

*States*
- **Waiting for the first fix:** stats show "–" with a skeleton pulse, plus the caption "This can take a minute underground."
- **Estimated:** a compact warning Banner replaces item 5: "No GPS in the tunnel. We're estimating your position and will still wake you."
- **Ringing:** an AlarmCard replaces items 1 to 5 and End trip is hidden. Haptic `notificationAsync(Warning)`.
- **Snoozed:** an `accentSoft` card: "Snoozed · rings again in 0:42" (tabular countdown) with the button "I'm awake".
- **Leave mode before it's armed:** the caption "Waiting until you're inside the area."
- **Minimised (Android back or the chevron):** the TripBar shows on the tabs.

*Lock-screen notification (native reference, `Notifications.kt`)*
- Accent colour `#4146D8`.
- Title: "München Hbf · 1.3 km". Text: "Arrives in 6 min · rings 2 min before".
- Action: "End trip". A determinate progress bar shows trip progress.
- On Android 16 or later, use a `ProgressStyle` live update with a point at the wake zone.

#### Alarm (native `AlarmActivity`, for reference)

*Content*
- Background `#0B0F16`, with status and navigation bars the same colour.
- Padding 24 / 72 top / 40 bottom.
- From top to bottom:
  - A 64 KindIcon. This needs a new `kind` option in `TripOptions` and `TripStore`.
  - "Wake up!" at 40 sp in Inter Bold, white.
  - The destination at 28 sp SemiBold, white.
  - The reason line at 18 sp in `#A8B3C3` ("About 2 min to go").
  - Flexible space.

*Controls*
- Slide-to-dismiss track: 76 tall, radius 38, `#222A3A`. The thumb is a 64 circle in `#FFB547` with `chevron-double-right` in `#2A1B00`. Label "Slide to dismiss", 18 sp, white. The existing rule stays: the drag must start on the thumb.
- Snooze: an outline button, 56 tall, radius 28, 2 px `#3A4558` stroke, white "Snooze 1 min".
- When the trigger is uncertain: a text button "Not yet, keep tracking".

*Unchanged behaviour:* back stays ignored, the activity shows over the lock screen, and it turns the screen on.

#### Arrived (route `Arrived`)

*Layout, top to bottom*
1. Hero, centred, with top inset + 32 above it:
   - A 72 `successSoft` circle with `flag-checkered` 36 in `success`.
   - `display` "You made it".
   - `bodyL` `textSecondary` "München Hbf · 08:21".
2. Three compact StatTiles (`numM`): Trip "6 min", Distance "1.4 km", Rang "2 min before".
3. Card "Did it wake you at the right time?" with choice chips "Right time", "Too early" and "Too late". A choice saves the trip's `feedback` and shows the toast "Thanks. This helps us tune the alarm."
4. Section:
   - "Save München Hbf to favourites" (`star-outline`). After saving it reads "Saved to favourites" with `star` in `accent` and is disabled.
   - "Share trip log" (`share-variant-outline`) / "Helps us tune when the alarm rings". Shown only when a log file exists.
5. StickyFooter: Button L "Done", which goes to the Map.

*Variants*
- **Ended by the user:** a `fill` circle with `stop-circle-outline`, "Trip ended", no Rang tile, and actions "Start again" (secondary) and "Done".
- **Error:** a `dangerSoft` circle with `alert-circle-outline`, "The trip couldn't start", and the message. Actions: "Check permissions" (opens Setup) and "Try again".
- **Stopped by the phone:** a `warningSoft` circle, "Your phone stopped the trip", "A battery saver closed StopWake before you arrived. It takes a minute to fix.", action "Fix battery settings" (opens Setup, scrolled to the battery item).

#### Saved (SavedTab root)

*Header:* LargeHeader "Saved" with trailing ghost Button S "Edit" (it reads "Done" in edit mode).

*Layout, top to bottom*
1. Free plan at the limit only: a promo Banner "3 of 3 favourites used. Pro keeps as many as you like." with the action "Get Pro".
2. SectionHeader "Favourites · 2 of 3" (Free) or "Favourites" (Pro), and a Section:
   - Each row: a 40 KindIcon, the label or stop name as title, and a meta row with ModeBadgeRow and the town. If the favourite was renamed, the original name shows as subtitle.
   - Tapping a row opens stop mode on the Map.
   - Trailing `dots-vertical` opens a ModalSheet with "Start alarm", "Show on map", "Rename" (opens `RenameFavourite`), "Move to top" and "Remove" (danger).
   - In edit mode the rows show a leading `minus-circle-outline` in `danger`.
3. SectionHeader "Recent" with the action "Clear" (ConfirmDialog), and a Section:
   - Each row: KindIcon, title, and `bodyS` "Yesterday, 18:40".
   - The overflow menu offers "Remove from recent".

*States*
- **No favourites:** inline EmptyState `star-outline` "No favourites yet" / "Tap the star on any stop to keep it here." with the button "Find a stop" (opens search mode).
- **No recents:** the section is hidden. When both are empty, a full EmptyState.
- **Removing:** the toast "Removed München Hbf" with the action "Undo".

#### Activity (ActivityTab root)

*Header:* LargeHeader "Activity".

*Layout, top to bottom*
1. Month switcher: `chevron-left`, `labelL` "October 2026", `chevron-right` (disabled on the current month).
2. A 2 × 2 grid of StatTiles:
   - Trips: "12".
   - Distance: "184 km".
   - Woke you on time: "92 %", caption "11 of 12 trips". On time means the alarm rang and the feedback wasn't "Too late".
   - Time on board: "6 h 40 min".
   - Demo trips are left out of all stats.
3. Filter chips: All, Woke me, Ended, Problems, Demo.
4. Sections grouped by day ("Today", "Yesterday", "Mon 6 Oct"):
   - Each row: a 40 KindIcon, the destination as title, and the meta line "07:58 → 08:21 · 14.2 km · 23 min".
   - Trailing outcome Badge: success "On time"; neutral "Ended"; warning "Too early" or "Too late"; danger "Stopped by phone" or "Didn't start"; primary "Demo".
   - Tapping a row opens `TripDetail`.
5. Footer in `bodyS` `textTertiary`: "Your trip history stays on this phone."

*States*
- **No trips:** full EmptyState "No trips yet" / "Your rides and how StopWake woke you will show up here." with the button "Plan a trip".
- **Month without trips:** inline "No trips in September."
- **Loading:** skeleton tiles and rows.

*Data:* one local record per trip with `startedAt`, `endedAt`, the stop (`name`, `kind`, `modes`), the trail length, the wake rule and strength, `rangAt` (with the distance and ETA at that moment), the outcome, `feedback` and `demo`.

*TripDetail* (route `TripDetail`)
- TopBar "Trip" with an overflow menu: "Share trip log", "Delete" (danger).
- A non-interactive TripMap, 220 tall, showing the trail, the zone and the pin.
- `titleM` with the destination, then the date in `bodyM` `textSecondary`.
- An outcome Banner.
- KeyValueRows: Started, Arrived or Ended, Duration, Distance travelled, Alarm ("2 min before · Normal"), Rang ("08:19 · 2 min / 1.1 km before"), GPS ("Lost for 3 min underground").
- Feedback chips.
- StickyFooter: Button L "Ride again", which opens stop mode with the same settings.

#### Account (AccountTab root)

*Header:* LargeHeader "Account".

*Layout, top to bottom*
1. Profile Card:
   - A 64 Avatar.
   - Name in `titleS` ("Guest" for guests).
   - Email in `bodyM` `textSecondary` ("Not signed in" for guests).
   - The ID chip: `fill`, radius `sm`, padding 4/8, `labelM` tabular "SW-7K3P-92QX" with `content-copy` 16. Tapping copies it and shows the toast "ID copied".
   - Signed in only: a trailing `pencil-outline` that opens EditProfile.
2. Guests only: an info Banner with the title "Keep Pro on every phone" and the body "Create a free account. Your ID and plan come with you." Two Buttons M side by side: "Create account" (primary) and "Sign in" (secondary).
3. Plan Card (outlined; Pro plans get a 1.5 px `accent` border):
   - `PlanBadge lg` and a `titleS` title ("StopWake Pro" or "Free plan").
   - The status line and button depend on the plan:

| Plan | Status line | Action |
|---|---|---|
| Free | "3 favourites · Gentle and Normal alarms" | Button M primary block "Get Pro · 7 days free" |
| Store yearly | "Yearly · renews 12 Oct 2027 · Google Play" | Button M secondary "Manage subscription" |
| Trial | "Free trial · ends 17 Oct, then €9.99 a year" | — |
| Admin grant | "Free until 31 Dec 2026 · gift from StopWake", plus `bodyS` "No payment needed." | Ghost "See plans" |
| Promo code | "Code SPRING26 · until 10 Nov 2026" | — |
| Lifetime | "Lifetime · since 3 Oct 2026" | — |
| Billing problem | A warning Banner inside the card: "Payment problem. Update your payment method in Google Play to keep Pro." | "Fix in Google Play" |

4. Section "Plan": "Redeem a code" (`ticket-percent-outline`) and "Restore purchases" (`refresh`; shows a spinner and then a toast with the result).
5. Section "App":
   - "Settings" (`cog-outline`).
   - "Alarm reliability" (`shield-check-outline`) with a trailing Badge: success "All set" or warning "2 to fix".
   - "Help & support" (`lifebuoy`).
6. Admins only, Section "Admin": "Admin" (`shield-crown-outline`) / "Users, plans, codes, prices, settings".
7. Section "Account":
   - Signed in: "Sign out" (`logout`) with the ConfirmDialog "Sign out on this phone?" / "You'll continue as a guest. Pro stays with your account.", and "Delete account" (`delete-outline`, danger).
   - Guest: "Delete my data" (danger).
8. Footer in `bodyS` `textTertiary`, centred: "StopWake 1.0.0 (42) · SW-7K3P-92QX".

*States*
- **First load:** skeletons for the profile and plan cards.
- **Offline:** a neutral Banner "Offline. Showing your saved plan (checked 2 h ago)."
- **Session expired:** a warning Banner "Signed out on this phone. Sign in again." with the action "Sign in".
- **Disabled account:** a danger Banner "This account is disabled. Contact support." with the action "Contact support". The plan is treated as Free.

#### Sign in (modal)

*Layout, top to bottom*
1. TopBar with `close`.
2. `titleL` "Sign in".
3. `bodyM` `textSecondary` "Keep Pro and your settings on every phone."
4. TextField "Email" with `email-outline`.
5. TextField "Password" (secure, with the eye toggle).
6. A right-aligned ghost Button S "Forgot password?".
7. StickyFooter: Button L "Sign in", then a ghost "New here? Create an account" below it.

*States*
- **Wrong credentials:** a danger Banner above the fields: "Email or password is wrong."
- **Rate limited:** "Too many tries. Wait 5 minutes, then try again."
- **Guest has an active plan:** a ConfirmDialog "Move your guest plan?" / "Pro until 31 Dec 2026 moves to anna.keller@example.com."
- **Success:** the modal closes, the toast "Signed in" shows, and the Account tab updates. Admins see the Admin row.

#### Sign up (modal)

*Layout, top to bottom*
1. `titleL` "Create your account".
2. `bodyM` "Free. Keeps Pro and favourites on every phone."
3. Fields: Name (optional), Email, and Password with the helper "At least 8 characters".
4. A reassurance line in `bodyS` with `check-circle-outline` in `success`: "Your ID SW-7K3P-92QX becomes your account. Nothing is lost."
5. Consent line in `bodyS`: "By creating an account you agree to the Terms and the Privacy policy" (both are links).
6. StickyFooter: Button L "Create account", then a ghost "Already have an account? Sign in" below it.

*Error:* email already taken shows "An account with this email exists." under the field, with the inline action "Sign in instead".

#### Forgot password (modal, code flow, no web page needed)

1. **Step 1:** `titleL` "Reset password" / "We'll email you a 6-digit code." An Email field and Button L "Send code".
2. **Step 2:** "Enter the code we sent to a•••@example.com". A `code` TextField (6 digits, `one-time-code`), a "New password" field, Button L "Set new password", and a ghost "Send a new code" (disabled for 60 s with a countdown).
3. **Done:** the toast "Password changed. You're signed in."

*Errors:* "This code is wrong or has expired."

#### EditProfile, ChangePassword, DeleteAccount

**EditProfile**
- TopBar "Edit profile" with a trailing ghost "Save", disabled until something changes.
- An avatar preview with initials, then Name and Email fields. Changing the email asks for the current password in a ConfirmDialog.
- A row "Change password" that opens ChangePassword (fields: Current, New, Repeat).
- A read-only "User ID" field with a copy button.

**DeleteAccount**
- TopBar "Delete account".
- A danger Banner "This can't be undone."
- A list of what gets deleted: account, plan grants, sessions.
- A SwitchRow "Also clear this phone" (favourites, history, settings), on by default.
- When a store subscription is active: a warning Banner "Your Google Play subscription keeps running. Cancel it in Google Play to stop payments." with the action "Open Google Play".
- A TextField "Type DELETE to confirm" (the word is localised).
- StickyFooter: Button L `danger` "Delete account".
- Afterwards: a fresh guest is created, the app shows Onboarding, and the toast "Account deleted" shows.

#### Settings (route `Settings`)

TopBar "Settings". Every value row opens a ModalSheet or a screen.

| Section | Rows (icon, trailing value or badge, opens) |
|---|---|
| Alarm | `alarm` "Alarm defaults", "Normal · 2 min / 300 m", opens AlarmDefaults |
| Display | `translate` "Language", "English", opens Language · `ruler` "Distance units", "Kilometres", sheet (Kilometres, Miles) · `theme-light-dark` "Appearance", "System", sheet (System, Light, Dark) |
| Maps and stops | `earth` "Countries", "Germany + 2", opens Countries · `map-check-outline` "Offline maps", "1 area · 38 MB" (Free users see a PRO badge), opens OfflineMaps |
| Reliability | `shield-check-outline` "Permissions & reliability", status Badge, opens Setup |
| Support | `lifebuoy` "Help & support", opens Help · `star-outline` "Rate StopWake", opens the Play listing |
| Legal | `shield-account-outline` "Privacy policy" · `file-document-outline` "Terms of use" (both open in an `expo-web-browser` tab) · `license` "Open-source licences", opens Licences |
| About | `information-outline` "About StopWake", "1.0.0", opens About |

Footer in `bodyS` `textTertiary`: "Map © OpenStreetMap contributors · OpenFreeMap".

**AlarmDefaults**
- Section "Alarm sound": a SegmentedControl for strength (padding 16), the description, and a row "Test alarm" with Button S "Play".
- Section "Wake me by default": "Trains and S-Bahn", value "2 min before" (minutes sheet), and "Bus, tram and U-Bahn", value "300 m before" (distance sheet).
- Footer: "Every stop starts with these. You can change them before each trip."

**Language**
- A first radio row "Phone language", with the phone's language as subtitle.
- Then 11 radio rows, each with the native name as title and the English name as subtitle in `bodyS`.
- A choice applies immediately.

**OfflineMaps**
- Free users: a promo Banner "Offline maps are part of Pro." with the action "Get Pro".
- Intro: "Save the map around you for underground stations and trips without data. Stops and alarms work offline anyway."
- Section "Saved areas":
  - Each row has `map-check-outline` (or a ProgressBar while downloading), the area name, and "25 km around · 38 MB · saved 3 Oct".
  - Trailing `delete-outline` with a ConfirmDialog.
  - With no areas: inline "No saved areas".
- StickyFooter: Button L "Save the map around me (25 km)". Free users see a lock icon and get the Paywall.
- Footer: "The last 256 MB of map you viewed is kept automatically."

**Help**
- "Alarm didn't ring?" opens Setup.
- "Battery savers by phone brand" opens dontkillmyapp.com in a browser tab.
- "How StopWake decides when to ring" opens HelpArticle, a static in-app text based on the README trigger rules.
- "Email support" uses the support email from remote config. It opens `mailto:` with the subject "StopWake support · SW-7K3P-92QX" and the app version and device in the body.
- "Your ID", value "SW-7K3P-92QX", with copy.

**Licences**
- One row per item with its name and licence: OpenStreetMap (ODbL), DB InfraGO (CC BY 4.0), OpenFreeMap / OpenMapTiles, Photon, Inter (OFL 1.1), Material Design Icons (Apache 2.0), MapLibre (BSD-2), React Native (MIT).
- Tapping a row shows the full licence text.

**About**
- Centred: the 72 app icon (radius 16), `titleM` "StopWake", `bodyM` "Version 1.0.0 (42)", and "A GPS alarm for public transport."
- KeyValueRows for the data sources.

#### Countries (route `Countries`)

*Layout, top to bottom*
1. TopBar "Countries".
2. `bodyM` `textSecondary`: "Germany is built in. Download other countries to search their stops offline."
3. `bodyS` `textTertiary`: "On this phone: 3 countries · 6.2 MB".
4. When relevant, a "Suggested" Section with a single row ("Austria") and Button S "Download".
5. One Section per region: Europe, Americas, Asia and Pacific. Each row:
   - Leading: the flag at 28 in a 40 box.
   - Title: the country name.
   - Subtitle in `bodyS`, by state:
     - "Built in" (trailing `check-circle` in `success`).
     - "36,244 stops · 4.1 MB" (installed; trailing `delete-outline`, ConfirmDialog "Remove the stops of Austria? You can download them again any time.").
     - "Download · 1.5 MB" (trailing `download-outline` in `primary`).
     - "Downloading 42 %" (with a 4 dp ProgressBar under the text and a 20 spinner trailing).
     - "Installing…".
     - "Update available · 1.6 MB" in `primary` (trailing `update`).
     - "The download stopped. Tap to try again." in `danger`.
6. Footer credit: "Stops outside Germany: © OpenStreetMap contributors (ODbL), updated monthly."

*States*
- **Loading the list:** skeleton rows.
- **List failed to load:** a danger Banner with the action "Try again".
- **Offline:** a neutral Banner "Downloads need internet. Installed countries work offline."
- **iOS:** an info Banner.

#### Paywall (route `Paywall`, modal)

*How prices are chosen* (decisions.md, "Pricing by country")
1. When the store is connected, its `priceString` values are authoritative. The source line reads "Prices from Google Play."
2. Otherwise, use the remote-config price row for the phone's region (`getLocales()[0].regionCode`, falling back to the built-in `src/lib/pricing.ts`), formatted with `Intl.NumberFormat(`${lang}-${region}`, { style: 'currency', currency })`. The source line reads "Prices for Switzerland in CHF. Google Play confirms the final price."
3. Per month = yearly ÷ 12, rounded down to the currency's decimals.
4. Savings = 1 − yearly ÷ (monthly × 12), rounded to a whole percent. Shown only at 10 % or more.

*Layout, top to bottom*
1. Transparent TopBar: `close` on the left, ghost "Restore" on the right.
2. Centred hero:
   - A 64 `accentSoft` circle with `crown` 32 in `accentInk`.
   - `display` "StopWake Pro".
   - `bodyL` `textSecondary` "For riders who really fall asleep on the way."
3. Reason Banner (info, `lock-open-variant-outline`) when the Paywall opened from a locked feature: "Heavy sleeper is part of Pro." / "The free plan keeps 3 favourites." / "Offline maps are part of Pro."
4. ComparisonTable. Its rows come from remote config (`proFeatures`, `freeFavourites`):

| Feature | Free | Pro |
|---|---|---|
| Every stop in 17 countries, offline | check | check |
| Wake by minutes or distance | check | check |
| Gentle and Normal alarm | check | check |
| Heavy sleeper alarm | — | check |
| Favourites | 3 | Unlimited |
| Offline maps | — | check |

   Footnote: "Pro never shows ads."
5. SectionHeader "Choose your plan" and three PlanCards with a gap of 12:
   - Yearly (selected by default): Badges "7 days free" and "Save 58 %". "€0.83 a month, billed yearly". €9.99 / year.
   - Monthly: "Cancel anytime". €1.99 / month.
   - Lifetime: "Pay once, keep it". €14.99 / once.
6. The price source line (`bodyS` `textTertiary`, `earth` 16).
7. TrialTimeline, only for yearly with a trial.
8. Legal note (`bodyS` `textTertiary`, centred): "Cancel anytime in Google Play. Subscriptions renew automatically until you cancel." with links to Terms and Privacy.
9. StickyFooter:
   - Helper line: "Free until 17 Oct, then €9.99 a year." (yearly with trial only).
   - Button L, by plan: "Start 7-day free trial", "Get Pro for €1.99 a month" or "Buy Lifetime for €14.99".

*States*
- **Loading prices:** 3 skeleton cards. The button is disabled and reads "Loading prices…".
- **Store unreachable:** a danger Banner "Couldn't reach Google Play. Check your connection." with the action "Try again". Table prices stay visible; the button is disabled.
- **Pending payment:** a warning Banner "Payment pending. Pro turns on when Google Play confirms."
- **Already Pro:** items 5 to 9 are replaced by a Card with `check-decagram` in `success`, "You have Pro", the plan details and "Manage subscription".
- **Granted Pro:** a Card "Pro is a gift until 31 Dec 2026". The plans stay below with the header "Subscribe for later".
- **Screenshot or test builds without a store key:** a neutral Banner "Test build. Prices are examples." It is hidden in screenshot builds.
- **Success:** the Paywall closes, the toast "Welcome to Pro" shows, and a success haptic plays.
- **Failure:** the toast "The purchase didn't go through. Please try again." A cancelled purchase shows no message.

*Admin preview:* AdminPrice can open the Paywall with a `previewRegion` param. It then shows the banner "Admin preview: prices for India".

#### Redeem code (route `Redeem`, modal)

*Layout, top to bottom*
1. TopBar `close` "Redeem a code".
2. `bodyM` `textSecondary` "Got a code from StopWake or a partner? Enter it here."
3. A `code` TextField labelled "Code", placeholder "SPRING26".
4. If the clipboard (expo-clipboard) holds 6 to 16 characters of A–Z, 0–9 and "-": an assist chip "Paste SPRING26".
5. StickyFooter: Button L "Redeem", disabled while the field is empty.

*Errors* (inline under the field)
- "We don't know this code. Check the spelling."
- "This code expired on 30 Sep 2026."
- "This code has been used up."
- "You've already used this code."
- Offline: "Redeeming needs internet."

*Success* (replaces the content)
- A 72 `accentSoft` circle with `crown` 36 in `accentInk`.
- `titleL` "Pro is on".
- `bodyL` "1 month of StopWake Pro, until 10 Nov 2026."
- Button L "Done", plus a success haptic.

The deep link `stopwake://redeem/CODE` opens this screen with the code filled in.

#### Admin area

**Rules for every admin screen**
- Admins sign in through the normal Sign in screen. The `admin` role shows the Admin row in Account.
- Every mutation waits for the server. No optimistic UI.
- Every change to a plan, role, status, price, setting or code needs a reason (minimum 3 characters). Notes are the only exception.
- Success shows a toast and writes an audit entry. Failure shows an inline error and keeps the form.
- Make admin and Delete user also ask for the acting admin's own password.
- Admins cannot disable, delete or remove the admin role from themselves. Those actions are disabled with the helper "You can't do this to your own account". The last admin cannot lose the role.
- All admin screens need internet. Offline they show cached data with a neutral Banner "Offline. Showing data from 10 min ago." and every action is disabled.
- Lists support pull-to-refresh (`RefreshControl` in `primary`) and cursor pagination: 50 per page, a spinner in the footer while loading, and `bodyS` "That's everyone" at the end.

**AdminHome (dashboard)**
1. TopBar "Admin" with an "Admin" Badge.
2. SegmentedControl: 7 days, 30 days, All.
3. A 2 × 2 grid of KPI StatTiles (`numM`, pressable, each opens the Users list with a filter):
   - Users "12,481" ("+312 this week").
   - Pro, paid "1,204" ("9.6 %").
   - Pro, free "186" ("grants and codes").
   - Sign-ups "312" ("last 7 days").
4. Card "Users by plan":
   - A stacked bar, 12 tall, radius `pill`, using the chart colours.
   - Legend rows: dot, plan, count in `labelM` tabular, percent in `bodyS` `textTertiary`. Free 11,091 · Monthly 241 · Yearly 802 · Lifetime 161 · Granted 186.
5. Card "Users by country":
   - The top 7 countries plus "Other". Each row: flag, name, a 4 dp `primary` bar sized to its share, count and percent.
   - Header action "See all".
6. Section "Recent sign-ups" (5 rows):
   - Each row: a 40 Avatar, the email (or "Guest"), and `bodyS` "SW-7K3P-92QX · Germany · 2 h ago".
   - Trailing `PlanBadge sm`.
   - Header action "See all".
7. Section "Recent admin actions" (5 rows). Same format as the Audit log. Header action "See all".
8. Section "Manage": Users (`account-multiple-outline`, value "12,481"), Promo codes (`ticket-percent-outline`, "3 active"), Pricing by country (`cash-multiple`, "11 currencies"), App settings (`application-cog-outline`), Audit log (`clipboard-text-clock-outline`).

**AdminUsers**
1. TopBar "Users" with an "Admin" Badge.
2. SearchField `inline` "Email, name or ID (SW-…)", 300 ms debounce.
3. Filter chips:
   - Plan: All, Free, Pro, Granted, Lifetime.
   - Admins, Disabled.
   - A country chip (opens `CountryPicker`, which has its own search).
   - A sort chip "Newest" (opens a ModalSheet: Newest, Oldest, Last seen, Email A–Z).
4. `bodyS` `textTertiary` "1,204 users".
5. Dense rows (64 tall):
   - Leading: a 40 Avatar with the admin or disabled badge.
   - Title: the email, or "Guest" with the ID.
   - Meta: "SW-7K3P-92QX · Germany · joined 3 Oct".
   - Trailing: `PlanBadge sm` and a source Badge.

*States:* skeleton rows while loading. No results: "No users match “anna@”" with the action "Clear filters".

**AdminUser (user detail)**
1. TopBar "User" with an overflow menu (ModalSheet):
   - "Send password reset code" (only when the user has an email).
   - "Sign out everywhere".
   - "Make admin" or "Remove admin".
   - "Disable account" or "Enable account".
   - "Delete user" (danger).
2. Profile Card:
   - A 64 Avatar, the name or email in `titleM`, and the ID chip with copy.
   - A Badge row: PlanBadge, "Admin", "Disabled" (danger), and the country.
   - `bodyS` `textTertiary`: "Joined 3 Oct 2026 · last seen 2 h ago · Android 14 · app 1.0.0 (42)".
3. Plan Card:
   - `PlanBadge lg` "PRO" and `titleS` "Pro · Yearly".
   - "Active until 12 Oct 2027".
   - Source line in `bodyM` `textSecondary`: "Source: admin grant by admin@stopwake.example", "Source: Google Play subscription" or "Source: code SPRING26".
   - Actions in a 2-column grid of Buttons M:
     - "Grant Pro" (`gift-outline`, primary).
     - "Change plan" (`swap-horizontal`, secondary).
     - "Extend" (`calendar-clock`, secondary; only when a grant is active).
     - "Revoke" (`dangerOutline`; only when a grant is active).
4. Section "Store subscription" (KeyValueRows):
   - Product "pro_yearly".
   - Status: "Active · renews automatically", "In trial until 17 Oct", "Cancelled · ends 12 Oct 2027" or "None".
   - Store "Google Play". Since "12 Oct 2026". Price "€9.99".
   - A row "Open in RevenueCat" with `open-in-new`.
5. Section "Grants history":
   - One row per grant: `gift-outline` in `success`, title "Pro · 1 month", `bodyS` "10 Oct → 10 Nov 2026 · by admin@stopwake.example · “Beta tester”".
   - Trailing Badge: Active (success), Expired (neutral) or Revoked (danger).
   - With no grants: inline "No grants yet".
6. Section "Notes":
   - Each note in `bodyM`, with meta "admin@… · 10 Oct, 14:02".
   - A row "Add note" opens `AdminNote` (a multiline field and "Save").
7. Section "Danger zone": "Disable account" (`account-cancel-outline`) and "Delete user" (`delete-forever-outline`, danger).

*Mutation screens (full-screen modals with a TopBar `close` and a StickyFooter primary button)*

**AdminGrant**, "Grant free Pro"
- Choice chips: 7 days, 1 month, 3 months, 1 year, Lifetime, Custom. Custom shows a DateField.
- Preview Card: "Pro until Tue, 10 Nov 2026" or "Pro forever".
- Reason field (required, multiline).
- If the user already pays: an info Banner "This user already pays through Google Play. A grant only matters if their subscription ends."
- Button "Grant Pro". Afterwards the toast "Pro granted to anna.keller@example.com until 10 Nov 2026".

**AdminChangePlan**, "Change plan"
- Radio rows:
  - Free / "Removes grants and codes. Doesn't touch store subscriptions."
  - Monthly and Yearly / "Manual plan with an end date". A DateField defaults to +1 month or +1 year.
  - Lifetime.
- Reason field.
- A warning Banner when the user has a store subscription: "Store subscriptions can only be cancelled by the user in Google Play or refunded in Play Console."
- Button "Change plan".

**AdminExtend**
- Chips: +7 days, +1 month, +3 months, +1 year, Custom.
- Preview: "New end date: 10 Feb 2027".
- Reason field. Button "Extend".

**Dialogs for the other actions** (ConfirmDialogs with a reason field)
- **Revoke** (danger): "Revoke this grant?" / "anna.keller@example.com goes back to Free now."
- **Make admin** (password required): "Make anna.keller@example.com an admin?" / "Admins can see every user and change plans."
- **Disable:** "Signs them out everywhere. They can't sign in until you enable the account."
- **Delete:** type the user's email, enter your own password.

**AdminPromos**
1. TopBar "Promo codes" with a trailing `plus` IconButton that opens AdminPromoNew.
2. Filter chips: Active, Expired, Off, All.
3. Rows:
   - Title: the code in `labelL` tabular with tracking 0.5.
   - `bodyS`: "1 month of Pro · 142 of 500 used · until 30 Nov".
   - Trailing Badge: Active (success), Expired (neutral) or Off (danger).
   - Tapping a row opens AdminPromo.

*Empty:* "No promo codes yet" with the button "Create code".

**AdminPromo**
- Header: the code in `numM` with copy.
- KeyValueRows: Gives, Used (with a ProgressBar), Valid until, One per person, Created by, Note.
- Actions: "Copy code" and "Copy link" (`stopwake://redeem/SPRING26`).
- Section "Recent redemptions": 32 Avatar, email and date per row.
- "Deactivate code" (danger, ConfirmDialog with a reason).

**AdminPromoNew**
- A `code` field, with a ghost "Generate" button that creates 8 random characters without 0, O, 1, I or L.
- "Gives" choice chips: 7 days, 1 month, 3 months, 1 year, Lifetime.
- "Max uses": a decimal field; empty means unlimited.
- "Valid until": an optional DateField.
- SwitchRow "One per person" (on by default).
- "Internal note".
- Preview Card: "SPRING26 gives 1 month of Pro · up to 500 people · until 30 Nov 2026".
- Button "Create code".

**AdminPricing**
1. TopBar "Pricing by country".
2. `bodyS`: "Shown on the paywall when Google Play prices aren't available. Keep these in step with Play Console."
3. SegmentedControl: "By currency", "By country".
4. SearchField `inline`.
5. A pinned header row in `labelS` `textSecondary`: Country/currency · Month · Year · Lifetime.
6. Rows:
   - Leading: a 24 flag, or the currency code in a 40 `fill` circle.
   - Title: "Switzerland · CHF".
   - Three right-aligned 64-wide `labelM` tabular cells, for example "2.20", "11.00", "17.00" (whatever `pricing.ts` holds).
   - A 6 dp `primary` dot marks a row that overrides the default.
7. "By currency" shows 11 groups: EUR (euro area), CHF, GBP, SEK, NOK, DKK, USD (USA and every other country), CAD, AUD, JPY, INR. "By country" lists every country with its group.

**AdminPrice**
- Title "Switzerland · CHF".
- Fields Monthly, Yearly and Lifetime (`decimal`, the currency as a trailing unit; 0 decimals for JPY).
- Trial chips: 0, 3, 7, 14.
- Preview: "CHF 11.00 / year · CHF 0.91 a month · save 58 %".
- Warning when the yearly price is at least 12 × monthly.
- Info Banner: "Google Play prices win when the store is connected. Update Play Console too."
- Actions: "Preview paywall", "Reset to default" (ghost danger, overrides only) and Save.

**AdminSettings**
1. TopBar "App settings".
2. Sections:
   - "Free plan": a Stepper "Free favourites" (1 to 20).
   - "Pro features": SwitchRows "Heavy sleeper alarm", "Unlimited favourites" and "Offline maps" (on means Pro only). Footer: "Turning a feature off makes it free for everyone."
   - "Trial": "Free trial length" with chips 0, 3, 7, 14, 30 days. Footer: "Shown when Google Play isn't connected. Change the Play Console offer to match."
   - "Announcement":
     - SwitchRow "Show announcement".
     - Multiline "Message" (140 characters).
     - "Link (optional)".
     - SegmentedControl tone: Info, Warning, Promo.
     - SegmentedControl audience: Everyone, Free, Pro.
     - "Ends" DateField.
     - A live Banner preview, as it will look on the map.
   - "Support": "Support email" field.
3. Meta line: "Last changed by admin@stopwake.example · 10 Oct, 14:02".
4. A StickyFooter appears once something changes: Button L "Publish changes" with a ghost "Discard". Publishing opens a ConfirmDialog with a reason: "Publish to all users?" / "Apps pick up changes within an hour."

**AdminAudit**
1. TopBar "Audit log" with a filter IconButton.
2. Chips: All, Grants, Plans, Codes, Prices, Settings, Accounts.
3. SearchField "User, admin or ID".
4. Rows grouped by day:
   - Leading: a 32 tone circle with an icon:
     - Grant created: `gift-outline` (success).
     - Grant extended: `calendar-clock` (primary).
     - Grant revoked: `close-octagon-outline` (danger).
     - Plan changed: `swap-horizontal` (primary).
     - Role changed: `shield-account-outline` (warning).
     - Disabled or enabled: `account-cancel-outline` / `account-check` (danger / success).
     - Deleted: `delete-forever-outline` (danger).
     - Note: `note-text-outline` (neutral).
     - Code: `ticket-percent-outline` (primary).
     - Price: `cash-multiple` (primary).
     - Settings: `application-cog-outline` (primary).
   - Title: "admin@… granted Pro (1 month)".
   - `bodyS`: "to anna.keller@example.com · “Beta tester”".
   - Trailing: the time in `labelS` `textTertiary`.
5. Tapping a row opens a ModalSheet with a before → after diff as KeyValueRows ("Plan: Free → Pro (grant)", "Ends: — → 10 Nov 2026") and the button "Open user".

*Empty:* "No admin actions yet".

---

## 5. Copy tone and microcopy

**Rules**
1. Short, plain and friendly, in the second person. One idea per sentence and at most 2 sentences per message.
2. Sentence case everywhere: titles, buttons, tabs, headers. No exclamation marks, except on the alarm itself ("Wake up!").
3. Buttons start with a verb and name the result: "Start alarm", "Save to favourites", "Grant Pro". Avoid "OK" and "Submit".
4. Never use jargon: no geofence, radius, foreground service, entitlement, token, dead reckoning, sync error, HTTP code. "GPS" is fine.
5. Be honest about reliability: write "about 2 min", never "exactly". Say what happens next when something degrades.
6. Errors say what happened and what to do, with a button that does it. Never blame the user.
7. Numbers are numerals with a non-breaking space before the unit (`2\u00A0min`, `300\u00A0m`). Format distance, time, date and currency with the locale (`formatDistance`, `Intl.DateTimeFormat`, `Intl.NumberFormat`). Estimates start with "≈".
8. Money copy always shows the period, the renewal and how to cancel. Trial copy shows the exact end date and price.
9. Admin copy is precise. Logs are in the past tense and name who, what, whom and why. Confirmations state the consequence.
10. Leave room for translation: allow 30 % expansion for German. Never concatenate translated fragments; use placeholders. Every string has a key in `src/i18n/en/*.ts`.

**Glossary:** *stop* (any station or stop; "train station" only as a kind label) · *trip* (from Start alarm until you arrive; the try-out is a *demo trip*) · *alarm* · *wake me … before* · *favourites* · *Free*, *Pro*, *Monthly*, *Yearly*, *Lifetime* · *code* (not "voucher") · *guest*, *account*, *ID*.

**Example strings**

| # | Where | String |
|---|---|---|
| 1 | MapSheet search placeholder | Where are you going? |
| 2 | Stop sheet rule line | Rings about 2 min before you arrive |
| 3 | Train warning | 200 m is only seconds on a train. Wake 2 min before instead? · **Use 2 min** |
| 4 | Trip, GPS lost | No GPS in the tunnel. We're estimating your position and will still wake you. |
| 5 | Offline pill | Offline · stops and alarms still work |
| 6 | End-trip dialog | End this trip? / The alarm won't ring. · **Keep going** · **End trip** |
| 7 | Paywall trial helper | Free until 17 Oct, then €9.99 a year. Cancel anytime in Google Play. |
| 8 | Guest banner | Keep Pro on every phone. Create a free account and your ID SW-7K3P-92QX comes with you. |
| 9 | Admin grant toast | Pro granted to anna.keller@example.com until 10 Nov 2026 |
| 10 | Arrived, stopped by the phone | Your phone stopped the trip. A battery saver closed StopWake before you arrived. It takes a minute to fix. · **Fix battery settings** |

---

## 6. Screenshot storyboard

**Capture setup** (the existing `e2e/screenshots.sh` flow, extended)
- **Device:** 720 × 1600 at 280 dpi (411 × 914 dp). Demo status bar at 08:15, battery 100 %, LTE.
- **Locale:** `en-DE` unless noted. Light theme unless noted.
- **Server:** StopWake Cloud runs in CI with `--seed screenshots`. The seed has 12,481 fictional users at example.com, the grants, codes and audit entries shown below, and the admin `admin@stopwake.example`.
- **App build:** built with `EXPO_PUBLIC_SCREENSHOTS=1`. This enables `stopwake://debug/seed`, which loads 3 favourites (München Hbf, Marienplatz, Ostbahnhof), 4 recents and 14 October trips (12 real, 2 demo).
- **Plan source:** with no store key, the plan comes from the server only. The test-build banner is hidden, and the Paywall shows the region's table prices.
- **GPS:** the existing route feeder. For #11, stop feeding fixes for about 25 s so the trip switches to estimated.
- **Store listing:** ★ marks the 8 store-listing picks, with suggested captions.

| # | File | Screen | State and data |
|---|---|---|---|
| 01 | `01-welcome.png` | Onboarding page 1 | Language chip "English", route-strip illustration, button "Continue" |
| 02 | `02-language.png` | Language (from onboarding) | "Phone language (English)" selected, all 11 languages visible |
| 03 | `03-permissions.png` | Permissions priming | 3 rows, "Allow access" and "Not now" |
| 04 | `04-setup.png` | Setup | 5 of 6 done. The battery row is open with its "Open settings" button. Status "1 thing to improve" |
| 05 ★ | `05-map-nearby.png` | Map, browse at `half` | Odeonsplatz, Munich, zoom 15.5. 3 favourite chips. Nearby from the real DB: München Odeonsplatz 50 m, Odeonsplatz (U, Bus) 100 m, Maximiliansplatz 360 m, Von-der-Tann-Straße 360 m, Nationaltheater (Tram) 370 m. Caption: "Every stop on the map" |
| 06 | `06-map-dark.png` | Map, dark theme, `peek` | Same place. Pro user, so the avatar has the amber ring. Calm dark map |
| 07 ★ | `07-search.png` | MapSheet, search mode | "muenchen hbf": München Hbf (ICE IC RE S) 1.4 km, München Hbf (tief) (S), Hauptbahnhof (U Tram), plus the Addresses section. Caption: "Finds any stop, even offline" |
| 08 ★ | `08-stop.png` | Stop mode | München Hbf, Minutes, **2 min**, "Rings about 2 min before you arrive", Start alarm. Caption: "Two taps to sleep" |
| 09 | `09-stop-options.png` | Stop mode, options open | Arrive, Normal, Heavy sleeper locked (Free), demo-trip row |
| 10 ★ | `10-trip.png` | Trip | Bus speed. 1.3 km, 6 min, "at 08:21", GPS good ±5 m, progress 55 %, rule pill. Caption: "Your trip at a glance" |
| 11 ★ | `11-trip-underground.png` | Trip, estimated | "≈ 2.4 km", "≈ 4 min", "No GPS · estimating" Badge, dashed puck, tunnel banner. Caption: "Keeps going underground" |
| 12 ★ | `12-alarm.png` | Native alarm | "Wake up!", "München Hbf", "About 2 min to go", slide to dismiss, Snooze 1 min. Caption: "Rings even on silent" |
| 13 | `13-arrived.png` | Arrived | "You made it", "München Hbf · 08:21", tiles 6 min / 1.4 km / 2 min before, feedback chips, save favourite |
| 14 | `14-tripbar.png` | Saved tab with TripBar | Trip minimised: "München Hbf · 1.3 km · 6 min · GPS good" above the tab bar |
| 15 | `15-saved.png` | Saved | Free user, 3 favourites, "3 of 3 favourites used" banner, 4 recents |
| 16 ★ | `16-activity.png` | Activity | October 2026: 12 trips, 184 km, 92 % on time, 6 h 40 min. Today and yesterday groups with outcome badges. Caption: "See how every trip went" |
| 17 | `17-account-guest.png` | Account, guest | ID SW-7K3P-92QX, "Keep Pro on every phone" banner, Free plan card with "Get Pro · 7 days free" |
| 18 | `18-sign-in.png` | Sign in | The admin email typed in, password hidden |
| 19 | `19-account-pro.png` | Account, signed in | Anna Keller (fictional), PRO, "Free until 31 Dec 2026 · gift from StopWake", Alarm reliability "All set" |
| 20 ★ | `20-paywall-de.png` | Paywall, `en-DE` | Comparison table. Yearly €9.99 selected, "7 days free" and "Save 58 %", €1.99, €14.99. "Prices for Germany in EUR…". Caption: "Pro, priced for your country" |
| 21 | `21-paywall-in.png` | Paywall, `en-IN` | The same layout with INR prices from `pricing.ts` and "Prices for India in INR…" |
| 22 | `22-redeem.png` | Redeem, success | "Pro is on", "1 month of StopWake Pro, until 10 Nov 2026" |
| 23 | `23-settings.png` | Settings | All sections. Values: English, Kilometres, System, "Germany + 2", "All set" |
| 24 | `24-countries.png` | Countries | Austria "Downloading 42 %", Switzerland installed (24,657 stops), Luxembourg "Update available", the rest with download sizes |
| 25 | `25-admin-dashboard.png` | AdminHome | KPIs 12,481 / 1,204 / 186 / 312, plan bar, by country (Germany 7,912 · Austria 1,104 · Switzerland 846 · India 640 · …), recent sign-ups |
| 26 | `26-admin-users.png` | AdminUsers | Filter "Granted" selected, "186 users", 8 rows with plan and source badges |
| 27 | `27-admin-user.png` | AdminUser | anna.keller@example.com: PRO grant until 31 Dec 2026, store "None", 2 grants in history, 1 note |
| 28 | `28-admin-grant.png` | AdminGrant | "1 month" selected, reason "Beta tester", preview "Pro until Tue, 10 Nov 2026" |
| 29 | `29-admin-promos.png` | AdminPromos | SPRING26 (142 of 500), BETA-TESTERS (38 of 50), PRESS2026 (Lifetime, 4 of 10), WELCOME7 (Expired) |
| 30 | `30-admin-pricing.png` | AdminPricing, by currency | 11 currency rows with `pricing.ts` values. The CHF row is marked as an override |
| 31 | `31-admin-settings.png` | AdminSettings | Announcement on: "New: stops for France are here." (Info, Everyone), live preview, favourites stepper at 3 |
| 32 | `32-admin-audit.png` | AdminAudit | Today: a grant, a CHF price change, SPRING26 created, a disabled account with a reason |

---

## 7. Definition of done (visual QA for every screen)

- Uses only tokens and components from this spec. No hex literals and no `Alert.alert` in `src/screens`.
- Works in light and dark mode. `bg` and the React Navigation theme follow the active scheme, and transitions never flash white.
- Works at font scale 1.3 (everything) and 2.0 (body text) on a 360 × 640 dp phone with no clipped text. German strings fit, and Hindi line heights are applied.
- Every target is at least 48 dp. Every icon-only control has an `accessibilityLabel`. TalkBack reads each row as one item and announces trip state changes.
- Loading, empty, error and offline states exist as described in section 4.
- Numbers use tabular figures. Live values never jump in width.
- Reduced motion turns off every non-essential animation.
- `npm run check` passes. `src/ui/tokens.ts`, `src/ui/colors.ts` and `src/map/style.ts` stay free of `react-native` imports and are covered by Vitest (token completeness for both themes, the contrast pairs from 2.1, the map recolour snapshot).