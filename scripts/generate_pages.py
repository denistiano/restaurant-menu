#!/usr/bin/env python3
"""
Generate per-restaurant index.html (SEO + icons), sitemap.xml, robots.txt.
Reads resources/restaurants.json and resources/seo-config.json.
"""
from __future__ import annotations

import html as html_lib
import json
import pathlib
import re
import sys
from typing import Any
from urllib.parse import quote


def load_json(path: pathlib.Path) -> Any:
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def strip_html_for_meta(s: str, max_len: int = 160) -> str:
    s = re.sub(r"<[^>]+>", "", s)
    s = " ".join(s.split())
    if len(s) <= max_len:
        return s
    return s[: max_len - 1].rsplit(" ", 1)[0] + "…"


def resolve_asset_href(restaurant_id: str, value: str | None) -> str | None:
    """Href from restaurant page (in /<id>/index.html): ../resources/... or absolute URL."""
    if not value or not str(value).strip():
        return None
    v = str(value).strip()
    if v.startswith(("http://", "https://")):
        return v
    if v.startswith("//"):
        return "https:" + v
    return f"../resources/{restaurant_id}/{v}"


def absolute_url(base: str, path: str) -> str:
    base = base.rstrip("/")
    path = path if path.startswith("/") else "/" + path
    return base + path


