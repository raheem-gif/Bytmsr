Self-hosted web fonts for the public beneficiary pages (v9.1, lane b-site, B91-11).

plex-arabic-400.woff2  IBM Plex Sans Arabic, Regular (400), Arabic unicode-range subset
plex-arabic-700.woff2  IBM Plex Sans Arabic, Bold (700), Arabic unicode-range subset

Source: the unmodified WOFF2 files distributed by Google Fonts for "IBM Plex Sans Arabic" (v15,
"arabic" subset: U+0600-06FF, U+0750-077F, U+0870-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41,
U+FB50-FDFF, U+FE70-FEFC, ...). Latin letters and digits are not in this subset; the browser draws them
with the next font in the stack ('Noto Sans Arabic', 'Noto Naskh Arabic', Tahoma, sans-serif).

Added for the staff/lawyer app /app (v9.1, lane l-home, L-07), same source and licence:
plex-arabic-600.woff2  IBM Plex Sans Arabic, SemiBold (600), Arabic unicode-range subset
plex-latin-400.woff2   IBM Plex Sans Arabic, Regular (400), "latin" subset (digits, codes such as INH-2026-00482)
plex-latin-600.woff2   IBM Plex Sans Arabic, SemiBold (600), "latin" subset
plex-latin-700.woff2   IBM Plex Sans Arabic, Bold (700), "latin" subset
The @font-face rules for /app are at the top of public/assets/css/app.css (font-display: swap).

License: SIL Open Font License 1.1 — see OFL.txt (Copyright 2017 IBM Corp., Reserved Font Name "Plex").
The fonts are served as-is (not modified, renamed or sold).

v12 display faces (lane look, LK-0; design K12-10…K12-14, spec L12-13). Build-time subsets, nothing runs at runtime.

amiri-arabic-400-sub.woff2   41,328 B   Amiri Regular (400), family name in CSS "Emam Display" (headings only).
  Source: @fontsource/amiri 5.3.0 files/amiri-arabic-400-normal.woff2 (108,560 B, sha256 9abf8a10…6249d7).
  Subset with fonttools 4.67.0 (throwaway venv, build time only):
    pyftsubset amiri-arabic-400-normal.woff2 --flavor=woff2 --output-file=amiri-arabic-400-sub.woff2 \
      --unicodes="U+0020,U+00A0,U+00AB,U+00BB,U+060C,U+061B,U+061F,U+0621-063A,U+0640-0655,U+0660-066D,U+0670,U+067E,U+0686,U+06A4,U+06AF,U+06CC,U+200C-200F,U+2013,U+2014"
  (default layout features kept: ccmp, locl, init, medi, fina, rlig, numr, dnom, mark, mkmk, curs, kern; 1,141 glyphs.)
  The source file has no «», no dashes and no U+200F, so the file holds exactly these 76 code points, and the
  @font-face unicode-range (app.css and the public critical block) lists exactly them; any other character falls
  back to IBM Plex Sans Arabic glyph by glyph:
  amiri-code-points: U+0020, U+00A0, U+060C, U+061B, U+061F, U+0621-063A, U+0640-0655, U+0660-066D, U+0670, U+067E, U+0686, U+06A4, U+06AF, U+06CC, U+200C-200E
  Licence: SIL OFL 1.1, Copyright 2010-2022 The Amiri Project Authors. No Reserved Font Name (see OFL.txt).

cormorant-latin-500-sub.woff2   11,912 B   Cormorant Garamond Medium (500), the Latin letters and digits of "Emam Display".
  Source: @fontsource/cormorant-garamond 5.3.0 files/cormorant-garamond-latin-500-normal.woff2 (23,312 B).
    pyftsubset cormorant-garamond-latin-500-normal.woff2 --flavor=woff2 --output-file=cormorant-latin-500-sub.woff2 \
      --unicodes="U+0020-007E,U+00A0,U+00A9,U+00AB,U+00B7,U+00BB,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2026" \
      --layout-features='kern,liga,onum,pnum,lnum,tnum'
  The space and U+00A0 belong to the Amiri face (unicode-range U+0021-007E, U+00A9, U+00AB, U+00B7, U+00BB, U+2013-2014,
  U+2018-2019, U+201C-201D, U+2026), so a page downloads this file only when a Latin letter, a digit or one of these
  marks appears in display text.
  Licence: SIL OFL 1.1, Copyright 2015 The Cormorant Project Authors. No Reserved Font Name (see OFL.txt).

Both use font-display: optional (no swap shift). Amiri is preloaded only on /services (and not with Save-Data: on).
The service worker caches every .woff2 under /assets/fonts/ (src/site.js listAssets).
