#!/usr/bin/env python3
"""
After generate_pages.py patches index.html (restaurant index block):
  - Write bg/index.html and en/index.html with <base href="/">, __LANDING_LOCALE__,
    canonical/og:url per locale, hreflang, locale-aware home links.
  - Write minimal /privacy/, /terms/, /about/, /articles/ (+ two posts).
  - Replace <!--LOCALE_HREFLANG--> in root index.html with hreflang links.

Requires resources/seo-config.json base_url for absolute hreflang.
"""
from __future__ import annotations

import html as html_lib
import json
import pathlib
import re
import sys
from typing import Any


def load_json(path: pathlib.Path) -> Any:
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def hreflang_block(base: str) -> str:
    b = base.rstrip("/")
    return (
        f'  <link rel="alternate" hreflang="bg" href="{html_lib.escape(b + "/bg/")}" />\n'
        f'  <link rel="alternate" hreflang="en" href="{html_lib.escape(b + "/en/")}" />\n'
        f'  <link rel="alternate" hreflang="x-default" href="{html_lib.escape(b + "/bg/")}" />\n'
    )


FAQ_JSON_EN = """{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[
  {"@type":"Question","name":"What is emenu.click?","acceptedAnswer":{"@type":"Answer","text":"emenu.click is a hosting service for Bulgarian restaurants: every venue gets its own mobile-friendly menu page—reachable from a table QR or a short emenu.click link. Guests never download an app; the site simply opens in the phone browser."}},
  {"@type":"Question","name":"Do guests need to install an app?","acceptedAnswer":{"@type":"Answer","text":"No. It is a regular web page tuned for phones—scan the QR or tap the link and you are already browsing categories."}},
  {"@type":"Question","name":"What counts as an electronic / digital menu here?","acceptedAnswer":{"@type":"Answer","text":"Dishes live in structured HTML with categories, photos, filters, and on-page search—clearer for diners and easier for Google than a flat PDF. You edit it through a password-protected admin."}},
  {"@type":"Question","name":"Is there English for tourists?","acceptedAnswer":{"@type":"Answer","text":"Yes. Copy ships in Bulgarian and English, and the guest flips languages on the same URL. When you configure it, prices can also follow a second currency."}},
  {"@type":"Question","name":"Can guests reserve a table online?","acceptedAnswer":{"@type":"Answer","text":"If you switch the feature on—yes. Table requests ride the same lightweight page as your menu (or our live demo cards below) and still stay inside the browser."}},
  {"@type":"Question","name":"How do I get emenu.click for my restaurant?","acceptedAnswer":{"@type":"Answer","text":"Message or ring the contacts on this page—we often publish your opening menu later the same evening."}}
]}"""