def main() -> int:
    root = pathlib.Path(sys.argv[1]).resolve()
    restaurants_path = root / "resources" / "restaurants.json"
    seo_path = root / "resources" / "seo-config.json"

    if not restaurants_path.is_file():
        print(f"error: missing {restaurants_path}", file=sys.stderr)
        return 1

    restaurants = json.loads(restaurants_path.read_text(encoding="utf-8"))
    if not isinstance(restaurants, list):
        print("error: restaurants.json must be a list", file=sys.stderr)
        return 1

    seo = load_json(seo_path)
    base_url = (seo.get("base_url") or "").strip().rstrip("/")
    site_name = (seo.get("site_name") or "e-Menu").strip()
    site_name_bg = (seo.get("site_name_bg") or site_name).strip()
    org_name = (seo.get("organization_name") or site_name).strip()
    og_locale = (seo.get("default_og_locale") or "bg_BG").strip()
    og_locale_alt = (seo.get("alternate_og_locale") or "en_US").strip()
    twitter_site = (seo.get("twitter_site") or "").strip()
    gsv = (seo.get("google_site_verification") or "").strip()
    theme_color = (seo.get("theme_color") or "#0c0c14").strip()

    for r in restaurants:
        rid = r.get("id")
        if not rid or not isinstance(rid, str):
            print("skip: entry without string id", r, file=sys.stderr)
            continue

        name = r.get("name") or {}
        desc = r.get("description") or {}
        title_en = (name.get("en") or rid).strip()
        title_bg = (name.get("bg") or title_en).strip()
        desc_en = strip_html_for_meta(str(desc.get("en") or ""))
        desc_bg = strip_html_for_meta(str(desc.get("bg") or desc_en or ""))
        default_lang = (r.get("default_language") or "bg").strip().lower()
        if default_lang not in ("en", "bg"):
            default_lang = "bg"

        html_lang = "bg" if default_lang == "bg" else "en"
        title_primary = title_bg if default_lang == "bg" else title_en
        desc_primary = desc_bg if default_lang == "bg" else desc_en
        page_title = f"{title_primary} — {site_name_bg if default_lang == 'bg' else site_name}"

        image_href = resolve_asset_href(rid, r.get("image"))
        logo_raw = r.get("logo")
        logo_href = resolve_asset_href(rid, logo_raw) if logo_raw else None
        icon_href = logo_href or image_href

        canonical = absolute_url(base_url, f"{quote(rid)}/") if base_url else ""

        keywords = r.get("keywords")
        kw_content = ""
        if isinstance(keywords, list) and keywords:
            kw_content = ", ".join(str(x).strip() for x in keywords if str(x).strip())

        same_as = r.get("same_as")
        same_as_list: list[str] = []
        if isinstance(same_as, list):
            same_as_list = [str(x).strip() for x in same_as if str(x).strip()]

        def absolute_og_image(raw: str | None) -> str | None:
            if not raw or not str(raw).strip():
                return None
            v = str(raw).strip()
            if v.startswith("https://") or v.startswith("http://"):
                return v
            if v.startswith("//"):
                return "https:" + v
            if base_url:
                return absolute_url(base_url, f"resources/{rid}/{v}")
            return None

        og_image = absolute_og_image(r.get("image"))

        # JSON-LD
        ld_nodes: list[dict[str, Any]] = []
        if base_url and canonical:
            ld_nodes.append(
                {
                    "@type": "WebSite",
                    "@id": base_url + "/#website",
                    "name": site_name,
                    "url": base_url + "/",
                    "publisher": {"@type": "Organization", "name": org_name},
                }
            )
            ld_nodes.append(
                {
                    "@type": "WebPage",
                    "@id": canonical + "#webpage",
                    "url": canonical,
                    "name": title_en,
                    "description": desc_en or desc_bg,
                    "inLanguage": ["en", "bg"],
                    "isPartOf": {"@id": base_url + "/#website"},
                }
            )
            rest_ld: dict[str, Any] = {
                "@type": "Restaurant",
                "@id": canonical + "#restaurant",
                "name": title_en,
                "description": desc_en or desc_bg,
                "url": canonical,
                "inLanguage": ["en", "bg"],
            }
            if title_bg and title_bg != title_en:
                rest_ld["alternateName"] = title_bg
            imgs: list[str] = []
            for u in (og_image, absolute_og_image(logo_raw) if logo_raw else None):
                if u and u not in imgs:
                    imgs.append(u)
            if imgs:
                rest_ld["image"] = imgs
            rest_ld["hasMenu"] = {"@type": "Menu", "name": "Menu", "url": canonical}
            if same_as_list:
                rest_ld["sameAs"] = same_as_list
            ld_nodes.append(rest_ld)
            ld_nodes.append(
                {
                    "@type": "BreadcrumbList",
                    "itemListElement": [
                        {
                            "@type": "ListItem",
                            "position": 1,
                            "name": site_name,
                            "item": base_url + "/",
                        },
                        {
                            "@type": "ListItem",
                            "position": 2,
                            "name": title_primary,
                            "item": canonical,
                        },
                    ],
                }
            )

        ld_json = json.dumps(
            {"@context": "https://schema.org", "@graph": ld_nodes},
            ensure_ascii=False,
            separators=(",", ":"),
        )

        # --- Build <head> fragments ---
        icon_block = ""
        if icon_href:
            ext = pathlib.Path(icon_href.split("?")[0]).suffix.lower()
            mime = "image/svg+xml" if ext == ".svg" else "image/png" if ext in (".png", ".webp") else "image/jpeg"
            icon_block = f"""  <link rel="icon" href="{html_lib.escape(icon_href)}" type="{mime}" sizes="any" />
  <link rel="apple-touch-icon" href="{html_lib.escape(icon_href)}" />
"""

        canonical_block = ""
        if canonical:
            canonical_block = f'  <link rel="canonical" href="{html_lib.escape(canonical)}" />\n'

        meta_robots = (
            '  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />\n'
        )

        kw_block = ""
        if kw_content:
            kw_block = f'  <meta name="keywords" content="{html_lib.escape(kw_content)}" />\n'

        gsv_block = ""
        if gsv:
            gsv_block = f'  <meta name="google-site-verification" content="{html_lib.escape(gsv)}" />\n'

        og_url = canonical or ""
        og_block = f"""  <meta property="og:type" content="website" />
  <meta property="og:title" content="{html_lib.escape(title_primary)}" />
  <meta property="og:description" content="{html_lib.escape(desc_primary)}" />
  <meta property="og:site_name" content="{html_lib.escape(site_name)}" />
  <meta property="og:locale" content="{html_lib.escape(og_locale)}" />
  <meta property="og:locale:alternate" content="{html_lib.escape(og_locale_alt)}" />
"""
        if og_url:
            og_block += f'  <meta property="og:url" content="{html_lib.escape(og_url)}" />\n'
        if og_image and str(og_image).startswith("http"):
            og_block += f'  <meta property="og:image" content="{html_lib.escape(str(og_image))}" />\n'
            og_block += '  <meta property="og:image:alt" content="' + html_lib.escape(title_primary) + '" />\n'

        tw_block = """  <meta name="twitter:card" content="summary_large_image" />
"""
        if twitter_site:
            tw_block += f'  <meta name="twitter:site" content="{html_lib.escape(twitter_site)}" />\n'
        tw_block += f'  <meta name="twitter:title" content="{html_lib.escape(title_primary)}" />\n'
        tw_block += f'  <meta name="twitter:description" content="{html_lib.escape(desc_primary)}" />\n'
        if og_image and str(og_image).startswith("http"):
            tw_block += f'  <meta name="twitter:image" content="{html_lib.escape(str(og_image))}" />\n'

        jsonld_block = ""
        if ld_nodes:
            jsonld_block = (
                f'  <script type="application/ld+json" id="seo-jsonld">{ld_json}</script>\n'
            )

        head_extra = (
            canonical_block
            + meta_robots
            + kw_block
            + gsv_block
            + f'  <meta name="theme-color" content="{html_lib.escape(theme_color)}" />\n'
            + f'  <meta name="apple-mobile-web-app-title" content="{html_lib.escape(title_primary[:64])}" />\n'
            + og_block
            + tw_block
            + jsonld_block
        )

        page = f"""<!DOCTYPE html>
<html lang="{html_lib.escape(html_lang)}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />
  <title>{html_lib.escape(page_title)}</title>
  <meta id="seo-meta-desc" name="description" content="{html_lib.escape(desc_primary)}" />
{icon_block}{head_extra}  <link rel="stylesheet" href="../css/style.css" />
</head>
<body class="restaurant-page">

  <div id="restaurant-root">
    <div class="loading-spinner fullscreen" id="loadingSpinner">
      <div class="spinner"></div>
    </div>
  </div>

  <script>
    window.RESTAURANT_ID = {json.dumps(rid)};
    window.RESOURCES_BASE = '../resources';
    window.__SEO__ = {{
      siteName: {json.dumps(site_name)},
      siteNameBg: {json.dumps(site_name_bg)},
      baseUrl: {json.dumps(base_url)},
      canonicalPath: {json.dumps("/" + rid + "/")},
      defaultOgLocale: {json.dumps(og_locale)},
      alternateOgLocale: {json.dumps(og_locale_alt)},
      twitterSite: {json.dumps(twitter_site)},
      titleEn: {json.dumps(title_en)},
      titleBg: {json.dumps(title_bg)},
      descEn: {json.dumps(desc_en)},
      descBg: {json.dumps(desc_bg)}
    }};
  </script>
  <script type="module" src="../js/analytics.js"></script>
  <script src="../js/restaurant.js"></script>
</body>
</html>
"""

        out_dir = root / rid
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "index.html").write_text(page, encoding="utf-8")
        print(f"generated {out_dir / 'index.html'}")

    # --- sitemap.xml & robots.txt ---
    if base_url:
        urls: list[tuple[str, str]] = [(base_url + "/", "1.0", "weekly")]
        for r in restaurants:
            rid = r.get("id")
            if isinstance(rid, str) and rid:
                urls.append((absolute_url(base_url, quote(rid) + "/"), "0.9", "daily"))

        lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ]
        for loc, priority, changefreq in urls:
            lines.append("  <url>")
            lines.append(f"    <loc>{html_lib.escape(loc)}</loc>")
            lines.append(f"    <changefreq>{changefreq}</changefreq>")
            lines.append(f"    <priority>{priority}</priority>")
            lines.append("  </url>")
        lines.append("</urlset>")
        sitemap_path = root / "sitemap.xml"
        sitemap_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"generated {sitemap_path}")

        robots = [
            "User-agent: *",
            "Allow: /",
            "",
            f"Sitemap: {base_url}/sitemap.xml",
            "",
        ]
        (root / "robots.txt").write_text("\n".join(robots), encoding="utf-8")
        print(f"generated {root / 'robots.txt'}")
    else:
        for stale in (root / "sitemap.xml", root / "robots.txt"):
            if stale.is_file():
                stale.unlink()
                print(f"removed stale {stale.name} (no base_url)", file=sys.stderr)
        print(
            "note: resources/seo-config.json has empty base_url — skipping sitemap.xml and robots.txt (set base_url for full SEO URLs)",
            file=sys.stderr,
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