def apply_locale_index(html: str, locale: str, base: str) -> str:
    b = base.rstrip("/")
    canonical = f"{b}/{locale}/"
    # <base> + forced locale (before other head content breaks charset? after viewport ok)
    html = html.replace("<head>", '<head>\n  <base href="/" />\n  <script>window.__LANDING_LOCALE__ = "' + locale + '";</script>', 1)
    html = re.sub(r"<html lang=\"[^\"]*\"", f'<html lang="{locale}"', html, count=1)
    esc = html_lib.escape(canonical)
    html = re.sub(
        r'<link rel="canonical" href="[^"]*"',
        f'<link rel="canonical" href="{esc}"',
        html,
        count=1,
    )
    html = re.sub(
        r'<meta property="og:url" content="[^"]*"',
        f'<meta property="og:url" content="{esc}"',
        html,
        count=1,
    )
    # WebSite + WebApplication url (same origin path; match seo-config base_url)
    root_url = b + "/"
    esc_json = canonical.replace("\\", "\\\\").replace('"', '\\"')
    html = html.replace(
        f'"@type":"WebSite","@id":"{b}/#website","name":"emenu.click","url":"{root_url}"',
        f'"@type":"WebSite","@id":"{b}/#website","name":"emenu.click","url":"{esc_json}"',
        1,
    )
    html = html.replace(
        f'"@type":"WebApplication","@id":"{b}/#webapp","name":"emenu.click","url":"{root_url}"',
        f'"@type":"WebApplication","@id":"{b}/#webapp","name":"emenu.click","url":"{esc_json}"',
        1,
    )
    if locale == "en":
        html = re.sub(
            r'<script type="application/ld\+json">\s*\{"@context":"https://schema\.org","@type":"FAQPage"[\s\S]*?\}\s*</script>',
            f'<script type="application/ld+json">\n{FAQ_JSON_EN}\n  </script>',
            html,
            count=1,
        )
        # EN-oriented meta for main discoverability (keep BG keywords in keywords meta for blended intent)
        html = re.sub(
            r"<title>[^<]*</title>",
            "<title>emenu.click — Digital &amp; QR menu for restaurants (Bulgaria) | Bilingual guest menus</title>",
            html,
            count=1,
        )
        html = re.sub(
            r'<meta name="description" content="[^"]*"',
            '<meta name="description" content="Table QR or short emenu.click link—bilingual Bulgarian/English menus for restaurants, often updated the same day you call. Reservations and currency switches when you enable them."',
            html,
            count=1,
        )
        en_title = "emenu.click — Digital &amp; QR menu for restaurants (Bulgaria) | Bilingual guest menus"
        en_desc = (
            "Table QR or short emenu.click link—bilingual menus for Bulgarian dining rooms "
            "and guests abroad. Flip dishes the same afternoon; optional reservations and "
            "second-currency pricing when you configure them."
        )
        html = re.sub(
            r'<meta property="og:title" content="[^"]*"',
            f'<meta property="og:title" content="{en_title}"',
            html,
            count=1,
        )
        html = re.sub(
            r'<meta property="og:description" content="[^"]*"',
            f'<meta property="og:description" content="{html_lib.escape(en_desc)}"',
            html,
            count=1,
        )
        html = re.sub(
            r'<meta property="og:locale" content="[^"]*"',
            '<meta property="og:locale" content="en_US"',
            html,
            count=1,
        )
        html = re.sub(
            r'<meta property="og:locale:alternate" content="[^"]*"',
            '<meta property="og:locale:alternate" content="bg_BG"',
            html,
            count=1,
        )
        html = re.sub(
            r'<meta name="twitter:title" content="[^"]*"',
            f'<meta name="twitter:title" content="{en_title}"',
            html,
            count=1,
        )
        html = re.sub(
            r'<meta name="twitter:description" content="[^"]*"',
            f'<meta name="twitter:description" content="{html_lib.escape(en_desc)}"',
            html,
            count=1,
        )
    # Home links in nav/footer
    html = html.replace('href="./"', f'href="/{locale}/"')
    # hreflang before </head> (skip if already injected into source index)
    if 'rel="alternate" hreflang="bg"' not in html:
        ins = hreflang_block(b)
        if "</head>" in html:
            html = html.replace("</head>", ins + "</head>", 1)
        else:
            html = ins + html
    # Remove placeholder if present (from source template)
    html = html.replace("<!--LOCALE_HREFLANG-->\n", "").replace("<!--LOCALE_HREFLANG-->", "")
    return html


def patch_root_hreflang(index_path: pathlib.Path, base: str) -> None:
    text = index_path.read_text(encoding="utf-8")
    marker = "<!--LOCALE_HREFLANG-->"
    if marker in text:
        text = text.replace(marker, hreflang_block(base.rstrip("/")), 1)
        index_path.write_text(text, encoding="utf-8")
        print(f"injected hreflang into {index_path}")
        return
    if 'rel="alternate" hreflang="bg"' in text:
        print(f"note: hreflang already in {index_path}, skipping")
        return


def rel_to_canonical_url(base_root: str, rel: str) -> str:
    """privacy/index.html -> https://host/privacy/"""
    b = base_root.rstrip("/")
    if not rel.endswith("index.html"):
        return b + "/" + rel
    sub = rel[: -len("index.html")].rstrip("/")
    if not sub:
        return b + "/"
    return b + "/" + sub + "/"


def write_minimal_page(
    root: pathlib.Path,
    rel: str,
    title: str,
    title_bg: str,
    body_html: str,
    base: str,
) -> None:
    canon = rel_to_canonical_url(base, rel)
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    page = f"""<!DOCTYPE html>
<html lang="bg">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <base href="/" />
  <title>{html_lib.escape(title)}</title>
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="{html_lib.escape(canon)}" />
  <link rel="stylesheet" href="/css/style.css" />
  <link rel="icon" href="/favicon.ico" type="image/x-icon" />
</head>
<body class="legal-page">
  <a class="legal-back" href="/bg/">← emenu.click</a>
  <article class="legal-article">
    <h1>{html_lib.escape(title_bg)}</h1>
    {body_html}
  </article>
</body>
</html>
"""
    path.write_text(page, encoding="utf-8")
    print(f"generated {path}")


def main() -> int:
    root = pathlib.Path(sys.argv[1]).resolve()
    seo = load_json(root / "resources" / "seo-config.json")
    base = (seo.get("base_url") or "").strip()
    if not base:
        print("note: empty base_url — skipping locale pages (set base_url in seo-config.json)", file=sys.stderr)
        return 0

    index_path = root / "index.html"
    if not index_path.is_file():
        print("error: missing index.html", file=sys.stderr)
        return 1

    html_src = index_path.read_text(encoding="utf-8")

    for loc in ("bg", "en"):
        out_dir = root / loc
        out_dir.mkdir(parents=True, exist_ok=True)
        out_html = apply_locale_index(html_src, loc, base)
        (out_dir / "index.html").write_text(out_html, encoding="utf-8")
        print(f"generated {out_dir / 'index.html'}")

    patch_root_hreflang(index_path, base)

    b = base.rstrip("/")

    write_minimal_page(
        root,
        "privacy/index.html",
        "Privacy · emenu.click",
        "Поверителност",
        f"""<p class="legal-p">Последна актуализация: април 2026.</p>
    <p class="legal-p">Този сайт използва <strong>основни технически логове</strong> и, при зареден аналитичен модул, <strong>анонимизирани или агрегирани събития</strong> (напр. преглед на страница, език), за да поддържаме услугата и да разберем как се използва менюто. Не продаваме лични данни на трети страни за маркетинг.</p>
    <p class="legal-p">Менютата на ресторантите се хостват като публични страници; съдържанието на менюто предоставя заведението. За изтриване или корекция на данни, свържете се през <a href="{html_lib.escape(b + "/bg/#contact")}">контакт</a>.</p>""",
        base,
    )

    write_minimal_page(
        root,
        "terms/index.html",
        "Terms · emenu.click",
        "Условия за ползване",
        f"""<p class="legal-p">Последна актуализация: април 2026.</p>
    <p class="legal-p">Услугата emenu.click предоставя хостинг и софтуер за <strong>дигитални менюта</strong>. Менютата са за справка; цените и наличността в заведението имат предимство. Заведението носи отговорност за съдържанието на своето меню.</p>
    <p class="legal-p">Злоупотреба, незаконно съдържание или опити за компрометиране на системата могат да доведат до прекратяване на достъпа.</p>""",
        base,
    )

    write_minimal_page(
        root,
        "about/index.html",
        "About · emenu.click",
        "За нас",
        """<p class="legal-p">emenu.click носи <strong>двуезично меню до масата</strong> през QR или кратък линк — гостите го виждат директно в браузъра, без отделни приложения. Държим акцента върху неусложнен опит до чинията и възможност за бързи промени от уеб админ.</p>
    <p class="legal-p">Ако искате да обсъдим партньорство или материали за медии, пишете от контактите на началната страница.</p>""",
        base,
    )

    articles_index = root / "articles/index.html"
    articles_index.parent.mkdir(parents=True, exist_ok=True)
    articles_index.write_text(
        f"""<!DOCTYPE html>
<html lang="bg">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <base href="/" />
  <title>Статии — emenu.click</title>
  <link rel="canonical" href="{html_lib.escape(b + "/articles/")}" />
  <meta name="robots" content="index, follow" />
  <link rel="stylesheet" href="/css/style.css" />
  <link rel="icon" href="/favicon.ico" type="image/x-icon" />
</head>
<body class="legal-page">
  <a class="legal-back" href="/bg/">← emenu.click</a>
  <article class="legal-article">
    <h1>Статии</h1>
    <ul class="legal-ul">
      <li><a href="/articles/html-menu-seo/">Защо HTML менюто помага на търсачките</a></li>
      <li><a href="/articles/guest-friendly-qr-menus/">QR меню: по-малко триене за госта</a></li>
    </ul>
  </article>
</body>
</html>
""",
        encoding="utf-8",
    )
    print(f"generated {articles_index}")

    write_minimal_page(
        root,
        "articles/html-menu-seo/index.html",
        "Why HTML menus help SEO · emenu.click",
        "Защо HTML менюто помага на търсачките",
        """<p class="legal-p">Търсачките четат текст в страницата. PDF или само снимка на меню често носят малко или никакъв текстов сигнал за ястия и локация. Когато ястията са в HTML с ясни заглавия и описания, страницата може да се появи за по-конкретни заявки (напр. тип кухня + град), стига да има достатъчно уникално съдържание и връзки към страницата.</p>
    <p class="legal-p">emenu.click публикува менютата като уеб страници с текст, а не като един нечетим файл — това подкрепя и госта (търсене, превод), и основата за добро техническо SEO.</p>""",
        base,
    )

    write_minimal_page(
        root,
        "articles/guest-friendly-qr-menus/index.html",
        "QR menus: less friction for guests · emenu.click",
        "QR меню: по-малко триене за госта",
        """<p class="legal-p">Гостът сканира QR и очаква менюто да се отвори веднага на телефона — без инсталация, без акаунт. Кратък линк на масата дава същото поведение за туристи, които предпочитат да не сканират.</p>
    <p class="legal-p">Двуезичният превключвател на emenu.click намалява объркването в смесени зали. Собственикът печели време, защото ястията и описанията се обновяват от админ панел вместо препечатка.</p>""",
        base,
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
